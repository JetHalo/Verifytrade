"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zkv-500 to-zkv-800" />
          <span className="font-bold text-lg text-slate-900">VerifyTrade</span>
          <span className="text-xs text-slate-500 ml-2 font-mono">ZK-TLS × zkVerify</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-700 hover:text-zkv-700">Home</Link>
          <Link href="/submit" className="text-slate-700 hover:text-zkv-700">Submit Proof</Link>
          <Link href="/leaderboard/0" className="text-slate-700 hover:text-zkv-700">Leaderboard</Link>
          <ConnectButton />
        </nav>
      </div>
    </header>
  );
}
