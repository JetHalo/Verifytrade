"use client";

import { useState } from "react";
import { createRound } from "@/lib/api-client";
import { AlertCircle, CheckCircle2, Sparkles, Calendar } from "lucide-react";

/**
 * "Open a Round" — anyone can call. No wallet required.
 * Creator is just a free-form alias; only that same alias may later finalize it.
 */
export default function OpenRoundPage() {
  const [creator,     setCreator]     = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd,   setPeriodEnd]   = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [created, setCreated] = useState<{ id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setPeriodOneHour = () => {
    const now = Date.now();
    setPeriodStart(String(now));
    setPeriodEnd(String(now + 60 * 60 * 1000));
  };

  const setPeriodSevenDays = () => {
    const now = Date.now();
    setPeriodStart(String(now));
    setPeriodEnd(String(now + 7 * 24 * 60 * 60 * 1000));
  };

  // Backward-looking windows -- handy for proving trades you've already made.
  const setPeriodPastHour = () => {
    const now = Date.now();
    setPeriodStart(String(now - 60 * 60 * 1000));
    setPeriodEnd(String(now));
  };

  const setPeriodPastDay = () => {
    const now = Date.now();
    setPeriodStart(String(now - 24 * 60 * 60 * 1000));
    setPeriodEnd(String(now));
  };

  const setPeriodPastWeek = () => {
    const now = Date.now();
    setPeriodStart(String(now - 7 * 24 * 60 * 60 * 1000));
    setPeriodEnd(String(now));
  };

  const handleCreate = async () => {
    setError(null);
    setCreated(null);
    if (!periodStart || !periodEnd || !creator) {
      setError("creator name + both timestamps are required");
      return;
    }
    setSubmitting(true);
    try {
      const row = await createRound({
        creator: creator.trim(),
        periodStart,
        periodEnd,
      });
      setCreated({ id: row.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="space-y-2">
        <span className="pill-violet"><Sparkles className="w-3 h-3" />demo mode — anyone can open a round</span>
        <h1 className="text-3xl font-bold text-white">Open a Round</h1>
        <p className="text-sm text-slate-400">
          No wallet needed. Pick a window and an identifier; the round shows up on the leaderboard immediately.
        </p>
      </header>

      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-violet-300" />
          <h2 className="text-base font-semibold text-white">Create New Round</h2>
        </div>

        <Input label="Your Identity / Alias" value={creator} onChange={setCreator} placeholder="jet" />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Period Start (Unix ms)" value={periodStart} onChange={setPeriodStart} placeholder="1717200000000" />
          <Input label="Period End (Unix ms)"   value={periodEnd}   onChange={setPeriodEnd}   placeholder="1717804800000" />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="stat-label w-12">past</span>
            <button onClick={setPeriodPastHour} className="btn-ghost text-xs">↶ past 1 hour</button>
            <button onClick={setPeriodPastDay}  className="btn-ghost text-xs">↶ past 1 day</button>
            <button onClick={setPeriodPastWeek} className="btn-ghost text-xs">↶ past 1 week</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="stat-label w-12">future</span>
            <button onClick={setPeriodOneHour}   className="btn-ghost text-xs">↳ next 1 hour</button>
            <button onClick={setPeriodSevenDays} className="btn-ghost text-xs">↳ next 7 days</button>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={submitting || !periodStart || !periodEnd || !creator}
          className="btn-primary w-full"
        >
          {submitting ? "Creating…" : "Create Round"}
        </button>
      </section>

      {created && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" />
          <div>
            <div className="font-medium text-emerald-200">Round #{created.id} created</div>
            <a href={`/leaderboard/${created.id}`} className="text-xs text-emerald-300 underline">
              open its leaderboard →
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm">
          <AlertCircle className="w-4 h-4 text-rose-300 mt-0.5" />
          <span className="text-rose-200">{error}</span>
        </div>
      )}
    </div>
  );
}

function Input({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <label className="block">
      <span className="stat-label">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </label>
  );
}
