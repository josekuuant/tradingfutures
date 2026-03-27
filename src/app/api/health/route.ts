import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/constants";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
}
