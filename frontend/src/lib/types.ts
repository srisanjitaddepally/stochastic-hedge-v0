export type EventStatus = "ACTIVE" | "SETTLED";
export type InputMode = "NET_PAYOUT" | "ODDS";

export type Leg = {
  id: number;
  event_id: number;
  side: string;
  input_mode: InputMode;
  stake: number;
  odds_value: number | null;
  net_payout_value: number | null;
  fee_model_version?: number;
  rh_fee_per_contract?: number | null;
  kalshi_fee_per_contract?: number | null;
  edge_haircut_pct?: number | null;
  rh_fee: number;
  kalshi_fee: number;
  edge_haircut: number;
  placed_at: string;
  opponent_side: string | null;
  contract_bet_side: number | null;
  contract_opponent_side: number | null;
};

export type EventDto = {
  id: number;
  title: string;
  status: EventStatus;
  created_at: string;
  settled_at: string | null;
  winner_side: string | null;
  legs: Leg[];
  metrics: {
    total_stake: number;
    total_fees: number;
    realized_pnl: number;
    unrealized_pnl: number;
    guaranteed_profit?: boolean;
    scenario_pnls?: Record<string, number>;
  };
};

export type SummaryDto = {
  active_events: number;
  total_stake: number;
  total_fees: number;
  realized_pnl: number;
  unrealized_pnl: number;
  net: number;
};

export type HedgeGridCell = {
  decimal_odds: number;
  hedge_stake: number;
  worst_case_pnl: number;
  pnl_if_leg1_wins: number;
  pnl_if_hedge_wins: number;
  total_stake: number;
};

export type HedgeGridResponse = {
  leg1_side: string;
  hedge_side: string;
  decimal_odds_values: number[];
  stake_values: number[];
  rows: HedgeGridCell[][];
};
