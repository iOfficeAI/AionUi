/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeMediaGeneration } from '@/common/media';
import type { TProviderWithModel } from '@/common/config/storage';

let cleanupDirs: string[] = [];

function createWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aionui-media-exec-test-'));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of cleanupDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  cleanupDirs = [];
});

const provider: TProviderWithModel = {
  id: 'test',
  name: 'test',
  platform: 'openai',
  base_url: '',
  api_key: 'sk-test',
  use_model: 'dall-e-3',
};

describe('executeMediaGeneration workspace validation', () => {
  it('should return an error for a non-existent workspace directory', async () => {
    const result = await executeMediaGeneration({
      kind: 'image',
      prompt: 'a cat',
      provider,
      workspaceDir: '/nonexistent/workspace',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('not found');
  });

  it('should return an error when the workspace path is a file, not a directory', async () => {
    const ws = createWorkspace();
    const filePath = join(ws, 'not-a-dir.png');
    writeFileSync(filePath, 'not really a directory');

    const result = await executeMediaGeneration({
      kind: 'image',
      prompt: 'a cat',
      provider,
      workspaceDir: filePath,
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('not a directory');
  });
});
