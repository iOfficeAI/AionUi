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

const confirmMock = vi.fn();

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
  const Tooltip = ({ children }: React.PropsWithChildren) => <>{children}</>;
  const Modal = {
    confirm: (config: { onOk?: () => void }) => confirmMock(config),
  };
  return { Button, Dropdown, Menu, Modal, Tooltip, Typography };
});

vi.mock('@icon-park/react', () => ({
  CornerDownRight: () => <span data-testid='corner-down-right-icon' />,
  Delete: () => <span data-testid='delete-icon' />,
  Drag: () => <span data-testid='drag-icon' />,
  Edit: () => <span data-testid='edit-icon' />,
  Inbox: () => <span data-testid='inbox-icon' />,
  SortTwo: () => <span data-testid='sort-two-icon' />,
  MoreOne: () => <span data-testid='more-icon' />,
  SendOne: () => <span data-testid='send-icon' />,
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
    mode: 'auto',
    interactionLocked: false,
    onInteractionLock: vi.fn(),
    onInteractionUnlock: vi.fn(),
    onEdit: vi.fn(),
    onSendNow: vi.fn(),
    onToggleMode: vi.fn(),
    onReorder: vi.fn(),
    onRemove: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };

  render(<CommandQueuePanel {...props} />);
  return props;
};

describe('CommandQueuePanel', () => {
  it('renders the three per-item actions: send now, edit, remove', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Send now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('wires send now, edit and remove callbacks per item', () => {
    const onSendNow = vi.fn();
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    renderPanel({ onSendNow, onEdit, onRemove });

    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onSendNow).toHaveBeenCalledExactlyOnceWith(item);
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(item);
    expect(onRemove).toHaveBeenCalledExactlyOnceWith('queued-1');
  });

  it('shows the current mode and toggles it', () => {
    const onToggleMode = vi.fn();
    renderPanel({ mode: 'auto', onToggleMode });

    const toggle = screen.getByRole('button', { name: 'Toggle send mode' });
    expect(toggle).toHaveTextContent('Auto');
    fireEvent.click(toggle);
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('renders the manual label when in manual mode', () => {
    renderPanel({ mode: 'manual' });
    expect(screen.getByRole('button', { name: 'Toggle send mode' })).toHaveTextContent('Manual');
  });

  it('does not render a separate help button (help lives on the mode toggle)', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument();
  });

  it('clears the draft box through a confirm dialog', () => {
    confirmMock.mockReset();
    const onClear = vi.fn();
    renderPanel({ onClear });

    fireEvent.click(screen.getByRole('button', { name: 'Clear draft box' }));
    // Clearing must go through a confirm step, not fire immediately.
    expect(onClear).not.toHaveBeenCalled();
    expect(confirmMock).toHaveBeenCalledTimes(1);

    // Simulate the user confirming.
    const config = confirmMock.mock.calls[0][0] as { onOk?: () => void };
    config.onOk?.();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
