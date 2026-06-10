import { describe, expect, it, vi } from 'vitest';

const openAiMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn(
    class {
      chat = {
        completions: {
          create: openAiMock.create,
        },
      };
    }
  ),
}));

import { OpenAIRotatingClient } from '@/common/api/OpenAIRotatingClient';

describe('Command EVE OpenAI-compatible cloud egress boundary', () => {
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
});
