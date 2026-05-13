import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPnl(pnlX1e8: bigint): string {
  const sign = pnlX1e8 < 0n ? "-" : "+";
  const abs = pnlX1e8 < 0n ? -pnlX1e8 : pnlX1e8;
  const usdt = Number(abs) / 1e8;
  return `${sign}${usdt.toFixed(2)} USDT`;
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatTimestamp(ms: bigint | number): string {
  const d = new Date(Number(ms));
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
