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
  Wand2,
  Check,
  ArrowRight,
} from "lucide-react";
import type { BacktestRun, BacktestResults } from "@/types/backtest";
import type { Strategy } from "@/types/strategy";
import type { Prompt } from "@/types/prompt";

interface OptimizationResult {
  analysis: string;
  changes: { strategy?: Record<string, string>; prompt?: Record<string, string> };
  changesSummary: string[];
  isOptimal: boolean;
  confidenceInChanges: number;
  recommendation: string;
  applied: boolean;
}

export default function BacktestsPage() {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationLog, setOptimizationLog] = useState<OptimizationResult[]>([]);
  const [autoOptimizeRunning, setAutoOptimizeRunning] = useState(false);

  // Form state
  const [strategyId, setStrategyId] = useState("");
  const [promptId, setPromptId] = useState("");
  const [candleCount, setCandleCount] = useState(200);
  const [windowSize, setWindowSize] = useState(50);
  const [stepSize, setStepSize] = useState(10);
  const [initialCapital, setInitialCapital] = useState(50000);
  const [contractSize, setContractSize] = useState(1);
  const [pointValue, setPointValue] = useState(20);
  const [commissionPerTrade, setCommissionPerTrade] = useState(4.5);

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
    } catch {
      setFetchError("Failed to load backtests data");
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
          strategyId, promptId, candleCount, windowSize, stepSize,
          initialCapital, contractSize, pointValue, commissionPerTrade,
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

  // ─── Single optimization round ─────────────────────────────
  const handleOptimize = async (run: BacktestRun, autoApply = false) => {
    if (!run.results) return;
    setOptimizing(true);
    try {
      const res = await fetch("/api/backtests/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: run.config.strategyId,
          promptId: run.config.promptId,
          results: run.results,
          iteration: optimizationLog.length + 1,
          autoApply,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Optimization failed");
      }
      const result: OptimizationResult = await res.json();
      setOptimizationLog((prev) => [...prev, result]);
      return result;
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Optimization failed");
      return null;
    } finally {
      setOptimizing(false);
    }
  };

  // ─── Auto-optimize loop: backtest → analyze → adjust → repeat ─
  const handleAutoOptimize = async () => {
    if (!strategyId || !promptId) return;
    setAutoOptimizeRunning(true);
    setOptimizationLog([]);
    setRunError(null);

    const MAX_ITERATIONS = 5;
    let prevWinRate: number | null = null;
    let prevProfitFactor: number | null = null;
    const allChanges: string[] = [];
    let degradationCount = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // 1. Run backtest
      setRunning(true);
      let run: BacktestRun | null = null;
      try {
        const res = await fetch("/api/backtests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategyId, promptId, candleCount, windowSize, stepSize, initialCapital, contractSize, pointValue, commissionPerTrade }),
        });
        if (res.ok) run = await res.json();
      } catch { /* handled below */ }
      setRunning(false);

      if (!run?.results) {
        setRunError(`Iteration ${i + 1}: backtest failed`);
        break;
      }

      setExpandedId(run.id);
      await fetchData();

      const wr = run.results.winRate;
      const pf = run.results.profitFactor;

      // 2. Check if already profitable
      if (wr != null && wr >= 0.55 && pf != null && pf >= 1.5) {
        setOptimizationLog((prev) => [...prev, {
          analysis: `Strategy is profitable (${(wr * 100).toFixed(0)}% WR, ${pf.toFixed(1)} PF). No further optimization needed.`,
          changes: {},
          changesSummary: ["Strategy meets profitability targets"],
          isOptimal: true,
          confidenceInChanges: 1,
          recommendation: "Strategy is ready for paper trading",
          applied: false,
        }]);
        break;
      }

      // 3. Check for degradation — if results got worse 2x in a row, stop
      if (i > 0 && prevWinRate != null && wr != null && wr < prevWinRate - 0.05) {
        degradationCount++;
        if (degradationCount >= 2) {
          setOptimizationLog((prev) => [...prev, {
            analysis: `Results degraded for 2 consecutive rounds (${(prevWinRate! * 100).toFixed(0)}% → ${(wr * 100).toFixed(0)}% WR). Stopping to prevent further damage.`,
            changes: {},
            changesSummary: ["Auto-optimize stopped — manual review recommended"],
            isOptimal: false,
            confidenceInChanges: 0,
            recommendation: "Review the strategy manually. The auto-optimizer reached its limit.",
            applied: false,
          }]);
          break;
        }
      } else {
        degradationCount = 0;
      }

      // 4. Ask Claude to optimize (auto-apply changes)
      setOptimizing(true);
      try {
        const res = await fetch("/api/backtests/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strategyId: run.config.strategyId,
            promptId: run.config.promptId,
            results: run.results,
            iteration: i + 1,
            autoApply: true,
            previousResults: prevWinRate != null ? { winRate: prevWinRate, profitFactor: prevProfitFactor } : undefined,
            previousChanges: allChanges.length > 0 ? allChanges : undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Optimization failed");
        }
        const opt: OptimizationResult = await res.json();
        setOptimizationLog((prev) => [...prev, opt]);

        // Track changes for next iteration
        if (opt.changesSummary) {
          allChanges.push(...opt.changesSummary);
        }

        if (opt.isOptimal) break;
      } catch (err) {
        setRunError(err instanceof Error ? err.message : "Optimization failed");
        break;
      } finally {
        setOptimizing(false);
      }

      // Track previous results for comparison
      prevWinRate = wr;
      prevProfitFactor = pf;

      // Delay between iterations (avoid API spam)
      await new Promise((r) => setTimeout(r, 2000));
    }

    await fetchData();
    setAutoOptimizeRunning(false);
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

        {/* Capital simulation */}
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Initial Capital ($)</label>
            <input type="number" value={initialCapital} onChange={(e) => setInitialCapital(Number(e.target.value))} min={1000} className={cn(inputClass, "w-full")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Contracts</label>
            <input type="number" value={contractSize} onChange={(e) => setContractSize(Number(e.target.value))} min={1} max={100} className={cn(inputClass, "w-full")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">$/Point (NQ=20, MNQ=2)</label>
            <input type="number" value={pointValue} onChange={(e) => setPointValue(Number(e.target.value))} min={0.1} step={0.1} className={cn(inputClass, "w-full")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Commission/Trade ($)</label>
            <input type="number" value={commissionPerTrade} onChange={(e) => setCommissionPerTrade(Number(e.target.value))} min={0} step={0.5} className={cn(inputClass, "w-full")} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            ~{Math.floor((candleCount - windowSize) / stepSize)} analysis
            points · ${initialCapital.toLocaleString()} capital · {contractSize} contract{contractSize > 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoOptimize}
              disabled={autoOptimizeRunning || running || !strategyId || !promptId}
              className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {autoOptimizeRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {autoOptimizeRunning ? "Optimizing..." : "Auto-Optimize"}
            </button>
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
      </div>

      {/* Error display */}
      {(fetchError || runError) && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {fetchError || runError}
          <button onClick={() => { setFetchError(null); setRunError(null); fetchData(); }} className="ml-2 underline">
            {fetchError ? "Retry" : "Dismiss"}
          </button>
        </div>
      )}

      {/* Optimization log */}
      {optimizationLog.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium">
                  Optimization Log ({optimizationLog.length} rounds)
                </p>
              </div>
              <button
                onClick={() => setOptimizationLog([])}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
            {optimizationLog.map((opt, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                    {i + 1}
                  </span>
                  {opt.isOptimal ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Check className="h-3 w-3" /> Optimal
                    </span>
                  ) : opt.applied ? (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <ArrowRight className="h-3 w-3" /> Applied
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Proposed</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/50">
                    Confidence: {Math.round(opt.confidenceInChanges * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-foreground/70">{opt.analysis}</p>
                {opt.changesSummary.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {opt.changesSummary.map((c, j) => (
                      <li key={j} className="text-[10px] text-muted-foreground">
                        · {c}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1.5 text-[10px] font-medium text-primary/70">
                  {opt.recommendation}
                </p>
              </div>
            ))}
          </div>
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
              onOptimize={run.results ? () => handleOptimize(run, false) : undefined}
              optimizing={optimizing}
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
  onOptimize,
  optimizing,
}: {
  run: BacktestRun;
  expanded: boolean;
  onToggle: () => void;
  onOptimize?: () => void;
  optimizing?: boolean;
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

          {/* Optimize button */}
          {onOptimize && (
            <div className="mt-3">
              <button
                onClick={onOptimize}
                disabled={optimizing}
                className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {optimizing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Ask Claude to Optimize
              </button>
            </div>
          )}

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
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const fm = results.fundingMetrics;

  return (
    <div className="space-y-4">
      {/* Row 1: P&L headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Net Profit"
          value={fmt(results.netProfit)}
          color={results.netProfit >= 0 ? "text-success" : "text-danger"}
        />
        <Metric
          label="Return"
          value={`${results.netProfitPercent >= 0 ? "+" : ""}${results.netProfitPercent}%`}
          color={results.netProfitPercent >= 0 ? "text-success" : "text-danger"}
        />
        <Metric
          label="Max Drawdown"
          value={`${fmt(results.maxDrawdown)} (${results.maxDrawdownPercent}%)`}
          color="text-danger"
        />
        <Metric
          label="Max Daily DD"
          value={`${fmt(results.maxDailyDrawdown)} (${results.maxDailyDrawdownPercent.toFixed(1)}%)`}
          color="text-danger"
        />
      </div>

      {/* Row 2: Trading stats */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Metric label="Trades" value={String(results.tradeCount)} />
        <Metric label="Wins" value={String(results.wins)} color="text-success" />
        <Metric label="Losses" value={String(results.losses)} color="text-danger" />
        <Metric
          label="Win Rate"
          value={results.winRate != null ? `${Math.round(results.winRate * 100)}%` : "—"}
          color={results.winRate != null && results.winRate >= 0.5 ? "text-success" : "text-danger"}
          icon={results.winRate != null && results.winRate >= 0.5 ? Trophy : TrendingDown}
        />
        <Metric
          label="Profit Factor"
          value={results.profitFactor != null ? String(results.profitFactor) : "—"}
          color={results.profitFactor != null && results.profitFactor >= 1 ? "text-success" : "text-danger"}
        />
        <Metric label="Avg R:R" value={results.avgRR != null ? results.avgRR.toFixed(2) : "—"} />
      </div>

      {/* Row 3: Capital details */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Metric label="Initial Capital" value={fmt(results.initialCapital)} />
        <Metric label="Final Capital" value={fmt(results.finalCapital)} color={results.finalCapital >= results.initialCapital ? "text-success" : "text-danger"} />
        <Metric label="Commissions" value={fmt(results.totalCommissions)} />
        <Metric label="Max Win Streak" value={String(results.maxConsecutiveWins)} />
        <Metric label="Max Loss Streak" value={String(results.maxConsecutiveLosses)} />
        <Metric label="No Trade" value={String(results.noTradeCount)} />
      </div>

      {/* Equity curve */}
      {results.equityCurve && results.equityCurve.length > 1 && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Equity Curve
          </p>
          <div className="h-40">
            <EquityChart curve={results.equityCurve} initialCapital={results.initialCapital} />
          </div>
        </div>
      )}

      {/* Funding firm compatibility */}
      {fm && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Funding Firm Evaluation
          </p>
          <div className="grid grid-cols-3 gap-3">
            <FundingBadge label="50K Eval" passes={fm.passes50kEval} maxDD="$2,500" maxDailyDD="$1,250" />
            <FundingBadge label="100K Eval" passes={fm.passes100kEval} maxDD="$3,000" maxDailyDD="$1,500" />
            <FundingBadge label="150K Eval" passes={fm.passes150kEval} maxDD="$4,500" maxDailyDD="$2,250" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Trading Days" value={String(fm.tradingDays)} />
            <Metric label="Profitable Days" value={String(fm.profitableDays)} color={fm.profitableDays > fm.tradingDays / 2 ? "text-success" : "text-danger"} />
            <Metric label="Consistency" value={`${fm.consistencyScore}%`} color={fm.consistencyScore < 40 ? "text-success" : "text-warning"} />
            <Metric label="Avg Daily P&L" value={fmt(fm.avgDailyPnL)} color={fm.avgDailyPnL >= 0 ? "text-success" : "text-danger"} />
          </div>
        </div>
      )}

      {/* Disclaimers */}
      {results.disclaimers.length > 0 && (
        <div className="rounded-md bg-warning/5 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Disclaimers
          </div>
          <ul className="mt-1 space-y-0.5">
            {results.disclaimers.map((d, i) => (
              <li key={i} className="text-[10px] text-muted-foreground/60">· {d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Equity curve chart (pure CSS — no chart library needed) ──

function EquityChart({ curve, initialCapital }: { curve: BacktestResults["equityCurve"]; initialCapital: number }) {
  if (curve.length < 2) return null;

  const equities = curve.map((p) => p.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  const range = max - min || 1;

  // Build SVG polyline points
  const width = 800;
  const height = 140;
  const points = curve
    .map((p, i) => {
      const x = (i / (curve.length - 1)) * width;
      const y = height - ((p.equity - min) / range) * (height - 10) - 5;
      return `${x},${y}`;
    })
    .join(" ");

  // Baseline (initial capital)
  const baselineY = height - ((initialCapital - min) / range) * (height - 10) - 5;

  const lastEquity = equities[equities.length - 1];
  const lineColor = lastEquity >= initialCapital ? "#22c55e" : "#ef4444";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      {/* Baseline */}
      <line x1="0" y1={baselineY} x2={width} y2={baselineY} stroke="rgba(100,100,120,0.2)" strokeDasharray="4" />
      {/* Equity line */}
      <polyline fill="none" stroke={lineColor} strokeWidth="2" points={points} />
      {/* Fill below line */}
      <polygon
        fill={lastEquity >= initialCapital ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"}
        points={`0,${height} ${points} ${width},${height}`}
      />
    </svg>
  );
}

// ─── Funding badge ───────────────────────────────────────────

function FundingBadge({ label, passes, maxDD, maxDailyDD }: { label: string; passes: boolean; maxDD: string; maxDailyDD: string }) {
  return (
    <div className={cn(
      "rounded-lg border p-3 text-center",
      passes ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"
    )}>
      <p className={cn("text-sm font-bold", passes ? "text-success" : "text-danger")}>
        {passes ? "PASS" : "FAIL"}
      </p>
      <p className="text-xs font-medium mt-0.5">{label}</p>
      <p className="text-[9px] text-muted-foreground/50 mt-1">
        Max DD: {maxDD} · Daily: {maxDailyDD}
      </p>
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
