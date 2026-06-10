import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "+1234.56 USDT" / "-89.10 USDT" — leaderboard-style, always shows sign. */
export function formatPnl(pnlX1e8: bigint): string {
  const sign = pnlX1e8 < 0n ? "-" : "+";
  const abs = pnlX1e8 < 0n ? -pnlX1e8 : pnlX1e8;
  const usdt = Number(abs) / 1e8;
  return `${sign}${usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

/** "12,345.67 USDT" — volumes are always non-negative; no sign. */
export function formatVolume(volX1e8: bigint): string {
  const usdt = Number(volX1e8) / 1e8;
  return `${usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

/** "142" — trade counts. */
export function formatCount(count: bigint | number): string {
  return Number(count).toLocaleString();
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** "2026-05-26 12:30 UTC" */
export function formatTimestamp(ms: bigint | number): string {
  const d = new Date(Number(ms));
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** "5 days 3h" — duration from now to a timestamp. */
export function formatDuration(fromMs: bigint, toMs: bigint): string {
  const diff = Number(toMs - fromMs);
  if (diff <= 0) return "0";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
