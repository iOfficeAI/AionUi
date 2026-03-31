/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

/**
 * Tests for externalHistoryBridge validation logic.
 *
 * The bridge validates backend names and session ID formats.
 * These tests verify the validation patterns independently.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_BACKENDS = new Set(['claude', 'codex', 'gemini-cli', 'opencode']);

describe('ExternalHistoryBridge validation', () => {
  describe('UUID pattern validation', () => {
    it('accepts valid UUIDs', () => {
      expect(UUID_PATTERN.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(UUID_PATTERN.test('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('accepts uppercase UUIDs', () => {
      expect(UUID_PATTERN.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('rejects invalid UUIDs', () => {
      expect(UUID_PATTERN.test('')).toBe(false);
      expect(UUID_PATTERN.test('not-a-uuid')).toBe(false);
      expect(UUID_PATTERN.test('550e8400-e29b-41d4-a716')).toBe(false);
      expect(UUID_PATTERN.test('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    it('rejects path traversal attempts', () => {
      expect(UUID_PATTERN.test('../../../etc/passwd')).toBe(false);
      expect(UUID_PATTERN.test('550e8400-e29b-41d4-a716-446655440000/../../hack')).toBe(false);
    });
  });

  describe('Backend validation', () => {
    it('accepts valid backends', () => {
      expect(VALID_BACKENDS.has('claude')).toBe(true);
      expect(VALID_BACKENDS.has('codex')).toBe(true);
      expect(VALID_BACKENDS.has('gemini-cli')).toBe(true);
      expect(VALID_BACKENDS.has('opencode')).toBe(true);
    });

    it('rejects invalid backends', () => {
      expect(VALID_BACKENDS.has('unknown')).toBe(false);
      expect(VALID_BACKENDS.has('')).toBe(false);
      expect(VALID_BACKENDS.has('Claude')).toBe(false);
    });
  });
});
