"use client";

import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0f]/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-glow">
            <span className="absolute inset-0 rounded-lg ring-1 ring-white/20" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-white tracking-tight">VerifyTrade</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-mono">
              TLSNotary <span className="opacity-50">×</span> zkVerify
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/">Home</NavLink>
          <NavLink href="/submit">Submit Proof</NavLink>
          <NavLink href="/rounds">Rounds</NavLink>
          <NavLink href="/admin">Open Round</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] transition"
    >
      {children}
    </Link>
  );
}
