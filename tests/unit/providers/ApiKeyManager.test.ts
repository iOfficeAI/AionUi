/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiKeyManager } from '@/common/api/ApiKeyManager';
import { AuthType } from '@office-ai/aioncli-core';

describe('ApiKeyManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('parseKeys', () => {
    it('handles empty string', () => {
      const manager = new ApiKeyManager('', AuthType.USE_OPENAI);
      expect(manager.getCurrentKey()).toBe('');
    });

    it('handles single key', () => {
      const manager = new ApiKeyManager('sk-abc123', AuthType.USE_OPENAI);
      expect(manager.getCurrentKey()).toBe('sk-abc123');
      expect(manager.hasMultipleKeys()).toBe(false);
    });

    it('parses comma-separated keys', () => {
      const manager = new ApiKeyManager('key1,key2,key3', AuthType.USE_OPENAI);
      expect(manager.hasMultipleKeys()).toBe(true);
      const status = manager.getStatus();
      expect(status.keys).toEqual(['key1', 'key2', 'key3']);
      expect(status.total).toBe(3);
    });

    it('parses newline-separated keys', () => {
      const manager = new ApiKeyManager('key1\nkey2\nkey3', AuthType.USE_ANTHROPIC);
      expect(manager.hasMultipleKeys()).toBe(true);
      const status = manager.getStatus();
      expect(status.keys).toEqual(['key1', 'key2', 'key3']);
      expect(status.envKey).toBe('ANTHROPIC_API_KEY');
    });

    it('trims whitespace and filters empty lines', () => {
      const manager = new ApiKeyManager(' key1 , key2 ,  ,key3  ', AuthType.USE_OPENAI);
      const status = manager.getStatus();
      expect(status.keys).toEqual(['key1', 'key2', 'key3']);
    });
  });

  describe('environment key setting', () => {
    it('sets OPENAI_API_KEY for multiple keys', () => {
      const manager = new ApiKeyManager('key1,key2', AuthType.USE_OPENAI);
      // With multiple keys, one of them is set to environment
      expect(process.env.OPENAI_API_KEY).toBeTruthy();
      expect(['key1', 'key2']).toContain(process.env.OPENAI_API_KEY);
    });

    it('sets ANTHROPIC_API_KEY for multiple keys', () => {
      const manager = new ApiKeyManager('key1,key2', AuthType.USE_ANTHROPIC);
      expect(process.env.ANTHROPIC_API_KEY).toBeTruthy();
      expect(['key1', 'key2']).toContain(process.env.ANTHROPIC_API_KEY);
    });

    it('does not set environment for single key (documented behavior)', () => {
      // Single key case: initializeWithRandomKey only runs for hasMultipleKeys()
      const manager = new ApiKeyManager('sk-single', AuthType.USE_OPENAI);
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
    });

    it('throws for unsupported auth type', () => {
      expect(() => {
        new ApiKeyManager('key', 'UNSUPPORTED_TYPE' as AuthType);
      }).toThrow(/Multi-key not supported for auth type/);
    });
  });

  describe('key rotation', () => {
    it('returns false when single key', () => {
      const manager = new ApiKeyManager('key1', AuthType.USE_OPENAI);
      const rotated = manager.rotateKey();
      expect(rotated).toBe(false);
      expect(manager.getCurrentKey()).toBe('key1');
    });

    it('rotates to next key and blacklists current', () => {
      const manager = new ApiKeyManager('key1,key2,key3', AuthType.USE_OPENAI);
      const initialKey = manager.getCurrentKey();
      const initialIndex = manager.getStatus().current;

      const rotated = manager.rotateKey();
      expect(rotated).toBe(true);

      const status = manager.getStatus();
      expect(status.current).not.toBe(initialIndex);
      expect(status.blacklisted).toContain(initialIndex);
      expect(manager.getCurrentKey()).not.toBe(initialKey);
    });

    it('skips blacklisted keys during rotation', () => {
      const manager = new ApiKeyManager('key1,key2,key3', AuthType.USE_OPENAI);

      // Blacklist first key
      manager.rotateKey();
      const blacklistedIndex = manager.getStatus().blacklisted[0];

      // Rotate again
      manager.rotateKey();

      // Current key should not be the blacklisted one
      const status = manager.getStatus();
      expect(status.current).not.toBe(blacklistedIndex);
    });

    it('returns false when all keys blacklisted', () => {
      const manager = new ApiKeyManager('key1,key2', AuthType.USE_OPENAI);

      // Blacklist both keys
      manager.rotateKey();
      const secondRotate = manager.rotateKey();

      expect(secondRotate).toBe(false);
      const status = manager.getStatus();
      expect(status.blacklisted.length).toBe(2);
    });
  });

  describe('blacklist expiration', () => {
    it('removes key from blacklist after 90 seconds', async () => {
      const manager = new ApiKeyManager('key1,key2', AuthType.USE_OPENAI);
      const initialIndex = manager.getStatus().current;

      // Blacklist first key
      manager.rotateKey();
      let status = manager.getStatus();
      expect(status.blacklisted).toContain(initialIndex);

      // Advance time by 90 seconds + 1ms
      await vi.advanceTimersByTimeAsync(90_001);

      // Rotate again - should be able to use the previously blacklisted key
      const rotated = manager.rotateKey();
      expect(rotated).toBe(true);

      status = manager.getStatus();
      // After expiration, the key should be available again
      const currentBlacklist = status.blacklisted;
      // The previously blacklisted key might be current now, or another one is blacklisted
      expect(currentBlacklist.length).toBeLessThan(2);
    });

    it('keeps key blacklisted before expiration', async () => {
      const manager = new ApiKeyManager('key1,key2', AuthType.USE_OPENAI);
      const initialIndex = manager.getStatus().current;

      manager.rotateKey();
      let status = manager.getStatus();
      expect(status.blacklisted).toContain(initialIndex);

      // Advance time by 89 seconds (less than 90)
      await vi.advanceTimersByTimeAsync(89_000);

      status = manager.getStatus();
      expect(status.blacklisted).toContain(initialIndex);
    });
  });

  describe('getStatus', () => {
    it('returns correct status structure', () => {
      const manager = new ApiKeyManager('key1,key2,key3', AuthType.USE_ANTHROPIC);
      const status = manager.getStatus();

      expect(status).toHaveProperty('authType', AuthType.USE_ANTHROPIC);
      expect(status).toHaveProperty('envKey', 'ANTHROPIC_API_KEY');
      expect(status).toHaveProperty('current');
      expect(status).toHaveProperty('total', 3);
      expect(status).toHaveProperty('keys');
      expect(status).toHaveProperty('blacklisted');
      expect(Array.isArray(status.blacklisted)).toBe(true);
    });

    it('uses 1-based indexing for display', () => {
      const manager = new ApiKeyManager('key1,key2', AuthType.USE_OPENAI);
      const status = manager.getStatus();

      // current should be 1 or 2 (1-based)
      expect(status.current).toBeGreaterThanOrEqual(1);
      expect(status.current).toBeLessThanOrEqual(2);
    });
  });

  describe('getCurrentKey edge cases', () => {
    it('returns empty string for empty keys array', () => {
      const manager = new ApiKeyManager('', AuthType.USE_OPENAI);
      expect(manager.getCurrentKey()).toBe('');
    });

    it('initializes with random key for multiple keys', () => {
      const manager = new ApiKeyManager('key1,key2,key3,key4,key5', AuthType.USE_OPENAI);
      const key = manager.getCurrentKey();
      expect(['key1', 'key2', 'key3', 'key4', 'key5']).toContain(key);
    });
  });
});
