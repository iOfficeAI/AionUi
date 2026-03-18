/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Provider = (payload?: unknown) => Promise<unknown>;

let handlers: Record<string, Provider> = {};

const mockRefreshTrayMenu = vi.fn(async () => {});
const mockCreateConversation = vi.fn(async () => ({
  success: true,
  conversation: { id: 'conv-created', name: 'Created Conversation' },
}));
const mockGetConversation = vi.fn(() => ({
  success: true,
  data: { id: 'conv-1', source: 'aionui', name: 'Original Name', type: 'gemini' },
}));
const mockDeleteConversation = vi.fn(() => ({ success: true }));
const mockUpdateConversation = vi.fn(() => ({ success: true }));
const mockListJobsByConversation = vi.fn(async () => []);
const mockRemoveJob = vi.fn(async () => {});
const mockKill = vi.fn();

const createCommand = (key: string) => ({
  provider: vi.fn((fn: Provider) => {
    handlers[key] = fn;
  }),
  invoke: vi.fn(),
  emit: vi.fn(),
});

const registerMocks = () => {
  vi.doMock('@/agent/gemini', () => ({
    GeminiAgent: class {},
    GeminiApprovalStore: { getInstance: vi.fn(() => ({})) },
  }));

  vi.doMock('@process/database', () => ({
    getDatabase: vi.fn(() => ({
      getConversation: mockGetConversation,
      deleteConversation: mockDeleteConversation,
      updateConversation: mockUpdateConversation,
      getUserConversations: vi.fn(() => ({ data: [] })),
      getConversationMessages: vi.fn(() => ({ data: [], hasMore: false, total: 0 })),
      createConversation: vi.fn(() => ({ success: true })),
      insertMessage: vi.fn(),
    })),
  }));

  vi.doMock('@process/services/cron/CronService', () => ({
    cronService: {
      listJobsByConversation: mockListJobsByConversation,
      removeJob: mockRemoveJob,
      updateJob: vi.fn(async () => {}),
    },
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
        responseSearchWorkSpace: {
          invoke: vi.fn(),
        },
        stop: createCommand('conversation.stop'),
        getSlashCommands: createCommand('conversation.getSlashCommands'),
        sendMessage: createCommand('conversation.sendMessage'),
        responseStream: {
          emit: vi.fn(),
        },
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

  vi.doMock('@/common/utils', () => ({
    uuid: vi.fn(() => 'uuid-1'),
  }));

  vi.doMock('@/process/initStorage', () => ({
    getSkillsDir: vi.fn(() => '/mock/skills'),
    ProcessChat: {
      get: vi.fn(async () => []),
    },
  }));

  vi.doMock('@/process/services/conversationService', () => ({
    ConversationService: {
      createConversation: mockCreateConversation,
    },
  }));

  vi.doMock('@/process/task/agentUtils', () => ({
    prepareFirstMessage: vi.fn(),
  }));

  vi.doMock('@/process/tray', () => ({
    refreshTrayMenu: mockRefreshTrayMenu,
  }));

  vi.doMock('@/process/utils', () => ({
    copyFilesToDirectory: vi.fn(),
    readDirectoryRecursive: vi.fn(),
  }));

  vi.doMock('@/process/utils/openclawUtils', () => ({
    computeOpenClawIdentityHash: vi.fn(async () => 'identity-hash'),
  }));

  vi.doMock('@/process/WorkerManage', () => ({
    default: {
      kill: mockKill,
      clear: vi.fn(),
      getTaskById: vi.fn(),
      getTaskByIdRollbackBuild: vi.fn(),
      buildConversation: vi.fn(),
    },
  }));

  vi.doMock('@/process/bridge/migrationUtils', () => ({
    migrateConversationToDatabase: vi.fn(),
  }));
};

const getProvider = async (key: string): Promise<Provider> => {
  const mod = await import('@/process/bridge/conversationBridge');
  mod.initConversationBridge();

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
    expect(mockKill).toHaveBeenCalledWith('conv-1');
    expect(mockDeleteConversation).toHaveBeenCalledWith('conv-1');
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });

  it('refreshes tray menu after creating a conversation', async () => {
    const createProvider = await getProvider('conversation.create');

    const result = await createProvider({ type: 'gemini' });

    expect(result).toEqual({ id: 'conv-created', name: 'Created Conversation' });
    expect(mockCreateConversation).toHaveBeenCalledOnce();
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });

  it('refreshes tray menu after renaming a conversation', async () => {
    const updateProvider = await getProvider('conversation.update');

    const result = await updateProvider({
      id: 'conv-1',
      updates: { name: 'Renamed Conversation' },
    });

    expect(result).toBe(true);
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { name: 'Renamed Conversation' });
    expect(mockRefreshTrayMenu).toHaveBeenCalledOnce();
  });
});
