import { NextRequest, NextResponse } from "next/server";
import {
  getOrderQueue,
  getQueueStats,
} from "@/lib/services/execution/order-queue";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

    const queue = getOrderQueue(limit);
    const stats = getQueueStats();

    return NextResponse.json({ queue, stats });
  } catch (err) {
    console.error("[API] GET /execution/queue error:", err);
    return NextResponse.json(
      { error: "Failed to get order queue" },
      { status: 500 }
    );
  }
}
