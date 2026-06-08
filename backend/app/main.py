from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, fees, math_engine, models, schemas
from .database import Base, engine, ensure_sqlite_schema, get_db

Base.metadata.create_all(bind=engine)
ensure_sqlite_schema()

app = FastAPI(title="Stochastic Hedge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/events", response_model=schemas.EventResponse)
def create_event(payload: schemas.EventCreate, db: Session = Depends(get_db)):
    evt = crud.create_event(db, payload)
    out = schemas.EventResponse.model_validate(evt)
    out.metrics = crud.event_metrics(evt)
    return out


@app.get("/events", response_model=list[schemas.EventResponse])
def list_events(db: Session = Depends(get_db)):
    events = crud.list_events(db)
    out = []
    for evt in events:
        resp = schemas.EventResponse.model_validate(evt)
        resp.metrics = crud.event_metrics(evt)
        out.append(resp)
    return out


@app.get("/events/{event_id}", response_model=schemas.EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    evt = crud.get_event(db, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    resp = schemas.EventResponse.model_validate(evt)
    resp.metrics = crud.event_metrics(evt)
    return resp


@app.delete("/events/{event_id}", status_code=204)
def remove_event(event_id: int, db: Session = Depends(get_db)):
    if not crud.delete_event(db, event_id):
        raise HTTPException(status_code=404, detail="Event not found")


@app.post("/events/{event_id}/legs", response_model=schemas.LegResponse)
def add_leg(event_id: int, payload: schemas.LegCreate, db: Session = Depends(get_db)):
    evt = crud.get_event(db, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    if evt.status != models.EventStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Cannot add legs to settled event")
    leg = crud.add_leg(db, evt, payload)
    return schemas.LegResponse.model_validate(leg)


@app.delete("/events/{event_id}/legs/{leg_id}", status_code=204)
def remove_leg(event_id: int, leg_id: int, db: Session = Depends(get_db)):
    evt = crud.get_event(db, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    if evt.status != models.EventStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Cannot delete legs on settled event")
    if not crud.delete_leg(db, event_id, leg_id):
        raise HTTPException(status_code=404, detail="Leg not found")


@app.post("/events/{event_id}/hedge-guidance", response_model=schemas.HedgeGuidanceResponse)
def hedge_guidance(event_id: int, payload: schemas.HedgeGuidanceRequest, db: Session = Depends(get_db)):
    evt = crud.get_event(db, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    if not evt.legs:
        raise HTTPException(status_code=400, detail="Need leg 1 before guidance")
    leg1 = sorted(evt.legs, key=lambda x: x.id)[0]
    leg1_profit = fees.net_win_profit_for_leg(leg1)
    h_side = payload.hedge_side.strip()

    target_pct = math_engine.PRESET_TARGETS[payload.preset]
    target_profit = leg1.stake * target_pct
    rh_pc = payload.hedge_rh_fee_per_contract
    kal_pc = payload.hedge_kalshi_fee_per_contract
    edge_pct = payload.hedge_edge_pct
    min_d2 = math_engine.minimum_feasible_decimal_odds(
        leg1.stake, leg1_profit, target_profit, rh_pc, kal_pc, edge_pct
    )
    best_d2 = min_d2 + 0.15
    best_s2 = math_engine.required_hedge_stake(
        leg1.stake, leg1_profit, target_profit, best_d2, rh_pc, kal_pc, edge_pct
    )
    points = math_engine.build_range_points(
        leg1.side,
        leg1.stake,
        leg1_profit,
        target_profit,
        min_d2,
        h_side,
        rh_pc,
        kal_pc,
        edge_pct,
    )

    signal = "wait"
    if payload.current_decimal_odds and payload.current_decimal_odds >= min_d2:
        signal = "hedge_now"

    return schemas.HedgeGuidanceResponse(
        preset=payload.preset,
        min_feasible_decimal_odds=round(min_d2, 4),
        best_decimal_odds=round(best_d2, 4),
        best_required_stake=round(max(best_s2, 0.0), 2),
        feasible_points=points,
        action_signal=signal,
    )


@app.post("/events/{event_id}/hedge-grid", response_model=schemas.HedgeGridResponse)
def hedge_grid(event_id: int, payload: schemas.HedgeGridRequest, db: Session = Depends(get_db)):
    evt = crud.get_event(db, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    if not evt.legs:
        raise HTTPException(status_code=400, detail="Need at least one leg before building a grid")
    leg1 = sorted(evt.legs, key=lambda x: x.id)[0]
    h_side = payload.hedge_side.strip()
    if leg1.side.strip().lower() == h_side.lower():
        raise HTTPException(status_code=400, detail="hedge_side must differ from the first leg's side")

    leg1_profit = fees.net_win_profit_for_leg(leg1)

    try:
        odds_vals, stake_vals, rows = math_engine.build_hedge_grid(
            leg1.side,
            leg1.stake,
            leg1_profit,
            h_side,
            payload.odd_min,
            payload.odd_max,
            payload.odd_step,
            payload.stake_min,
            payload.stake_max,
            payload.stake_step,
            payload.hedge_rh_fee_per_contract,
            payload.hedge_kalshi_fee_per_contract,
            payload.hedge_edge_pct,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return schemas.HedgeGridResponse(
        leg1_side=leg1.side,
        hedge_side=h_side,
        decimal_odds_values=odds_vals,
        stake_values=stake_vals,
        rows=rows,
    )


@app.post("/events/{event_id}/settle", response_model=schemas.EventResponse)
def settle(event_id: int, payload: schemas.SettleRequest, db: Session = Depends(get_db)):
    evt = crud.get_event(db, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    evt = crud.settle_event(db, evt, payload.winner_side)
    resp = schemas.EventResponse.model_validate(evt)
    resp.metrics = crud.event_metrics(evt)
    return resp


@app.get("/portfolio/summary")
def portfolio_summary(db: Session = Depends(get_db)):
    events = crud.list_events(db)
    total_stake = 0.0
    total_fees = 0.0
    realized = 0.0
    unrealized = 0.0
    active_events = 0
    for evt in events:
        m = crud.event_metrics(evt)
        total_stake += m["total_stake"]
        total_fees += m["total_fees"]
        realized += m["realized_pnl"]
        unrealized += m["unrealized_pnl"]
        if evt.status == models.EventStatus.ACTIVE:
            active_events += 1
    return {
        "active_events": active_events,
        "total_stake": round(total_stake, 2),
        "total_fees": round(total_fees, 2),
        "realized_pnl": round(realized, 2),
        "unrealized_pnl": round(unrealized, 2),
        "net": round(realized + unrealized, 2),
    }
