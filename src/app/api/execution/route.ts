import { NextResponse } from "next/server";
import { getExecutionState } from "@/lib/services/execution";

export async function GET() {
  try {
    const state = await getExecutionState();
    return NextResponse.json(state);
  } catch (err) {
    console.error("[API] GET /execution error:", err);
    return NextResponse.json(
      { error: "Failed to get execution state" },
      { status: 500 }
    );
  }
}
