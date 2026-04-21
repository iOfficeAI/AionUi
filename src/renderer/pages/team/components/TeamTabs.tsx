import { CloseSmall, Edit } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TeammateStatus } from '@/common/types/teamTypes';
import AgentStatusBadge from './AgentStatusBadge';
import TeamAgentIdentity from './TeamAgentIdentity';
import { useTeamTabs } from '../hooks/TeamTabsContext';

const DRAG_OVER_CLASS = 'border-l-2 border-[color:var(--color-primary-6)]';

const TAB_OVERFLOW_THRESHOLD = 10;

type TeamTabViewProps = {
  slotId: string;
  agentName: string;
  agentType: string;
  conversationId?: string;
  isActive: boolean;
  status: TeammateStatus;
  isLeader: boolean;
  /** Number of pending permission confirmations for this agent */
  pendingCount?: number;
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
  conversationId,
  isActive,
  status,
  isLeader,
  pendingCount = 0,
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
      draggable={!isLeader}
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
        <div className='min-w-0 flex-1 flex items-center gap-4px'>
          {pendingCount > 0 && (
            <span
              className='shrink-0 text-14px leading-none animate-wiggle'
              title={`${pendingCount} pending permission request(s)`}
            >
              ‼️
            </span>
          )}
          <TeamAgentIdentity
            agentName={agentName}
            agentType={agentType}
            conversationId={conversationId}
            isLeader={isLeader}
            className='min-w-0 flex-1'
            logoClassName={`w-14px h-14px object-contain rounded-2px ${isActive ? 'opacity-100' : 'opacity-70'}`}
            avatarClassName={`w-14px h-14px rounded-2px flex items-center justify-center text-11px leading-none bg-fill-2 shrink-0 ${isActive ? 'opacity-100' : 'opacity-80'}`}
            nameClassName='text-15px whitespace-nowrap overflow-hidden text-ellipsis select-none'
          />
        </div>
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
      {!editing && !isLeader && onRemove && (
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

type TeamTabsProps = {
  onTabClick?: (slotId: string) => void;
  /** Pending permission confirmation counts per slot ID */
  pendingCounts?: Map<string, number>;
};

/**
 * Tab bar for team mode showing agent tabs with status badges.
 * Supports scroll overflow with fade indicators and add-agent dropdown.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({ onTabClick, pendingCounts }) => {
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

  const handleDragStart = useCallback((slotId: string) => {
    dragSourceRef.current = slotId;
  }, []);

  const handleDragOver = useCallback((slotId: string) => {
    if (dragSourceRef.current && dragSourceRef.current !== slotId) {
      setDragOverSlotId(slotId);
    }
  }, []);

  const handleDrop = useCallback(() => {
    if (dragSourceRef.current && dragOverSlotId) {
      // Prevent dropping onto the leader's position (index 0)
      const targetIndex = agents.findIndex((a) => a.slotId === dragOverSlotId);
      if (targetIndex !== 0) {
        reorderAgents(dragSourceRef.current, dragOverSlotId);
      }
    }
    dragSourceRef.current = null;
    setDragOverSlotId(null);
  }, [dragOverSlotId, reorderAgents, agents]);

  if (agents.length === 0) return null;

  return (
    <div data-testid='team-tab-bar' className='relative shrink-0 bg-2 min-h-40px'>
      <div className='relative flex items-center h-40px w-full border-t border-x border-solid border-[color:var(--border-base)]'>
        <div
          ref={tabsContainerRef}
          className='flex items-center h-full flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
        >
          {agents.map((agent) => {
            const statusInfo = statusMap.get(agent.slotId);
            return (
              <TeamTabView
                key={agent.slotId}
                slotId={agent.slotId}
                agentName={agent.agentName}
                agentType={agent.agentType}
                conversationId={agent.conversationId}
                isActive={agent.slotId === activeSlotId}
                status={statusInfo?.status ?? agent.status}
                isLeader={agent.role === 'leader'}
                pendingCount={pendingCounts?.get(agent.slotId) ?? 0}
                onSwitch={(slotId) => {
                  switchTab(slotId);
                  onTabClick?.(slotId);
                }}
                onRename={renameAgent ? (sid, name) => void renameAgent(sid, name) : undefined}
                onRemove={removeAgent ? (sid) => void removeAgent(sid) : undefined}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragOver={dragOverSlotId === agent.slotId}
              />
            );
          })}
        </div>
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
