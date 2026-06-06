/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the safeStorage encryptor and volatile memory fallback
 * (t2-registry-03).
 */

import { describe, expect, it } from 'vitest';
import { createVolatileMemoryEncryptor } from '@/process/services/registry/safeStorageEncryptor';

describe('createVolatileMemoryEncryptor', () => {
  it('encrypts and decrypts a plaintext string', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const blob = encryptor.encrypt('my-secret-password');
    expect(blob.encoding).toBe('base64');
    expect(blob.ciphertext).toBeTruthy();
    expect(encryptor.decrypt(blob)).toBe('my-secret-password');
  });

  it('returns distinct ciphertext blobs for each encrypt call', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const a = encryptor.encrypt('alpha');
    const b = encryptor.encrypt('beta');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(encryptor.decrypt(a)).toBe('alpha');
    expect(encryptor.decrypt(b)).toBe('beta');
  });

  it('returns undefined when decrypting a blob that was never stored', () => {
    const encryptor = createVolatileMemoryEncryptor();
    expect(encryptor.decrypt({ ciphertext: 'nonexistent', encoding: 'base64' })).toBeUndefined();
  });

  it('handles empty string encryption', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const blob = encryptor.encrypt('');
    expect(encryptor.decrypt(blob)).toBe('');
  });

  it('handles unicode and special characters', () => {
    const encryptor = createVolatileMemoryEncryptor();
    const secret = 'p@$$w0rd!#%^&*()_+日本語🔐';
    const blob = encryptor.encrypt(secret);
    expect(encryptor.decrypt(blob)).toBe(secret);
  });
});

describe('createSafeStorageEncryptor', () => {
  it('returns a working encryptor (falls back to volatile in test env)', async () => {
    const { createSafeStorageEncryptor } = await import('@/process/services/registry/safeStorageEncryptor');
    const encryptor = createSafeStorageEncryptor();
    const blob = encryptor.encrypt('test-secret');
    expect(blob.encoding).toBe('base64');
    expect(encryptor.decrypt(blob)).toBe('test-secret');
  });
});
