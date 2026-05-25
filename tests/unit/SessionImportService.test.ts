/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { AionUIDatabase } from '../../src/process/services/database';
import type { DiscoveredSession } from '../../src/process/services/sessionSync/types';

vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid-1234') }));

import { SessionImportService } from '../../src/process/services/sessionSync/SessionImportService';

// --- Helpers ---

function makeSession(overrides?: Partial<DiscoveredSession>): DiscoveredSession {
  return {
    agentType: 'claude',
    sessionId: 'sess-1',
    workspace: 'D--test-project',
    name: 'Claude Code - project',
    lastModified: 1000,
    sourcePath: '/home/user/.claude/projects/D--test-project/session.jsonl',
    ...overrides,
  };
}

function makeMockDb(sqlRows: Array<{ sourcePath: string }> = [], sqlShouldThrow = false) {
  const stmtMock = {
    all: sqlShouldThrow
      ? vi.fn(() => {
          throw new Error('SQL error');
        })
      : vi.fn(() => sqlRows),
  };

  const driverMock = {
    prepare: sqlShouldThrow
      ? vi.fn(() => {
          throw new Error('SQL error');
        })
      : vi.fn(() => stmtMock),
    transaction: vi.fn((fn: () => void) => fn),
  };

  return {
    getDriver: vi.fn(() => driverMock),
    createConversation: vi.fn(),
    _driver: driverMock,
    _stmt: stmtMock,
  };
}

function asDatabase(db: ReturnType<typeof makeMockDb>): AionUIDatabase {
  return db as unknown as AionUIDatabase;
}

describe('SessionImportService', () => {
  describe('importSessions — SQL dedup (Bug 2: json_extract)', () => {
    it('should import session when no existing sourcePaths in database', async () => {
      const db = makeMockDb([]);
      const service = new SessionImportService(asDatabase(db));
      const session = makeSession();

      const imported = await service.importSessions([session]);

      expect(imported).toBe(1);
      expect(db.createConversation).toHaveBeenCalledOnce();
    });

    it('should skip session whose sourcePath already exists in database', async () => {
      const existingPath = '/home/user/.claude/projects/D--test-project/session.jsonl';
      const db = makeMockDb([{ sourcePath: existingPath }]);
      const service = new SessionImportService(asDatabase(db));
      const session = makeSession({ sourcePath: existingPath });

      const imported = await service.importSessions([session]);

      expect(imported).toBe(0);
      expect(db.createConversation).not.toHaveBeenCalled();
    });

    it('should use json_extract SQL to query existing source paths', async () => {
      const db = makeMockDb([]);
      const service = new SessionImportService(asDatabase(db));

      await service.importSessions([makeSession()]);

      expect(db._driver.prepare).toHaveBeenCalledWith(expect.stringContaining('json_extract'));
    });

    it('should import new sessions while skipping duplicates in a batch', async () => {
      const existingPath = '/existing/path.jsonl';
      const db = makeMockDb([{ sourcePath: existingPath }]);
      const service = new SessionImportService(asDatabase(db));

      const sessions = [
        makeSession({ sourcePath: existingPath, sessionId: 'existing' }),
        makeSession({ sourcePath: '/new/path.jsonl', sessionId: 'new-sess' }),
      ];

      const imported = await service.importSessions(sessions);

      expect(imported).toBe(1);
      expect(db.createConversation).toHaveBeenCalledOnce();
    });
  });

  describe('getExistingSourcePaths — prepared statement caching', () => {
    it('should cache the prepared statement across multiple importSessions calls', async () => {
      const db = makeMockDb([]);
      const service = new SessionImportService(asDatabase(db));

      await service.importSessions([makeSession({ sourcePath: '/p1.jsonl' })]);
      await service.importSessions([makeSession({ sourcePath: '/p2.jsonl' })]);

      // prepare should only be called once due to caching
      expect(db._driver.prepare).toHaveBeenCalledTimes(1);
    });

    it('should throw when SQL query fails (no fallback)', async () => {
      const db = makeMockDb([], true);
      const service = new SessionImportService(asDatabase(db));

      await expect(service.importSessions([makeSession()])).rejects.toThrow('SQL error');
    });
  });

  describe('importSessions — transaction wrapping', () => {
    it('should wrap inserts in a transaction', async () => {
      const db = makeMockDb([]);
      const service = new SessionImportService(asDatabase(db));

      await service.importSessions([makeSession()]);

      expect(db._driver.transaction).toHaveBeenCalledOnce();
    });
  });

  describe('buildConversation — field mapping', () => {
    it('should create conversation with correct fields from session', async () => {
      const db = makeMockDb([]);
      const service = new SessionImportService(asDatabase(db));
      const session = makeSession({
        sessionId: 'build-sess',
        workspace: 'D--my-workspace',
        name: 'Claude Code - workspace',
        lastModified: 42000,
        sourcePath: '/source/path.jsonl',
      });

      await service.importSessions([session]);

      const conv = db.createConversation.mock.calls[0][0];
      expect(conv.id).toBe('mock-uuid-1234');
      expect(conv.name).toBe('Claude Code - workspace');
      expect(conv.type).toBe('acp');
      expect(conv.createTime).toBe(42000);
      expect(conv.modifyTime).toBe(42000);
      expect(conv.source).toBe('desktop-sync');
      expect(conv.extra).toEqual({
        workspace: 'D--my-workspace',
        backend: 'claude',
        customWorkspace: true,
        acpSessionId: 'build-sess',
        desktopSessionSourcePath: '/source/path.jsonl',
      });
    });
  });

  describe('importSessions — empty input', () => {
    it('should return 0 when given an empty sessions array', async () => {
      const db = makeMockDb([]);
      const service = new SessionImportService(asDatabase(db));

      const imported = await service.importSessions([]);

      expect(imported).toBe(0);
      expect(db.createConversation).not.toHaveBeenCalled();
    });
  });
});
