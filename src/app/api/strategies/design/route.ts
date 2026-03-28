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

const DESIGNER_SYSTEM_PROMPT = `You are the brain of a trading signal platform. The user will give you a strategy description — it could be a simple idea, a complex multi-page rulebook, raw notes, conditions in any format, or even a full system prompt they want to use.

YOUR JOB: Take whatever they give you and convert it into a structured strategy + prompt that the platform can execute. Be faithful to their intent. Don't simplify or water down their rules. If they give you complex conditions, keep them complex. If they give you a detailed prompt, incorporate it fully into the userPromptTemplate.

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

CRITICAL RULES:
- systemPrompt MUST be empty string "" (the platform has a built-in institutional system prompt)
- userPromptTemplate MUST use {{variable}} placeholders for market data injection
- timeframes MUST be an array like ["5m"] or ["1m", "5m"]
- minRR MUST be a number like 2 or 3, not a string
- If the user gives you a complex, detailed description, preserve ALL their rules and conditions — do NOT simplify
- If the user gives you what looks like a full prompt/system prompt, put that content into the strategy fields AND into the userPromptTemplate
- Be faithful to the user's intent — you are a translator, not an editor
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
      max_tokens: 8192,
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

    let raw;
    try {
      raw = JSON.parse(jsonStr);
    } catch {
      log.engine.error("Strategy Designer JSON parse failed", {
        extractedFirst100: jsonStr.slice(0, 100),
      });
      return NextResponse.json(
        { error: "Claude returned invalid JSON. Please try again." },
        { status: 500 }
      );
    }

    // Normalize: force Claude's output into the EXACT shape the APIs expect
    const s = raw.strategy ?? raw;
    const p = raw.prompt ?? {};

    const result = {
      strategy: {
        name: String(s.name ?? s.strategy_name ?? "AI Strategy").slice(0, 200),
        description: String(s.description ?? "").slice(0, 5000),
        tag: String(s.tag ?? s.label ?? "").slice(0, 30),
        instrument: s.instrument === "MNQ" ? "MNQ" : "NQ",
        timeframes: Array.isArray(s.timeframes) ? s.timeframes : [String(s.timeframes ?? s.timeframe ?? "5m")],
        contextConditions: String(s.contextConditions ?? s.context_conditions ?? s.context ?? ""),
        entryConditions: String(s.entryConditions ?? s.entry_conditions ?? s.entry ?? ""),
        invalidation: String(s.invalidation ?? s.invalidation_condition ?? ""),
        tp1: String(s.tp1 ?? s.take_profit_1 ?? s.takeProfit1 ?? ""),
        tp2: String(s.tp2 ?? s.take_profit_2 ?? s.takeProfit2 ?? ""),
        minRR: Number(s.minRR ?? s.min_rr ?? s.rr ?? 2) || 2,
        volatilityFilter: String(s.volatilityFilter ?? s.volatility_filter ?? s.volatility ?? ""),
        volumeFilter: String(s.volumeFilter ?? s.volume_filter ?? s.volume ?? ""),
        scheduleFilter: String(s.scheduleFilter ?? s.schedule_filter ?? s.schedule ?? ""),
        newsFilter: String(s.newsFilter ?? s.news_filter ?? s.news ?? ""),
        noTradeRules: String(s.noTradeRules ?? s.no_trade_rules ?? s.noTrade ?? ""),
      },
      prompt: {
        name: String(p.name ?? `${s.name ?? "AI"} Prompt`).slice(0, 200),
        description: String(p.description ?? "AI-designed prompt"),
        tag: String(p.tag ?? s.tag ?? ""),
        systemPrompt: "", // always empty — platform uses institutional prompt
        userPromptTemplate: String(p.userPromptTemplate ?? p.user_prompt_template ?? p.user_prompt ?? p.template ?? ""),
        outputSchema: String(p.outputSchema ?? p.output_schema ?? ""),
        outputValidationRules: String(p.outputValidationRules ?? p.output_validation_rules ?? ""),
      },
    };

    log.engine.info("AI Strategy Designer completed", {
      strategyName: result.strategy.name,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Design failed";
    log.engine.error(`AI Strategy Designer error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
