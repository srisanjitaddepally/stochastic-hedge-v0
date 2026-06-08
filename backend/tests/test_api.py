from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_event_lifecycle():
    evt = client.post("/events", json={"title": "Lakers vs Celtics"})
    assert evt.status_code == 200
    event_id = evt.json()["id"]

    leg1 = client.post(
        f"/events/{event_id}/legs",
        json={
            "side": "Lakers",
            "opponent_side": "Celtics",
            "contract_bet_side": 0.45,
            "contract_opponent_side": 0.55,
            "input_mode": "NET_PAYOUT",
            "stake": 100,
            "net_payout_value": 220,
            "rh_fee_per_contract": 0.01,
            "kalshi_fee_per_contract": 0.01,
            "edge_haircut_pct": 0.5,
        },
    )
    assert leg1.status_code == 200

    guide = client.post(
        f"/events/{event_id}/hedge-guidance",
        json={"hedge_side": "Celtics", "preset": "moderate", "current_decimal_odds": 2.1},
    )
    assert guide.status_code == 200
    assert "min_feasible_decimal_odds" in guide.json()

    settle = client.post(f"/events/{event_id}/settle", json={"winner_side": "Lakers"})
    assert settle.status_code == 200
    assert settle.json()["status"] == "SETTLED"


def test_delete_leg_and_event():
    evt = client.post("/events", json={"title": "Test delete"})
    assert evt.status_code == 200
    event_id = evt.json()["id"]

    leg = client.post(
        f"/events/{event_id}/legs",
        json={
            "side": "A",
            "opponent_side": "B",
            "contract_bet_side": 0.4,
            "contract_opponent_side": 0.6,
            "input_mode": "NET_PAYOUT",
            "stake": 50,
            "net_payout_value": 100,
            "rh_fee_per_contract": 0.01,
            "kalshi_fee_per_contract": 0.01,
            "edge_haircut_pct": 0,
        },
    )
    assert leg.status_code == 200
    leg_id = leg.json()["id"]

    rm_leg = client.delete(f"/events/{event_id}/legs/{leg_id}")
    assert rm_leg.status_code == 204

    rm_evt = client.delete(f"/events/{event_id}")
    assert rm_evt.status_code == 204

    assert client.get(f"/events/{event_id}").status_code == 404


def test_hedge_grid():
    evt = client.post("/events", json={"title": "Grid test"})
    event_id = evt.json()["id"]
    client.post(
        f"/events/{event_id}/legs",
        json={
            "side": "A",
            "opponent_side": "B",
            "contract_bet_side": 0.5,
            "contract_opponent_side": 0.5,
            "input_mode": "NET_PAYOUT",
            "stake": 100,
            "net_payout_value": 200,
            "rh_fee_per_contract": 0.01,
            "kalshi_fee_per_contract": 0.01,
            "edge_haircut_pct": 0,
        },
    )
    grid = client.post(
        f"/events/{event_id}/hedge-grid",
        json={
            "hedge_side": "B",
            "hedge_rh_fee_per_contract": 0.01,
            "hedge_kalshi_fee_per_contract": 0.01,
            "hedge_edge_pct": 0,
            "odd_min": 2.0,
            "odd_max": 2.1,
            "odd_step": 0.1,
            "stake_min": 50,
            "stake_max": 100,
            "stake_step": 50,
        },
    )
    assert grid.status_code == 200
    body = grid.json()
    assert body["leg1_side"] == "A"
    assert len(body["rows"]) >= 1
    assert len(body["rows"][0]) >= 1


def test_leg_with_market_snapshot():
    evt = client.post("/events", json={"title": "Market snapshot"})
    event_id = evt.json()["id"]
    leg = client.post(
        f"/events/{event_id}/legs",
        json={
            "side": "CHA",
            "opponent_side": "BOS",
            "contract_bet_side": 0.36,
            "contract_opponent_side": 0.65,
            "input_mode": "NET_PAYOUT",
            "stake": 100,
            "net_payout_value": 263,
            "rh_fee_per_contract": 0.01,
            "kalshi_fee_per_contract": 0.01,
            "edge_haircut_pct": 0,
        },
    )
    assert leg.status_code == 200
    body = leg.json()
    assert body["opponent_side"] == "BOS"
    assert body["contract_bet_side"] == 0.36
    assert body["contract_opponent_side"] == 0.65


def test_leg_requires_full_market_snapshot():
    evt = client.post("/events", json={"title": "No market"})
    event_id = evt.json()["id"]
    r = client.post(
        f"/events/{event_id}/legs",
        json={
            "side": "A",
            "input_mode": "NET_PAYOUT",
            "stake": 100,
            "net_payout_value": 200,
            "rh_fee_per_contract": 0.01,
            "kalshi_fee_per_contract": 0.01,
            "edge_haircut_pct": 0,
        },
    )
    assert r.status_code == 422


def test_leg_market_snapshot_incomplete_rejected():
    evt = client.post("/events", json={"title": "Bad snapshot"})
    event_id = evt.json()["id"]
    leg = client.post(
        f"/events/{event_id}/legs",
        json={
            "side": "CHA",
            "opponent_side": "BOS",
            "contract_bet_side": 0.36,
            "input_mode": "NET_PAYOUT",
            "stake": 100,
            "net_payout_value": 263,
            "rh_fee_per_contract": 0.01,
            "kalshi_fee_per_contract": 0.01,
            "edge_haircut_pct": 0,
        },
    )
    assert leg.status_code == 422
