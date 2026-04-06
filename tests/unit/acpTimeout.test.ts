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

    // Simulate process exit so the keepalive does not reset the timeout timer
    (conn as any).child.killed = true;

    // At 61s — should have timed out
    vi.advanceTimersByTime(2000);
    expect(cancelSpy).toHaveBeenCalled();

    return promptPromise;
  });
});

// ─── Permission request timeout ────────────────────────────────────────────

describe('AcpAgent permission request timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT auto-reject permission requests within 30 minutes', () => {
    const { agent } = makeAgent();
    const pendingPermissions = (agent as any).pendingPermissions as Map<string, any>;

    // Simulate a permission request being stored
    const rejectFn = vi.fn();
    const requestId = 'test-perm-1';
    pendingPermissions.set(requestId, { resolve: vi.fn(), reject: rejectFn });

    // Manually invoke the timeout logic that handlePermissionRequest sets up
    const timeoutFn = () => {
      if (pendingPermissions.has(requestId)) {
        pendingPermissions.delete(requestId);
        rejectFn(new Error('Permission request timed out'));
      }
    };
    const timer = setTimeout(timeoutFn, 1800000);

    // Advance 70 seconds (the old timeout value)
    vi.advanceTimersByTime(70000);
    expect(pendingPermissions.has(requestId)).toBe(true);
    expect(rejectFn).not.toHaveBeenCalled();

    // Advance to 29 minutes
    vi.advanceTimersByTime(1670000);
    expect(pendingPermissions.has(requestId)).toBe(true);
    expect(rejectFn).not.toHaveBeenCalled();

    // Advance past 30 minutes
    vi.advanceTimersByTime(70000);
    expect(pendingPermissions.has(requestId)).toBe(false);
    expect(rejectFn).toHaveBeenCalled();

    clearTimeout(timer);
  });
});

// ─── Resume timeout after permission pause ─────────────────────────────────

describe('AcpConnection resume timeout after permission pause', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should reset startTime when resuming from a permission pause', () => {
    const conn = makeConnection();
    const pendingRequests = (conn as any).pendingRequests as Map<number, any>;

    const request = {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeoutId: setTimeout(() => {}, 300000),
      method: 'session/prompt',
      isPaused: false,
      startTime: Date.now(),
      timeoutDuration: 300000,
      promptOriginTime: Date.now(),
    };
    pendingRequests.set(1, request);

    // Pause the request (simulating permission dialog shown)
    (conn as any).pauseRequestTimeout(1);
    expect(request.isPaused).toBe(true);

    // Advance time beyond the original timeout duration
    vi.advanceTimersByTime(600000); // 10 minutes

    // Resume the request (simulating permission dialog resolved)
    (conn as any).resumeRequestTimeout(1);

    // Should NOT have timed out — startTime was reset
    expect(request.isPaused).toBe(false);
    expect(request.reject).not.toHaveBeenCalled();
    expect(request.timeoutId).toBeDefined();

    // The full timeout duration should restart from now
    vi.advanceTimersByTime(299000);
    expect(request.reject).not.toHaveBeenCalled();

    clearTimeout(request.timeoutId);
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

describe('AcpAgent disconnect messaging', () => {
  it('does not emit status or error messages on idle-timeout disconnect', () => {
    const onStreamEvent = vi.fn();
    const onSignalEvent = vi.fn();
    const agent = new AcpAgent({
      id: 'idle-agent',
      onStreamEvent,
      onSignalEvent,
      extra: { backend: 'opencode' as any, workspace: '/tmp' },
    } as any);

    (agent as any).handleDisconnect({ code: null, signal: 'SIGTERM' });

    // Should NOT emit disconnected status or error messages
    const statusCalls = onStreamEvent.mock.calls.filter(
      ([evt]: [any]) => evt.type === 'agent_status' && evt.data?.status === 'disconnected'
    );
    const errorCalls = onStreamEvent.mock.calls.filter(([evt]: [any]) => evt.type === 'error');
    expect(statusCalls).toHaveLength(0);
    expect(errorCalls).toHaveLength(0);

    // Should still emit finish signal to reset UI loading state
    expect(onSignalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finish',
        conversation_id: 'idle-agent',
        data: null,
      })
    );
  });

  it('does not emit status or error messages on unexpected disconnect', () => {
    const onStreamEvent = vi.fn();
    const onSignalEvent = vi.fn();
    const agent = new AcpAgent({
      id: 'disconnect-agent',
      onStreamEvent,
      onSignalEvent,
      extra: { backend: 'opencode' as any, workspace: '/tmp' },
    } as any);

    (agent as any).handleDisconnect({ code: null, signal: 'SIGTERM' });

    // Should NOT emit disconnected status or error messages
    const statusCalls = onStreamEvent.mock.calls.filter(
      ([evt]: [any]) => evt.type === 'agent_status' && evt.data?.status === 'disconnected'
    );
    const errorCalls = onStreamEvent.mock.calls.filter(([evt]: [any]) => evt.type === 'error');
    expect(statusCalls).toHaveLength(0);
    expect(errorCalls).toHaveLength(0);

    // Should still emit finish signal to reset UI loading state
    expect(onSignalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finish',
        conversation_id: 'disconnect-agent',
        data: null,
      })
    );
  });

  it('clears internal state after disconnect', () => {
    const onStreamEvent = vi.fn();
    const onSignalEvent = vi.fn();
    const agent = new AcpAgent({
      id: 'cleanup-agent',
      onStreamEvent,
      onSignalEvent,
      extra: { backend: 'opencode' as any, workspace: '/tmp' },
    } as any);

    // Set up some internal state
    (agent as any).pendingPermissions.set('perm-1', { resolve: vi.fn(), reject: vi.fn() });
    (agent as any).statusMessageId = 'some-status-id';

    (agent as any).handleDisconnect({ code: null, signal: 'SIGTERM' });

    // Internal state should be cleared
    expect((agent as any).pendingPermissions.size).toBe(0);
    expect((agent as any).statusMessageId).toBeNull();
  });
});

describe('AcpAgent file operation presentation', () => {
  it('emits ACP file reads as tool-call steps instead of plain text messages', () => {
    const onStreamEvent = vi.fn();
    const agent = new AcpAgent({
      id: 'file-op-agent',
      onStreamEvent,
      extra: { backend: 'codex' as any, workspace: '/tmp' },
    } as any);

    (agent as any).handleFileOperation({
      method: 'fs/read_text_file',
      path: '/tmp/example.md',
      sessionId: 'session-1',
    });

    expect(onStreamEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_tool_call',
        conversation_id: 'file-op-agent',
        data: expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'tool_call',
            status: 'completed',
            title: 'File Read',
            kind: 'read',
            rawInput: expect.objectContaining({
              file_path: '/tmp/example.md',
              method: 'fs/read_text_file',
            }),
          }),
        }),
      })
    );

    expect(onStreamEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content',
        data: expect.stringContaining('File read'),
      })
    );
  });
});
