"use client";

import { useMemo, useState, type ReactNode } from "react";

import { HedgeScenarioGrid } from "@/components/HedgeScenarioGrid";
import { api } from "@/lib/api";
import { EventDto, InputMode, Leg } from "@/lib/types";

type Props = {
  event: EventDto;
  onRefresh: () => Promise<void>;
};

export function EventCard({ event, onRefresh }: Props) {
  const [side, setSide] = useState("");
  const [opponent, setOpponent] = useState("");
  const [contractBet, setContractBet] = useState<number | null>(null);
  const [contractOpp, setContractOpp] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("NET_PAYOUT");
  const [stake, setStake] = useState(100);
  const [odds, setOdds] = useState(150);
  const [payout, setPayout] = useState(220);
  const [rhFeePerContract, setRhFeePerContract] = useState(0.01);
  const [kalshiFeePerContract, setKalshiFeePerContract] = useState(0.01);
  const [edgePct, setEdgePct] = useState(0);
  const [hedgeSide, setHedgeSide] = useState("");
  const [currentOdds, setCurrentOdds] = useState(2.0);
  const [preset, setPreset] = useState("moderate");
  const [guidance, setGuidance] = useState<Record<string, unknown> | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const detailsId = `event-card-details-${event.id}`;
  const statusClass = event.status === "ACTIVE" ? "text-amber-300" : "text-emerald-400";
  const pnlClass = (v: number) => (v >= 0 ? "text-emerald-400" : "text-rose-400");
  const uniqueSides = useMemo(() => [...new Set(event.legs.map((l) => l.side))], [event.legs]);
  const sortedLegs = useMemo(
    () => [...event.legs].sort((a, b) => a.id - b.id),
    [event.legs]
  );

  const marketPreview = useMemo(() => {
    const opp = opponent.trim();
    if (!opp || contractBet === null || contractOpp === null) return null;
    if (contractBet < 0.01 || contractBet > 0.99 || contractOpp < 0.01 || contractOpp > 0.99) return null;
    if (side.trim().toLowerCase() === opp.toLowerCase()) return { error: "Bet side and opponent must differ." };
    const over = contractBet + contractOpp - 1;
    return { overroundPct: over * 100 };
  }, [opponent, contractBet, contractOpp, side]);

  async function addLeg() {
    const opp = opponent.trim();
    const hasMarket =
      opp.length > 0 &&
      contractBet !== null &&
      contractOpp !== null &&
      contractBet >= 0.01 &&
      contractBet <= 0.99 &&
      contractOpp >= 0.01 &&
      contractOpp <= 0.99 &&
      side.trim().toLowerCase() !== opp.toLowerCase();

    if (!hasMarket) {
      alert("Fill opponent and both contract prices (market snapshot). Venue fees use stake ÷ your contract price.");
      return;
    }

    await api.addLeg(event.id, {
      side,
      input_mode: inputMode,
      stake,
      odds_value: inputMode === "ODDS" ? odds : null,
      net_payout_value: inputMode === "NET_PAYOUT" ? payout : null,
      rh_fee_per_contract: rhFeePerContract,
      kalshi_fee_per_contract: kalshiFeePerContract,
      edge_haircut_pct: edgePct,
      opponent_side: opp,
      contract_bet_side: contractBet,
      contract_opponent_side: contractOpp
    });
    setSide("");
    setOpponent("");
    setContractBet(null);
    setContractOpp(null);
    await onRefresh();
  }

  async function removeLeg(legId: number) {
    if (!confirm("Remove this leg?")) return;
    await api.deleteLeg(event.id, legId);
    await onRefresh();
  }

  async function removeEvent() {
    if (!confirm(`Delete event "${event.title}"? This cannot be undone.`)) return;
    await api.deleteEvent(event.id);
    await onRefresh();
  }

  async function computeGuidance() {
    const data = await api.guidance(event.id, {
      hedge_side: hedgeSide || "HEDGE_SIDE",
      current_decimal_odds: currentOdds,
      preset,
      hedge_rh_fee_per_contract: rhFeePerContract,
      hedge_kalshi_fee_per_contract: kalshiFeePerContract,
      hedge_edge_pct: edgePct
    });
    setGuidance(data as Record<string, unknown>);
  }

  async function settle(winner: string) {
    await api.settle(event.id, winner);
    await onRefresh();
  }

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={detailsId}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand event" : "Collapse event"}
          className="mt-0.5 shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-300 hover:bg-slate-700"
        >
          <span className="sr-only">{collapsed ? "Expand" : "Collapse"}</span>
          <span
            aria-hidden
            className={`block text-[10px] leading-none transition-transform ${collapsed ? "-rotate-90" : ""}`}
          >
            ▼
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold">{event.title}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-mono text-xs ${statusClass}`}>{event.status}</span>
              <button
                type="button"
                onClick={removeEvent}
                className="rounded border border-rose-900 bg-rose-950 px-2 py-1 text-xs text-rose-200 hover:bg-rose-900"
              >
                Delete event
              </button>
            </div>
          </div>
          {collapsed && (
            <p className="mt-2 font-mono text-xs text-slate-400">
              Staked ${event.metrics.total_stake.toFixed(2)} · Unrealized{" "}
              <span className={pnlClass(event.metrics.unrealized_pnl)}>
                ${event.metrics.unrealized_pnl.toFixed(2)}
              </span>{" "}
              · Realized{" "}
              <span className={pnlClass(event.metrics.realized_pnl)}>
                ${event.metrics.realized_pnl.toFixed(2)}
              </span>
              {sortedLegs.length > 0 && (
                <span className="text-slate-500"> · {sortedLegs.length} leg{sortedLegs.length === 1 ? "" : "s"}</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div id={detailsId} className={collapsed ? "hidden" : undefined} aria-hidden={collapsed || undefined}>
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Metric label="Staked" value={`$${event.metrics.total_stake.toFixed(2)}`} />
        <Metric label="Fees" value={`$${event.metrics.total_fees.toFixed(2)}`} />
        <Metric label="Unrealized" value={`$${event.metrics.unrealized_pnl.toFixed(2)}`} className={pnlClass(event.metrics.unrealized_pnl)} />
        <Metric label="Realized" value={`$${event.metrics.realized_pnl.toFixed(2)}`} className={pnlClass(event.metrics.realized_pnl)} />
      </div>

      {sortedLegs.length > 0 && (
        <div className="mb-4 rounded-md border border-slate-800 bg-slate-950 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Placed legs</p>
          <ul className="space-y-2">
            {sortedLegs.map((leg) => (
              <li
                key={leg.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="font-mono text-slate-200">{legSummary(leg)}</span>
                  {legCrossCheckLine(leg)}
                </div>
                {event.status === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() => removeLeg(leg.id)}
                    className="shrink-0 rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Remove leg
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {event.status === "ACTIVE" && (
        <>
          <div className="mb-4 rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Add a leg</p>
            <p className="mb-3 text-[11px] leading-snug text-slate-500">
              <span className="text-slate-400">Ticket truth:</span> PnL uses stake, net payout (or odds), and venue fees from $/contract × (stake ÷ your contract price), plus optional edge % of gross win.
              Fill opponent + both contract columns below (required to add a leg). Vig stays in the market (we do not de-vig).
            </p>

            <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-400">Market snapshot (this leg only)</p>
              <p className="mb-2 text-[11px] text-slate-500">
                Enter both sides&apos; Kalshi-style contract prices ($0.01–$0.99) at the moment you log this leg. Leave blank to skip.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <LabeledField label="Opponent / other outcome" hint="e.g. BOS if you bet CHA">
                  <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g. BOS" />
                </LabeledField>
                <LabeledField label={`Contract — ${side.trim() || "your side"} ($)`} hint="Price for the side you bet">
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    max={0.99}
                    value={contractBet ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setContractBet(v === "" ? null : Number(v));
                    }}
                    placeholder="0.36"
                  />
                </LabeledField>
                <LabeledField label={`Contract — ${opponent.trim() || "opponent"} ($)`} hint={"Other side's price on the board"}>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    max={0.99}
                    value={contractOpp ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setContractOpp(v === "" ? null : Number(v));
                    }}
                    placeholder="0.65"
                  />
                </LabeledField>
                <div className="flex flex-col justify-end text-xs text-slate-400">
                  {marketPreview?.error && <p className="text-rose-300">{marketPreview.error}</p>}
                  {marketPreview && typeof marketPreview.overroundPct === "number" && (
                    <p className="font-mono text-slate-200">
                      Book overround: <span className="text-amber-200/90">+{marketPreview.overroundPct.toFixed(2)}%</span>{" "}
                      <span className="text-slate-500">(contracts sum to {(100 + marketPreview.overroundPct).toFixed(2)}%)</span>
                    </p>
                  )}
                  {!marketPreview && <p className="text-slate-500">Fill both contracts + opponent to see vig.</p>}
                </div>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LabeledField label="Side you bet" hint="Must match contract column above">
                <input value={side} onChange={(e) => setSide(e.target.value)} placeholder="e.g. CHA" />
              </LabeledField>
              <LabeledField label="Input mode">
                <select value={inputMode} onChange={(e) => setInputMode(e.target.value as InputMode)}>
                  <option value="NET_PAYOUT">Net payout (total return if win)</option>
                  <option value="ODDS">American moneyline odds</option>
                </select>
              </LabeledField>
              <LabeledField label="Stake ($)">
                <input type="number" value={stake} onChange={(e) => setStake(Number(e.target.value))} min={0} step="0.01" />
              </LabeledField>
              {inputMode === "ODDS" ? (
                <LabeledField label="Moneyline odds" hint="American format (+150, -200)">
                  <input type="number" value={odds} onChange={(e) => setOdds(Number(e.target.value))} />
                </LabeledField>
              ) : (
                <LabeledField label="Net payout ($)" hint="Total cash if this side wins (incl. stake) — drives PnL">
                  <input type="number" value={payout} onChange={(e) => setPayout(Number(e.target.value))} min={0} step="0.01" />
                </LabeledField>
              )}
            </div>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LabeledField label="Robinhood ($/contract)" hint="Stacked with Kalshi when routing through both">
                <input
                  type="number"
                  value={rhFeePerContract}
                  onChange={(e) => setRhFeePerContract(Number(e.target.value))}
                  min={0}
                  step="0.001"
                />
              </LabeledField>
              <LabeledField label="Kalshi ($/contract)">
                <input
                  type="number"
                  value={kalshiFeePerContract}
                  onChange={(e) => setKalshiFeePerContract(Number(e.target.value))}
                  min={0}
                  step="0.001"
                />
              </LabeledField>
              <LabeledField label="Edge / haircut (%)" hint="% of gross win on this leg (extra cushion)">
                <input type="number" value={edgePct} onChange={(e) => setEdgePct(Number(e.target.value))} min={0} max={100} step="0.1" />
              </LabeledField>
              <div className="flex items-end">
                <button type="button" onClick={addLeg} className="w-full bg-indigo-700 py-2 hover:bg-indigo-600">
                  Add leg
                </button>
              </div>
            </div>
          </div>

          <div className="mb-3 rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Hedge guidance</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LabeledField label="Hedge side" hint="Opposite outcome you might bet">
                <input value={hedgeSide} onChange={(e) => setHedgeSide(e.target.value)} placeholder="e.g. BOS" />
              </LabeledField>
              <LabeledField label="Current decimal odds" hint="Live line for the hedge (decimal)">
                <input type="number" step="0.01" value={currentOdds} onChange={(e) => setCurrentOdds(Number(e.target.value))} min={1.01} />
              </LabeledField>
              <LabeledField label="Profit target preset">
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </LabeledField>
              <div className="flex items-end">
                <button type="button" onClick={computeGuidance} className="w-full bg-emerald-700 py-2 hover:bg-emerald-600">
                  Compute
                </button>
              </div>
            </div>
            {guidance && (
              <div className="mt-3 text-sm">
                <p className="font-mono text-slate-200">
                  Min feasible odds: {(guidance.min_feasible_decimal_odds as number).toFixed(4)} | Best odds:{" "}
                  {(guidance.best_decimal_odds as number).toFixed(4)} | Stake: $
                  {(guidance.best_required_stake as number).toFixed(2)}
                </p>
                <p className={(guidance.action_signal as string) === "hedge_now" ? "text-emerald-400" : "text-amber-300"}>
                  {(guidance.action_signal as string) === "hedge_now"
                    ? "Hedge now: guaranteed-profit threshold is feasible."
                    : "Wait: current odds have not crossed the guaranteed-profit threshold."}
                </p>
              </div>
            )}
          </div>

          <HedgeScenarioGrid
            eventId={event.id}
            hasLegs={sortedLegs.length > 0}
            hedgeSide={hedgeSide}
            hedgeRhFeePerContract={rhFeePerContract}
            hedgeKalshiFeePerContract={kalshiFeePerContract}
            hedgeEdgePct={edgePct}
          />
        </>
      )}

      <div className="mt-4 rounded-md border border-slate-800 bg-slate-950 p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Settlement</p>
        {event.status === "SETTLED" ? (
          <p className="text-sm text-slate-200">
            Winner recorded: <span className="font-mono font-semibold text-emerald-300">{event.winner_side ?? "—"}</span>
            {event.metrics?.realized_pnl !== undefined && (
              <>
                {" · "}
                Realized PnL:{" "}
                <span className={event.metrics.realized_pnl >= 0 ? "font-mono text-emerald-400" : "font-mono text-rose-400"}>
                  ${event.metrics.realized_pnl.toFixed(2)}
                </span>
              </>
            )}
          </p>
        ) : sortedLegs.length === 0 ? (
          <p className="text-sm text-slate-500">Add at least one leg, then choose who won to lock realized PnL for this event.</p>
        ) : (
          <>
            <p className="mb-3 text-[11px] leading-snug text-slate-500">
              When the game or market resolves, pick the winning side below. This finalizes realized PnL and cannot be undone from the UI.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {uniqueSides.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={event.status !== "ACTIVE"}
                  onClick={() => {
                    if (
                      !confirm(
                        `Record "${s}" as the winner for "${event.title}"?\n\nThis settles the event and locks realized PnL.`
                      )
                    )
                      return;
                    void settle(s);
                  }}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-left transition hover:border-sky-700 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block text-xs text-slate-500">Winner</span>
                  <span className="font-mono text-base font-semibold text-slate-100">{s}</span>
                  <span className="mt-1 block text-[11px] text-slate-500">Tap to settle on this side</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      </div>
    </article>
  );
}

function legOverround(leg: Leg): number | null {
  if (leg.contract_bet_side == null || leg.contract_opponent_side == null) return null;
  return (leg.contract_bet_side + leg.contract_opponent_side - 1) * 100;
}

function fillImpliedContract(leg: Leg): number | null {
  if (leg.input_mode !== "NET_PAYOUT" || !leg.net_payout_value || leg.stake <= 0) return null;
  const raw = leg.stake / leg.net_payout_value;
  return Math.min(0.99, Math.max(0.01, raw));
}

function legCrossCheckLine(leg: Leg): ReactNode {
  if (leg.contract_bet_side == null) return null;
  const fill = fillImpliedContract(leg);
  if (fill === null) return null;
  const diff = Math.abs(fill - leg.contract_bet_side);
  if (diff < 0.005) {
    return <p className="text-[11px] text-slate-500">Fill-implied ${fill.toFixed(2)} ≈ board ${leg.contract_bet_side.toFixed(2)} for {leg.side}</p>;
  }
  return (
    <p className="text-[11px] text-amber-200/90">
      Fill-implied ${fill.toFixed(2)} vs board ${leg.contract_bet_side.toFixed(2)} for {leg.side} — PnL still uses ticket payout.
    </p>
  );
}

function legSummary(leg: Leg): string {
  const fees = leg.rh_fee + leg.kalshi_fee + leg.edge_haircut;
  const vig = legOverround(leg);
  let base: string;
  if (leg.input_mode === "NET_PAYOUT") {
    base = `#${leg.id} ${leg.side} vs ${leg.opponent_side ?? "—"} | stake $${leg.stake.toFixed(2)} | net payout $${(leg.net_payout_value ?? 0).toFixed(2)} | fees $${fees.toFixed(2)}`;
  } else {
    base = `#${leg.id} ${leg.side} vs ${leg.opponent_side ?? "—"} | stake $${leg.stake.toFixed(2)} | odds ${leg.odds_value ?? "—"} | fees $${fees.toFixed(2)}`;
  }
  if ((leg.edge_haircut_pct ?? 0) > 0) {
    base += ` (edge ${leg.edge_haircut_pct}% of gross)`;
  }
  if (leg.contract_bet_side != null && leg.contract_opponent_side != null && leg.opponent_side) {
    base += ` | $${leg.contract_bet_side.toFixed(2)} / $${leg.contract_opponent_side.toFixed(2)}`;
    if (vig != null) base += ` | vig +${vig.toFixed(2)}%`;
  }
  return base;
}

function LabeledField({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-300">{label}</label>
      {hint && <span className="text-[11px] leading-tight text-slate-500">{hint}</span>}
      {children}
    </div>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`font-mono ${className}`}>{value}</p>
    </div>
  );
}
