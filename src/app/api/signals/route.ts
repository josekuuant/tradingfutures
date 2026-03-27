import { NextResponse } from "next/server";
import { listSignals } from "@/lib/services/signal-engine";

export async function GET() {
  try {
    const signals = await listSignals();
    return NextResponse.json(signals);
  } catch (err) {
    console.error("[API] GET /signals error:", err);
    return NextResponse.json(
      { error: "Failed to load signals" },
      { status: 500 }
    );
  }
}
