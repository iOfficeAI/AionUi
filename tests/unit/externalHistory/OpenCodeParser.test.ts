/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('os', () => ({
  default: { homedir: () => '/mock-home' },
  homedir: () => '/mock-home',
}));

/**
 * OpenCodeParser relies on better-sqlite3 which requires a native binary.
 * Mocking the constructor is fragile in vitest due to CJS/ESM interop.
 *
 * We test the exported functions' error-safe behavior:
 * - When the DB file doesn't exist, both functions return empty results.
 */

import {
  listOpenCodeSessions,
  parseOpenCodeSession,
} from '../../../src/process/services/externalHistory/OpenCodeParser';

describe('OpenCodeParser', () => {
  describe('listOpenCodeSessions', () => {
    it('returns empty array when database file does not exist', async () => {
      // The real DB at /mock-home/.local/share/opencode/opencode.db won't exist
      const result = await listOpenCodeSessions();
      expect(result).toEqual([]);
    });
  });

  describe('parseOpenCodeSession', () => {
    it('returns empty result when database file does not exist', async () => {
      const result = await parseOpenCodeSession('nonexistent-id');
      expect(result).toEqual({ messages: [], workspace: '', name: '' });
    });
  });
});
