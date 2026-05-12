/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

// Capture provider handlers so tests can invoke them directly
const handlers: Record<string, (...args: any[]) => any> = {};
function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: (...args: any[]) => any) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

vi.mock('../../src/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: makeChannel('getConversationMessages'),
      getUserConversations: makeChannel('getUserConversations'),
      searchConversationMessages: makeChannel('searchConversationMessages'),
      searchConversationsByName: makeChannel('searchConversationsByName'),
    },
  },
}));

vi.mock('../../src/process/utils/initStorage', () => ({
  ProcessChat: { get: vi.fn(async () => []) },
}));

vi.mock('../../src/process/bridge/migrationUtils', () => ({
  migrateConversationToDatabase: vi.fn(async () => {}),
}));

import { initDatabaseBridge } from '../../src/process/bridge/databaseBridge';
import type { IConversationRepository } from '../../src/process/services/database/IConversationRepository';
import type { TChatConversation } from '../../src/common/config/storage';
import type { TMessage } from '../../src/common/chat/chatLib';

function makeRepo(overrides?: Partial<IConversationRepository>): IConversationRepository {
  return {
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    insertMessage: vi.fn(),
    getUserConversations: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    listAllConversations: vi.fn(() => []),
    searchMessages: vi.fn(() => ({ items: [], total: 0, page: 0, pageSize: 20, hasMore: false })),
    searchConversationsByName: vi.fn(() => ({ items: [], total: 0, page: 0, pageSize: 20, hasMore: false })),
    ...overrides,
  };
}

