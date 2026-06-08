"use client";

import { SummaryDto } from "@/lib/types";

export function PortfolioSummary({ summary }: { summary: SummaryDto | null }) {
  const s =
    summary ??
    ({ active_events: 0, total_stake: 0, total_fees: 0, realized_pnl: 0, unrealized_pnl: 0, net: 0 } as SummaryDto);
  const pnlClass = (v: number) => (v >= 0 ? "text-emerald-400" : "text-rose-400");

  return (
    <section className="sticky top-0 z-20 mb-4 grid grid-cols-2 gap-3 border-b border-slate-800 bg-slate-950/95 py-4 backdrop-blur md:grid-cols-6">
      <Metric label="Active Events" value={s.active_events.toString()} />
      <Metric label="Total Staked" value={`$${s.total_stake.toFixed(2)}`} />
      <Metric label="Total Fees" value={`$${s.total_fees.toFixed(2)}`} />
      <Metric label="Realized" value={`$${s.realized_pnl.toFixed(2)}`} className={pnlClass(s.realized_pnl)} />
      <Metric label="Unrealized" value={`$${s.unrealized_pnl.toFixed(2)}`} className={pnlClass(s.unrealized_pnl)} />
      <Metric label="Net" value={`$${s.net.toFixed(2)}`} className={pnlClass(s.net)} />
    </section>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`font-mono text-lg ${className}`}>{value}</p>
    </div>
  );
}
