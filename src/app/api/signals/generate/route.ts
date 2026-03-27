import { NextRequest, NextResponse } from "next/server";
import { generateSignal } from "@/lib/services/signal-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const instrument = body.instrument as string | undefined;
    const timeframe = body.timeframe as string | undefined;

    const result = await generateSignal({ instrument, timeframe });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.code === "NO_STRATEGY" || result.code === "NO_PROMPT"
          ? 400
          : result.code === "NO_API_KEY"
            ? 401
            : 500 }
      );
    }

    return NextResponse.json(result.signal, { status: 201 });
  } catch (err) {
    console.error("[API] POST /signals/generate error:", err);
    return NextResponse.json(
      { error: "Signal generation failed" },
      { status: 500 }
    );
  }
}
