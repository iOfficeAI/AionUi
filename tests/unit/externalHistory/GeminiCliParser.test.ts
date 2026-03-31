/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs and os before imports
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  },
  createReadStream: vi.fn(() => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      destroy: vi.fn(),
    };
  }),
}));

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
  listGeminiCliSessions,
  parseGeminiCliSession,
} from '../../../src/process/services/externalHistory/GeminiCliParser';

const mockReadFile = vi.mocked(fs.readFile);
const mockReaddir = vi.mocked(fs.readdir);

describe('GeminiCliParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listGeminiCliSessions', () => {
    it('returns empty array when history directory does not exist', async () => {
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await listGeminiCliSessions();
      expect(result).toEqual([]);
    });

    it('parses sessions from Gemini CLI history', async () => {
      // Mock history dir listing
      mockReaddir.mockResolvedValueOnce(['project1'] as never);
      // Mock chats dir listing for project1
      mockReaddir.mockResolvedValueOnce(['session-abc.json'] as never);
      // Mock .project_root
      mockReadFile.mockResolvedValueOnce('/home/user/project' as never);
      // Mock session file
      const sessionData = JSON.stringify({
        sessionId: 'abc-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        summary: 'Test Session',
        messages: [
          { id: '1', timestamp: '2025-01-01T00:00:00Z', type: 'user', content: [{ text: 'Hello' }] },
          { id: '2', timestamp: '2025-01-01T00:01:00Z', type: 'gemini', content: 'Hi there' },
        ],
      });
      mockReadFile.mockResolvedValueOnce(sessionData as never);

      const result = await listGeminiCliSessions();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'abc-123',
        name: 'Test Session',
        backend: 'gemini-cli',
        workspace: '/home/user/project',
        updatedAt: new Date('2025-01-01T01:00:00Z').getTime(),
      });
    });

    it('skips sessions with fewer than 2 messages', async () => {
      mockReaddir.mockResolvedValueOnce(['proj'] as never);
      mockReaddir.mockResolvedValueOnce(['session-1.json'] as never);
      mockReadFile.mockResolvedValueOnce('' as never); // .project_root fails
      const sessionData = JSON.stringify({
        sessionId: 'single-msg',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z',
        messages: [{ id: '1', timestamp: '2025-01-01T00:00:00Z', type: 'user', content: [{ text: 'Hello' }] }],
      });
      mockReadFile.mockResolvedValueOnce(sessionData as never);

      const result = await listGeminiCliSessions();
      expect(result).toEqual([]);
    });

    it('skips sessions without sessionId', async () => {
      mockReaddir.mockResolvedValueOnce(['proj'] as never);
      mockReaddir.mockResolvedValueOnce(['session-1.json'] as never);
      mockReadFile.mockRejectedValueOnce(new Error('no root')); // .project_root fails
      const sessionData = JSON.stringify({
        startTime: '2025-01-01T00:00:00Z',
        messages: [
          { id: '1', type: 'user', content: [{ text: 'a' }] },
          { id: '2', type: 'gemini', content: 'b' },
        ],
      });
      mockReadFile.mockResolvedValueOnce(sessionData as never);

      const result = await listGeminiCliSessions();
      expect(result).toEqual([]);
    });

    it('skips non-json files in chats directory', async () => {
      mockReaddir.mockResolvedValueOnce(['proj'] as never);
      mockReaddir.mockResolvedValueOnce(['readme.txt', 'notes.md'] as never);
      mockReadFile.mockRejectedValueOnce(new Error('no root'));

      const result = await listGeminiCliSessions();
      expect(result).toEqual([]);
    });

    it('continues when chats directory is unreadable', async () => {
      mockReaddir.mockResolvedValueOnce(['proj1', 'proj2'] as never);
      // proj1 chats dir fails
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));
      // proj2 chats dir also fails
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await listGeminiCliSessions();
      expect(result).toEqual([]);
    });
  });

  describe('parseGeminiCliSession', () => {
    it('returns empty result when session file not found', async () => {
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await parseGeminiCliSession('nonexistent-id');
      expect(result).toEqual({ messages: [], workspace: '', name: '' });
    });

    it('parses messages from session JSON', async () => {
      // findSessionFile: scan tmp dir
      mockReaddir.mockResolvedValueOnce(['proj1'] as never);
      // chats listing → filename match
      mockReaddir.mockResolvedValueOnce(['session-test-id.json'] as never);

      const sessionData = JSON.stringify({
        sessionId: 'test-id',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        summary: 'My Session',
        messages: [
          { id: '1', timestamp: '2025-01-01T00:00:00Z', type: 'user', content: [{ text: 'Hello' }] },
          { id: '2', timestamp: '2025-01-01T00:01:00Z', type: 'gemini', content: 'Hi there!' },
          { id: '3', timestamp: '2025-01-01T00:02:00Z', type: 'tool_use', content: 'tool output' },
        ],
      });

      // readFile for session parse
      mockReadFile.mockResolvedValueOnce(sessionData as never);
      // readFile for .project_root
      mockReadFile.mockResolvedValueOnce('/home/user/project' as never);

      const result = await parseGeminiCliSession('test-id');

      expect(result.workspace).toBe('/home/user/project');
      expect(result.name).toBe('My Session');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe('Hi there!');
    });

    it('strips system instruction prefix from user messages', async () => {
      mockReaddir.mockResolvedValueOnce(['proj'] as never);
      mockReaddir.mockResolvedValueOnce(['session-strip-id.json'] as never);

      const sessionData = JSON.stringify({
        sessionId: 'strip-id',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-01-01T00:00:00Z',
            type: 'user',
            content: [
              { text: '[Assistant Rules...]\n[Available Skills]...\n[User Request]\nActual user question here' },
            ],
          },
          { id: '2', timestamp: '2025-01-01T00:01:00Z', type: 'gemini', content: 'Response' },
        ],
      });

      mockReadFile.mockResolvedValueOnce(sessionData as never);
      mockReadFile.mockRejectedValueOnce(new Error('no root'));

      const result = await parseGeminiCliSession('strip-id');

      expect(result.messages[0].content).toBe('Actual user question here');
    });

    it('skips messages with empty content', async () => {
      mockReaddir.mockResolvedValueOnce(['proj'] as never);
      mockReaddir.mockResolvedValueOnce(['session-empty-id.json'] as never);

      const sessionData = JSON.stringify({
        sessionId: 'empty-id',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          { id: '1', timestamp: '2025-01-01T00:00:00Z', type: 'user', content: [{ text: '' }] },
          { id: '2', timestamp: '2025-01-01T00:01:00Z', type: 'gemini', content: '' },
        ],
      });

      mockReadFile.mockResolvedValueOnce(sessionData as never);
      mockReadFile.mockRejectedValueOnce(new Error('no root'));

      const result = await parseGeminiCliSession('empty-id');
      expect(result.messages).toHaveLength(0);
    });
  });
});
