import { NextRequest, NextResponse } from "next/server";
import {
  listBacktestRuns,
  runBacktest,
} from "@/lib/services/backtest/replay-engine";
import type { BacktestConfig } from "@/types/backtest";

export async function GET() {
  try {
    const runs = await listBacktestRuns();
    return NextResponse.json(runs);
  } catch (err) {
    console.error("[API] GET /backtests error:", err);
    return NextResponse.json(
      { error: "Failed to load backtests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const config: BacktestConfig = {
      strategyId: body.strategyId,
      promptId: body.promptId,
      instrument: body.instrument ?? "NQ",
      timeframe: body.timeframe ?? "5m",
      candleCount: body.candleCount ?? 200,
      windowSize: body.windowSize ?? 50,
      stepSize: body.stepSize ?? 10,
    };

    if (!config.strategyId || !config.promptId) {
      return NextResponse.json(
        { error: "strategyId and promptId are required" },
        { status: 400 }
      );
    }

    const run = await runBacktest(config);
    return NextResponse.json(run, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backtest failed";
    console.error("[API] POST /backtests error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
