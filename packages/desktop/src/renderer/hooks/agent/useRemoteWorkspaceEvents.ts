/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useRemoteWorkspaceEvents — shared subscription layer for the Phase 3 WS4
 * pushed events:
 *
 *   - `ipcBridge.remoteAgent.workspaceChanged` (debounced server-side
 *     ≥250ms) — fired when a remote OpenCode workspace reports
 *     `file.watcher.updated`. Consumers use it to refresh mtime-based UI
 *     (Preview, Editor, optional file tree) without polling.
 *   - `ipcBridge.remoteAgent.sessionHealth` — fired on
 *     `session.idle` / `session.error`. Consumers use it to surface health
 *     indicators and reconcile state.
 *
 * Why a module-level singleton:
 *   The events are broadcast on the shared WebSocket; opening one
 *   `.on(...)` per consumer would just re-register the same handler many
 *   times. This module subscribes at most once and re-dispatches to all
 *   registered consumers. The cost of an off-station event is a single
 *   string compare per consumer.
 *
 * Consumers:
 *   - `useRemoteWorkspaceChanged(agentId?, cb, { debounceMs })` — for
 *     per-conversation UI that only cares about a specific agent.
 *   - `useRemoteSessionHealth(agentId?, cb)` — same shape, no debounce.
 *
 * `agentId` may be `null`/`undefined` to listen to *all* agents (used by
 * the global health card, which tracks every configured agent).
 */

import { ipcBridge } from '@/common';
import type { RemoteSessionHealthEvent, RemoteWorkspaceChangedEvent } from '@/common/types/agent/bgProcessTypes';
import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Module-level singleton subscription
// ---------------------------------------------------------------------------

type WorkspaceListener = (event: RemoteWorkspaceChangedEvent) => void;
type SessionHealthListener = (event: RemoteSessionHealthEvent) => void;

interface RegisteredWorkspaceListener {
  agentId: string | null;
  callback: WorkspaceListener;
}

interface RegisteredSessionHealthListener {
  agentId: string | null;
  callback: SessionHealthListener;
}

const workspaceListeners = new Set<RegisteredWorkspaceListener>();
const sessionHealthListeners = new Set<RegisteredSessionHealthListener>();

let workspaceUnsubscribe: (() => void) | null = null;
let sessionHealthUnsubscribe: (() => void) | null = null;

const dispatchWorkspaceChanged = (event: RemoteWorkspaceChangedEvent): void => {
  // agentId is an exact-match; null means "any agent".
  for (const listener of workspaceListeners) {
    if (listener.agentId !== null && listener.agentId !== event.agent_id) continue;
    try {
      listener.callback(event);
    } catch (err) {
      // Never let one consumer's throw kill the broadcast chain.
      console.error('[useRemoteWorkspaceEvents] workspaceChanged listener threw:', err);
    }
  }
};

const dispatchSessionHealth = (event: RemoteSessionHealthEvent): void => {
  for (const listener of sessionHealthListeners) {
    if (listener.agentId !== null && listener.agentId !== event.agent_id) continue;
    try {
      listener.callback(event);
    } catch (err) {
      console.error('[useRemoteWorkspaceEvents] sessionHealth listener threw:', err);
    }
  }
};

const ensureWorkspaceSubscription = (): void => {
  if (workspaceUnsubscribe) return;
  workspaceUnsubscribe = ipcBridge.remoteAgent.workspaceChanged.on(dispatchWorkspaceChanged);
};

const ensureSessionHealthSubscription = (): void => {
  if (sessionHealthUnsubscribe) return;
  sessionHealthUnsubscribe = ipcBridge.remoteAgent.sessionHealth.on(dispatchSessionHealth);
};

const teardownWorkspaceSubscription = (): void => {
  // Only drop the underlying `.on(...)` when the LAST consumer
  // unmounts — keeps a single subscription alive for the whole app.
  if (workspaceListeners.size > 0) return;
  if (!workspaceUnsubscribe) return;
  const off = workspaceUnsubscribe;
  workspaceUnsubscribe = null;
  off();
};

const teardownSessionHealthSubscription = (): void => {
  if (sessionHealthListeners.size > 0) return;
  if (!sessionHealthUnsubscribe) return;
  const off = sessionHealthUnsubscribe;
  sessionHealthUnsubscribe = null;
  off();
};

