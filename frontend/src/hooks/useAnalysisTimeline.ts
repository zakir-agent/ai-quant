import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { getAnalysisHistory, type AnalysisReport } from "@/lib/api";

export interface DayGroup {
  date: string;
  reports: AnalysisReport[];
  avgSentiment: number;
  latestTrend: string;
  latestRisk: string;
}

export interface UseAnalysisTimelineReturn {
  dayGroups: DayGroup[];
  selectedIds: number[];
  expandedDays: Set<string>;
  hasMore: boolean;
  loadingMore: boolean;
  setHasMore: (v: boolean) => void;
  toggleNode: (id: number) => void;
  toggleDay: (dateStr: string) => void;
  loadMore: () => Promise<void>;
  clearSelection: () => void;
}

function toDayKey(isoStr: string): string {
  return isoStr.slice(0, 10);
}

function groupByDay(reports: AnalysisReport[]): DayGroup[] {
  const map = new Map<string, AnalysisReport[]>();
  for (const r of reports) {
    const key = toDayKey(r.created_at);
    const arr = map.get(key);
    if (arr) {
      arr.push(r);
    } else {
      map.set(key, [r]);
    }
  }

  const groups: DayGroup[] = [];
  for (const [date, dayReports] of map) {
    const avgSentiment =
      dayReports.reduce((sum, r) => sum + r.sentiment_score, 0) / dayReports.length;
    const latest = dayReports[0];
    groups.push({
      date,
      reports: dayReports,
      avgSentiment: Math.round(avgSentiment),
      latestTrend: latest.trend,
      latestRisk: latest.risk_level,
    });
  }

  groups.sort((a, b) => a.date.localeCompare(b.date));
  return groups;
}

export function useAnalysisTimeline(
  scope: string,
  reports: AnalysisReport[],
  setReports: Dispatch<SetStateAction<AnalysisReport[]>>,
): UseAnalysisTimelineReturn {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const dayGroups = useMemo(() => groupByDay(reports), [reports]);

  const toggleNode = useCallback((id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length === 0) {
        return [id];
      }
      if (prev.length === 1) {
        return [prev[0], id];
      }
      return [prev[0], id];
    });
    setExpandedDays((prev) => {
      const report = reports.find((r) => r.id === id);
      if (!report) return prev;
      const dayKey = toDayKey(report.created_at);
      if (prev.has(dayKey)) return prev;
      const next = new Set(prev);
      next.add(dayKey);
      return next;
    });
  }, [reports]);

  const toggleDay = useCallback((dateStr: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await getAnalysisHistory(scope, 20, reports.length);
      setReports((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...res.reports.filter((r) => !seen.has(r.id))];
      });
      setHasMore(res.has_more);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [scope, reports.length, loadingMore, hasMore, setReports]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  return {
    dayGroups,
    selectedIds,
    expandedDays,
    hasMore,
    loadingMore,
    setHasMore,
    toggleNode,
    toggleDay,
    loadMore,
    clearSelection,
  };
}
