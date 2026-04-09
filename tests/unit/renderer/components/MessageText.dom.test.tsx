/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';

const markdownViewMock = vi.hoisted(() =>
  vi.fn(({ children }: { children: React.ReactNode }) => <div data-testid='markdown-view'>{children}</div>)
);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: ({ content }: { content: React.ReactNode }) => <div>{content}</div>,
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/media/FilePreview', () => ({
  default: () => <div data-testid='file-preview' />,
}));

vi.mock('@renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: markdownViewMock,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn(() => null),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageCronBadge', () => ({
  default: () => <div data-testid='message-cron-badge' />,
}));

import MessageText from '@/renderer/pages/conversation/Messages/components/MessagetText';

const createMessage = (overrides?: Partial<IMessageText>): IMessageText => ({
  id: 'message-1',
  conversation_id: 'conversation-1',
  type: 'text',
  position: 'left',
  ...overrides,
  content: {
    content: 'default message',
    ...overrides?.content,
  },
});

describe('MessageText', () => {
  it('renders user-authored markdown-looking text as plain text instead of using MarkdownView', () => {
    render(
      <MessageText
        message={createMessage({
          position: 'right',
          content: {
            content: '~tilde~ **bold** `code`',
          },
        })}
      />
    );

    expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument();
    expect(screen.getByText('~tilde~ **bold** `code`')).toBeInTheDocument();
    expect(markdownViewMock).not.toHaveBeenCalled();
  });

  it('continues to use MarkdownView for assistant messages', () => {
    render(
      <MessageText
        message={createMessage({
          position: 'left',
          content: {
            content: '~tilde~ **bold** `code`',
          },
        })}
      />
    );

    expect(screen.getByTestId('markdown-view')).toBeInTheDocument();
    expect(markdownViewMock).toHaveBeenCalledOnce();
  });
});
