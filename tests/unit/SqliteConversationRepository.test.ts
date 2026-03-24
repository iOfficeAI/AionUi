/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test') } }));

const mockDb = {
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getConversationMessages: vi.fn(),
  insertMessage: vi.fn(),
  getUserConversations: vi.fn(),
};
vi.mock('@process/services/database', () => ({ getDatabase: vi.fn(() => Promise.resolve(mockDb)) }));

import { SqliteConversationRepository } from '../../src/process/services/database/SqliteConversationRepository';

describe('SqliteConversationRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getConversation returns data when DB succeeds', async () => {
    const fakeConv = { id: 'c1', type: 'gemini' };
    mockDb.getConversation.mockReturnValue({ success: true, data: fakeConv });
    const repo = new SqliteConversationRepository();
    expect(await repo.getConversation('c1')).toEqual(fakeConv);
    expect(mockDb.getConversation).toHaveBeenCalledWith('c1');
  });

  it('getConversation returns undefined when DB fails', async () => {
    mockDb.getConversation.mockReturnValue({ success: false, data: null });
    const repo = new SqliteConversationRepository();
    expect(await repo.getConversation('missing')).toBeUndefined();
  });

  it('createConversation calls db.createConversation', async () => {
    mockDb.createConversation.mockReturnValue({ success: true });
    const repo = new SqliteConversationRepository();
    const conv = { id: 'c1', type: 'gemini' } as any;
    await repo.createConversation(conv);
    expect(mockDb.createConversation).toHaveBeenCalledWith(conv);
  });

  it('updateConversation calls db.updateConversation', async () => {
    mockDb.updateConversation.mockReturnValue({ success: true });
    const repo = new SqliteConversationRepository();
    await repo.updateConversation('c1', { name: 'new name' });
    expect(mockDb.updateConversation).toHaveBeenCalledWith('c1', { name: 'new name' });
  });

  it('deleteConversation calls db.deleteConversation', async () => {
    mockDb.deleteConversation.mockReturnValue({ success: true });
    const repo = new SqliteConversationRepository();
    await repo.deleteConversation('c1');
    expect(mockDb.deleteConversation).toHaveBeenCalledWith('c1');
  });

  it('getMessages maps to PaginatedResult shape', async () => {
    mockDb.getConversationMessages.mockReturnValue({ data: [{ id: 'm1' }], total: 1, hasMore: false });
    const repo = new SqliteConversationRepository();
    const result = await repo.getMessages('c1', 0, 100);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(mockDb.getConversationMessages).toHaveBeenCalledWith('c1', 0, 100, undefined);
  });

  it('insertMessage calls db.insertMessage', async () => {
    mockDb.insertMessage.mockReturnValue({ success: true });
    const repo = new SqliteConversationRepository();
    const msg = { id: 'm1', conversation_id: 'c1' } as any;
    await repo.insertMessage(msg);
    expect(mockDb.insertMessage).toHaveBeenCalledWith(msg);
  });

  it('getUserConversations maps to PaginatedResult shape', async () => {
    mockDb.getUserConversations.mockReturnValue({ data: [{ id: 'c1' }], total: 1, hasMore: false });
    const repo = new SqliteConversationRepository();
    const result = await repo.getUserConversations();
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('getUserConversations passes page and pageSize when offset/limit provided', async () => {
    mockDb.getUserConversations.mockReturnValue({ data: [], total: 0, hasMore: false });
    const repo = new SqliteConversationRepository();
    await repo.getUserConversations(undefined, 2, 20);
    // offset=2, limit=20 → page = Math.floor(2/20) = 0, pageSize = 20
    expect(mockDb.getUserConversations).toHaveBeenCalledWith(undefined, 0, 20);
  });
});
