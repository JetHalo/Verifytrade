"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listRounds, type RoundDTO } from "@/lib/api-client";
import { formatTimestamp, formatDuration } from "@/lib/utils";
import {
  ArrowRight, Shield, BarChart3, Hash, TrendingUp,
  Sparkles, Lock, Cpu, Database, ShieldCheck, List,
} from "lucide-react";

export default function HomePage() {
  const [rounds, setRounds] = useState<RoundDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await listRounds();
        if (!cancelled) setRounds(all);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // refresh every 5s so newly created rounds appear without manual reload
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Pick the latest active round (highest id, prefer active). Fall back to
  // newest finalized if all are closed.
  const sortedDesc = [...rounds].sort((a, b) => b.id - a.id);
  const latestActive = sortedDesc.find((r) => r.active) ?? sortedDesc[0] ?? null;

  return (
    <div className="space-y-20">
      <Hero />
      <ThreeMetrics />
      <CurrentRound round={latestActive} loading={loading} />
      {rounds.length > 1 && <AllRounds rounds={sortedDesc} latestId={latestActive?.id ?? -1} />}
      <HowItWorks />
      <Stack />
    </div>
  );
}

/* ---------- Hero ---------- */
function Hero() {
  return (
    <section className="relative text-center pt-8 pb-4">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-hero-glow" />
      <span className="pill-violet">
        <Sparkles className="w-3 h-3" />
        TLSNotary <span className="opacity-50">×</span> Noir UltraHonk <span className="opacity-50">×</span> zkVerify
      </span>

      <h1 className="mt-6 text-5xl md:text-6xl font-bold tracking-tight text-white">
        Verifiable
        <br className="md:hidden" /> <span className="text-gradient">trading leaderboard.</span>
      </h1>

      <p className="mt-6 mx-auto max-w-2xl text-lg text-slate-400">
        Cryptographically prove your Binance Futures activity without exposing your account
        or any individual trade. Three numbers go on the board — <span className="text-white font-medium">trades · volume · PnL</span> —
        every row verified by zkVerify before it lands.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/submit" className="btn-primary">
          Submit My Proof <ArrowRight className="w-4 h-4" />
        </Link>
        <Link href="/leaderboard/0" className="btn-secondary">
          View Leaderboard
        </Link>
        <Link href="/admin" className="btn-ghost">
          Open a Round
        </Link>
      </div>
    </section>
  );
}

/* ---------- Three Metrics ---------- */
function ThreeMetrics() {
  const tiles = [
    {
      icon: <Hash className="w-4 h-4" />,
      label: "Trade Count",
      title: "How active you were",
      body: "Number of fills inside the round window. Sybil-proof — each Binance UID can only submit once per round.",
      tone: "violet" as const,
    },
    {
      icon: <BarChart3 className="w-4 h-4" />,
      label: "Notional Volume",
      title: "How much you turned over",
      body: "Sum of quote-currency notional (USDT) across all in-window fills. Useful for projects who reward activity over PnL.",
      tone: "cyan" as const,
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      label: "Realized PnL",
      title: "How well you did (signed)",
      body: "Sum of realizedPnl per fill, in USDT. Losses welcome — negative numbers also land on the board.",
      tone: "green" as const,
    },
  ];
  const ring = {
    violet: "ring-violet-400/30 shadow-[0_0_40px_-12px_rgba(139,92,246,0.45)]",
    cyan:   "ring-cyan-400/30 shadow-[0_0_40px_-12px_rgba(34,211,238,0.45)]",
    green:  "ring-emerald-400/30 shadow-[0_0_40px_-12px_rgba(52,211,153,0.45)]",
  };
  const pill = { violet: "pill-violet", cyan: "pill-cyan", green: "pill-green" };

  return (
    <section className="grid md:grid-cols-3 gap-4">
      {tiles.map((t) => (
        <div key={t.label} className={`card card-hover ring-1 ${ring[t.tone]}`}>
          <span className={pill[t.tone]}>{t.icon}{t.label}</span>
          <h3 className="mt-3 text-lg font-semibold text-white">{t.title}</h3>
          <p className="mt-1.5 text-sm text-slate-400">{t.body}</p>
        </div>
      ))}
    </section>
  );
}

