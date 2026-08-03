/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRuntimeInstallationReconciler,
  RUNTIME_RECONCILE_WINDOW_MS,
} from '@/renderer/services/runtime/runtimeInstallationReconciler';
import type { IRuntimeStatusEvent } from '@/common/adapter/ipcBridge';

const failed = (scopeId: string): IRuntimeStatusEvent => ({
  resource: 'node',
  scope: { kind: 'custom_agent', id: scopeId },
  phase: 'failed',
  failure_kind: 'bundled_resource_invalid',
  message: 'os error 1450',
});

const ready = (scopeId: string): IRuntimeStatusEvent => ({
  resource: 'node',
  scope: { kind: 'conversation', id: scopeId },
  phase: 'ready',
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('runtimeInstallationReconciler', () => {
  it('retracts the dialog and suppresses the report when node ready arrives in-window (cross-scope)', () => {
    const close = vi.fn();
    const report = vi.fn();
    const r = createRuntimeInstallationReconciler({ showDialog: () => ({ close }), report });

    r.handleStatus(failed('custom_agent-1')); // failed on custom_agent scope
    r.handleStatus(ready('conversation-9')); // ready from a DIFFERENT scope

    vi.advanceTimersByTime(RUNTIME_RECONCILE_WINDOW_MS + 100);
    expect(close).toHaveBeenCalledTimes(1); // dialog retracted
    expect(report).not.toHaveBeenCalled(); // deferred report suppressed
  });

  it('reports at window end when no node ready arrives', () => {
    const close = vi.fn();
    const report = vi.fn();
    const r = createRuntimeInstallationReconciler({ showDialog: () => ({ close }), report });

    r.handleStatus(failed('custom_agent-1'));
    expect(report).not.toHaveBeenCalled(); // deferred, not immediate
    vi.advanceTimersByTime(RUNTIME_RECONCILE_WINDOW_MS + 100);
    expect(report).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('flushes a not-yet-due report on flushPending (beforeunload/unmount)', () => {
    const report = vi.fn();
    const r = createRuntimeInstallationReconciler({ showDialog: () => ({ close: vi.fn() }), report });

    r.handleStatus(failed('custom_agent-1'));
    vi.advanceTimersByTime(5000); // still inside the window
    r.flushPending();
    expect(report).toHaveBeenCalledTimes(1); // persistent failure not lost on early exit
  });
});
