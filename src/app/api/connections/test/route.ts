import { NextRequest, NextResponse } from "next/server";
import { testConnection } from "@/lib/services/connections";
import { PROVIDERS } from "@/types/connections";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = body.provider;

    if (!provider || !PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Valid: ${PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await testConnection(provider);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[API] POST /connections/test error:", err);
    return NextResponse.json(
      { error: "Connection test failed" },
      { status: 500 }
    );
  }
}
