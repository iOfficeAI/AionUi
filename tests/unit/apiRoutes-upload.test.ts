/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';

/**
 * Pure function tests for apiRoutes upload logic
 * Tests the saveToWorkspace preference logic without module mocking
 */
describe('apiRoutes upload saveToWorkspace logic', () => {
  // Simulate the upload logic from apiRoutes.ts
  function resolveUploadPath(
    conversationId: string | undefined,
    requestedWorkspace: string | undefined,
    saveToWorkspace: boolean | undefined
  ): { useWorkspace: boolean; path: string } {
    // Default to cache directory (false) to avoid cluttering workspace
    const shouldSaveToWorkspace = saveToWorkspace ?? false;

    if (conversationId && shouldSaveToWorkspace) {
      return {
        useWorkspace: true,
        path: requestedWorkspace || `/workspace/${conversationId}`,
      };
    }

    return { useWorkspace: false, path: '/tmp/cache' };
  }

  describe('upload path resolution', () => {
    it('uses cache directory when saveToWorkspace is false', () => {
      const result = resolveUploadPath('conv-123', '/my/workspace', false);
      expect(result.useWorkspace).toBe(false);
      expect(result.path).toBe('/tmp/cache');
    });

    it('uses cache directory when saveToWorkspace is undefined (default)', () => {
      const result = resolveUploadPath('conv-123', '/my/workspace', undefined);
      expect(result.useWorkspace).toBe(false);
      expect(result.path).toBe('/tmp/cache');
    });

    it('uses workspace when saveToWorkspace is true and conversationId exists', () => {
      const result = resolveUploadPath('conv-123', '/my/workspace', true);
      expect(result.useWorkspace).toBe(true);
      expect(result.path).toBe('/my/workspace');
    });

    it('uses conversation-specific workspace when no workspace specified', () => {
      const result = resolveUploadPath('conv-456', undefined, true);
      expect(result.useWorkspace).toBe(true);
      expect(result.path).toBe('/workspace/conv-456');
    });

    it('falls back to cache when conversationId is missing even if saveToWorkspace is true', () => {
      const result = resolveUploadPath(undefined, '/my/workspace', true);
      expect(result.useWorkspace).toBe(false);
      expect(result.path).toBe('/tmp/cache');
    });

    it('uses cache directory for empty conversationId', () => {
      const result = resolveUploadPath('', '/my/workspace', true);
      expect(result.useWorkspace).toBe(false);
      expect(result.path).toBe('/tmp/cache');
    });
  });

  describe('saveToWorkspace preference handling', () => {
    it('defaults to false when preference is undefined', () => {
      const preference: boolean | undefined = undefined;
      const effectiveValue = preference ?? false;
      expect(effectiveValue).toBe(false);
    });

    it('uses true when preference is explicitly true', () => {
      const preference = true;
      const effectiveValue = preference ?? false;
      expect(effectiveValue).toBe(true);
    });

    it('uses false when preference is explicitly false', () => {
      const preference = false;
      const effectiveValue = preference ?? false;
      expect(effectiveValue).toBe(false);
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
