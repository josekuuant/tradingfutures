import { NextRequest, NextResponse } from "next/server";
import { generateSignal, getLastTrace } from "@/lib/services/signal-engine";
import { INSTRUMENTS, TIMEFRAMES, type Instrument, type Timeframe } from "@/types/market";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is valid — uses strategy defaults
    }

    const instrument = body.instrument as string | undefined;
    const timeframe = body.timeframe as string | undefined;

    // Validate if provided
    if (instrument && !INSTRUMENTS.includes(instrument as Instrument)) {
      return NextResponse.json(
        { error: `Invalid instrument. Valid: ${INSTRUMENTS.join(", ")}` },
        { status: 400 }
      );
    }
    if (timeframe && !TIMEFRAMES.includes(timeframe as Timeframe)) {
      return NextResponse.json(
        { error: `Invalid timeframe. Valid: ${TIMEFRAMES.join(", ")}` },
        { status: 400 }
      );
    }

    const manualTrigger = body.manualTrigger === true;
    const result = await generateSignal({ instrument, timeframe, manualTrigger });

    if (!result.success) {
      const trace = getLastTrace();

      const statusMap: Record<string, number> = {
        NO_STRATEGY: 400,
        NO_PROMPT: 400,
        NO_API_KEY: 401,
        FILTERED: 200, // Not an error — just filtered out
      };
      const status = statusMap[result.code] ?? 500;

      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          filterReport: trace?.filterReport ?? null,
        },
        { status }
      );
    }

    return NextResponse.json(result.signal, { status: 201 });
  } catch (err) {
    console.error("[API] POST /signals/generate error:", err);
    return NextResponse.json(
      { error: "Signal generation failed" },
      { status: 500 }
    );
  }
}
