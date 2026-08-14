import { describe, expect, it } from 'vitest';
import { normalizeToolCall } from './normalizeToolCall';

describe('normalizeToolCall', () => {
  it('ignores tool_call messages without call_id', () => {
    const result = normalizeToolCall({
      type: 'tool_call',
      content: {
        call_id: '',
        name: 'Glob',
        status: 'running',
        args: { pattern: '*.rs' },
      },
    } as any);

    expect(result).toBeUndefined();
  });

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
    } as any);

    expect(result?.output).toBe('first bytes…');
    expect(result?.truncated).toBe(true);
    expect(result?.conversationId).toBe('conv-1');
    expect(result?.retainedOutput).toEqual(retained);
  });
});
