/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationService } from '@/process/services/IConversationService';
import type { IWorkerTaskManager } from '@/process/task/IWorkerTaskManager';

type Provider = (payload?: unknown) => Promise<unknown>;

let handlers: Record<string, Provider> = {};

const mockRefreshTrayMenu = vi.fn(async () => {});

const createCommand = (key: string) => ({
  provider: vi.fn((fn: Provider) => {
    handlers[key] = fn;
  }),
  invoke: vi.fn(),
  emit: vi.fn(),
});

const mockConversationService = {
  createConversation: vi.fn(async () => ({ id: 'conv-created', name: 'Created Conversation', source: 'aionui' })),
  deleteConversation: vi.fn(async () => {}),
  updateConversation: vi.fn(async () => {}),
  getConversation: vi.fn(async () => ({ id: 'conv-1', source: 'aionui', name: 'Original Name', type: 'gemini' })),
  createWithMigration: vi.fn(async () => ({ id: 'conv-migrated', source: 'aionui' })),
};

const mockWorkerTaskManager = {
  getTask: vi.fn(),
  getOrBuildTask: vi.fn(async () => ({})),
  addTask: vi.fn(),
  kill: vi.fn(),
  clear: vi.fn(),
  listTasks: vi.fn(() => []),
};

const registerMocks = () => {
  vi.doMock('@/agent/gemini', () => ({
    GeminiAgent: vi.fn(),
    GeminiApprovalStore: { getInstance: vi.fn(() => ({})) },
  }));

  vi.doMock('@process/services/database', () => ({
    getDatabase: vi.fn(() => ({
      getUserConversations: vi.fn(() => ({ data: [] })),
    })),
  }));

  vi.doMock('@/common', () => ({
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

  vi.doMock('@process/utils/initStorage', () => ({
    getSkillsDir: vi.fn(() => '/mock/skills'),
    ProcessChat: { get: vi.fn(async () => []) },
    ProcessConfig: { get: vi.fn(async () => []) },
  }));

  vi.doMock('@/process/task/agentUtils', () => ({
    prepareFirstMessage: vi.fn(),
  }));

  vi.doMock('@process/utils/tray', () => ({
    refreshTrayMenu: mockRefreshTrayMenu,
  }));

  vi.doMock('@/process/utils', () => ({
    copyFilesToDirectory: vi.fn(),
    readDirectoryRecursive: vi.fn(),
  }));

  vi.doMock('@/process/utils/openclawUtils', () => ({
    computeOpenClawIdentityHash: vi.fn(async () => 'identity-hash'),
  }));

  vi.doMock('@process/bridge/migrationUtils', () => ({
    migrateConversationToDatabase: vi.fn(),
  }));
};

const getProvider = async (key: string): Promise<Provider> => {
  const mod = await import('@process/bridge/conversationBridge');
  mod.initConversationBridge(
    mockConversationService as unknown as IConversationService,
    mockWorkerTaskManager as unknown as IWorkerTaskManager
  );

  const provider = handlers[key];
  if (!provider) {
    throw new Error(`Provider ${key} not registered`);
  }

  return provider;
};

describe('conversationBridge tray sync', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    handlers = {};
    registerMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes tray menu after removing a conversation', async () => {
    const removeProvider = await getProvider('conversation.remove');

    const result = await removeProvider({ id: 'conv-1' });

    expect(result).toBe(true);
    expect(mockWorkerTaskManager.kill).toHaveBeenCalledWith('conv-1');
    expect(mockConversationService.deleteConversation).toHaveBeenCalledWith('conv-1');
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });

  it('refreshes tray menu after creating a conversation', async () => {
    const createProvider = await getProvider('conversation.create');

    const result = await createProvider({ type: 'gemini' });

    expect(result).toEqual({ id: 'conv-created', name: 'Created Conversation', source: 'aionui' });
    expect(mockConversationService.createConversation).toHaveBeenCalledOnce();
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });

  it('refreshes tray menu after renaming a conversation', async () => {
    const updateProvider = await getProvider('conversation.update');

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
