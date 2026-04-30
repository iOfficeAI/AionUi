/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test') } }));

const {
  mockConversationGet,
  mockConversationCreate,
  mockConversationUpdate,
  mockConversationRemove,
  mockConversationListByCron,
  mockGetConversationMessages,
  mockGetUserConversations,
  mockSearchConversationMessages,
} = vi.hoisted(() => ({
  mockConversationGet: vi.fn(),
  mockConversationCreate: vi.fn(),
  mockConversationUpdate: vi.fn(),
  mockConversationRemove: vi.fn(),
  mockConversationListByCron: vi.fn(),
  mockGetConversationMessages: vi.fn(),
  mockGetUserConversations: vi.fn(),
  mockSearchConversationMessages: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: mockConversationGet },
      createWithConversation: { invoke: mockConversationCreate },
      update: { invoke: mockConversationUpdate },
      remove: { invoke: mockConversationRemove },
      listByCronJob: { invoke: mockConversationListByCron },
    },
    database: {
      getConversationMessages: { invoke: mockGetConversationMessages },
      getUserConversations: { invoke: mockGetUserConversations },
      searchConversationMessages: { invoke: mockSearchConversationMessages },
    },
  },
}));

import { SqliteConversationRepository } from '../../src/process/services/database/SqliteConversationRepository';

describe('SqliteConversationRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getConversation returns data from backend', async () => {
    const fakeConv = { id: 'c1', type: 'gemini' };
    mockConversationGet.mockResolvedValue(fakeConv);
    const repo = new SqliteConversationRepository();
    expect(await repo.getConversation('c1')).toEqual(fakeConv);
    expect(mockConversationGet).toHaveBeenCalledWith({ id: 'c1' });
  });

  it('createConversation calls backend createWithConversation', async () => {
    const repo = new SqliteConversationRepository();
    const conv = { id: 'c1', type: 'gemini' } as any;
    await repo.createConversation(conv);
    expect(mockConversationCreate).toHaveBeenCalledWith({ conversation: conv });
  });

  it('updateConversation calls backend patch', async () => {
    const repo = new SqliteConversationRepository();
    await repo.updateConversation('c1', { name: 'new name' });
    expect(mockConversationUpdate).toHaveBeenCalledWith({ id: 'c1', updates: { name: 'new name' } });
  });

  it('deleteConversation calls backend remove', async () => {
    const repo = new SqliteConversationRepository();
    await repo.deleteConversation('c1');
    expect(mockConversationRemove).toHaveBeenCalledWith({ id: 'c1' });
  });

  it('getMessages maps to PaginatedResult shape', async () => {
    mockGetConversationMessages.mockResolvedValue({ items: [{ id: 'm1' }], total: 1, has_more: false });
    const repo = new SqliteConversationRepository();
    const result = await repo.getMessages('c1', 0, 100);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.has_more).toBe(false);
    expect(mockGetConversationMessages).toHaveBeenCalledWith({
      conversation_id: 'c1',
      page: 1,
      page_size: 100,
      order: undefined,
    });
  });

  it('insertMessage is no longer supported in Electron', async () => {
    const repo = new SqliteConversationRepository();
    const msg = { id: 'm1', conversation_id: 'c1' } as any;
    await expect(repo.insertMessage(msg)).rejects.toThrow('insertMessage is no longer supported in Electron');
  });

  it('getUserConversations maps to PaginatedResult shape', async () => {
    mockGetUserConversations.mockResolvedValue({ items: [{ id: 'c1' }], total: 1, has_more: false });
    const repo = new SqliteConversationRepository();
    const result = await repo.getUserConversations();
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.has_more).toBe(false);
  });

  it('getUserConversations forwards cursor and limit to backend', async () => {
    mockGetUserConversations.mockResolvedValue({ items: [], total: 0, has_more: false });
    const repo = new SqliteConversationRepository();
    await repo.getUserConversations('cursor-1', 2, 20);
    expect(mockGetUserConversations).toHaveBeenCalledWith({ cursor: 'cursor-1', limit: 20 });
  });

  it('searchMessages maps backend response to IMessageSearchResponse', async () => {
    mockSearchConversationMessages.mockResolvedValue({ items: [], total: 0, has_more: false });
    const repo = new SqliteConversationRepository();
    const result = await repo.searchMessages('hello', 0, 50);
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
      has_more: false,
    });
  });

  it('getConversationsByCronJob delegates to backend', async () => {
    mockConversationListByCron.mockResolvedValue([{ id: 'cron-conv-1' }]);
    const repo = new SqliteConversationRepository();
    await expect(repo.getConversationsByCronJob('cron-1')).resolves.toEqual([{ id: 'cron-conv-1' }]);
    expect(mockConversationListByCron).toHaveBeenCalledWith({ cron_job_id: 'cron-1' });
  });
});
