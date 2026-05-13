"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { COMPETITION_ADDRESS, competitionAbi, type Round } from "@/lib/contracts";
import { formatPnl, formatTimestamp } from "@/lib/utils";
import { ArrowRight, Shield, TrendingUp, Trophy } from "lucide-react";

export default function HomePage() {
  // Read currently active round (assume roundId 0 for the demo)
  const { data: round, isLoading } = useReadContract({
    address: COMPETITION_ADDRESS,
    abi: competitionAbi,
    functionName: "getRound",
    args: [0n],
  });

  return (
    <div className="space-y-12">
      <Hero />
      <CurrentRound round={round as Round | undefined} isLoading={isLoading} />
      <HowItWorks />
    </div>
  );
}

function Hero() {
  return (
    <section className="text-center space-y-4 py-8">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zkv-100 text-zkv-800 text-xs font-medium">
        <Shield className="w-3 h-3" />
        Powered by TLSNotary + zkVerify
      </div>
      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
        Prove your trading edge.<br />
        <span className="text-zkv-700">Without revealing your trades.</span>
      </h1>
      <p className="text-lg text-slate-600 max-w-2xl mx-auto">
        VerifyTrade uses ZK-TLS to let you cryptographically prove your Binance Futures PnL
        without exposing any account details. Verified on zkVerify, settled on Base.
      </p>
      <div className="flex justify-center gap-3 pt-4">
        <Link href="/submit" className="btn-primary">
          Submit My Proof <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
        <Link href="/leaderboard/0" className="btn-secondary">
          View Leaderboard
        </Link>
      </div>
    </section>
  );
}

function CurrentRound({ round, isLoading }: { round?: Round; isLoading: boolean }) {
  if (isLoading) {
    return <div className="card text-center text-slate-500">Loading current round…</div>;
  }
  if (!round || round.periodStart === 0n) {
    return (
      <div className="card text-center text-slate-500">
        No active round yet. Check back when the operator opens one.
      </div>
    );
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900">Current Round</h2>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          round.active
            ? "bg-green-100 text-green-700"
            : "bg-slate-100 text-slate-600"
        }`}>
          {round.finalized ? "Finalized" : round.active ? "Live" : "Closed"}
        </span>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Period Start" value={formatTimestamp(round.periodStart)} />
        <Stat label="Period End" value={formatTimestamp(round.periodEnd)} />
        <Stat label="Threshold" value={formatPnl(round.thresholdUsdtX1e8)} />
        <Stat label="Reward Pool" value={`${Number(round.rewardPool) / 1e18} ETH`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className="text-sm font-mono text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: TrendingUp,
      title: "1. Trade on Binance Futures Testnet",
      body: "Register at testnet.binancefuture.com (GitHub login, 30 seconds). Get free test USDT and place a few trades.",
    },
    {
      icon: Shield,
      title: "2. Generate your ZK-TLS proof",
      body: "Run the VerifyTrade Prover CLI. It connects to your own Notary (running on Railway) and produces a TLSNotary attestation + UltraHonk proof — all without exposing your account credentials.",
    },
    {
      icon: Trophy,
      title: "3. Submit on-chain & compete",
      body: "Upload your proof bundle, submit on Base Sepolia, get added to the leaderboard. Top 10 share the reward pool when the round closes.",
    },
  ];
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900 text-center">How It Works</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {steps.map((s) => (
          <div key={s.title} className="card">
            <s.icon className="w-8 h-8 text-zkv-700 mb-3" />
            <h3 className="font-semibold text-slate-900 mb-2">{s.title}</h3>
            <p className="text-sm text-slate-600">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
