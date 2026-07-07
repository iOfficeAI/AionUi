import React, { useEffect, useState } from 'react';
import { Message, Popover } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { useTeamAssistantOptions } from '../../hooks/useTeamAssistantOptions';
import { useTeamTabs } from '../../hooks/TeamTabsContext';
import type { TeamAssistantOption } from '../assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from '../teamCreateModelResolver';
import TeamAssistantPicker from './TeamAssistantPicker';

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
    <Popover
      trigger='click'
      position='br'
      style={{ padding: 0, maxWidth: 'none' }}
      popupVisible={visible}
      onVisibleChange={(nextVisible) => setVisible(disabled ? false : nextVisible)}
      content={
        <div className='w-300px overflow-hidden rounded-10px bg-dialog-fill-0' data-testid='team-add-member-panel'>
          <TeamAssistantPicker
            assistants={assistants}
            onSelect={handleSelect}
            disabled={disabled || !addAssistant}
            pendingAssistantId={pendingAssistantId}
            testIdPrefix='team-add-member'
            footer={t('team.addMember.footerHint', {
              defaultValue: 'Show all assistants. The same assistant can be added repeatedly as independent members.',
            })}
          />
        </div>
      }
    >
      {children}
    </Popover>
  );
};

export default TeamAddMemberPopover;
