import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamAssistant } from '@/common/types/team/teamTypes';

vi.mock('@/renderer/pages/team/components/AgentStatusBadge', () => ({
  default: ({ testId }: { testId: string }) => <span data-testid={testId} />,
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: ({
    assistant_name,
    nameTestId,
    avatarOverlay,
  }: {
    assistant_name: string;
    nameTestId?: string;
    avatarOverlay?: React.ReactNode;
  }) => (
    <span data-testid={nameTestId}>
      {assistant_name}
      {avatarOverlay}
    </span>
  ),
}));

vi.mock('@/renderer/pages/team/components/memberPicker/TeamAddMemberPopover', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import TeamTabs from '@/renderer/pages/team/components/TeamTabs';
import { TeamTabsProvider } from '@/renderer/pages/team/hooks/TeamTabsContext';

const renameAssistantMock = vi.fn();
const removeAssistantMock = vi.fn();
const onTabClickMock = vi.fn();

const assistants: TeamAssistant[] = [
  {
    slot_id: 'lead-slot',
    conversation_id: 'lead-conv',
    role: 'leader',
    assistant_backend: 'claude',
    assistant_name: 'Lead',
    status: 'idle',
  },
  {
    slot_id: 'worker-slot',
    conversation_id: 'worker-conv',
    role: 'teammate',
    assistant_backend: 'claude',
    assistant_name: 'Worker',
    status: 'idle',
  },
];

const renderTabs = (
  warmingUp: boolean,
  overrides?: {
    pendingCounts?: Map<string, number>;
    failedSlotIds?: Set<string>;
    onTabClick?: (slot_id: string) => void;
  }
) =>
  render(
    <TeamTabsProvider
      assistants={assistants}
      statusMap={new Map()}
      defaultActiveSlotId='lead-slot'
      team_id='team-1'
      renameAssistant={renameAssistantMock}
      removeAssistant={removeAssistantMock}
    >
      <TeamTabs
        warmingUp={warmingUp}
        pendingCounts={overrides?.pendingCounts}
        failedSlotIds={overrides?.failedSlotIds}
        onTabClick={overrides?.onTabClick}
      />
    </TeamTabsProvider>
  );

describe('TeamTabs', () => {
  beforeEach(() => {
    renameAssistantMock.mockReset();
    removeAssistantMock.mockReset();
    onTabClickMock.mockReset();
    localStorage.clear();
  });

  it('does not allow tab rename while the team is still warming up', () => {
    renderTabs(true);

    fireEvent.doubleClick(screen.getByTestId('team-tab-worker-slot'));

    expect(screen.queryByTestId('team-tab-edit-worker-slot')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Worker')).not.toBeInTheDocument();
    expect(renameAssistantMock).not.toHaveBeenCalled();
  });

  it('allows member ops once warmup has ended (ready or failed)', () => {
    renderTabs(false);

    // hover reveals the rename affordance and double-click enters edit mode
    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.doubleClick(screen.getByTestId('team-tab-worker-slot'));

    expect(screen.getByDisplayValue('Worker')).toBeInTheDocument();
  });

  it('reveals a drag handle on teammate hover but never on the leader', () => {
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    expect(screen.getByTestId('team-tab-drag-worker-slot')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId('team-tab-lead-slot'));
    expect(screen.queryByTestId('team-tab-drag-lead-slot')).not.toBeInTheDocument();
  });

  it('does not switch tabs when the drag handle is clicked', () => {
    renderTabs(false);

    // Active tab starts as the leader
    expect(screen.getByTestId('team-tab-lead-slot')).toHaveAttribute('data-active', 'true');

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.click(screen.getByTestId('team-tab-drag-worker-slot'));

    expect(screen.getByTestId('team-tab-lead-slot')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('team-tab-worker-slot')).toHaveAttribute('data-active', 'false');
  });

  it('calls onTabClick when a tab is switched', () => {
    renderTabs(false, { onTabClick: onTabClickMock });

    fireEvent.click(screen.getByTestId('team-tab-worker-slot'));

    expect(onTabClickMock).toHaveBeenCalledWith('worker-slot');
  });

  it('renders a pending count badge on tabs with pending confirmations', () => {
    renderTabs(false, { pendingCounts: new Map([['worker-slot', 2]]) });

    const workerTab = screen.getByTestId('team-tab-worker-slot');
    expect(workerTab).toHaveTextContent('‼️');
  });

  it('renders a warmup failed indicator for failed slots', () => {
    renderTabs(false, { failedSlotIds: new Set(['worker-slot']) });

    expect(screen.getByTestId('team-tab-failed-worker-slot')).toBeInTheDocument();
  });

  it('returns null when there are no assistants', () => {
    render(
      <TeamTabsProvider assistants={[]} statusMap={new Map()} defaultActiveSlotId='lead-slot' team_id='team-1'>
        <TeamTabs warmingUp={false} />
      </TeamTabsProvider>
    );

    expect(screen.queryByTestId('team-tab-bar')).not.toBeInTheDocument();
  });

  it('commits a rename on blur', async () => {
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.doubleClick(screen.getByTestId('team-tab-worker-slot'));

    const input = screen.getByDisplayValue('Worker');
    fireEvent.change(input, { target: { value: 'Worker Renamed' } });
    fireEvent.blur(input);

    await waitFor(() => expect(renameAssistantMock).toHaveBeenCalledWith('worker-slot', 'Worker Renamed'));
  });

  it('cancels a rename on escape without calling renameAssistant', () => {
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.doubleClick(screen.getByTestId('team-tab-worker-slot'));

    const input = screen.getByDisplayValue('Worker');
    fireEvent.change(input, { target: { value: 'Ignored' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(renameAssistantMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('team-tab-name-worker-slot')).toHaveTextContent('Worker');
  });

  it('calls removeAssistant when the remove button is clicked', () => {
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.click(screen.getByTestId('team-tab-remove-worker-slot'));

    expect(removeAssistantMock).toHaveBeenCalledWith('worker-slot');
  });
});
