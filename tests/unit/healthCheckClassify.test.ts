import { describe, it, expect } from 'vitest';
import {
  classifyHealthCheckMessage,
  getHealthCheckConversationType,
} from '@/renderer/components/settings/SettingsModal/contents/healthCheckUtils';

describe('classifyHealthCheckMessage', () => {
  it('skips request_trace (metadata emitted before API call)', () => {
    expect(classifyHealthCheckMessage('request_trace')).toBe('skip');
  });

  it('skips start (stream creation, not an API response)', () => {
    expect(classifyHealthCheckMessage('start')).toBe('skip');
  });

  it('returns error for error events', () => {
    expect(classifyHealthCheckMessage('error')).toBe('error');
  });

  it('returns success for text content events', () => {
    expect(classifyHealthCheckMessage('text')).toBe('success');
  });

  it('returns success for any unknown event type (first real chunk)', () => {
    expect(classifyHealthCheckMessage('delta')).toBe('success');
    expect(classifyHealthCheckMessage('finish')).toBe('success');
    expect(classifyHealthCheckMessage('tool_call')).toBe('success');
  });
});

describe('getHealthCheckConversationType', () => {
  it('routes Copilot provider health checks through aionrs', () => {
    expect(
      getHealthCheckConversationType({
        id: 'copilot-provider',
        name: 'GitHub Copilot',
        platform: 'copilot',
        model: ['gemini-3.1-pro-preview'],
        apiKey: '',
        baseUrl: 'https://api.githubcopilot.com',
      })
    ).toBe('aionrs');
  });

  it('routes ChatGPT provider health checks through aionrs', () => {
    expect(
      getHealthCheckConversationType({
        id: 'chatgpt-provider',
        name: 'ChatGPT',
        platform: 'chatgpt',
        model: ['gpt-5'],
        apiKey: '',
        baseUrl: 'https://chatgpt.com',
      })
    ).toBe('aionrs');
  });

  it('keeps standard providers on the gemini health-check backend', () => {
    expect(
      getHealthCheckConversationType({
        id: 'openai-provider',
        name: 'OpenAI',
        platform: 'openai',
        model: ['gpt-4.1'],
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
      })
    ).toBe('gemini');
  });
});
