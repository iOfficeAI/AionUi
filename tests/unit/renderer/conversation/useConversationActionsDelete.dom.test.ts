/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateMock, removeInvokeMock, emitMock, modalConfirmMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  removeInvokeMock: vi.fn().mockResolvedValue({ success: true }),
  emitMock: vi.fn(),
  modalConfirmMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.count !== undefined) return `${key}:${options.count}`;
      if (options?.name !== undefined) return `${key}:${options.name}`;
      return key;
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: 'conv-1' }),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      remove: { invoke: removeInvokeMock },
      update: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: emitMock },
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Modal: {
    confirm: modalConfirmMock,
  },
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

const makeConversation = (id: string): TChatConversation =>
  ({
    id,
    type: 'acp',
    name: `Conversation ${id}`,
    created_at: 1,
    modified_at: 1,
    extra: {},
    model: {},
  }) as TChatConversation;

describe('useConversationActions delete functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleDelete shows confirm dialog and invokes remove on confirmation', async () => {
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    const conv = makeConversation('conv-1');
    act(() => {
      result.current.handleDelete(conv);
    });

    expect(modalConfirmMock).toHaveBeenCalledOnce();
    const confirmProps = modalConfirmMock.mock.calls[0][0];
    expect(confirmProps.title).toBe('conversation.history.deleteTitle');

    // Simulate clicking OK
    await act(async () => {
      await confirmProps.onOk();
    });

    expect(removeInvokeMock).toHaveBeenCalledWith({ id: 'conv-1' });
    expect(emitMock).toHaveBeenCalledWith('conversation.deleted', 'conv-1');
    expect(emitMock).toHaveBeenCalledWith('chat.history.refresh');
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('handleBatchDelete removes all selected conversations', async () => {
    const setSelectedConversationIdsMock = vi.fn();
    const onBatchModeChangeMock = vi.fn();
    const selectedIds = new Set(['conv-1', 'conv-2']);

    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: true,
        onBatchModeChange: onBatchModeChangeMock,
        selectedConversationIds: selectedIds,
        setSelectedConversationIds: setSelectedConversationIdsMock,
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    act(() => {
      result.current.handleBatchDelete();
    });

    expect(modalConfirmMock).toHaveBeenCalledOnce();
    const confirmProps = modalConfirmMock.mock.calls[0][0];

    await act(async () => {
      await confirmProps.onOk();
    });

    expect(removeInvokeMock).toHaveBeenCalledWith({ id: 'conv-1' });
    expect(removeInvokeMock).toHaveBeenCalledWith({ id: 'conv-2' });
    expect(setSelectedConversationIdsMock).toHaveBeenCalledWith(expect.any(Set));
    expect(onBatchModeChangeMock).toHaveBeenCalledWith(false);
  });

  it('handleDeleteProject sets target and handleDeleteProjectConfirm deletes all conversations in project', async () => {
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    const projectConversations = [makeConversation('proj-conv-1'), makeConversation('proj-conv-2')];

    act(() => {
      result.current.handleDeleteProject('My Project', projectConversations);
    });

    expect(result.current.deleteProjectTarget).toEqual({
      name: 'My Project',
      conversations: projectConversations,
    });

    await act(async () => {
      await result.current.handleDeleteProjectConfirm();
    });

    expect(removeInvokeMock).toHaveBeenCalledWith({ id: 'proj-conv-1' });
    expect(removeInvokeMock).toHaveBeenCalledWith({ id: 'proj-conv-2' });
    expect(result.current.deleteProjectTarget).toBeNull();
  });
});
