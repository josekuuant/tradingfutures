import { NextRequest, NextResponse } from "next/server";
import {
  listStrategies,
  createStrategy,
} from "@/lib/services/strategies";
import { createStrategySchema } from "@/types/strategy";
import { ZodError } from "zod";

export async function GET() {
  try {
    const strategies = await listStrategies();
    return NextResponse.json(strategies);
  } catch (err) {
    console.error("[API] GET /strategies error:", err);
    return NextResponse.json(
      { error: "Failed to load strategies" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createStrategySchema.parse(body);
    const strategy = await createStrategy(data);
    return NextResponse.json(strategy, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[API] POST /strategies error:", err);
    return NextResponse.json(
      { error: "Failed to create strategy" },
      { status: 500 }
    );
  }
}
