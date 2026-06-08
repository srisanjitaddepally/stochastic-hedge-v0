from datetime import datetime

from sqlalchemy.orm import Session

from . import fees, math_engine, models, schemas


def create_event(db: Session, payload: schemas.EventCreate) -> models.Event:
    evt = models.Event(title=payload.title)
    db.add(evt)
    db.commit()
    db.refresh(evt)
    return evt


def list_events(db: Session) -> list[models.Event]:
    return db.query(models.Event).order_by(models.Event.created_at.desc()).all()


def get_event(db: Session, event_id: int) -> models.Event | None:
    return db.query(models.Event).filter(models.Event.id == event_id).first()


def delete_event(db: Session, event_id: int) -> bool:
    evt = get_event(db, event_id)
    if not evt:
        return False
    db.delete(evt)
    db.commit()
    return True


def delete_leg(db: Session, event_id: int, leg_id: int) -> bool:
    leg = (
        db.query(models.Leg)
        .filter(models.Leg.id == leg_id, models.Leg.event_id == event_id)
        .first()
    )
    if not leg:
        return False
    db.delete(leg)
    db.commit()
    return True


def _gross_win_from_create(payload: schemas.LegCreate) -> float:
    if payload.input_mode == models.InputMode.NET_PAYOUT:
        return (payload.net_payout_value or 0.0) - payload.stake
    dec = math_engine.odds_to_decimal(payload.odds_value or 100.0)
    return payload.stake * (dec - 1.0)


def add_leg(db: Session, event: models.Event, payload: schemas.LegCreate) -> models.Leg:
    d = payload.model_dump()
    gross = _gross_win_from_create(payload)
    rh_d, kal_d, edge_d = fees.compute_v2_stored_dollar_fees(
        payload.stake,
        payload.contract_bet_side or 0.0,
        gross,
        d["rh_fee_per_contract"],
        d["kalshi_fee_per_contract"],
        d["edge_haircut_pct"],
    )
    leg = models.Leg(
        event_id=event.id,
        side=d["side"],
        input_mode=d["input_mode"],
        stake=d["stake"],
        odds_value=d.get("odds_value"),
        net_payout_value=d.get("net_payout_value"),
        fee_model_version=2,
        rh_fee_per_contract=d["rh_fee_per_contract"],
        kalshi_fee_per_contract=d["kalshi_fee_per_contract"],
        edge_haircut_pct=d["edge_haircut_pct"],
        rh_fee=rh_d,
        kalshi_fee=kal_d,
        edge_haircut=edge_d,
        opponent_side=d.get("opponent_side"),
        contract_bet_side=d.get("contract_bet_side"),
        contract_opponent_side=d.get("contract_opponent_side"),
    )
    db.add(leg)
    db.commit()
    db.refresh(leg)
    return leg


def settle_event(db: Session, event: models.Event, winner_side: str) -> models.Event:
    event.status = models.EventStatus.SETTLED
    event.winner_side = winner_side
    event.settled_at = datetime.now()
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def event_metrics(event: models.Event) -> dict:
    if not event.legs:
        return {"total_stake": 0.0, "total_fees": 0.0, "realized_pnl": 0.0, "unrealized_pnl": 0.0}
    sides = tuple({l.side for l in event.legs})
    if len(sides) == 1:
        sides = (sides[0], "__OTHER__")
    elif len(sides) > 2:
        sides = (sides[0], sides[1])
    effective = []
    total_fees = 0.0
    for leg in event.legs:
        fee_sum = leg.rh_fee + leg.kalshi_fee + leg.edge_haircut
        total_fees += fee_sum
        p = fees.net_win_profit_for_leg(leg)
        effective.append(math_engine.LegEffective(side=leg.side, stake=leg.stake, net_win_profit=p))

    scen = math_engine.scenario_pnls(effective, (sides[0], sides[1]))
    realized = scen.get(event.winner_side, 0.0) if event.status == models.EventStatus.SETTLED else 0.0
    unrealized = 0.0 if event.status == models.EventStatus.SETTLED else scen["worst_case"]
    return {
        "total_stake": round(scen["total_stake"], 2),
        "total_fees": round(total_fees, 2),
        "scenario_pnls": {k: round(v, 2) for k, v in scen.items() if k != "total_stake"},
        "guaranteed_profit": scen["worst_case"] >= 0,
        "realized_pnl": round(realized, 2),
        "unrealized_pnl": round(unrealized, 2),
    }
