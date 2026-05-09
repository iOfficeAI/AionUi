/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionsResolve = vi.fn();
const chatSend = vi.fn();

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

describe('OpenClawAgent session bootstrap', () => {
  let agent: OpenClawAgent;
  let sessionUpdates: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    sessionUpdates = [];
    agent = new OpenClawAgent({
      id: 'conv-openclaw-1',
      workingDir: '/tmp/test',
      onStreamEvent: vi.fn(),
      onSessionKeyUpdate: (sessionKey) => sessionUpdates.push(sessionKey),
    });
  });

  it('uses implicit session creation for new conversations instead of reset', async () => {
    const connection = {
      sessionKey: null,
      sessionsResolve,
      chatSend,
    };
    (agent as unknown as { connection: typeof connection }).connection = connection;

    await (agent as unknown as { resolveSession: () => Promise<void> }).resolveSession();

    expect(sessionsResolve).not.toHaveBeenCalled();
    expect(connection.sessionKey).toBe('conv-openclaw-1');
    expect(sessionUpdates).toEqual(['conv-openclaw-1']);
  });

  it('keeps resume behavior when a saved session key still resolves', async () => {
    sessionsResolve.mockResolvedValueOnce({ key: 'agent:main:existing-key', sessionId: 's-1' });
    const connection = {
      sessionKey: null,
      sessionsResolve,
      chatSend,
    };
    (agent as unknown as { connection: typeof connection; config: { extra?: { sessionKey?: string } } }).connection = connection;
    (agent as unknown as { config: { extra?: { sessionKey?: string } } }).config.extra = { sessionKey: 'existing-key' };

    await (agent as unknown as { resolveSession: () => Promise<void> }).resolveSession();

    expect(sessionsResolve).toHaveBeenCalledWith({ key: 'existing-key' });
    expect(connection.sessionKey).toBe('agent:main:existing-key');
    expect(sessionUpdates).toEqual([]);
  });

  it('falls back to priming the raw conversation key when resume resolve fails', async () => {
    sessionsResolve.mockRejectedValueOnce(new Error('pairing required'));
    const connection = {
      sessionKey: null,
      sessionsResolve,
      chatSend,
    };
    (agent as unknown as { connection: typeof connection; config: { extra?: { sessionKey?: string } } }).connection = connection;
    (agent as unknown as { config: { extra?: { sessionKey?: string } } }).config.extra = { sessionKey: 'stale-key' };

    await (agent as unknown as { resolveSession: () => Promise<void> }).resolveSession();

    expect(sessionsResolve).toHaveBeenCalledWith({ key: 'stale-key' });
    expect(connection.sessionKey).toBe('conv-openclaw-1');
    expect(sessionUpdates).toEqual(['conv-openclaw-1']);
  });
});
