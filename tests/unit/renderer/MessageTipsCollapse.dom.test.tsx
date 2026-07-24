/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMessageTips } from '@/common/chat/chatLib';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common.collapse': 'Collapse',
        'common.expandMore': 'Expand More',
      })[key] ?? key,
  }),
}));

vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import MessageTips from '@/renderer/pages/conversation/Messages/components/MessageTips';

const message = {
  id: 'tip-1',
  type: 'tips',
  content: { type: 'warning', content: 'Review each command before approval.' },
} as IMessageTips;

describe('MessageTips collapse control', () => {
  afterEach(cleanup);

  it('shows the tip content initially', () => {
    render(<MessageTips message={message} />);

    expect(screen.getByText(message.content.content)).toBeInTheDocument();
  });

  it('collapses the tip to its status icon control', async () => {
    const user = userEvent.setup();
    render(<MessageTips message={message} />);

    await user.click(screen.getByRole('button', { name: 'Collapse' }));

    expect(screen.queryByText(message.content.content)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand More' })).toBeInTheDocument();
  });

  it('restores the tip content from the status icon control', async () => {
    const user = userEvent.setup();
    render(<MessageTips message={message} />);

    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    await user.click(screen.getByRole('button', { name: 'Expand More' }));

    expect(screen.getByText(message.content.content)).toBeInTheDocument();
  });

  it('keeps the collapse control for an unknown tip type', () => {
    render(
      <MessageTips
        message={
          {
            ...message,
            content: { ...message.content, type: 'unknown' },
          } as unknown as IMessageTips
        }
      />
    );

    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
  });
});
