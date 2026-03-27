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
import type { UnifiedExecutionState, ExecutionMode } from "@/types/execution";
import { AccountPanel } from "@/components/execution/account-panel";
import { PositionsTable } from "@/components/execution/positions-table";
import { OrdersTable } from "@/components/execution/orders-table";
import { ModeSelector } from "@/components/execution/mode-selector";

export default function ExecutionPage() {
  const [state, setState] = useState<UnifiedExecutionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/execution");
      if (res.ok) setState(await res.json());
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Play className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Execution</h2>
            <p className="text-sm text-muted-foreground">
              Tradovate connection and order management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
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

          {/* Row 2: Positions */}
          <PositionsTable positions={state?.positions ?? []} />

          {/* Row 3: Orders */}
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
