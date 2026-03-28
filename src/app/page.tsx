"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, TrendingUp, Ban, Target, Loader2 } from "lucide-react";
import {
  ConnectionCard,
  LastSignalCard,
  MarketBiasCard,
  StrategyEngineCard,
  MetricCard,
  ActivityFeed,
  KeyLevelsCard,
  AlertsCard,
} from "@/components/dashboard";
import { MockDataBanner } from "@/components/shared/mock-data-banner";
import type { Signal } from "@/types/signal";

interface DashboardData {
  // Connections
  connections: Array<{
    provider: string;
    status: string;
    isEnabled: boolean;
  }>;
  // Signals
  signals: Signal[];
  // Strategies
  strategies: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  // Engine
  engineStats: {
    totalRuns: number;
    signalsGenerated: number;
    filteredOut: number;
    errors: number;
    lastSignalAt: string | null;
  } | null;
  // Health
  health: {
    status: string;
    uptime: string;
  } | null;
  // Logs (recent)
  recentLogs: Array<{
    id: string;
    module: string;
    level: string;
    message: string;
    timestamp: string;
  }>;
}

const PROVIDER_NAMES: Record<string, { name: string; description: string }> = {
  databento: { name: "Databento", description: "Market data feed" },
  claude: { name: "Claude API", description: "AI analysis engine" },
  tradovate: { name: "Tradovate", description: "Broker & execution" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const [connRes, sigRes, stratRes, engineRes, healthRes, logsRes] = await Promise.all([
        fetch("/api/connections").then((r) => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/signals").then((r) => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/strategies").then((r) => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/engine/status").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/health").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/logs?limit=10").then((r) => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
      ]);

      setData({
        connections: connRes,
        signals: sigRes,
        strategies: stratRes,
        engineStats: engineRes?.stats ?? null,
        health: healthRes ? { status: healthRes.status, uptime: healthRes.uptime } : null,
        recentLogs: logsRes.logs ?? [],
      });
    } catch {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Derived metrics
  const todaySignals = data?.signals.filter((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s.createdAt.startsWith(today);
  }) ?? [];

  const todayTrades = todaySignals.filter((s) => s.action !== "NO_TRADE");
  const todayNoTrades = todaySignals.filter((s) => s.action === "NO_TRADE");
  const latestSignal = todaySignals[0] ?? null;

  const activeStrategies = data?.strategies.filter((s) => s.isActive) ?? [];
  const activeStrategy = activeStrategies[0];

  // Connection status mapping
  const getConnStatus = (provider: string): "connected" | "disconnected" | "idle" => {
    const conn = data?.connections.find((c: { provider: string; status: string }) => c.provider === provider);
    if (!conn) return "idle";
    if (conn.status === "connected") return "connected";
    if (conn.status === "error") return "disconnected";
    return "idle";
  };

  const getConnDetail = (provider: string): string => {
    const conn = data?.connections.find((c: { provider: string; status: string }) => c.provider === provider);
    if (!conn || conn.status === "untested") return "Configure in API Connections";
    if (conn.status === "connected") return "Connected";
    if (conn.status === "error") return "Connection error";
    return "Not configured";
  };

  // Alerts
  const alerts: Array<{ id: string; severity: "info" | "warning" | "error"; message: string }> = [];
  if (!data?.connections.find((c: { provider: string; status: string }) => c.provider === "databento" && c.status === "connected")) {
    alerts.push({ id: "db", severity: "info", message: "Databento not connected — using mock market data" });
  }
  if (!data?.connections.find((c: { provider: string; status: string }) => c.provider === "claude" && c.status === "connected")) {
    alerts.push({ id: "cl", severity: "warning", message: "Claude API not configured — signal generation unavailable" });
  }
  if (activeStrategies.length === 0) {
    alerts.push({ id: "st", severity: "info", message: "No active strategy — create one in Strategies" });
  }
  if ((data?.engineStats?.errors ?? 0) > 5) {
    alerts.push({ id: "err", severity: "error", message: `${data?.engineStats?.errors} engine errors in recent history` });
  }

  // Key levels (empty until market data connected)
  const levelEntries: Array<{ label: string; price: number; type: "resistance" | "support" | "pivot" }> = [];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MockDataBanner />

      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={fetchDashboard} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Row 1: Connection Status */}
      <div className="grid gap-4 sm:grid-cols-3">
        {["databento", "claude", "tradovate"].map((provider) => (
          <ConnectionCard
            key={provider}
            name={PROVIDER_NAMES[provider].name}
            description={PROVIDER_NAMES[provider].description}
            status={getConnStatus(provider)}
            detail={getConnDetail(provider)}
          />
        ))}
      </div>

      {/* Row 2: Signal + Bias + Engine */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LastSignalCard action={latestSignal?.action ?? null} />
        </div>
        <div className="space-y-4">
          <MarketBiasCard bias={null} />
          <StrategyEngineCard
            isRunning={(data?.engineStats?.totalRuns ?? 0) > 0}
            activeStrategy={activeStrategy?.name}
          />
        </div>
      </div>

      {/* Row 3: Live Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Signals Today"
          value={String(todaySignals.length)}
          icon={Zap}
          subtitle={todayTrades.length > 0 ? `${todayTrades.length} trades` : "No signals yet"}
        />
        <MetricCard
          label="Win Rate"
          value="—"
          icon={TrendingUp}
          subtitle="Requires outcome tracking"
        />
        <MetricCard
          label="No Trade"
          value={String(todayNoTrades.length)}
          icon={Ban}
          subtitle={todayNoTrades.length > 0 ? "Filtered / low confidence" : "None skipped"}
        />
        <MetricCard
          label="Active Setups"
          value={String(activeStrategies.length)}
          icon={Target}
          subtitle={activeStrategy ? activeStrategy.name : "No strategy active"}
        />
      </div>

      {/* Row 4: Activity + Levels + Alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityFeed
          items={data?.recentLogs.map((l) => ({
            id: l.id,
            message: `[${l.module}] ${l.message}`,
            timestamp: l.timestamp,
            type: l.level === "error" ? "error" as const : l.module === "engine" ? "signal" as const : "system" as const,
          })) ?? []}
        />
        <KeyLevelsCard levels={levelEntries} />
        <AlertsCard alerts={alerts} />
      </div>

      {/* Refresh indicator */}
      <p className="text-center text-[10px] text-muted-foreground/30">
        Auto-refreshes every 30s · {data?.health?.uptime ? `Uptime: ${data.health.uptime}` : ""}
      </p>
    </div>
  );
}
