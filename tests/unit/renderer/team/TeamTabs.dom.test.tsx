import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  getLeadTransferBusyMembers,
  executeLeadTransferWithBusyRecovery,
  interruptAndRetryLeadTransfer,
  LeadTransferInterruptRequiredError,
  LeadTransferWaitError,
} from '@/renderer/pages/team/utils/confirmLeadTransfer';

const testTranslations = vi.hoisted(() => ({
  'team.leadTransfer.confirmTitle': 'Change team lead?',
  'team.leadTransfer.confirmButton': 'Change lead',
  'team.leadTransfer.confirmContent':
    'Make {{nextLead}} the team lead instead of {{currentLead}}? Existing conversations and team history will be kept.',
  'team.leadTransfer.makeLeadAction': 'Make team lead',
  'team.leadTransfer.settingsAction': 'Change team lead',
  'team.leadTransfer.menuItem': 'Make {{name}} the team lead',
  'team.leadTransfer.busy': 'A team member is still working. Wait for it to finish, then try again.',
  'team.leadTransfer.busyNotStarted':
    'A team member has work queued to start. Wait for it to start or finish before changing the team lead.',
  'team.leadTransfer.runtimeStarting': 'A team member is starting. Wait for it to finish starting, then try again.',
  'team.leadTransfer.failed': "Couldn't change the team lead. Please try again.",
  'team.leadTransfer.interruptConfirmTitle': 'Interrupt current work and change team lead?',
  'team.leadTransfer.interruptConfirmButton': 'Interrupt and change lead',
  'team.leadTransfer.interruptConfirmContent':
    'This will stop the active work for {{busyMembers}} and make {{nextLead}} team lead instead of {{currentLead}}. Existing conversations and team history will be kept.',
  'common.cancel': 'Cancel',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = testTranslations[key as keyof typeof testTranslations] ?? options?.defaultValue ?? key;
      return String(template).replace(/{{(\w+)}}/g, (_match, name: string) => String(options?.[name] ?? `{{${name}}}`));
    },
  }),
}));

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
import TeamLeadSettingsControl from '@/renderer/pages/team/components/TeamLeadSettingsControl';
import { TeamTabsProvider } from '@/renderer/pages/team/hooks/TeamTabsContext';

const renameAssistantMock = vi.fn();
const setLeadAssistantMock = vi.fn();

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

const renderTabs = (warmingUp: boolean) =>
  render(
    <TeamTabsProvider
      assistants={assistants}
      statusMap={new Map()}
      defaultActiveSlotId='lead-slot'
      team_id='team-1'
      renameAssistant={renameAssistantMock}
      setLeadAssistant={setLeadAssistantMock}
    >
      <TeamTabs warmingUp={warmingUp} />
    </TeamTabsProvider>
  );

