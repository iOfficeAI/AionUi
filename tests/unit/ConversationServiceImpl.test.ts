/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IConversationRepository } from '../../src/process/services/database/IConversationRepository';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp'), isPackaged: false } }));
vi.mock('../../src/process/utils/initStorage', () => ({ ProcessChat: { get: vi.fn(async () => []) } }));

const mockCronService = vi.hoisted(() => ({
  listJobsByConversation: vi.fn(async () => []),
  removeJob: vi.fn(async () => {}),
  updateJob: vi.fn(async () => {}),
}));

vi.mock('../../src/process/services/cron/cronServiceSingleton', () => ({
  cronService: mockCronService,
}));
vi.mock('../../src/process/utils/initAgent', () => ({
  createGeminiAgent: vi.fn(async () => ({ id: 'gen-id', type: 'gemini', name: 'test', extra: {} })),
  createAcpAgent: vi.fn(async () => ({ id: 'acp-id', type: 'acp', name: 'test', extra: {} })),
  createOpenClawAgent: vi.fn(async () => ({ id: 'claw-id', type: 'openclaw-gateway', name: 'test', extra: {} })),
  createNanobotAgent: vi.fn(async () => ({ id: 'nano-id', type: 'nanobot', name: 'test', extra: {} })),
  createRemoteAgent: vi.fn(async () => ({ id: 'remote-id', type: 'remote', name: 'test', extra: {} })),
}));
vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'mocked-uuid'),
}));

function makeRepo(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
  return {
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    insertMessage: vi.fn(),
    getUserConversations: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    listAllConversations: vi.fn(() => []),
    searchMessages: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
    getConversationsByCronJob: vi.fn(async () => []),
    ...overrides,
  };
}

import { ConversationServiceImpl } from '../../src/process/services/ConversationServiceImpl';
import type { CronJob } from '../../src/process/services/cron/CronStore';
import type { TChatConversation } from '../../src/common/config/storage';

function makeCronJob(overrides?: Partial<CronJob>): CronJob {
  return {
    id: 'job-1',
    name: 'test-job',
    enabled: true,
    schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
    target: { payload: { kind: 'message', text: 'hello' } },
    metadata: {
      conversationId: 'conv-1',
      agentType: 'gemini',
      createdBy: 'user',
      createdAt: 1000,
      updatedAt: 1000,
    },
    state: { runCount: 0, retryCount: 0, maxRetries: 3 },
    ...overrides,
  };
}

function makeConversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'conv-1',
    name: 'Test Conversation',
    type: 'gemini',
    model: { provider: 'gemini', model: 'gemini-2.0-flash' },
    createTime: 1000,
    modifyTime: 1000,
    source: 'create' as const,
    extra: {},
    ...overrides,
  } as TChatConversation;
}

describe('ConversationServiceImpl.getConversation', () => {
  it('returns conversation from repo', async () => {
    const fakeConv = { id: 'c1', type: 'gemini' } as any;
    const repo = makeRepo({ getConversation: vi.fn(() => fakeConv) });
    const svc = new ConversationServiceImpl(repo);
    expect(await svc.getConversation('c1')).toEqual(fakeConv);
  });

  it('returns undefined when not found', async () => {
    const repo = makeRepo({ getConversation: vi.fn(() => undefined) });
    const svc = new ConversationServiceImpl(repo);
    expect(await svc.getConversation('missing')).toBeUndefined();
  });
});

describe('ConversationServiceImpl.deleteConversation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls repo.deleteConversation', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await svc.deleteConversation('c1');
    expect(repo.deleteConversation).toHaveBeenCalledWith('c1');
  });

  it('delegates directly to repo without cron cleanup', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await svc.deleteConversation('conv-1');

    // deleteConversation only calls repo — cron cleanup is handled at the bridge layer
    expect(repo.deleteConversation).toHaveBeenCalledWith('conv-1');
    expect(mockCronService.listJobsByConversation).not.toHaveBeenCalled();
  });
});

