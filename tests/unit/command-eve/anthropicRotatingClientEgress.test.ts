import { describe, expect, it, vi } from 'vitest';

const anthropicMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(
    class {
      messages = {
        create: anthropicMock.create,
      };
    }
  ),
}));

import { AnthropicRotatingClient } from '@/common/api/AnthropicRotatingClient';

describe('Command EVE Anthropic cloud egress boundary', () => {
  it('blocks sensitive OpenAI-compatible chat data before the Anthropic SDK call', async () => {
    anthropicMock.create.mockResolvedValueOnce({
      id: 'msg-test',
      content: [{ type: 'text', text: 'should not be used' }],
      model: 'claude-test',
      role: 'assistant',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const client = new AnthropicRotatingClient(
      'sk-ant-testkey-not-real',
      {
        model: 'claude-test',
        commandEveEgressPolicyAction: 'block',
        commandEveEgressProviderName: 'anthropic',
      },
      { maxRetries: 1 }
    );

    await expect(
      client.createChatCompletion({
        model: 'claude-test',
        messages: [{ role: 'user', content: 'Mein API key: sk-abcdefghijklmnopqrstuvwxyz123456' }],
      })
    ).rejects.toThrow('Command EVE blocked sensitive data before Anthropic model egress');

    expect(anthropicMock.create).not.toHaveBeenCalled();
  });

  it('redacts sensitive native Anthropic message data when policy allows redaction', async () => {
    anthropicMock.create.mockResolvedValueOnce({
      id: 'msg-test',
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-test',
      role: 'assistant',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const client = new AnthropicRotatingClient(
      'sk-ant-testkey-not-real',
      {
        model: 'claude-test',
        commandEveEgressPolicyAction: 'redact',
        commandEveEgressProviderName: 'anthropic',
      },
      { maxRetries: 1 }
    );

    await client.createMessage({
      model: 'claude-test',
      max_tokens: 64,
      system: [{ type: 'text', text: 'Kontakt: mathias@example.com' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Telefon: +49 170 1234567' }] }],
    });

    expect(anthropicMock.create).toHaveBeenCalledTimes(1);
    const params = anthropicMock.create.mock.calls[0]?.[0] as {
      system?: Array<{ text?: string }>;
      messages?: Array<{ content?: Array<{ text?: string }> }>;
    };
    expect(params.system?.[0]?.text).toBe('Kontakt: [REDACTED_EMAIL]');
    expect(params.messages?.[0]?.content?.[0]?.text).toBe('Telefon: [REDACTED_PHONE]');
  });
});
