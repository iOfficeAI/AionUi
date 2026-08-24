/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generalized collapsible/resizable section for the SCM panel (VS Code SCM sidebar
 * parity). The panel stacks N of these; the framework is intentionally not hard-wired
 * to two, so a future `graph` section drops in as a third with no mechanism change.
 *
 * Layout contract (the hard requirement): **every section header is always visible.**
 * Headers are `flex-shrink-0`; only bodies give or take space. A section with more
 * content than room scrolls inside its own body — it can never grow tall enough to
 * push another section's header off-screen.
 *
 * Sizing: a section with `fitContent` (the repositories list) sizes to its content up
 * to a cap and never leaves blank space below its rows. Other sections flex to fill.
 * A drag handle between two sections re-splits the space between them; the dragged
 * height is persisted by the caller via `onResize`.
 */

import { Down, Right } from '@icon-park/react';
import React from 'react';

export type ScmSectionProps = {
  /** Stable section id (`'repositories'`, `'changes'`, …) for persistence keys. */
  id: string;
  /** Header label (already localized by the caller). */
  title: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /**
   * Header-right action slot (e.g. the Changes section's tree/list toggle and bulk
   * buttons). Clicks here must not toggle the section, so the slot stops propagation.
   */
  actions?: React.ReactNode;
  /** A short count/summary rendered dimmed after the title (e.g. changed-file count). */
  badge?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * A section shell: an always-visible header row plus a collapsible body. Pure
 * presentation — collapse state and body height live in the store; this only
 * renders them and reports intents up. The body's height styling is applied by the
 * parent stack (`ScmSectionStack`), so this component stays layout-agnostic.
 */
export const ScmSection: React.FC<ScmSectionProps> = ({
  id,
  title,
  collapsed,
  onToggleCollapsed,
  actions,
  badge,
  children,
}) => {
  return (
    <>
      <div
        data-scm-section-header={id}
        className='flex-shrink-0 flex items-center gap-4px h-24px px-6px cursor-pointer select-none hover:bg-[var(--bg-2)]'
        onClick={onToggleCollapsed}
        role='button'
        aria-expanded={!collapsed}
      >
        {collapsed ? <Right theme='outline' size='14' /> : <Down theme='outline' size='14' />}
        <span className='text-13px font-600 uppercase tracking-wide text-t-secondary truncate'>{title}</span>
        {badge != null && <span className='text-12px text-t-tertiary flex-shrink-0'>{badge}</span>}
        {actions != null && (
          <span className='ms-auto flex items-center gap-2px' onClick={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
      </div>
      {!collapsed && children}
    </>
  );
};

/**
 * Vertical drag handle placed between two sections. On every move it reports the
 * signed cumulative pixel delta measured from the drag start; the caller applies it
 * to a base height captured when the drag began. Cumulative reporting (instead of
 * per-move increments) keeps the math correct even though the caller's `onDrag`
 * closure is the one captured at pointerdown — with increments, every step would be
 * applied to the same stale base and all but the last one would be lost. A thin
 * visible line with a wider invisible grab area, so it is easy to grab.
 */
export const ScmSectionDivider: React.FC<{
  onDrag: (totalDeltaY: number) => void;
  onDragEnd?: () => void;
  /** Double-click resets the split (caller clears the stored height → natural size). */
  onDoubleReset?: () => void;
}> = ({ onDrag, onDragEnd, onDoubleReset }) => {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const startY = e.clientY;
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent): void => {
      onDrag(ev.clientY - startY);
    };
    const finish = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      onDragEnd?.();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  };
  return (
    <div
      data-scm-section-divider
      className='flex-shrink-0 relative h-1px bg-[var(--bg-3)] cursor-row-resize'
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleReset}
      role='separator'
      aria-orientation='horizontal'
    >
      <div className='absolute start-0 end-0 -top-3px h-7px' />
    </div>
  );
};
