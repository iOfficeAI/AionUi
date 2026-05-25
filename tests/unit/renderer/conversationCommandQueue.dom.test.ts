import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import {
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';

const createQueueWrapper = ({ children }: { children: ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

describe('useConversationCommandQueue', () => {
  it('executes queued commands in order after each busy turn completes', async () => {
    const executed: string[] = [];
    const onExecute = vi.fn(async (item: ConversationCommandQueueItem) => {
      executed.push(item.input);
    });

    const { result, rerender } = renderHook(
      ({ isBusy }) =>
        useConversationCommandQueue({
          conversationId: 'conv-fifo',
          isBusy,
          isHydrated: true,
          onExecute,
        }),
      {
        initialProps: { isBusy: true },
        wrapper: createQueueWrapper,
      }
    );

    act(() => {
      result.current.enqueue({ input: 'first queued', files: [] });
      result.current.enqueue({ input: 'second queued', files: [] });
    });

    await waitFor(() => {
      expect(result.current.items.map((item) => item.input)).toEqual(['first queued', 'second queued']);
    });

    rerender({ isBusy: false });

    await waitFor(() => {
      expect(executed).toEqual(['first queued']);
    });

    rerender({ isBusy: true });
    rerender({ isBusy: false });

    await waitFor(() => {
      expect(executed).toEqual(['first queued', 'second queued']);
    });
    expect(onExecute).toHaveBeenCalledTimes(2);
  });
});
