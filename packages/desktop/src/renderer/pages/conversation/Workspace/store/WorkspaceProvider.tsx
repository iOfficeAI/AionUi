/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useMemo, useRef } from 'react';
import { WorkspaceStore } from './workspaceStore';

interface WorkspaceContextValue {
  store: WorkspaceStore;
  workspace: string;
  conversationId: string;
  eventPrefix: 'acp' | 'codex' | 'aionrs';
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  workspace: string;
  conversationId: string;
  eventPrefix: 'acp' | 'codex' | 'aionrs';
  children: React.ReactNode;
}

/**
 * Owns the per-panel WorkspaceStore. The store survives only as long as the
 * provider mounts; conversation switches reset its contents via
 * useWorkspaceLifecycle (in useWorkspace.ts), not by remounting the provider.
 */
export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({
  workspace,
  conversationId,
  eventPrefix,
  children,
}) => {
  // The store is created once per provider mount. We don't recreate it on
  // workspace/conversation changes — useWorkspace handles those transitions
  // via store.reset(). Recreating would force every consumer hook to re-read
  // a fresh instance and lose any in-flight subscription bookkeeping.
  const storeRef = useRef<WorkspaceStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new WorkspaceStore(workspace, conversationId);
  }

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      store: storeRef.current!,
      workspace,
      conversationId,
      eventPrefix,
    }),
    [workspace, conversationId, eventPrefix]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  }
  return ctx;
}
