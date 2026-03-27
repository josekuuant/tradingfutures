import { NextRequest, NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/services/market";
import type { Instrument, Timeframe } from "@/types/market";

const VALID_INSTRUMENTS: Instrument[] = ["NQ", "MNQ"];
const VALID_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "1D"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const instrument = (searchParams.get("instrument") ?? "NQ") as Instrument;
    const timeframe = (searchParams.get("timeframe") ?? "5m") as Timeframe;

    if (!VALID_INSTRUMENTS.includes(instrument)) {
      return NextResponse.json(
        { error: `Invalid instrument. Valid: ${VALID_INSTRUMENTS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!VALID_TIMEFRAMES.includes(timeframe)) {
      return NextResponse.json(
        { error: `Invalid timeframe. Valid: ${VALID_TIMEFRAMES.join(", ")}` },
        { status: 400 }
      );
    }

    const snapshot = await getMarketSnapshot(instrument, timeframe);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[API] GET /market-data error:", err);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
