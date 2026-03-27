import { NextRequest, NextResponse } from "next/server";
import {
  getEngineConfig,
  updateEngineConfig,
} from "@/lib/services/signal-engine";

export async function GET() {
  return NextResponse.json(getEngineConfig());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    updateEngineConfig(body);
    return NextResponse.json(getEngineConfig());
  } catch (err) {
    console.error("[API] PUT /engine/config error:", err);
    return NextResponse.json(
      { error: "Failed to update engine config" },
      { status: 500 }
    );
  }
}
