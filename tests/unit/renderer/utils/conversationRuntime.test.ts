import { describe, expect, it } from 'vitest';

import { isConversationProcessing } from '@/renderer/pages/conversation/utils/conversationRuntime';

describe('isConversationProcessing', () => {
  it('ignores stale DB status', () => {
    expect(
      isConversationProcessing({
        status: 'running',
        runtime: {
          state: 'idle',
          can_send_message: true,
          has_task: false,
          is_processing: false,
          pending_confirmations: 0,
        },
      })
    ).toBe(false);
  });

  it('uses runtime processing states', () => {
    expect(
      isConversationProcessing({
        status: 'finished',
        runtime: {
          state: 'starting',
          can_send_message: false,
          has_task: false,
          is_processing: true,
          pending_confirmations: 0,
        },
      })
    ).toBe(true);
  });

  it('does not use status when runtime is absent', () => {
    expect(isConversationProcessing({ status: 'running' })).toBe(false);
    expect(isConversationProcessing({ status: 'finished' })).toBe(false);
  });
});
