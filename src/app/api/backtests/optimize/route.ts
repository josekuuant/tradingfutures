import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRawCredentials } from "@/lib/services/connections";
import { getStrategy, updateStrategy } from "@/lib/services/strategies";
import { getPrompt, updatePrompt } from "@/lib/services/prompts";
import { log } from "@/lib/logger";
import type { BacktestResults } from "@/types/backtest";

const OPTIMIZER_SYSTEM = `You are a trading strategy optimization engine. You analyze backtest results and propose specific, actionable adjustments to improve strategy profitability and safety.

You receive:
1. The current strategy configuration (conditions, filters, rules)
2. The current prompt template
3. Backtest results (win rate, profit factor, signals, outcomes)
4. The iteration number (how many optimization rounds have been done)

Your job:
- Analyze WHY the strategy is underperforming
- Identify the weakest points (bad entries, poor invalidation, missing filters, etc.)
- Propose SPECIFIC changes to the strategy fields and/or prompt
- Be conservative — small targeted adjustments, not complete rewrites
- Prioritize safety: better to miss trades than lose money
- If results are already good (win rate > 55%, profit factor > 1.5), say so and suggest only minor tweaks

You MUST return ONLY valid JSON:

{
  "analysis": "2-3 sentences explaining what's wrong and why",
  "changes": {
    "strategy": {
      "field_name": "new_value"
    },
    "prompt": {
      "field_name": "new_value"
    }
  },
  "changesSummary": ["Change 1 description", "Change 2 description"],
  "isOptimal": false,
  "confidenceInChanges": 0.7,
  "recommendation": "One sentence: what to do next"
}

RULES:
- Only include fields that need changing in "changes"
- strategy fields: contextConditions, entryConditions, invalidation, tp1, tp2, minRR, volatilityFilter, volumeFilter, scheduleFilter, newsFilter, noTradeRules
- prompt fields: userPromptTemplate
- Set isOptimal=true if results are already good enough
- confidenceInChanges: 0-1 how confident you are the changes will improve results
- Be specific in changesSummary — no vague statements`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      strategyId,
      promptId,
      results,
      iteration,
      autoApply,
    } = body as {
      strategyId: string;
      promptId: string;
      results: BacktestResults;
      iteration: number;
      autoApply: boolean;
    };

    if (!strategyId || !promptId || !results) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const strategy = await getStrategy(strategyId);
    if (!strategy) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });

    const prompt = await getPrompt(promptId);
    if (!prompt) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });

    const creds = await getRawCredentials("claude");
    if (!creds?.apiKey) {
      return NextResponse.json({ error: "Claude API key not configured" }, { status: 401 });
    }

    const client = new Anthropic({ apiKey: creds.apiKey as string });

    log.engine.info(`Optimization round ${iteration} for ${strategy.name}`);

    const userMessage = `
ITERATION: ${iteration}

CURRENT STRATEGY:
- Name: ${strategy.name}
- Context Conditions: ${strategy.contextConditions || "None"}
- Entry Conditions: ${strategy.entryConditions || "None"}
- Invalidation: ${strategy.invalidation || "None"}
- TP1: ${strategy.tp1 || "None"}
- TP2: ${strategy.tp2 || "None"}
- Min R:R: ${strategy.minRR}
- Volatility Filter: ${strategy.volatilityFilter || "None"}
- Volume Filter: ${strategy.volumeFilter || "None"}
- Schedule Filter: ${strategy.scheduleFilter || "None"}
- News Filter: ${strategy.newsFilter || "None"}
- No-Trade Rules: ${strategy.noTradeRules || "None"}

CURRENT PROMPT (user template):
${prompt.userPromptTemplate.slice(0, 2000)}

BACKTEST RESULTS:
- Total Signals: ${results.totalSignals}
- Trades (BUY+SELL): ${results.tradeCount}
- No Trade: ${results.noTradeCount}
- Wins: ${results.wins}
- Losses: ${results.losses}
- Pending: ${results.pending}
- Win Rate: ${results.winRate != null ? (results.winRate * 100).toFixed(1) + "%" : "N/A"}
- Profit Factor: ${results.profitFactor ?? "N/A"}
- Avg R:R: ${results.avgRR?.toFixed(2) ?? "N/A"}
- Max Consecutive Wins: ${results.maxConsecutiveWins}
- Max Consecutive Losses: ${results.maxConsecutiveLosses}
- BUY count: ${results.buyCount}
- SELL count: ${results.sellCount}

Analyze these results and propose specific improvements to make the strategy more profitable and safer.`;

    const response = await client.messages.create({
      model: (creds.model as string) || "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0.4,
      system: OPTIMIZER_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from Claude" }, { status: 500 });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.includes("```")) {
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) jsonStr = match[1].trim();
    }

    const optimization = JSON.parse(jsonStr);

    // Auto-apply changes if requested and Claude is confident
    if (autoApply && !optimization.isOptimal && optimization.confidenceInChanges >= 0.5) {
      if (optimization.changes?.strategy) {
        await updateStrategy(strategyId, optimization.changes.strategy);
        log.engine.info("Auto-applied strategy changes", {
          fields: Object.keys(optimization.changes.strategy),
        });
      }
      if (optimization.changes?.prompt) {
        await updatePrompt(promptId, optimization.changes.prompt);
        log.engine.info("Auto-applied prompt changes", {
          fields: Object.keys(optimization.changes.prompt),
        });
      }
      optimization.applied = true;
    } else {
      optimization.applied = false;
    }

    return NextResponse.json(optimization);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Optimization failed";
    log.engine.error(`Optimizer error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
