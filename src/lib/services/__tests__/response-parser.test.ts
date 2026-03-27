import { describe, it, expect } from "vitest";
import { parseClaudeResponse } from "../claude/response-parser";

// ─── Valid signals ───────────────────────────────────────────

describe("parseClaudeResponse", () => {
  const validBuy = JSON.stringify({
    action: "BUY",
    confidence: 0.85,
    reasoning: "Strong breakout above VWAP with volume",
    entry_price: 19850.25,
    stop_loss: 19820.0,
    take_profit: 19910.5,
    risk_reward_ratio: 2.0,
    invalidation: "Break below 19820",
    market_context: "Bullish trend",
  });

  const validNoTrade = JSON.stringify({
    action: "NO_TRADE",
    confidence: 0.6,
    reasoning: "Choppy price action, no clear direction",
    entry_price: null,
    stop_loss: null,
    take_profit: null,
    risk_reward_ratio: null,
  });

  it("parses valid BUY signal", () => {
    const result = parseClaudeResponse(validBuy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe("BUY");
      expect(result.data.confidence).toBe(0.85);
      expect(result.data.entry_price).toBe(19850.25);
      expect(result.data.stop_loss).toBe(19820.0);
    }
  });

  it("parses valid NO_TRADE signal", () => {
    const result = parseClaudeResponse(validNoTrade);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe("NO_TRADE");
    }
  });

  it("extracts JSON from markdown code block", () => {
    const wrapped = "Here's the analysis:\n```json\n" + validBuy + "\n```\nDone.";
    const result = parseClaudeResponse(wrapped);
    expect(result.success).toBe(true);
  });

  it("extracts JSON from text with surrounding content", () => {
    const wrapped = "Analysis complete. " + validBuy + " End of response.";
    const result = parseClaudeResponse(wrapped);
    expect(result.success).toBe(true);
  });

  // ─── B2: stop_loss required ──────────────────────────────

  it("rejects BUY without stop_loss", () => {
    const noSL = JSON.stringify({
      action: "BUY",
      confidence: 0.8,
      reasoning: "test",
      entry_price: 19850,
      stop_loss: null,
      take_profit: 19900,
      risk_reward_ratio: 1.5,
    });
    const result = parseClaudeResponse(noSL);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("stop_loss");
    }
  });

  it("rejects SELL without entry_price", () => {
    const noEntry = JSON.stringify({
      action: "SELL",
      confidence: 0.7,
      reasoning: "test",
      entry_price: null,
      stop_loss: 19900,
      take_profit: 19800,
      risk_reward_ratio: 1.0,
    });
    const result = parseClaudeResponse(noEntry);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("entry_price");
    }
  });

  // ─── B3: minConfidence ───────────────────────────────────

  it("downgrades BUY below minConfidence to NO_TRADE", () => {
    const lowConf = JSON.stringify({
      action: "BUY",
      confidence: 0.3,
      reasoning: "Marginal setup",
      entry_price: 19850,
      stop_loss: 19820,
      take_profit: 19900,
      risk_reward_ratio: 1.67,
    });
    const result = parseClaudeResponse(lowConf, { minConfidence: 0.5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe("NO_TRADE");
      expect(result.data.reasoning).toContain("LOW CONFIDENCE");
    }
  });

  it("keeps BUY above minConfidence", () => {
    const result = parseClaudeResponse(validBuy, { minConfidence: 0.5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe("BUY");
    }
  });

  // ─── M6: R:R verification ───────────────────────────────

  it("corrects incorrect R:R ratio", () => {
    const wrongRR = JSON.stringify({
      action: "BUY",
      confidence: 0.8,
      reasoning: "Good setup",
      entry_price: 19850,
      stop_loss: 19820,  // risk = 30
      take_profit: 19910, // reward = 60
      risk_reward_ratio: 5.0, // claimed 5, actual 2
    });
    const result = parseClaudeResponse(wrongRR);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.risk_reward_ratio).toBe(2.0);
      expect(result.data.reasoning).toContain("R:R corrected");
    }
  });

  it("keeps correct R:R ratio", () => {
    const result = parseClaudeResponse(validBuy);
    expect(result.success).toBe(true);
    if (result.success) {
      // entry=19850.25, sl=19820, tp=19910.5
      // risk=30.25, reward=60.25, rr=1.99
      // claimed 2.0 → within tolerance
      expect(result.data.risk_reward_ratio).toBe(2.0);
      expect(result.data.reasoning).not.toContain("R:R corrected");
    }
  });

  // ─── Error cases ─────────────────────────────────────────

  it("rejects empty response", () => {
    const result = parseClaudeResponse("");
    expect(result.success).toBe(false);
  });

  it("rejects invalid JSON", () => {
    const result = parseClaudeResponse("{not valid json}");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JSON parse error");
    }
  });

  it("rejects missing required fields", () => {
    const missing = JSON.stringify({ action: "BUY" });
    const result = parseClaudeResponse(missing);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Schema validation failed");
    }
  });

  it("rejects invalid action", () => {
    const invalid = JSON.stringify({
      action: "HOLD",
      confidence: 0.5,
      reasoning: "test",
      entry_price: null,
      stop_loss: null,
      take_profit: null,
      risk_reward_ratio: null,
    });
    const result = parseClaudeResponse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects confidence out of range", () => {
    const outOfRange = JSON.stringify({
      action: "NO_TRADE",
      confidence: 1.5,
      reasoning: "test",
      entry_price: null,
      stop_loss: null,
      take_profit: null,
      risk_reward_ratio: null,
    });
    const result = parseClaudeResponse(outOfRange);
    expect(result.success).toBe(false);
  });
});
