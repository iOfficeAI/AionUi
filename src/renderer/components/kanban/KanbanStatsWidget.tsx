import React, { useMemo, useState, useRef } from "react";
import { useKanbanData } from "./useKanbanData";
import KanbanDetailPanel from "./KanbanDetailPanel";
import type { KanbanStatus } from "./types";
import "./KanbanStatsWidget.css";

interface KanbanStatsWidgetProps {
  apiUrl?: string;
  pollIntervalMs?: number;
  className?: string;
}

const STATUS_CONFIG: Record<
  KanbanStatus,
  { label: string; colorVar: string }
> = {
  running: { label: "Running", colorVar: "var(--nk-accent)" },
  ready: { label: "Ready", colorVar: "var(--nk-amber)" },
  done: { label: "Done", colorVar: "var(--nk-green)" },
  todo: { label: "Todo", colorVar: "var(--nk-slate)" },
  blocked: { label: "Blocked", colorVar: "var(--nk-rose)" },
};

const STATUS_ORDER: KanbanStatus[] = [
  "running",
  "ready",
  "done",
  "todo",
  "blocked",
];

export default function KanbanStatsWidget({
  apiUrl,
  pollIntervalMs,
  className = "",
}: KanbanStatsWidgetProps) {
  const { summary, tasks, staleCount, staleHours, loading, isRefreshing, error, lastUpdated, refresh } =
    useKanbanData({ apiUrl, pollIntervalMs });

  const [selectedStatus, setSelectedStatus] = useState<KanbanStatus | null>(null);
  const triggerRefs = useRef<Record<KanbanStatus, HTMLButtonElement | null>>({
    running: null, ready: null, done: null, todo: null, blocked: null,
  });

  const timeString = useMemo(() => {
    if (!lastUpdated) return "—";
    const h = lastUpdated.getHours().toString().padStart(2, "0");
    const m = lastUpdated.getMinutes().toString().padStart(2, "0");
    const s = lastUpdated.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  }, [lastUpdated]);

  return (
    <div className={`nova-kanban-widget ${className}`} role="region" aria-label="Nova Kanban Stats">
      {/* Header */}
      <div className="nova-kanban-widget__header">
        <h2 className="nova-kanban-widget__title" id="kanban-widget-title">🎯 Nova Kanban</h2>
        <div className="nova-kanban-widget__meta">
          {isRefreshing && !error ? (
            <span className="nova-kanban-widget__shimmer" aria-hidden="true" />
          ) : error ? (
            <span className="nova-kanban-widget__pulse nova-kanban-widget__pulse--error" aria-label="Error" role="status" />
          ) : (
            <span className="nova-kanban-widget__pulse" aria-label="Live" role="status" />
          )}
          <span className="nova-kanban-widget__time">{timeString}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="nova-kanban-widget__alert">
          <span className="nova-kanban-widget__alert-icon">⚠️</span>
          <span className="nova-kanban-widget__error">{error}</span>
        </div>
      )}

      {/* Stale alert */}
      {!error && staleCount > 0 && (
        <div className="nova-kanban-widget__alert">
          <span className="nova-kanban-widget__alert-icon">🚨</span>
          <span>
            {staleCount} stale task{staleCount === 1 ? "" : "s"} older than{" "}
            {staleHours}h
          </span>
        </div>
      )}

      {/* Status grid */}
      <div className="nova-kanban-widget__grid">
        {STATUS_ORDER.map((status) => {
          const config = STATUS_CONFIG[status];
          const value = summary ? summary[status] : 0;
          return (
            <button
              key={status}
              ref={(el) => { triggerRefs.current[status] = el; }}
              className={`nova-kanban-widget__cell nova-kanban-widget__cell--${status}`}
              title={`${config.label}: ${value} — click to view tasks`}
              onClick={() => setSelectedStatus(status)}
              aria-label={`${config.label}: ${value} tasks, click to open detail panel`}
            >
              <div className="nova-kanban-widget__cell-value" aria-live="polite">
                {loading && !summary ? (
                  <span className="nova-kanban-widget__shimmer" aria-hidden="true" />
                ) : (
                  value
                )}
              </div>
              <div className="nova-kanban-widget__cell-label">{config.label}</div>
            </button>
          );
        })}
      </div>

      {/* Total */}
      <div className="nova-kanban-widget__total">
        <span className="nova-kanban-widget__total-label">Total Tasks</span>
        <span className="nova-kanban-widget__total-value" aria-live="polite">
          {loading && !summary ? (
            <span className="nova-kanban-widget__shimmer" aria-hidden="true" />
          ) : summary ? (
            summary.total
          ) : (
            "—"
          )}
        </span>
      </div>

      {/* Footer */}
      <div className="nova-kanban-widget__footer">
        <button
          className="nova-kanban-widget__refresh"
          onClick={refresh}
          disabled={isRefreshing}
          title="Refresh now"
          aria-label="Refresh kanban stats now"
        >
          {isRefreshing ? "⟳ Loading…" : "⟳ Refresh"}
        </button>
        <span className="nova-kanban-widget__time">
          {pollIntervalMs ? `Auto-refresh ${pollIntervalMs / 1000}s` : ""}
        </span>
      </div>

      {/* Detail panel */}
      <KanbanDetailPanel
        status={selectedStatus}
        tasks={tasks}
        onClose={() => setSelectedStatus(null)}
        triggerRef={{ current: selectedStatus ? triggerRefs.current[selectedStatus] : null }}
      />
    </div>
  );
}
