"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  FlaskConical,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Trophy,
  TrendingDown,
} from "lucide-react";
import type { BacktestRun, BacktestResults } from "@/types/backtest";
import type { Strategy } from "@/types/strategy";
import type { Prompt } from "@/types/prompt";

export default function BacktestsPage() {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [strategyId, setStrategyId] = useState("");
  const [promptId, setPromptId] = useState("");
  const [candleCount, setCandleCount] = useState(200);
  const [windowSize, setWindowSize] = useState(50);
  const [stepSize, setStepSize] = useState(10);

  const fetchData = useCallback(async () => {
    try {
      const [runsRes, stratRes, promptRes] = await Promise.all([
        fetch("/api/backtests"),
        fetch("/api/strategies"),
        fetch("/api/prompts"),
      ]);
      if (runsRes.ok) setRuns(await runsRes.json());
      if (stratRes.ok) {
        const s = await stratRes.json();
        setStrategies(s);
        setStrategyId((prev) => (prev || (s.length > 0 ? s[0].id : "")));
      }
      if (promptRes.ok) {
        const p = await promptRes.json();
        setPrompts(p);
        setPromptId((prev) => (prev || (p.length > 0 ? p[0].id : "")));
      }
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRun = async () => {
    if (!strategyId || !promptId) return;
    setRunning(true);
    try {
      const res = await fetch("/api/backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          promptId,
          candleCount,
          windowSize,
          stepSize,
        }),
      });
      if (res.ok) {
        const run: BacktestRun = await res.json();
        setExpandedId(run.id);
      } else {
        const data = await res.json().catch(() => ({ error: "Backtest failed" }));
        setRunError(data.error ?? "Backtest failed");
      }
      await fetchData();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setRunning(false);
    }
  };

  const inputClass =
    "rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Backtests</h2>
          <p className="text-sm text-muted-foreground">
            Test strategies and prompts against historical data
          </p>
        </div>
      </div>

      {/* Config panel */}
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          New Backtest
        </p>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Strategy</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className={cn(inputClass, "w-full")}
            >
              <option value="">Select...</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Prompt</label>
            <select
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              className={cn(inputClass, "w-full")}
            >
              <option value="">Select...</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Candles
            </label>
            <input
              type="number"
              value={candleCount}
              onChange={(e) => setCandleCount(Number(e.target.value))}
              min={50}
              max={500}
              className={cn(inputClass, "w-full")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Window
            </label>
            <input
              type="number"
              value={windowSize}
              onChange={(e) => setWindowSize(Number(e.target.value))}
              min={10}
              max={100}
              className={cn(inputClass, "w-full")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Step
            </label>
            <input
              type="number"
              value={stepSize}
              onChange={(e) => setStepSize(Number(e.target.value))}
              min={1}
              max={50}
              className={cn(inputClass, "w-full")}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            ~{Math.floor((candleCount - windowSize) / stepSize)} analysis
            points · requires Claude API
          </p>
          <button
            onClick={handleRun}
            disabled={running || !strategyId || !promptId}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run Backtest
          </button>
        </div>
      </div>

      {/* Error display */}
      {runError && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {runError}
          <button onClick={() => setRunError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Runs list */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground/50">
            No backtest runs yet
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              expanded={expandedId === run.id}
              onToggle={() =>
                setExpandedId(expandedId === run.id ? null : run.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Run card ────────────────────────────────────────────────

function RunCard({
  run,
  expanded,
  onToggle,
}: {
  run: BacktestRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusStyles = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-primary/10 text-primary",
    completed: "bg-success/10 text-success",
    failed: "bg-danger/10 text-danger",
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium",
              statusStyles[run.status]
            )}
          >
            {run.status}
          </span>
          <div>
            <p className="text-sm font-medium">
              {run.strategyName} + {run.promptName}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {new Date(run.startedAt).toLocaleString()} ·{" "}
              {run.config.instrument} · {run.config.timeframe}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {run.results && (
            <span className="text-xs text-muted-foreground">
              {run.results.tradeCount} trades ·{" "}
              {run.results.winRate != null
                ? `${Math.round(run.results.winRate * 100)}% WR`
                : "—"}
            </span>
          )}
          {run.status === "running" && (
            <span className="text-xs text-primary">{run.progress}%</span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && run.results && (
        <div className="border-t border-border/50 px-5 py-4">
          <ResultsPanel results={run.results} />

          {/* Signals summary */}
          {run.signals.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Signals
              </p>
              <div className="max-h-60 overflow-y-auto rounded border border-border/30">
                {run.signals.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-border/10 px-3 py-1.5 text-xs last:border-0"
                  >
                    <span
                      className={cn(
                        "w-16 shrink-0 font-bold",
                        s.action === "BUY"
                          ? "text-success"
                          : s.action === "SELL"
                            ? "text-danger"
                            : "text-muted-foreground/50"
                      )}
                    >
                      {s.action}
                    </span>
                    <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                      {Math.round(s.confidence * 100)}%
                    </span>
                    <span
                      className={cn(
                        "w-12 shrink-0 font-medium",
                        s.outcome === "win"
                          ? "text-success"
                          : s.outcome === "loss"
                            ? "text-danger"
                            : "text-muted-foreground/40"
                      )}
                    >
                      {s.outcome}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground/60">
                      {s.reasoning}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {expanded && run.error && (
        <div className="border-t border-border/50 px-5 py-4">
          <div className="rounded bg-danger/10 px-3 py-2 text-xs text-danger">
            {run.error}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Results panel ───────────────────────────────────────────

function ResultsPanel({ results }: { results: BacktestResults }) {
  return (
    <div className="space-y-4">
      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Metric label="Trades" value={String(results.tradeCount)} />
        <Metric label="BUY" value={String(results.buyCount)} color="text-success" />
        <Metric label="SELL" value={String(results.sellCount)} color="text-danger" />
        <Metric label="No Trade" value={String(results.noTradeCount)} />
        <Metric
          label="Win Rate"
          value={
            results.winRate != null
              ? `${Math.round(results.winRate * 100)}%`
              : "—"
          }
          color={
            results.winRate != null && results.winRate >= 0.5
              ? "text-success"
              : "text-danger"
          }
          icon={results.winRate != null && results.winRate >= 0.5 ? Trophy : TrendingDown}
        />
        <Metric
          label="Profit Factor"
          value={results.profitFactor != null ? String(results.profitFactor) : "—"}
          color={
            results.profitFactor != null && results.profitFactor >= 1
              ? "text-success"
              : "text-danger"
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Metric label="Wins" value={String(results.wins)} color="text-success" />
        <Metric label="Losses" value={String(results.losses)} color="text-danger" />
        <Metric label="Pending" value={String(results.pending)} />
        <Metric
          label="Avg R:R"
          value={results.avgRR != null ? results.avgRR.toFixed(2) : "—"}
        />
        <Metric label="Max Win Streak" value={String(results.maxConsecutiveWins)} />
        <Metric label="Max Loss Streak" value={String(results.maxConsecutiveLosses)} />
      </div>

      {/* Disclaimers */}
      {results.disclaimers.length > 0 && (
        <div className="rounded-md bg-warning/5 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Disclaimers
          </div>
          <ul className="mt-1 space-y-0.5">
            {results.disclaimers.map((d, i) => (
              <li key={i} className="text-[10px] text-muted-foreground/60">
                · {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon?: typeof Trophy;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] text-muted-foreground/50">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground/40" />}
        <p className={cn("text-sm font-bold tabular-nums", color ?? "text-foreground/80")}>
          {value}
        </p>
      </div>
    </div>
  );
}
