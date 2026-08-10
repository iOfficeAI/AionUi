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

  it('returns a cancelled result without calling the client when the signal is already aborted', async () => {
    const spy = vi.spyOn(ClientFactory, 'createRotatingClient');

    const outcome = await adapter.generate({
      kind: 'image',
      prompt: 'a red square',
      params: {},
      inputUris: [],
      provider,
      spec: resolveMediaModelSpec('image', provider, 'dall-e-3'),
      workspaceDir,
      signal: AbortSignal.abort(),
    });

    expect(outcome).toMatchObject({ success: false, error: 'cancelled' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a provider whose resolved client does not speak the OpenAI protocol', async () => {
    // Any object that is not `instanceof OpenAIRotatingClient` — e.g. a
    // Gemini/Anthropic rotating client — must be rejected explicitly rather
    // than crash on a missing `.images` method.
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue({} as never);

    const outcome = await runGenerate();

    expect(outcome).toMatchObject({ success: false, error: 'incompatible-provider' });
    expect(outcome.text).toContain('does not speak the OpenAI protocol');
  });

  it('forwards seed and negative_prompt as gateway extension fields', async () => {
    const client = fakeClient({ created: 0, data: [{ b64_json: TINY_PNG_B64 }] });
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(client);

    await adapter.generate({
      kind: 'image',
      prompt: 'a red square',
      params: { seed: 7, negativePrompt: 'blurry' },
      inputUris: [],
      provider,
      spec: resolveMediaModelSpec('image', provider, 'dall-e-3'),
      workspaceDir,
    });

    expect(client.createImage).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 7, negative_prompt: 'blurry' }),
      expect.anything()
    );
  });

  it('routes to createImageEdit with local reference files when the spec declares imageInput', async () => {
    const refPath = path.join(workspaceDir, 'ref.png');
    await fs.promises.writeFile(refPath, Buffer.from(TINY_PNG_B64, 'base64'));
    const client = fakeClient({ created: 0, data: [{ b64_json: TINY_PNG_B64 }] });
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(client);
    const editProvider: TProviderWithModel = { ...provider, use_model: 'dall-e-2' };

    const outcome = await adapter.generate({
      kind: 'image',
      prompt: 'add a hat',
      params: {},
      inputUris: ['ref.png'],
      provider: editProvider,
      spec: resolveMediaModelSpec('image', editProvider, 'dall-e-2'),
      workspaceDir,
    });

    expect(outcome.success).toBe(true);
    expect(client.createImageEdit).toHaveBeenCalledOnce();
    expect(client.createImage).not.toHaveBeenCalled();
  });

  it('reports no-local-input when every edit reference is an HTTP URL', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(fakeClient({}));
    const editProvider: TProviderWithModel = { ...provider, use_model: 'dall-e-2' };

    const outcome = await adapter.generate({
      kind: 'image',
      prompt: 'add a hat',
      params: {},
      inputUris: ['https://example.com/ref.png'],
      provider: editProvider,
      spec: resolveMediaModelSpec('image', editProvider, 'dall-e-2'),
      workspaceDir,
    });

    expect(outcome).toMatchObject({ success: false, error: 'no-local-input' });
  });

  it('surfaces an unexpected API failure as a plain error result', async () => {
    const client = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient;
    (client as unknown as { createImage: () => Promise<unknown> }).createImage = vi
      .fn()
      .mockRejectedValue(new Error('rate limited'));
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(client);

    const outcome = await runGenerate();

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('rate limited');
  });

  it('reports a cancelled result when the API call rejects after the signal was aborted', async () => {
    const controller = new AbortController();
    const client = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient;
    (client as unknown as { createImage: () => Promise<unknown> }).createImage = vi
      .fn()
      .mockRejectedValue(new Error('aborted mid-flight'));
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(client);
    controller.abort();

    const outcome = await adapter.generate({
      kind: 'image',
      prompt: 'a red square',
      params: {},
      inputUris: [],
      provider,
      spec: resolveMediaModelSpec('image', provider, 'dall-e-3'),
      workspaceDir,
      signal: controller.signal,
    });

    expect(outcome).toMatchObject({ success: false, error: 'cancelled' });
  });
});
