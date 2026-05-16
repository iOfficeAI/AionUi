// tests/unit/process/acp/session/PromptExecutor.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionUpdate } from '@agentclientprotocol/sdk';
import { PromptExecutor, type PromptHost } from '@process/acp/session/PromptExecutor';
import { noopMetrics } from '@process/acp/metrics/AcpMetrics';
import type { AgentConfig, SessionCallbacks, SessionStatus } from '@process/acp/types';

function createMockCallbacks(): SessionCallbacks {
  return {
    onMessage: vi.fn(),
    onSessionId: vi.fn(),
    onStatusChange: vi.fn(),
    onConfigUpdate: vi.fn(),
    onModelUpdate: vi.fn(),
    onModeUpdate: vi.fn(),
    onContextUsage: vi.fn(),
    onPermissionRequest: vi.fn(),
    onSignal: vi.fn(),
  };
}

const baseConfig: AgentConfig = {
  agentBackend: 'test',
  agentSource: 'builtin',
  agentId: 'builtin:test',
  cwd: '/tmp',
  command: '/usr/bin/test-agent',
  args: ['--stdio'],
};

function createMockHost(status: SessionStatus = 'prompting'): PromptHost & { _status: SessionStatus } {
  const promptMock = vi.fn(() => new Promise(() => {}));
  const cancelMock = vi.fn().mockResolvedValue(undefined);

  const host = {
    _status: status,
    get status() {
      return this._status;
    },
    lifecycle: {
      client: { prompt: promptMock, cancel: cancelMock },
      sessionId: 'sess-1',
      reassertConfig: vi.fn().mockResolvedValue(undefined),
      teardown: vi.fn().mockResolvedValue(undefined),
      setAuthPendingForPrompt: vi.fn(),
    } as unknown as PromptHost['lifecycle'],
    messageTranslator: { onTurnEnd: vi.fn() } as unknown as PromptHost['messageTranslator'],
    authNegotiator: { buildAuthRequiredData: vi.fn() } as unknown as PromptHost['authNegotiator'],
    callbacks: createMockCallbacks(),
    metrics: noopMetrics,
    agentConfig: baseConfig,
    setStatus(s: SessionStatus) {
      this._status = s;
    },
    enterError(_msg: string) {
      this._status = 'error';
    },
  };
  return host as PromptHost & { _status: SessionStatus };
}

function toolCallStart(id: string, status: 'pending' | 'in_progress' = 'in_progress'): SessionUpdate {
  return {
    sessionUpdate: 'tool_call',
    toolCallId: id,
    status,
    title: 'test tool',
    kind: 'execute',
  } as unknown as SessionUpdate;
}

function toolCallFinish(id: string, status: 'completed' | 'failed' = 'completed'): SessionUpdate {
  return {
    sessionUpdate: 'tool_call_update',
    toolCallId: id,
    status,
  } as unknown as SessionUpdate;
}

describe('PromptExecutor.trackToolCallLifecycle', () => {
  it('adds id on tool_call start', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle(toolCallStart('t1'));
    expect(exec.pendingToolCallCount).toBe(1);
  });

  it('removes id on tool_call_update completed', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle(toolCallStart('t1'));
    exec.trackToolCallLifecycle(toolCallFinish('t1', 'completed'));
    expect(exec.pendingToolCallCount).toBe(0);
  });

  it('removes id on tool_call_update failed', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle(toolCallStart('t1'));
    exec.trackToolCallLifecycle(toolCallFinish('t1', 'failed'));
    expect(exec.pendingToolCallCount).toBe(0);
  });

  it('handles a tool_call that arrives already completed (no add)', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle({
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      status: 'completed',
      title: 'x',
      kind: 'execute',
    } as unknown as SessionUpdate);
    expect(exec.pendingToolCallCount).toBe(0);
  });

  it('tracks multiple concurrent tool calls', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle(toolCallStart('t1'));
    exec.trackToolCallLifecycle(toolCallStart('t2'));
    expect(exec.pendingToolCallCount).toBe(2);
    exec.trackToolCallLifecycle(toolCallFinish('t1'));
    expect(exec.pendingToolCallCount).toBe(1);
    exec.trackToolCallLifecycle(toolCallFinish('t2'));
    expect(exec.pendingToolCallCount).toBe(0);
  });

  it('ignores updates without toolCallId', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle({
      sessionUpdate: 'tool_call',
      title: 'x',
      kind: 'execute',
    } as unknown as SessionUpdate);
    expect(exec.pendingToolCallCount).toBe(0);
  });

  it('stopTimer clears pending tool calls', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle(toolCallStart('t1'));
    exec.trackToolCallLifecycle(toolCallStart('t2'));
    exec.stopTimer();
    expect(exec.pendingToolCallCount).toBe(0);
  });

  it('ignores unrelated session updates', () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    exec.trackToolCallLifecycle({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'hi' },
    } as unknown as SessionUpdate);
    expect(exec.pendingToolCallCount).toBe(0);
  });
});

