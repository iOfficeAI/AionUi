import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

const mockAddOrUpdateMessage = vi.fn();
const mockConversationGetInvoke = vi.fn();
const mockResponseStreamOn = vi.fn(() => () => {});

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => mockAddOrUpdateMessage,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: (...args: unknown[]) => mockConversationGetInvoke(...args),
      },
    },
    acpConversation: {
      responseStream: {
        on: (...args: unknown[]) => mockResponseStreamOn(...args),
      },
    },
  },
}));

describe('useAcpMessage — conversation hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationGetInvoke.mockResolvedValue({
      status: 'idle',
      type: 'acp',
    });
  });

  it('does not clear aiProcessing when get resolves non-running after setAiProcessing(true)', async () => {
    let resolveGet!: (value: unknown) => void;
    mockConversationGetInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        })
    );

    const { result } = renderHook(() => useAcpMessage('conv-hydrate-1'));

    await waitFor(() => {
      expect(mockConversationGetInvoke).toHaveBeenCalledWith({ id: 'conv-hydrate-1' });
    });

    result.current.setAiProcessing(true);

    resolveGet({ status: 'idle', type: 'acp' });

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    expect(result.current.aiProcessing).toBe(true);
    expect(result.current.running).toBe(false);
  });

  it('sets aiProcessing when backend reports status running', async () => {
    mockConversationGetInvoke.mockResolvedValue({
      status: 'running',
      type: 'acp',
    });

    const { result } = renderHook(() => useAcpMessage('conv-running'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    expect(result.current.aiProcessing).toBe(true);
    expect(result.current.running).toBe(true);
  });

  it('clears aiProcessing when conversation.get returns null', async () => {
    mockConversationGetInvoke.mockResolvedValue(null);

    const { result } = renderHook(() => useAcpMessage('conv-missing'));

    result.current.setAiProcessing(true);

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    expect(result.current.aiProcessing).toBe(false);
    expect(result.current.running).toBe(false);
  });

  it('clears aiProcessing when switching conversation_id', async () => {
    mockConversationGetInvoke.mockResolvedValue({ status: 'idle', type: 'acp' });

    const { result, rerender } = renderHook(({ id }: { id: string }) => useAcpMessage(id), {
      initialProps: { id: 'conv-switch-a' },
    });

    await waitFor(() => expect(result.current.hasHydratedRunningState).toBe(true));

    result.current.setAiProcessing(true);
    await waitFor(() => expect(result.current.aiProcessing).toBe(true));

    rerender({ id: 'conv-switch-b' });

    await waitFor(() => {
      expect(mockConversationGetInvoke).toHaveBeenLastCalledWith({ id: 'conv-switch-b' });
    });

    await waitFor(() => expect(result.current.aiProcessing).toBe(false));
    expect(result.current.hasThinkingMessage).toBe(false);
  });
});
