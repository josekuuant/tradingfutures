import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  listBacktestRuns,
  runBacktest,
} from "@/lib/services/backtest/replay-engine";

const backtestConfigSchema = z
  .object({
    strategyId: z.string().min(1, "strategyId is required"),
    promptId: z.string().min(1, "promptId is required"),
    instrument: z.string().default("NQ"),
    timeframe: z.string().default("5m"),
    candleCount: z.coerce.number().int().min(50).max(2000).default(200),
    windowSize: z.coerce.number().int().min(10).max(200).default(50),
    stepSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine((d) => d.windowSize < d.candleCount, {
    message: "windowSize must be less than candleCount",
  });

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
    const config = backtestConfigSchema.parse(body);
    const run = await runBacktest(config);
    return NextResponse.json(run, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const msg = err instanceof Error ? err.message : "Backtest failed";
    console.error("[API] POST /backtests error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
