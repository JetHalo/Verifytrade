"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listRounds, getLeaderboard, deleteRound, type RoundDTO } from "@/lib/api-client";
import { formatTimestamp, formatDuration, formatAddress } from "@/lib/utils";
import {
  Clock, BarChart3, Hash, Trophy, ArrowRight, Filter, Users, Trash2, Loader2, Zap,
} from "lucide-react";

type StatusFilter = "all" | "live" | "finalized" | "closed";

interface RoundWithStats extends RoundDTO {
  submissionCount: number;
}

export default function RoundsPage() {
  const [rounds, setRounds] = useState<RoundWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await listRounds();
        // Fetch submission counts in parallel for each round
        const enriched = await Promise.all(
          all.map(async (r) => {
            try {
              const rows = await getLeaderboard(r.id);
              return { ...r, submissionCount: rows.length };
            } catch {
              return { ...r, submissionCount: 0 };
            }
          }),
        );
        if (!cancelled) setRounds(enriched);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function handleDelete(roundId: number) {
    setError(null);
    setDeleting(roundId);
    try {
      await deleteRound(roundId);
      // optimistic: drop locally; the next poll will reconcile if anything's off
      setRounds((rs) => rs.filter((r) => r.id !== roundId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
      setPendingDelete(null);
    }
  }

  const sorted = [...rounds].sort((a, b) => b.id - a.id);
  const visible = sorted.filter((r) => {
    if (filter === "all") return true;
    if (filter === "live") return r.active && !r.finalized;
    if (filter === "finalized") return r.finalized;
    if (filter === "closed") return !r.active && !r.finalized;
    return true;
  });

  const stats = {
    total: rounds.length,
    live: rounds.filter((r) => r.active && !r.finalized).length,
    finalized: rounds.filter((r) => r.finalized).length,
    submissions: rounds.reduce((acc, r) => acc + r.submissionCount, 0),
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-300" />
            <span className="pill-amber">Round History</span>
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-white">
            All <span className="text-gradient">verified rounds</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Every round ever created, live or finalized. Click into one to see its leaderboard.
          </p>
        </div>
        <Link href="/admin" className="btn-secondary">
          Open a new round
        </Link>
      </header>

      {/* Stats strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={<Hash       className="w-4 h-4" />} label="Total rounds"  value={String(stats.total)}      tone="default" />
        <StatTile icon={<Clock      className="w-4 h-4" />} label="Live"          value={String(stats.live)}        tone="green"   />
        <StatTile icon={<BarChart3  className="w-4 h-4" />} label="Finalized"     value={String(stats.finalized)}   tone="rose"    />
        <StatTile icon={<Users      className="w-4 h-4" />} label="Total submits" value={String(stats.submissions)} tone="cyan"    />
      </section>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-500" />
        <FilterChip active={filter === "all"}       onClick={() => setFilter("all")}>      All ({rounds.length})</FilterChip>
        <FilterChip active={filter === "live"}      onClick={() => setFilter("live")}>     Live ({stats.live})</FilterChip>
        <FilterChip active={filter === "finalized"} onClick={() => setFilter("finalized")}>Finalized ({stats.finalized})</FilterChip>
        <FilterChip active={filter === "closed"}    onClick={() => setFilter("closed")}>   Closed ({rounds.length - stats.live - stats.finalized})</FilterChip>
      </div>

      {/* Full table */}
      <section className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03] border-b border-white/10">
                <Th>#</Th>
                <Th>Creator</Th>
                <Th>Period start</Th>
                <Th>Period end</Th>
                <Th>Duration</Th>
                <Th align="right">Submissions</Th>
                <Th>Status</Th>
                <Th align="right">Open</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No rounds match this filter. <Link href="/admin" className="text-violet-300 hover:underline">Open one →</Link>
                </td></tr>
              ) : (
                visible.map((r) => {
                  const startMs = BigInt(r.periodStart);
                  const endMs   = BigInt(r.periodEnd);
                  const isConfirming = pendingDelete === r.id;
                  const isDeleting   = deleting === r.id;
                  return (
                    <tr key={r.id} className={`border-b border-white/5 transition hover:bg-white/[0.04] ${isConfirming ? "bg-rose-500/[0.06]" : ""}`}>
                      <td className="px-4 py-3 font-mono text-slate-300">{r.id}</td>
                      <td className="px-4 py-3 font-mono text-slate-200 truncate max-w-[18ch]">
                        {r.creator.startsWith("0x") ? formatAddress(r.creator) : r.creator}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400 text-xs">{formatTimestamp(startMs)}</td>
                      <td className="px-4 py-3 font-mono text-slate-400 text-xs">{formatTimestamp(endMs)}</td>
                      <td className="px-4 py-3 font-mono text-slate-300 text-xs">{formatDuration(startMs, endMs)}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span className={r.submissionCount > 0 ? "text-emerald-300" : "text-slate-500"}>
                          {r.submissionCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={r.finalized ? "pill-rose" : r.active ? "pill-green" : "pill-violet"}>
                          {r.finalized ? "FINAL" : r.active ? "LIVE" : "CLOSED"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3 text-xs">
                          {r.active && !r.finalized && (
                            <Link
                              href={`/submit?round=${r.id}`}
                              className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                              title={`submit a proof to round #${r.id}`}
                            >
                              <Zap className="w-3 h-3" /> submit
                            </Link>
                          )}
                          <Link href={`/leaderboard/${r.id}`} className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200">
                            leaderboard <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isConfirming ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={isDeleting}
                              className="px-2 py-1 rounded-md bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/30 disabled:opacity-50"
                            >
                              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : `delete ${r.submissionCount > 0 ? "+ " + r.submissionCount + " submissions" : ""}`}
                            </button>
                            <button
                              onClick={() => setPendingDelete(null)}
                              disabled={isDeleting}
                              className="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06]"
                            >
                              cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setPendingDelete(r.id)}
                            title={`delete round #${r.id}`}
                            className="p-1.5 rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm">
          <span className="text-rose-200 break-all">{error}</span>
        </div>
      )}

      <p className="text-xs text-slate-500 text-center">
        Refreshing every 5 seconds. New rounds appear automatically.
      </p>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} font-semibold text-slate-300 text-[11px] uppercase tracking-wider`}>
      {children}
    </th>
  );
}

function StatTile({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "default" | "green" | "rose" | "cyan";
}) {
  const color =
    tone === "green" ? "text-emerald-300"  :
    tone === "rose"  ? "text-rose-300"     :
    tone === "cyan"  ? "text-cyan-200"     : "text-white";
  return (
    <div className="stat-tile">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}<span className="stat-label">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 transition ${
        active
          ? "bg-violet-500/15 text-violet-200 ring-violet-400/30"
          : "bg-white/[0.03] text-slate-400 ring-white/10 hover:bg-white/[0.06] hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
