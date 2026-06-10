"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getLeaderboard,
  getRound,
  type LeaderboardRowDTO,
  type RoundDTO,
} from "@/lib/api-client";
import {
  formatAddress,
  formatCount,
  formatPnl,
  formatTimestamp,
  formatVolume,
  formatDuration,
} from "@/lib/utils";
import {
  Trophy, Clock, BarChart3, TrendingUp, Hash, ShieldCheck, ExternalLink, Zap,
} from "lucide-react";

const ZKV_EXPLORER = "https://zkverify-testnet.subscan.io";

export default function LeaderboardPage({ params }: { params: { roundId: string } }) {
  const roundId = Number(params.roundId);
  const [round, setRound] = useState<RoundDTO | null>(null);
  const [rows, setRows] = useState<LeaderboardRowDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [r, lb] = await Promise.all([
          getRound(roundId),
          getLeaderboard(roundId),
        ]);
        if (cancelled) return;
        setRound(r);
        setRows(lb);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // poll every 5s so new submissions appear without manual refresh
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [roundId]);

  const podium = rows.slice(0, 3);

  return (
    <div className="space-y-10">
      {/* Title */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-300" />
            <span className="pill-amber">Round #{params.roundId}</span>
            {round && (
              <span className={round.finalized ? "pill-rose" : round.active ? "pill-green" : "pill-violet"}>
                {round.finalized ? "FINALIZED" : round.active ? "LIVE" : "CLOSED"}
              </span>
            )}
            <span className="pill-cyan"><ShieldCheck className="w-3 h-3" />verified by zkVerify</span>
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-white">
            Verified <span className="text-gradient">Trading Leaderboard</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Every row carries a zkVerify Volta attestation ID. Click it to see the verification on-chain.
          </p>
        </div>
        {round && round.active && (
          <Link
            href={`/submit?round=${params.roundId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 text-white font-semibold text-sm hover:opacity-90 transition"
          >
            <Zap className="w-4 h-4" />
            Submit to this round
          </Link>
        )}
      </header>

      {/* Round meta */}
      {round && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaTile icon={<Clock className="w-4 h-4" />}    label="Period Start" value={formatTimestamp(BigInt(round.periodStart))} />
          <MetaTile icon={<Clock className="w-4 h-4" />}    label="Period End"   value={formatTimestamp(BigInt(round.periodEnd))} />
          <MetaTile icon={<BarChart3 className="w-4 h-4" />} label="Duration"     value={formatDuration(BigInt(round.periodStart), BigInt(round.periodEnd))} />
          <MetaTile icon={<Hash className="w-4 h-4" />}      label="Submissions"  value={String(rows.length)} />
        </section>
      )}

      {/* Podium */}
      {podium.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {podium.map((row, i) => (
            <PodiumCard key={row.identity + i} rank={i + 1} row={row} />
          ))}
        </section>
      )}

      {/* Full table */}
      <section className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03] border-b border-white/10">
                <Th>#</Th>
                <Th align="left">Identity</Th>
                <Th align="right"><Hash className="w-3 h-3 inline mr-1" />Trades</Th>
                <Th align="right"><BarChart3 className="w-3 h-3 inline mr-1" />Volume</Th>
                <Th align="right"><TrendingUp className="w-3 h-3 inline mr-1" />PnL</Th>
                <Th align="left"><ShieldCheck className="w-3 h-3 inline mr-1" />Attestation</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No verified submissions yet. Open the <a href={`/submit?round=${params.roundId}`} className="text-violet-300 hover:underline">Submit</a> page to drop a proof.
                </td></tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.identity + i} className={`border-b border-white/5 transition hover:bg-white/[0.04] ${i < 3 ? "bg-violet-500/[0.04]" : ""}`}>
                    <td className="px-4 py-3"><RankBadge rank={i + 1} /></td>
                    <td className="px-4 py-3 font-mono text-slate-200">
                      {row.identity.startsWith("0x") ? formatAddress(row.identity) : row.identity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-100">{formatCount(row.tradeCount)}</td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-200">{formatVolume(BigInt(row.volumeX1e8))}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${
                      BigInt(row.pnlX1e8) >= 0n ? "text-emerald-300" : "text-rose-300"
                    }`}>
                      {formatPnl(BigInt(row.pnlX1e8))}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <a
                        href={`${ZKV_EXPLORER}/extrinsic/${row.txHash ?? row.attestationId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200 hover:underline"
                        title={`attestation ${row.attestationId}`}
                      >
                        #{row.attestationId.slice(0, 8)}…
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500 text-center">
        Every row is the result of a real zkVerify Volta attestation.
        Trade count, volume and PnL are pinned to the same TLSNotary commitment;
        none of the three can be forged independently of the others.
      </p>
    </div>
  );
}

/* ----------- subcomponents ----------- */

function Th({
  children, align = "left",
}: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} font-semibold text-slate-300 text-[11px] uppercase tracking-wider`}>
      {children}
    </th>
  );
}

function MetaTile({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-tile">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}<span className="stat-label">{label}</span>
      </div>
      <div className="mt-1 text-sm font-mono text-white truncate">{value}</div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[#0a0a0f] text-xs font-extrabold shadow-[0_4px_18px_-4px_rgba(251,191,36,0.7)]">1</span>;
  if (rank === 2)
    return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 text-[#0a0a0f] text-xs font-extrabold shadow-[0_4px_18px_-4px_rgba(203,213,225,0.6)]">2</span>;
  if (rank === 3)
    return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-[#0a0a0f] text-xs font-extrabold shadow-[0_4px_18px_-4px_rgba(251,146,60,0.6)]">3</span>;
  return <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-slate-400 text-xs font-mono ring-1 ring-white/10">{rank}</span>;
}

function PodiumCard({ rank, row }: { rank: number; row: LeaderboardRowDTO }) {
  const accent =
    rank === 1
      ? { ring: "ring-amber-400/40",  glow: "shadow-[0_0_50px_-15px_rgba(251,191,36,0.55)]",  tag: "bg-amber-400/20 text-amber-200" }
      : rank === 2
      ? { ring: "ring-slate-300/30",  glow: "shadow-[0_0_50px_-15px_rgba(203,213,225,0.45)]", tag: "bg-slate-300/20 text-slate-100" }
      : { ring: "ring-orange-400/30", glow: "shadow-[0_0_50px_-15px_rgba(251,146,60,0.5)]",   tag: "bg-orange-400/20 text-orange-200" };

  const pnl = BigInt(row.pnlX1e8);

  return (
    <div className={`card card-hover ring-1 ${accent.ring} ${accent.glow}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide ${accent.tag}`}>#{rank}</span>
        <RankBadge rank={rank} />
      </div>
      <div className="font-mono text-sm text-slate-200 truncate">
        {row.identity.startsWith("0x") ? formatAddress(row.identity) : row.identity}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <PodiumStat label="Trades" value={formatCount(row.tradeCount)} />
        <PodiumStat label="Volume" value={formatVolume(BigInt(row.volumeX1e8)).replace(" USDT", "")} suffix="USDT" tone="cyan" />
        <PodiumStat label="PnL"    value={formatPnl(pnl).replace(" USDT", "")} suffix="USDT" tone={pnl >= 0n ? "green" : "rose"} />
      </div>
    </div>
  );
}

function PodiumStat({
  label, value, suffix, tone = "default",
}: {
  label: string; value: string; suffix?: string; tone?: "default" | "cyan" | "green" | "rose";
}) {
  const color =
    tone === "cyan"  ? "text-cyan-200"     :
    tone === "green" ? "text-emerald-300"  :
    tone === "rose"  ? "text-rose-300"     : "text-white";
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${color}`}>{value}</div>
      {suffix && <div className="text-[9px] text-slate-500 font-mono">{suffix}</div>}
    </div>
  );
}
