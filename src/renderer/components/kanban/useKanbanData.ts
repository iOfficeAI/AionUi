import { useState, useEffect, useCallback, useRef } from "react";
import type { KanbanApiResponse, KanbanSummary, KanbanTask } from "./types";

const DEFAULT_POLL_MS = 30_000; // 30 s
const DEFAULT_API_URL = "http://127.0.0.1:9122/api/kanban";

interface UseKanbanDataOptions {
  apiUrl?: string;
  pollIntervalMs?: number;
}

interface UseKanbanDataReturn {
  summary: KanbanSummary | null;
  tasks: KanbanTask[];
  staleCount: number;
  staleHours: number;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useKanbanData(options: UseKanbanDataOptions = {}): UseKanbanDataReturn {
  const {
    apiUrl = DEFAULT_API_URL,
    pollIntervalMs = DEFAULT_POLL_MS,
  } = options;

  const [summary, setSummary] = useState<KanbanSummary | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [staleHours, setStaleHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    if (isManualRefresh) setIsRefreshing(true);
    setError(null);

    try {
      const res = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data: KanbanApiResponse = await res.json();
      if (!data.ok) {
        throw new Error("API returned ok: false");
      }
      setSummary(data.summary);
      setTasks(data.tasks ?? []);
      setStaleCount(data.stale_count);
      setStaleHours(data.stale_hours);
      setLastUpdated(new Date());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "Unknown error");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [apiUrl]);

  const refresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, pollIntervalMs);
    return () => {
      clearInterval(timer);
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchData, pollIntervalMs]);

  return {
    summary,
    tasks,
    staleCount,
    staleHours,
    loading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
  };
}
