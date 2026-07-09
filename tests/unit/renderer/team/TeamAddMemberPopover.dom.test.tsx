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
    // The dropdown is built on Arco Trigger; render the popup inline so the
    // picker is queryable in tests regardless of open state.
    Trigger: ({
      children,
      popup,
      position,
    }: {
      children: React.ReactNode;
      popup?: () => React.ReactNode;
      position?: string;
    }) => (
      <div data-testid='team-add-member-popover-shell' data-position={position}>
        {children}
        {popup ? popup() : null}
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
    assistants: [
      {
        slot_id: 'leader-slot',
        conversation_id: 'leader-conv',
        role: 'leader',
        assistant_backend: 'claude',
        assistant_name: 'Leader',
        status: 'idle',
      },
    ],
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
    expect(screen.queryByText('blocked')).not.toBeInTheDocument();
  });

  it('renders the shared right-aligned dropdown picker with a header title + subtitle', () => {
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    // Shared TeamAssistantPickerDropdown: right-aligned popup, 260px panel, modal density rows.
    expect(screen.getByTestId('team-add-member-popover-shell')).toHaveAttribute('data-position', 'br');
    expect(screen.getByTestId('team-add-member-panel')).toHaveClass('w-260px');
    expect(screen.getByTestId('team-add-member-search').tagName).toBe('INPUT');
    expect(screen.getByTestId('team-add-member-picker-body')).toHaveClass('bg-dialog-fill-0');
    expect(screen.getByTestId('team-add-member-picker-body')).not.toHaveClass('bg-fill-1');
    expect(screen.getAllByTestId('team-add-member-option-writer')[0]).toHaveClass(
      '!h-44px',
      '!px-8px',
      'hover:!bg-fill-2'
    );
    // Header replaces the old footer hint: title on top, short subtitle beneath it.
    const header = screen.getByTestId('team-add-member-panel-header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent('Add member');
    expect(header).toHaveTextContent('The same assistant can be added repeatedly');
    expect(screen.queryByTestId('team-add-member-footer')).not.toBeInTheDocument();
  });

  it('renders blocked add-member rows as muted and non-actionable', () => {
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    const blockedOption = screen.getByTestId('team-add-member-option-blocked');
    const rowContent = blockedOption.querySelector('[data-testid="team-assistant-picker-row-content"]');
    const optionName = blockedOption.querySelector('[data-testid="assistant-option-name"]');
    const addIcon = blockedOption.querySelector('[data-testid="team-assistant-picker-add-icon"]');

    expect(blockedOption.tagName).toBe('BUTTON');
    expect(blockedOption).toHaveAttribute('aria-disabled', 'true');
    expect(blockedOption).toHaveAttribute('tabindex', '-1');
    expect(blockedOption).toHaveClass('w-full');
    expect(blockedOption).toHaveClass('!h-44px');
    expect(blockedOption).not.toHaveClass('!h-auto', '!min-h-58px');
    expect(blockedOption).not.toHaveClass('hover:!bg-fill-2');
    expect(rowContent).toHaveClass('cursor-not-allowed', 'text-t-tertiary');
    expect(rowContent).toHaveClass('w-full', 'items-center', 'justify-between');
    expect(rowContent).not.toHaveClass('flex-col');
    expect(optionName).toHaveClass('text-t-tertiary');
    expect(addIcon).toHaveClass('flex', 'h-30px', 'w-30px', 'items-center', 'justify-center', 'text-t-quaternary');
    expect(addIcon).not.toHaveClass('mt-9px');
    expect(screen.queryByText('blocked')).not.toBeInTheDocument();
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

  it('shows a "tell the Leader" guidance and switches to the leader on click', () => {
    render(
      <TeamAddMemberPopover>
        <button type='button'>add</button>
      </TeamAddMemberPopover>
    );

    const tellLeader = screen.getByTestId('team-add-member-tell-leader');
    expect(tellLeader).toBeInTheDocument();

    fireEvent.click(tellLeader);
    // Clicking the guidance switches to the leader tab (prefill happens on the leader's draft).
    expect(switchTabMock).toHaveBeenCalledWith('leader-slot');
    // It must not add a member.
    expect(addAssistantMock).not.toHaveBeenCalled();
  });
});
