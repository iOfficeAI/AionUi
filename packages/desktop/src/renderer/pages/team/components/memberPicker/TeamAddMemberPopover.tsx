import React, { useEffect, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { useTeamAssistantOptions } from '../../hooks/useTeamAssistantOptions';
import { useTeamTabs } from '../../hooks/TeamTabsContext';
import type { TeamAssistantOption } from '../assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from '../teamCreateModelResolver';
import TeamAssistantPickerDropdown from './TeamAssistantPickerDropdown';

type Props = {
  children: React.ReactElement;
  disabled?: boolean;
};

const TeamAddMemberPopover: React.FC<Props> = ({ children, disabled = false }) => {
  const { t, i18n } = useTranslation();
  const { assistants } = useTeamAssistantOptions(i18n?.language ?? 'en-US');
  const { addAssistant, switchTab } = useTeamTabs();
  const [visible, setVisible] = useState(false);
  const [pendingAssistantId, setPendingAssistantId] = useState<string | undefined>();

  useEffect(() => {
    if (disabled) setVisible(false);
  }, [disabled]);

  const handleSelect = async (assistant: TeamAssistantOption) => {
    if (disabled || !addAssistant || pendingAssistantId) return;
    setPendingAssistantId(assistant.id);
    try {
      const model = await resolveDefaultTeamAgentModel({
        assistant_id: assistant.id,
        assistant_backend: assistant.backend,
      });
      const input: TeamAssistantInput = {
        role: 'teammate',
        assistant_name: assistant.name,
        assistant_id: assistant.id,
        model,
      };
      const created: TeamAssistant = await addAssistant(input);
      setVisible(false);
      switchTab(created.slot_id);
    } catch (error) {
      Message.error(getConversationCreateErrorMessage(error, t));
    } finally {
      setPendingAssistantId(undefined);
    }
  };

  return (
    <TeamAssistantPickerDropdown
      assistants={assistants}
      onSelect={handleSelect}
      visible={visible}
      onVisibleChange={setVisible}
      disabled={disabled || !addAssistant}
      pendingAssistantId={pendingAssistantId}
      testIdPrefix='team-add-member'
      panelTestId='team-add-member-panel'
      title={t('team.addMember.title', { defaultValue: 'Add member' })}
      subtitle={t('team.addMember.subtitle', { defaultValue: 'The same assistant can be added repeatedly' })}
    >
      {children}
    </TeamAssistantPickerDropdown>
  );
};

export default TeamAddMemberPopover;
