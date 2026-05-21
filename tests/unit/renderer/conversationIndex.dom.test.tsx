/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';

const { navigateMock, messageWarning, conversationGetInvoke, listChangedOn, closePreview, openTab, syncTitleFromHistory } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    messageWarning: vi.fn(),
    conversationGetInvoke: vi.fn(),
    listChangedOn: vi.fn(() => () => {}),
    closePreview: vi.fn(),
    openTab: vi.fn(),
    syncTitleFromHistory: vi.fn(),
  }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ id: 'conv-missing' }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: conversationGetInvoke },
      listChanged: { on: listChangedOn },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    closePreview,
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    openTab,
  }),
}));

vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    syncTitleFromHistory,
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatConversation', () => ({
  default: ({ conversation }: { conversation?: { id?: string } }) => (
    <div data-testid='chat-conversation'>{conversation?.id ?? 'empty'}</div>
  ),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      ...actual.Message,
      warning: messageWarning,
    },
  };
});

import ChatConversationIndex from '@/renderer/pages/conversation';

describe('ChatConversationIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationGetInvoke.mockRejectedValue(new Error('not found'));
  });

  it('redirects to home and warns once when the conversation is missing', async () => {
    render(
      <ConfigProvider>
        <ChatConversationIndex />
      </ConfigProvider>
    );

    await waitFor(() => {
      expect(messageWarning).toHaveBeenCalledWith('conversation.chat.notFound');
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });

    expect(messageWarning).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
