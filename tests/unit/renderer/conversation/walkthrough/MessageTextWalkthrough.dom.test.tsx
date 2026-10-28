/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { Message } from '@arco-design/web-react';
import type { IMessageText } from '@/common/chat/chatLib';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { defaultValue?: string }) => opts?.defaultValue || k,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='markdown-view'>{children}</div>,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation_id: 'conv-123',
    workspace: '/test/workspace',
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview', () => ({
  useLocalFilePreview: () => vi.fn(),
}));

vi.mock('@/renderer/hooks/chat/useForkConversation', () => ({
  useForkConversation: () => vi.fn(),
}));

import MessageText from '@/renderer/pages/conversation/Messages/components/MessageText';

describe('MessageText Walkthrough integration', () => {
  beforeEach(() => {
    vi.spyOn(Message, 'info').mockImplementation(() => '' as never);
    vi.spyOn(Message, 'warning').mockImplementation(() => '' as never);
    vi.spyOn(Message, 'error').mockImplementation(() => '' as never);
    vi.spyOn(Message, 'success').mockImplementation(() => '' as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders both text bubble and WalkthroughCard when message has text and walkthrough', () => {
    const msg: IMessageText = {
      id: 'msg-1',
      msg_id: 'msg-1',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-123',
      created_at: Date.now(),
      content: {
        content: `Tudo pronto! Aqui estão as alterações:

[WALKTHROUGH]
# Walkthrough: Sistema de Ditado
## 1. O que foi Entregue
- Modelo de IA Parakeet
## 2. Como Funciona
- Inferência local
[/WALKTHROUGH]`,
      },
    };

    render(<MessageText message={msg} />);

    expect(screen.getByTestId('message-text-content')).toBeInTheDocument();
    expect(screen.getByText('Tudo pronto! Aqui estão as alterações:')).toBeInTheDocument();
    expect(screen.getByTestId('walkthrough-card')).toBeInTheDocument();
    expect(screen.getByText('Sistema de Ditado')).toBeInTheDocument();
  });

  it('renders only WalkthroughCard without text bubble when message is purely walkthrough', () => {
    const msg: IMessageText = {
      id: 'msg-2',
      msg_id: 'msg-2',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-123',
      created_at: Date.now(),
      content: {
        content: `[WALKTHROUGH]
# Walkthrough: Pure Summary
## Delivered Changes
- Fixed bug
## Verification
- Run tests
[/WALKTHROUGH]`,
      },
    };

    render(<MessageText message={msg} />);

    expect(screen.queryByTestId('message-text-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('walkthrough-card')).toBeInTheDocument();
    expect(screen.getByText('Pure Summary')).toBeInTheDocument();
  });

  it('renders only text bubble when message does not contain a walkthrough', () => {
    const msg: IMessageText = {
      id: 'msg-3',
      msg_id: 'msg-3',
      type: 'text',
      position: 'left',
      conversation_id: 'conv-123',
      created_at: Date.now(),
      content: {
        content: 'Just a normal assistant response.',
      },
    };

    render(<MessageText message={msg} />);

    expect(screen.getByTestId('message-text-content')).toBeInTheDocument();
    expect(screen.getByText('Just a normal assistant response.')).toBeInTheDocument();
    expect(screen.queryByTestId('walkthrough-card')).not.toBeInTheDocument();
  });
});
