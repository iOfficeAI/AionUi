/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for Chisl indexer content hashing helpers.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeFileContentHash,
  CONTENT_HASH_ALGORITHM,
  hashFileContent,
} from '@/process/services/indexer/contentHash';

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'chisl-hash-'));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('hashFileContent', () => {
  it('produces a stable hex digest of the expected length for the algorithm', () => {
    const buffer = Buffer.from('hello world');
    const hash = hashFileContent(buffer);
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(hash).toHaveLength(64); // sha256 hex length
  });

  it('returns the same hash for identical content', () => {
    expect(hashFileContent(Buffer.from('abc'))).toBe(hashFileContent(Buffer.from('abc')));
  });

  it('returns a different hash when content changes', () => {
    expect(hashFileContent(Buffer.from('a'))).not.toBe(hashFileContent(Buffer.from('b')));
  });

  it('uses the declared algorithm', () => {
    expect(CONTENT_HASH_ALGORITHM).toBe('sha256');
  });
});

describe('computeFileContentHash', () => {
  it('reads a real file from disk and returns its hash', async () => {
    const file = path.join(tempDir, 'a.txt');
    writeFileSync(file, 'round-trip');
    const expected = hashFileContent(Buffer.from('round-trip'));
    await expect(computeFileContentHash(file)).resolves.toBe(expected);
  });

  it('returns null for missing files', async () => {
    await expect(computeFileContentHash(path.join(tempDir, 'does-not-exist.txt'))).resolves.toBeNull();
  });
});
