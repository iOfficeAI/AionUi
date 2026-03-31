import { Dropdown, Menu } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@/renderer/pages/guid/constants';
import { iconColors } from '@/renderer/styles/colors';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import AgentStatusBadge from './AgentStatusBadge';
import { useTeamTabs } from '../hooks/TeamTabsContext';

const TAB_OVERFLOW_THRESHOLD = 10;

type TeamTabViewProps = {
  slotId: string;
  agentName: string;
  isActive: boolean;
  status: 'idle' | 'working' | 'done' | 'error';
  isDispatch: boolean;
  onSwitch: (slotId: string) => void;
};

const TeamTabView: React.FC<TeamTabViewProps> = ({ slotId, agentName, isActive, status, isDispatch, onSwitch }) => {
  return (
    <div
      className={`flex items-center gap-8px px-12px h-full max-w-240px cursor-pointer transition-all duration-200 shrink-0 border-r border-[color:var(--border-base)] ${
        isActive
          ? 'bg-1 text-[color:var(--color-text-1)] font-medium'
          : 'bg-2 text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-2)] border-b border-[color:var(--border-base)]'
      }`}
      onClick={() => onSwitch(slotId)}
    >
      <AgentStatusBadge status={status} />
      <span className='text-15px whitespace-nowrap overflow-hidden text-ellipsis select-none flex-1'>{agentName}</span>
      {isDispatch && <span className='text-xs text-[color:var(--color-text-4)]'>&#9656;</span>}
    </div>
  );
};

type AddAgentTriggerProps = {
  onAddAgent: (agent: AvailableAgent) => void;
};

const AddAgentTrigger: React.FC<AddAgentTriggerProps> = ({ onAddAgent }) => {
  const { t } = useTranslation();
  const { cliAgents, presetAssistants } = useConversationAgents();

  const menu = (
    <Menu
      onClickMenuItem={(key) => {
        const allAgents = [...cliAgents, ...presetAssistants];
        const agent = allAgents.find((a) =>
          a.customAgentId ? `preset:${a.customAgentId}` === key : `cli:${a.backend}` === key
        );
        if (agent) onAddAgent(agent);
      }}
    >
      {cliAgents.length > 0 && (
        <Menu.ItemGroup title={t('conversation.dropdown.cliAgents')}>
          {cliAgents.map((agent) => (
            <Menu.Item key={`cli:${agent.backend}`}>
              <div className='flex items-center gap-8px'>
                <img src={getAgentLogo(agent.backend)} alt={agent.name} className='w-16px h-16px object-contain' />
                <span>{agent.name}</span>
              </div>
            </Menu.Item>
          ))}
        </Menu.ItemGroup>
      )}
      {presetAssistants.length > 0 && (
        <Menu.ItemGroup title={t('conversation.dropdown.presetAssistants')}>
          {presetAssistants.map((agent) => {
            const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
            const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');
            return (
              <Menu.Item key={`preset:${agent.customAgentId}`}>
                <div className='flex items-center gap-8px'>
                  {avatarImage ? (
                    <img src={avatarImage} alt={agent.name} className='w-16px h-16px object-contain' />
                  ) : isEmoji ? (
                    <span className='text-14px leading-16px'>{agent.avatar}</span>
                  ) : (
                    <img src={getAgentLogo(agent.backend)} alt={agent.name} className='w-16px h-16px object-contain' />
                  )}
                  <span>{agent.name}</span>
                </div>
              </Menu.Item>
            );
          })}
        </Menu.ItemGroup>
      )}
    </Menu>
  );

  return (
    <Dropdown droplist={menu} trigger='click' position='bl'>
      <div
        className='flex items-center justify-center w-40px h-40px shrink-0 cursor-pointer hover:bg-[var(--fill-2)] transition-colors duration-200'
        style={{ borderLeft: '1px solid var(--border-base)' }}
      >
        <Plus theme='outline' size='16' fill={iconColors.primary} strokeWidth={3} />
      </div>
    </Dropdown>
  );
};

type TeamTabsProps = {
  onAddAgent: (agent: AvailableAgent) => void;
};

/**
 * Tab bar for team mode showing agent tabs with status badges.
 * Supports scroll overflow with fade indicators and add-agent dropdown.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({ onAddAgent }) => {
  const { agents, activeSlotId, runtimes, switchTab } = useTeamTabs();
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateTabOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setShowLeftFade(hasOverflow && container.scrollLeft > TAB_OVERFLOW_THRESHOLD);
    setShowRightFade(
      hasOverflow && container.scrollLeft + container.clientWidth < container.scrollWidth - TAB_OVERFLOW_THRESHOLD
    );
  }, []);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateTabOverflow, { passive: true });
    window.addEventListener('resize', updateTabOverflow);
    const observer = new ResizeObserver(updateTabOverflow);
    observer.observe(container);
    updateTabOverflow();
    return () => {
      container.removeEventListener('scroll', updateTabOverflow);
      window.removeEventListener('resize', updateTabOverflow);
      observer.disconnect();
    };
  }, [updateTabOverflow]);

  if (agents.length === 0) return null;

  return (
    <div className='relative shrink-0 bg-2 min-h-40px'>
      <div className='relative flex items-center h-40px w-full border-t border-x border-solid border-[color:var(--border-base)]'>
        <div
          ref={tabsContainerRef}
          className='flex items-center h-full flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
        >
          {agents.map((agent) => {
            const runtime = runtimes.get(agent.slotId);
            return (
              <TeamTabView
                key={agent.slotId}
                slotId={agent.slotId}
                agentName={agent.agentName}
                isActive={agent.slotId === activeSlotId}
                status={runtime?.status ?? 'idle'}
                isDispatch={agent.role === 'dispatch'}
                onSwitch={switchTab}
              />
            );
          })}
        </div>
        <AddAgentTrigger onAddAgent={onAddAgent} />
        {showLeftFade && (
          <div
            className='pointer-events-none absolute left-0 top-0 bottom-0 w-32px z-10'
            style={{ background: 'linear-gradient(90deg, var(--color-bg-2), transparent)' }}
          />
        )}
        {showRightFade && (
          <div
            className='pointer-events-none absolute top-0 bottom-0 w-32px z-10'
            style={{ right: '40px', background: 'linear-gradient(270deg, var(--color-bg-2), transparent)' }}
          />
        )}
      </div>
    </div>
  );
};

export default TeamTabs;
