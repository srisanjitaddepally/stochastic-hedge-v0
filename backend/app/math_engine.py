from dataclasses import dataclass
from typing import Iterable


PRESET_TARGETS = {"conservative": 0.005, "moderate": 0.015, "aggressive": 0.03}


@dataclass
class LegEffective:
    side: str
    stake: float
    net_win_profit: float


def odds_to_decimal(odds: float) -> float:
    if odds == 0:
        raise ValueError("Odds cannot be zero")
    if odds > 0:
        return (odds / 100.0) + 1.0
    return (100.0 / abs(odds)) + 1.0


def net_win_profit_from_odds(stake: float, odds_value: float, total_fees: float, edge_haircut: float) -> float:
    dec = odds_to_decimal(odds_value)
    gross_profit = stake * (dec - 1.0)
    return gross_profit - total_fees - edge_haircut


def net_win_profit_from_payout(stake: float, payout: float) -> float:
    return payout - stake


def scenario_pnls(legs: Iterable[LegEffective], sides: tuple[str, str]) -> dict[str, float]:
    side_a, side_b = sides
    total_stake = sum(l.stake for l in legs)

    def pnl_for(winner: str) -> float:
        win_profit = sum(l.net_win_profit for l in legs if l.side == winner)
        losers = sum(l.stake for l in legs if l.side != winner)
        return win_profit - losers

    return {
        side_a: pnl_for(side_a),
        side_b: pnl_for(side_b),
        "worst_case": min(pnl_for(side_a), pnl_for(side_b)),
        "total_stake": total_stake,
    }


def hedge_net_return_per_dollar_stake(
    hedge_decimal_odds: float, rh_fee_per_contract: float, kalshi_fee_per_contract: float, edge_pct: float
) -> float:
    """Net hedge win per $1 of hedge stake (cost at implied price 1/d), after venue + edge %; matches grid fee model."""
    p = edge_pct / 100.0
    k = rh_fee_per_contract + kalshi_fee_per_contract
    d = hedge_decimal_odds
    return (d - 1.0) * (1.0 - p) - k * d


def required_hedge_stake(
    leg1_stake: float,
    leg1_profit: float,
    target_profit: float,
    hedge_decimal_odds: float,
    hedge_rh_fee_per_contract: float = 0.0,
    hedge_kalshi_fee_per_contract: float = 0.0,
    hedge_edge_pct: float = 0.0,
) -> float:
    """Min hedge stake s so both outcomes meet target; uses net hedge return per $ (same fees as scenario grid)."""
    upper = leg1_profit - target_profit
    m = hedge_net_return_per_dollar_stake(
        hedge_decimal_odds, hedge_rh_fee_per_contract, hedge_kalshi_fee_per_contract, hedge_edge_pct
    )
    if m <= 1e-12:
        return -1.0
    lower = (leg1_stake + target_profit) / m
    if lower > upper:
        return -1.0
    return lower


def minimum_feasible_decimal_odds(
    leg1_stake: float,
    leg1_profit: float,
    target_profit: float,
    hedge_rh_fee_per_contract: float = 0.0,
    hedge_kalshi_fee_per_contract: float = 0.0,
    hedge_edge_pct: float = 0.0,
) -> float:
    """Smallest decimal odds d at which required hedge stake is feasible (net of per-contract + edge % fees)."""
    denom = max(leg1_profit - target_profit, 1e-9)
    r = (leg1_stake + target_profit) / denom
    p = hedge_edge_pct / 100.0
    k = hedge_rh_fee_per_contract + hedge_kalshi_fee_per_contract
    coef = 1.0 - p - k
    if coef > 1e-12:
        d_lin = (r + 1.0 - p) / coef
        if d_lin > 1.0 and hedge_net_return_per_dollar_stake(d_lin, hedge_rh_fee_per_contract, hedge_kalshi_fee_per_contract, hedge_edge_pct) >= r - 1e-9:
            return max(d_lin, 1.0001)

    lo, hi = 1.0001, 500.0
    if hedge_net_return_per_dollar_stake(lo, hedge_rh_fee_per_contract, hedge_kalshi_fee_per_contract, hedge_edge_pct) >= r:
        return lo
    if hedge_net_return_per_dollar_stake(hi, hedge_rh_fee_per_contract, hedge_kalshi_fee_per_contract, hedge_edge_pct) < r:
        return hi
    for _ in range(80):
        mid = (lo + hi) / 2.0
        if hedge_net_return_per_dollar_stake(mid, hedge_rh_fee_per_contract, hedge_kalshi_fee_per_contract, hedge_edge_pct) >= r:
            hi = mid
        else:
            lo = mid
    return round(hi, 6)


