import type { UseAdHocTeamFromConversationResult } from '@/renderer/pages/conversation/hooks/useAdHocTeamFromConversation';
import { Message } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CollaborationLauncher } from './CollaborationLauncher';
import { TeamStatusCard } from './TeamStatusCard';

export type AdHocTeamSectionProps = {
  conversationId: string;
  userId: string;
  isMobile: boolean;
  isReadOnly?: boolean;
  isTeamConversation: boolean;
  adHocTeam: UseAdHocTeamFromConversationResult;
};

/** Header controls for launching and observing an ad-hoc team from a conversation. */
export const AdHocTeamSection: React.FC<AdHocTeamSectionProps> = ({
  conversationId,
  userId,
  isMobile,
  isReadOnly = false,
  isTeamConversation,
  adHocTeam,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (isMobile || isReadOnly) return null;

  return (
    <>
      {!isTeamConversation && (
        <div className='shrink-0'>
          <CollaborationLauncher
            conversationId={conversationId}
            userId={userId}
            onCreated={(result) => {
              Message.success(
                t('conversation.collaboration.joinedSuccess', {
                  agentName:
                    result.target_assistant_name ??
                    t('conversation.collaboration.fallbackAgentName', { defaultValue: 'Agent' }),
                  defaultValue: '{{agentName}} joined the team',
                })
              );
            }}
            create={adHocTeam.create}
            isCreating={adHocTeam.isLoading}
          />
        </div>
      )}
      {adHocTeam.association?.team_id && (
        <div className='shrink-0'>
          <TeamStatusCard
            association={adHocTeam.association}
            team={adHocTeam.team}
            teammates={adHocTeam.teammates}
            lastTeammateMessage={adHocTeam.lastTeammateMessage}
            unreadTeammateMessageCount={adHocTeam.unreadTeammateMessageCount}
            isTeamRunning={adHocTeam.isTeamRunning}
            activeRun={adHocTeam.activeRun}
            slotWorkBySlot={adHocTeam.slotWorkBySlot}
            onNavigate={(teamId) => {
              void navigate(`/team/${teamId}`);
            }}
          />
        </div>
      )}
    </>
  );
};

AdHocTeamSection.displayName = 'AdHocTeamSection';
