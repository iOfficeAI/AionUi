/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';
import { AcpAgent } from '../../src/process/agent/acp/index';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Create an AcpConnection with internal state set up for testing */
function makeConnection(): AcpConnection {
  const conn = new AcpConnection();
  // Set up internal state to simulate an active session
  (conn as any).sessionId = 'test-session';
  (conn as any).backend = 'claude';
  (conn as any).child = {
    stdin: { write: vi.fn() },
    killed: false,
    pid: 12345,
  };
  return conn;
}

// ─── setPromptTimeout ───────────────────────────────────────────────────────

describe('AcpConnection.setPromptTimeout', () => {
  it('should set timeout in milliseconds', () => {
    const conn = makeConnection();
    conn.setPromptTimeout(120);
    expect((conn as any).promptTimeoutMs).toBe(120000);
  });

  it('should enforce minimum of 30 seconds', () => {
    const conn = makeConnection();
    conn.setPromptTimeout(5);
    expect((conn as any).promptTimeoutMs).toBe(30000);
  });

  it('should default to 300 seconds', () => {
    const conn = new AcpConnection();
    expect((conn as any).promptTimeoutMs).toBe(300000);
  });
});

// ─── cancelPrompt ───────────────────────────────────────────────────────────

describe('AcpConnection.cancelPrompt', () => {
  it('should send session/cancel notification via stdin', () => {
    const conn = makeConnection();
    const writeFn = (conn as any).child.stdin.write;

    conn.cancelPrompt();

    expect(writeFn).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeFn.mock.calls[0][0].replace(/\r?\n$/, ''));
    expect(written.method).toBe('session/cancel');
    expect(written.params.sessionId).toBe('test-session');
  });

  it('should resolve and clear all pending session/prompt requests', () => {
    const conn = makeConnection();
    const resolveFn = vi.fn();
    const pendingRequests = (conn as any).pendingRequests as Map<number, any>;

    // Add a session/prompt request
    const timeoutId = setTimeout(() => {}, 100000);
    pendingRequests.set(1, {
      resolve: resolveFn,
      reject: vi.fn(),
      timeoutId,
      method: 'session/prompt',
      isPaused: false,
      startTime: Date.now(),
      timeoutDuration: 300000,
    });

    // Add a non-prompt request (should NOT be cleared)
    pendingRequests.set(2, {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeoutId: undefined,
      method: 'session/new',
      isPaused: false,
      startTime: Date.now(),
      timeoutDuration: 60000,
    });

    conn.cancelPrompt();

    expect(resolveFn).toHaveBeenCalledWith(null);
    expect(pendingRequests.has(1)).toBe(false);
    expect(pendingRequests.has(2)).toBe(true); // non-prompt request preserved
    clearTimeout(timeoutId);
  });

  it('should be a no-op when no active session', () => {
    const conn = new AcpConnection();
    // No sessionId set — should not throw
    expect(() => conn.cancelPrompt()).not.toThrow();
  });
});

// ─── handlePromptTimeout ────────────────────────────────────────────────────

describe('AcpConnection timeout handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call cancelPrompt on session/prompt timeout', async () => {
    const conn = makeConnection();
    conn.setPromptTimeout(30); // 30 seconds

    const cancelSpy = vi.spyOn(conn, 'cancelPrompt');

    // Trigger sendPrompt which internally calls sendRequest
    const promptPromise = conn.sendPrompt('test').catch((err) => err);

    // Advance past the timeout
    vi.advanceTimersByTime(31000);

    const error = await promptPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('LLM request timed out');
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('should NOT call cancelPrompt for non-prompt request timeout', () => {
    const conn = makeConnection();
    const cancelSpy = vi.spyOn(conn, 'cancelPrompt');

    // Directly test handlePromptTimeout with a non-prompt method
    const request = {
      resolve: vi.fn(),
      reject: vi.fn(),
      method: 'session/new',
      isPaused: false,
      startTime: Date.now(),
      timeoutDuration: 60000,
    };
    (conn as any).pendingRequests.set(99, request);

    (conn as any).handlePromptTimeout(99, request);

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(request.reject).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('session/new timed out') })
    );
  });

  it('should use configured timeout duration for session/prompt', () => {
    const conn = makeConnection();
    conn.setPromptTimeout(60); // 60 seconds

    const cancelSpy = vi.spyOn(conn, 'cancelPrompt');

    const promptPromise = conn.sendPrompt('test').catch(() => {});

    // At 59s — should not have timed out
    vi.advanceTimersByTime(59000);
    expect(cancelSpy).not.toHaveBeenCalled();

    // At 61s — should have timed out
    vi.advanceTimersByTime(2000);
    expect(cancelSpy).toHaveBeenCalled();

    return promptPromise;
  });
});

// ─── AcpAgent.cancelPrompt ─────────────────────────────────────────────────

/** Create an AcpAgent with minimal mocked internals */
function makeAgent() {
  const onStreamEvent = vi.fn();
  const onSignalEvent = vi.fn();
  const agent = new AcpAgent({
    id: 'test-agent',
    onStreamEvent,
    onSignalEvent,
    extra: { backend: 'claude' as any, workspace: '/tmp' },
  } as any);
  // Mock the connection's cancelPrompt to avoid real stdin writes
  vi.spyOn((agent as any).connection, 'cancelPrompt').mockImplementation(() => {});
  return { agent, onSignalEvent };
}

describe('AcpAgent.cancelPrompt', () => {
  it('should call connection.cancelPrompt', () => {
    const { agent } = makeAgent();
    const connCancelSpy = (agent as any).connection.cancelPrompt;

    agent.cancelPrompt();

    expect(connCancelSpy).toHaveBeenCalledTimes(1);
  });

  it('should reject all pending permission dialogs', () => {
    const { agent } = makeAgent();
    const pendingPermissions = (agent as any).pendingPermissions as Map<number, any>;
    const rejectFn1 = vi.fn();
    const rejectFn2 = vi.fn();

    pendingPermissions.set(1, { resolve: vi.fn(), reject: rejectFn1 });
    pendingPermissions.set(2, { resolve: vi.fn(), reject: rejectFn2 });

    agent.cancelPrompt();

    expect(rejectFn1).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cancelled' }));
    expect(rejectFn2).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cancelled' }));
    expect(pendingPermissions.size).toBe(0);
  });

  it('should emit finish signal via onSignalEvent', () => {
    const { agent, onSignalEvent } = makeAgent();

    agent.cancelPrompt();

    expect(onSignalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finish',
        conversation_id: 'test-agent',
        data: null,
      })
    );
  });
});

// ─── AcpAgent.kill ──────────────────────────────────────────────────────────

describe('AcpAgent.kill', () => {
  it('should call connection.disconnect', async () => {
    const { agent } = makeAgent();
    const disconnectSpy = vi.spyOn((agent as any).connection, 'disconnect').mockResolvedValue(undefined);

    await agent.kill();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('should emit finish stream event', async () => {
    const { agent } = makeAgent();
    vi.spyOn((agent as any).connection, 'disconnect').mockResolvedValue(undefined);
    const onStreamEvent = (agent as any).onStreamEvent;

    await agent.kill();

    expect(onStreamEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finish',
        conversation_id: 'test-agent',
        data: null,
      })
    );
  });
});
