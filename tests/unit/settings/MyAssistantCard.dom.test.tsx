/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

// Focus the test on card branch logic; children are covered by their own specs.
vi.mock('@/renderer/pages/settings/AssistantSettings/AssistantAvatar', () => ({
  default: ({ assistant }: { assistant: AssistantListItem }) => <div data-testid={`avatar-${assistant.id}`} />,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/home/RuntimeBadge', () => ({
  default: ({ assistant }: { assistant: AssistantListItem }) => <div data-testid={`runtime-${assistant.id}`} />,
}));

// Render the dropdown menu inline so gated menu items are queryable without hover/click on a portal.
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => (
      <div>
        {children}
        {droplist}
      </div>
    ),
  };
});

import MyAssistantCard from '@/renderer/pages/settings/AssistantSettings/home/MyAssistantCard';

const makeAssistant = (overrides: Partial<AssistantListItem> = {}): AssistantListItem => ({
  id: 'a1',
  source: 'user',
  name: 'My Helper',
  name_i18n: {},
  description: 'A helper assistant',
  description_i18n: {},
  enabled: true,
  sort_order: 1,
  agent_id: 'agent-1',
  agent: { type: 'claude', source: 'internal' },
  agent_status: 'online',
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  ...overrides,
});

const renderCard = (
  assistant: AssistantListItem,
  handlers: Partial<
    Record<'onOpenDetail' | 'onDelete' | 'onToggleEnabled' | 'onStartChat', ReturnType<typeof vi.fn>>
  > = {}
) => {
  const onOpenDetail = handlers.onOpenDetail ?? vi.fn();
  const onDelete = handlers.onDelete ?? vi.fn();
  const onToggleEnabled = handlers.onToggleEnabled ?? vi.fn();
  const onStartChat = handlers.onStartChat ?? vi.fn();
  render(
    <MyAssistantCard
      assistant={assistant}
      localeKey='en-US'
      onOpenDetail={onOpenDetail}
      onDelete={onDelete}
      onToggleEnabled={onToggleEnabled}
      onStartChat={onStartChat}
    />
  );
  return { onOpenDetail, onDelete, onToggleEnabled, onStartChat };
};

describe('MyAssistantCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders name, description, avatar and runtime badge', () => {
    renderCard(makeAssistant({ id: 'card-1' }));
    expect(screen.getByText('My Helper')).toBeInTheDocument();
    expect(screen.getByText('A helper assistant')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-card-1')).toBeInTheDocument();
  });

  it('prefers the localized name when available', () => {
    renderCard(makeAssistant({ id: 'card-1', name: 'Fallback', name_i18n: { 'en-US': 'Localized Name' } }));
    expect(screen.getByText('Localized Name')).toBeInTheDocument();
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('shows the unavailable warning only when the agent is not online', () => {
    renderCard(makeAssistant({ id: 'online' }));
    expect(screen.queryByTestId('assistant-agent-unavailable-online')).not.toBeInTheDocument();

    renderCard(makeAssistant({ id: 'missing', agent_status: 'missing' }));
    expect(screen.getByTestId('assistant-agent-unavailable-missing')).toBeInTheDocument();
  });

  it('offers a delete action for user assistants but not for generated CLI ones', () => {
    renderCard(makeAssistant({ id: 'user-a', source: 'user' }));
    expect(screen.getByTestId('menu-edit-user-a')).toBeInTheDocument();
    expect(screen.getByTestId('menu-delete-user-a')).toBeInTheDocument();

    renderCard(makeAssistant({ id: 'cli-a', source: 'generated' }));
    expect(screen.getByTestId('menu-edit-cli-a')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-delete-cli-a')).not.toBeInTheDocument();
  });

  it('shows the Chat button only when the assistant is enabled', () => {
    renderCard(makeAssistant({ id: 'on', enabled: true }));
    expect(screen.getByTestId('btn-chat-on')).toBeInTheDocument();

    renderCard(makeAssistant({ id: 'off', enabled: false }));
    expect(screen.queryByTestId('btn-chat-off')).not.toBeInTheDocument();
  });

  it('opens the detail view when the card body is clicked', () => {
    const { onOpenDetail } = renderCard(makeAssistant({ id: 'card-1' }));
    fireEvent.click(screen.getByTestId('assistant-card-card-1'));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }));
  });

  it('toggles enabled state without opening the detail view', () => {
    const { onToggleEnabled, onOpenDetail } = renderCard(makeAssistant({ id: 'card-1', enabled: true }));
    fireEvent.click(screen.getByTestId('switch-enabled-card-1'));
    expect(onToggleEnabled).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }), false);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('starts a chat from the Chat button', () => {
    const { onStartChat } = renderCard(makeAssistant({ id: 'card-1', enabled: true }));
    fireEvent.click(screen.getByTestId('btn-chat-card-1'));
    expect(onStartChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }));
  });

  it('routes the delete menu item to onDelete', () => {
    const { onDelete } = renderCard(makeAssistant({ id: 'card-1', source: 'user' }));
    fireEvent.click(screen.getByTestId('menu-delete-card-1'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }));
  });
});
