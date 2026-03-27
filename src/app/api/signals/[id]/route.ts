import { NextRequest, NextResponse } from "next/server";
import { getSignal } from "@/lib/services/signal-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const signal = await getSignal(params.id);
    if (!signal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(signal);
  } catch (err) {
    console.error("[API] GET /signals/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to load signal" },
      { status: 500 }
    );
  }
}
