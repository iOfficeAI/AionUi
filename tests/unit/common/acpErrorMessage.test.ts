import { describe, expect, it } from 'vitest';
import { formatAcpUserErrorMessage } from '@/common/chat/acpErrorMessage';

describe('formatAcpUserErrorMessage', () => {
  it('adds actionable guidance for rate limit errors', () => {
    const message = formatAcpUserErrorMessage(new Error('API Error: Request rejected (429) · Rate limit exceeded'), {
      backend: 'claude',
      modelId: 'haiku',
    });

    expect(message).toContain('rate limited');
    expect(message).toContain('claude / haiku');
    expect(message).toContain('check your provider quota');
  });

  it('adds retry guidance for timeout errors', () => {
    const message = formatAcpUserErrorMessage(new Error('Prompt timed out'), {
      backend: 'claude',
    });

    expect(message).toContain('timed out');
    expect(message).toContain('stopped cleanly');
    expect(message).toContain('increase the prompt timeout');
  });

  it('leaves unrelated errors unchanged', () => {
    expect(formatAcpUserErrorMessage(new Error('authentication failed'), { backend: 'claude' })).toBe(
      'authentication failed'
    );
  });
});
