import type { MarketSnapshot, OHLCV } from "@/types/market";
import type { Strategy } from "@/types/strategy";
import type { Signal } from "@/types/signal";
import type {
  FilterResult,
  PreFilterReport,
  EngineConfig,
} from "@/types/engine";

/**
 * Runs all pre-filters before calling Claude.
 * Each filter is independent — all run regardless of prior results.
 * This gives full traceability of what passed and what didn't.
 */
export function runPreFilters(
  snapshot: MarketSnapshot,
  strategy: Strategy,
  recentSignals: Signal[],
  config: EngineConfig,
  lastRunAt: string | null
): PreFilterReport {
  const results: FilterResult[] = [
    checkTradingHours(config),
    checkCooldown(lastRunAt, config),
    checkVolatility(snapshot.recentCandles, config),
    checkRelativeVolume(snapshot, config),
    checkLevelProximity(snapshot, config),
    checkNoTradeRules(strategy),
    checkScheduleFilter(strategy),
    checkNewsFilter(strategy),
    checkDuplicateSignal(recentSignals, config, snapshot.quote.instrument),
  ];

  const passed = results.every((r) => r.verdict === "pass");

  return {
    passed,
    results,
    timestamp: new Date().toISOString(),
  };
}

// ─── Individual filters ──────────────────────────────────────

function checkTradingHours(config: EngineConfig): FilterResult {
  const now = new Date();
  // Approximate ET offset (UTC-5 standard, UTC-4 DST)
  // For production, use a proper timezone library
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const etOffset = isDST(now) ? 4 : 5;
  let etHour = utcHour - etOffset;
  if (etHour < 0) etHour += 24;
  const etDecimal = etHour + utcMin / 60;

  const [start, end] = config.tradingHoursET;
  const inHours = etDecimal >= start && etDecimal < end;

  return {
    filter: "trading_hours",
    verdict: inHours ? "pass" : "skip",
    reason: inHours
      ? `Within trading hours (${fmtHour(etDecimal)} ET)`
      : `Outside trading hours (${fmtHour(etDecimal)} ET, allowed ${fmtHour(start)}-${fmtHour(end)})`,
  };
}

function checkCooldown(
  lastRunAt: string | null,
  config: EngineConfig
): FilterResult {
  if (!lastRunAt) {
    return {
      filter: "cooldown",
      verdict: "pass",
      reason: "No previous run — no cooldown needed",
    };
  }

  const elapsed = (Date.now() - new Date(lastRunAt).getTime()) / 1000;
  const passed = elapsed >= config.cooldownSeconds;

  return {
    filter: "cooldown",
    verdict: passed ? "pass" : "skip",
    reason: passed
      ? `${Math.round(elapsed)}s since last run (min ${config.cooldownSeconds}s)`
      : `Only ${Math.round(elapsed)}s since last run (need ${config.cooldownSeconds}s)`,
  };
}

