import { COMPOSITE_TIMEFRAMES } from "./kline-aggregate";

export const KLINE_INITIAL_LIMIT = 200;
export const KLINE_LOAD_CHUNK = 200;
export const KLINE_MAX_LIMIT = 6000;
/** Load more when fewer than this many bars remain before the visible range. */
export const KLINE_LOAD_THRESHOLD = 30;

/** Max display bars for a timeframe given the API 1m cap. */
export function maxBarsForTimeframe(timeframe: string): number {
  const bucketMin = COMPOSITE_TIMEFRAMES[timeframe];
  if (bucketMin) return Math.floor(KLINE_MAX_LIMIT / bucketMin);
  return KLINE_MAX_LIMIT;
}

/** Candles span the left 2/3 of the chart; the right 1/3 stays empty. */
export const KLINE_DEFAULT_FILL_RATIO = 2 / 3;

/** Default number of recent bars shown on first load (readable bar width). */
export const KLINE_DEFAULT_VISIBLE_BARS = 120;

/** Visible logical range anchored on recent bars; last bar at ~2/3 chart width. */
export function defaultLogicalRange(barCount: number): { from: number; to: number } | null {
  if (barCount <= 1) return null;
  const lastIndex = barCount - 1;
  const shown = Math.min(barCount, KLINE_DEFAULT_VISIBLE_BARS);
  const from = Math.max(0, lastIndex - shown + 1);
  const span = lastIndex - from;
  if (span <= 0) return { from: 0, to: 1 };
  const to = from + span / KLINE_DEFAULT_FILL_RATIO;
  return { from, to };
}

/** Right margin in bar units so loaded data fills ~2/3 of the viewport. */
export function defaultRightOffset(barCount: number): number {
  const shown = Math.min(barCount, KLINE_DEFAULT_VISIBLE_BARS);
  return Math.max(5, Math.round(shown * ((1 - KLINE_DEFAULT_FILL_RATIO) / KLINE_DEFAULT_FILL_RATIO)));
}

/** API `limit` param for a target number of display bars. */
export function apiLimitForTimeframe(timeframe: string, barLimit: number): number {
  const bucketMin = COMPOSITE_TIMEFRAMES[timeframe];
  if (bucketMin) return Math.min(bucketMin * barLimit, KLINE_MAX_LIMIT);
  return Math.min(barLimit, KLINE_MAX_LIMIT);
}
