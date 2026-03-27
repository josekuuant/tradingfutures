import { NextRequest, NextResponse } from "next/server";
import { getBacktestRun } from "@/lib/services/backtest/replay-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const run = await getBacktestRun(params.id);
    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    console.error("[API] GET /backtests/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to load backtest" },
      { status: 500 }
    );
  }
}
