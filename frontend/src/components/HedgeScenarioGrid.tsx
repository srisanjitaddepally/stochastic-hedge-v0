"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import {
  GRID_DEFAULTS_INITIAL,
  loadGridDefaults,
  saveGridDefaults
} from "@/lib/gridDefaultsStorage";
import type { HedgeGridCell, HedgeGridResponse } from "@/lib/types";

type Props = {
  eventId: number;
  hasLegs: boolean;
  hedgeSide: string;
  hedgeRhFeePerContract: number;
  hedgeKalshiFeePerContract: number;
  hedgeEdgePct: number;
};

function decimalToAmerican(d: number): string {
  if (d <= 1.001) return "—";
  const implied = d - 1;
  if (implied >= 1) return `+${Math.round(implied * 100)}`;
  return `${Math.round(-100 / implied)}`;
}

/** Kalshi-style $1 payoff price ≈ 1 / decimal_odds; clamped [0.01, 0.99]. Display as $0.38 only. */
function decimalToContractDollars(d: number): string | null {
  if (d <= 1.001) return null;
  const raw = 1 / d;
  const c = Math.min(0.99, Math.max(0.01, raw));
  return `$${c.toFixed(2)}`;
}

function cellBgClass(worst: number): string {
  if (worst >= 0) return "bg-emerald-900/35";
  if (worst >= -10) return "bg-amber-900/25";
  return "bg-rose-900/30";
}

