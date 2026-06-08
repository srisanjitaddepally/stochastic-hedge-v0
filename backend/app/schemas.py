from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .models import EventStatus, InputMode


class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)


class LegCreate(BaseModel):
    side: str = Field(min_length=1, max_length=64)
    input_mode: InputMode
    stake: float = Field(gt=0)
    odds_value: float | None = None
    net_payout_value: float | None = None
    rh_fee_per_contract: float = Field(ge=0, default=0.01, description="Robinhood $ per contract (stacked with Kalshi)")
    kalshi_fee_per_contract: float = Field(ge=0, default=0.01, description="Kalshi $ per contract")
    edge_haircut_pct: float = Field(ge=0, le=100, default=0.0, description="Extra haircut as % of gross win")
    opponent_side: str | None = Field(default=None, max_length=64)
    contract_bet_side: float | None = None
    contract_opponent_side: float | None = None

    @model_validator(mode="after")
    def validate_mode_fields(self):
        if self.input_mode == InputMode.ODDS and self.odds_value is None:
            raise ValueError("odds_value required when input_mode=ODDS")
        if self.input_mode == InputMode.NET_PAYOUT and self.net_payout_value is None:
            raise ValueError("net_payout_value required when input_mode=NET_PAYOUT")
        return self

    @model_validator(mode="after")
    def validate_market_snapshot_required(self):
        """Venue fees use contracts = stake ÷ P (your contract price); full snapshot required."""
        opp = (self.opponent_side or "").strip()
        if not opp:
            raise ValueError("Opponent / other outcome is required for venue fee sizing.")
        if self.contract_bet_side is None or self.contract_opponent_side is None:
            raise ValueError("Enter both contract prices (market snapshot) for venue fee sizing.")
        for name, c in (
            ("contract_bet_side", self.contract_bet_side),
            ("contract_opponent_side", self.contract_opponent_side),
        ):
            if c < 0.01 or c > 0.99:
                raise ValueError(f"{name} must be between 0.01 and 0.99")
        if self.side.strip().lower() == opp.lower():
            raise ValueError("side and opponent_side must differ")
        self.opponent_side = opp
        return self


class LegResponse(BaseModel):
    id: int
    event_id: int
    side: str
    input_mode: InputMode
    stake: float
    odds_value: float | None
    net_payout_value: float | None
    fee_model_version: int = 2
    rh_fee_per_contract: float | None = None
    kalshi_fee_per_contract: float | None = None
    edge_haircut_pct: float | None = None
    rh_fee: float
    kalshi_fee: float
    edge_haircut: float
    placed_at: datetime
    opponent_side: str | None = None
    contract_bet_side: float | None = None
    contract_opponent_side: float | None = None

    model_config = {"from_attributes": True}


class HedgeGuidanceRequest(BaseModel):
    hedge_side: str
    current_decimal_odds: float | None = Field(default=None, gt=1.0)
    preset: Literal["conservative", "moderate", "aggressive"] = "moderate"
    hedge_rh_fee_per_contract: float = Field(ge=0, default=0.01)
    hedge_kalshi_fee_per_contract: float = Field(ge=0, default=0.01)
    hedge_edge_pct: float = Field(ge=0, le=100, default=0.0)


class HedgeGuidanceResponse(BaseModel):
    preset: str
    min_feasible_decimal_odds: float
    best_decimal_odds: float
    best_required_stake: float
    feasible_points: list[dict]
    action_signal: str


class HedgeGridRequest(BaseModel):
    hedge_side: str = Field(min_length=1, max_length=64)
    hedge_rh_fee_per_contract: float = Field(ge=0, default=0.01)
    hedge_kalshi_fee_per_contract: float = Field(ge=0, default=0.01)
    hedge_edge_pct: float = Field(ge=0, le=100, default=0.0)
    odd_min: float = Field(gt=1.0)
    odd_max: float = Field(gt=1.0)
    odd_step: float = Field(gt=0)
    stake_min: float = Field(gt=0)
    stake_max: float = Field(gt=0)
    stake_step: float = Field(gt=0)

    @model_validator(mode="after")
    def check_ranges(self):
        if self.odd_max < self.odd_min:
            raise ValueError("odd_max must be >= odd_min")
        if self.stake_max < self.stake_min:
            raise ValueError("stake_max must be >= stake_min")
        return self


class HedgeGridResponse(BaseModel):
    leg1_side: str
    hedge_side: str
    decimal_odds_values: list[float]
    stake_values: list[float]
    rows: list[list[dict]]


class SettleRequest(BaseModel):
    winner_side: str


class EventResponse(BaseModel):
    id: int
    title: str
    status: EventStatus
    created_at: datetime
    settled_at: datetime | None
    winner_side: str | None
    legs: list[LegResponse] = []
    metrics: dict = {}

    model_config = {"from_attributes": True}
