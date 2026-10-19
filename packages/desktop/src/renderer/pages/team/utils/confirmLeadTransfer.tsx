import { Modal } from '@arco-design/web-react';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  visible: boolean;
  currentLeadName: string;
  nextLeadName: string;
  onCancel: () => void;
  onConfirm: (interruptBusy: boolean, busyMembers?: LeadTransferBusyMember[]) => Promise<void>;
};

export class LeadTransferInterruptRequiredError extends Error {
  constructor(readonly busyMembers: LeadTransferBusyMember[]) {
    super('Lead transfer requires confirmation to interrupt active work');
    this.name = 'LeadTransferInterruptRequiredError';
  }
}

export class LeadTransferWaitError extends Error {
  constructor() {
    super('A team member has claimed work that has not started yet');
    this.name = 'LeadTransferWaitError';
  }
}

export type LeadTransferBusyMember = {
  slotId: string;
  conversationId: string;
  turnId: string | null;
  name: string;
};

export async function interruptAndRetryLeadTransfer<TResult>(
  busyMembers: LeadTransferBusyMember[],
  stopConversation: (params: { conversation_id: string; turn_id: string }) => Promise<unknown>,
  retrySetLead: () => Promise<TResult>
): Promise<TResult> {
  const activeMembers = selectActiveBusyMembers(busyMembers);
  if (activeMembers.length === 0) throw new LeadTransferWaitError();

  await Promise.all(
    activeMembers.map((member) => stopConversation({ conversation_id: member.conversationId, turn_id: member.turnId }))
  );
  return retrySetLead();
}

export function getLeadTransferBusyMembers(
  error: unknown,
  teamId: string,
  allowedSlots: Map<string, { conversationId: string; name: string }>
): LeadTransferBusyMember[] | null {
  if (!isBackendHttpError(error) || error.status !== 409 || error.code !== 'TEAM_LEAD_TRANSFER_BUSY') return null;
  if (!error.details || typeof error.details !== 'object') return [];

  const details = error.details as { team_id?: unknown; busy_members?: unknown };
  if (details.team_id !== teamId || !Array.isArray(details.busy_members)) return [];

  return details.busy_members.flatMap((rawMember): LeadTransferBusyMember[] => {
    if (!rawMember || typeof rawMember !== 'object') return [];
    const member = rawMember as { slot_id?: unknown; conversation_id?: unknown; turn_id?: unknown };
    if (typeof member.slot_id !== 'string' || typeof member.conversation_id !== 'string') return [];
    if (member.turn_id !== null && (typeof member.turn_id !== 'string' || member.turn_id.length === 0)) return [];

    const expected = allowedSlots.get(member.slot_id);
    if (!expected || expected.conversationId !== member.conversation_id) return [];
    return [
      {
        slotId: member.slot_id,
        conversationId: member.conversation_id,
        turnId: member.turn_id as string | null,
        name: expected.name,
      },
    ];
  });
}

function selectActiveBusyMembers(busyMembers: LeadTransferBusyMember[]): LeadTransferBusyMember[] {
  return [
    ...new Map(
      busyMembers
        .filter((member): member is LeadTransferBusyMember & { turnId: string } => typeof member.turnId === 'string')
        .map((member) => [member.slotId, member])
    ).values(),
  ];
}

export async function executeLeadTransferWithBusyRecovery<TResult>(params: {
  teamId: string;
  allowedSlots: Map<string, { conversationId: string; name: string }>;
  interruptBusy: boolean;
  confirmedBusyMembers?: LeadTransferBusyMember[];
  requestSetLead: () => Promise<TResult>;
  stopConversation: (params: { conversation_id: string; turn_id: string }) => Promise<unknown>;
}): Promise<TResult> {
  const { teamId, allowedSlots, interruptBusy, confirmedBusyMembers, requestSetLead, stopConversation } = params;
  if (interruptBusy) {
    const allowedMembers = (confirmedBusyMembers ?? []).filter(
      (member) => allowedSlots.get(member.slotId)?.conversationId === member.conversationId
    );
    return interruptAndRetryLeadTransfer(selectActiveBusyMembers(allowedMembers), stopConversation, requestSetLead);
  }

  try {
    return await requestSetLead();
  } catch (error) {
    const busyMembers = getLeadTransferBusyMembers(error, teamId, allowedSlots);
    if (!busyMembers || busyMembers.length === 0) throw error;

    const activeMembers = selectActiveBusyMembers(busyMembers);
    if (activeMembers.length === 0) throw new LeadTransferWaitError();
    throw new LeadTransferInterruptRequiredError(activeMembers);
  }
}

