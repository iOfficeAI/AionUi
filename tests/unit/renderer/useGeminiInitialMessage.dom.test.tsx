import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeminiInitialMessage } from '@/renderer/pages/conversation/platforms/gemini/useGeminiInitialMessage';

const mockGeminiSendInvoke = vi.fn();
const mockAddOrUpdateMessage = vi.fn();
const mockCheckAndUpdateTitle = vi.fn();
const mockEmitterEmit = vi.fn();

let uuidCounter = 0;

vi.mock('@/common', () => ({
  ipcBridge: {
    geminiConversation: {
      sendMessage: {
        invoke: (...args: unknown[]) => mockGeminiSendInvoke(...args),
      },
    },
  },
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => `gemini-init-${++uuidCounter}`),
}));

vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    checkAndUpdateTitle: mockCheckAndUpdateTitle,
  }),
}));

vi.mock('@/renderer/hooks/ui/useLatestRef', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    useLatestRef: <T,>(value: T) => {
      const ref = ReactModule.useRef(value);
      ref.current = value;
      return ref;
    },
  };
});

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => mockAddOrUpdateMessage,
}));

vi.mock('@/renderer/pages/conversation/platforms/assertBridgeSuccess', () => ({
  assertBridgeSuccess: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: (...args: unknown[]) => mockEmitterEmit(...args),
  },
}));

describe('useGeminiInitialMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    sessionStorage.clear();
    mockGeminiSendInvoke.mockResolvedValue({ success: true });
  });

  it('stores the initial prompt in the draft and starts agent readiness when auth is missing', async () => {
    const setContent = vi.fn();
    const setShowSetupCard = vi.fn();
    const performFullCheck = vi.fn().mockResolvedValue(undefined);
    const autoSwitchTriggeredRef = { current: false };

    sessionStorage.setItem(
      'gemini_initial_message_conv-no-auth',
      JSON.stringify({
        input: 'draft from guide',
      })
    );

    renderHook(() =>
      useGeminiInitialMessage({
        conversationId: 'conv-no-auth',
        currentModelId: undefined,
        hasNoAuth: true,
        setContent,
        setActiveMsgId: vi.fn(),
        setWaitingResponse: vi.fn(),
        autoSwitchTriggeredRef,
        setShowSetupCard,
        performFullCheck,
      })
    );

    await waitFor(() => {
      expect(setContent).toHaveBeenCalledWith('draft from guide');
    });

    expect(sessionStorage.getItem('gemini_initial_message_conv-no-auth')).toBeNull();
    expect(autoSwitchTriggeredRef.current).toBe(true);
    expect(setShowSetupCard).toHaveBeenCalledWith(true);
    expect(performFullCheck).toHaveBeenCalledTimes(1);
    expect(mockGeminiSendInvoke).not.toHaveBeenCalled();
  });

  it('sends the initial prompt immediately when auth and model are ready', async () => {
    const setActiveMsgId = vi.fn();
    const setWaitingResponse = vi.fn();

    sessionStorage.setItem(
      'gemini_initial_message_conv-ready',
      JSON.stringify({
        input: 'send immediately',
        files: ['C:/workspace/readme.md'],
      })
    );

    renderHook(() =>
      useGeminiInitialMessage({
        conversationId: 'conv-ready',
        currentModelId: 'gemini-2.5',
        hasNoAuth: false,
        setContent: vi.fn(),
        setActiveMsgId,
        setWaitingResponse,
        autoSwitchTriggeredRef: { current: false },
        setShowSetupCard: vi.fn(),
        performFullCheck: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(mockGeminiSendInvoke).toHaveBeenCalledTimes(1);
    });

    expect(setActiveMsgId).toHaveBeenCalledWith('gemini-init-1');
    expect(setWaitingResponse).toHaveBeenCalledWith(true);
    expect(mockAddOrUpdateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-ready',
        position: 'right',
      }),
      true
    );
    expect(mockCheckAndUpdateTitle).toHaveBeenCalledWith('conv-ready', 'send immediately');
    expect(mockEmitterEmit).toHaveBeenCalledWith('chat.history.refresh');
    expect(mockEmitterEmit).toHaveBeenCalledWith('gemini.workspace.refresh');
    expect(sessionStorage.getItem('gemini_initial_message_conv-ready')).toBeNull();
  });
});
