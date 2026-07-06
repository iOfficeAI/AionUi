/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';

const openAIConstructorMock = vi.hoisted(() =>
  vi.fn(function OpenAIMock(_config: Record<string, unknown>) {
    return {};
  })
);

vi.mock('openai', () => ({
  __esModule: true,
  default: openAIConstructorMock,
}));

describe('OpenAIRotatingClient', () => {
  const originalOpenAIKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    openAIConstructorMock.mockClear();
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  it('passes the cleaned configured key to the OpenAI SDK using camelCase apiKey', () => {
    const httpAgent = { name: 'proxy-agent' };

    const client = new OpenAIRotatingClient(' \n sk-configured-key\t ', {
      baseURL: 'https://gateway.example.com/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://aionui.com',
      },
      httpAgent,
    });

    expect(client.hasMultipleKeys()).toBe(false);
    expect(openAIConstructorMock).toHaveBeenCalledTimes(1);
    const firstCall = openAIConstructorMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const config = firstCall?.[0] as Record<string, unknown>;
    expect(config).toMatchObject({
      apiKey: 'sk-configured-key',
      baseURL: 'https://gateway.example.com/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://aionui.com',
      },
      httpAgent,
    });
    expect(config).not.toHaveProperty('api_key');
  });

  it('rejects API operations when no configured key can initialize a client', async () => {
    const client = new OpenAIRotatingClient('');

    await expect(client.createChatCompletion({ model: 'gpt-4o-mini', messages: [] })).rejects.toThrow(
      /Client not initialized/
    );
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });
});
