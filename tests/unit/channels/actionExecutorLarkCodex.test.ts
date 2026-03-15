/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chatLib';

const sendMessageSpy = vi.fn();
const mockDb = {
  getChannelUserByPlatform: vi.fn(),
  getConversation: vi.fn(),
};

vi.mock('@/process/database', () => ({
  getDatabase: () => mockDb,
}));

vi.mock('@/process/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(),
  },
}));

vi.mock('@/process/services/conversationService', () => ({
  ConversationService: {
    createConversation: vi.fn(),
    createGeminiConversation: vi.fn(),
  },
}));

vi.mock('@/channels/agent/ChannelMessageService', () => ({
  getChannelMessageService: () => ({
    sendMessage: sendMessageSpy,
  }),
}));

async function loadActionExecutorClass() {
  vi.resetModules();
  const mod = await import('@/channels/gateway/ActionExecutor');
  return mod.ActionExecutor;
}

function createPlugin(overrides?: Partial<Record<string, unknown>>) {
  return {
    type: 'lark',
    sendMessage: vi.fn(async () => 'lark-msg-1'),
    editMessage: vi.fn(async () => {}),
    resolveConversationContext: vi.fn(),
    sendLocalAttachment: vi.fn(async () => 'lark-attachment-msg'),
    ...(overrides || {}),
  };
}

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-lark-action-executor-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('ActionExecutor Lark/Codex attachment flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getChannelUserByPlatform.mockReturnValue({
      success: true,
      data: {
        id: 'channel-user-1',
        platformUserId: 'ou_user_1',
        platformType: 'lark',
        displayName: 'Alice',
        authorizedAt: Date.now(),
      },
    });
  });

  it('injects resolved lark attachment paths into the Codex files payload', async () => {
    const workspace = createTempWorkspace();
    const attachmentPath = path.join(workspace, '.aionui', 'channel-assets', 'lark', 'oc_chat', '2026-03-15', 'om_current__01__demo.txt');

    mockDb.getConversation.mockReturnValue({
      success: true,
      data: {
        id: 'conversation-1',
        type: 'codex',
        extra: { workspace },
      },
    });

    sendMessageSpy.mockResolvedValue('channel-msg-1');

    const plugin = createPlugin({
      resolveConversationContext: vi.fn(async () => ({
        current: {
          messageId: 'om_current',
          chatId: 'oc_chat',
          msgType: 'file',
          segments: [
            { kind: 'text', text: 'Please inspect this file' },
            { kind: 'attachment', attachmentType: 'file', fileKey: 'file_1', localPath: attachmentPath },
          ],
          attachmentPaths: [attachmentPath],
        },
      })),
    });

    const pluginManager = {
      getAllPlugins: () => [plugin],
    };
    const sessionManager = {
      getSession: () => ({
        id: 'session-1',
        userId: 'channel-user-1',
        agentType: 'codex',
        conversationId: 'conversation-1',
        chatId: 'oc_chat',
        createdAt: Date.now(),
        lastActivity: Date.now(),
      }),
      updateSessionActivity: vi.fn(),
    };
    const pairingService = {
      isUserAuthorized: () => true,
    };

    const ActionExecutor = await loadActionExecutorClass();
    const executor = new ActionExecutor(pluginManager as any, sessionManager as any, pairingService as any);

    const handleChatMessageSpy = vi.fn().mockResolvedValue(undefined);
    (executor as any).handleChatMessage = handleChatMessageSpy;

    await executor.getMessageHandler()({
      id: 'om_current',
      platform: 'lark',
      chatId: 'oc_chat',
      user: {
        id: 'ou_user_1',
        displayName: 'Alice',
      },
      content: {
        type: 'document',
        text: '',
      },
      timestamp: Date.now(),
      raw: {},
    });

    expect(handleChatMessageSpy).toHaveBeenCalledTimes(1);
    expect(handleChatMessageSpy.mock.calls[0][1]).toContain('Current message:');
    expect(handleChatMessageSpy.mock.calls[0][1]).toContain(attachmentPath);
    expect(handleChatMessageSpy.mock.calls[0][2]).toEqual([attachmentPath]);
  });

  it('uploads explicitly referenced workspace files after the final lark reply', async () => {
    const workspace = createTempWorkspace();
    const outboundFile = path.join(workspace, 'reports', 'result.txt');
    fs.mkdirSync(path.dirname(outboundFile), { recursive: true });
    fs.writeFileSync(outboundFile, 'done');

    mockDb.getConversation.mockReturnValue({
      success: true,
      data: {
        id: 'conversation-1',
        type: 'codex',
        extra: { workspace },
      },
    });

    sendMessageSpy.mockImplementation(async (_sessionId: string, _conversationId: string, _text: string, onStream: (message: TMessage, isInsert: boolean) => Promise<void>) => {
      await onStream(
        {
          id: 'assistant-msg',
          conversation_id: 'conversation-1',
          type: 'text',
          position: 'left',
          content: {
            content: 'Generated file saved at `reports/result.txt`',
          },
        },
        true
      );
      return 'channel-msg-1';
    });

    const plugin = createPlugin({
      resolveConversationContext: vi.fn(async () => ({
        current: {
          messageId: 'om_current',
          chatId: 'oc_chat',
          msgType: 'text',
          segments: [{ kind: 'text', text: 'Please generate the report' }],
          attachmentPaths: [],
        },
      })),
    });

    const pluginManager = {
      getAllPlugins: () => [plugin],
    };
    const sessionManager = {
      getSession: () => ({
        id: 'session-1',
        userId: 'channel-user-1',
        agentType: 'codex',
        conversationId: 'conversation-1',
        chatId: 'oc_chat',
        createdAt: Date.now(),
        lastActivity: Date.now(),
      }),
      updateSessionActivity: vi.fn(),
    };
    const pairingService = {
      isUserAuthorized: () => true,
    };

    const ActionExecutor = await loadActionExecutorClass();
    const executor = new ActionExecutor(pluginManager as any, sessionManager as any, pairingService as any);

    await executor.getMessageHandler()({
      id: 'om_current',
      platform: 'lark',
      chatId: 'oc_chat',
      user: {
        id: 'ou_user_1',
        displayName: 'Alice',
      },
      content: {
        type: 'text',
        text: 'Please generate the report',
      },
      timestamp: Date.now(),
      raw: {},
    });

    expect(plugin.sendLocalAttachment).toHaveBeenCalledWith('oc_chat', outboundFile);
  });
});
