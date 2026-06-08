import { EventDto, HedgeGridResponse, SummaryDto } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store"
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${API}${path}`, { method: "DELETE", cache: "no-store" });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }
}

export const api = {
  events: () => j<EventDto[]>("/events"),
  summary: () => j<SummaryDto>("/portfolio/summary"),
  createEvent: (title: string) => j<EventDto>("/events", { method: "POST", body: JSON.stringify({ title }) }),
  addLeg: (eventId: number, body: Record<string, unknown>) =>
    j(`/events/${eventId}/legs`, { method: "POST", body: JSON.stringify(body) }),
  deleteEvent: (eventId: number) => del(`/events/${eventId}`),
  deleteLeg: (eventId: number, legId: number) => del(`/events/${eventId}/legs/${legId}`),
  settle: (eventId: number, winner_side: string) =>
    j<EventDto>(`/events/${eventId}/settle`, { method: "POST", body: JSON.stringify({ winner_side }) }),
  guidance: (eventId: number, body: Record<string, unknown>) =>
    j(`/events/${eventId}/hedge-guidance`, { method: "POST", body: JSON.stringify(body) }),
  hedgeGrid: (eventId: number, body: Record<string, unknown>) =>
    j<HedgeGridResponse>(`/events/${eventId}/hedge-grid`, { method: "POST", body: JSON.stringify(body) })
};
