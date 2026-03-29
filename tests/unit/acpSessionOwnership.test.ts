/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing AcpAgent
vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn().mockResolvedValue({}),
  resolveNpxPath: vi.fn().mockResolvedValue('/usr/local/bin/npx'),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn().mockResolvedValue(null) },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', () => ({
  promises: { readFile: vi.fn(), access: vi.fn() },
}));

// Mock AcpConnection
const mockLoadSession = vi.fn();
const mockNewSession = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue({ agentInfo: {} });
const mockOn = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@process/agent/acp/AcpConnection', () => {
  return {
    AcpConnection: class MockAcpConnection {
      loadSession = mockLoadSession;
      newSession = mockNewSession;
      initialize = mockInitialize;
      on = mockOn;
      destroy = mockDestroy;
      sessionId = null;
    },
  };
});

vi.mock('@process/agent/acp/mcpSessionConfig', () => ({
  buildBuiltinAcpSessionMcpServers: vi.fn().mockResolvedValue([]),
  parseAcpMcpCapabilities: vi.fn(),
}));

vi.mock('@process/agent/acp/modelInfo', () => ({
  buildAcpModelInfo: vi.fn(),
  summarizeAcpModelInfo: vi.fn(),
}));

vi.mock('@process/agent/acp/utils', () => ({
  getClaudeModel: vi.fn(),
}));

import { AcpAgent } from '@process/agent/acp';

describe('AcpAgent - session ownership validation', () => {
  const onStreamEvent = vi.fn();
  const onSessionIdUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNewSession.mockResolvedValue({ sessionId: 'new-session-123' });
    mockLoadSession.mockResolvedValue({ sessionId: 'old-session-abc' });
  });

  function createAgent(conversationId: string, extra: Record<string, unknown> = {}) {
    return new AcpAgent({
      id: conversationId,
      backend: 'codex',
      workingDir: '/tmp',
      extra: {
        workspace: '/tmp',
        backend: 'codex' as const,
        ...extra,
      },
      onStreamEvent,
      onSessionIdUpdate,
    });
  }

  it('should skip resume when session belongs to a different conversation', async () => {
    const agent = createAgent('conversation-B', {
      acpSessionId: 'old-session-abc',
      acpSessionConversationId: 'conversation-A',
    });

    // Trigger createOrResumeSession via the internal flow
    // Access the private method for testing
    const createOrResume = (agent as any).createOrResumeSession.bind(agent);
    await createOrResume();

    // Should NOT have called loadSession (session belongs to conversation-A, not conversation-B)
    expect(mockLoadSession).not.toHaveBeenCalled();
    // Should have created a fresh session instead
    expect(mockNewSession).toHaveBeenCalledOnce();
  });

  it('should resume when session belongs to the same conversation', async () => {
    const agent = createAgent('conversation-A', {
      acpSessionId: 'old-session-abc',
      acpSessionConversationId: 'conversation-A',
    });

    const createOrResume = (agent as any).createOrResumeSession.bind(agent);
    await createOrResume();

    // Should have attempted resume via loadSession (codex backend)
    expect(mockLoadSession).toHaveBeenCalledWith('old-session-abc', '/tmp');
    // Should NOT have fallen through to newSession
    expect(mockNewSession).not.toHaveBeenCalled();
  });

  it('should resume when no conversationId is stored (legacy data)', async () => {
    const agent = createAgent('conversation-A', {
      acpSessionId: 'old-session-abc',
      // No acpSessionConversationId - legacy data without ownership info
    });

    const createOrResume = (agent as any).createOrResumeSession.bind(agent);
    await createOrResume();

    // Should still attempt resume (backward compatibility)
    expect(mockLoadSession).toHaveBeenCalledWith('old-session-abc', '/tmp');
  });

  it('should create fresh session when no stored session ID exists', async () => {
    const agent = createAgent('conversation-A', {
      // No acpSessionId
    });

    const createOrResume = (agent as any).createOrResumeSession.bind(agent);
    await createOrResume();

    expect(mockLoadSession).not.toHaveBeenCalled();
    expect(mockNewSession).toHaveBeenCalledOnce();
  });

  it('should create fresh session when resume fails', async () => {
    mockLoadSession.mockRejectedValue(new Error('session expired'));

    const agent = createAgent('conversation-A', {
      acpSessionId: 'old-session-abc',
      acpSessionConversationId: 'conversation-A',
    });

    const createOrResume = (agent as any).createOrResumeSession.bind(agent);
    await createOrResume();

    // Should have tried resume first
    expect(mockLoadSession).toHaveBeenCalled();
    // Then fallen back to fresh session
    expect(mockNewSession).toHaveBeenCalledOnce();
  });
});
