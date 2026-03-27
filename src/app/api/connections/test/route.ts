import { NextRequest, NextResponse } from "next/server";
import { testConnection } from "@/lib/services/connections";
import { PROVIDERS, type Provider } from "@/types/connections";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = body.provider as string;

    if (!PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json(
        { error: `Invalid provider: ${provider}` },
        { status: 400 }
      );
    }

    const result = await testConnection(provider as Provider);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[API] POST /connections/test error:", err);
    return NextResponse.json(
      { error: "Connection test failed" },
      { status: 500 }
    );
  }
}
