"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Strategy } from "@/types/strategy";
import type { Prompt } from "@/types/prompt";
import type { PolyBacktestRun, PolyBacktestConfig } from "@/types/poly-backtest";
import {
  TrendingUp,
  Search,
  Loader2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BarChart3,
  FlaskConical,
  Trophy,
  TrendingDown,
} from "lucide-react";

interface Market {
  id: string;
  question: string;
  slug: string;
  volume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  closed: boolean;
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
  outcomePrices?: string;
  outcomes?: string;
  clobTokenIds?: string;
}

interface PriceHistory {
  t: number;
  p: number;
}

export default function PolymarketPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [backtestRun, setBacktestRun] = useState<PolyBacktestRun | null>(null);
  const [backtesting, setBacktesting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/strategies").then((r) => r.ok ? r.json() : []),
      fetch("/api/prompts").then((r) => r.ok ? r.json() : []),
    ]).then(([s, p]) => { setStrategies(s); setPrompts(p); }).catch(() => {});
  }, []);

  const runBacktest = async (market: Market) => {
    const tokenId = getTokenId(market);
    if (!tokenId || strategies.length === 0 || prompts.length === 0) return;
    setBacktesting(true);
    setBacktestRun(null);
    try {
      const res = await fetch("/api/polymarket/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: strategies.find((s) => s.isActive)?.id ?? strategies[0]?.id,
          promptId: prompts.find((p) => p.isActive)?.id ?? prompts[0]?.id,
          marketId: market.slug ?? market.id,
          tokenId,
          marketQuestion: market.question,
          initialCapital: 1000,
          positionSizePercent: 20,
          entryThreshold: 0.40,
          exitThreshold: 0.70,
          stopLoss: 0.10,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Backtest failed");
      }
      setBacktestRun(await res.json());
    } catch (err) {
      setBacktestRun({ id: "", config: {} as PolyBacktestConfig, status: "failed", results: null, error: err instanceof Error ? err.message : "Failed", startedAt: "", completedAt: null } as PolyBacktestRun);
    } finally {
      setBacktesting(false);
    }
  };

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: "markets", limit: "50" });
      if (search) params.set("q", search);
      const res = await fetch(`/api/polymarket?${params}`);
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      setMarkets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const fetchHistory = async (tokenId: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/polymarket?action=history&token_id=${tokenId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history ?? data ?? []);
      }
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleExpand = (market: Market) => {
    if (expandedId === market.id) {
      setExpandedId(null);
      setHistory([]);
      return;
    }
    setExpandedId(market.id);
    // Get token ID for price history
    const tokenId = getTokenId(market);
    if (tokenId) fetchHistory(tokenId);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Polymarket</h2>
            <p className="text-sm text-muted-foreground">
              Live prediction markets — public data, no API key needed
            </p>
          </div>
        </div>
        <button
          onClick={fetchMarkets}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchMarkets()}
          placeholder="Search markets (press Enter)..."
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground/30 focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={fetchMarkets} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Markets */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : markets.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground/50">No markets found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {markets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              expanded={expandedId === market.id}
              onToggle={() => toggleExpand(market)}
              history={expandedId === market.id ? history : []}
              historyLoading={expandedId === market.id && historyLoading}
              onBacktest={() => runBacktest(market)}
              backtesting={expandedId === market.id && backtesting}
              backtestRun={expandedId === market.id ? backtestRun : null}
              hasStrategies={strategies.length > 0 && prompts.length > 0}
            />
          ))}
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground/30">
        Data from Polymarket Gamma & CLOB APIs · Public · No API key required
      </p>
    </div>
  );
}

// ─── Market card ─────────────────────────────────────────────

