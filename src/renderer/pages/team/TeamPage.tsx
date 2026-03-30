import { Tabs, Button } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TTeam, TeamAgentRuntime } from '@process/team/types';
import AgentTab from './components/AgentTab';
import { useTeamSession } from './hooks/useTeamSession';
import styles from './TeamPage.module.css';

type Props = {
  team: TTeam;
};

const IDLE_RUNTIME: Omit<TeamAgentRuntime, 'slotId'> = { status: 'idle' };

const TeamPage: React.FC<Props> = ({ team }) => {
  const { t } = useTranslation();
  const { runtimes, messages, addAgent } = useTeamSession(team);
  const [activeSlotId, setActiveSlotId] = useState(team.agents[0]?.slotId ?? '');

  return (
    <div className={styles.teamPage}>
      <Tabs
        activeTab={activeSlotId}
        onChange={setActiveSlotId}
        type='line'
        size='small'
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
                agentName: t('team.newAgent', { defaultValue: 'New Agent' }),
              });
            }}
          >
            {t('team.addAgent', { defaultValue: 'Add Member' })}
          </Button>
        }
      >
        {team.agents.map((agent) => {
          const runtime = runtimes.get(agent.slotId) ?? { slotId: agent.slotId, ...IDLE_RUNTIME };
          const agentMessages = messages.get(agent.slotId) ?? [];

          return (
            <Tabs.TabPane key={agent.slotId} title={<AgentTab agent={agent} runtime={runtime} />}>
              <div className='p-4 flex flex-col gap-2 text-[var(--color-text-2)]'>
                {agentMessages.length === 0 ? (
                  <span className='text-[var(--color-text-3)] text-sm'>
                    {t('team.noMessages', { defaultValue: 'No messages yet.' })}
                  </span>
                ) : (
                  agentMessages.map((msg) => (
                    <div key={msg.msg_id} className='text-sm break-all'>
                      {String(msg.data)}
                    </div>
                  ))
                )}
              </div>
            </Tabs.TabPane>
          );
        })}
      </Tabs>
    </div>
  );
};

export default TeamPage;
