/**
 * Generate mock Binance userTrades data for testing the circuit + flow
 * without needing real testnet trades.
 *
 * Usage:
 *   pnpm mock-data -- --count 10 --period-start 1717200000000 --period-end 1717804800000 --out ./mock-trades.json
 */

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

interface MockTrade {
  symbol: string;
  id: number;
  side: "BUY" | "SELL";
  price: string;
  qty: string;
  realizedPnl: string;
  time: number;
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDecimal(min: number, max: number, decimals = 8): string {
  const val = min + Math.random() * (max - min);
  return val.toFixed(decimals);
}

async function main() {
  const { values } = parseArgs({
    options: {
      count: { type: "string", default: "10" },
      "period-start": { type: "string" },
      "period-end": { type: "string" },
      out: { type: "string", default: "./mock-trades.json" },
    },
  });

  const count = parseInt(values.count!);
  const periodStart = parseInt(values["period-start"]!);
  const periodEnd = parseInt(values["period-end"]!);

  if (!periodStart || !periodEnd) {
    console.error("Both --period-start and --period-end (Unix ms) are required");
    process.exit(1);
  }

  const trades: MockTrade[] = [];

  // Generate pairs of open + close trades; close trades have realizedPnl
  for (let i = 0; i < count; i++) {
    const isClose = i % 2 === 1;
    const time = randInt(periodStart, periodEnd);
    const pnl = isClose ? randDecimal(-500, 2000) : "0";
    trades.push({
      symbol: "BTCUSDT",
      id: 1000 + i,
      side: isClose ? "SELL" : "BUY",
      price: randDecimal(50000, 70000, 2),
      qty: randDecimal(0.001, 0.5, 3),
      realizedPnl: pnl,
      time,
    });
  }

  trades.sort((a, b) => a.time - b.time);

  writeFileSync(values.out!, JSON.stringify(trades, null, 2));
  console.log(`Wrote ${trades.length} mock trades to ${values.out}`);

  const totalPnl = trades.reduce((acc, t) => acc + parseFloat(t.realizedPnl), 0);
  console.log(`Total PnL across mock trades: ${totalPnl.toFixed(2)} USDT`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
