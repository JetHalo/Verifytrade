import { NextRequest, NextResponse } from "next/server";
import { leaderboardFor } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { roundId: string } }) {
  const rows = await leaderboardFor(Number(params.roundId));
  return NextResponse.json({ rows });
}
