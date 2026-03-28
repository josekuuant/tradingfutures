import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRawCredentials } from "@/lib/services/connections";
import { log } from "@/lib/logger";
import { extractJsonFromResponse } from "@/lib/json-extract";

/**
 * AI Strategy Designer — takes a natural language description of a trading
 * strategy and returns a fully structured strategy + prompt configuration
 * ready to save in the system.
 */

const DESIGNER_SYSTEM_PROMPT = `You are a senior trading strategy architect. The user will describe a trading strategy idea in natural language (possibly in Spanish or English). Your job is to convert it into a fully structured configuration for an NQ/MNQ futures signal engine.

You must return ONLY valid JSON with this exact structure:

{
  "strategy": {
    "name": "Short strategy name (max 50 chars)",
    "description": "One-paragraph description of the strategy thesis",
    "tag": "one-word tag like breakout, reversal, scalp, momentum",
    "instrument": "NQ",
    "timeframes": ["5m"],
    "contextConditions": "When is this strategy valid? Market state, bias, structure requirements...",
    "entryConditions": "Exact entry triggers with specific criteria...",
    "invalidation": "What invalidates the setup? Be specific...",
    "tp1": "First take profit logic with price reference...",
    "tp2": "Second take profit / runner logic...",
    "minRR": 2,
    "volatilityFilter": "ATR or range requirements...",
    "volumeFilter": "Volume conditions...",
    "scheduleFilter": "Trading hours restrictions...",
    "newsFilter": "News event rules...",
    "noTradeRules": "When NOT to trade even if setup appears valid..."
  },
  "prompt": {
    "name": "Prompt name matching strategy",
    "description": "What this prompt does",
    "systemPrompt": "",
    "userPromptTemplate": "The user message template with {{variable}} placeholders. Available variables: {{instrument}}, {{timeframe}}, {{current_price}}, {{bid}}, {{ask}}, {{spread}}, {{volume}}, {{ohlcv_data}}, {{session_high}}, {{session_low}}, {{vwap}}, {{overnight_high}}, {{overnight_low}}, {{prev_day_high}}, {{prev_day_low}}, {{prev_day_close}}, {{opening_range_high}}, {{opening_range_low}}, {{strategy_name}}, {{context_conditions}}, {{entry_conditions}}, {{invalidation}}, {{no_trade_rules}}, {{timestamp}}",
    "outputSchema": ""
  }
}

RULES:
- The systemPrompt field should be EMPTY (the platform uses a built-in institutional system prompt)
- The userPromptTemplate MUST use {{variable}} placeholders for dynamic data injection
- Be specific and actionable — no vague conditions
- Think like a professional prop desk quant
- All text in English regardless of input language
- The prompt should instruct Claude to analyze the provided data against the strategy rules
- Include all relevant market data variables in the user prompt
- No markdown, no commentary — ONLY the JSON object`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const description = body.description as string;

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Please describe your strategy in at least a few sentences." },
        { status: 400 }
      );
    }

    // Get Claude API key
    const creds = await getRawCredentials("claude");
    if (!creds?.apiKey) {
      return NextResponse.json(
        { error: "Claude API key not configured. Go to API Connections first." },
        { status: 401 }
      );
    }

    const client = new Anthropic({ apiKey: creds.apiKey as string });

    log.engine.info("AI Strategy Designer invoked", {
      descriptionLength: description.length,
    });

    const response = await client.messages.create({
      model: (creds.model as string) || "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0.3,
      system: DESIGNER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Design a complete trading strategy and prompt configuration based on this description:\n\n${description}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Claude returned no text response" },
        { status: 500 }
      );
    }

    const jsonStr = extractJsonFromResponse(textBlock.text);
    const result = JSON.parse(jsonStr);

    log.engine.info("AI Strategy Designer completed", {
      strategyName: result.strategy?.name,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Design failed";
    log.engine.error(`AI Strategy Designer error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