// Exposed for tests that need to verify subscription lifecycle.
export const __test__ = {
  listenerCounts: (): { workspace: number; sessionHealth: number } => ({
    workspace: workspaceListeners.size,
    sessionHealth: sessionHealthListeners.size,
  }),
  hasWorkspaceSubscription: (): boolean => workspaceUnsubscribe !== null,
  hasSessionHealthSubscription: (): boolean => sessionHealthUnsubscribe !== null,
  // Test-only reset. Wipes the singleton state so each test file
  // starts with a clean subscription map.
  __resetSingletons: (): void => {
    if (workspaceUnsubscribe) {
      workspaceUnsubscribe();
      workspaceUnsubscribe = null;
    }
    if (sessionHealthUnsubscribe) {
      sessionHealthUnsubscribe();
      sessionHealthUnsubscribe = null;
    }
    workspaceListeners.clear();
    sessionHealthListeners.clear();
  },
};

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

export interface UseRemoteWorkspaceChangedOptions {
  /**
   * Trailing debounce (ms) applied before invoking the consumer callback.
   * Storms of `workspaceChanged` events for the same file path coalesce
   * into one callback fire. Defaults to 200 ms — long enough to coalesce
   * a save + 2-3 mtime syncs, short enough to feel instantaneous.
   * Set to 0 to disable.
   */
  debounceMs?: number;
  /**
   * When false, the subscription is set up but no callbacks fire. Used to
   * keep the hook mounted without paying for handler work (e.g. when a
   * feature is gated by a permission). Defaults to true.
   */
  enabled?: boolean;
}

/**
 * Subscribe to `remote.workspaceChanged` events.
 *
 * @param agentId Agent id to filter on, or `null`/`undefined` for "all".
 * @param callback Handler invoked for matching events. Already debounced.
 * @param options Debounce + enable flags.
 */
export const useRemoteWorkspaceChanged = (
  agentId: string | null | undefined,
  callback: (event: RemoteWorkspaceChangedEvent) => void,
  options: UseRemoteWorkspaceChangedOptions = {}
): void => {
  const { debounceMs = 200, enabled = true } = options;
  // Refs let the underlying subscription always see the latest callback
  // and config without re-subscribing (which would cost a fresh `.on(...)`
  // and re-subscribe the singleton).
  const callbackRef = useRef(callback);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Buffer only the LAST event — coalescing into a single trailing fire is
  // exactly what "stops thrashing React" requires. Per-file debouncing
  // would be more correct for editors with multiple dirty files, but the
  // downstream refresh path is already idempotent (mtime short-circuits).
  const pendingRef = useRef<RemoteWorkspaceChangedEvent | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    ensureWorkspaceSubscription();

    const entry: RegisteredWorkspaceListener = {
      agentId: agentId ?? null,
      callback: (event) => {
        if (!enabledRef.current) return;
        pendingRef.current = event;
        if (debounceMs <= 0) {
          callbackRef.current(event);
          pendingRef.current = null;
          return;
        }
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (pending) callbackRef.current(pending);
        }, debounceMs);
      },
    };
    workspaceListeners.add(entry);
    return () => {
      workspaceListeners.delete(entry);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      teardownWorkspaceSubscription();
    };
    // The hook re-subscribes only when the *target agent* changes; a new
    // callback is picked up via callbackRef. Re-subscribing on every
    // callback identity would invalidate the singleton's stable entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, debounceMs, enabled]);
};

/**
 * Subscribe to `remote.sessionHealth` events (no debounce — these are
 * sparse and the consumer decides what to do with each one).
 *
 * @param agentId Agent id to filter on, or `null`/`undefined` for "all".
 * @param callback Handler invoked for matching events.
 */
export const useRemoteSessionHealth = (
  agentId: string | null | undefined,
  callback: (event: RemoteSessionHealthEvent) => void
): void => {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    ensureSessionHealthSubscription();
    const entry: RegisteredSessionHealthListener = {
      agentId: agentId ?? null,
      callback: (event) => callbackRef.current(event),
    };
    sessionHealthListeners.add(entry);
    return () => {
      sessionHealthListeners.delete(entry);
      teardownSessionHealthSubscription();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);
};