export function leadTransferErrorMessageKey(error: unknown): string {
  if (error instanceof LeadTransferWaitError) return 'team.leadTransfer.busyNotStarted';
  if (!isBackendHttpError(error) || error.status !== 409) return 'team.leadTransfer.failed';
  if (error.code === 'TEAM_MEMBER_RUNTIME_STARTING') return 'team.leadTransfer.runtimeStarting';
  if (error.code === 'TEAM_MEMBER_BUSY' || error.code === 'TEAM_LEAD_TRANSFER_BUSY') return 'team.leadTransfer.busy';
  return 'team.leadTransfer.failed';
}

const TeamLeadTransferConfirmation: React.FC<Props> = ({
  visible,
  currentLeadName,
  nextLeadName,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [interruptMembers, setInterruptMembers] = useState<LeadTransferBusyMember[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isInterruptStep = interruptMembers !== null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(isInterruptStep, interruptMembers ?? undefined);
      onCancel();
    } catch (error) {
      if (error instanceof LeadTransferInterruptRequiredError) {
        setInterruptMembers(error.busyMembers);
        return;
      }
      const errorMessageKey = leadTransferErrorMessageKey(error);
      const defaultValue =
        errorMessageKey === 'team.leadTransfer.busyNotStarted'
          ? 'A team member has work queued to start. Wait for it to start or finish before changing the team lead.'
          : errorMessageKey === 'team.leadTransfer.runtimeStarting'
            ? 'A team member is starting. Wait for it to finish starting, then try again.'
            : errorMessageKey === 'team.leadTransfer.busy'
              ? 'A team member is still working. Wait for it to finish, then try again.'
              : "Couldn't change the team lead. Please try again.";
      setErrorMessage(t(errorMessageKey, { defaultValue }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={
        isInterruptStep
          ? t('team.leadTransfer.interruptConfirmTitle', {
              defaultValue: 'Interrupt current work and change team lead?',
            })
          : t('team.leadTransfer.confirmTitle', { defaultValue: 'Change team lead?' })
      }
      okText={
        isInterruptStep
          ? t('team.leadTransfer.interruptConfirmButton', { defaultValue: 'Interrupt and change lead' })
          : t('team.leadTransfer.confirmButton', { defaultValue: 'Change lead' })
      }
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      confirmLoading={submitting}
      onOk={handleConfirm}
      onCancel={onCancel}
      unmountOnExit
    >
      <div>
        {isInterruptStep
          ? t('team.leadTransfer.interruptConfirmContent', {
              currentLead: currentLeadName,
              nextLead: nextLeadName,
              busyMembers: interruptMembers.map((member) => member.name).join(', '),
              defaultValue:
                'This will stop the active work for {{busyMembers}} and make {{nextLead}} team lead instead of {{currentLead}}. Existing conversations and team history will be kept.',
            })
          : t('team.leadTransfer.confirmContent', {
              currentLead: currentLeadName,
              nextLead: nextLeadName,
              defaultValue:
                'Make {{nextLead}} the team lead instead of {{currentLead}}? Existing conversations and team history will be kept.',
            })}
        {errorMessage && (
          <div role='alert' className='mt-12px text-13px text-[color:var(--color-danger-6)]'>
            {errorMessage}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TeamLeadTransferConfirmation;
