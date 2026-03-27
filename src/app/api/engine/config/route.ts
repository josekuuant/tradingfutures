import { NextRequest, NextResponse } from "next/server";
import {
  getEngineConfig,
  updateEngineConfig,
} from "@/lib/services/signal-engine";
import { engineConfigSchema } from "@/types/engine";
import { ZodError } from "zod";

export async function GET() {
  return NextResponse.json(getEngineConfig());
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = engineConfigSchema.parse(body);
    updateEngineConfig(validated);
    return NextResponse.json(getEngineConfig());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[API] PUT /engine/config error:", err);
    return NextResponse.json(
      { error: "Failed to update engine config" },
      { status: 500 }
    );
  }
}
