"use client";

import { FormEvent, useState } from "react";

export function EventForm({ onCreate }: { onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreate(title.trim());
    setTitle("");
  }

  return (
    <form onSubmit={submit} className="mb-4 flex gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3">
      <input
        className="flex-1"
        placeholder="Event title (e.g. Knicks vs Heat)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button className="bg-emerald-700 hover:bg-emerald-600">Create Event</button>
    </form>
  );
}
