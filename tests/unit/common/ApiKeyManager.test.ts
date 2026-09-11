/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ApiKeyManager } from '@/common/api/ApiKeyManager';
import { AuthType } from '@/common/types/provider/authType';

describe('ApiKeyManager.getStatus', () => {
  it('returns maskedKeys instead of plaintext keys', () => {
    const manager = new ApiKeyManager('sk-test-key-1234567890abcdef', AuthType.USE_OPENAI);
    const status = manager.getStatus();

    // new field exists, old field does not
    expect(status).toHaveProperty('maskedKeys');
    expect(status).not.toHaveProperty('keys');
    expect(status.maskedKeys).toHaveLength(1);
    // masked value must not equal plaintext
    expect(status.maskedKeys[0]).not.toBe('sk-test-key-1234567890abcdef');
    expect(status.maskedKeys[0]).toContain('...');
  });

  it('masks each key when multiple keys are configured', () => {
    const manager = new ApiKeyManager(
      'sk-key-one-1234567890, sk-key-two-0987654321, sk-key-three-abcdefghij',
      AuthType.USE_ANTHROPIC
    );
    const status = manager.getStatus();

    expect(status.total).toBe(3);
    expect(status.maskedKeys).toHaveLength(3);
    for (const mk of status.maskedKeys) {
      expect(mk).toContain('...');
    }
    // ensure no plaintext leaked
    expect(JSON.stringify(status)).not.toContain('sk-key-one');
    expect(JSON.stringify(status)).not.toContain('sk-key-two');
  });

  it('masks short keys as ***', () => {
    const manager = new ApiKeyManager('short, tiny', AuthType.USE_GEMINI);
    const status = manager.getStatus();

    expect(status.maskedKeys).toEqual(['***', '***']);
  });

  it('reports empty maskedKeys for empty input', () => {
    const manager = new ApiKeyManager('', AuthType.USE_OPENAI);
    const status = manager.getStatus();

    expect(status.total).toBe(0);
    expect(status.maskedKeys).toHaveLength(0);
    expect(status.current).toBe(1); // 0 + 1, no keys
  });

  it('reports current/total/blacklisted correctly', () => {
    const manager = new ApiKeyManager('k1-1234567890abcd, k2-1234567890efgh', AuthType.USE_OPENAI);
    const before = manager.getStatus();
    expect(before.current).toBeGreaterThanOrEqual(1);
    expect(before.current).toBeLessThanOrEqual(2);
    expect(before.total).toBe(2);
    expect(before.blacklisted).toEqual([]);

    // rotate blacklists current key
    manager.rotateKey();
    const after = manager.getStatus();
    expect(after.blacklisted).toHaveLength(1);
    expect(after.maskedKeys).toHaveLength(2);
  });

  it('never exposes plaintext via JSON serialization', () => {
    const secret = 'sk-super-secret-key-9999';
    const manager = new ApiKeyManager(secret, AuthType.USE_OPENAI);
    const status = manager.getStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('super-secret');
  });
});
