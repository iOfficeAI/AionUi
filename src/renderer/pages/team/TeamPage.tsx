import { Tabs, Button, Message } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TTeam, TeamAgentRuntime } from '@process/team/types';
import AgentTab from './components/AgentTab';
import TeamAgentPanel from './components/TeamAgentPanel';
import { useTeamSession } from './hooks/useTeamSession';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatWorkspace from '@/renderer/pages/conversation/Workspace';
import styles from './TeamPage.module.css';

type Props = {
  team: TTeam;
};

const IDLE_RUNTIME: Omit<TeamAgentRuntime, 'slotId'> = { status: 'idle' };

const TeamPage: React.FC<Props> = ({ team }) => {
  const { t } = useTranslation();
  const { runtimes, addAgent, sendMessage } = useTeamSession(team);
  const [activeSlotId, setActiveSlotId] = useState(team.agents[0]?.slotId ?? '');
  const [messageApi, messageContext] = Message.useMessage({ maxCount: 1 });

  const dispatchAgent = team.agents.find((a) => a.role === 'dispatch');
  const workspaceEnabled = Boolean(team.workspace);

  const siderTitle = useMemo(
    () => (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    ),
    [t]
  );

  const sider = useMemo(() => {
    if (!workspaceEnabled || !dispatchAgent?.conversationId) return <div />;
    return (
      <ChatWorkspace
        conversation_id={dispatchAgent.conversationId}
        workspace={team.workspace}
        eventPrefix='acp'
        messageApi={messageApi}
      />
    );
  }, [workspaceEnabled, dispatchAgent?.conversationId, team.workspace, messageApi]);

  return (
    <>
      {messageContext}
      <ChatLayout title={team.name} siderTitle={siderTitle} sider={sider} workspaceEnabled={workspaceEnabled}>
        <div className={styles.teamPage}>
          <Tabs
            activeTab={activeSlotId}
            onChange={setActiveSlotId}
            type='line'
            size='small'
            className={styles.tabs}
            extra={
              <Button
                type='text'
                size='small'
                icon={<Plus />}
                onClick={() => {
                  void addAgent({
                    conversationId: '',
                    role: 'sub',
                    agentType: 'acp',
                    agentName: t('team.newAgent'),
                  });
                }}
              >
                {t('team.addAgent')}
              </Button>
            }
          >
            {team.agents.map((agent) => {
              const runtime = runtimes.get(agent.slotId) ?? { slotId: agent.slotId, ...IDLE_RUNTIME };
              return (
                <Tabs.TabPane key={agent.slotId} title={<AgentTab agent={agent} runtime={runtime} />}>
                  <TeamAgentPanel
                    conversationId={agent.conversationId}
                    workspace={team.workspace}
                    isDispatch={agent.role === 'dispatch'}
                    status={runtime.status}
                    sendMessage={sendMessage}
                  />
                </Tabs.TabPane>
              );
            })}
          </Tabs>
        </div>
      </ChatLayout>
    </>
  );
};

export default TeamPage;