function MarketCard({
  market,
  expanded,
  onToggle,
  history,
  historyLoading,
  onBacktest,
  backtesting,
  backtestRun,
  hasStrategies,
}: {
  market: Market;
  expanded: boolean;
  onToggle: () => void;
  history: PriceHistory[];
  historyLoading: boolean;
  onBacktest: () => void;
  backtesting: boolean;
  backtestRun: PolyBacktestRun | null;
  hasStrategies: boolean;
}) {
  const prices = parsePrices(market);
  const volume = market.volume ?? 0;
  const liquidity = market.liquidity ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <div className="min-w-0 flex-1 pr-4">
          <p className="text-sm font-medium leading-snug">{market.question}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/60">
            <span>Vol: ${formatNum(volume)}</span>
            <span>Liq: ${formatNum(liquidity)}</span>
            {market.endDate && (
              <span>Ends: {new Date(market.endDate).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Outcome prices */}
          {prices.map((p, i) => (
            <div key={i} className="text-right">
              <p className={cn(
                "text-sm font-bold tabular-nums",
                p.price >= 0.5 ? "text-success" : "text-danger"
              )}>
                {Math.round(p.price * 100)}¢
              </p>
              <p className="text-[9px] text-muted-foreground/50 max-w-[80px] truncate">
                {p.outcome}
              </p>
            </div>
          ))}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          {/* Price chart */}
          {historyLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : history.length > 0 ? (
            <div className="rounded-md border border-border/50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="h-3 w-3 text-muted-foreground/50" />
                <span className="text-[10px] text-muted-foreground/50">Price History</span>
              </div>
              <MiniChart data={history} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/40">No price history available</p>
          )}

          {/* Token IDs for trading */}
          {prices.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground/50 mb-1">Token IDs (for trading)</p>
              <div className="space-y-1">
                {prices.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded bg-muted/30 px-2 py-1">
                    <span className="text-[10px] text-muted-foreground">{p.outcome}</span>
                    <code className="text-[9px] font-mono text-foreground/50 max-w-[200px] truncate">{p.tokenId}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Backtest */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBacktest}
              disabled={backtesting || !hasStrategies}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {backtesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
              {backtesting ? "Running..." : "Backtest with AI"}
            </button>
            <a
              href={`https://polymarket.com/event/${market.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              View on Polymarket <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {!hasStrategies && (
            <p className="text-[10px] text-muted-foreground/50">Create a strategy and prompt first to run backtests</p>
          )}

          {/* Backtest results */}
          {backtestRun?.status === "failed" && (
            <div className="rounded bg-danger/10 px-3 py-2 text-xs text-danger">{backtestRun.error}</div>
          )}
          {backtestRun?.results && (
            <div className="rounded-lg border border-border/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">Backtest Results</span>
              </div>

              <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
                <MiniMetric label="Net Profit" value={`$${backtestRun.results.netProfit.toFixed(2)}`} color={backtestRun.results.netProfit >= 0 ? "text-success" : "text-danger"} />
                <MiniMetric label="Return" value={`${backtestRun.results.netProfitPercent}%`} color={backtestRun.results.netProfitPercent >= 0 ? "text-success" : "text-danger"} />
                <MiniMetric label="Win Rate" value={backtestRun.results.winRate != null ? `${Math.round(backtestRun.results.winRate * 100)}%` : "—"} color={backtestRun.results.winRate != null && backtestRun.results.winRate >= 0.5 ? "text-success" : "text-danger"} icon={backtestRun.results.winRate != null && backtestRun.results.winRate >= 0.5 ? Trophy : TrendingDown} />
                <MiniMetric label="Trades" value={String(backtestRun.results.trades)} />
                <MiniMetric label="Max DD" value={`$${backtestRun.results.maxDrawdown.toFixed(2)}`} color="text-danger" />
                <MiniMetric label="PF" value={backtestRun.results.profitFactor?.toFixed(2) ?? "—"} />
              </div>

              {/* Mini equity curve */}
              {backtestRun.results.equityCurve.length > 1 && (
                <MiniChart data={backtestRun.results.equityCurve.map((p) => ({ t: 0, p: p.equity / backtestRun.results!.initialCapital }))} />
              )}

              {/* Signal list */}
              {backtestRun.results.signals.filter((s) => s.action !== "NO_TRADE").length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded border border-border/30">
                  {backtestRun.results.signals.filter((s) => s.action !== "NO_TRADE").map((s, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-border/10 px-2 py-1 text-[10px] last:border-0">
                      <span className={cn("w-14 font-bold", s.action === "BUY_YES" ? "text-success" : "text-danger")}>{s.action}</span>
                      <span className="w-10 tabular-nums">{(s.price * 100).toFixed(0)}¢</span>
                      <span className={cn("w-14 font-medium", s.outcome === "profit" ? "text-success" : s.outcome === "loss" ? "text-danger" : "text-muted-foreground/40")}>{s.outcome}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground/50">{s.reasoning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mini SVG chart ──────────────────────────────────────────

function MiniChart({ data }: { data: PriceHistory[] }) {
  if (data.length < 2) return null;

  const prices = data.map((d) => d.p);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 0.01;
  const w = 600;
  const h = 80;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.p - min) / range) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  const last = prices[prices.length - 1];
  const first = prices[0];
  const color = last >= first ? "#22c55e" : "#ef4444";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      <polygon
        fill={last >= first ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"}
        points={`0,${h} ${points} ${w},${h}`}
      />
    </svg>
  );
}

// ─── Mini metric ─────────────────────────────────────────────

function MiniMetric({ label, value, color, icon: Icon }: { label: string; value: string; color?: string; icon?: typeof Trophy }) {
  return (
    <div className="rounded bg-muted/20 px-2 py-1.5">
      <p className="text-[9px] text-muted-foreground/50">{label}</p>
      <div className="flex items-center gap-1">
        {Icon && <Icon className="h-2.5 w-2.5 text-muted-foreground/40" />}
        <p className={cn("text-xs font-bold tabular-nums", color ?? "text-foreground/80")}>{value}</p>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function getTokenId(market: Market): string | null {
  if (market.tokens?.[0]?.token_id) return market.tokens[0].token_id;
  if (market.clobTokenIds) {
    try {
      const ids = JSON.parse(market.clobTokenIds);
      return ids[0] ?? null;
    } catch { return null; }
  }
  return null;
}

function parsePrices(market: Market): Array<{ outcome: string; price: number; tokenId: string }> {
  const results: Array<{ outcome: string; price: number; tokenId: string }> = [];

  if (market.tokens && market.tokens.length > 0) {
    for (const t of market.tokens) {
      results.push({ outcome: t.outcome, price: t.price, tokenId: t.token_id });
    }
    return results;
  }

  // Parse from string fields
  let outcomes: string[] = [];
  let prices: number[] = [];
  let tokenIds: string[] = [];

  try { if (market.outcomes) outcomes = JSON.parse(market.outcomes); } catch { /* */ }
  try { if (market.outcomePrices) prices = JSON.parse(market.outcomePrices).map(Number); } catch { /* */ }
  try { if (market.clobTokenIds) tokenIds = JSON.parse(market.clobTokenIds); } catch { /* */ }

  for (let i = 0; i < Math.max(outcomes.length, prices.length); i++) {
    results.push({
      outcome: outcomes[i] ?? `Outcome ${i + 1}`,
      price: prices[i] ?? 0,
      tokenId: tokenIds[i] ?? "",
    });
  }

  return results;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}
