/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/common/types/acpTypes';
import AcpAgentManager from './AcpAgentManager';

export type PooledSession = {
  manager: AcpAgentManager;
  backend: string;
  createdAt: number;
};

/**
 * In-memory pool of pre-warmed AcpAgentManager instances (one per backend type).
 * Reduces cold start latency (~7-12s) by keeping a ready-to-claim session available.
 *
 * Pool sessions are NOT stored in DB and NOT registered in WorkerTaskManager until claimed.
 */
export class SessionPreheatPool {
  private static instance: SessionPreheatPool;
  private pool = new Map<string, PooledSession>();
  private refCounts = new Map<string, number>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  static getInstance(): SessionPreheatPool {
    if (!SessionPreheatPool.instance) {
      SessionPreheatPool.instance = new SessionPreheatPool();
    }
    return SessionPreheatPool.instance;
  }

  /**
   * Increment refcount for a backend. If pool doesn't have one, create it.
   * Cancel idle timer if one is running.
   */
  acquire(backend: string): void {
    const current = this.refCounts.get(backend) ?? 0;
    this.refCounts.set(backend, current + 1);

    // Cancel idle timer if running
    const timer = this.idleTimers.get(backend);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(backend);
    }

    // If pool doesn't have a session for this backend, create one
    if (!this.pool.has(backend)) {
      this.preheatForBackend(backend);
    }
  }

  /**
   * Decrement refcount. If drops to 0, start idle timer.
   */
  release(backend: string): void {
    const current = this.refCounts.get(backend) ?? 0;
    const next = Math.max(0, current - 1);
    this.refCounts.set(backend, next);

    if (next === 0 && !this.idleTimers.has(backend)) {
      const timer = setTimeout(() => {
        this.idleTimers.delete(backend);
        const pooled = this.pool.get(backend);
        if (pooled) {
          pooled.manager.kill();
          this.pool.delete(backend);
        }
        this.refCounts.delete(backend);
      }, SessionPreheatPool.IDLE_TIMEOUT_MS);
      this.idleTimers.set(backend, timer);
    }
  }

  /**
   * Called by conversation.create interception -- returns and removes the pooled session.
   * Returns null if no session for this backend.
   * After claiming, immediately refills the pool for the same backend.
   */
  claim(backend: string): PooledSession | null {
    const pooled = this.pool.get(backend);
    if (!pooled) {
      return null;
    }

    // Remove from pool
    this.pool.delete(backend);

    // Cancel idle timer
    const timer = this.idleTimers.get(backend);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(backend);
    }

    // Immediately refill the pool for this backend
    this.preheatForBackend(backend);

    return pooled;
  }

  /**
   * Check if a taskId is a pooled session (for WorkerTaskManager exclusion).
   * Uses the temp ID pattern `preheat-{backend}-{timestamp}`.
   */
  isPooled(taskId: string): boolean {
    for (const pooled of this.pool.values()) {
      if (pooled.manager.conversation_id === taskId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Cleanup everything: kill all pooled managers, clear all timers, clear all maps.
   */
  dispose(): void {
    for (const pooled of this.pool.values()) {
      pooled.manager.kill();
    }
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.pool.clear();
    this.refCounts.clear();
    this.idleTimers.clear();
  }

  /**
   * Create a pre-warmed AcpAgentManager for the given backend and add it to the pool.
   * The manager is created directly (not via WorkerTaskManager) and initAgent is called
   * fire-and-forget so the CLI process starts warming up immediately.
   */
  private preheatForBackend(backend: string): void {
    const tempId = `preheat-${backend}-${Date.now()}`;
    const manager = new AcpAgentManager({
      conversation_id: tempId,
      backend: backend as AcpBackend,
      workspace: '',
    });

    this.pool.set(backend, {
      manager,
      backend,
      createdAt: Date.now(),
    });

    // Fire-and-forget: start CLI subprocess in background
    manager.initAgent().catch((err) => {
      console.warn(`[SessionPreheatPool] Failed to preheat ${backend}:`, err);
      // Remove failed session from pool
      const current = this.pool.get(backend);
      if (current?.manager === manager) {
        this.pool.delete(backend);
      }
    });
  }
}

export function getSessionPreheatPool(): SessionPreheatPool {
  return SessionPreheatPool.getInstance();
}
