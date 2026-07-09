import React, { useCallback, useEffect, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { getSendBoxDraftHook } from '@renderer/hooks/chat/useSendBoxDraft';
import { useTeamAssistantOptions } from '../../hooks/useTeamAssistantOptions';
import { useTeamTabs } from '../../hooks/TeamTabsContext';
import type { TeamAssistantOption } from '../assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from '../teamCreateModelResolver';
import TeamAssistantPickerDropdown from './TeamAssistantPickerDropdown';

const useAcpDraft = getSendBoxDraftHook('acp', { _type: 'acp', atPath: [], content: '', uploadFile: [] });
const useAionrsDraft = getSendBoxDraftHook('aionrs', { _type: 'aionrs', atPath: [], content: '', uploadFile: [] });

type Props = {
  children: React.ReactElement;
  disabled?: boolean;
};

const TeamAddMemberPopover: React.FC<Props> = ({ children, disabled = false }) => {
  const { t, i18n } = useTranslation();
  const { assistants } = useTeamAssistantOptions(i18n?.language ?? 'en-US');
  const { addAssistant, switchTab, assistants: teamMembers = [] } = useTeamTabs();
  const [visible, setVisible] = useState(false);
  const [pendingAssistantId, setPendingAssistantId] = useState<string | undefined>();

  // Leader 会话草稿：用于「告诉 Leader」预填提示词。Hook 必须无条件调用，
  // 未知 Leader 会话时传空串（不写入）。按 Leader 后端选 acp/aionrs 草稿。
  const leader = teamMembers.find((m) => m.role === 'leader');
  const leaderConversationId = leader?.conversation_id ?? '';
  const acpDraft = useAcpDraft(leaderConversationId);
  const aionrsDraft = useAionrsDraft(leaderConversationId);

  useEffect(() => {
    if (disabled) setVisible(false);
  }, [disabled]);

  const handleTellLeader = useCallback(() => {
    if (!leader?.slot_id || !leaderConversationId) return;
    switchTab(leader.slot_id);
    const text = t('team.addMember.tellLeaderPrefill', {
      defaultValue: 'Help me add a member good at ___ to the team',
    });
    if (leader.assistant_backend === 'aionrs') {
      aionrsDraft.mutate((prev) => ({ ...prev, content: text }));
    } else {
      acpDraft.mutate((prev) => ({ ...prev, content: text }));
    }
    setVisible(false);
  }, [leader?.slot_id, leader?.assistant_backend, leaderConversationId, switchTab, t, acpDraft, aionrsDraft]);

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
      guidanceFooter={
        leader?.slot_id ? (
          <div className='text-12px leading-18px text-t-tertiary'>
            {t('team.addMember.tellLeaderHint', {
              defaultValue: 'Not a good fit? You can also ask the Leader to arrange it.',
            })}{' '}
            <span
              data-testid='team-add-member-tell-leader'
              className='text-[color:var(--brand)] font-500 cursor-pointer hover:underline'
              onClick={handleTellLeader}
            >
              {t('team.addMember.tellLeaderCta', { defaultValue: 'Tell the Leader →' })}
            </span>
          </div>
        ) : undefined
      }
    >
      {children}
    </TeamAssistantPickerDropdown>
  );
};

export default TeamAddMemberPopover;
