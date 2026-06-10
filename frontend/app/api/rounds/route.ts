import { NextRequest, NextResponse } from "next/server";
import { createRound, listRounds } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const rounds = await listRounds();
  return NextResponse.json({ rounds });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.periodStart || !body.periodEnd) {
    return NextResponse.json({ error: "periodStart and periodEnd required (unix ms)" }, { status: 400 });
  }
  const periodStartMs = BigInt(body.periodStart);
  const periodEndMs   = BigInt(body.periodEnd);
  if (periodEndMs <= periodStartMs) {
    return NextResponse.json({ error: "periodEnd must be > periodStart" }, { status: 400 });
  }
  const creator = String(body.creator ?? "anonymous");

  const row = await createRound({ periodStartMs, periodEndMs, creator });
  return NextResponse.json({ round: row }, { status: 201 });
}
