// Nova Kanban Widget — Shared Types
// Drop these into Aion UI src/renderer/components/kanban/ or any React project

export interface KanbanTask {
  id: string;
  title: string;
  body?: string;
  assignee?: string | null;
  status: "running" | "ready" | "done" | "todo" | "blocked";
  priority?: number;
  created_at?: number;
  started_at?: number | null;
  completed_at?: number | null;
}

export interface KanbanSummary {
  running: number;
  ready: number;
  done: number;
  todo: number;
  blocked: number;
  total: number;
}

export interface KanbanApiResponse {
  ok: boolean;
  timestamp: string;
  summary: KanbanSummary;
  stale_count: number;
  stale_hours: number;
  tasks?: KanbanTask[];
}

export const PRIORITY_THRESHOLDS = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const;

export type KanbanStatus = keyof Omit<KanbanSummary, "total">;
