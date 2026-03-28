import { NextResponse } from "next/server";
import { getAdapter, getMarketSnapshot } from "@/lib/services/market";

export async function GET() {
  // Trigger lazy adapter init (ensureAdapter) before checking name
  try {
    await getMarketSnapshot("NQ", "1m");
  } catch {
    // ignore — just triggers adapter init
  }
  return NextResponse.json({ adapter: getAdapter().name });
}
