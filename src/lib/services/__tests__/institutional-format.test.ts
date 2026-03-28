import { describe, it, expect } from "vitest";
import { parseClaudeResponse } from "../claude/response-parser";

/**
 * Tests that verify the EXACT institutional format from the system prompt
 * is correctly parsed, normalized, and validated by the response parser.
 */

describe("Institutional format integration", () => {
  it("parses a BUY signal in full institutional format", () => {
    const institutionalBuy = JSON.stringify({
      signal: "BUY",
      market_state: "trend_pullback",
      bias: "LONG",
      setup_type: "pullback_trend_long",
      confidence: 78,
      entry_zone: { min: 19845.5, max: 19850.25 },
      stop_loss: 19820.0,
      take_profit_1: 19910.5,
      take_profit_2: 19950.0,
      risk_reward_estimate: "1:3",
      invalidation_condition: "Break below 19820 with volume",
      reasoning: [
        "Price pulled back to VWAP within an established uptrend with higher lows on 5m.",
        "Entry zone aligns with VWAP + previous day high confluence.",
        "Risk is defined at 30pts with clear invalidation below overnight low.",
      ],
      warning: "FOMC minutes at 2pm ET — consider reducing size.",
    });

    const result = parseClaudeResponse(institutionalBuy, { minConfidence: 0.5 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Action normalized from "signal" key
    expect(result.data.action).toBe("BUY");

    // Confidence normalized from 78 → 0.78
    expect(result.data.confidence).toBe(0.78);

    // Entry price from entry_zone.min
    expect(result.data.entry_price).toBe(19845.5);

    // Stop loss direct
    expect(result.data.stop_loss).toBe(19820.0);

    // Take profit from take_profit_1
    expect(result.data.take_profit).toBe(19910.5);

    // Take profit 2
    expect(result.data.take_profit_2).toBe(19950.0);

    // R:R parsed from string "1:3"
    expect(result.data.risk_reward_ratio).toBe(3);

    // Institutional fields preserved
    expect(result.data.market_state).toBe("trend_pullback");
    expect(result.data.bias).toBe("LONG");
    expect(result.data.setup_type).toBe("pullback_trend_long");
    expect(result.data.warning).toBe("FOMC minutes at 2pm ET — consider reducing size.");

    // Reasoning normalized from array to pipe-separated string
    expect(result.data.reasoning).toContain("VWAP");
    expect(result.data.reasoning).toContain("|");

    // Invalidation from invalidation_condition
    expect(result.data.invalidation).toContain("19820");
  });

  it("parses a NO_TRADE signal in institutional format", () => {
    const noTrade = JSON.stringify({
      signal: "NO_TRADE",
      market_state: "low_quality_chop",
      bias: "NEUTRAL",
      setup_type: "no_valid_setup",
      confidence: 25,
      entry_zone: { min: null, max: null },
      stop_loss: null,
      take_profit_1: null,
      take_profit_2: null,
      risk_reward_estimate: "insufficient",
      invalidation_condition: "No clear structure.",
      reasoning: [
        "Price oscillating around VWAP with no directional bias.",
        "Volume declining and spread widening.",
        "No clear support/resistance levels nearby.",
      ],
      warning: "",
    });

    const result = parseClaudeResponse(noTrade, { minConfidence: 0.5 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe("NO_TRADE");
    expect(result.data.confidence).toBe(0.25);
    expect(result.data.entry_price).toBeNull();
    expect(result.data.stop_loss).toBeNull();
    expect(result.data.market_state).toBe("low_quality_chop");
    expect(result.data.bias).toBe("NEUTRAL");
  });

  it("downgrades institutional BUY with low confidence to NO_TRADE", () => {
    const lowConf = JSON.stringify({
      signal: "BUY",
      market_state: "compression",
      bias: "LONG",
      setup_type: "breakout_attempt",
      confidence: 35,
      entry_zone: { min: 19845, max: 19850 },
      stop_loss: 19820,
      take_profit_1: 19880,
      risk_reward_estimate: "1:1.5",
      invalidation_condition: "Break below 19820",
      reasoning: [
        "Marginal breakout attempt with weak volume.",
        "Entry zone near resistance cluster.",
        "Risk acceptable but conviction is low.",
      ],
      warning: "",
    });

    const result = parseClaudeResponse(lowConf, { minConfidence: 0.5 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // 35/100 = 0.35 < 0.5 minConfidence → downgraded to NO_TRADE
    expect(result.data.action).toBe("NO_TRADE");
    expect(result.data.reasoning).toContain("LOW CONFIDENCE");
  });

  it("handles SELL signal with R:R verification", () => {
    const sell = JSON.stringify({
      signal: "SELL",
      market_state: "trending_down",
      bias: "SHORT",
      setup_type: "range_rejection_short",
      confidence: 82,
      entry_zone: { min: 19880, max: 19885 },
      stop_loss: 19910,
      take_profit_1: 19820,
      take_profit_2: 19790,
      risk_reward_estimate: "1:2",
      invalidation_condition: "Break above 19910 with momentum",
      reasoning: [
        "Price rejected at session high for the second time.",
        "Volume spike on rejection candle confirms sellers.",
        "Clear path to previous day low with no major support.",
      ],
      warning: "",
    });

    const result = parseClaudeResponse(sell, { minConfidence: 0.5 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe("SELL");
    expect(result.data.confidence).toBe(0.82);
    expect(result.data.entry_price).toBe(19880);
    expect(result.data.stop_loss).toBe(19910);
    expect(result.data.take_profit).toBe(19820);

    // R:R: risk = |19880-19910| = 30, reward = |19820-19880| = 60, RR = 2.0
    expect(result.data.risk_reward_ratio).toBe(2);
  });
});