function checkVolatility(
  candles: OHLCV[],
  config: EngineConfig
): FilterResult {
  if (candles.length < 5) {
    return {
      filter: "volatility",
      verdict: "pass",
      reason: "Insufficient candles — skipping volatility check",
    };
  }

  // Calculate average true range of recent candles
  const recent = candles.slice(-14);
  const ranges = recent.map((c) => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const passed = avgRange >= config.minVolatilityPoints;

  return {
    filter: "volatility",
    verdict: passed ? "pass" : "skip",
    reason: passed
      ? `Avg range ${avgRange.toFixed(2)} pts ≥ ${config.minVolatilityPoints} min`
      : `Low volatility: avg range ${avgRange.toFixed(2)} pts < ${config.minVolatilityPoints} min`,
  };
}

function checkRelativeVolume(
  snapshot: MarketSnapshot,
  config: EngineConfig
): FilterResult {
  const candles = snapshot.recentCandles;
  if (candles.length < 10) {
    return {
      filter: "relative_volume",
      verdict: "pass",
      reason: "Insufficient candles — skipping volume check",
    };
  }

  const avgVolume =
    candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
  const currentVolume = snapshot.quote.volume;

  // Relative volume: current session volume vs average candle volume
  const relVol = avgVolume > 0 ? currentVolume / avgVolume : 1;
  const passed = relVol >= config.minRelativeVolume;

  return {
    filter: "relative_volume",
    verdict: passed ? "pass" : "skip",
    reason: passed
      ? `Relative volume ${relVol.toFixed(2)} ≥ ${config.minRelativeVolume} threshold`
      : `Low volume: relative ${relVol.toFixed(2)} < ${config.minRelativeVolume} threshold`,
  };
}

function checkLevelProximity(
  snapshot: MarketSnapshot,
  config: EngineConfig
): FilterResult {
  const price = snapshot.quote.lastPrice;
  const levels = snapshot.levels;

  const keyLevels = [
    levels.sessionHigh,
    levels.sessionLow,
    levels.vwap,
    levels.overnightHigh,
    levels.overnightLow,
    levels.previousDayHigh,
    levels.previousDayLow,
    levels.previousDayClose,
    levels.openingRangeHigh,
    levels.openingRangeLow,
  ].filter((v): v is number => v != null);

  if (keyLevels.length === 0) {
    return {
      filter: "level_proximity",
      verdict: "pass",
      reason: "No key levels available — skipping proximity check",
    };
  }

  const closest = keyLevels.reduce((best, lvl) => {
    const dist = Math.abs(price - lvl) / price;
    return dist < best.dist ? { lvl, dist } : best;
  }, { lvl: 0, dist: Infinity });

  const nearLevel = closest.dist <= config.levelProximityThreshold;

  return {
    filter: "level_proximity",
    verdict: nearLevel ? "pass" : "skip",
    reason: nearLevel
      ? `Price near key level ${closest.lvl.toFixed(2)} (${(closest.dist * 100).toFixed(3)}%)`
      : `Price not near any key level (closest: ${closest.lvl.toFixed(2)} at ${(closest.dist * 100).toFixed(3)}%)`,
  };
}

function checkNoTradeRules(strategy: Strategy): FilterResult {
  if (!strategy.noTradeRules || strategy.noTradeRules.trim() === "") {
    return {
      filter: "no_trade_rules",
      verdict: "pass",
      reason: "No no-trade rules defined",
    };
  }

  // No-trade rules are natural language — injected into Claude prompt as {{no_trade_rules}}.
  // Cannot be evaluated programmatically. Claude is responsible for honoring them.
  // This filter passes but signals to the trace that rules exist and are delegated.
  return {
    filter: "no_trade_rules",
    verdict: "pass",
    reason: `No-trade rules active (${strategy.noTradeRules.length} chars) — delegated to Claude via prompt`,
  };
}

function checkScheduleFilter(strategy: Strategy): FilterResult {
  if (!strategy.scheduleFilter || strategy.scheduleFilter.trim() === "") {
    return {
      filter: "schedule_filter",
      verdict: "pass",
      reason: "No schedule filter defined",
    };
  }

  // Schedule filters are natural language — delegated to Claude.
  // Hard schedule boundaries enforced by checkTradingHours above.
  return {
    filter: "schedule_filter",
    verdict: "pass",
    reason: `Schedule filter active (${strategy.scheduleFilter.length} chars) — delegated to Claude`,
  };
}

function checkNewsFilter(strategy: Strategy): FilterResult {
  if (!strategy.newsFilter || strategy.newsFilter.trim() === "") {
    return {
      filter: "news_filter",
      verdict: "pass",
      reason: "No news filter defined",
    };
  }

  // News risk is natural language — no news API integrated yet.
  // Delegated to Claude prompt. User must verify manually before FOMC/CPI/NFP etc.
  return {
    filter: "news_filter",
    verdict: "pass",
    reason: `News filter active (${strategy.newsFilter.length} chars) — delegated to Claude (no news API)`,
  };
}

function checkDuplicateSignal(
  recentSignals: Signal[],
  config: EngineConfig,
  instrument: string
): FilterResult {
  // B7: Filter by same instrument before dedup
  const sameInstrument = recentSignals.filter(
    (s) => s.instrument === instrument
  );

  if (sameInstrument.length === 0) {
    return {
      filter: "duplicate_signal",
      verdict: "pass",
      reason: "No recent signals for this instrument",
    };
  }

  const lastN = sameInstrument.slice(0, config.maxConsecutiveSameSignal);
  if (lastN.length < config.maxConsecutiveSameSignal) {
    return {
      filter: "duplicate_signal",
      verdict: "pass",
      reason: `Only ${lastN.length} recent ${instrument} signals — below dedup threshold`,
    };
  }

  const allSame = lastN.every((s) => s.action === lastN[0].action);

  return {
    filter: "duplicate_signal",
    verdict: allSame ? "skip" : "pass",
    reason: allSame
      ? `Last ${config.maxConsecutiveSameSignal} signals all ${lastN[0].action} — skipping to avoid repetition`
      : "Recent signals are varied — no dedup needed",
  };
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Determines if a UTC date falls within US Eastern Daylight Time.
 * US DST: 2nd Sunday of March 2:00 AM → 1st Sunday of November 2:00 AM.
 * This is server-timezone-independent — uses only UTC + DST rules.
 */
function isDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed

  // Jan, Feb, Dec = definitely EST (no DST)
  if (month < 2 || month > 10) return false;
  // Apr–Oct = definitely EDT (DST active)
  if (month > 2 && month < 10) return true;

  // March: DST starts 2nd Sunday at 2:00 AM ET (7:00 AM UTC)
  if (month === 2) {
    const firstDay = new Date(Date.UTC(year, 2, 1)).getUTCDay();
    const secondSunday = firstDay === 0 ? 8 : 15 - firstDay;
    const dstStart = Date.UTC(year, 2, secondSunday, 7, 0, 0); // 2AM ET = 7AM UTC
    return date.getTime() >= dstStart;
  }

  // November: DST ends 1st Sunday at 2:00 AM EDT (6:00 AM UTC)
  if (month === 10) {
    const firstDay = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    const firstSunday = firstDay === 0 ? 1 : 8 - firstDay;
    const dstEnd = Date.UTC(year, 10, firstSunday, 6, 0, 0); // 2AM EDT = 6AM UTC
    return date.getTime() < dstEnd;
  }

  return false;
}

function fmtHour(decimal: number): string {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
