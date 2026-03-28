import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRawCredentials } from "@/lib/services/connections";

export const maxDuration = 300;
import { getStrategy } from "@/lib/services/strategies";
import { getPrompt } from "@/lib/services/prompts";
import { log } from "@/lib/logger";
import { extractJsonFromResponse } from "@/lib/json-extract";
import type {
  PolyBacktestConfig,
  PolyBacktestResults,
  PolyBacktestSignal,
  PolyPricePoint,
} from "@/types/poly-backtest";

const CLOB_BASE = "https://clob.polymarket.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = body as PolyBacktestConfig;

    if (!config.tokenId || !config.strategyId || !config.promptId) {
      return NextResponse.json({ error: "tokenId, strategyId, and promptId required" }, { status: 400 });
    }

    const strategy = await getStrategy(config.strategyId);
    if (!strategy) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });

    const prompt = await getPrompt(config.promptId);
    if (!prompt) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });

    const creds = await getRawCredentials("claude");
    if (!creds?.apiKey) return NextResponse.json({ error: "Claude API key required" }, { status: 401 });

    // 1. Fetch price history from Polymarket
    const histRes = await fetch(
      `${CLOB_BASE}/prices-history?market=${config.tokenId}&interval=all&fidelity=60`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!histRes.ok) throw new Error(`Failed to fetch price history: ${histRes.status}`);
    const histData = await histRes.json();
    const priceHistory: PolyPricePoint[] = (histData.history ?? histData ?? []).map(
      (p: { t: number; p: number }) => ({ timestamp: p.t, price: p.p })
    );

    if (priceHistory.length < 10) {
      return NextResponse.json({ error: "Not enough price history for backtest" }, { status: 400 });
    }

    log.engine.info(`Polymarket backtest: ${priceHistory.length} data points for ${config.marketQuestion}`);

    // 2. Run backtest with AI analysis at intervals
    const client = new Anthropic({ apiKey: creds.apiKey as string });
    const windowSize = 20;
    const stepSize = Math.max(5, Math.floor(priceHistory.length / 30)); // ~30 analysis points
    const signals: PolyBacktestSignal[] = [];

    let capital = config.initialCapital;
    let shares = 0;
    let costBasis = 0;
    let peak = capital;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    const equityCurve: PolyBacktestResults["equityCurve"] = [
      { index: 0, equity: capital, timestamp: new Date(priceHistory[0].timestamp * 1000).toISOString() },
    ];

    for (let i = windowSize; i < priceHistory.length; i += stepSize) {
      const window = priceHistory.slice(Math.max(0, i - windowSize), i);
      const currentPrice = window[window.length - 1].price;
      const priceStart = window[0].price;
      const priceChange = ((currentPrice - priceStart) / priceStart * 100).toFixed(1);
      const trend = currentPrice > priceStart ? "up" : currentPrice < priceStart ? "down" : "flat";

      // Build prompt for Claude
      const priceStr = window.map((p) =>
        `${new Date(p.timestamp * 1000).toISOString().slice(0, 16)} → ${(p.price * 100).toFixed(1)}¢`
      ).join("\n");

      const userPrompt = `POLYMARKET PREDICTION MARKET ANALYSIS

Market: "${config.marketQuestion}"
Current YES price: ${(currentPrice * 100).toFixed(1)}¢
Price trend: ${trend} (${priceChange}% over window)
Entry threshold: below ${(config.entryThreshold * 100).toFixed(0)}¢
Exit threshold: above ${(config.exitThreshold * 100).toFixed(0)}¢
Stop loss: below ${(config.stopLoss * 100).toFixed(0)}¢

Current position: ${shares > 0 ? `${shares} shares at avg ${(costBasis / shares * 100).toFixed(1)}¢` : "None"}
Available capital: $${capital.toFixed(2)}

Recent price data:
${priceStr}

Strategy: ${strategy.name}
${strategy.contextConditions ? `Context: ${strategy.contextConditions}` : ""}
${strategy.entryConditions ? `Entry rules: ${strategy.entryConditions}` : ""}
${strategy.noTradeRules ? `No-trade rules: ${strategy.noTradeRules}` : ""}

Decide: BUY_YES (buy shares), SELL_YES (sell shares), or NO_TRADE.
Return JSON: {"action":"BUY_YES|SELL_YES|NO_TRADE","confidence":0-100,"reasoning":"one sentence"}`;

      try {
        const response = await client.messages.create({
          model: (creds.model as string) || "claude-sonnet-4-6",
          max_tokens: 256,
          temperature: 0.3,
          messages: [{ role: "user", content: userPrompt }],
        });

        const text = response.content.find((b) => b.type === "text");
        const jsonStr = extractJsonFromResponse(text?.type === "text" ? text.text : "{}");
        const decision = JSON.parse(jsonStr);

        const action = decision.action ?? "NO_TRADE";
        const confidence = Number(decision.confidence ?? 50);
        const reasoning = String(decision.reasoning ?? "");

        let pnl = 0;
        let exitPrice: number | null = null;
        let positionSize = 0;
        let tradeCost = 0;
        let outcome: PolyBacktestSignal["outcome"] = "no_trade";

        if (action === "BUY_YES" && shares === 0 && capital > 10) {
          // Buy shares
          const investAmount = capital * (config.positionSizePercent / 100);
          positionSize = Math.floor(investAmount / currentPrice);
          tradeCost = positionSize * currentPrice;
          shares = positionSize;
          costBasis = tradeCost;
          capital -= tradeCost;
          outcome = "pending";
        } else if (action === "SELL_YES" && shares > 0) {
          // Sell shares
          const revenue = shares * currentPrice;
          pnl = revenue - costBasis;
          exitPrice = currentPrice;
          outcome = pnl >= 0 ? "profit" : "loss";
          capital += revenue;
          positionSize = shares;
          shares = 0;
          costBasis = 0;
        } else if (shares > 0 && currentPrice <= config.stopLoss) {
          // Stop loss triggered
          const revenue = shares * currentPrice;
          pnl = revenue - costBasis;
          exitPrice = currentPrice;
          outcome = "loss";
          capital += revenue;
          positionSize = shares;
          shares = 0;
          costBasis = 0;
        }

        // Track equity (capital + open position value)
        const totalEquity = capital + (shares > 0 ? shares * currentPrice : 0);
        if (totalEquity > peak) peak = totalEquity;
        const dd = peak - totalEquity;
        const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
        if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;

        equityCurve.push({
          index: signals.length + 1,
          equity: Math.round(totalEquity * 100) / 100,
          timestamp: new Date(priceHistory[i].timestamp * 1000).toISOString(),
        });

        signals.push({
          index: signals.length,
          timestamp: new Date(priceHistory[i].timestamp * 1000).toISOString(),
          action: action as PolyBacktestSignal["action"],
          confidence: confidence > 1 ? confidence / 100 : confidence,
          reasoning,
          price: currentPrice,
          positionSize,
          costBasis: tradeCost,
          outcome,
          exitPrice,
          pnl: Math.round(pnl * 100) / 100,
        });
      } catch (err) {
        log.engine.warn(`Polymarket backtest signal error: ${err}`);
        signals.push({
          index: signals.length,
          timestamp: new Date(priceHistory[i].timestamp * 1000).toISOString(),
          action: "NO_TRADE",
          confidence: 0,
          reasoning: "Claude API error",
          price: currentPrice,
          positionSize: 0,
          costBasis: 0,
          outcome: "no_trade",
          exitPrice: null,
          pnl: 0,
        });
      }
    }

    // Close any remaining position at last price
    if (shares > 0) {
      const lastPrice = priceHistory[priceHistory.length - 1].price;
      capital += shares * lastPrice;
    }

    // Calculate results
    const trades = signals.filter((s) => s.action !== "NO_TRADE" && s.action !== "HOLD");
    const wins = trades.filter((s) => s.outcome === "profit");
    const losses = trades.filter((s) => s.outcome === "loss");
    const pending = trades.filter((s) => s.outcome === "pending");
    const winPnls = wins.map((s) => s.pnl);
    const lossPnls = losses.map((s) => s.pnl);

    const netProfit = Math.round((capital - config.initialCapital) * 100) / 100;

    const results: PolyBacktestResults = {
      totalSignals: signals.length,
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      pending: pending.length,
      noTrades: signals.filter((s) => s.action === "NO_TRADE").length,
      winRate: wins.length + losses.length > 0 ? wins.length / (wins.length + losses.length) : null,
      initialCapital: config.initialCapital,
      finalCapital: Math.round(capital * 100) / 100,
      netProfit,
      netProfitPercent: Math.round((netProfit / config.initialCapital) * 10000) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
      avgWin: winPnls.length > 0 ? Math.round(winPnls.reduce((a, b) => a + b, 0) / winPnls.length * 100) / 100 : 0,
      avgLoss: lossPnls.length > 0 ? Math.round(lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length * 100) / 100 : 0,
      bestTrade: winPnls.length > 0 ? Math.max(...winPnls) : 0,
      worstTrade: lossPnls.length > 0 ? Math.min(...lossPnls) : 0,
      profitFactor: lossPnls.length > 0 && winPnls.length > 0
        ? Math.round((winPnls.reduce((a, b) => a + b, 0) / Math.abs(lossPnls.reduce((a, b) => a + b, 0))) * 100) / 100
        : null,
      equityCurve,
      signals,
      disclaimers: [
        "Results based on historical Polymarket prices",
        "Does not account for slippage or orderbook depth",
        "Past prediction market prices do not guarantee future results",
      ],
    };

    return NextResponse.json({
      id: crypto.randomUUID(),
      config,
      status: "completed",
      results,
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backtest failed";
    log.engine.error(`Polymarket backtest error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
