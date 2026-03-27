import { NextRequest, NextResponse } from "next/server";
import {
  queryLogs,
  getLogCounts,
  type LogQuery,
} from "@/lib/logger";
import type { LogModule, LogLevel } from "@/types/log";
import { LOG_MODULES, LOG_LEVELS } from "@/types/log";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const query: LogQuery = {};

    const mod = searchParams.get("module");
    if (mod && LOG_MODULES.includes(mod as LogModule)) {
      query.module = mod as LogModule;
    }

    const level = searchParams.get("level");
    if (level && LOG_LEVELS.includes(level as LogLevel)) {
      query.level = level as LogLevel;
    }

    const minLevel = searchParams.get("minLevel");
    if (minLevel && LOG_LEVELS.includes(minLevel as LogLevel)) {
      query.minLevel = minLevel as LogLevel;
    }

    const limit = searchParams.get("limit");
    if (limit) query.limit = Math.min(Number(limit), 500);

    const search = searchParams.get("search");
    if (search) query.search = search;

    return NextResponse.json({
      logs: queryLogs(query),
      counts: getLogCounts(),
    });
  } catch (err) {
    console.error("[API] GET /logs error:", err);
    return NextResponse.json(
      { error: "Failed to load logs" },
      { status: 500 }
    );
  }
}
