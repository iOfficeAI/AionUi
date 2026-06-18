import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetWarmupConversationStateForTests,
  warmupConversation,
} from '@/renderer/pages/conversation/utils/warmupConversation';

const { warmupInvokeMock } = vi.hoisted(() => ({
  warmupInvokeMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: {
        invoke: warmupInvokeMock,
      },
    },
  },
}));

describe('warmupConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWarmupConversationStateForTests();
  });

  it('coalesces concurrent warmups for the same conversation', async () => {
    let resolveWarmup: (() => void) | undefined;
    warmupInvokeMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWarmup = resolve;
      })
    );

    const first = warmupConversation('conv-1');
    const second = warmupConversation('conv-1');

    expect(warmupInvokeMock).toHaveBeenCalledTimes(1);
    expect(warmupInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });

    resolveWarmup?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('retries after a failed warmup', async () => {
    warmupInvokeMock.mockRejectedValueOnce(new Error('warmup failed')).mockResolvedValueOnce(undefined);

    await expect(warmupConversation('conv-1')).rejects.toThrow('warmup failed');
    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();

    expect(warmupInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('skips repeated warmup after a conversation is already ready', async () => {
    warmupInvokeMock.mockResolvedValue(undefined);

    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();
    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();

    expect(warmupInvokeMock).toHaveBeenCalledTimes(1);
  });
});
