/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addAssistantMock = vi.fn();
const switchTabMock = vi.fn();
const resolveDefaultTeamAgentModelMock = vi.fn();
const messageErrorMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: { error: (...args: unknown[]) => messageErrorMock(...args) },
    Popover: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => (
      <div>
        {children}
        {content}
      </div>
    ),
  };
});

vi.mock('@/renderer/pages/team/hooks/useTeamAssistantOptions', () => ({
  useTeamAssistantOptions: () => ({
    assistants: [
      { id: 'writer', name: 'Writer', backend: 'claude', team_selectable: true },
      { id: 'writer', name: 'Writer', backend: 'claude', team_selectable: true },
      {
        id: 'blocked',
        name: 'Blocked',
        backend: 'claude',
        team_selectable: false,
        team_block_reason: 'blocked',
      },
      { id: 'unchecked', name: 'Unchecked', backend: 'aionrs', team_selectable: true },
    ],
    loading: false,
    error: undefined,
    filterByQuery: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/team/hooks/TeamTabsContext', () => ({
  useTeamTabs: () => ({
    addAssistant: addAssistantMock,
    switchTab: switchTabMock,
  }),
}));

vi.mock('@/renderer/pages/team/components/teamCreateModelResolver', () => ({
  resolveDefaultTeamAgentModel: (...args: unknown[]) => resolveDefaultTeamAgentModelMock(...args),
}));

import TeamAddMemberPopover from '@/renderer/pages/team/components/memberPicker/TeamAddMemberPopover';

describe('TeamAddMemberPopover', () => {
  beforeEach(() => {
    addAssistantMock.mockReset();
    switchTabMock.mockReset();
    messageErrorMock.mockReset();
    resolveDefaultTeamAgentModelMock.mockReset();
    resolveDefaultTeamAgentModelMock.mockResolvedValue('claude-sonnet-4');
    addAssistantMock.mockResolvedValue({ slot_id: 'slot-new' });
  });

  it('does not mark duplicate assistants already in team or disable selectable unchecked rows', () => {
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    expect(screen.queryByText(/already/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('team-add-member-option-writer')).toHaveLength(2);
    expect(screen.getAllByTestId('team-add-member-option-writer')[0]).not.toBeDisabled();
    expect(screen.getAllByTestId('team-add-member-option-writer')[1]).not.toBeDisabled();
    expect(screen.getByTestId('team-add-member-option-unchecked')).not.toBeDisabled();
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('renders the design styled picker with a localized footer hint', () => {
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    expect(screen.getByTestId('team-add-member-panel')).toHaveClass('w-360px');
    expect(screen.getByTestId('team-add-member-picker-body')).toHaveClass('bg-fill-1');
    expect(screen.getAllByTestId('team-add-member-option-writer')[0]).toHaveClass('hover:!bg-fill-2');
    expect(
      screen.getByText('Show all assistants. The same assistant can be added repeatedly as independent members.')
    ).toBeInTheDocument();
  });

  it('adds a teammate and switches to the returned slot', async () => {
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    fireEvent.click(screen.getAllByTestId('team-add-member-option-writer')[0]);

    await waitFor(() => expect(addAssistantMock).toHaveBeenCalledTimes(1));
    expect(addAssistantMock).toHaveBeenCalledWith({
      role: 'teammate',
      assistant_name: 'Writer',
      assistant_id: 'writer',
      model: 'claude-sonnet-4',
    });
    expect(switchTabMock).toHaveBeenCalledWith('slot-new');
  });

  it('keeps the popover content available and does not switch tabs on add failure', async () => {
    addAssistantMock.mockRejectedValueOnce(new Error('failed'));
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    fireEvent.click(screen.getAllByTestId('team-add-member-option-writer')[0]);

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalled());
    expect(screen.getAllByTestId('team-add-member-option-writer')).toHaveLength(2);
    expect(switchTabMock).not.toHaveBeenCalled();
  });

  it('keeps the popover open and does not add when model resolution fails', async () => {
    resolveDefaultTeamAgentModelMock.mockRejectedValueOnce(new Error('no model'));
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    fireEvent.click(screen.getByTestId('team-add-member-option-unchecked'));

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalled());
    expect(addAssistantMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('team-add-member-option-unchecked')).toBeInTheDocument();
    expect(switchTabMock).not.toHaveBeenCalled();
  });
});
