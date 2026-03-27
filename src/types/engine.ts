// ─── Pre-filter system ───────────────────────────────────────

export type FilterVerdict = "pass" | "skip";

export interface FilterResult {
  filter: string;
  verdict: FilterVerdict;
  reason: string;
}

export interface PreFilterReport {
  passed: boolean;
  results: FilterResult[];
  timestamp: string;
}

// ─── Engine run trace (full audit of why a signal was/wasn't generated) ───

export type EngineRunOutcome =
  | "signal_generated"
  | "filtered_out"
  | "error"
  | "cooldown"
  | "duplicate";

export interface EngineRunTrace {
  id: string;
  outcome: EngineRunOutcome;
  instrument: string;
  timeframe: string;
  strategyName: string | null;
  promptName: string | null;
  filterReport: PreFilterReport | null;
  signalId: string | null;
  error: string | null;
  durationMs: number;
  timestamp: string;
}

// ─── Engine config ───────────────────────────────────────────

export interface EngineConfig {
  /** Minimum seconds between Claude calls */
  cooldownSeconds: number;
  /** Minimum ATR-equivalent move to consider volatility valid */
  minVolatilityPoints: number;
  /** How close price must be to a key level (as fraction, e.g. 0.002 = 0.2%) */
  levelProximityThreshold: number;
  /** Minimum relative volume (vs session average) */
  minRelativeVolume: number;
  /** Trading hours in ET: [startHour, endHour] */
  tradingHoursET: [number, number];
  /** Maximum identical signals in a row before dedup kicks in */
  maxConsecutiveSameSignal: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  cooldownSeconds: 120,
  minVolatilityPoints: 5,
  levelProximityThreshold: 0.003,
  minRelativeVolume: 0.3,
  tradingHoursET: [9.5, 16],
  maxConsecutiveSameSignal: 3,
};
