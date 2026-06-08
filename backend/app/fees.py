"""Venue fees: per contract (Robinhood + Kalshi) and edge % of gross win."""

from . import math_engine, models


def leg_gross_win_profit(leg: models.Leg) -> float:
    if leg.input_mode == models.InputMode.NET_PAYOUT:
        return math_engine.net_win_profit_from_payout(leg.stake, leg.net_payout_value or 0.0)
    dec = math_engine.odds_to_decimal(leg.odds_value or 100.0)
    return leg.stake * (dec - 1.0)


def net_win_profit_for_leg(leg: models.Leg) -> float:
    """Net profit if this leg wins, after fees (v1 legacy dollars or v2 per-contract + edge %)."""
    gross = leg_gross_win_profit(leg)
    version = getattr(leg, "fee_model_version", None)
    if version == 1:
        return gross - leg.rh_fee - leg.kalshi_fee - leg.edge_haircut
    # v2 (default for new legs)
    p = leg.contract_bet_side
    if p is None or p <= 0:
        raise ValueError("contract_bet_side required for fee model v2")
    contracts = leg.stake / p
    rh_pc = leg.rh_fee_per_contract if leg.rh_fee_per_contract is not None else 0.01
    kal_pc = leg.kalshi_fee_per_contract if leg.kalshi_fee_per_contract is not None else 0.01
    edge_pct = leg.edge_haircut_pct if leg.edge_haircut_pct is not None else 0.0
    venue = (rh_pc + kal_pc) * contracts
    edge = gross * (edge_pct / 100.0)
    return gross - venue - edge


def compute_v2_stored_dollar_fees(
    stake: float,
    contract_bet_side: float,
    gross_win_profit: float,
    rh_fee_per_contract: float,
    kalshi_fee_per_contract: float,
    edge_haircut_pct: float,
) -> tuple[float, float, float]:
    """Returns (rh_dollars, kalshi_dollars, edge_dollars) for DB columns."""
    contracts = stake / contract_bet_side
    rh_d = rh_fee_per_contract * contracts
    kal_d = kalshi_fee_per_contract * contracts
    edge_d = gross_win_profit * (edge_haircut_pct / 100.0)
    return rh_d, kal_d, edge_d
