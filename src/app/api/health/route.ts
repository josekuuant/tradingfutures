import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/constants";
import {
  getUptimeString,
  getModuleLastActivity,
  getModuleErrorCounts,
  getLogCounts,
} from "@/lib/logger";
import { LOG_MODULES } from "@/types/log";
import type { SystemHealth, ModuleHealth, HealthStatus } from "@/types/log";

export async function GET() {
  try {
    const lastActivity = getModuleLastActivity();
    const errorCounts = getModuleErrorCounts();
    const uptime = getUptimeString();

    const modules: ModuleHealth[] = LOG_MODULES.map((mod) => {
      const last = lastActivity[mod];
      const errors = errorCounts[mod];
      let status: HealthStatus = "unknown";
      let message = "No activity recorded";

      if (last) {
        const age = Date.now() - new Date(last).getTime();
        if (errors > 5) {
          status = "degraded";
          message = `${errors} errors recorded`;
        } else if (age < 300_000) {
          status = "healthy";
          message = "Active";
        } else {
          status = "healthy";
          message = `Last active ${Math.round(age / 60_000)}m ago`;
        }
      }

      return { module: mod, status, lastActivity: last, errorCount: errors, message };
    });

    const hasDown = modules.some((m) => m.status === "down");
    const hasDegraded = modules.some((m) => m.status === "degraded");
    const overall: HealthStatus = hasDown
      ? "down"
      : hasDegraded
        ? "degraded"
        : "healthy";

    const health: SystemHealth = {
      overall,
      modules,
      uptime,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      status: overall,
      version: APP_VERSION,
      uptime,
      health,
      logCounts: getLogCounts(),
    });
  } catch (err) {
    console.error("[API] GET /health error:", err);
    return NextResponse.json(
      { status: "error", version: APP_VERSION },
      { status: 500 }
    );
  }
}
