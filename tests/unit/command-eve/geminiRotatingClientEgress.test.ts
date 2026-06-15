import { beforeEach, describe, expect, it, vi } from 'vitest';

const geminiMock = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(
    class {
      models = {
        generateContent: geminiMock.generateContent,
      };
    }
  ),
}));

import { GeminiRotatingClient } from '@/common/api/GeminiRotatingClient';

describe('Command EVE Gemini cloud egress boundary', () => {
  beforeEach(() => {
    geminiMock.generateContent.mockReset();
  });

  it('blocks an S2/S3 payload (api_key + German PII) before the Gemini SDK call', async () => {
    geminiMock.generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'should not be used' }] }, finishReason: 'STOP' }],
    });
    const client = new GeminiRotatingClient(
      'gemini-testkey-not-real',
      {
        model: 'gemini-test',
        commandEveEgressPolicyAction: 'block',
        commandEveEgressProviderName: 'gemini',
      },
      { maxRetries: 1 }
    );

    await expect(
      client.createChatCompletion({
        model: 'gemini-test',
        messages: [
          {
            role: 'user',
            content: 'Mein API key: sk-abcdefghijklmnopqrstuvwxyz123456, Adresse: Hauptstraße 12, Berlin',
          },
        ],
      })
    ).rejects.toThrow('Command EVE blocked sensitive data before Gemini model egress');

    expect(geminiMock.generateContent).not.toHaveBeenCalled();
  });

  it('blocks a sensitive bare prompt on generateContent before the Gemini SDK call', async () => {
    geminiMock.generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'should not be used' }] }, finishReason: 'STOP' }],
    });
    const client = new GeminiRotatingClient(
      'gemini-testkey-not-real',
      {
        model: 'gemini-test',
        commandEveEgressPolicyAction: 'block',
        commandEveEgressProviderName: 'gemini',
      },
      { maxRetries: 1 }
    );

    await expect(client.generateContent('Mein API key: sk-abcdefghijklmnopqrstuvwxyz123456')).rejects.toThrow(
      'Command EVE blocked sensitive data before Gemini model egress'
    );

    expect(geminiMock.generateContent).not.toHaveBeenCalled();
  });

  it('redacts sensitive chat data when policy explicitly allows redaction', async () => {
    geminiMock.generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
    });
    const client = new GeminiRotatingClient(
      'gemini-testkey-not-real',
      {
        model: 'gemini-test',
        commandEveEgressPolicyAction: 'redact',
        commandEveEgressProviderName: 'gemini',
      },
      { maxRetries: 1 }
    );

    await client.createChatCompletion({
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'Kontakt: mathias@example.com' }],
    });

    expect(geminiMock.generateContent).toHaveBeenCalledTimes(1);
    const request = geminiMock.generateContent.mock.calls[0]?.[0] as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    expect(request.contents?.[0]?.parts?.[0]?.text).toBe('Kontakt: [REDACTED_EMAIL]');
  });

  it('does not enforce a boundary when no policy action is configured (no-op default)', async () => {
    geminiMock.generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
    });
    const client = new GeminiRotatingClient('gemini-testkey-not-real', { model: 'gemini-test' }, { maxRetries: 1 });

    await client.createChatCompletion({
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'Mein API key: sk-abcdefghijklmnopqrstuvwxyz123456' }],
    });

    expect(geminiMock.generateContent).toHaveBeenCalledTimes(1);
  });
});
