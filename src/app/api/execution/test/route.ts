import { NextResponse } from "next/server";
import { testConnection } from "@/lib/services/execution";

export async function POST() {
  try {
    const result = await testConnection();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[API] POST /execution/test error:", err);
    return NextResponse.json(
      { error: "Connection test failed" },
      { status: 500 }
    );
  }
}
