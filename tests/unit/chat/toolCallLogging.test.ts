import { afterEach, describe, expect, it, vi } from 'vitest';
import { logDroppedToolCallWithoutCallId } from '@/renderer/pages/conversation/Messages/hooks';
import type { TMessage } from '@/common/chat/chatLib';

describe('logDroppedToolCallWithoutCallId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns with safe metadata when dropping a tool_call without call_id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const dropped = logDroppedToolCallWithoutCallId({
      type: 'tool_call',
      msg_id: 'msg-1',
      conversation_id: 'conversation-1',
      content: {
        call_id: '',
        name: 'Bash',
        status: 'running',
        args: { command: 'secret command' },
        input: { prompt: 'secret prompt' },
        output: 'secret output',
      },
    } as TMessage);

    expect(dropped).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[tool-call] dropped tool_call without call_id', {
      conversation_id: 'conversation-1',
      msg_id: 'msg-1',
      name: 'Bash',
      status: 'running',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });
});
