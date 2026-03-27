import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/services/market";

export async function GET() {
  return NextResponse.json({ adapter: getAdapter().name });
}
