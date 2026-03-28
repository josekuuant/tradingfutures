import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRawCredentials } from "@/lib/services/connections";
import { log } from "@/lib/logger";
import { extractJsonFromResponse } from "@/lib/json-extract";

const PROMPT_DESIGNER_SYSTEM = `You are an expert prompt engineer for an NQ/MNQ futures trading signal engine powered by Claude AI.

The user will describe what they want the AI to analyze, what kind of decisions to make, what rules to follow, and what output they expect — in natural language (Spanish or English).

Your job is to convert this into a professional prompt configuration.

The system has a built-in institutional system prompt that handles:
- JSON output format enforcement
- Risk mandates (2% per trade, 4% daily max)
- Confidence scoring (0-100)
- NO_TRADE logic
- Market state classification

So the user prompt should focus on STRATEGY-SPECIFIC instructions — what to look for, how to decide, what data to prioritize.

AVAILABLE TEMPLATE VARIABLES (use {{variable_name}} syntax):
- {{instrument}} — NQ or MNQ
- {{timeframe}} — e.g. 5m
- {{current_price}} — last traded price
- {{bid}}, {{ask}}, {{spread}}
- {{volume}} — session volume
- {{ohlcv_data}} — recent OHLCV candles
- {{session_high}}, {{session_low}}
- {{vwap}}
- {{overnight_high}}, {{overnight_low}}
- {{prev_day_high}}, {{prev_day_low}}, {{prev_day_close}}
- {{opening_range_high}}, {{opening_range_low}}
- {{strategy_name}}
- {{context_conditions}}, {{entry_conditions}}, {{invalidation}}, {{no_trade_rules}}
- {{timestamp}}

You MUST return ONLY valid JSON with this structure:

{
  "name": "Short descriptive name (max 50 chars)",
  "description": "What this prompt does (1-2 sentences)",
  "tag": "one-word tag",
  "systemPrompt": "",
  "userPromptTemplate": "The full user prompt with {{variables}}. This should be detailed, specific, and include all relevant data variables. Structure it in clear sections.",
  "outputSchema": "The expected JSON output schema (or empty string to use default)",
  "outputValidationRules": "Any extra validation rules for the output (or empty string)"
}

RULES:
- systemPrompt MUST be empty string (the platform handles this)
- userPromptTemplate should be comprehensive and use many {{variables}}
- Structure the user prompt in clear sections: DATA, STRATEGY RULES, ANALYSIS INSTRUCTIONS
- Be specific and professional — no vague instructions
- All text in English regardless of input language
- No markdown outside the JSON`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const description = body.description as string;

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Describe what you want the prompt to do." },
        { status: 400 }
      );
    }

    const creds = await getRawCredentials("claude");
    if (!creds?.apiKey) {
      return NextResponse.json(
        { error: "Claude API key not configured." },
        { status: 401 }
      );
    }

    const client = new Anthropic({ apiKey: creds.apiKey as string });

    log.engine.info("AI Prompt Designer invoked", { descriptionLength: description.length });

    const response = await client.messages.create({
      model: (creds.model as string) || "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0.3,
      system: PROMPT_DESIGNER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Design a complete prompt configuration for this use case:\n\n${description}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from Claude" }, { status: 500 });
    }

    const jsonStr = extractJsonFromResponse(textBlock.text);

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      log.engine.error("Prompt Designer JSON parse failed", {
        extractedFirst100: jsonStr.slice(0, 100),
      });
      return NextResponse.json(
        { error: "Claude returned invalid JSON. Please try again." },
        { status: 500 }
      );
    }

    log.engine.info("AI Prompt Designer completed", { name: result.name });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Design failed";
    log.engine.error(`AI Prompt Designer error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
