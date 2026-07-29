/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Layout-level collapse state for the Project Explorer host column (stage3 FULL /
 * P3). This is the host's own collapse concern — the explorer *component* it hosts
 * stays mounted (the column shrinks to width 0 rather than unmounting), so the WS
 * subscriptions and tree survive collapse just like they survive a same-project
 * conversation switch (no remount).
 *
 * Seam: reuses the existing `WORKSPACE_TOGGLE_EVENT` bus so every toggle
 * affordance already wired for the legacy workspace panel — the mac Titlebar
 * button, the keyboard shortcut, and any platform button — drives the explorer
 * too. For a project conversation the legacy ChatLayout handler is inert
 * (`workspaceEnabled === false`, it returns without `preventDefault`), so this
 * host handler is the sole actor; for a non-project conversation `active` is
 * false here and ChatLayout owns the event. No double-handling.
 *
 * Scope: desktop persists the collapse preference per project (switch away and
 * back restores it, consistent with the no-remount principle). Mobile starts
 * collapsed and force-collapses on project change (the overlay must not linger
 * across projects), and does not persist.
 */

import { useEffect, useRef, useState } from 'react';

import { WORKSPACE_TOGGLE_EVENT, dispatchWorkspaceStateEvent } from '@/renderer/utils/workspace/workspaceEvents';

const COLLAPSE_KEY_PREFIX = 'project-panel-collapse:';

const collapseKey = (projectId: string): string => `${COLLAPSE_KEY_PREFIX}${projectId}`;

/** Read the persisted desktop preference for a project (default: expanded). */
const readStoredCollapsed = (projectId: string | null): boolean => {
  if (!projectId || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(collapseKey(projectId)) === 'collapsed';
  } catch {
    return false;
  }
};

type UseProjectPanelCollapseParams = {
  /** Owning project id, or null when no project is bound. */
  projectId: string | null;
  /** Mobile viewport — starts collapsed, force-collapses on project change, no persist. */
  isMobile: boolean;
  /** True when a project host is live (project bound). Gates event handling. */
  active: boolean;
};

type UseProjectPanelCollapseReturn = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

export function useProjectPanelCollapse({
  projectId,
  isMobile,
  active,
}: UseProjectPanelCollapseParams): UseProjectPanelCollapseReturn {
  const [collapsed, setCollapsed] = useState<boolean>(() => (isMobile ? true : readStoredCollapsed(projectId)));

  // Mirror ref so the event handler reads current state without re-subscribing.
  const collapsedRef = useRef(collapsed);
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  // Re-init when the project or platform changes: desktop restores the per-project
  // preference; mobile always starts collapsed (overlay hidden) and must not carry
  // an open overlay across a project switch.
  useEffect(() => {
    setCollapsed(isMobile ? true : readStoredCollapsed(projectId));
  }, [projectId, isMobile]);

  // Single toggle seam: handle WORKSPACE_TOGGLE_EVENT only when a project host is
  // live. Desktop persists the new state per project.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleToggle = (event: Event) => {
      if (!active || !projectId) return; // non-project conversation → ChatLayout owns it
      event.preventDefault();
      const next = !collapsedRef.current;
      setCollapsed(next);
      if (!isMobile) {
        try {
          localStorage.setItem(collapseKey(projectId), next ? 'collapsed' : 'expanded');
        } catch {
          // ignore persistence errors
        }
      }
    };
    window.addEventListener(WORKSPACE_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(WORKSPACE_TOGGLE_EVENT, handleToggle);
  }, [active, projectId, isMobile]);

  // Broadcast collapse state so the mac Titlebar workspace button's icon stays in
  // sync (it listens for WORKSPACE_STATE_EVENT). Only when this host is live —
  // otherwise ChatLayout owns the broadcast for the legacy workspace panel.
  useEffect(() => {
    if (!active) return;
    dispatchWorkspaceStateEvent(collapsed);
  }, [collapsed, active]);

  return { collapsed, setCollapsed };
}
