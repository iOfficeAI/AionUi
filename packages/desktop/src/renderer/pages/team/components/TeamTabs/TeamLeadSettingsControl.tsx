import { Button, Dropdown, Menu } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import type { LeadTransferBusyMember } from '../../utils/confirmLeadTransfer';
import TeamLeadTransferConfirmation from './TeamLeadTransferConfirmation';

type Props = {
  assistants: TeamAssistant[];
  disabled?: boolean;
  onSetLead: (slot_id: string, interruptBusy?: boolean, busyMembers?: LeadTransferBusyMember[]) => Promise<void>;
};

const TeamLeadSettingsControl: React.FC<Props> = ({ assistants, disabled = false, onSetLead }) => {
  const { t } = useTranslation();
  const currentLead = assistants.find((assistant) => assistant.role === 'leader');
  const teammates = assistants.filter((assistant) => assistant.role !== 'leader');
  const [pendingLeadTransfer, setPendingLeadTransfer] = useState<{
    slotId: string;
    currentLeadName: string;
    nextLeadName: string;
  } | null>(null);

  const menu = useMemo(
    () => (
      <Menu
        onClickMenuItem={(key) => {
          const nextLead = teammates.find((assistant) => assistant.slot_id === String(key));
          if (!currentLead || !nextLead || disabled) return;
          setPendingLeadTransfer({
            slotId: nextLead.slot_id,
            currentLeadName: currentLead.assistant_name,
            nextLeadName: nextLead.assistant_name,
          });
        }}
      >
        {teammates.map((assistant) => (
          <Menu.Item key={assistant.slot_id} disabled={disabled}>
            {t('team.leadTransfer.menuItem', {
              name: assistant.assistant_name,
              defaultValue: 'Make {{name}} the team lead',
            })}
          </Menu.Item>
        ))}
      </Menu>
    ),
    [currentLead, disabled, setPendingLeadTransfer, t, teammates]
  );

  if (!currentLead || teammates.length === 0) return null;

  return (
    <>
      <Dropdown trigger='click' droplist={menu} position='br' disabled={disabled}>
        <Button
          type='text'
          size='small'
          disabled={disabled}
          aria-label={t('team.leadTransfer.settingsAction', { defaultValue: 'Change team lead' })}
          data-testid='team-lead-settings-entry'
        >
          {t('team.leadTransfer.settingsAction', { defaultValue: 'Change team lead' })}
        </Button>
      </Dropdown>
      {pendingLeadTransfer && (
        <TeamLeadTransferConfirmation
          visible
          currentLeadName={pendingLeadTransfer.currentLeadName}
          nextLeadName={pendingLeadTransfer.nextLeadName}
          onCancel={() => setPendingLeadTransfer(null)}
          onConfirm={(interruptBusy, busyMembers) => onSetLead(pendingLeadTransfer.slotId, interruptBusy, busyMembers)}
        />
      )}
    </>
  );
};

export default TeamLeadSettingsControl;
