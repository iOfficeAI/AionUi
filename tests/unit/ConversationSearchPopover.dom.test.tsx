/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const searchConversationMessagesInvoke = vi.fn();
const navigateMock = vi.fn();
const closeAllTabsMock = vi.fn();
const openTabMock = vi.fn();
const blockMobileInputFocusMock = vi.fn();
const blurActiveElementMock = vi.fn();

vi.mock('../../src/common', () => ({
  ipcBridge: {
    database: {
      searchConversationMessages: {
        invoke: (...args: unknown[]) => searchConversationMessagesInvoke(...args),
      },
    },
  },
}));

vi.mock('../../src/renderer/components/base/AionModal', () => ({
  default: ({ visible, children }: { visible?: boolean; children?: ReactNode }) =>
    visible ? <div data-testid='conversation-search-modal'>{children}</div> : null,
}));

vi.mock('../../src/renderer/hooks/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('../../src/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useOptionalConversationTabs: () => ({
    closeAllTabs: closeAllTabsMock,
    openTab: openTabMock,
    activeTab: null,
  }),
}));

vi.mock('../../src/renderer/utils/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('../../src/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: () => blockMobileInputFocusMock(),
  blurActiveElement: () => blurActiveElementMock(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import ConversationSearchPopover from '../../src/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';

const setElectronAPI = (value?: object) => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value,
  });
};

describe('ConversationSearchPopover', () => {
  beforeEach(() => {
    searchConversationMessagesInvoke.mockReset();
    navigateMock.mockReset();
    closeAllTabsMock.mockReset();
    openTabMock.mockReset();
    blockMobileInputFocusMock.mockReset();
    blurActiveElementMock.mockReset();
    globalThis.localStorage?.clear?.();
    setElectronAPI(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the selected conversation and clears the search state after picking a result', async () => {
    searchConversationMessagesInvoke.mockResolvedValue({
      items: [
        {
          conversation: {
            id: 'conv-1',
            name: 'Topic A',
            type: 'gemini',
            createTime: 1,
            modifyTime: 1,
            extra: {
              workspace: '/workspace/topic-a',
              customWorkspace: true,
            },
            model: {
              id: 'provider-1',
              platform: 'openai',
              name: 'Provider',
              baseUrl: 'https://example.com',
              apiKey: 'test-key',
              useModel: 'gpt-4o-mini',
            },
          },
          messageId: 'msg-1',
          messageType: 'text',
          messageCreatedAt: Date.now(),
          previewText: 'target keyword appears here',
        },
      ],
      total: 1,
      page: 0,
      pageSize: 20,
      hasMore: false,
    });

    const onConversationSelect = vi.fn();
    const onSessionClick = vi.fn();

    render(<ConversationSearchPopover onConversationSelect={onConversationSelect} onSessionClick={onSessionClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.historySearch.tooltip' }));
    const input = screen.getByPlaceholderText('conversation.historySearch.placeholder');

    fireEvent.change(input, { target: { value: 'target keyword' } });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await waitFor(() => {
      expect(searchConversationMessagesInvoke).toHaveBeenCalledWith({
        keyword: 'target keyword',
        page: 0,
        pageSize: 20,
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Topic A/ }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/conversation/conv-1', {
        state: {
          targetMessageId: 'msg-1',
          fromConversationSearch: true,
        },
      });
    });

    expect(closeAllTabsMock).toHaveBeenCalledTimes(1);
    expect(openTabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conv-1',
        name: 'Topic A',
      })
    );
    expect(onConversationSelect).toHaveBeenCalledTimes(1);
    expect(onSessionClick).toHaveBeenCalledTimes(1);
    expect(blockMobileInputFocusMock).toHaveBeenCalledTimes(1);
    expect(blurActiveElementMock).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId('conversation-search-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'conversation.historySearch.tooltip' }));

    expect(screen.getByPlaceholderText('conversation.historySearch.placeholder')).toHaveValue('');
  });

  it('opens the modal on Cmd/Ctrl+Shift+F in desktop runtime', () => {
    setElectronAPI({});

    render(<ConversationSearchPopover />);

    fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId('conversation-search-modal')).toBeInTheDocument();
  });

  it('ignores the shortcut outside desktop runtime', () => {
    render(<ConversationSearchPopover />);

    fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true });

    expect(screen.queryByTestId('conversation-search-modal')).not.toBeInTheDocument();
  });

  it('ignores composing and already-handled shortcuts', () => {
    setElectronAPI({});

    render(<ConversationSearchPopover />);

    const composingEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      shiftKey: true,
      key: 'F',
    });
    Object.defineProperty(composingEvent, 'isComposing', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(composingEvent);

    const handledEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      shiftKey: true,
      key: 'F',
    });
    handledEvent.preventDefault();
    document.dispatchEvent(handledEvent);

    expect(screen.queryByTestId('conversation-search-modal')).not.toBeInTheDocument();
  });
});
