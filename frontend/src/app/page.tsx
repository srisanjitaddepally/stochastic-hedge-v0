"use client";

import { useCallback, useEffect, useState } from "react";

import { EventCard } from "@/components/EventCard";
import { EventForm } from "@/components/EventForm";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { api } from "@/lib/api";
import { EventDto, SummaryDto } from "@/lib/types";

export default function HomePage() {
  const [events, setEvents] = useState<EventDto[]>([]);
  const [summary, setSummary] = useState<SummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [evts, sum] = await Promise.all([api.events(), api.summary()]);
      setEvents(evts);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createEvent(title: string) {
    await api.createEvent(title);
    await refresh();
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-4">
      <h1 className="mb-2 text-2xl font-semibold">Stochastic Hedge Terminal</h1>
      <p className="mb-4 text-sm text-slate-400">
        Manual paper trading with fee-aware hedge thresholds, best-odds guidance, and active-to-settled lifecycle.
      </p>

      <PortfolioSummary summary={summary} />
      <EventForm onCreate={createEvent} />
      {error && <p className="mb-3 rounded border border-rose-700 bg-rose-950 p-3 text-sm text-rose-200">{error}</p>}

      <section className="grid gap-3">
        {events.length === 0 ? (
          <p className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
            No events yet. Create one and add your first leg.
          </p>
        ) : (
          events.map((event) => <EventCard key={event.id} event={event} onRefresh={refresh} />)
        )}
      </section>
    </main>
  );
}
