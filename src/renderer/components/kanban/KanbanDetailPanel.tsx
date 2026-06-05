import { useMemo, useEffect, useRef } from "react";
import type { KanbanTask, KanbanStatus } from "./types";
import { PRIORITY_THRESHOLDS } from "./types";

interface KanbanDetailPanelProps {
  status: KanbanStatus | null;
  tasks: KanbanTask[];
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

const STATUS_LABELS: Record<KanbanStatus, string> = {
  running: "Running",
  ready: "Ready",
  done: "Done",
  todo: "Todo",
  blocked: "Blocked",
};

const STATUS_COLORS: Record<KanbanStatus, string> = {
  running: "var(--nk-accent)",
  ready: "var(--nk-amber)",
  done: "var(--nk-green)",
  todo: "var(--nk-slate)",
  blocked: "var(--nk-rose)",
};

function formatAge(ts?: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function priorityLabel(p?: number): string {
  if (p === undefined || p === null) return "—";
  if (p >= PRIORITY_THRESHOLDS.critical) return "Critical";
  if (p >= PRIORITY_THRESHOLDS.high) return "High";
  if (p >= PRIORITY_THRESHOLDS.medium) return "Medium";
  return "Low";
}

function priorityClass(p?: number): string {
  if (p === undefined || p === null) return "nk-priority--none";
  if (p >= PRIORITY_THRESHOLDS.critical) return "nk-priority--critical";
  if (p >= PRIORITY_THRESHOLDS.high) return "nk-priority--high";
  if (p >= PRIORITY_THRESHOLDS.medium) return "nk-priority--medium";
  return "nk-priority--low";
}

export default function KanbanDetailPanel({ status, tasks, onClose, triggerRef }: KanbanDetailPanelProps) {
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);

  /* Scroll lock */
  useEffect(() => {
    if (!status) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [status]);

  /* Escape key + focus restoration */
  useEffect(() => {
    if (!status) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    firstFocusableRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      triggerRef?.current?.focus();
    };
  }, [status, onClose, triggerRef]);

  const filtered = useMemo(() => {
    if (!status) return [];
    return tasks
      .filter((t) => t.status === status)
      .toSorted((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pb !== pa) return pb - pa;
        const aa = a.created_at ?? 0;
        const ab = b.created_at ?? 0;
        return aa - ab;
      });
  }, [status, tasks]);

  if (!status) return null;

  return (
    <div className="nova-kanban-detail__overlay" onClick={onClose} role="presentation">
      <div
        className="nova-kanban-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kanban-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="nova-kanban-detail__header">
          <div className="nova-kanban-detail__title-wrap">
            <span
              className="nova-kanban-detail__dot"
              style={{ background: STATUS_COLORS[status] }}
              aria-hidden="true"
            />
            <h3 id="kanban-detail-title" className="nova-kanban-detail__title">
              {STATUS_LABELS[status]}
            </h3>
            <span className="nova-kanban-detail__count">{filtered.length}</span>
          </div>
          <button
            ref={firstFocusableRef}
            className="nova-kanban-detail__close"
            onClick={onClose}
            aria-label="Close detail panel"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Task list */}
        <div className="nova-kanban-detail__body">
          {filtered.length === 0 ? (
            <div className="nova-kanban-detail__empty">
              <span className="nova-kanban-detail__empty-icon">📭</span>
              <p>No tasks in this column.</p>
            </div>
          ) : (
            <ul className="nova-kanban-detail__list" role="list">
              {filtered.map((task) => (
                <li key={task.id} className="nova-kanban-detail__item">
                  <div className="nova-kanban-detail__row">
                    <span className="nova-kanban-detail__id">#{task.id.slice(-6)}</span>
                    <span className={`nova-kanban-detail__priority ${priorityClass(task.priority)}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </div>
                  <div className="nova-kanban-detail__title-text">{task.title}</div>
                  {task.body && (
                    <div className="nova-kanban-detail__body-text">{task.body}</div>
                  )}
                  <div className="nova-kanban-detail__meta">
                    {task.assignee ? (
                      <span className="nova-kanban-detail__assignee" title={`Assignee: ${task.assignee}`}>
                        👤 {task.assignee}
                      </span>
                    ) : (
                      <span className="nova-kanban-detail__assignee nova-kanban-detail__assignee--unassigned">
                        👤 unassigned
                      </span>
                    )}
                    <span className="nova-kanban-detail__age" title={`Created: ${task.created_at ? new Date(task.created_at * 1000).toLocaleString() : "unknown"}`}>
                      ⏱ {formatAge(task.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
