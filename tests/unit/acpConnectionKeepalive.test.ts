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

vi.mock('./acpConnectors', () => ({
  ACP_PERF_LOG: false,
  connectClaude: vi.fn(),
  connectCodebuddy: vi.fn(),
  connectCodex: vi.fn(),
  prepareCleanEnv: vi.fn(() => ({})),
  spawnGenericBackend: vi.fn(),
}));

vi.mock('./utils', () => ({
  killChild: vi.fn(),
  readTextFile: vi.fn(),
  writeJsonRpcMessage: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('./modelInfo', () => ({
  buildAcpModelInfo: vi.fn(),
  summarizeAcpModelInfo: vi.fn(),
}));

import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';

// Helper to access private members in tests
function priv(conn: AcpConnection): Record<string, any> {
  return conn as unknown as Record<string, any>;
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
    priv(conn).child = { killed: false, pid: 1234 };

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

  it('keepalive does NOT reset non-prompt requests', () => {
    priv(conn).child = { killed: false, pid: 1234 };

    const pendingRequest = {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeoutId: setTimeout(() => {}, 60_000),
      method: 'session/new', // NOT a session/prompt
      isPaused: false,
      startTime: Date.now() - 50_000,
      timeoutDuration: 60_000,
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