describe('TeamTabs', () => {
  beforeEach(() => {
    renameAssistantMock.mockReset();
    setLeadAssistantMock.mockReset();
    setLeadAssistantMock.mockResolvedValue(undefined);
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

  it('shows a named confirmation before making a teammate the lead', async () => {
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.click(screen.getByRole('button', { name: 'Make team lead' }));

    expect(
      await screen.findByText(
        'Make Worker the team lead instead of Lead? Existing conversations and team history will be kept.'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change lead' }));

    await vi.waitFor(() => expect(setLeadAssistantMock).toHaveBeenCalledWith('worker-slot', false, undefined));
  });

  it('does not expose a make-lead action on the current lead tab', () => {
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-lead-slot'));

    expect(screen.queryByTestId('team-tab-make-lead-lead-slot')).not.toBeInTheDocument();
  });

  it('offers a named lead-transfer action from team settings', async () => {
    const onSetLead = vi.fn().mockResolvedValue(undefined);
    render(<TeamLeadSettingsControl assistants={assistants} onSetLead={onSetLead} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change team lead' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make Worker the team lead' }));

    expect(
      await screen.findByText(
        'Make Worker the team lead instead of Lead? Existing conversations and team history will be kept.'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change lead' }));
    await vi.waitFor(() => expect(onSetLead).toHaveBeenCalledWith('worker-slot', false, undefined));
  });

  it('asks before interrupting active work after a busy conflict', async () => {
    const busyMember = {
      slotId: 'worker-slot',
      conversationId: 'worker-conv',
      turnId: 'turn-worker',
      name: 'Worker',
    };
    setLeadAssistantMock
      .mockRejectedValueOnce(new LeadTransferInterruptRequiredError([busyMember]))
      .mockResolvedValueOnce(undefined);
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.click(screen.getByRole('button', { name: 'Make team lead' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change lead' }));

    expect(
      await screen.findByText(
        'This will stop the active work for Worker and make Worker team lead instead of Lead. Existing conversations and team history will be kept.'
      )
    ).toBeInTheDocument();
    expect(setLeadAssistantMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt and change lead' }));
    await vi.waitFor(() => expect(setLeadAssistantMock).toHaveBeenLastCalledWith('worker-slot', true, [busyMember]));
  });

  it('does not offer interruption for a runtime-starting conflict', async () => {
    setLeadAssistantMock.mockRejectedValueOnce(
      new BackendHttpError({
        method: 'POST',
        path: '/api/teams/team-1/lead',
        status: 409,
        body: { code: 'TEAM_MEMBER_RUNTIME_STARTING', error: 'Team member runtime is starting' },
      })
    );
    renderTabs(false);

    fireEvent.mouseEnter(screen.getByTestId('team-tab-worker-slot'));
    fireEvent.click(screen.getByRole('button', { name: 'Make team lead' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change lead' }));

    expect(
      await screen.findByText('A team member is starting. Wait for it to finish starting, then try again.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Interrupt and change lead' })).not.toBeInTheDocument();
    expect(setLeadAssistantMock).toHaveBeenCalledTimes(1);
  });

  it('interrupts only confirmed active entries and retries once', async () => {
    const member = {
      slotId: 'worker-slot',
      conversationId: 'worker-conv',
      turnId: 'turn-worker',
      name: 'Worker',
    };
    const stopConversation = vi.fn().mockResolvedValue(undefined);
    const retrySetLead = vi.fn().mockResolvedValue({ id: 'team-1' });

    await interruptAndRetryLeadTransfer([member], stopConversation, retrySetLead);

    expect(stopConversation).toHaveBeenCalledExactlyOnceWith({
      conversation_id: 'worker-conv',
      turn_id: 'turn-worker',
    });
    expect(retrySetLead).toHaveBeenCalledOnce();
  });

  it('does not interrupt or retry a claimed turn that has not started', async () => {
    const stopConversation = vi.fn().mockResolvedValue(undefined);
    const retrySetLead = vi.fn().mockResolvedValue({ id: 'team-1' });

    await expect(
      interruptAndRetryLeadTransfer(
        [{ slotId: 'worker-slot', conversationId: 'worker-conv', turnId: null, name: 'Worker' }],
        stopConversation,
        retrySetLead
      )
    ).rejects.toBeInstanceOf(LeadTransferWaitError);

    expect(stopConversation).not.toHaveBeenCalled();
    expect(retrySetLead).not.toHaveBeenCalled();
  });

  it('only accepts busy members for the current lead and selected target', () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/teams/team-1/lead',
      status: 409,
      body: {
        code: 'TEAM_LEAD_TRANSFER_BUSY',
        error: 'Team lead transfer is blocked by active work',
        details: {
          team_id: 'team-1',
          busy_members: [
            { slot_id: 'lead-slot', conversation_id: 'lead-conv', turn_id: 'turn-lead' },
            { slot_id: 'worker-slot', conversation_id: 'worker-conv', turn_id: null },
            { slot_id: 'other-slot', conversation_id: 'other-conv', turn_id: 'turn-other' },
            { slot_id: 'worker-slot', conversation_id: 'wrong-conv', turn_id: 'turn-wrong' },
          ],
        },
      },
    });

    expect(
      getLeadTransferBusyMembers(
        error,
        'team-1',
        new Map([
          ['lead-slot', { conversationId: 'lead-conv', name: 'Lead' }],
          ['worker-slot', { conversationId: 'worker-conv', name: 'Worker' }],
        ])
      )
    ).toEqual([
      { slotId: 'lead-slot', conversationId: 'lead-conv', turnId: 'turn-lead', name: 'Lead' },
      { slotId: 'worker-slot', conversationId: 'worker-conv', turnId: null, name: 'Worker' },
    ]);
  });

  it('waits for busy confirmation, stops only confirmed active lead or target turns, then retries once', async () => {
    const busyError = new BackendHttpError({
      method: 'POST',
      path: '/api/teams/team-1/lead',
      status: 409,
      body: {
        code: 'TEAM_LEAD_TRANSFER_BUSY',
        error: 'Team lead transfer is blocked by active work',
        details: {
          team_id: 'team-1',
          busy_members: [
            { slot_id: 'lead-slot', conversation_id: 'lead-conv', turn_id: 'turn-lead' },
            { slot_id: 'worker-slot', conversation_id: 'worker-conv', turn_id: null },
            { slot_id: 'other-slot', conversation_id: 'other-conv', turn_id: 'turn-other' },
          ],
        },
      },
    });
    const allowedSlots = new Map([
      ['lead-slot', { conversationId: 'lead-conv', name: 'Lead' }],
      ['worker-slot', { conversationId: 'worker-conv', name: 'Worker' }],
    ]);
    const requestSetLead = vi.fn().mockRejectedValueOnce(busyError).mockResolvedValueOnce({ id: 'team-1' });
    const stopConversation = vi.fn().mockResolvedValue(undefined);
    let confirmation: LeadTransferInterruptRequiredError | undefined;

    try {
      await executeLeadTransferWithBusyRecovery({
        teamId: 'team-1',
        allowedSlots,
        interruptBusy: false,
        requestSetLead,
        stopConversation,
      });
    } catch (error) {
      if (error instanceof LeadTransferInterruptRequiredError) confirmation = error;
      else throw error;
    }

    expect(confirmation?.busyMembers).toEqual([
      { slotId: 'lead-slot', conversationId: 'lead-conv', turnId: 'turn-lead', name: 'Lead' },
    ]);
    expect(stopConversation).not.toHaveBeenCalled();
    expect(requestSetLead).toHaveBeenCalledTimes(1);

    await executeLeadTransferWithBusyRecovery({
      teamId: 'team-1',
      allowedSlots,
      interruptBusy: true,
      confirmedBusyMembers: confirmation?.busyMembers,
      requestSetLead,
      stopConversation,
    });

    expect(stopConversation).toHaveBeenCalledExactlyOnceWith({
      conversation_id: 'lead-conv',
      turn_id: 'turn-lead',
    });
    expect(requestSetLead).toHaveBeenCalledTimes(2);
  });
});
