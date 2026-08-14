import { describe, expect, it } from 'vitest';
import { formatRetainedOutputSize, parseRetainedToolOutput } from '@/common/chat/retainedToolOutput';
import { normalizeToolCall } from '@/common/chat/normalizeToolCall';

describe('parseRetainedToolOutput', () => {
  const envelope = {
    preview: 'hello',
    size: 120_000,
    sha256: 'a'.repeat(64),
    reference: `v1_${'b'.repeat(64)}_${'c'.repeat(64)}_${'a'.repeat(64)}`,
  };

  it('parses object envelopes', () => {
    expect(parseRetainedToolOutput(envelope)).toEqual(envelope);
  });

  it('parses JSON string envelopes', () => {
    expect(parseRetainedToolOutput(JSON.stringify(envelope))).toEqual(envelope);
  });

  it('rejects ordinary tool text', () => {
    expect(parseRetainedToolOutput('plain tool output')).toBeNull();
    expect(parseRetainedToolOutput({ text: 'nope' })).toBeNull();
  });
});

describe('formatRetainedOutputSize', () => {
  it('formats byte sizes', () => {
    expect(formatRetainedOutputSize(500)).toBe('500 B');
    expect(formatRetainedOutputSize(2048)).toBe('2.0 KB');
    expect(formatRetainedOutputSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});

describe('normalizeToolCall retained output', () => {
  it('surfaces retained-output previews and the recovery reference', () => {
    const retained = {
      preview: 'first bytes…',
      size: 200_000,
      sha256: 'd'.repeat(64),
      reference: `v1_${'e'.repeat(64)}_${'f'.repeat(64)}_${'d'.repeat(64)}`,
    };
    const result = normalizeToolCall({
      id: 'msg-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'call-1',
        name: 'Bash',
        status: 'completed',
        output: JSON.stringify(retained),
      },
    } as never);

    expect(result?.output).toBe('first bytes…');
    expect(result?.truncated).toBe(true);
    expect(result?.conversationId).toBe('conv-1');
    expect(result?.retainedOutput).toEqual(retained);
  });
});
