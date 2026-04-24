/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IResponseMessage } from '../../src/common/adapter/ipcBridge';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockCore = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  kill: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({ success: true, data: null }),
  confirmMessage: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

const capturedCoreConfig = vi.hoisted(() => ({
  onStreamEvent: null as ((msg: IResponseMessage) => void) | null,
  onSignalEvent: null as ((msg: IResponseMessage) => void) | null,
  onSessionKeyUpdate: null as ((key: string) => void) | null,
}));

const mockDb = vi.hoisted(() => ({
  getRemoteAgent: vi.fn(() => ({
    id: 'agent-1',
    name: 'Test',
    protocol: 'openclaw',
    url: 'wss://example.com',
    authType: 'bearer',
    authToken: 'tok',
    createdAt: 0,
    updatedAt: 0,
  })),
  updateRemoteAgent: vi.fn(),
  getConversation: vi.fn(() => ({
    success: true,
    data: { id: 'conv-1', type: 'remote', extra: {} },
  })),
  updateConversation: vi.fn(),
}));

const mockIpcBridge = vi.hoisted(() => ({
  conversation: {
    responseStream: { emit: vi.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/process/agent/remote', () => {
  return {
    RemoteAgentCore: class {
      constructor(config: Record<string, unknown>) {
        capturedCoreConfig.onStreamEvent = config.onStreamEvent as typeof capturedCoreConfig.onStreamEvent;
        capturedCoreConfig.onSignalEvent = config.onSignalEvent as typeof capturedCoreConfig.onSignalEvent;
        capturedCoreConfig.onSessionKeyUpdate =
          config.onSessionKeyUpdate as typeof capturedCoreConfig.onSessionKeyUpdate;
        Object.assign(this, mockCore);
      }
    },
  };
});

vi.mock('../../src/process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: mockIpcBridge,
}));

vi.mock('../../src/common/chat/chatLib', () => ({
  transformMessage: vi.fn((msg: IResponseMessage) => {
    if (msg.type === 'content') {
      return {
        id: msg.msg_id,
        msg_id: msg.msg_id,
        type: 'text',
        position: 'left',
        conversation_id: msg.conversation_id,
        content: { content: msg.data },
        createdAt: Date.now(),
      };
    }
    if (msg.type === 'error') {
      return {
        id: msg.msg_id,
        msg_id: msg.msg_id,
        type: 'tips',
        position: 'center',
        conversation_id: msg.conversation_id,
        content: { content: msg.data, type: 'error' },
        createdAt: Date.now(),
      };
    }
    return null;
  }),
}));

vi.mock('../../src/common/utils', () => {
  let counter = 0;
  return { uuid: () => `uuid-${++counter}` };
});

vi.mock('../../src/process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
}));

