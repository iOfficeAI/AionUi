/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const fsMock = vi.hoisted(() => ({
  open: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

const osMock = vi.hoisted(() => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

vi.mock('node:fs/promises', () => ({ default: fsMock }));
vi.mock('node:os', () => ({ default: osMock }));

import { SessionScannerService } from '../../src/process/services/sessionSync/SessionScannerService';

// --- Helpers ---

function makeFileHandle(content: string, mtimeMs = 1000) {
  const buf = Buffer.from(content, 'utf-8');
  return {
    stat: vi.fn(async () => ({ mtimeMs })),
    read: vi.fn(async (buffer: Buffer, _offset: number, length: number, position: number) => {
      const start = position;
      const end = Math.min(start + length, buf.length);
      const bytesRead = end - start;
      if (bytesRead <= 0) return { bytesRead: 0 };
      buf.copy(buffer, 0, start, end);
      return { bytesRead };
    }),
    close: vi.fn(async () => {}),
  };
}

function makeDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  };
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/');
}

// --- Tests ---

describe('SessionScannerService', () => {
  let scanner: SessionScannerService;

  beforeEach(() => {
    vi.clearAllMocks();
    scanner = new SessionScannerService();
  });

  describe('scanClaude — workspace and display name (Bug 1: path decoding removal)', () => {
    it('should store raw directory name as workspace, not decoded path', async () => {
      const dirName = 'D--test-aionui-AionUi-main';
      const sessionJson = JSON.stringify({ sessionId: 'sess-1' }) + '\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent(dirName, true)])
        .mockResolvedValueOnce([makeDirent('session.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(sessionJson, 1000));

      const sessions = await scanner.scanClaude();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].workspace).toBe(dirName);
    });

    it('should use last segment after "-" as display name', async () => {
      const dirName = 'D--test-aionui-AionUi-main';
      const sessionJson = JSON.stringify({ sessionId: 'sess-1' }) + '\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent(dirName, true)])
        .mockResolvedValueOnce([makeDirent('session.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(sessionJson, 1000));

      const sessions = await scanner.scanClaude();

      expect(sessions[0].name).toBe('Claude Code - main');
    });

    it('should correctly handle URL-encoded project names containing dashes', async () => {
      const dirName = '-Users-test-my%2Dapp'; // Represents /Users/test/my-app
      const sessionJson = JSON.stringify({ sessionId: 'sess-url' }) + '\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent(dirName, true)])
        .mockResolvedValueOnce([makeDirent('session.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(sessionJson, 1000));

      const sessions = await scanner.scanClaude();

      // Should decode %2D to '-' and keep it as part of the basename
      expect(sessions[0].name).toBe('Claude Code - my-app');
    });

    it('should use raw directory name as display name when no "-" present', async () => {
      const dirName = 'myproject';
      const sessionJson = JSON.stringify({ sessionId: 'sess-2' }) + '\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent(dirName, true)])
        .mockResolvedValueOnce([makeDirent('session.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(sessionJson, 2000));

      const sessions = await scanner.scanClaude();

      expect(sessions[0].workspace).toBe('myproject');
      expect(sessions[0].name).toBe('Claude Code - myproject');
    });
  });

  describe('parseClaudeSessionFile — JSONL buffer reading (Bug 3)', () => {
    it('should parse session when first line fits within one 4096-byte chunk', async () => {
      const sessionJson = JSON.stringify({ sessionId: 'short-sess' }) + '\n{"other":"line"}\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent('proj', true)])
        .mockResolvedValueOnce([makeDirent('s.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(sessionJson, 3000));

      const sessions = await scanner.scanClaude();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('short-sess');
    });

    it('should parse session when first line exceeds 4096 bytes (multi-chunk read)', async () => {
      // Build a JSON first line longer than 4096 bytes
      const padding = 'x'.repeat(5000);
      const firstLine = JSON.stringify({ sessionId: 'long-sess', padding });
      const content = firstLine + '\n{"second":"line"}\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent('proj', true)])
        .mockResolvedValueOnce([makeDirent('s.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(content, 4000));

      const sessions = await scanner.scanClaude();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('long-sess');
    });

    it('should parse single-line file with no trailing newline', async () => {
      const content = JSON.stringify({ sessionId: 'no-newline-sess' });

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent('proj', true)])
        .mockResolvedValueOnce([makeDirent('s.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(content, 5000));

      const sessions = await scanner.scanClaude();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('no-newline-sess');
    });

    it('should return no sessions for an empty file', async () => {
      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent('proj', true)])
        .mockResolvedValueOnce([makeDirent('s.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle('', 6000));

      const sessions = await scanner.scanClaude();

      expect(sessions).toHaveLength(0);
    });

    it('should return no sessions when first line has no sessionId field', async () => {
      const content = JSON.stringify({ other: 'data' }) + '\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent('proj', true)])
        .mockResolvedValueOnce([makeDirent('s.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(content, 7000));

      const sessions = await scanner.scanClaude();

      expect(sessions).toHaveLength(0);
    });
  });

  describe('scanClaude — edge cases', () => {
    it('should return empty array when projects directory does not exist', async () => {
      fsMock.access.mockRejectedValue(new Error('ENOENT'));

      const sessions = await scanner.scanClaude();

      expect(sessions).toEqual([]);
    });

    it('should skip non-directory entries in projects dir', async () => {
      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir.mockResolvedValueOnce([makeDirent('file.txt', false)]);

      const sessions = await scanner.scanClaude();

      expect(sessions).toEqual([]);
    });

    it('should skip non-.jsonl files inside a project directory', async () => {
      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent('proj', true)])
        .mockResolvedValueOnce([makeDirent('readme.md', false)]);

      const sessions = await scanner.scanClaude();

      expect(sessions).toEqual([]);
    });
  });

  describe('scanAll', () => {
    it('should aggregate sessions from scanClaude', async () => {
      const sessionJson = JSON.stringify({ sessionId: 'agg-sess' }) + '\n';

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir
        .mockResolvedValueOnce([makeDirent('proj', true)])
        .mockResolvedValueOnce([makeDirent('s.jsonl', false)]);
      fsMock.open.mockResolvedValue(makeFileHandle(sessionJson, 8000));

      const result = await scanner.scanAll();

      expect(result.sessions).toHaveLength(1);
      expect(result.errors).toEqual([]);
    });

    it('should capture error when scanClaude throws', async () => {
      fsMock.access.mockResolvedValue(undefined);
      fsMock.readdir.mockRejectedValueOnce(new Error('permission denied'));

      const result = await scanner.scanAll();

      expect(result.sessions).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Claude Code scan failed');
    });
  });

  describe('scanCodex', () => {
    it('should return empty array when codex sessions directory does not exist', async () => {
      fsMock.access.mockRejectedValue(new Error('ENOENT'));

      const sessions = await scanner.scanCodex();

      expect(sessions).toEqual([]);
    });

    it('should scan rollout files and prefer session_index thread name', async () => {
      const codexRoot = '/home/testuser/.codex';
      const sessionsDir = `${codexRoot}/sessions`;
      const dayDir = `${sessionsDir}/2026/04/17`;
      const archivedDir = `${codexRoot}/archived_sessions`;

      const rolloutA = `${dayDir}/rollout-a.jsonl`;
      const rolloutB = `${archivedDir}/rollout-b.jsonl`;

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readFile.mockResolvedValue(
        `${JSON.stringify({ id: 'sess-a', thread_name: 'My Thread' })}\nnot-json-line\n`
      );

      fsMock.readdir.mockImplementation(async (dir: string) => {
        const normalized = normalizePath(dir);
        if (normalized === sessionsDir) return [makeDirent('2026', true)];
        if (normalized === `${sessionsDir}/2026`) return [makeDirent('04', true)];
        if (normalized === `${sessionsDir}/2026/04`) return [makeDirent('17', true)];
        if (normalized === dayDir) return [makeDirent('rollout-a.jsonl', false), makeDirent('ignore.txt', false)];
        if (normalized === archivedDir) return [makeDirent('rollout-b.jsonl', false)];
        return [];
      });

      fsMock.open.mockImplementation(async (filePath: string) => {
        const normalized = normalizePath(filePath);
        if (normalized === rolloutA) {
          return makeFileHandle(
            `${JSON.stringify({
              type: 'session_meta',
              payload: { id: 'sess-a', cwd: '/work/project-a', originator: 'cli' },
            })}\n`,
            9001
          );
        }
        return makeFileHandle(
          `${JSON.stringify({
            type: 'session_meta',
            payload: { id: 'sess-b', cwd: '/work/project-b', originator: 'desktop' },
          })}\n`,
          9002
        );
      });

      const sessions = await scanner.scanCodex();

      expect(sessions).toHaveLength(2);
      const byId = new Map(sessions.map((item) => [item.sessionId, item]));
      expect(byId.get('sess-a')?.name).toBe('My Thread');
      expect(byId.get('sess-a')?.originator).toBe('cli');
      expect(byId.get('sess-b')?.name).toBe('Codex - project-b');
      expect(byId.get('sess-b')?.originator).toBe('desktop');
    });

    it('should skip malformed rollout metadata files', async () => {
      const codexRoot = '/home/testuser/.codex';
      const sessionsDir = `${codexRoot}/sessions`;
      const dayDir = `${sessionsDir}/2026/04/17`;
      const rolloutA = `${dayDir}/rollout-a.jsonl`;

      fsMock.access.mockResolvedValue(undefined);
      fsMock.readFile.mockRejectedValue(new Error('missing index'));

      fsMock.readdir.mockImplementation(async (dir: string) => {
        const normalized = normalizePath(dir);
        if (normalized === sessionsDir) return [makeDirent('2026', true)];
        if (normalized === `${sessionsDir}/2026`) return [makeDirent('04', true)];
        if (normalized === `${sessionsDir}/2026/04`) return [makeDirent('17', true)];
        if (normalized === dayDir) return [makeDirent('rollout-a.jsonl', false)];
        if (normalized === `${codexRoot}/archived_sessions`) throw new Error('ENOENT');
        return [];
      });

      fsMock.open.mockResolvedValue(makeFileHandle('not-json\n', 9100));

      const sessions = await scanner.scanCodex();

      expect(sessions).toEqual([]);
      expect(normalizePath(fsMock.open.mock.calls[0][0])).toBe(rolloutA);
      expect(fsMock.open.mock.calls[0][1]).toBe('r');
    });
  });
});
