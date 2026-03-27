import { NextRequest, NextResponse } from "next/server";
import {
  getExecutionMode,
  setExecutionMode,
} from "@/lib/services/execution";
import type { ExecutionMode } from "@/types/execution";

const VALID_MODES: ExecutionMode[] = [
  "disabled",
  "monitor",
  "dry_run",
  "manual_approval",
  "semi_auto",
  "full_auto",
];

export async function GET() {
  return NextResponse.json({ mode: getExecutionMode() });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode;

    if (!mode || !VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode. Valid: ${VALID_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    setExecutionMode(mode);
    return NextResponse.json({ mode: getExecutionMode() });
  } catch (err) {
    console.error("[API] PUT /execution/mode error:", err);
    return NextResponse.json(
      { error: "Failed to update mode" },
      { status: 500 }
    );
  }
}
