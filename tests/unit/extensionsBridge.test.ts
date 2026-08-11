/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

import { ActivitySnapshotBuilder } from '../../src/process/bridge/services/ActivitySnapshotBuilder';
import type { IConversationRepository } from '../../src/process/services/database/IConversationRepository';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';
import type { TChatConversation } from '../../src/common/config/storage';
import type { TMessage } from '../../src/common/chat/chatLib';

function makeRepo(overrides?: Partial<IConversationRepository>): IConversationRepository {
  return {
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
    insertMessage: vi.fn(),
    getUserConversations: vi.fn(async () => ({
      data: [],
      total: 0,
      hasMore: false,
    })),
    listAllConversations: vi.fn(async () => []),
    searchMessages: vi.fn(async () => ({
      items: [],
      total: 0,
      page: 0,
      pageSize: 20,
      hasMore: false,
    })),
    ...overrides,
  };
}

function makeTaskManager(overrides?: Partial<IWorkerTaskManager>): IWorkerTaskManager {
  return {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
    ...overrides,
  };
}

function makeConversation(overrides: Partial<TChatConversation> = {}): TChatConversation {
  return {
    id: 'c1',
    type: 'nanobot' as any,
    status: 'finished',
    modifyTime: Date.now(),
    createTime: Date.now(),
    ...overrides,
  } as TChatConversation;
}

describe('ActivitySnapshotBuilder', () => {
  let repo: IConversationRepository;
  let taskManager: IWorkerTaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeRepo();
    taskManager = makeTaskManager();
  });

  it('returns correct totalConversations count', async () => {
    const conversations = [makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })];
    vi.mocked(repo.getUserConversations).mockResolvedValue({
      data: conversations,
      total: 2,
      hasMore: false,
    });
    vi.mocked(repo.getMessages).mockResolvedValue({
      data: [],
      total: 0,
      hasMore: false,
    });

    const snapshot = await new ActivitySnapshotBuilder(repo, taskManager).build();

    expect(snapshot.totalConversations).toBe(2);
  });

  it('excludes health-check conversations from totalConversations', async () => {
    const conversations = [
      makeConversation({ id: 'c1' }),
      makeConversation({ id: 'hc1', extra: { isHealthCheck: true } as any }),
    ];
    vi.mocked(repo.getUserConversations).mockResolvedValue({
      data: conversations,
      total: 2,
      hasMore: false,
    });
    vi.mocked(repo.getMessages).mockResolvedValue({
      data: [],
      total: 0,
      hasMore: false,
    });

    const snapshot = await new ActivitySnapshotBuilder(repo, taskManager).build();

    expect(snapshot.totalConversations).toBe(1);
  });

  it('correctly counts running conversations from task manager status', async () => {
    const conversations = [makeConversation({ id: 'c1', status: 'finished' })];
    vi.mocked(repo.getUserConversations).mockResolvedValue({
      data: conversations,
      total: 1,
      hasMore: false,
    });
    vi.mocked(repo.getMessages).mockResolvedValue({
      data: [],
      total: 0,
      hasMore: false,
    });
    vi.mocked(taskManager.getTask).mockReturnValue({
      status: 'running',
    } as any);

    const snapshot = await new ActivitySnapshotBuilder(repo, taskManager).build();

    expect(snapshot.runningConversations).toBe(1);
  });

  it('returns zero runningConversations when no tasks are active', async () => {
    const conversations = [makeConversation({ id: 'c1', status: 'finished' })];
    vi.mocked(repo.getUserConversations).mockResolvedValue({
      data: conversations,
      total: 1,
      hasMore: false,
    });
    vi.mocked(repo.getMessages).mockResolvedValue({
      data: [],
      total: 0,
      hasMore: false,
    });

    const snapshot = await new ActivitySnapshotBuilder(repo, taskManager).build();

    expect(snapshot.runningConversations).toBe(0);
  });

  it('groups conversations by agent backend', async () => {
    const conversations = [
      makeConversation({ id: 'c1', type: 'gemini' as any }),
      makeConversation({ id: 'c2', type: 'gemini' as any }),
      makeConversation({ id: 'c3' }),
    ];
    vi.mocked(repo.getUserConversations).mockResolvedValue({
      data: conversations,
      total: 3,
      hasMore: false,
    });
    vi.mocked(repo.getMessages).mockResolvedValue({
      data: [],
      total: 0,
      hasMore: false,
    });

    const snapshot = await new ActivitySnapshotBuilder(repo, taskManager).build();

    const geminiAgent = snapshot.agents.find((a) => a.backend === 'gemini');
    expect(geminiAgent?.conversations).toBe(2);
    expect(snapshot.agents).toHaveLength(2);
  });

  it('maps error events to error state', async () => {
    const conversations = [makeConversation({ id: 'c1' })];
    vi.mocked(repo.getUserConversations).mockResolvedValue({
      data: conversations,
      total: 1,
      hasMore: false,
    });
    const errorMessage: Partial<TMessage> = {
      id: 'm1',
      type: 'agent_status',
      content: { status: 'error' } as any,
      createdAt: Date.now(),
    };
    vi.mocked(repo.getMessages).mockResolvedValue({
      data: [errorMessage as TMessage],
      total: 1,
      hasMore: false,
    });

    const snapshot = await new ActivitySnapshotBuilder(repo, taskManager).build();

    const agent = snapshot.agents[0];
    expect(agent?.state).toBe('error');
  });

  it('returns empty agents array when no conversations exist', async () => {
    vi.mocked(repo.getUserConversations).mockResolvedValue({
      data: [],
      total: 0,
      hasMore: false,
    });

    const snapshot = await new ActivitySnapshotBuilder(repo, taskManager).build();

    expect(snapshot.totalConversations).toBe(0);
    expect(snapshot.agents).toHaveLength(0);
  });
});