vi.mock('../../src/process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('../../src/process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('../../src/process/task/BaseAgentManager', () => {
  return {
    default: class BaseAgentManager {
      conversation_id = '';
      workspace = '';
      status = 'pending';
      confirmations: unknown[] = [];
      addConfirmation(c: unknown) {
        this.confirmations.push(c);
      }
      confirm() {}
      kill() {}
    },
  };
});

vi.mock('../../src/process/task/IpcAgentEventEmitter', () => ({
  IpcAgentEventEmitter: vi.fn(),
}));

import RemoteAgentManager from '../../src/process/task/RemoteAgentManager';
import { addMessage, addOrUpdateMessage } from '../../src/process/utils/message';
import { cronBusyGuard } from '../../src/process/services/cron/CronBusyGuard';
import { channelEventBus } from '../../src/process/channels/agent/ChannelEventBus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createManager(overrides?: Partial<ConstructorParameters<typeof RemoteAgentManager>[0]>) {
  return new RemoteAgentManager({
    conversation_id: 'conv-1',
    workspace: '/ws',
    remoteAgentId: 'agent-1',
    sessionKey: 'sess-1',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RemoteAgentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCoreConfig.onStreamEvent = null;
    capturedCoreConfig.onSignalEvent = null;
    capturedCoreConfig.onSessionKeyUpdate = null;
  });

  describe('constructor and bootstrap', () => {
    it('initializes core with remote agent config from database', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      expect(mockDb.getRemoteAgent).toHaveBeenCalledWith('agent-1');
      expect(mockCore.start).toHaveBeenCalled();
    });

    it('throws when remote agent config not found', async () => {
      mockDb.getRemoteAgent.mockReturnValueOnce(null);
      const mgr = createManager();
      await expect(mgr.bootstrap).rejects.toThrow('Remote agent config not found');
    });

    it('updates remote agent status to connected on success', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      expect(mockDb.updateRemoteAgent).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({ status: 'connected' })
      );
    });

    it('updates remote agent status to error on start failure', async () => {
      mockCore.start.mockRejectedValueOnce(new Error('connection refused'));
      const mgr = createManager();
      await expect(mgr.bootstrap).rejects.toThrow('connection refused');

      expect(mockDb.updateRemoteAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({ status: 'error' }));
    });
  });

  describe('handleStreamEvent', () => {
    it('persists content messages via addOrUpdateMessage', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      capturedCoreConfig.onStreamEvent!({
        type: 'content',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: 'Hello',
      });

      expect(addOrUpdateMessage).toHaveBeenCalled();
      expect(mockIpcBridge.conversation.responseStream.emit).toHaveBeenCalled();
      expect(channelEventBus.emitAgentMessage).toHaveBeenCalled();
    });

    it('emits agent_status messages to responseStream and channelEventBus', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      capturedCoreConfig.onStreamEvent!({
        type: 'agent_status',
        conversation_id: 'conv-1',
        msg_id: 'msg-2',
        data: { backend: 'remote', status: 'connected' },
      });

      expect(mockIpcBridge.conversation.responseStream.emit).toHaveBeenCalled();
      expect(channelEventBus.emitAgentMessage).toHaveBeenCalled();
    });

    it('uses addMessage for non-content types', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      capturedCoreConfig.onStreamEvent!({
        type: 'error',
        conversation_id: 'conv-1',
        msg_id: 'msg-3',
        data: 'something broke',
      });

      expect(addMessage).toHaveBeenCalled();
    });
  });

  describe('handleSignalEvent', () => {
    it('converts acp_permission to confirmation and adds it', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      capturedCoreConfig.onSignalEvent!({
        type: 'acp_permission',
        conversation_id: 'conv-1',
        msg_id: 'msg-p',
        data: {
          sessionId: 'conv-1',
          toolCall: { toolCallId: 'tc-1', title: 'Bash' },
          options: [{ optionId: 'allow_once', name: 'Allow', kind: 'allow_once' }],
        },
      });

      expect((mgr as unknown as { confirmations: unknown[] }).confirmations).toHaveLength(1);
      // Should NOT emit to responseStream for permission events
      expect(mockIpcBridge.conversation.responseStream.emit).not.toHaveBeenCalled();
    });

    it('clears busy guard on finish signal', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      capturedCoreConfig.onSignalEvent!({
        type: 'finish',
        conversation_id: 'conv-1',
        msg_id: 'msg-f',
        data: null,
      });

      expect(cronBusyGuard.setProcessing).toHaveBeenCalledWith('conv-1', false);
      expect(mockIpcBridge.conversation.responseStream.emit).toHaveBeenCalled();
    });
  });

  describe('handleSessionKeyUpdate', () => {
    it('saves session key to conversation extra', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      capturedCoreConfig.onSessionKeyUpdate!('new-session-key');

      // Wait for async saveSessionKey
      await vi.waitFor(() => {
        expect(mockDb.updateConversation).toHaveBeenCalledWith(
          'conv-1',
          expect.objectContaining({
            extra: expect.objectContaining({ sessionKey: 'new-session-key' }),
          })
        );
      });
    });

    it('does nothing if conversation not found', async () => {
      mockDb.getConversation.mockReturnValueOnce({ success: false });
      const mgr = createManager();
      await mgr.bootstrap;

      capturedCoreConfig.onSessionKeyUpdate!('key');

      // Should not throw
      await new Promise((r) => setTimeout(r, 10));
      expect(mockDb.updateConversation).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('creates user message and delegates to core', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      const result = await mgr.sendMessage({
        content: 'Hello',
        msg_id: 'user-msg-1',
      });

      expect(addMessage).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          type: 'text',
          position: 'right',
          content: { content: 'Hello' },
        })
      );
      expect(mockCore.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Hello' }));
      expect(result).toEqual({ success: true, data: null });
    });

    it('sets busy guard before sending', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      await mgr.sendMessage({ content: 'hi' });

      expect(cronBusyGuard.setProcessing).toHaveBeenCalledWith('conv-1', true);
    });

    it('clears busy guard on error', async () => {
      mockCore.sendMessage.mockRejectedValueOnce(new Error('send failed'));
      const mgr = createManager();
      await mgr.bootstrap;

      await expect(mgr.sendMessage({ content: 'hi' })).rejects.toThrow('send failed');
      expect(cronBusyGuard.setProcessing).toHaveBeenCalledWith('conv-1', false);
    });

    it('uses agentContent over content when provided', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      await mgr.sendMessage({ content: 'user text', agentContent: 'processed text' });

      expect(mockCore.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'processed text' }));
    });
  });

  describe('confirm', () => {
    it('delegates to core.confirmMessage', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      await mgr.confirm('conf-1', 'call-1', 'allow_once');

      expect(mockCore.confirmMessage).toHaveBeenCalledWith({
        confirmKey: 'allow_once',
        callId: 'call-1',
      });
    });
  });

  describe('ensureYoloMode', () => {
    it('returns true when yoloMode is set', async () => {
      const mgr = createManager({ yoloMode: true });
      expect(await mgr.ensureYoloMode()).toBe(true);
    });

    it('returns false when yoloMode is not set', async () => {
      const mgr = createManager();
      expect(await mgr.ensureYoloMode()).toBe(false);
    });
  });

  describe('stop and kill', () => {
    it('stop delegates to core.stop', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      await mgr.stop();
      expect(mockCore.stop).toHaveBeenCalled();
    });

    it('kill delegates to core.kill', async () => {
      const mgr = createManager();
      await mgr.bootstrap;

      mgr.kill();
      expect(mockCore.kill).toHaveBeenCalled();
    });
  });
});
