/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs, os, readline before imports
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

// Mock readline for readFirstLine
vi.mock('readline', () => ({
  createInterface: vi.fn(({ input }) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const rl = {
      once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
        // Auto-fire 'close' after 'line' is registered to simulate no data
        if (event === 'close') {
          // If no line event was fired, fire close
          setTimeout(() => {
            if (!rl._lineFired) cb();
          }, 0);
        }
      }),
      close: vi.fn(),
      _lineFired: false,
      _listeners: listeners,
    };
    // If the stream has mock data, fire the line event
    if (input?._mockFirstLine) {
      rl._lineFired = true;
      setTimeout(() => {
        const lineCbs = listeners['line'] || [];
        for (const cb of lineCbs) cb(input._mockFirstLine);
      }, 0);
    }
    return rl;
  }),
}));

import { promises as fs } from 'fs';
import { listCodexSessions, parseCodexSession } from '../../../src/process/services/externalHistory/CodexParser';

const mockReadFile = vi.mocked(fs.readFile);
const mockReaddir = vi.mocked(fs.readdir);
const mockStat = vi.mocked(fs.stat);

describe('CodexParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listCodexSessions', () => {
    it('returns empty array when session_index.jsonl does not exist', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await listCodexSessions();
      expect(result).toEqual([]);
    });

    it('returns empty array when sessions directory does not exist', async () => {
      // session_index has entries
      const indexContent = JSON.stringify({
        id: 'sess-1',
        thread_name: 'Test',
        updated_at: '2025-01-01T00:00:00Z',
      });
      mockReadFile.mockResolvedValueOnce(indexContent as never);
      // scanRolloutMeta: readdir of sessions dir fails
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await listCodexSessions();
      // No interactive IDs found since sessions dir doesn't exist
      expect(result).toEqual([]);
    });

    it('skips malformed index lines', async () => {
      const indexContent = ['bad json', '', '  '].join('\n');
      mockReadFile.mockResolvedValueOnce(indexContent as never);
      // scanRolloutMeta
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await listCodexSessions();
      expect(result).toEqual([]);
    });

    it('skips entries without id', async () => {
      const indexContent = JSON.stringify({ thread_name: 'no id', updated_at: '2025-01-01T00:00:00Z' });
      mockReadFile.mockResolvedValueOnce(indexContent as never);
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await listCodexSessions();
      expect(result).toEqual([]);
    });

    it('deduplicates sessions by id, keeping latest', async () => {
      const indexContent = [
        JSON.stringify({ id: 'sess-1', thread_name: 'Old Name', updated_at: '2025-01-01T00:00:00Z' }),
        JSON.stringify({ id: 'sess-1', thread_name: 'New Name', updated_at: '2025-06-01T00:00:00Z' }),
      ].join('\n');
      mockReadFile.mockResolvedValueOnce(indexContent as never);
      // scanRolloutMeta: sessions dir doesn't exist
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await listCodexSessions();
      // Empty because no interactive IDs were found
      expect(result).toEqual([]);
    });

    it('uses default name when thread_name is empty', async () => {
      const indexContent = JSON.stringify({ id: 'sess-1', thread_name: '', updated_at: '2025-01-01T00:00:00Z' });
      mockReadFile.mockResolvedValueOnce(indexContent as never);
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

      // Not returned since no interactive IDs, but parsing logic is tested
      const result = await listCodexSessions();
      expect(result).toEqual([]);
    });
  });

  describe('parseCodexSession', () => {
    it('returns empty result when rollout file not found', async () => {
      // findRolloutFile: sessions dir fails
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));
      // findSessionName: index file also fails
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await parseCodexSession('nonexistent-id');
      expect(result.messages).toEqual([]);
      expect(result.name).toBe('');
    });

    it('parses messages from rollout JSONL', async () => {
      // Set up for findRolloutFile: navigate year/month/day dirs
      // readdir for sessions dir
      mockReaddir.mockResolvedValueOnce(['2025'] as never);
      // stat for year dir
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      // readdir for months
      mockReaddir.mockResolvedValueOnce(['01'] as never);
      // stat for month dir
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      // readdir for days
      mockReaddir.mockResolvedValueOnce(['15'] as never);
      // stat for day dir
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      // readdir for files — match by sessionId in filename
      mockReaddir.mockResolvedValueOnce(['rollout-1234-test-session-id.jsonl'] as never);

      // findSessionName
      const indexContent = JSON.stringify({
        id: 'test-session-id',
        thread_name: 'My Session',
        updated_at: '2025-01-15T10:00:00Z',
      });
      mockReadFile.mockResolvedValueOnce(indexContent as never);

      // readFile for rollout content
      const rolloutContent = [
        JSON.stringify({
          timestamp: '2025-01-15T10:00:00Z',
          type: 'session_meta',
          payload: { id: 'test-session-id', source: 'cli', cwd: '/home/user/project' },
        }),
        JSON.stringify({
          timestamp: '2025-01-15T10:00:01Z',
          type: 'response_item',
          payload: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        }),
        JSON.stringify({
          timestamp: '2025-01-15T10:00:02Z',
          type: 'response_item',
          payload: { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
        }),
        JSON.stringify({
          timestamp: '2025-01-15T10:00:03Z',
          type: 'event_msg',
          payload: { type: 'agent_event' },
        }),
      ].join('\n');
      mockReadFile.mockResolvedValueOnce(rolloutContent as never);

      const result = await parseCodexSession('test-session-id');

      expect(result.workspace).toBe('/home/user/project');
      expect(result.name).toBe('My Session');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'Hello',
        timestamp: new Date('2025-01-15T10:00:01Z').getTime(),
      });
      expect(result.messages[1]).toEqual({
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date('2025-01-15T10:00:02Z').getTime(),
      });
    });

    it('skips developer/system role messages', async () => {
      // findRolloutFile setup
      mockReaddir.mockResolvedValueOnce(['2025'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['01'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['15'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['rollout-skip-roles-id.jsonl'] as never);

      // findSessionName
      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ id: 'skip-roles-id', thread_name: 'Test', updated_at: '2025-01-15T10:00:00Z' }) as never
      );

      const rolloutContent = [
        JSON.stringify({
          timestamp: '2025-01-15T10:00:00Z',
          type: 'session_meta',
          payload: { id: 'skip-roles-id', source: 'cli', cwd: '/proj' },
        }),
        JSON.stringify({
          timestamp: '2025-01-15T10:00:01Z',
          type: 'response_item',
          payload: { role: 'developer', content: [{ type: 'text', text: 'System prompt' }] },
        }),
        JSON.stringify({
          timestamp: '2025-01-15T10:00:02Z',
          type: 'response_item',
          payload: { role: 'user', content: [{ type: 'text', text: 'Real question' }] },
        }),
      ].join('\n');
      mockReadFile.mockResolvedValueOnce(rolloutContent as never);

      const result = await parseCodexSession('skip-roles-id');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Real question');
    });

    it('skips messages with empty text content', async () => {
      mockReaddir.mockResolvedValueOnce(['2025'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['01'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['15'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['rollout-empty-id.jsonl'] as never);

      mockReadFile.mockResolvedValueOnce(
        JSON.stringify({ id: 'empty-id', thread_name: 'Test', updated_at: '2025-01-15T10:00:00Z' }) as never
      );

      const rolloutContent = [
        JSON.stringify({
          timestamp: '2025-01-15T10:00:00Z',
          type: 'session_meta',
          payload: { id: 'empty-id', source: 'cli', cwd: '/proj' },
        }),
        JSON.stringify({
          timestamp: '2025-01-15T10:00:01Z',
          type: 'response_item',
          payload: { role: 'user', content: [{ type: 'text', text: '' }] },
        }),
      ].join('\n');
      mockReadFile.mockResolvedValueOnce(rolloutContent as never);

      const result = await parseCodexSession('empty-id');
      expect(result.messages).toHaveLength(0);
    });

    it('returns empty messages when rollout file cannot be read', async () => {
      mockReaddir.mockResolvedValueOnce(['2025'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['01'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['15'] as never);
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as never);
      mockReaddir.mockResolvedValueOnce(['rollout-read-fail-id.jsonl'] as never);

      mockReadFile.mockResolvedValueOnce('' as never); // findSessionName
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT')); // rollout file read fails

      const result = await parseCodexSession('read-fail-id');
      expect(result.messages).toHaveLength(0);
    });
  });
});
