import { NextRequest, NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/services/market";
import { INSTRUMENTS, TIMEFRAMES, type Instrument, type Timeframe } from "@/types/market";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const instrument = searchParams.get("instrument") ?? "NQ";
    const timeframe = searchParams.get("timeframe") ?? "5m";

    if (!INSTRUMENTS.includes(instrument as Instrument)) {
      return NextResponse.json(
        { error: `Invalid instrument. Valid: ${INSTRUMENTS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!TIMEFRAMES.includes(timeframe as Timeframe)) {
      return NextResponse.json(
        { error: `Invalid timeframe. Valid: ${TIMEFRAMES.join(", ")}` },
        { status: 400 }
      );
    }

    const snapshot = await getMarketSnapshot(
      instrument as Instrument,
      timeframe as Timeframe
    );
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[API] GET /market-data error:", err);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
