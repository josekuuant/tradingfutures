import { NextResponse } from "next/server";
import {
  getEngineStats,
  getTraces,
  getEngineConfig,
} from "@/lib/services/signal-engine";

export async function GET() {
  try {
    return NextResponse.json({
      config: getEngineConfig(),
      stats: getEngineStats(),
      recentTraces: getTraces(20),
    });
  } catch (err) {
    console.error("[API] GET /engine/status error:", err);
    return NextResponse.json(
      { error: "Failed to get engine status" },
      { status: 500 }
    );
  }
}
