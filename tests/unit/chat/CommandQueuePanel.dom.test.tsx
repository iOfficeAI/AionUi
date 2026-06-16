/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement> & { status?: string }>) => (
    <button type='button' {...props}>
      {children}
    </button>
  );
  const Dropdown = ({ children, droplist }: React.PropsWithChildren<{ droplist: React.ReactNode }>) => (
    <div>
      {children}
      {droplist}
    </div>
  );
  const Menu = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  Menu.Item = ({
    children,
    onClick,
  }: React.PropsWithChildren<{
    onClick?: () => void;
  }>) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  );
  const Typography = {
    Ellipsis: ({ children, ...props }: React.PropsWithChildren) => <span {...props}>{children}</span>,
  };
  return { Button, Dropdown, Menu, Typography };
});

vi.mock('@icon-park/react', () => ({
  CornerDownRight: () => <span data-testid='corner-down-right-icon' />,
  Delete: () => <span data-testid='delete-icon' />,
  Drag: () => <span data-testid='drag-icon' />,
  MoreOne: () => <span data-testid='more-icon' />,
}));

const item: ConversationCommandQueueItem = {
  id: 'queued-1',
  input: 'queued follow-up',
  files: [],
  created_at: 1,
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof CommandQueuePanel>> = {}) => {
  const props: React.ComponentProps<typeof CommandQueuePanel> = {
    items: [item],
    interactionLocked: false,
    onInteractionLock: vi.fn(),
    onInteractionUnlock: vi.fn(),
    onReorder: vi.fn(),
    onRemove: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };

  render(<CommandQueuePanel {...props} />);
  return props;
};

describe('CommandQueuePanel', () => {
  it('does not render a paused resume control when paused', () => {
    renderPanel();

    expect(screen.queryByText('Queue paused')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume queue' })).not.toBeInTheDocument();
  });

  it('keeps remove and clear callbacks wired', () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    renderPanel({ onRemove, onClear });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }));

    expect(onRemove).toHaveBeenCalledExactlyOnceWith('queued-1');
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
