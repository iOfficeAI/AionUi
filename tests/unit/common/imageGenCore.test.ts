/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ClientFactory so we can capture the params passed to createChatCompletion
const createChatCompletionMock = vi.fn();

vi.mock('@/common/api/ClientFactory', () => ({
  ClientFactory: {
    createRotatingClient: vi.fn(async () => ({
      createChatCompletion: createChatCompletionMock,
    })),
  },
}));

import { executeImageGeneration } from '@/common/chat/imageGenCore';
import type { TProviderWithModel } from '@/common/config/storage';

const baseProvider = {
  id: 'test-provider',
  name: 'test',
  platform: 'openai',
  api_key: 'sk-test',
  base_url: 'https://api.openai.com/v1',
  models: ['gpt-image-1'],
  use_model: 'gpt-image-1',
} as unknown as TProviderWithModel;

// A real temporary directory per test run — required for the image-save path
let workspaceDir: string;

const successResponse = (imageDataUrl: string) => ({
  id: 'gen-1',
  object: 'chat.completion',
  created: 1,
  model: 'gpt-image-1',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant' as const,
        content: 'Image generated successfully.',
        images: [{ type: 'image_url' as const, image_url: { url: imageDataUrl } }],
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

describe('imageGenCore — extraOpenAIParams pass-through (#541)', () => {
  beforeEach(async () => {
    createChatCompletionMock.mockReset();
    createChatCompletionMock.mockResolvedValue(successResponse('data:image/png;base64,AAAA'));
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aionui-imgtest-'));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (workspaceDir) {
      await fs.promises.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('forwards extraOpenAIParams to createChatCompletion', async () => {
    await executeImageGeneration(
      {
        prompt: 'a red apple',
        extraOpenAIParams: { service_tier: 'flex', temperature: 0.7 },
      },
      baseProvider,
      workspaceDir
    );

    expect(createChatCompletionMock).toHaveBeenCalledTimes(1);
    const [params] = createChatCompletionMock.mock.calls[0];
    expect(params).toMatchObject({
      model: 'gpt-image-1',
      service_tier: 'flex',
      temperature: 0.7,
    });
  });

  it('does not inject extraOpenAIParams when not provided', async () => {
    await executeImageGeneration({ prompt: 'a red apple' }, baseProvider, workspaceDir);

    const [params] = createChatCompletionMock.mock.calls[0];
    expect(params.model).toBe('gpt-image-1');
    expect(params.messages).toBeDefined();
    // No extras → no service_tier, temperature, etc.
    expect(params.service_tier).toBeUndefined();
    expect(params.temperature).toBeUndefined();
  });

  it('does not pollute the call when extraOpenAIParams is an empty object', async () => {
    await executeImageGeneration({ prompt: 'a red apple', extraOpenAIParams: {} }, baseProvider, workspaceDir);

    const [params] = createChatCompletionMock.mock.calls[0];
    expect(params).toEqual({
      model: 'gpt-image-1',
      messages: expect.any(Array),
    });
  });

  it('forwards multiple extras at once', async () => {
    await executeImageGeneration(
      {
        prompt: 'a red apple',
        extraOpenAIParams: {
          service_tier: 'priority',
          temperature: 0.5,
          top_p: 0.8,
          frequency_penalty: 0.3,
          seed: 42,
          parallel_tool_calls: true,
        },
      },
      baseProvider,
      workspaceDir
    );

    const [params] = createChatCompletionMock.mock.calls[0];
    expect(params).toMatchObject({
      model: 'gpt-image-1',
      service_tier: 'priority',
      temperature: 0.5,
      top_p: 0.8,
      frequency_penalty: 0.3,
      seed: 42,
      parallel_tool_calls: true,
    });
  });

  it('forwards non-OpenAI / experimental keys as-is (opaque pass-through)', async () => {
    // The pass-through is intentionally opaque — we do not filter unknown keys.
    // The OpenAI SDK is responsible for rejecting keys it does not recognize.
    await executeImageGeneration(
      {
        prompt: 'a red apple',
        extraOpenAIParams: {
          service_tier: 'flex',
          _internal_flag: 'do-not-echo',
          experimental_param: { nested: true },
        },
      },
      baseProvider,
      workspaceDir
    );

    const [params] = createChatCompletionMock.mock.calls[0];
    expect(params.service_tier).toBe('flex');
    expect(params._internal_flag).toBe('do-not-echo');
    expect(params.experimental_param).toEqual({ nested: true });
  });

  it('does not overwrite model or messages with extras', async () => {
    await executeImageGeneration(
      {
        prompt: 'a red apple',
        extraOpenAIParams: {
          // Hostile overrides — pass-through should NOT replace the real fields
          // because we spread extras AFTER model/messages in the implementation.
          model: 'attacker-model',
          messages: 'replaced',
        },
      },
      baseProvider,
      workspaceDir
    );

    const [params] = createChatCompletionMock.mock.calls[0];
    expect(params.model).toBe('gpt-image-1');
    expect(params.messages).not.toBe('replaced');
    expect(Array.isArray(params.messages)).toBe(true);
  });

  it('returns a successful result when extras are provided and API returns an image', async () => {
    const result = await executeImageGeneration(
      { prompt: 'a red apple', extraOpenAIParams: { service_tier: 'flex' } },
      baseProvider,
      workspaceDir
    );

    expect(result.success).toBe(true);
    expect(result.imagePath).toBeDefined();
  });
});
