import type { KlineCandle } from "./api";

const MINUTE = 60;

/** Maps composite timeframe string → bucket size in minutes. */
export const COMPOSITE_TIMEFRAMES: Record<string, number> = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
};

/**
 * Aggregate 1-minute candles into a larger timeframe.
 * Buckets are aligned to UTC boundaries (floor of timestamp / bucketSeconds).
 * Incomplete buckets (fewer candles than bucket size) are dropped.
 */
export function aggregateKlines(candles: KlineCandle[], targetMinutes: number): KlineCandle[] {
  const bucketSec = targetMinutes * MINUTE;
  const buckets = new Map<number, KlineCandle[]>();

  for (const c of candles) {
    const bucketTime = Math.floor(c.time / bucketSec) * bucketSec;
    const arr = buckets.get(bucketTime);
    if (arr) {
      arr.push(c);
    } else {
      buckets.set(bucketTime, [c]);
    }
  }

  const result: KlineCandle[] = [];
  for (const [time, arr] of buckets) {
    if (arr.length < targetMinutes) continue;
    result.push({
      time,
      open: arr[0].open,
      high: Math.max(...arr.map((c) => c.high)),
      low: Math.min(...arr.map((c) => c.low)),
      close: arr[arr.length - 1].close,
      volume: arr.reduce((sum, c) => sum + c.volume, 0),
    });
  }

  return result;
}