describe('databaseBridge', () => {
  let repo: IConversationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeRepo();
    initDatabaseBridge(repo);
  });

  // --- getConversationMessages ---

  describe('getConversationMessages', () => {
    it('returns messages from repo', async () => {
      const msgs: Partial<TMessage>[] = [{ id: 'm1', type: 'text' as any }];
      vi.mocked(repo.getMessages).mockReturnValue({ data: msgs as TMessage[], total: 1, hasMore: false });

      const result = await handlers['getConversationMessages']({ conversation_id: 'c1' });

      expect(repo.getMessages).toHaveBeenCalledWith('c1', 0, 10000);
      expect(result).toEqual(msgs);
    });

    it('returns empty array when repo throws', async () => {
      vi.mocked(repo.getMessages).mockImplementation(() => {
        throw new Error('db error');
      });

      const result = await handlers['getConversationMessages']({ conversation_id: 'c1' });

      expect(result).toEqual([]);
    });

    it('does not throw when called with undefined params', async () => {
      vi.mocked(repo.getMessages).mockReturnValue({ data: [], total: 0, hasMore: false });

      const result = await handlers['getConversationMessages'](undefined);

      expect(result).toEqual([]);
    });

    it('uses provided page and pageSize', async () => {
      vi.mocked(repo.getMessages).mockReturnValue({ data: [], total: 0, hasMore: false });

      await handlers['getConversationMessages']({ conversation_id: 'c1', page: 2, pageSize: 50 });

      expect(repo.getMessages).toHaveBeenCalledWith('c1', 2, 50);
    });
  });

  // --- getUserConversations ---

  describe('getUserConversations', () => {
    it('returns db conversations when no file conversations exist', async () => {
      const dbConv: Partial<TChatConversation> = { id: 'c1', modifyTime: 2000 };
      vi.mocked(repo.getUserConversations).mockReturnValue({
        data: [dbConv as TChatConversation],
        total: 1,
        hasMore: false,
      });

      const result = await handlers['getUserConversations']({});

      expect(result).toContainEqual(dbConv);
    });

    it('merges file-only conversations that are not in DB', async () => {
      const { ProcessChat } = await import('../../src/process/utils/initStorage');
      const fileConv: Partial<TChatConversation> = { id: 'file-c1', modifyTime: 1000 };
      vi.mocked(ProcessChat.get).mockResolvedValue([fileConv] as any);
      vi.mocked(repo.getUserConversations).mockReturnValue({ data: [], total: 0, hasMore: false });

      const result = await handlers['getUserConversations']({});

      expect(result).toContainEqual(fileConv);
    });

    it('excludes file conversations already present in DB', async () => {
      const { ProcessChat } = await import('../../src/process/utils/initStorage');
      const conv: Partial<TChatConversation> = { id: 'shared-c1', modifyTime: 2000 };
      vi.mocked(ProcessChat.get).mockResolvedValue([conv] as any);
      vi.mocked(repo.getUserConversations).mockReturnValue({
        data: [conv as TChatConversation],
        total: 1,
        hasMore: false,
      });

      const result = await handlers['getUserConversations']({});

      const occurrences = result.filter((c: any) => c.id === 'shared-c1');
      expect(occurrences).toHaveLength(1);
    });

    it('returns empty array when repo throws', async () => {
      vi.mocked(repo.getUserConversations).mockImplementation(() => {
        throw new Error('db unavailable');
      });

      const result = await handlers['getUserConversations']({});

      expect(result).toEqual([]);
    });

    it('does not throw when called with undefined params (ELECTRON-FN)', async () => {
      vi.mocked(repo.getUserConversations).mockReturnValue({ data: [], total: 0, hasMore: false });

      const result = await handlers['getUserConversations'](undefined);

      expect(repo.getUserConversations).toHaveBeenCalledWith(undefined, 0, 10000);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // --- searchConversationMessages ---

  describe('searchConversationMessages', () => {
    it('returns search results from repo', async () => {
      const searchResult = { items: [{ id: 'r1' }], total: 1, page: 0, pageSize: 20, hasMore: false };
      vi.mocked(repo.searchMessages).mockReturnValue(searchResult as any);

      const result = await handlers['searchConversationMessages']({ keyword: 'hello' });

      expect(repo.searchMessages).toHaveBeenCalledWith('hello', 0, 20);
      expect(result).toEqual(searchResult);
    });

    it('returns empty result when repo throws', async () => {
      vi.mocked(repo.searchMessages).mockImplementation(() => {
        throw new Error('search error');
      });

      const result = await handlers['searchConversationMessages']({ keyword: 'hello', page: 1, pageSize: 10 });

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10, hasMore: false });
    });

    it('does not throw when called with undefined params', async () => {
      vi.mocked(repo.searchMessages).mockReturnValue({ items: [], total: 0, page: 0, pageSize: 20, hasMore: false });

      const result = await handlers['searchConversationMessages'](undefined);

      expect(result).toEqual({ items: [], total: 0, page: 0, pageSize: 20, hasMore: false });
    });
  });

  // --- searchConversationsByName ---

  describe('searchConversationsByName', () => {
    it('returns search results from repo', async () => {
      const searchResult = {
        items: [
          { conversation: { id: 'c1' }, messageId: '', messageType: 'text', messageCreatedAt: 0, previewText: 'c1' },
        ],
        total: 1,
        page: 0,
        pageSize: 20,
        hasMore: false,
      };
      vi.mocked(repo.searchConversationsByName).mockReturnValue(searchResult as any);

      const result = await handlers['searchConversationsByName']({ keyword: 'test' });

      expect(repo.searchConversationsByName).toHaveBeenCalledWith('test', 0, 20);
      expect(result).toEqual(searchResult);
    });

    it('returns empty result when repo throws', async () => {
      vi.mocked(repo.searchConversationsByName).mockImplementation(() => {
        throw new Error('search error');
      });

      const result = await handlers['searchConversationsByName']({ keyword: 'error', page: 1, pageSize: 10 });

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10, hasMore: false });
    });

    it('does not throw when called with undefined params', async () => {
      vi.mocked(repo.searchConversationsByName).mockReturnValue({
        items: [],
        total: 0,
        page: 0,
        pageSize: 20,
        hasMore: false,
      });

      const result = await handlers['searchConversationsByName'](undefined);

      expect(result).toEqual({ items: [], total: 0, page: 0, pageSize: 20, hasMore: false });
    });
  });
});
