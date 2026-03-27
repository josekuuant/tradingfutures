import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the signal engine's public contract by mocking its dependencies.
// This validates the orchestration logic without needing real DB/Claude.

// Mock modules before importing
vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn().mockReturnValue({ values: vi.fn() }), select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }) },
  schema: { signals: {} },
}));

vi.mock("@/lib/logger", () => ({
  log: {
    engine: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    claude: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    system: { info: vi.fn() },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, resetInSeconds: 3600 }),
  recordEvent: vi.fn(),
}));

vi.mock("../strategies", () => ({
  getActiveStrategy: vi.fn(),
}));

vi.mock("../prompts", () => ({
  listPrompts: vi.fn(),
}));

vi.mock("../market", () => ({
  getMarketSnapshot: vi.fn(),
}));

vi.mock("../claude/client", () => ({
  callClaude: vi.fn(),
  ClaudeClientError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

vi.mock("../claude/prompt-assembler", () => ({
  assemblePrompt: vi.fn().mockReturnValue({
    systemPrompt: "system",
    userPrompt: "user",
    variables: {},
  }),
}));

vi.mock("../claude/response-parser", () => ({
  parseClaudeResponse: vi.fn(),
}));

vi.mock("../engine/pre-filters", () => ({
  runPreFilters: vi.fn().mockReturnValue({
    passed: true,
    results: [],
    timestamp: new Date().toISOString(),
  }),
}));

vi.mock("../engine/trace-store", () => ({
  pushTrace: vi.fn().mockReturnValue({ id: "1", timestamp: new Date().toISOString() }),
  getTraces: vi.fn().mockReturnValue([]),
  getLastTrace: vi.fn().mockReturnValue(null),
  getEngineStats: vi.fn(),
  getLastSuccessfulRunAt: vi.fn().mockReturnValue(null),
  getLastRunAt: vi.fn().mockReturnValue(null),
}));

import { generateSignal, getEngineConfig, updateEngineConfig } from "../signal-engine";
import { getActiveStrategy } from "../strategies";
import { listPrompts } from "../prompts";
import { getMarketSnapshot } from "../market";
import { checkRateLimit } from "@/lib/rate-limiter";

const mockStrategy = {
  id: "s1",
  name: "Test Strategy",
  instrument: "NQ",
  timeframes: ["5m"],
  isActive: true,
  contextConditions: "",
  entryConditions: "",
  invalidation: "",
  noTradeRules: "",
  scheduleFilter: "",
  newsFilter: "",
};

const mockPrompt = {
  id: "p1",
  name: "Test Prompt",
  isActive: true,
  systemPrompt: "",
  userPromptTemplate: "",
  outputSchema: "",
  outputValidationRules: "",
  version: 1,
};

const mockSnapshot = {
  quote: {
    instrument: "NQ",
    lastPrice: 19850,
    bidPrice: 19849.75,
    askPrice: 19850.25,
    spread: 0.5,
    volume: 250000,
    timestamp: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    bidSize: 10,
    askSize: 10,
    lastSize: 1,
  },
  levels: {},
  health: { status: "live", latencyMs: 5, lastUpdateAt: new Date().toISOString(), uptimeSince: null, tickCount: 100 },
  recentCandles: [],
  streamLog: [],
};

describe("generateSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NO_STRATEGY when no active strategy", async () => {
    vi.mocked(getActiveStrategy).mockResolvedValue(null);

    const result = await generateSignal();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("NO_STRATEGY");
    }
  });

  it("returns NO_PROMPT when no active prompt", async () => {
    vi.mocked(getActiveStrategy).mockResolvedValue(mockStrategy as never);
    vi.mocked(listPrompts).mockResolvedValue([]);

    const result = await generateSignal();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("NO_PROMPT");
    }
  });

  it("returns MARKET_DATA_FAILED when snapshot throws", async () => {
    vi.mocked(getActiveStrategy).mockResolvedValue(mockStrategy as never);
    vi.mocked(listPrompts).mockResolvedValue([mockPrompt as never]);
    vi.mocked(getMarketSnapshot).mockRejectedValue(new Error("Databento down"));

    const result = await generateSignal();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MARKET_DATA_FAILED");
      expect(result.error).toContain("Databento down");
    }
  });

  it("returns FILTERED when rate limit reached", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetInSeconds: 120,
    });

    const result = await generateSignal();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("FILTERED");
      expect(result.error).toContain("Rate limit");
    }
  });

  it("returns MARKET_DATA_FAILED when data is stale", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 29, resetInSeconds: 3600 });
    vi.mocked(getActiveStrategy).mockResolvedValue(mockStrategy as never);
    vi.mocked(listPrompts).mockResolvedValue([mockPrompt as never]);

    const staleSnapshot = {
      ...mockSnapshot,
      quote: {
        ...mockSnapshot.quote,
        timestamp: new Date(Date.now() - 300_000).toISOString(), // 5 min old
      },
    };
    vi.mocked(getMarketSnapshot).mockResolvedValue(staleSnapshot as never);

    const result = await generateSignal();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MARKET_DATA_FAILED");
      expect(result.error).toContain("old");
    }
  });
});

describe("getEngineConfig / updateEngineConfig", () => {
  it("returns default config", () => {
    const config = getEngineConfig();
    expect(config.cooldownSeconds).toBe(120);
    expect(config.minConfidence).toBe(0.5);
    expect(config.maxDataAgeSeconds).toBe(120);
    expect(config.promptCandleCount).toBe(50);
  });

  it("updates config partially", () => {
    updateEngineConfig({ cooldownSeconds: 60 });
    const config = getEngineConfig();
    expect(config.cooldownSeconds).toBe(60);
    expect(config.minConfidence).toBe(0.5); // unchanged
  });
});
