"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  ShieldOff,
  OctagonX,
  AlertTriangle,
  Unlock,
  Loader2,
} from "lucide-react";

interface KillSwitch {
  active: boolean;
  scope: string;
  target: string;
  trigger: string;
  reason: string;
  activatedAt: string;
  activatedBy: string;
  expiresAt: string | null;
}

interface RiskStatus {
  globalLocked: boolean;
  activeKillSwitches: KillSwitch[];
  lockedProviders: string[];
  lockedSymbols: string[];
  recentAnomalies: { key: string; count: number; lastAt: string }[];
}

interface RiskPanelProps {
  status: RiskStatus | null;
  onAction: (action: string, payload?: Record<string, string>) => Promise<void>;
}

export function RiskPanel({ status, onAction }: RiskPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handle = async (action: string, payload?: Record<string, string>) => {
    setLoading(action);
    await onAction(action, payload);
    setLoading(null);
  };

  const activeCount = status?.activeKillSwitches.length ?? 0;
  const isGlobalLocked = status?.globalLocked ?? false;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card",
        isGlobalLocked
          ? "border-danger/40 bg-danger/5"
          : activeCount > 0
            ? "border-warning/40 bg-warning/5"
            : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          {isGlobalLocked ? (
            <OctagonX className="h-4 w-4 text-danger" />
          ) : activeCount > 0 ? (
            <AlertTriangle className="h-4 w-4 text-warning" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-success" />
          )}
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Risk Control
          </p>
          {activeCount > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                isGlobalLocked
                  ? "bg-danger/20 text-danger"
                  : "bg-warning/20 text-warning"
              )}
            >
              {activeCount} active
            </span>
          )}
        </div>

        {/* Kill switch buttons */}
        <div className="flex items-center gap-1.5">
          {isGlobalLocked ? (
            <button
              onClick={() => handle("release_all")}
              disabled={loading === "release_all"}
              className="inline-flex items-center gap-1 rounded bg-success/10 px-2.5 py-1 text-[10px] font-medium text-success hover:bg-success/20 disabled:opacity-50"
            >
              {loading === "release_all" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Unlock className="h-3 w-3" />
              )}
              Release All
            </button>
          ) : (
            <button
              onClick={() => handle("kill_global")}
              disabled={loading === "kill_global"}
              className="inline-flex items-center gap-1 rounded bg-danger/10 px-2.5 py-1 text-[10px] font-bold text-danger hover:bg-danger/20 disabled:opacity-50"
            >
              {loading === "kill_global" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <OctagonX className="h-3 w-3" />
              )}
              Kill All
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {activeCount === 0 ? (
          <p className="text-xs text-success/70">
            All systems operational — no active kill switches
          </p>
        ) : (
          <div className="space-y-2">
            {status!.activeKillSwitches.map((ks, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        ks.scope === "global"
                          ? "bg-danger/20 text-danger"
                          : ks.scope === "provider"
                            ? "bg-warning/20 text-warning"
                            : "bg-primary/20 text-primary"
                      )}
                    >
                      {ks.scope}
                    </span>
                    <span className="font-medium">{ks.target}</span>
                    <span className="text-muted-foreground/50">
                      · {ks.trigger}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60 truncate">
                    {ks.reason}
                  </p>
                  <p className="text-[9px] text-muted-foreground/40">
                    {ks.activatedBy} ·{" "}
                    {new Date(ks.activatedAt).toLocaleTimeString()}
                    {ks.expiresAt && (
                      <span>
                        {" "}
                        · expires {new Date(ks.expiresAt).toLocaleTimeString()}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() =>
                    handle("release", {
                      scope: ks.scope,
                      target: ks.target,
                    })
                  }
                  className="ml-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Release"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Recent anomalies */}
        {status && status.recentAnomalies.length > 0 && (
          <div className="mt-3 border-t border-border/30 pt-2">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
              Recent Anomalies
            </p>
            <div className="mt-1 space-y-0.5">
              {status.recentAnomalies.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-[10px] text-muted-foreground/50"
                >
                  <span>{a.key}</span>
                  <span>
                    {a.count}x · {new Date(a.lastAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
