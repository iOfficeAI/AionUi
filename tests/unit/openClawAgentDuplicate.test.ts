/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatEvent, EventFrame } from '../../src/process/agent/openclaw/types';
import type { IResponseMessage } from '../../src/common/adapter/ipcBridge';

// Mock dependencies before importing the module under test
vi.mock('../../src/process/agent/acp/AcpAdapter', () => ({
  AcpAdapter: class MockAcpAdapter {
    resetMessageTracking = vi.fn();
    convertSessionUpdate = vi.fn().mockReturnValue([]);
  },
}));

vi.mock('../../src/process/agent/acp/ApprovalStore', () => ({
  AcpApprovalStore: class MockAcpApprovalStore {
    clear = vi.fn();
  },
}));

vi.mock('../../src/common/chat/navigation', () => ({
  NavigationInterceptor: {
    isNavigationTool: vi.fn().mockReturnValue(false),
    extractUrl: vi.fn(),
    createPreviewMessage: vi.fn(),
  },
}));

vi.mock('../../src/process/agent/openclaw/openclawConfig', () => ({
  getGatewayAuthPassword: vi.fn(),
  getGatewayAuthToken: vi.fn(),
  getGatewayPort: vi.fn().mockReturnValue(18789),
}));

vi.mock('../../src/process/agent/openclaw/OpenClawGatewayConnection', () => ({
  OpenClawGatewayConnection: vi.fn(),
}));

vi.mock('../../src/process/agent/openclaw/OpenClawGatewayManager', () => ({
  OpenClawGatewayManager: vi.fn(),
}));

vi.mock('node:net', () => ({
  default: { createConnection: vi.fn() },
}));

import { OpenClawAgent } from '../../src/process/agent/openclaw/index';

/**
 * Simulate a chat event frame through the agent's event handler.
 * We access the private handleEvent method via type casting since the agent
 * processes events through this single entry point.
 */
function simulateChatEvent(agent: OpenClawAgent, chatEvent: ChatEvent): void {
  const eventFrame: EventFrame = {
    type: 'event',
    event: 'chat.event',
    payload: chatEvent,
  };
  // Access private method via bracket notation for testing
  (agent as unknown as { handleEvent: (evt: EventFrame) => void }).handleEvent(eventFrame);
}

describe('OpenClawAgent — duplicate reply prevention (#1281)', () => {
  let agent: OpenClawAgent;
  let streamEvents: IResponseMessage[];

  beforeEach(() => {
    streamEvents = [];
    agent = new OpenClawAgent({
      id: 'test-conv-id',
      workingDir: '/tmp/test',
      onStreamEvent: (data) => streamEvents.push(data),
      onSignalEvent: vi.fn(),
    });

    // Simulate an active connection by setting internal state
    const agentInternal = agent as unknown as {
      connection: { isConnected: boolean; sessionKey: string; chatSend: () => Promise<void> };
    };
    agentInternal.connection = {
      isConnected: true,
      sessionKey: 'test-session',
      chatSend: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should emit content events during an active turn', async () => {
    // Start a turn
    await agent.sendMessage({ content: 'hello' });
    streamEvents = []; // clear sendMessage-related events

    // Simulate delta events
    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 1,
      state: 'delta',
      message: { content: 'Hello' },
    });

    const contentEvents = streamEvents.filter((e) => e.type === 'content');
    expect(contentEvents).toHaveLength(1);
    expect(contentEvents[0].data).toBe('Hello');
  });

  it('should ignore late delta events after turn ends (prevents duplicate replies)', async () => {
    // Start a turn
    await agent.sendMessage({ content: 'hello' });
    streamEvents = [];

    // Simulate normal flow: delta → final
    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 1,
      state: 'delta',
      message: { content: 'Hello world' },
    });

    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 2,
      state: 'final',
    });

    const contentBeforeLate = streamEvents.filter((e) => e.type === 'content');
    expect(contentBeforeLate).toHaveLength(1);

    // Simulate late delta arriving AFTER turn ended
    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 3,
      state: 'delta',
      message: { content: 'Hello world' },
    });

    // Should still only have 1 content event — the late delta was ignored
    const contentAfterLate = streamEvents.filter((e) => e.type === 'content');
    expect(contentAfterLate).toHaveLength(1);
  });

  it('should ignore duplicate final events after turn ends', async () => {
    await agent.sendMessage({ content: 'hello' });
    streamEvents = [];

    // Normal delta + final
    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 1,
      state: 'delta',
      message: { content: 'Response text' },
    });

    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 2,
      state: 'final',
    });

    const finishCount1 = streamEvents.filter((e) => e.type === 'finish').length;

    // Duplicate final — should be completely ignored
    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 3,
      state: 'final',
      message: { content: 'Response text' },
    });

    // No additional finish or content events
    const finishCount2 = streamEvents.filter((e) => e.type === 'finish').length;
    const contentEvents = streamEvents.filter((e) => e.type === 'content');
    expect(finishCount2).toBe(finishCount1);
    expect(contentEvents).toHaveLength(1);
  });

  it('should process events normally for a new turn after previous turn ended', async () => {
    // First turn
    await agent.sendMessage({ content: 'first' });
    streamEvents = [];

    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 1,
      state: 'delta',
      message: { content: 'First reply' },
    });

    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 2,
      state: 'final',
    });

    // Second turn
    await agent.sendMessage({ content: 'second' });
    streamEvents = [];

    simulateChatEvent(agent, {
      runId: 'run-2',
      sessionKey: 'test-session',
      seq: 1,
      state: 'delta',
      message: { content: 'Second reply' },
    });

    const contentEvents = streamEvents.filter((e) => e.type === 'content');
    expect(contentEvents).toHaveLength(1);
    expect(contentEvents[0].data).toBe('Second reply');
  });

  it('should not process any chat events before sendMessage is called', () => {
    // Try sending a delta event without calling sendMessage first
    simulateChatEvent(agent, {
      runId: 'run-1',
      sessionKey: 'test-session',
      seq: 1,
      state: 'delta',
      message: { content: 'Unexpected text' },
    });

    const contentEvents = streamEvents.filter((e) => e.type === 'content');
    expect(contentEvents).toHaveLength(0);
  });
});
