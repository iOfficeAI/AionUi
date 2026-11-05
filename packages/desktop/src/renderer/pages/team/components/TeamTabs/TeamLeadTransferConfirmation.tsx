import { Modal } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  leadTransferErrorMessageKey,
  LeadTransferInterruptRequiredError,
  type LeadTransferBusyMember,
} from '../../utils/confirmLeadTransfer';

type Props = {
  visible: boolean;
  currentLeadName: string;
  nextLeadName: string;
  onCancel: () => void;
  onConfirm: (interruptBusy: boolean, busyMembers?: LeadTransferBusyMember[]) => Promise<void>;
};

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
