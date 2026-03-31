/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs and os before imports
vi.mock('fs', () => {
  const actual = vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      readFile: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
    },
    createReadStream: vi.fn(),
  };
});

vi.mock('os', () => ({
  default: { homedir: () => '/mock-home' },
  homedir: () => '/mock-home',
}));

vi.mock('readline', () => ({
  createInterface: vi.fn(() => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      close: vi.fn(),
      _listeners: listeners,
    };
  }),
}));

import { promises as fs } from 'fs';
import {
  listClaudeCodeSessions,
  parseClaudeSession,
} from '../../../src/process/services/externalHistory/ClaudeCodeParser';

const mockReadFile = vi.mocked(fs.readFile);

describe('ClaudeCodeParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listClaudeCodeSessions', () => {
    it('returns empty array when history.jsonl does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await listClaudeCodeSessions();
      expect(result).toEqual([]);
    });

    it('parses sessions from history.jsonl', async () => {
      const historyContent = [
        JSON.stringify({ sessionId: 'abc-123', display: 'Test Session', project: '/home/user/proj', timestamp: 1000 }),
        JSON.stringify({ sessionId: 'def-456', display: 'Another', project: '/home/user/proj2', timestamp: 2000 }),
      ].join('\n');

      mockReadFile.mockResolvedValue(historyContent as never);
      const result = await listClaudeCodeSessions();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'abc-123',
        name: 'Test Session',
        backend: 'claude',
        workspace: '/home/user/proj',
        updatedAt: 1000,
      });
    });

    it('deduplicates sessions by id, keeping latest', async () => {
      const historyContent = [
        JSON.stringify({ sessionId: 'abc-123', display: 'Old Title', project: '/proj', timestamp: 1000 }),
        JSON.stringify({ sessionId: 'abc-123', display: 'New Title', project: '/proj', timestamp: 2000 }),
      ].join('\n');

      mockReadFile.mockResolvedValue(historyContent as never);
      const result = await listClaudeCodeSessions();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('New Title');
      expect(result[0].updatedAt).toBe(2000);
    });

    it('skips malformed lines', async () => {
      const historyContent = [
        'not valid json',
        JSON.stringify({ sessionId: 'valid-1', display: 'Valid', project: '/proj', timestamp: 1000 }),
        '{ broken json',
      ].join('\n');

      mockReadFile.mockResolvedValue(historyContent as never);
      const result = await listClaudeCodeSessions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('valid-1');
    });

    it('skips entries without sessionId', async () => {
      const historyContent = JSON.stringify({ display: 'No ID', project: '/proj', timestamp: 1000 });
      mockReadFile.mockResolvedValue(historyContent as never);
      const result = await listClaudeCodeSessions();
      expect(result).toEqual([]);
    });

    it('uses default name when display is empty', async () => {
      const historyContent = JSON.stringify({ sessionId: 'abc-123', display: '', project: '/proj', timestamp: 1000 });
      mockReadFile.mockResolvedValue(historyContent as never);
      const result = await listClaudeCodeSessions();
      expect(result[0].name).toBe('Claude Code Session');
    });
  });

  describe('parseClaudeSession', () => {
    it('returns empty result when session metadata not found', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await parseClaudeSession('nonexistent-id');
      expect(result).toEqual({ messages: [], workspace: '', name: '' });
    });

    it('parses messages from session JSONL', async () => {
      // First call: history.jsonl for findSessionMeta
      const historyContent = JSON.stringify({
        sessionId: 'sess-1',
        display: 'Test',
        project: '/Users/audi/project',
        timestamp: 1000,
      });

      // Second call: session file
      const sessionContent = [
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'text', text: 'Hello' }] },
          timestamp: '2025-01-01T00:00:00Z',
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hi there!' }] },
          timestamp: '2025-01-01T00:00:01Z',
        }),
      ].join('\n');

      mockReadFile.mockResolvedValueOnce(historyContent as never).mockResolvedValueOnce(sessionContent as never);

      const result = await parseClaudeSession('sess-1');

      expect(result.workspace).toBe('/Users/audi/project');
      expect(result.name).toBe('Test');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'Hello',
        timestamp: new Date('2025-01-01T00:00:00Z').getTime(),
      });
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe('Hi there!');
    });

    it('handles string content in messages', async () => {
      const historyContent = JSON.stringify({
        sessionId: 'sess-1',
        display: 'Test',
        project: '/proj',
        timestamp: 1000,
      });

      const sessionContent = JSON.stringify({
        type: 'user',
        message: { content: 'Direct string content' },
      });

      mockReadFile.mockResolvedValueOnce(historyContent as never).mockResolvedValueOnce(sessionContent as never);

      const result = await parseClaudeSession('sess-1');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Direct string content');
    });

    it('skips non-user/assistant message types', async () => {
      const historyContent = JSON.stringify({
        sessionId: 'sess-1',
        display: 'Test',
        project: '/proj',
        timestamp: 1000,
      });

      const sessionContent = [
        JSON.stringify({ type: 'system', message: { content: 'system msg' } }),
        JSON.stringify({ type: 'tool_use', message: { content: 'tool msg' } }),
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Real message' }] } }),
      ].join('\n');

      mockReadFile.mockResolvedValueOnce(historyContent as never).mockResolvedValueOnce(sessionContent as never);

      const result = await parseClaudeSession('sess-1');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Real message');
    });

    it('skips messages with empty text content', async () => {
      const historyContent = JSON.stringify({
        sessionId: 'sess-1',
        display: 'Test',
        project: '/proj',
        timestamp: 1000,
      });

      const sessionContent = JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: '' }] },
      });

      mockReadFile.mockResolvedValueOnce(historyContent as never).mockResolvedValueOnce(sessionContent as never);

      const result = await parseClaudeSession('sess-1');
      expect(result.messages).toHaveLength(0);
    });

    it('returns empty messages when session file cannot be read', async () => {
      const historyContent = JSON.stringify({
        sessionId: 'sess-1',
        display: 'Test',
        project: '/proj',
        timestamp: 1000,
      });

      mockReadFile.mockResolvedValueOnce(historyContent as never).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await parseClaudeSession('sess-1');
      expect(result.messages).toHaveLength(0);
      expect(result.workspace).toBe('/proj');
      expect(result.name).toBe('Test');
    });
  });
});
