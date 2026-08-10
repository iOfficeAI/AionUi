/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type OpenAI from 'openai';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';
import { ClientFactory } from '@/common/api/ClientFactory';
import { OpenAiImagesAdapter } from '@/common/media/adapters/openaiImagesAdapter';
import { resolveMediaModelSpec } from '@/common/media/catalog';
import type { TProviderWithModel } from '@/common/config/storage';

// 1x1 transparent PNG
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const provider: TProviderWithModel = {
  id: 'test-provider',
  platform: 'openai',
  name: 'OpenAI',
  base_url: 'https://api.openai.com/v1',
  api_key: 'sk-test',
  use_model: 'dall-e-3',
};

/** Build an object that passes `instanceof OpenAIRotatingClient` without running the constructor. */
function fakeClient(response: unknown): OpenAIRotatingClient {
  const client = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient;
  (client as unknown as { createImage: () => Promise<unknown> }).createImage = vi.fn().mockResolvedValue(response);
  (client as unknown as { createImageEdit: () => Promise<unknown> }).createImageEdit = vi
    .fn()
    .mockResolvedValue(response);
  return client;
}

describe('OpenAiImagesAdapter', () => {
  let workspaceDir: string;
  const adapter = new OpenAiImagesAdapter();

  beforeEach(async () => {
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'media-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
  });

  const runGenerate = (n?: number) =>
    adapter.generate({
      kind: 'image',
      prompt: 'a red square',
      params: { size: '1024x1024', n },
      inputUris: [],
      provider,
      spec: resolveMediaModelSpec('image', provider, 'dall-e-3'),
      workspaceDir,
    });

  it('saves every b64_json item to disk', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({ created: 0, data: [{ b64_json: TINY_PNG_B64 }, { b64_json: TINY_PNG_B64 }] })
    );

    const outcome = await runGenerate(2);
    expect(outcome.success).toBe(true);
    expect(outcome.assets).toHaveLength(2);
    for (const asset of outcome.assets) {
      expect(asset.kind).toBe('image');
      await expect(fs.promises.access(asset.filePath)).resolves.toBeUndefined();
      expect(path.isAbsolute(asset.filePath)).toBe(true);
    }
    // Distinct filenames despite same timestamp base
    expect(new Set(outcome.assets.map((a) => a.filePath)).size).toBe(2);
  });

  it('downloads url items to disk', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({ created: 0, data: [{ url: 'https://cdn.example.com/img.png' }] })
    );
    const pngBytes = Buffer.from(TINY_PNG_B64, 'base64');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } }))
    );

    const outcome = await runGenerate();
    expect(outcome.success).toBe(true);
    expect(outcome.assets).toHaveLength(1);
    const saved = await fs.promises.readFile(outcome.assets[0].filePath);
    expect(saved.equals(pngBytes)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('handles the gateway `images: [{url}]` response variant', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({ images: [{ url: 'https://cdn.example.com/img.png' }] } as unknown as OpenAI.Images.ImagesResponse)
    );
    const pngBytes = Buffer.from(TINY_PNG_B64, 'base64');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } }))
    );

    const outcome = await runGenerate();
    expect(outcome.success).toBe(true);
    expect(outcome.assets).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('reports failure when the response has no images', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(fakeClient({ created: 0, data: [] }));
    const outcome = await runGenerate();
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('empty-response');
  });
});
