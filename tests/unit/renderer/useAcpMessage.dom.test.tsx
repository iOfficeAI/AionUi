import React from 'react';
import { render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcpChat from '@/renderer/pages/conversation/platforms/acp/AcpChat';
import { useAcpMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

const mockAddOrUpdateMessage = vi.fn();
const mockConversationGetInvoke = vi.fn();
const mockResponseStreamOn = vi.fn(() => () => {});
const mockArtifactListInvoke = vi.fn();
const mockArtifactStreamOn = vi.fn(() => () => {});
const mockMessageListCache = vi.fn();

vi.mock('@renderer/pages/conversation/Messages/MessageList', () => ({
  default: () => <div data-testid='message-list' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpSendBox', () => ({
  default: () => <div data-testid='acp-sendbox' />,
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', async () => ({
  ...(await vi.importActual<typeof import('@/renderer/pages/conversation/Messages/hooks')>(
    '@/renderer/pages/conversation/Messages/hooks'
  )),
  useAddOrUpdateMessage: () => mockAddOrUpdateMessage,
  useMessageLstCache: (...args: unknown[]) => mockMessageListCache(...args),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: (...args: unknown[]) => mockConversationGetInvoke(...args),
      },
      listArtifacts: {
        invoke: (...args: unknown[]) => mockArtifactListInvoke(...args),
      },
      artifactStream: {
        on: (...args: unknown[]) => mockArtifactStreamOn(...args),
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
    mockArtifactListInvoke.mockResolvedValue([]);
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

  it('subscribes to ACP response stream and artifact stream even when sendbox is hidden', async () => {
    let responseHandler: ((message: unknown) => void) | undefined;
    let artifactHandler: ((artifact: unknown) => void) | undefined;
    mockResponseStreamOn.mockImplementation((cb: (message: unknown) => void) => {
      responseHandler = cb;
      return () => {};
    });
    mockArtifactStreamOn.mockImplementation((cb: (artifact: unknown) => void) => {
      artifactHandler = cb;
      return () => {};
    });

    render(<AcpChat conversation_id='conv-cron' backend='claude' cron_job_id='cron-1' hideSendBox />);

    await waitFor(() => {
      expect(mockMessageListCache).toHaveBeenCalledWith('conv-cron');
      expect(mockResponseStreamOn).toHaveBeenCalled();
      expect(mockArtifactListInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-cron' });
      expect(mockArtifactStreamOn).toHaveBeenCalled();
    });

    expect(responseHandler).toBeTypeOf('function');
    expect(artifactHandler).toBeTypeOf('function');

    responseHandler?.({
      type: 'skill_suggest',
      msg_id: 'skill-1',
      conversation_id: 'conv-cron',
      data: {
        cron_job_id: 'cron-1',
        name: 'daily-brief',
        description: 'Daily brief',
        skill_content: '# skill body',
      },
    });

    artifactHandler?.({
      id: 'artifact-1',
      conversation_id: 'conv-cron',
      cron_job_id: 'cron-1',
      kind: 'skill_suggest',
      status: 'pending',
      payload: {
        cron_job_id: 'cron-1',
        name: 'daily-brief',
        description: 'Daily brief',
        skill_content: '# skill body',
      },
      created_at: 1000,
      updated_at: 1000,
    });

    await waitFor(() => {
      expect(mockAddOrUpdateMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'skill_suggest' }));
    });
  });
});
