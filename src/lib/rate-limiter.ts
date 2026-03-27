/**
 * Simple in-memory sliding-window rate limiter.
 * Tracks timestamps of events and checks if count exceeds limit.
 */

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  maxPerHour: number
): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const windowMs = 3600_000; // 1 hour
  const cutoff = now - windowMs;

  // Get or create bucket
  let timestamps = buckets.get(key) ?? [];

  // Purge expired entries
  timestamps = timestamps.filter((t) => t > cutoff);
  buckets.set(key, timestamps);

  const remaining = Math.max(0, maxPerHour - timestamps.length);
  const oldestInWindow = timestamps.length > 0 ? timestamps[0] : now;
  const resetInSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);

  if (timestamps.length >= maxPerHour) {
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  return { allowed: true, remaining, resetInSeconds };
}

export function recordEvent(key: string): void {
  const timestamps = buckets.get(key) ?? [];
  timestamps.push(Date.now());
  buckets.set(key, timestamps);
}

export function getEventCount(key: string): number {
  const now = Date.now();
  const cutoff = now - 3600_000;
  const timestamps = buckets.get(key) ?? [];
  return timestamps.filter((t) => t > cutoff).length;
}
