import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for AssistantListPanel component (A6 in N4a).
 * Shallow verification: smoke + props branches + callback spies.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

// Mock dependencies
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
}));

vi.mock('./AssistantAvatar', () => ({
  default: ({ assistant }: any) => <div data-testid='avatar'>{assistant.name}</div>,
}));

import AssistantListPanel from '@/renderer/pages/settings/AssistantSettings/AssistantListPanel';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

const renderWithProviders = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

describe('AssistantListPanel', () => {
  const mockAssistants: AssistantListItem[] = [
    { id: '1', name: 'Claude', description: 'AI', sort_order: 1, source: 'builtin', enabled: true },
    { id: '2', name: 'GPT', description: 'OpenAI', sort_order: 2, source: 'user', enabled: false },
  ];

  const defaultProps = {
    assistants: mockAssistants,
    localeKey: 'en',
    avatarImageMap: {},
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
    onToggleEnabled: vi.fn(),
    onReorder: vi.fn(),
    setActiveAssistantId: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing (smoke)', () => {
    const { container } = renderWithProviders(<AssistantListPanel {...defaultProps} />);
    expect(container.querySelector('[data-testid="btn-create-assistant"]')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-list-shell')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-list-header')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-list-body')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-card-1')).toBeInTheDocument();
  });

  it('renders with empty assistants list (props branch)', () => {
    const { container } = renderWithProviders(<AssistantListPanel {...defaultProps} assistants={[]} />);
    expect(container.querySelector('[data-testid="btn-create-assistant"]')).toBeInTheDocument();
    expect(screen.queryAllByTestId('avatar')).toHaveLength(0);
  });

  it('calls onCreate when create button is clicked (callback spy)', async () => {
    const user = userEvent.setup();
    const onCreateSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onCreate={onCreateSpy} />);

    const createButton = screen.getByTestId('btn-create-assistant');
    await user.click(createButton);

    expect(onCreateSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit when edit button is clicked (callback spy)', async () => {
    const user = userEvent.setup();
    const onEditSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onEdit={onEditSpy} />);

    const editButton = screen.getByTestId('btn-edit-1');
    await user.click(editButton);

    expect(onEditSpy).toHaveBeenCalledTimes(1);
    expect(onEditSpy).toHaveBeenCalledWith(mockAssistants[0]);
  });

  it('calls onToggleEnabled when switch is toggled (callback spy)', async () => {
    const user = userEvent.setup();
    const onToggleSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onToggleEnabled={onToggleSpy} />);

    const switchEl = screen.getByTestId('switch-enabled-1');
    await user.click(switchEl);

    expect(onToggleSpy).toHaveBeenCalledTimes(1);
  });

  it('shows delete only for custom assistants and calls onDelete', async () => {
    const user = userEvent.setup();
    const onDeleteSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onDelete={onDeleteSpy} />);

    expect(screen.queryByTestId('btn-delete-1')).not.toBeInTheDocument();
    const deleteButton = screen.getByTestId('btn-delete-2');
    await user.click(deleteButton);

    expect(onDeleteSpy).toHaveBeenCalledTimes(1);
    expect(onDeleteSpy).toHaveBeenCalledWith(mockAssistants[1]);
  });

  it('shows duplicate only for builtin assistants and calls onDuplicate', async () => {
    const user = userEvent.setup();
    const onDuplicateSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onDuplicate={onDuplicateSpy} />);

    const duplicateButton = screen.getByTestId('btn-duplicate-1');
    expect(screen.queryByTestId('btn-duplicate-2')).not.toBeInTheDocument();
    await user.click(duplicateButton);

    expect(onDuplicateSpy).toHaveBeenCalledTimes(1);
    expect(onDuplicateSpy).toHaveBeenCalledWith(mockAssistants[0]);
  });

  it('renders the single-list layout without legacy filter tabs', () => {
    renderWithProviders(<AssistantListPanel {...defaultProps} />);
    expect(screen.queryByText('settings.assistantFilterAll')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.assistantSectionEnabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('btn-duplicate-1')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-duplicate-2')).not.toBeInTheDocument();
  });

  it('does not render the legacy reorder hint copy', () => {
    renderWithProviders(<AssistantListPanel {...defaultProps} />);

    expect(screen.getByTestId('assistant-list-header')).not.toHaveTextContent('settings.assistantListHint');
    expect(screen.getByTestId('assistant-list-body')).not.toHaveTextContent('settings.assistantListHint');
  });

  it('uses smaller action button typography on the right-side action rail', () => {
    renderWithProviders(<AssistantListPanel {...defaultProps} />);

    expect(screen.getByTestId('btn-edit-1')).toHaveClass('!h-30px', '!rounded-8px', '!text-12px', '!font-500');
    expect(screen.getByTestId('btn-duplicate-1')).toHaveClass('!h-30px', '!rounded-8px', '!text-12px', '!font-500');
    expect(screen.getByTestId('btn-delete-2')).toHaveClass('!h-30px', '!rounded-8px', '!text-12px', '!font-500');
  });
});
