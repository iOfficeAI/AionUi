import { useState, useEffect, useCallback, useRef } from "react";
import type { KanbanSummary, KanbanStatus, KanbanTask } from "./types";

const DEFAULT_POLL_MS = 30_000;
const DEFAULT_API_URL = "http://127.0.0.1:9122/api/kanban";
const FALLBACK_API_URLS = [DEFAULT_API_URL, "http://localhost:9122/api/kanban"];
const KANBAN_STATUSES: KanbanStatus[] = ["running", "ready", "done", "todo", "blocked"];

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
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toTimestampSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
  }
  return undefined;
}

function getStatusCounts(source: unknown): Partial<Record<KanbanStatus, number>> {
  if (!isRecord(source)) {
    return {};
  }

  return KANBAN_STATUSES.reduce<Partial<Record<KanbanStatus, number>>>((acc, status) => {
    acc[status] = toFiniteNumber(source[status]);
    return acc;
  }, {});
}

function getLatestStatsSnapshot(source: UnknownRecord): UnknownRecord | null {
  const tasks = Array.isArray(source.tasks) ? source.tasks : [];
  for (const task of tasks) {
    if (isRecord(task) && isRecord(task.stats)) {
      return task;
    }
  }
  return null;
}

function normalizeSummary(source: UnknownRecord): KanbanSummary {
  const summary = isRecord(source.summary) ? source.summary : {};
  const latestSnapshot = getLatestStatsSnapshot(source);
  const latestByStatus = latestSnapshot && isRecord(latestSnapshot.stats) ? latestSnapshot.stats.by_status : undefined;
  const summaryCounts = getStatusCounts(summary);
  const latestCounts = getStatusCounts(latestByStatus);
  const hasSummaryCounts = KANBAN_STATUSES.some((status) => (summaryCounts[status] ?? 0) > 0);
  const counts = hasSummaryCounts ? summaryCounts : latestCounts;
  const statusTotal = KANBAN_STATUSES.reduce((total, status) => total + (counts[status] ?? 0), 0);
  const reportedTotal = toFiniteNumber(summary.total, statusTotal);

  return {
    running: counts.running ?? 0,
    ready: counts.ready ?? 0,
    done: counts.done ?? 0,
    todo: counts.todo ?? 0,
    blocked: counts.blocked ?? 0,
    total: Math.max(reportedTotal, statusTotal),
  };
}

function normalizeTasks(source: UnknownRecord): KanbanTask[] {
  const rawTasks = Array.isArray(source.tasks) ? source.tasks : [];
  const concreteTasks = rawTasks.flatMap((task, index): KanbanTask[] => {
    if (!isRecord(task)) {
      return [];
    }

    const status =
      typeof task.status === "string" && KANBAN_STATUSES.includes(task.status as KanbanStatus)
        ? (task.status as KanbanStatus)
        : null;
    if (!status) {
      return [];
    }

    return [{
      id: String(task.id ?? `kanban-task-${index}`),
      title: String(task.title ?? task.name ?? `Kanban task ${index + 1}`),
      body: typeof task.body === "string" ? task.body : typeof task.description === "string" ? task.description : undefined,
      assignee: typeof task.assignee === "string" ? task.assignee : null,
      status,
      priority: toFiniteNumber(task.priority, 0),
      created_at: toTimestampSeconds(task.created_at ?? task.createdAt ?? task.timestamp),
      started_at: toTimestampSeconds(task.started_at ?? task.startedAt) ?? null,
      completed_at: toTimestampSeconds(task.completed_at ?? task.completedAt) ?? null,
    }];
  });

  if (concreteTasks.length > 0) {
    return concreteTasks;
  }

  const latestSnapshot = getLatestStatsSnapshot(source);
  if (!latestSnapshot || !isRecord(latestSnapshot.stats)) {
    return [];
  }

  const byStatus = getStatusCounts(latestSnapshot.stats.by_status);
  const createdAt = toTimestampSeconds(latestSnapshot.timestamp);
  return KANBAN_STATUSES.flatMap((status): KanbanTask[] => {
    const count = byStatus[status] ?? 0;
    if (count <= 0) {
      return [];
    }
    return [{
      id: `kanban-${status}-aggregate`,
      title: `${count} ${status} item${count === 1 ? "" : "s"}`,
      body: "Aggregate from the latest Nova Kanban snapshot.",
      assignee: "Nova Kanban",
      status,
      priority: status === "blocked" ? 4 : status === "running" ? 3 : 2,
      created_at: createdAt,
      started_at: null,
      completed_at: null,
    }];
  });
}

function normalizeKanbanResponse(payload: unknown): {
  summary: KanbanSummary;
  tasks: KanbanTask[];
  staleCount: number;
  staleHours: number;
} {
  const source = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(source)) {
    throw new Error("Kanban API returned an invalid payload");
  }
  if (source.ok === false) {
    throw new Error("Kanban API returned ok: false");
  }

  return {
    summary: normalizeSummary(source),
    tasks: normalizeTasks(source),
    staleCount: toFiniteNumber(source.stale_count ?? source.staleCount),
    staleHours: toFiniteNumber(source.stale_hours ?? source.staleHours, 24),
  };
}

function getApiUrls(primaryUrl: string): string[] {
  return [primaryUrl, ...FALLBACK_API_URLS].filter((url, index, urls) => urls.indexOf(url) === index);
}

async function fetchKanbanJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function useKanbanData(options: UseKanbanDataOptions = {}): UseKanbanDataReturn {
  const { apiUrl = DEFAULT_API_URL, pollIntervalMs = DEFAULT_POLL_MS } = options;

  const [summary, setSummary] = useState<KanbanSummary | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [staleHours, setStaleHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (manual = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    if (manual) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const payload = await Promise.any(getApiUrls(apiUrl).map((candidateUrl) => fetchKanbanJson(candidateUrl, controller.signal)));
      const data = normalizeKanbanResponse(payload);
      setSummary(data.summary);
      setTasks(data.tasks);
      setStaleCount(data.staleCount);
      setStaleHours(data.staleHours);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      // Promise.any() rejects with an AggregateError whose message is the
      // unhelpful native string "All promises were rejected" once every
      // candidate URL fails — surface a plain-English connectivity message
      // instead of that raw internal detail.
      if ((err as Error).name === "AggregateError") {
        setError("Nova Kanban service is offline (no candidate URL responded)");
        setLoading(false);
        setIsRefreshing(false);
        return;
      }
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
