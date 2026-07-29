/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateMock, routeState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routeState: { id: 'current-conversation' as string | undefined },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: routeState.id }),
  };
});

const modalConfirmMock = vi.fn();

const messageSuccessMock = vi.fn();
const messageErrorMock = vi.fn();

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Modal: {
      confirm: (options: unknown) => modalConfirmMock(options),
    },
    Message: {
      success: (...args: unknown[]) => messageSuccessMock(...args),
      error: (...args: unknown[]) => messageErrorMock(...args),
      warning: (...args: unknown[]) => undefined,
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      remove: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  requestConversationSendBoxPrefill: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';
import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';

const makeConversation = (id: string, extra: TChatConversation['extra'] = {}): TChatConversation =>
  ({
    id,
    type: 'acp',
    name: id,
    created_at: 1,
    modified_at: 1,
    extra,
    model: {},
  }) as TChatConversation;

const renderActions = () =>
  renderHook(() =>
    useConversationActions({
      batchMode: false,
      selectedConversationIds: new Set(),
      setSelectedConversationIds: vi.fn(),
      toggleSelectedConversation: vi.fn(),
      markAsRead: vi.fn(),
    })
  );

describe('useConversationActions delete behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.id = 'current-conversation';
    vi.mocked(ipcBridge.conversation.remove.invoke).mockResolvedValue(true);
  });

  it('shows a danger-styled team source delete confirmation when extra.teamId is present', () => {
    const { result } = renderActions();

    act(() => result.current.handleDeleteClick('conv-1', { teamId: 'team-1' }));

    expect(modalConfirmMock).toHaveBeenCalledOnce();
    const options = modalConfirmMock.mock.calls[0][0] as {
      title: string;
      okText: string;
      okButtonProps: { status: string };
    };
    expect(options.title).toBe('conversation.history.deleteTeamSourceTitle');
    expect(options.okText).toBe('conversation.history.deleteTeamSourceOk');
    expect(options.okButtonProps.status).toBe('danger');
  });

  it('shows a warning-styled normal delete confirmation when extra.teamId is absent', () => {
    const { result } = renderActions();

    act(() => result.current.handleDeleteClick('conv-1', {}));

    expect(modalConfirmMock).toHaveBeenCalledOnce();
    const options = modalConfirmMock.mock.calls[0][0] as {
      title: string;
      okText: string;
      okButtonProps: { status: string };
    };
    expect(options.title).toBe('conversation.history.deleteTitle');
    expect(options.okText).toBe('conversation.history.confirmDelete');
    expect(options.okButtonProps.status).toBe('warning');
  });

  it('shows a normal delete confirmation when extra is undefined', () => {
    const { result } = renderActions();

    act(() => result.current.handleDeleteClick('conv-1', undefined));

    expect(modalConfirmMock).toHaveBeenCalledOnce();
    const options = modalConfirmMock.mock.calls[0][0] as {
      title: string;
      okButtonProps: { status: string };
    };
    expect(options.title).toBe('conversation.history.deleteTitle');
    expect(options.okButtonProps.status).toBe('warning');
  });

  it('removes the conversation and refreshes history when delete is confirmed', async () => {
    const emitSpy = vi.spyOn(emitter, 'emit');
    const { result } = renderActions();

    act(() => result.current.handleDeleteClick('conv-1', { teamId: 'team-1' }));
    const options = modalConfirmMock.mock.calls[0][0] as { onOk: () => Promise<void> };

    await act(async () => options.onOk());

    expect(ipcBridge.conversation.remove.invoke).toHaveBeenCalledWith({ id: 'conv-1' });
    expect(emitSpy).toHaveBeenCalledWith('chat.history.refresh');
    expect(messageSuccessMock).toHaveBeenCalledWith('conversation.history.deleteSuccess');
  });

  it('shows an error message when the delete request fails', async () => {
    vi.mocked(ipcBridge.conversation.remove.invoke).mockResolvedValue(false);
    const { result } = renderActions();

    act(() => result.current.handleDeleteClick('conv-1'));
    const options = modalConfirmMock.mock.calls[0][0] as { onOk: () => Promise<void> };

    await act(async () => options.onOk());

    expect(messageErrorMock).toHaveBeenCalledWith('conversation.history.deleteFailed');
  });

  it('shows an error message when the delete request throws', async () => {
    vi.mocked(ipcBridge.conversation.remove.invoke).mockRejectedValue(new Error('network failure'));
    const { result } = renderActions();

    act(() => result.current.handleDeleteClick('conv-1'));
    const options = modalConfirmMock.mock.calls[0][0] as { onOk: () => Promise<void> };

    await act(async () => options.onOk());

    expect(messageErrorMock).toHaveBeenCalledWith('conversation.history.deleteFailed');
  });

  it('navigates away when deleting the currently open conversation', async () => {
    routeState.id = 'conv-1';
    const { result } = renderActions();

    act(() => result.current.handleDeleteClick('conv-1'));
    const options = modalConfirmMock.mock.calls[0][0] as { onOk: () => Promise<void> };

    await act(async () => options.onOk());

    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
