/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before importing
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getNpxCacheDir: vi.fn(() => '/tmp/npx'),
  getWindowsShellExecutionOptions: vi.fn(() => ({})),
  resolveNpxPath: vi.fn(() => 'npx'),
}));

import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';

// Helper to access private members in tests
function priv(conn: AcpConnection): Record<string, unknown> {
  return conn as unknown as Record<string, unknown>;
}

describe('AcpConnection - prompt keepalive', () => {
  let conn: AcpConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    conn = new AcpConnection();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('startPromptKeepalive sets an interval that is cleared by stopPromptKeepalive', () => {
    expect(priv(conn).promptKeepaliveInterval).toBeNull();

    priv(conn).startPromptKeepalive.call(conn);
    expect(priv(conn).promptKeepaliveInterval).not.toBeNull();

    priv(conn).stopPromptKeepalive.call(conn);
    expect(priv(conn).promptKeepaliveInterval).toBeNull();
  });

  it('keepalive resets prompt timeouts when child process is alive', () => {
    // Set up a mock child process that is alive
    priv(conn).child = { killed: false, exitCode: null, signalCode: null, pid: 1234 };

    // Add a pending session/prompt request with a timeout
    const rejectFn = vi.fn();
    const pendingRequest = {
      resolve: vi.fn(),
      reject: rejectFn,
      timeoutId: setTimeout(() => {}, 300_000),
      method: 'session/prompt',
      isPaused: false,
      startTime: Date.now() - 200_000, // 200s ago
      timeoutDuration: 300_000,
      promptOriginTime: Date.now() - 200_000, // 200s ago — within 300s cap
    };
    priv(conn).pendingRequests.set(42, pendingRequest);

    // Start keepalive
    priv(conn).startPromptKeepalive.call(conn);

    // Advance 60 seconds — keepalive should fire and reset the timeout
    const oldStartTime = pendingRequest.startTime;
    vi.advanceTimersByTime(60_000);

    // startTime should have been reset to ~now (i.e. much more recent)
    expect(pendingRequest.startTime).toBeGreaterThan(oldStartTime);
    // The request should NOT have been rejected
    expect(rejectFn).not.toHaveBeenCalled();

    // Clean up
    priv(conn).stopPromptKeepalive.call(conn);
    if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
  });

  it('keepalive does NOT reset timeouts when child process is dead', () => {
    // Set up a mock child process that is killed
    priv(conn).child = { killed: true, pid: 1234 };

    const pendingRequest = {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeoutId: setTimeout(() => {}, 300_000),
      method: 'session/prompt',
      isPaused: false,
      startTime: Date.now() - 200_000,
      timeoutDuration: 300_000,
      promptOriginTime: Date.now() - 200_000,
    };
    priv(conn).pendingRequests.set(42, pendingRequest);

    priv(conn).startPromptKeepalive.call(conn);

    const oldStartTime = pendingRequest.startTime;
    vi.advanceTimersByTime(60_000);

    // startTime should NOT have been reset — child is dead
    expect(pendingRequest.startTime).toBe(oldStartTime);

    priv(conn).stopPromptKeepalive.call(conn);
    if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
  });

  it('keepalive does NOT reset timeouts when child exited naturally (exitCode set, killed still false)', () => {
    // This is the exact gap fixed by isChildAlive(): a naturally-crashed child
    // leaves killed=false until the exit event is processed, but exitCode is
    // set by the runtime immediately when the process exits.
    priv(conn).child = { killed: false, exitCode: 1, signalCode: null, pid: 1234 };

    const pendingRequest = {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeoutId: setTimeout(() => {}, 300_000),
      method: 'session/prompt',
      isPaused: false,
      startTime: Date.now() - 200_000,
      timeoutDuration: 300_000,
      promptOriginTime: Date.now() - 200_000,
    };
    priv(conn).pendingRequests.set(42, pendingRequest);

    priv(conn).startPromptKeepalive.call(conn);

    const oldStartTime = pendingRequest.startTime;
    vi.advanceTimersByTime(60_000);

    // startTime should NOT have been reset — child has already exited
    expect(pendingRequest.startTime).toBe(oldStartTime);

    priv(conn).stopPromptKeepalive.call(conn);
    if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
  });

  it('keepalive does NOT reset timeouts when wall-clock budget is exceeded (hung process)', () => {
    priv(conn).child = { killed: false, exitCode: null, signalCode: null, pid: 1234 };

    const pendingRequest = {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeoutId: setTimeout(() => {}, 300_000),
      method: 'session/prompt',
      isPaused: false,
      startTime: Date.now() - 200_000,
      timeoutDuration: 300_000,
      promptOriginTime: Date.now() - 350_000, // 350s ago — exceeds 300s budget
    };
    priv(conn).pendingRequests.set(42, pendingRequest);

    priv(conn).startPromptKeepalive.call(conn);

    const oldStartTime = pendingRequest.startTime;
    vi.advanceTimersByTime(60_000);

    // startTime should NOT have been reset — wall-clock cap exceeded
    expect(pendingRequest.startTime).toBe(oldStartTime);

    priv(conn).stopPromptKeepalive.call(conn);
    if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
  });

  it('keepalive does NOT reset non-prompt requests', () => {
    priv(conn).child = { killed: false, exitCode: null, signalCode: null, pid: 1234 };

    const pendingRequest = {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeoutId: setTimeout(() => {}, 60_000),
      method: 'session/new', // NOT a session/prompt
      isPaused: false,
      startTime: Date.now() - 50_000,
      timeoutDuration: 60_000,
      promptOriginTime: Date.now() - 50_000,
    };
    priv(conn).pendingRequests.set(42, pendingRequest);

    priv(conn).startPromptKeepalive.call(conn);

    const oldStartTime = pendingRequest.startTime;
    vi.advanceTimersByTime(60_000);

    // startTime should NOT have been reset — not a session/prompt
    expect(pendingRequest.startTime).toBe(oldStartTime);

    priv(conn).stopPromptKeepalive.call(conn);
    if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
  });

  it('disconnect stops the keepalive interval', async () => {
    priv(conn).startPromptKeepalive.call(conn);
    expect(priv(conn).promptKeepaliveInterval).not.toBeNull();

    await conn.disconnect();
    expect(priv(conn).promptKeepaliveInterval).toBeNull();
  });

  it('handleProcessExit stops the keepalive interval', () => {
    priv(conn).startPromptKeepalive.call(conn);
    expect(priv(conn).promptKeepaliveInterval).not.toBeNull();

    // Simulate process exit
    priv(conn).handleProcessExit.call(conn, 1, null);
    expect(priv(conn).promptKeepaliveInterval).toBeNull();
  });

  it('startPromptKeepalive is idempotent (clears previous interval)', () => {
    priv(conn).startPromptKeepalive.call(conn);
    const first = priv(conn).promptKeepaliveInterval;

    priv(conn).startPromptKeepalive.call(conn);
    const second = priv(conn).promptKeepaliveInterval;

    // Should be a new interval, not the same one
    expect(second).not.toBe(first);

    priv(conn).stopPromptKeepalive.call(conn);
  });
});
