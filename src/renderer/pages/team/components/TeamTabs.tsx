import { CloseSmall, Edit, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { iconColors } from '@/renderer/styles/colors';
import type { TeammateStatus } from '@/common/types/teamTypes';
import AddAgentModal from './AddAgentModal';
import AgentStatusBadge from './AgentStatusBadge';
import TeamAgentIdentity from './TeamAgentIdentity';
import { useTeamTabs } from '../hooks/TeamTabsContext';

const DRAG_OVER_CLASS = 'border-l-2 border-[color:var(--color-primary-6)]';

const TAB_OVERFLOW_THRESHOLD = 10;

type TeamTabViewProps = {
  slotId: string;
  agentName: string;
  agentType: string;
  isActive: boolean;
  status: TeammateStatus;
  isLead: boolean;
  onSwitch: (slotId: string) => void;
  onRename?: (slotId: string, newName: string) => void;
  onRemove?: (slotId: string) => void;
  onDragStart: (slotId: string) => void;
  onDragOver: (slotId: string) => void;
  onDrop: () => void;
  isDragOver: boolean;
};

const TeamTabView: React.FC<TeamTabViewProps> = ({
  slotId,
  agentName,
  agentType,
  isActive,
  status,
  isLead,
  onSwitch,
  onRename,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(agentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== agentName && onRename) {
      onRename(slotId, trimmed);
    } else {
      setEditValue(agentName);
    }
  }, [editValue, agentName, slotId, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename();
      } else if (e.key === 'Escape') {
        setEditValue(agentName);
        setEditing(false);
      }
    },
    [commitRename, agentName]
  );

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditValue(agentName);
      setEditing(true);
    },
    [agentName]
  );

  const isRunning = status === 'active';

  return (
    <div
      draggable={!isLead}
      className={`relative group flex items-center gap-8px px-12px h-full max-w-240px cursor-pointer transition-all duration-200 shrink-0 border-r border-[color:var(--border-base)] ${
        isActive
          ? 'bg-[color:var(--color-primary-1)] text-[color:var(--color-text-1)] border-t-2 border-t-solid border-t-[color:var(--color-primary-6)]'
          : 'bg-2 text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-2)] hover:bg-[color:var(--fill-2)] border-b border-[color:var(--border-base)]'
      } ${isDragOver ? DRAG_OVER_CLASS : ''}`}
      style={isRunning ? { animation: 'team-tab-breathe 2s ease-in-out infinite' } : undefined}
      onClick={() => !editing && onSwitch(slotId)}
      onDoubleClick={onRename ? startEditing : undefined}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(slotId);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(slotId);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={() => onDrop()}
    >
      {editing ? (
        <input
          ref={inputRef}
          className='text-15px flex-1 min-w-0 bg-transparent border-none outline-none text-[color:var(--color-text-1)] p-0'
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <TeamAgentIdentity
          agentName={agentName}
          agentType={agentType}
          isLead={isLead}
          className='min-w-0 flex-1'
          logoClassName={`w-14px h-14px object-contain rounded-2px ${isActive ? 'opacity-100' : 'opacity-70'}`}
          nameClassName='text-15px whitespace-nowrap overflow-hidden text-ellipsis select-none'
        />
      )}
      <AgentStatusBadge status={status} />
      {!editing && onRename && (
        <span
          className='opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity duration-150 shrink-0 flex items-center'
          onClick={startEditing}
        >
          <Edit theme='outline' size='12' fill='currentColor' />
        </span>
      )}
      {!editing && !isLead && onRemove && (
        <span
          className='opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity duration-150 shrink-0 flex items-center text-[color:var(--color-text-3)] hover:text-[color:var(--color-danger-6)]'
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slotId);
          }}
        >
          <CloseSmall theme='outline' size='14' fill='currentColor' />
        </span>
      )}
    </div>
  );
};

type AddAgentTriggerProps = {
  onAddAgent: (data: { agentName: string; agentKey: string }) => void;
  teamAgents?: {
    agentType: string;
    agentName: string;
    conversationId: string;
    role: 'lead' | 'participant' | 'assistant';
    status: string;
    conversationType: string;
    cliPath?: string;
    customAgentId?: string;
    createdAt?: number;
    updatedAt?: number;
  }[];
};