/* ---------- Current Round ---------- */
function CurrentRound({ round, loading }: { round: RoundDTO | null; loading: boolean }) {
  if (loading) {
    return <div className="card text-center text-slate-500">Loading current round…</div>;
  }
  if (!round) {
    return (
      <section className="card text-center">
        <div className="mx-auto inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-500/10 ring-1 ring-violet-400/20">
          <Sparkles className="w-5 h-5 text-violet-300" />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-white">No active round yet</h3>
        <p className="mt-1 text-sm text-slate-400">
          Anyone can spin one up — head to <Link className="text-violet-300 hover:underline" href="/admin">Open a Round</Link>.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">Round #{round.id}</h2>
          <span className={round.finalized ? "pill-rose" : round.active ? "pill-green" : "pill-violet"}>
            {round.finalized ? "Finalized" : round.active ? "Live" : "Closed"}
          </span>
          <span className="pill-cyan"><ShieldCheck className="w-3 h-3" />zkVerify-gated</span>
        </div>
        <Link href={`/leaderboard/${round.id}`} className="btn-ghost">
          Open Leaderboard <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Period Start" value={formatTimestamp(BigInt(round.periodStart))} />
        <Stat label="Period End"   value={formatTimestamp(BigInt(round.periodEnd))} />
        <Stat label="Duration"     value={formatDuration(BigInt(round.periodStart), BigInt(round.periodEnd))} />
        <Stat label="Creator"      value={round.creator} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-sm font-mono text-white truncate">{value}</div>
    </div>
  );
}

/* ---------- All Rounds list ---------- */
function AllRounds({ rounds, latestId }: { rounds: RoundDTO[]; latestId: number }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-slate-400" />
          <h3 className="text-base font-semibold text-white">All Rounds ({rounds.length})</h3>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.03] border-b border-white/10">
              <th className="px-4 py-2.5 text-left  font-semibold text-slate-400 text-[10px] uppercase tracking-wider">#</th>
              <th className="px-4 py-2.5 text-left  font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Creator</th>
              <th className="px-4 py-2.5 text-left  font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Window</th>
              <th className="px-4 py-2.5 text-left  font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold text-slate-400 text-[10px] uppercase tracking-wider">View</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id} className={`border-b border-white/5 transition hover:bg-white/[0.04] ${r.id === latestId ? "bg-violet-500/[0.06]" : ""}`}>
                <td className="px-4 py-2.5 font-mono text-slate-300">{r.id}</td>
                <td className="px-4 py-2.5 font-mono text-slate-200 truncate max-w-[14ch]">{r.creator}</td>
                <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">
                  {formatTimestamp(BigInt(r.periodStart))} → {formatTimestamp(BigInt(r.periodEnd))}
                </td>
                <td className="px-4 py-2.5">
                  <span className={r.finalized ? "pill-rose" : r.active ? "pill-green" : "pill-violet"}>
                    {r.finalized ? "FINAL" : r.active ? "LIVE" : "CLOSED"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/leaderboard/${r.id}`} className="text-violet-300 hover:underline text-xs">
                    leaderboard →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */
function HowItWorks() {
  const steps = [
    { n: 1, title: "Trade on Binance Futures", body: "Use your existing Binance Futures account. Whatever you traded in the round window — count, volume, and realized PnL — becomes the three numbers.", icon: <Database className="w-5 h-5" /> },
    { n: 2, title: "Notarize + prove locally",         body: "TLSNotary co-signs your trade-history TLS session with the Notary. Noir computes count, volume and PnL, pins all three to the same commitment. You get a ~14 KB proof bundle.", icon: <Lock className="w-5 h-5" /> },
    { n: 3, title: "Submit → zkVerify → leaderboard",  body: "Your proof bundle is POSTed to this site's API. The server submits the proof to zkVerify Volta. Only after the attestation finalizes does your row appear.", icon: <Cpu className="w-5 h-5" /> },
  ];
  return (
    <section className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white">How it works</h2>
        <p className="mt-1 text-sm text-slate-400">Three steps. zkVerify is the gate; no row lands without an attestation.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {steps.map((s) => (
          <div key={s.n} className="card card-hover relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-violet-500/20 blur-2xl pointer-events-none" />
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/40 to-cyan-500/30 text-white ring-1 ring-white/10">
                {s.icon}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-mono">Step {s.n}</span>
            </div>
            <h3 className="font-semibold text-white">{s.title}</h3>
            <p className="mt-1.5 text-sm text-slate-400">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Stack ---------- */
function Stack() {
  const tools = [
    { name: "TLSNotary v0.1.0",  sub: "MPC-TLS notary (PSE)" },
    { name: "Noir + UltraHonk",  sub: "ZK assertion circuit" },
    { name: "zkVerify Volta",    sub: "Proof verification + attestation" },
    { name: "Next.js + JSON",    sub: "Leaderboard storage (demo)" },
  ];
  return (
    <section>
      <div className="text-center mb-6">
        <span className="pill-cyan"><Shield className="w-3 h-3" />The Trust Closure</span>
        <h2 className="mt-3 text-2xl font-bold text-white">No vendor lock-in. End-to-end open source.</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tools.map((t) => (
          <div key={t.name} className="stat-tile text-center">
            <div className="text-sm font-semibold text-white">{t.name}</div>
            <div className="mt-1 text-[11px] text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