export function HedgeScenarioGrid({
  eventId,
  hasLegs,
  hedgeSide,
  hedgeRhFeePerContract,
  hedgeKalshiFeePerContract,
  hedgeEdgePct
}: Props) {
  const [open, setOpen] = useState(false);
  const [showAmerican, setShowAmerican] = useState(GRID_DEFAULTS_INITIAL.showAmerican);
  const [oddMin, setOddMin] = useState(GRID_DEFAULTS_INITIAL.oddMin);
  const [oddMax, setOddMax] = useState(GRID_DEFAULTS_INITIAL.oddMax);
  const [oddStep, setOddStep] = useState(GRID_DEFAULTS_INITIAL.oddStep);
  const [stakeMin, setStakeMin] = useState(GRID_DEFAULTS_INITIAL.stakeMin);
  const [stakeMax, setStakeMax] = useState(GRID_DEFAULTS_INITIAL.stakeMax);
  const [stakeStep, setStakeStep] = useState(GRID_DEFAULTS_INITIAL.stakeStep);
  const [grid, setGrid] = useState<HedgeGridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterNonNegative, setFilterNonNegative] = useState(GRID_DEFAULTS_INITIAL.filterNonNegative);
  const [gridPrefsHydrated, setGridPrefsHydrated] = useState(false);
  const [detail, setDetail] = useState<HedgeGridCell | null>(null);
  const [pinned, setPinned] = useState<{ decimal_odds: number; hedge_stake: number } | null>(null);

  const canLoad = hasLegs && hedgeSide.trim().length > 0;

  const loadGrid = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.hedgeGrid(eventId, {
        hedge_side: hedgeSide.trim(),
        hedge_rh_fee_per_contract: hedgeRhFeePerContract,
        hedge_kalshi_fee_per_contract: hedgeKalshiFeePerContract,
        hedge_edge_pct: hedgeEdgePct,
        odd_min: oddMin,
        odd_max: oddMax,
        odd_step: oddStep,
        stake_min: stakeMin,
        stake_max: stakeMax,
        stake_step: stakeStep
      });
      setGrid(data);
    } catch (e) {
      setGrid(null);
      setError(e instanceof Error ? e.message : "Failed to load grid");
    } finally {
      setLoading(false);
    }
  }, [
    canLoad,
    eventId,
    hedgeSide,
    hedgeRhFeePerContract,
    hedgeKalshiFeePerContract,
    hedgeEdgePct,
    oddMin,
    oddMax,
    oddStep,
    stakeMin,
    stakeMax,
    stakeStep
  ]);

  const isPinned = useCallback(
    (c: HedgeGridCell) =>
      pinned !== null &&
      Math.abs(pinned.decimal_odds - c.decimal_odds) < 1e-6 &&
      Math.abs(pinned.hedge_stake - c.hedge_stake) < 1e-6,
    [pinned]
  );

  const togglePin = useCallback(
    (c: HedgeGridCell) => {
      setPinned((p) =>
        p && isPinned(c) ? null : { decimal_odds: c.decimal_odds, hedge_stake: c.hedge_stake }
      );
    },
    [isPinned]
  );

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  useEffect(() => {
    setGridPrefsHydrated(false);
    const d = loadGridDefaults(eventId);
    setOddMin(d.oddMin);
    setOddMax(d.oddMax);
    setOddStep(d.oddStep);
    setStakeMin(d.stakeMin);
    setStakeMax(d.stakeMax);
    setStakeStep(d.stakeStep);
    setShowAmerican(d.showAmerican);
    setFilterNonNegative(d.filterNonNegative);
    setGridPrefsHydrated(true);
  }, [eventId]);

  useEffect(() => {
    if (!gridPrefsHydrated) return;
    saveGridDefaults(eventId, {
      oddMin,
      oddMax,
      oddStep,
      stakeMin,
      stakeMax,
      stakeStep,
      showAmerican,
      filterNonNegative
    });
  }, [
    gridPrefsHydrated,
    eventId,
    oddMin,
    oddMax,
    oddStep,
    stakeMin,
    stakeMax,
    stakeStep,
    showAmerican,
    filterNonNegative
  ]);

  const hedgeLabel = hedgeSide.trim() || "";

  const summaryHint = useMemo(() => {
    if (!grid) return null;
    return `${grid.decimal_odds_values.length}×${grid.stake_values.length} scenarios · worst-case PnL in each cell`;
  }, [grid]);

  return (
    <div className="mb-3 rounded-md border border-slate-800 bg-slate-950">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-900/80"
      >
        <span className="font-medium text-slate-300">Scenario grid</span>
        <span className="font-mono text-xs text-slate-500">{open ? "▼" : "▶"}</span>
      </button>
      {!open && (
        <p className="border-t border-slate-800 px-3 pb-3 pt-0 text-[11px] text-slate-500">
          Rows: <span className="text-slate-400">contract $ · decimal · optional American</span>. Columns: hedge stake. Hover for PnLs; click for
          detail.
        </p>
      )}

      {open && (
        <div className="space-y-3 border-t border-slate-800 p-3">
          {!hasLegs && <p className="text-sm text-amber-200/90">Add at least one leg to build the grid.</p>}
          {hasLegs && !hedgeSide.trim() && (
            <p className="text-sm text-amber-200/90">Enter a hedge side in Hedge guidance above so the grid knows the opposite outcome.</p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Odds min (dec.)
              <input type="number" step="0.01" min={1.01} value={oddMin} onChange={(e) => setOddMin(Number(e.target.value))} className="text-slate-100" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Odds max (dec.)
              <input type="number" step="0.01" min={1.01} value={oddMax} onChange={(e) => setOddMax(Number(e.target.value))} className="text-slate-100" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Odds step
              <input type="number" step="0.01" min={0.01} value={oddStep} onChange={(e) => setOddStep(Number(e.target.value))} className="text-slate-100" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Stake min ($)
              <input type="number" min={0} value={stakeMin} onChange={(e) => setStakeMin(Number(e.target.value))} className="text-slate-100" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Stake max ($)
              <input type="number" min={0} value={stakeMax} onChange={(e) => setStakeMax(Number(e.target.value))} className="text-slate-100" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Stake step ($)
              <input type="number" min={1} value={stakeStep} onChange={(e) => setStakeStep(Number(e.target.value))} className="text-slate-100" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={filterNonNegative}
                onChange={(e) => setFilterNonNegative(e.target.checked)}
                className="rounded border-slate-600"
              />
              Only show cells where worst-case PnL ≥ $0
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={showAmerican}
                onChange={(e) => setShowAmerican(e.target.checked)}
                className="rounded border-slate-600"
              />
              Show American odds in row labels
            </label>
            <button
              type="button"
              disabled={!canLoad || loading}
              onClick={loadGrid}
              className="rounded bg-sky-800 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-700 disabled:opacity-40"
            >
              {loading ? "Loading…" : "Load / refresh grid"}
            </button>
            {summaryHint && <span className="text-xs text-slate-500">{summaryHint}</span>}
            <span className="text-[10px] text-slate-500">Grid ranges &amp; toggles are saved per event in this browser.</span>
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          {grid && (
            <div className="max-h-[min(70vh,520px)] overflow-auto rounded border border-slate-800">
              <table className="w-max min-w-full border-collapse text-xs">
                <thead className="[&_th]:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  <tr>
                    <th
                      className="sticky top-0 left-0 z-[22] min-w-[8.5rem] border border-slate-800 bg-slate-900 px-2 py-1 text-left align-bottom text-slate-400"
                      title="Each row is a hypothetical price for the hedge side (second team). Contract ≈ 1 ÷ decimal."
                    >
                      <div className="font-semibold text-amber-200/95">
                        Hedge{hedgeLabel ? `: ${hedgeLabel}` : ""}
                      </div>
                      <div className="mt-0.5 font-medium text-slate-300">Contract / dec.</div>
                      <div className="text-[10px] font-normal text-slate-500">→ hedge stake columns</div>
                    </th>
                    {grid.stake_values.map((s) => (
                      <th
                        key={s}
                        className="sticky top-0 z-[16] border border-slate-800 bg-slate-900 px-1.5 py-1 text-right align-bottom font-mono text-slate-300"
                      >
                        ${s.toFixed(0)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row, ri) => {
                    const d = grid.decimal_odds_values[ri];
                    const contract = decimalToContractDollars(d);
                    return (
                      <tr key={d}>
                        <td
                          className="sticky left-0 z-[11] min-w-[8.5rem] border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-slate-200"
                          title={
                            contract
                              ? `${contract} · ${d.toFixed(4)} dec${showAmerican ? ` · ${decimalToAmerican(d)}` : ""}`
                              : undefined
                          }
                        >
                          {contract && <div className="text-slate-100">{contract}</div>}
                          <div className="text-[11px] text-slate-300">{d.toFixed(2)}</div>
                          {showAmerican && <div className="text-[10px] text-slate-500">{decimalToAmerican(d)}</div>}
                        </td>
                        {row.map((cell) => {
                          const hideValue = filterNonNegative && cell.worst_case_pnl < 0;
                          const pinnedCell = isPinned(cell);
                          const cStr = decimalToContractDollars(cell.decimal_odds);
                          const title = `${cStr ?? "—"} · ${cell.decimal_odds.toFixed(4)} dec · Worst: $${cell.worst_case_pnl.toFixed(2)} · ${grid.leg1_side}: $${cell.pnl_if_leg1_wins.toFixed(2)} · ${grid.hedge_side}: $${cell.pnl_if_hedge_wins.toFixed(2)} · Stake: $${cell.total_stake.toFixed(2)}`;
                          return (
                            <td
                              key={`${cell.decimal_odds}-${cell.hedge_stake}`}
                              className={`border border-slate-800 px-0.5 py-0.5 text-right font-mono ${cellBgClass(cell.worst_case_pnl)} ${
                                hideValue ? "opacity-40" : ""
                              } ${pinnedCell ? "ring-2 ring-amber-400/80 ring-inset" : ""}`}
                              title={title}
                            >
                              <button
                                type="button"
                                className="block w-full px-1 py-1 text-right hover:brightness-110"
                                onClick={() => setDetail(cell)}
                              >
                                {hideValue ? "—" : `$${cell.worst_case_pnl.toFixed(0)}`}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {grid && (
            <p className="text-[11px] leading-snug text-slate-500">
              Rows are <span className="text-slate-400">hypothetical lines for the hedge side</span>
              {hedgeLabel ? ` (${hedgeLabel})` : ""}. <span className="text-slate-400">Contract</span> is 1 ÷ decimal (clamped $0.01–$0.99).
              Header row stays visible while you scroll. Cells: worst-case PnL. Hedge uses the same $/contract and edge % as above.
            </p>
          )}
        </div>
      )}

      {detail && grid && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="mb-3 text-sm font-semibold text-slate-100">Scenario detail</h4>
            <dl className="space-y-2 text-sm">
              {decimalToContractDollars(detail.decimal_odds) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500" title="≈ 1 ÷ decimal, Kalshi-style">
                    Contract ($0.01–$0.99)
                  </dt>
                  <dd className="font-mono text-slate-200">{decimalToContractDollars(detail.decimal_odds)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Decimal (European)</dt>
                <dd className="font-mono text-slate-200">{detail.decimal_odds.toFixed(4)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">American (approx.)</dt>
                <dd className="font-mono text-slate-200">{decimalToAmerican(detail.decimal_odds)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Hedge stake</dt>
                <dd className="font-mono text-slate-200">${detail.hedge_stake.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Total stake (both legs)</dt>
                <dd className="font-mono text-slate-200">${detail.total_stake.toFixed(2)}</dd>
              </div>
              <div className="border-t border-slate-800 pt-2" />
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">PnL if {grid.leg1_side} wins</dt>
                <dd className={`font-mono ${detail.pnl_if_leg1_wins >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  ${detail.pnl_if_leg1_wins.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">PnL if {grid.hedge_side} wins</dt>
                <dd className={`font-mono ${detail.pnl_if_hedge_wins >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  ${detail.pnl_if_hedge_wins.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Worst-case PnL</dt>
                <dd className={`font-mono ${detail.worst_case_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  ${detail.worst_case_pnl.toFixed(2)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => togglePin(detail)} className="rounded bg-amber-900/50 px-3 py-1.5 text-sm text-amber-100">
                {isPinned(detail) ? "Unpin" : "Pin this scenario"}
              </button>
              <button type="button" onClick={() => setDetail(null)} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
