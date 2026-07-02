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
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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
  const clickMenuItem = async (testId: string) => {
    const marker = await screen.findByTestId(testId);
    const item = marker.closest('[role="menuitem"]');
    expect(item).not.toBeNull();
    fireEvent.click(item as HTMLElement);
  };

  const mockAssistants: AssistantListItem[] = [
    {
      id: '1',
      name: 'Claude',
      description: 'AI',
      sort_order: 1,
      source: 'builtin',
      enabled: true,
      agent_status: 'online',
    },
    {
      id: '2',
      name: 'GPT',
      description: 'OpenAI',
      sort_order: 2,
      source: 'user',
      enabled: false,
      agent_status: 'online',
    },
  ];

  const defaultProps = {
    assistants: mockAssistants,
    localeKey: 'en',
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

  it('calls onCreate from the create-via-chat menu manual item (callback spy)', async () => {
    const user = userEvent.setup();
    const onCreateSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onCreate={onCreateSpy} />);

    // The create button is now a TalkToButlerButton: clicking it opens a menu;
    // "Create manually" is what runs onCreate.
    await user.click(screen.getByTestId('btn-create-assistant'));
    await clickMenuItem('btn-create-assistant-manual');

    expect(onCreateSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit from the row more menu (callback spy)', async () => {
    const user = userEvent.setup();
    const onEditSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onEdit={onEditSpy} />);

    await user.click(screen.getByTestId('btn-assistant-more-1'));
    await clickMenuItem('menu-edit-1');

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

  it('shows delete only for custom assistants in the more menu and calls onDelete', async () => {
    const user = userEvent.setup();
    const onDeleteSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onDelete={onDeleteSpy} />);

    await user.click(screen.getByTestId('btn-assistant-more-1'));
    expect(screen.queryByTestId('menu-delete-1')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('btn-assistant-more-2'));
    await clickMenuItem('menu-delete-2');

    expect(onDeleteSpy).toHaveBeenCalledTimes(1);
    expect(onDeleteSpy).toHaveBeenCalledWith(mockAssistants[1]);
  });

  it('shows duplicate only for non-custom assistants in the more menu and calls onDuplicate', async () => {
    const user = userEvent.setup();
    const onDuplicateSpy = vi.fn();
    renderWithProviders(<AssistantListPanel {...defaultProps} onDuplicate={onDuplicateSpy} />);

    await user.click(screen.getByTestId('btn-assistant-more-1'));
    await clickMenuItem('menu-duplicate-1');

    expect(onDuplicateSpy).toHaveBeenCalledTimes(1);
    expect(onDuplicateSpy).toHaveBeenCalledWith(mockAssistants[0]);

    await user.click(screen.getByTestId('btn-assistant-more-2'));
    expect(screen.queryByTestId('menu-duplicate-2')).not.toBeInTheDocument();
  });

  it('renders the single-list layout without legacy filter tabs and keeps actions in the more menu', () => {
    renderWithProviders(<AssistantListPanel {...defaultProps} />);
    expect(screen.queryByText('settings.assistantFilterAll')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.assistantSectionEnabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('btn-assistant-more-1')).toBeInTheDocument();
    expect(screen.getByTestId('btn-assistant-more-2')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-edit-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-duplicate-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-delete-2')).not.toBeInTheDocument();
  });

  it('does not render the legacy reorder hint copy', () => {
    renderWithProviders(<AssistantListPanel {...defaultProps} />);

    expect(screen.getByTestId('assistant-list-header')).not.toHaveTextContent('settings.assistantListHint');
    expect(screen.getByTestId('assistant-list-body')).not.toHaveTextContent('settings.assistantListHint');
  });

  it('uses compact typography on the right-side action rail', () => {
    renderWithProviders(<AssistantListPanel {...defaultProps} />);

    expect(screen.getByTestId('btn-assistant-more-1')).toHaveClass('!h-30px', '!rounded-8px');
    expect(screen.getByTestId('btn-assistant-more-2')).toHaveClass('!h-30px', '!rounded-8px');
  });

  // F2-05: flag assistants whose underlying agent is not online.
  it('shows an unavailable-agent warning only for assistants whose agent is not online', () => {
    const assistants: AssistantListItem[] = [
      {
        id: '1',
        name: 'Claude',
        description: 'AI',
        sort_order: 1,
        source: 'builtin',
        enabled: true,
        agent_status: 'online',
      },
      {
        id: '2',
        name: 'Gemini',
        description: 'G',
        sort_order: 2,
        source: 'builtin',
        enabled: true,
        agent_status: 'offline',
        agent_status_message: 'Agent requires sign-in.',
      },
    ] as AssistantListItem[];

    renderWithProviders(<AssistantListPanel {...defaultProps} assistants={assistants} />);

    // Online assistant: no warning.
    expect(screen.queryByTestId('assistant-agent-unavailable-1')).toBeNull();
    // Offline assistant: warning shown, and the assistant stays toggleable (not disabled/removed).
    expect(screen.getByTestId('assistant-agent-unavailable-2')).toBeInTheDocument();
    expect(screen.getByTestId('switch-enabled-2')).toBeInTheDocument();
  });

  it('flags assistants with a missing agent as unavailable too', () => {
    const assistants: AssistantListItem[] = [
      {
        id: '9',
        name: 'Orphan',
        description: 'X',
        sort_order: 1,
        source: 'user',
        enabled: true,
        agent_status: 'missing',
      },
    ] as AssistantListItem[];

    renderWithProviders(<AssistantListPanel {...defaultProps} assistants={assistants} />);

    expect(screen.getByTestId('assistant-agent-unavailable-9')).toBeInTheDocument();
  });
});
