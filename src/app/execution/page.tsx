"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Play,
  RefreshCw,
  Loader2,
  TestTube,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { UnifiedExecutionState, ExecutionMode, ProposedOrder } from "@/types/execution";
import { AccountPanel } from "@/components/execution/account-panel";
import { PositionsTable } from "@/components/execution/positions-table";
import { OrdersTable } from "@/components/execution/orders-table";
import { ModeSelector } from "@/components/execution/mode-selector";
import { OrderQueue } from "@/components/execution/order-queue";
import { RiskPanel } from "@/components/execution/risk-panel";

export default function ExecutionPage() {
  const [state, setState] = useState<UnifiedExecutionState | null>(null);
  const [riskStatus, setRiskStatus] = useState<Record<string, unknown> | null>(null);
  const [queueOrders, setQueueOrders] = useState<ProposedOrder[]>([]);
  const [queueStats, setQueueStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, queueRes, riskRes] = await Promise.all([
        fetch("/api/execution"),
        fetch("/api/execution/queue"),
        fetch("/api/execution/risk"),
      ]);
      if (stateRes.ok) setState(await stateRes.json());
      if (queueRes.ok) {
        const q = await queueRes.json();
        setQueueOrders(q.queue ?? []);
        setQueueStats(q.stats ?? {});
      }
      if (riskRes.ok) {
        const r = await riskRes.json();
        setRiskStatus(r.status ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch execution state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleModeChange = async (mode: ExecutionMode) => {
    await fetch("/api/execution/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    await fetchState();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/execution/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
      await fetchState();
    } catch {
      setTestResult({ ok: false, message: "Test request failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleRiskAction = async (
    action: string,
    payload?: Record<string, string>
  ) => {
    try {
      const res = await fetch("/api/execution/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTestResult({ ok: false, message: data.error ?? "Risk action failed" });
      }
      await fetchState();
    } catch {
      setTestResult({ ok: false, message: "Risk action failed — connection error" });
    }
  };

  const handleQueueAction = async (
    id: string,
    action: string,
    reason?: string
  ) => {
    try {
      const res = await fetch(`/api/execution/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTestResult({ ok: false, message: data.error ?? "Queue action failed" });
      }
      await fetchState();
    } catch {
      setTestResult({ ok: false, message: "Queue action failed — connection error" });
    }
  };

  const pendingCount = queueStats.pending ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Play className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              Execution
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              Order management, approval queue, and provider control
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
            {state?.activeProvider ? (
              <Wifi className="h-3.5 w-3.5 text-success" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {state?.activeProvider ?? "No provider"} ·{" "}
              {state?.accounts[0]?.environment ?? "—"}
            </span>
          </div>

          <button
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <TestTube className="h-3.5 w-3.5" />
            )}
            Test
          </button>

          <button
            onClick={() => {
              setLoading(true);
              fetchState();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={cn(
            "rounded-md px-4 py-2.5 text-sm",
            testResult.ok
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
          )}
        >
          {testResult.message}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Row 1: Mode + Account */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ModeSelector
              mode={state?.mode ?? "monitor"}
              onChange={handleModeChange}
            />
            <AccountPanel account={state?.accounts[0] ?? null} />
          </div>

          {/* Row 2: Risk Control */}
          <RiskPanel
            status={riskStatus as React.ComponentProps<typeof RiskPanel>["status"]}
            onAction={handleRiskAction}
          />

          {/* Row 3: Approval Queue */}
          <OrderQueue orders={queueOrders} onAction={handleQueueAction} />

          {/* Row 3: Live Positions */}
          <PositionsTable positions={state?.positions ?? []} />

          {/* Row 4: Broker Orders */}
          <OrdersTable orders={state?.orders ?? []} />

          {/* Last updated */}
          {state?.lastUpdated && (
            <p className="text-center text-[10px] text-muted-foreground/40">
              Last updated: {new Date(state.lastUpdated).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}
