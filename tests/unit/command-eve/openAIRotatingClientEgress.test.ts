import { beforeEach, describe, expect, it, vi } from 'vitest';

const openAiMock = vi.hoisted(() => ({
  create: vi.fn(),
  imagesGenerate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn(
    class {
      chat = {
        completions: {
          create: openAiMock.create,
        },
      };
      images = {
        generate: openAiMock.imagesGenerate,
      };
    }
  ),
}));

import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';

describe('Command EVE OpenAI-compatible cloud egress boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks sensitive chat data before the OpenAI SDK call', async () => {
    openAiMock.create.mockResolvedValueOnce({
      choices: [{ message: { content: 'should not be used' }, finish_reason: 'stop' }],
    });
    const client = new OpenAIRotatingClient(
      'sk-testkey-not-real',
      {
        baseURL: 'https://api.openai.example/v1',
        commandEveEgressPolicyAction: 'block',
        commandEveEgressProviderName: 'openai',
      },
      { maxRetries: 1 }
    );

    await expect(
      client.createChatCompletion({
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'Mein API key: sk-abcdefghijklmnopqrstuvwxyz123456' }],
      })
    ).rejects.toThrow('Command EVE blocked sensitive data before cloud model egress');

    expect(openAiMock.create).not.toHaveBeenCalled();
  });

  it('redacts sensitive chat data when policy explicitly allows redaction', async () => {
    openAiMock.create.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    });
    const client = new OpenAIRotatingClient(
      'sk-testkey-not-real',
      {
        baseURL: 'https://api.openai.example/v1',
        commandEveEgressPolicyAction: 'redact',
        commandEveEgressProviderName: 'openai',
      },
      { maxRetries: 1 }
    );

    await client.createChatCompletion({
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'Kontakt: mathias@example.com' }],
    });

    expect(openAiMock.create).toHaveBeenCalledTimes(1);
    const params = openAiMock.create.mock.calls[0]?.[0] as { messages?: Array<{ content?: string }> } | undefined;
    expect(params?.messages?.[0]?.content).toBe('Kontakt: [REDACTED_EMAIL]');
  });

  it('blocks sensitive image-generation prompts before the OpenAI SDK call', async () => {
    openAiMock.imagesGenerate.mockResolvedValueOnce({ data: [{ url: 'https://example/should-not-be-used.png' }] });
    const client = new OpenAIRotatingClient(
      'sk-testkey-not-real',
      {
        baseURL: 'https://api.openai.example/v1',
        commandEveEgressPolicyAction: 'block',
        commandEveEgressProviderName: 'openai',
      },
      { maxRetries: 1 }
    );

    await expect(
      client.createImage({
        model: 'gpt-image-1',
        prompt: 'Render this leaked API key on a poster: sk-abcdefghijklmnopqrstuvwxyz123456',
      })
    ).rejects.toThrow('Command EVE blocked sensitive data before cloud model egress');

    expect(openAiMock.imagesGenerate).not.toHaveBeenCalled();
  });

  it('redacts a sensitive image-generation prompt when policy allows redaction', async () => {
    openAiMock.imagesGenerate.mockResolvedValueOnce({ data: [{ url: 'https://example/ok.png' }] });
    const client = new OpenAIRotatingClient(
      'sk-testkey-not-real',
      {
        baseURL: 'https://api.openai.example/v1',
        commandEveEgressPolicyAction: 'redact',
        commandEveEgressProviderName: 'openai',
      },
      { maxRetries: 1 }
    );

    await client.createImage({
      model: 'gpt-image-1',
      prompt: 'A friendly robot writing to mathias@example.com',
    });

    expect(openAiMock.imagesGenerate).toHaveBeenCalledTimes(1);
    const params = openAiMock.imagesGenerate.mock.calls[0]?.[0] as { prompt?: string } | undefined;
    expect(params?.prompt).toBe('A friendly robot writing to [REDACTED_EMAIL]');
  });

  it('passes a clean image-generation prompt straight through (no boundary policy)', async () => {
    openAiMock.imagesGenerate.mockResolvedValueOnce({ data: [{ url: 'https://example/clean.png' }] });
    const client = new OpenAIRotatingClient(
      'sk-testkey-not-real',
      { baseURL: 'https://api.openai.example/v1' },
      { maxRetries: 1 }
    );

    await client.createImage({ model: 'gpt-image-1', prompt: 'A serene mountain lake at dawn' });

    expect(openAiMock.imagesGenerate).toHaveBeenCalledTimes(1);
    const params = openAiMock.imagesGenerate.mock.calls[0]?.[0] as { prompt?: string } | undefined;
    expect(params?.prompt).toBe('A serene mountain lake at dawn');
  });
});