def build_range_points(
    leg1_side: str,
    leg1_stake: float,
    leg1_profit: float,
    target_profit: float,
    min_d2: float,
    hedge_side: str,
    hedge_rh_fee_per_contract: float = 0.0,
    hedge_kalshi_fee_per_contract: float = 0.0,
    hedge_edge_pct: float = 0.0,
) -> list[dict]:
    points = []
    for d2 in [min_d2, min_d2 + 0.05, min_d2 + 0.1, min_d2 + 0.2]:
        stake2 = required_hedge_stake(
            leg1_stake,
            leg1_profit,
            target_profit,
            d2,
            hedge_rh_fee_per_contract,
            hedge_kalshi_fee_per_contract,
            hedge_edge_pct,
        )
        if stake2 > 0:
            fee_sum = hedge_fee_sum_for_cell(
                stake2, d2, hedge_rh_fee_per_contract, hedge_kalshi_fee_per_contract, hedge_edge_pct
            )
            cell = hedge_scenario_cell(
                leg1_side, leg1_stake, leg1_profit, hedge_side, stake2, d2, fee_sum
            )
            worst = cell["worst_case_pnl"]
            points.append(
                {"decimal_odds": round(d2, 4), "required_stake": round(stake2, 2), "worst_case_pnl": round(worst, 2)}
            )
    return points


def _float_range(a: float, b: float, step: float) -> list[float]:
    if step <= 0:
        raise ValueError("step must be positive")
    out = []
    x = a
    while x <= b + 1e-9:
        out.append(round(x, 4))
        x += step
    return out


def hedge_fee_sum_for_cell(
    hedge_stake: float, hedge_decimal_odds: float, rh_pc: float, kalshi_pc: float, edge_pct: float
) -> float:
    """Hedge venue fees: (RH+Kalshi) $/contract × contracts + edge % of hedge gross win; contracts = stake / P, P = 1/dec."""
    hedge_gross = hedge_stake * (hedge_decimal_odds - 1.0)
    p_hedge = 1.0 / hedge_decimal_odds
    contracts = hedge_stake / p_hedge
    venue = (rh_pc + kalshi_pc) * contracts
    edge = hedge_gross * (edge_pct / 100.0)
    return venue + edge


def hedge_scenario_cell(
    leg1_side: str,
    leg1_stake: float,
    leg1_net_win_profit: float,
    hedge_side: str,
    hedge_stake: float,
    hedge_decimal_odds: float,
    hedge_fee_sum: float,
) -> dict[str, float]:
    """PnL for two-outcome book: first leg vs hypothetical hedge at decimal odds."""
    h_profit = hedge_stake * (hedge_decimal_odds - 1.0) - hedge_fee_sum
    legs = [
        LegEffective(leg1_side, leg1_stake, leg1_net_win_profit),
        LegEffective(hedge_side, hedge_stake, h_profit),
    ]
    scen = scenario_pnls(legs, (leg1_side, hedge_side))
    return {
        "worst_case_pnl": scen["worst_case"],
        "pnl_if_leg1_wins": scen[leg1_side],
        "pnl_if_hedge_wins": scen[hedge_side],
        "total_stake": scen["total_stake"],
    }


def build_hedge_grid(
    leg1_side: str,
    leg1_stake: float,
    leg1_net_win_profit: float,
    hedge_side: str,
    odd_min: float,
    odd_max: float,
    odd_step: float,
    stake_min: float,
    stake_max: float,
    stake_step: float,
    hedge_rh_fee_per_contract: float,
    hedge_kalshi_fee_per_contract: float,
    hedge_edge_pct: float,
    max_cells: int = 2000,
) -> tuple[list[float], list[float], list[list[dict]]]:
    odds_vals = _float_range(odd_min, odd_max, odd_step)
    stake_vals = _float_range(stake_min, stake_max, stake_step)
    if len(odds_vals) * len(stake_vals) > max_cells:
        raise ValueError(f"Grid too large (max {max_cells} cells)")

    rows: list[list[dict]] = []
    for d in odds_vals:
        row: list[dict] = []
        for s in stake_vals:
            fee_sum = hedge_fee_sum_for_cell(s, d, hedge_rh_fee_per_contract, hedge_kalshi_fee_per_contract, hedge_edge_pct)
            cell = hedge_scenario_cell(
                leg1_side,
                leg1_stake,
                leg1_net_win_profit,
                hedge_side,
                s,
                d,
                fee_sum,
            )
            row.append(
                {
                    "decimal_odds": d,
                    "hedge_stake": s,
                    "worst_case_pnl": round(cell["worst_case_pnl"], 2),
                    "pnl_if_leg1_wins": round(cell["pnl_if_leg1_wins"], 2),
                    "pnl_if_hedge_wins": round(cell["pnl_if_hedge_wins"], 2),
                    "total_stake": round(cell["total_stake"], 2),
                }
            )
        rows.append(row)
    return odds_vals, stake_vals, rows
