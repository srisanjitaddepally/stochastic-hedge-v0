from app import math_engine


def test_odds_to_decimal():
    assert round(math_engine.odds_to_decimal(150), 2) == 2.5
    assert round(math_engine.odds_to_decimal(-200), 2) == 1.5


def test_required_hedge_stake_feasible():
    stake = math_engine.required_hedge_stake(100, 120, 1.0, 2.2)
    assert stake > 0


def test_minimum_feasible_odds():
    min_d2 = math_engine.minimum_feasible_decimal_odds(100, 120, 1.0)
    assert min_d2 > 1.0


def test_hedge_scenario_cell_symmetric():
    cell = math_engine.hedge_scenario_cell("A", 100.0, 50.0, "B", 80.0, 2.0, 2.0)
    assert "worst_case_pnl" in cell
    assert cell["total_stake"] == 180.0


def test_minimum_feasible_odds_higher_with_hedge_fees():
    """Per-contract hedge fees raise the minimum decimal line vs fee-free algebra."""
    d0 = math_engine.minimum_feasible_decimal_odds(100, 120, 1.0, 0.0, 0.0, 0.0)
    d1 = math_engine.minimum_feasible_decimal_odds(100, 120, 1.0, 0.01, 0.01, 0.0)
    assert d1 > d0


def test_required_hedge_stake_higher_with_fees_at_same_odds():
    s0 = math_engine.required_hedge_stake(100, 120, 1.0, 2.2, 0.0, 0.0, 0.0)
    s1 = math_engine.required_hedge_stake(100, 120, 1.0, 2.2, 0.01, 0.01, 0.0)
    assert s0 > 0 and s1 > 0
    assert s1 > s0


def test_build_range_points_matches_scenario_cell():
    pts = math_engine.build_range_points("A", 100.0, 120.0, 1.0, 2.0, "B", 0.01, 0.01, 0.0)
    assert len(pts) >= 1
    p0 = pts[0]
    d2, s2 = p0["decimal_odds"], p0["required_stake"]
    fee = math_engine.hedge_fee_sum_for_cell(s2, d2, 0.01, 0.01, 0.0)
    cell = math_engine.hedge_scenario_cell("A", 100.0, 120.0, "B", s2, d2, fee)
    assert abs(cell["worst_case_pnl"] - p0["worst_case_pnl"]) < 0.02