const AddAgentTrigger: React.FC<AddAgentTriggerProps> = ({ onAddAgent, teamAgents }) => {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <div
        className='flex items-center justify-center w-40px h-40px shrink-0 cursor-pointer hover:bg-[var(--fill-2)] transition-colors duration-200'
        style={{ borderLeft: '1px solid var(--border-base)' }}
        onClick={() => setModalVisible(true)}
      >
        <Plus theme='outline' size='16' fill={iconColors.primary} strokeWidth={3} />
      </div>
      <AddAgentModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={onAddAgent}
        teamAgents={teamAgents}
      />
    </>
  );
};

type TeamTabsProps = {
  onAddAgent: (data: { agentName: string; agentKey: string }) => void;
  onTabClick?: (slotId: string) => void;
};

/**
 * Tab bar for team mode showing agent tabs with status badges.
 * Supports scroll overflow with fade indicators and add-agent dropdown.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({ onAddAgent, onTabClick }) => {
  const { agents, activeSlotId, statusMap, switchTab, renameAgent, removeAgent, reorderAgents } = useTeamTabs();
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const dragSourceRef = useRef<string | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);

  const updateTabOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setShowLeftFade(hasOverflow && container.scrollLeft > TAB_OVERFLOW_THRESHOLD);
    setShowRightFade(
      hasOverflow && container.scrollLeft < container.scrollWidth - container.clientWidth - TAB_OVERFLOW_THRESHOLD
    );
  }, []);

  useEffect(() => {
    updateTabOverflow();
    window.addEventListener('resize', updateTabOverflow);
    return () => window.removeEventListener('resize', updateTabOverflow);
  }, [updateTabOverflow, agents]);

  const handleDragStart = useCallback((slotId: string) => {
    dragSourceRef.current = slotId;
    setDragOverSlotId(null);
  }, []);

  const handleDragOver = useCallback((slotId: string) => {
    if (dragSourceRef.current !== slotId) {
      setDragOverSlotId(slotId);
    }
  }, []);

  const handleDrop = useCallback(() => {
    const source = dragSourceRef.current;
    const target = dragOverSlotId;
    if (source && target && source !== target) {
      reorderAgents(source, target);
    }
    dragSourceRef.current = null;
    setDragOverSlotId(null);
    setTimeout(updateTabOverflow, 300);
  }, [dragOverSlotId, reorderAgents, updateTabOverflow]);

  useEffect(() => {
    if (activeSlotId) {
      onTabClick?.(activeSlotId);
    }
  }, [activeSlotId, onTabClick]);

  const handleScroll = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setShowLeftFade(hasOverflow && container.scrollLeft > TAB_OVERFLOW_THRESHOLD);
    setShowRightFade(
      hasOverflow && container.scrollLeft < container.scrollWidth - container.clientWidth - TAB_OVERFLOW_THRESHOLD
    );
  }, []);

  const isTeamMode = agents.length > 1;
  const hasAgent = agents.length > 0;

  return (
    <div className='flex items-center h-40px bg-[color:var(--fill-1)] border-b border-[color:var(--border-base)] overflow-visible'>
      {hasAgent && (
        <div
          ref={tabsContainerRef}
          onScroll={handleScroll}
          className='relative flex items-center h-full overflow-x-auto scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-[color:var(--border-base)] hover:scrollbar-thumb-[color:var(--border-2)] flex-1'
        >
          {showLeftFade && (
            <div
              className='absolute left-0 top-0 bottom-0 w-24px z-10 pointer-events-none bg-gradient-to-r from-[color:var(--fill-1)] to-transparent'
              style={{
                left: -8,
                width: 32,
              }}
            />
          )}
          {agents.map((agent, index) => {
            const isActive = agent.slotId === activeSlotId;
            return (
              <div
                key={agent.slotId}
                className={`h-full flex items-center ${index > 0 ? 'border-l border-[color:var(--border-base)]' : ''}`}
              >
                <TeamTabView
                  slotId={agent.slotId}
                  agentName={agent.agentName}
                  agentType={agent.agentType}
                  isActive={isActive}
                  status={statusMap.get(agent.slotId) || 'pending'}
                  isLead={agent.role === 'lead'}
                  onSwitch={switchTab}
                  onRename={renameAgent}
                  onRemove={removeAgent}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  isDragOver={dragOverSlotId === agent.slotId}
                />
              </div>
            );
          })}
          {showRightFade && (
            <div
              className='absolute right-0 top-0 bottom-0 w-24px z-10 pointer-events-none bg-gradient-to-l from-[color:var(--fill-1)] to-transparent'
              style={{
                right: -8,
                width: 32,
              }}
            />
          )}
        </div>
      )}
      {isTeamMode && <AddAgentTrigger onAddAgent={onAddAgent} teamAgents={agents} />}
    </div>
  );
};

export default TeamTabs;
