import { NextRequest, NextResponse } from "next/server";
import { deleteRound, finalizeRound, getRound } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { roundId: string } }) {
  const round = await getRound(Number(params.roundId));
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ round });
}

export async function POST(req: NextRequest, { params }: { params: { roundId: string } }) {
  const body = await req.json().catch(() => null);
  if (!body || body.action !== "finalize") {
    return NextResponse.json({ error: "expected { action: 'finalize', who: '...' }" }, { status: 400 });
  }
  const who = String(body.who ?? "");
  try {
    const round = await finalizeRound(Number(params.roundId), who);
    return NextResponse.json({ round });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { roundId: string } }) {
  const roundId = Number(params.roundId);
  if (Number.isNaN(roundId)) {
    return NextResponse.json({ error: "invalid roundId" }, { status: 400 });
  }
  const existed = await getRound(roundId);
  if (!existed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { removedSubmissions } = await deleteRound(roundId);
  return NextResponse.json({ ok: true, removedSubmissions });
}
