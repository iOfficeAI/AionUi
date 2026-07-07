import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamAssistant } from '@/common/types/team/teamTypes';

vi.mock('@/renderer/pages/team/components/AgentStatusBadge', () => ({
  default: ({ testId }: { testId: string }) => <span data-testid={testId} />,
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: ({ assistant_name, nameTestId }: { assistant_name: string; nameTestId?: string }) => (
    <span data-testid={nameTestId}>{assistant_name}</span>
  ),
}));

vi.mock('@/renderer/pages/team/components/memberPicker/TeamAddMemberPopover', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import TeamTabs from '@/renderer/pages/team/components/TeamTabs';
import { TeamTabsProvider } from '@/renderer/pages/team/hooks/TeamTabsContext';

const renameAssistantMock = vi.fn();

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

const renderTabs = (membershipMutationBusy: boolean) =>
  render(
    <TeamTabsProvider
      assistants={assistants}
      statusMap={new Map()}
      defaultActiveSlotId='lead-slot'
      team_id='team-1'
      renameAssistant={renameAssistantMock}
      membershipMutationBusy={membershipMutationBusy}
    >
      <TeamTabs />
    </TeamTabsProvider>
  );

describe('TeamTabs', () => {
  beforeEach(() => {
    renameAssistantMock.mockReset();
    localStorage.clear();
  });

  it('does not allow tab rename while membership mutations are busy', () => {
    renderTabs(true);

    fireEvent.doubleClick(screen.getByTestId('team-tab-worker-slot'));

    expect(screen.queryByTestId('team-tab-edit-worker-slot')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Worker')).not.toBeInTheDocument();
    expect(renameAssistantMock).not.toHaveBeenCalled();
  });
});
