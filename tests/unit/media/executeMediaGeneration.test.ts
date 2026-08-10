/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeMediaGeneration } from '@/common/media';
import { ClientFactory } from '@/common/api/ClientFactory';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';
import type { TProviderWithModel } from '@/common/config/storage';

const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function fakeOpenAiClient(response: unknown): OpenAIRotatingClient {
  const client = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient;
  (client as unknown as { createImage: () => Promise<unknown> }).createImage = vi.fn().mockResolvedValue(response);
  return client;
}

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

describe('executeMediaGeneration dispatch decisions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports unsupported-model for a video request with no catalog match (no Form B fallback for video)', async () => {
    const ws = createWorkspace();

    const result = await executeMediaGeneration({
      kind: 'video',
      prompt: 'a flying cat',
      provider: { ...provider, use_model: 'totally-unknown-model' },
      workspaceDir: ws,
    });

    expect(result).toMatchObject({ success: false, error: 'unsupported-model' });
    expect(result.text).toContain('not recognized as a video generation model');
  });

  it('reports form-not-executable for a catalog-matched Form C model (job engine not built yet)', async () => {
    const ws = createWorkspace();

    const result = await executeMediaGeneration({
      kind: 'image',
      prompt: 'a mountain',
      provider: { ...provider, platform: 'dashscope', use_model: 'wanx2.1-t2i-turbo' },
      workspaceDir: ws,
    });

    expect(result).toMatchObject({ success: false, error: 'form-not-executable' });
    expect(result.text).toContain('async task API');
  });

  it('falls back through Form B for an unrecognized image model, preserving pre-catalog behavior', async () => {
    const ws = createWorkspace();
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      (() => {
        const client = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient;
        (client as unknown as { createChatCompletion: () => Promise<unknown> }).createChatCompletion = vi
          .fn()
          .mockResolvedValue({ choices: [{ message: { content: 'no image support here' } }] });
        return client;
      })()
    );

    const result = await executeMediaGeneration({
      kind: 'image',
      prompt: 'a mountain',
      provider: { ...provider, platform: 'some-custom-gateway', use_model: 'a-model-nobody-declared' },
      workspaceDir: ws,
    });

    // No catalog entry, no allowlist rule — still dispatches to Form B rather
    // than being rejected outright, exactly like the pre-catalog behavior.
    expect(result.success).toBe(true);
    expect(result.text).toContain('did not produce any images');
  });

  it('reports clipped parameters without treating a fulfilled fan-out count as dropped', async () => {
    const ws = createWorkspace();
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeOpenAiClient({ created: 0, data: [{ b64_json: TINY_PNG_B64 }] })
    );

    const result = await executeMediaGeneration({
      kind: 'image',
      prompt: 'a mountain',
      // dall-e-3 declares no `seed`/`negativePrompt` support — both must be clipped.
      params: { seed: 42, negativePrompt: 'blurry' },
      provider: { ...provider, use_model: 'dall-e-3' },
      workspaceDir: ws,
    });

    expect(result.success).toBe(true);
    expect(result.assets).toHaveLength(1);
    expect(result.droppedParams).toEqual(expect.arrayContaining(['seed', 'negativePrompt']));
    expect(result.text).toContain('are not supported by model "dall-e-3" and were ignored');
    expect(result.text).toContain('Generated image saved to:');
  });
});
