/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';

function resolveUploadPath(
  conversationId: string | undefined,
  requestedWorkspace: string | undefined
): {
  useWorkspace: boolean;
  path: string;
} {
  if (conversationId) {
    return {
      useWorkspace: true,
      path: requestedWorkspace || `/workspace/${conversationId}`,
    };
  }

  return { useWorkspace: false, path: '/tmp/cache' };
}

/**
 * Pure function tests for apiRoutes upload logic
 * Tests the legacy workspace-first behavior without module mocking
 */
describe('apiRoutes upload workspace routing', () => {
  describe('upload path resolution', () => {
    it('uses workspace whenever conversationId exists', () => {
      const result = resolveUploadPath('conv-123', '/my/workspace');
      expect(result.useWorkspace).toBe(true);
      expect(result.path).toBe('/my/workspace');
    });

    it('uses conversation-specific workspace when no workspace specified', () => {
      const result = resolveUploadPath('conv-456', undefined);
      expect(result.useWorkspace).toBe(true);
      expect(result.path).toBe('/workspace/conv-456');
    });

    it('falls back to cache when conversationId is missing', () => {
      const result = resolveUploadPath(undefined, '/my/workspace');
      expect(result.useWorkspace).toBe(false);
      expect(result.path).toBe('/tmp/cache');
    });

    it('uses cache directory for empty conversationId', () => {
      const result = resolveUploadPath('', '/my/workspace');
      expect(result.useWorkspace).toBe(false);
      expect(result.path).toBe('/tmp/cache');
    });
  });
});

describe('apiRoutes disk upload — safeTempPath construction', () => {
  const MULTER_TEMP_DIR = os.tmpdir();

  // Mirrors the safeTempPath logic in apiRoutes.ts
  function buildSafeTempPath(filePath: string): string {
    return path.join(path.resolve(MULTER_TEMP_DIR), path.basename(filePath));
  }

  it('produces a path inside the temp directory', () => {
    const result = buildSafeTempPath('/tmp/multer-abc123');
    expect(result.startsWith(path.resolve(MULTER_TEMP_DIR))).toBe(true);
  });

  it('strips directory traversal sequences from file.path', () => {
    const result = buildSafeTempPath('/tmp/../../etc/passwd');
    expect(result).toBe(path.join(path.resolve(MULTER_TEMP_DIR), 'passwd'));
    expect(result).not.toContain('..');
  });

  it('preserves the filename portion', () => {
    const result = buildSafeTempPath('/some/random/dir/upload-xyz.bin');
    expect(result).toBe(path.join(path.resolve(MULTER_TEMP_DIR), 'upload-xyz.bin'));
  });

  it('handles filename-only input (no directory)', () => {
    const result = buildSafeTempPath('upload-only.tmp');
    expect(result).toBe(path.join(path.resolve(MULTER_TEMP_DIR), 'upload-only.tmp'));
  });
});
