/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationService } from '@/process/services/IConversationService';
import type { IWorkerTaskManager } from '@/process/task/IWorkerTaskManager';
import { initConversationBridge } from '@process/bridge/conversationBridge';

type Provider = (payload?: unknown) => Promise<unknown>;

const {
  getHandlers,
  resetHandlers,
  createCommand,
  mockRefreshTrayMenu,
  mockConversationService,
  mockWorkerTaskManager,
  mockRemoveFromMessageCache,
} = vi.hoisted(() => {
  const handlers: Record<string, Provider> = {};

  const reset = () => {
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  };

  const commandFactory = (key: string) => ({
    provider: vi.fn((fn: Provider) => {
      handlers[key] = fn;
    }),
    invoke: vi.fn(),
    emit: vi.fn(),
  });

  return {
    getHandlers: () => handlers,
    resetHandlers: reset,
    createCommand: commandFactory,
    mockRefreshTrayMenu: vi.fn(async () => {}),
    mockRemoveFromMessageCache: vi.fn(),
    mockConversationService: {
      createConversation: vi.fn(async () => ({ id: 'conv-created', name: 'Created Conversation', source: 'aionui' })),
      deleteConversation: vi.fn(async () => {}),
      updateConversation: vi.fn(async () => {}),
      getConversation: vi.fn(async () => ({ id: 'conv-1', source: 'aionui', name: 'Original Name', type: 'gemini' })),
      createWithMigration: vi.fn(async () => ({ id: 'conv-migrated', source: 'aionui' })),
    },
    mockWorkerTaskManager: {
      getTask: vi.fn(),
      getOrBuildTask: vi.fn(async () => ({})),
      addTask: vi.fn(),
      kill: vi.fn(),
      clear: vi.fn(),
      listTasks: vi.fn(() => []),
    },
  };
});

vi.mock('@/agent/gemini', () => ({
  GeminiAgent: vi.fn(),
  GeminiApprovalStore: { getInstance: vi.fn(() => ({})) },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => ({
    getUserConversations: vi.fn(() => ({ data: [] })),
  })),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    openclawConversation: {
      getRuntime: createCommand('openclawConversation.getRuntime'),
    },
    conversation: {
      create: createCommand('conversation.create'),
      reloadContext: createCommand('conversation.reloadContext'),
      getAssociateConversation: createCommand('conversation.getAssociateConversation'),
      createWithConversation: createCommand('conversation.createWithConversation'),
      remove: createCommand('conversation.remove'),
      update: createCommand('conversation.update'),
      reset: createCommand('conversation.reset'),
      get: createCommand('conversation.get'),
      getWorkspace: createCommand('conversation.getWorkspace'),
      responseSearchWorkSpace: { invoke: vi.fn() },
      stop: createCommand('conversation.stop'),
      setConfig: createCommand('conversation.setConfig'),
      getSlashCommands: createCommand('conversation.getSlashCommands'),
      askSideQuestion: createCommand('conversation.askSideQuestion'),
      sendMessage: createCommand('conversation.sendMessage'),
      warmup: createCommand('conversation.warmup'),
      responseStream: { emit: vi.fn() },
      listChanged: { emit: vi.fn() },
      listByCronJob: createCommand('conversation.listByCronJob'),
      confirmation: {
        confirm: createCommand('conversation.confirmation.confirm'),
        list: createCommand('conversation.confirmation.list'),
      },
      approval: {
        check: createCommand('conversation.approval.check'),
      },
    },
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getSkillsDir: vi.fn(() => '/mock/skills'),
  getBuiltinSkillsCopyDir: vi.fn(() => '/mock/builtin-skills'),
  getSystemDir: vi.fn(() => ({ cacheDir: '/mock/cache' })),
  ProcessChat: { get: vi.fn(async () => []) },
  ProcessConfig: { get: vi.fn(async () => []) },
}));

vi.mock('@/process/task/agentUtils', () => ({
  prepareFirstMessage: vi.fn(),
}));

vi.mock('@process/utils/tray', () => ({
  refreshTrayMenu: mockRefreshTrayMenu,
}));

vi.mock('@process/utils/message', () => ({
  removeFromMessageCache: mockRemoveFromMessageCache,
}));

vi.mock('@/process/utils', () => ({
  copyFilesToDirectory: vi.fn(),
  readDirectoryRecursive: vi.fn(),
}));

vi.mock('@/process/utils/openclawUtils', () => ({
  computeOpenClawIdentityHash: vi.fn(async () => 'identity-hash'),
}));

vi.mock('@process/bridge/migrationUtils', () => ({
  migrateConversationToDatabase: vi.fn(),
}));

const getProvider = (key: string): Provider => {
  const provider = getHandlers()[key];
  if (!provider) {
    throw new Error(`Provider ${key} not registered`);
  }

  return provider;
};

describe('conversationBridge tray sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHandlers();
    initConversationBridge(
      mockConversationService as unknown as IConversationService,
      mockWorkerTaskManager as unknown as IWorkerTaskManager
    );
  });

  it('refreshes tray menu after removing a conversation', async () => {
    const removeProvider = getProvider('conversation.remove');

    const result = await removeProvider({ id: 'conv-1' });

    expect(result).toBe(true);
    expect(mockWorkerTaskManager.kill).toHaveBeenCalledWith('conv-1');
    expect(mockConversationService.deleteConversation).toHaveBeenCalledWith('conv-1');
    expect(mockRemoveFromMessageCache).toHaveBeenCalledWith('conv-1');
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });

  it('refreshes tray menu after creating a conversation', async () => {
    const createProvider = getProvider('conversation.create');

    const result = await createProvider({ type: 'gemini' });

    expect(result).toEqual({ id: 'conv-created', name: 'Created Conversation', source: 'aionui' });
    expect(mockConversationService.createConversation).toHaveBeenCalledOnce();
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });

  it('refreshes tray menu after renaming a conversation', async () => {
    const updateProvider = getProvider('conversation.update');

    const result = await updateProvider({
      id: 'conv-1',
      updates: { name: 'Renamed Conversation' },
    });

    expect(result).toBe(true);
    expect(mockConversationService.updateConversation).toHaveBeenCalledWith(
      'conv-1',
      { name: 'Renamed Conversation' },
      undefined
    );
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });
});
