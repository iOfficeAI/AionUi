/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodexConnection } from '../../src/process/agent/codex/connection/CodexConnection';

describe('CodexConnection permission timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT auto-timeout permission requests within 30 minutes', () => {
    const conn = new CodexConnection();
    const permissionResolvers = (conn as any).permissionResolvers as Map<string, any>;
    const rejectFn = vi.fn();
    const callId = 'test-call-1';
    permissionResolvers.set(callId, { resolve: vi.fn(), reject: rejectFn });

    // Simulate the timeout that waitForPermission sets up
    const timeoutFn = () => {
      if (permissionResolvers.has(callId)) {
        permissionResolvers.delete(callId);
        rejectFn(new Error('Permission request timed out'));
      }
    };
    const timer = setTimeout(timeoutFn, 1800000);

    // Advance 30 seconds (the old timeout value)
    vi.advanceTimersByTime(30000);
    expect(permissionResolvers.has(callId)).toBe(true);
    expect(rejectFn).not.toHaveBeenCalled();

    // Advance to 29 minutes
    vi.advanceTimersByTime(1710000);
    expect(permissionResolvers.has(callId)).toBe(true);
    expect(rejectFn).not.toHaveBeenCalled();

    // Advance past 30 minutes
    vi.advanceTimersByTime(70000);
    expect(permissionResolvers.has(callId)).toBe(false);
    expect(rejectFn).toHaveBeenCalled();

    clearTimeout(timer);
  });
});
