import { NextRequest, NextResponse } from "next/server";
import {
  getRiskControlStatus,
  getLockdownHistory,
  activateKillSwitch,
  deactivateKillSwitch,
  deactivateAllKillSwitches,
  updateRiskConfig,
} from "@/lib/services/execution";
import type { ExecutionProvider } from "@/types/execution";

export async function GET() {
  try {
    const status = getRiskControlStatus();
    const history = getLockdownHistory(30);
    return NextResponse.json({ status, history });
  } catch (err) {
    console.error("[API] GET /execution/risk error:", err);
    return NextResponse.json({ error: "Failed to get risk status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "kill_global":
        activateKillSwitch(
          "global",
          "global",
          "manual",
          body.reason ?? "Manual global kill switch",
          "user"
        );
        return NextResponse.json({ ok: true, message: "Global kill switch activated" });

      case "kill_provider":
        if (!body.provider) {
          return NextResponse.json({ error: "provider required" }, { status: 400 });
        }
        activateKillSwitch(
          "provider",
          body.provider as ExecutionProvider,
          "manual",
          body.reason ?? `Manual kill: ${body.provider}`,
          "user"
        );
        return NextResponse.json({ ok: true, message: `${body.provider} locked` });

      case "kill_symbol":
        if (!body.symbol) {
          return NextResponse.json({ error: "symbol required" }, { status: 400 });
        }
        activateKillSwitch(
          "symbol",
          body.symbol,
          "manual",
          body.reason ?? `Manual lock: ${body.symbol}`,
          "user"
        );
        return NextResponse.json({ ok: true, message: `${body.symbol} locked` });

      case "release":
        if (body.scope && body.target) {
          deactivateKillSwitch(body.scope, body.target);
        }
        return NextResponse.json({ ok: true, message: "Kill switch released" });

      case "release_all":
        const count = deactivateAllKillSwitches();
        return NextResponse.json({ ok: true, message: `${count} kill switches released` });

      case "update_config":
        if (body.config) {
          updateRiskConfig(body.config);
        }
        return NextResponse.json({ ok: true, config: getRiskControlStatus().config });

      default:
        return NextResponse.json(
          { error: "Invalid action. Valid: kill_global, kill_provider, kill_symbol, release, release_all, update_config" },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[API] POST /execution/risk error:", err);
    return NextResponse.json({ error: "Risk control action failed" }, { status: 500 });
  }
}