describe('ConversationServiceImpl.updateConversation', () => {
  it('calls repo.updateConversation with updates', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await svc.updateConversation('c1', { name: 'new name' });
    expect(repo.updateConversation).toHaveBeenCalledWith('c1', { name: 'new name' });
  });

  it('merges extra when mergeExtra=true', async () => {
    const existing = { id: 'c1', extra: { workspace: '/ws', existing: true } } as any;
    const repo = makeRepo({ getConversation: vi.fn(() => existing) });
    const svc = new ConversationServiceImpl(repo);
    await svc.updateConversation('c1', { extra: { newField: 1 } } as any, true);
    expect(repo.updateConversation).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ extra: expect.objectContaining({ existing: true, newField: 1 }) })
    );
  });
});

describe('ConversationServiceImpl.createWithMigration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates conversation in repo', async () => {
    const repo = makeRepo({
      getMessages: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    });
    const svc = new ConversationServiceImpl(repo);
    const conv = { id: 'new', name: 'test' } as any;
    await svc.createWithMigration({ conversation: conv });
    expect(repo.createConversation).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  });

  it('copies messages from source conversation', async () => {
    const msg = { id: 'msg1', conversation_id: 'src', content: 'hello' } as any;
    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockReturnValueOnce({ data: [msg], total: 1, hasMore: false }) // source first page
        .mockReturnValue({ data: [], total: 1, hasMore: false }), // integrity check calls
    });
    const svc = new ConversationServiceImpl(repo);
    await svc.createWithMigration({ conversation: { id: 'new' } as any, sourceConversationId: 'src' });
    expect(repo.insertMessage).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'new' }));
  });

  it('migrates cron jobs to new conversation when migrateCron is true', async () => {
    const targetConv = makeConversation({ id: 'target-conv', name: 'Target' });
    const job1 = makeCronJob({
      id: 'job-1',
      metadata: { conversationId: 'source-conv', conversationTitle: 'Source' } as any,
    });
    const job2 = makeCronJob({
      id: 'job-2',
      metadata: { conversationId: 'source-conv', conversationTitle: 'Source' } as any,
    });

    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }) // Source messages page 0
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }) // Source integrity check
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }), // Target integrity check
    });
    mockCronService.listJobsByConversation.mockResolvedValue([job1, job2]);

    const svc = new ConversationServiceImpl(repo);
    await svc.createWithMigration({
      conversation: targetConv,
      sourceConversationId: 'source-conv',
      migrateCron: true,
    });

    expect(mockCronService.listJobsByConversation).toHaveBeenCalledWith('source-conv');
    expect(mockCronService.updateJob).toHaveBeenCalledWith('job-1', {
      metadata: {
        ...job1.metadata,
        conversationId: 'target-conv',
        conversationTitle: 'Target',
      },
    });
    expect(mockCronService.updateJob).toHaveBeenCalledWith('job-2', {
      metadata: {
        ...job2.metadata,
        conversationId: 'target-conv',
        conversationTitle: 'Target',
      },
    });
    expect(mockCronService.removeJob).not.toHaveBeenCalled();
  });

  it('deletes cron jobs when migrateCron is false', async () => {
    const targetConv = makeConversation({ id: 'target-conv', name: 'Target' });
    const job1 = makeCronJob({ id: 'job-1', metadata: { conversationId: 'source-conv' } as any });
    const job2 = makeCronJob({ id: 'job-2', metadata: { conversationId: 'source-conv' } as any });

    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }) // Source messages page 0
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }) // Source integrity check
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }), // Target integrity check
    });
    mockCronService.listJobsByConversation.mockResolvedValue([job1, job2]);

    const svc = new ConversationServiceImpl(repo);
    await svc.createWithMigration({
      conversation: targetConv,
      sourceConversationId: 'source-conv',
      migrateCron: false,
    });

    expect(mockCronService.removeJob).toHaveBeenCalledWith('job-1');
    expect(mockCronService.removeJob).toHaveBeenCalledWith('job-2');
    expect(mockCronService.updateJob).not.toHaveBeenCalled();
  });

  it('continues migration even if cron handling fails', async () => {
    const targetConv = makeConversation({ id: 'target-conv', name: 'Target' });

    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }) // Source messages page 0
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }) // Source integrity check
        .mockResolvedValueOnce({ data: [], total: 0, hasMore: false }), // Target integrity check
    });
    mockCronService.listJobsByConversation.mockRejectedValue(new Error('Cron error'));

    const svc = new ConversationServiceImpl(repo);

    // Should not throw
    await svc.createWithMigration({
      conversation: targetConv,
      sourceConversationId: 'source-conv',
      migrateCron: true,
    });

    expect(repo.deleteConversation).toHaveBeenCalledWith('source-conv');
  });

  it('deletes source conversation only when message count matches', async () => {
    const targetConv = makeConversation({ id: 'target-conv', name: 'Target' });

    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockResolvedValueOnce({ data: [], total: 5, hasMore: false }) // Source messages page 0
        .mockResolvedValueOnce({ data: [], total: 5, hasMore: false }) // Source integrity check
        .mockResolvedValueOnce({ data: [], total: 5, hasMore: false }), // Target integrity check
    });
    mockCronService.listJobsByConversation.mockResolvedValue([]);

    const svc = new ConversationServiceImpl(repo);
    await svc.createWithMigration({
      conversation: targetConv,
      sourceConversationId: 'source-conv',
    });

    expect(repo.deleteConversation).toHaveBeenCalledWith('source-conv');
  });

  it('does not delete source conversation when message count mismatches', async () => {
    const targetConv = makeConversation({ id: 'target-conv', name: 'Target' });

    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockResolvedValueOnce({ data: [], total: 5, hasMore: false }) // Source messages page 0
        .mockResolvedValueOnce({ data: [], total: 5, hasMore: false }) // Source integrity check
        .mockResolvedValueOnce({ data: [], total: 3, hasMore: false }), // Target integrity check (mismatch)
    });
    mockCronService.listJobsByConversation.mockResolvedValue([]);

    const svc = new ConversationServiceImpl(repo);
    await svc.createWithMigration({
      conversation: targetConv,
      sourceConversationId: 'source-conv',
    });

    expect(repo.deleteConversation).not.toHaveBeenCalled();
  });

  it('handles paginated message copying', async () => {
    const targetConv = makeConversation({ id: 'target-conv', name: 'Target' });
    const page1Messages = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`,
      conversation_id: 'source-conv',
      type: 'user',
      text: `message ${i}`,
      createTime: 1000 + i,
    }));
    const page2Messages = Array.from({ length: 50 }, (_, i) => ({
      id: `msg-${100 + i}`,
      conversation_id: 'source-conv',
      type: 'user',
      text: `message ${100 + i}`,
      createTime: 1100 + i,
    }));

    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockResolvedValueOnce({ data: page1Messages, total: 150, hasMore: true }) // Page 0
        .mockResolvedValueOnce({ data: page2Messages, total: 150, hasMore: false }) // Page 1
        .mockResolvedValueOnce({ data: [], total: 150, hasMore: false }) // Source integrity check
        .mockResolvedValueOnce({ data: [], total: 150, hasMore: false }), // Target integrity check
    });
    mockCronService.listJobsByConversation.mockResolvedValue([]);

    const svc = new ConversationServiceImpl(repo);
    await svc.createWithMigration({
      conversation: targetConv,
      sourceConversationId: 'source-conv',
    });

    expect(repo.getMessages).toHaveBeenCalledWith('source-conv', 0, 10000);
    expect(repo.getMessages).toHaveBeenCalledWith('source-conv', 1, 10000);
    expect(repo.insertMessage).toHaveBeenCalledTimes(150);
    expect(repo.deleteConversation).toHaveBeenCalledWith('source-conv');
  });

  it('sets createTime and modifyTime if missing', async () => {
    const now = Date.now();
    const targetConv = makeConversation({
      id: 'target-conv',
      name: 'Target',
      createTime: undefined as any,
      modifyTime: undefined as any,
    });

    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);

    await svc.createWithMigration({
      conversation: targetConv,
    });

    expect(repo.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        createTime: expect.any(Number),
        modifyTime: expect.any(Number),
      })
    );

    const call = vi.mocked(repo.createConversation).mock.calls[0][0];
    expect(call.createTime).toBeGreaterThanOrEqual(now);
    expect(call.modifyTime).toBeGreaterThanOrEqual(now);
  });
});

describe('ConversationServiceImpl.createConversation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and saves a gemini conversation', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    const result = await svc.createConversation({
      type: 'gemini',
      model: { provider: 'google', model: 'gemini-2.0-flash' } as any,
      extra: { workspace: '/ws' },
    });
    expect(result.type).toBe('gemini');
    expect(repo.createConversation).toHaveBeenCalledWith(expect.objectContaining({ type: 'gemini' }));
  });

  it('creates and saves an acp conversation', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    const result = await svc.createConversation({
      type: 'acp',
      model: { provider: 'anthropic', model: 'claude-3-5-sonnet' } as any,
      extra: { workspace: '/ws', backend: 'claude' },
    });
    expect(result.type).toBe('acp');
    expect(repo.createConversation).toHaveBeenCalledWith(expect.objectContaining({ type: 'acp' }));
  });

  it('throws for unknown conversation type', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await expect(svc.createConversation({ type: 'unknown' as any, model: {} as any, extra: {} })).rejects.toThrow();
  });

  it('throws for undefined conversation type (ELECTRON-FP)', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await expect(svc.createConversation({ type: undefined as any, model: {} as any, extra: {} })).rejects.toThrow(
      'Invalid conversation type'
    );
  });

  it('allows cronJobId in extra field', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    const result = await svc.createConversation({
      type: 'gemini',
      model: { provider: 'gemini', model: 'gemini-2.0-flash' } as any,
      extra: {
        workspace: '/workspace',
        cronJobId: 'job-123',
      },
    });

    expect(repo.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          cronJobId: 'job-123',
        }),
      })
    );
    expect(result.extra).toMatchObject({
      cronJobId: 'job-123',
    });
  });

  it('does not overwrite factory-produced extra fields with params extra', async () => {
    const { createGeminiAgent } = await import('../../src/process/utils/initAgent');
    vi.mocked(createGeminiAgent).mockResolvedValueOnce({
      id: 'agent-conv-id',
      name: 'Gemini Agent',
      type: 'gemini',
      model: { provider: 'gemini', model: 'gemini-2.0-flash' },
      createTime: 1000,
      modifyTime: 1000,
      source: 'create' as const,
      extra: { workspace: '/factory-workspace', enabledSkills: ['skill1'] },
    } as any);

    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);

    await svc.createConversation({
      type: 'gemini',
      model: { provider: 'gemini', model: 'gemini-2.0-flash' } as any,
      extra: {
        workspace: '/params-workspace', // Should be ignored (factory takes precedence)
        cronJobId: 'job-123', // Should be added (not in factory)
      },
    });

    expect(repo.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          workspace: '/factory-workspace', // Factory value preserved
          enabledSkills: ['skill1'], // Factory value preserved
          cronJobId: 'job-123', // Params value added
        }),
      })
    );
  });
});

describe('ConversationServiceImpl.listAllConversations', () => {
  it('delegates to repository', async () => {
    const conversations = [makeConversation({ id: 'conv-1' }), makeConversation({ id: 'conv-2' })];
    const repo = makeRepo({ listAllConversations: vi.fn(async () => conversations) });
    const svc = new ConversationServiceImpl(repo);

    const result = await svc.listAllConversations();

    expect(repo.listAllConversations).toHaveBeenCalled();
    expect(result).toEqual(conversations);
  });
});

describe('ConversationServiceImpl.getConversationsByCronJob', () => {
  it('delegates to repository', async () => {
    const conversations = [makeConversation({ id: 'conv-1' }), makeConversation({ id: 'conv-2' })];
    const repo = makeRepo({ getConversationsByCronJob: vi.fn(async () => conversations) });
    const svc = new ConversationServiceImpl(repo);

    const result = await svc.getConversationsByCronJob('job-1');

    expect(repo.getConversationsByCronJob).toHaveBeenCalledWith('job-1');
    expect(result).toEqual(conversations);
  });
});
