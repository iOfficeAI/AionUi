/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClientFactory } from '@/common/api/ClientFactory';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';
import { ChatMultimodalAdapter } from '@/common/media/adapters/chatMultimodalAdapter';
import type { TProviderWithModel } from '@/common/config/storage';

// 1x1 transparent PNG
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA_URL_PNG = `data:image/png;base64,${TINY_PNG_B64}`;

const provider: TProviderWithModel = {
  id: 'test-provider',
  platform: 'gemini',
  name: 'Gemini',
  base_url: 'https://generativelanguage.googleapis.com',
  api_key: 'sk-test',
  use_model: 'gemini-2.5-flash-image',
};

/** Build an object that passes `instanceof OpenAIRotatingClient` without running the constructor. */
function fakeClient(completion: unknown): OpenAIRotatingClient {
  const client = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient;
  (client as unknown as { createChatCompletion: () => Promise<unknown> }).createChatCompletion = vi
    .fn()
    .mockResolvedValue(completion);
  return client;
}

/** Same as `fakeClient`, but the chat call rejects instead of resolving. */
function fakeFailingClient(error: Error): OpenAIRotatingClient {
  const client = Object.create(OpenAIRotatingClient.prototype) as OpenAIRotatingClient;
  (client as unknown as { createChatCompletion: () => Promise<unknown> }).createChatCompletion = vi
    .fn()
    .mockRejectedValue(error);
  return client;
}

describe('ChatMultimodalAdapter', () => {
  let workspaceDir: string;
  const adapter = new ChatMultimodalAdapter();

  beforeEach(async () => {
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'media-test-chat-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
  });

  const runGenerate = (overrides: Partial<Parameters<ChatMultimodalAdapter['generate']>[0]> = {}) =>
    adapter.generate({
      kind: 'image',
      prompt: 'a red bicycle',
      params: {},
      inputUris: [],
      provider,
      spec: null,
      workspaceDir,
      ...overrides,
    });

  it('returns a cancelled result without calling the API when the signal is already aborted', async () => {
    const spy = vi.spyOn(ClientFactory, 'createRotatingClient');
    const outcome = await runGenerate({ signal: AbortSignal.abort() });

    expect(outcome).toMatchObject({ success: false, error: 'cancelled' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('saves every image returned on message.images (multi-image fix)', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({
        choices: [
          {
            message: {
              content: 'Here are two takes.',
              images: [
                { type: 'image_url', image_url: { url: DATA_URL_PNG } },
                { type: 'image_url', image_url: { url: DATA_URL_PNG } },
              ],
            },
          },
        ],
      })
    );

    const outcome = await runGenerate();

    expect(outcome.success).toBe(true);
    expect(outcome.assets).toHaveLength(2);
    for (const asset of outcome.assets) {
      await expect(fs.promises.access(asset.filePath)).resolves.toBeUndefined();
    }
  });

  it('processes local reference images and fails only if every one of them is unreadable', async () => {
    const spy = vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({
        choices: [{ message: { content: 'ok', images: [{ type: 'image_url', image_url: { url: DATA_URL_PNG } }] } }],
      })
    );

    const outcome = await runGenerate({ inputUris: ['nonexistent.png'] });

    expect(spy).not.toHaveBeenCalled();
    expect(outcome.success).toBe(false);
    expect(outcome.text).toContain('Failed to process any images');
  });

  it('extracts data-URL images embedded in markdown when message.images is absent', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({
        choices: [{ message: { content: `Here you go: ![result](${DATA_URL_PNG})` } }],
      })
    );

    const outcome = await runGenerate();

    expect(outcome.success).toBe(true);
    expect(outcome.assets).toHaveLength(1);
    // The base64 payload must not leak into the returned text (2026-04-14 commit-charge lesson).
    expect(outcome.text).not.toContain(TINY_PNG_B64);
    expect(outcome.text).toContain('[embedded image extracted]');
  });

  it('extracts file-path images embedded in markdown, bounded by resolveSafePath', async () => {
    const fileName = 'saved.png';
    await fs.promises.writeFile(path.join(workspaceDir, fileName), Buffer.from(TINY_PNG_B64, 'base64'));
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({ choices: [{ message: { content: `![result](${fileName})` } }] })
    );

    const outcome = await runGenerate();

    expect(outcome.success).toBe(true);
    expect(outcome.assets).toHaveLength(1);
  });

  it('silently skips a markdown file-path image that resolves outside the workspace', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({ choices: [{ message: { content: '![result](../../../../etc/passwd.png)' } }] })
    );

    const outcome = await runGenerate();

    // No usable image found → treated the same as "model produced no images",
    // not an error: a traversal attempt must not surface as new information.
    expect(outcome.success).toBe(true);
    expect(outcome.assets).toHaveLength(0);
  });

  it('returns success with a warning when the model produces no images at all', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeClient({ choices: [{ message: { content: 'I cannot draw that.' } }] })
    );

    const outcome = await runGenerate();

    expect(outcome).toMatchObject({ success: true, assets: [] });
    expect(outcome.text).toContain('did not produce any images');
  });

  it('errors when the completion has no choices', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(fakeClient({ choices: [] }));

    const outcome = await runGenerate();

    expect(outcome).toMatchObject({ success: false, error: 'No response' });
  });

  it('reports a cancelled result when the API call rejects after the signal was aborted', async () => {
    const controller = new AbortController();
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(
      fakeFailingClient(new Error('aborted mid-flight'))
    );
    // The mocked client's createChatCompletion always rejects; simulate the
    // caller having aborted right as that rejection surfaces.
    controller.abort();

    const outcome = await runGenerate({ signal: controller.signal });

    expect(outcome).toMatchObject({ success: false, error: 'cancelled' });
  });

  it('surfaces an unexpected API failure as a plain error result', async () => {
    vi.spyOn(ClientFactory, 'createRotatingClient').mockResolvedValue(fakeFailingClient(new Error('rate limited')));

    const outcome = await runGenerate();

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('rate limited');
    expect(outcome.text).toContain('rate limited');
  });
});