describe('PromptExecutor timeout deferral', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires timeout normally when no tool calls are pending', async () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    void exec.execute([{ type: 'text', text: 'hi' }]);

    // let microtasks settle so execute() reaches the timer.start() call
    await vi.advanceTimersByTimeAsync(0);

    vi.advanceTimersByTime(5000);

    expect(host.callbacks.onSignal).toHaveBeenCalledWith({
      type: 'error',
      message: 'Prompt timed out',
      recoverable: true,
    });
  });

  it('defers timeout while a tool call is in flight', async () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    void exec.execute([{ type: 'text', text: 'hi' }]);
    await vi.advanceTimersByTimeAsync(0);

    exec.trackToolCallLifecycle(toolCallStart('t1'));

    // First timeout window passes while tool is still running
    vi.advanceTimersByTime(5000);

    // Error signal should NOT have fired
    const signalCalls = (host.callbacks.onSignal as ReturnType<typeof vi.fn>).mock.calls;
    expect(signalCalls.some((c) => c[0]?.type === 'error')).toBe(false);

    // Another window — still deferred because tool is still pending
    vi.advanceTimersByTime(5000);
    const signalCalls2 = (host.callbacks.onSignal as ReturnType<typeof vi.fn>).mock.calls;
    expect(signalCalls2.some((c) => c[0]?.type === 'error')).toBe(false);
  });

  it('lets timeout fire after tool call completes', async () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    void exec.execute([{ type: 'text', text: 'hi' }]);
    await vi.advanceTimersByTimeAsync(0);

    exec.trackToolCallLifecycle(toolCallStart('t1'));
    vi.advanceTimersByTime(5000); // first window deferred
    exec.trackToolCallLifecycle(toolCallFinish('t1', 'completed'));

    // Next window: no pending tools, timeout should fire
    vi.advanceTimersByTime(5000);

    expect(host.callbacks.onSignal).toHaveBeenCalledWith({
      type: 'error',
      message: 'Prompt timed out',
      recoverable: true,
    });
  });

  it('requires ALL concurrent tools to complete before firing', async () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    void exec.execute([{ type: 'text', text: 'hi' }]);
    await vi.advanceTimersByTimeAsync(0);

    exec.trackToolCallLifecycle(toolCallStart('t1'));
    exec.trackToolCallLifecycle(toolCallStart('t2'));
    vi.advanceTimersByTime(5000);
    exec.trackToolCallLifecycle(toolCallFinish('t1'));

    // Still one tool pending — should still defer
    vi.advanceTimersByTime(5000);
    const errorSignals1 = (host.callbacks.onSignal as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0]?.type === 'error'
    );
    expect(errorSignals1).toHaveLength(0);

    exec.trackToolCallLifecycle(toolCallFinish('t2'));
    vi.advanceTimersByTime(5000);

    expect(host.callbacks.onSignal).toHaveBeenCalledWith({
      type: 'error',
      message: 'Prompt timed out',
      recoverable: true,
    });
  });

  it('does not fire timeout if status is no longer prompting', async () => {
    const host = createMockHost();
    const exec = new PromptExecutor(host, 5000);
    void exec.execute([{ type: 'text', text: 'hi' }]);
    await vi.advanceTimersByTimeAsync(0);

    host._status = 'active';
    vi.advanceTimersByTime(5000);

    const errorSignals = (host.callbacks.onSignal as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0]?.type === 'error'
    );
    expect(errorSignals).toHaveLength(0);
  });
});
