import { CloseSmall, Edit } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TeammateStatus } from '@/common/types/team/teamTypes';
import AgentStatusBadge from './AgentStatusBadge';
import TeamAgentIdentity from './TeamAgentIdentity';
import { useTeamTabs } from '../hooks/TeamTabsContext';

const DRAG_OVER_CLASS = 'border-l-2 border-[color:var(--color-primary-6)]';

const TAB_OVERFLOW_THRESHOLD = 10;

type TeamTabViewProps = {
  slot_id: string;
  assistant_name: string;
  assistant_backend: string;
  icon?: string;
  conversation_id?: string;
  isActive: boolean;
  status: TeammateStatus;
  isLeader: boolean;
  /** Number of pending permission confirmations for this agent */
  pendingCount?: number;
  onSwitch: (slot_id: string) => void;
  onRename?: (slot_id: string, new_name: string) => void;
  onRemove?: (slot_id: string) => void;
  onDragStart: (slot_id: string) => void;
  onDragOver: (slot_id: string) => void;
  onDrop: () => void;
  isDragOver: boolean;
};

const TeamTabView: React.FC<TeamTabViewProps> = ({
  slot_id,
  assistant_name,
  assistant_backend,
  icon,
  conversation_id,
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
  const [editValue, setEditValue] = useState(assistant_name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const nextValue = inputRef.current?.value ?? editValue;
    const trimmed = nextValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== assistant_name && onRename) {
      setEditValue(trimmed);
      onRename(slot_id, trimmed);
    } else {
      setEditValue(assistant_name);
    }
  }, [editValue, assistant_name, slot_id, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename();
      } else if (e.key === 'Escape') {
        setEditValue(assistant_name);
        setEditing(false);
      }
    },
    [commitRename, assistant_name]
  );

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditValue(assistant_name);
      setEditing(true);
    },
    [assistant_name]
  );

  const isRunning = status === 'active';

  return (
    <div
      data-testid={`team-tab-${slot_id}`}
      data-team-tab-role={isLeader ? 'leader' : 'teammate'}
      draggable={!isLeader}
      className={`relative group flex items-center gap-8px px-12px h-full max-w-240px cursor-pointer transition-all duration-200 shrink-0 border-r border-[color:var(--border-base)] ${
        isActive
          ? 'bg-[color:var(--color-primary-1)] text-[color:var(--color-text-1)] border-t-2 border-t-solid border-t-[color:var(--color-primary-6)]'
          : 'bg-2 text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-2)] hover:bg-[color:var(--fill-2)] border-b border-[color:var(--border-base)]'
      } ${isDragOver ? DRAG_OVER_CLASS : ''}`}
      style={isRunning ? { animation: 'team-tab-breathe 2s ease-in-out infinite' } : undefined}
      onClick={() => !editing && onSwitch(slot_id)}
      onDoubleClick={onRename ? startEditing : undefined}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(slot_id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(slot_id);
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
            assistant_name={assistant_name}
            assistant_backend={assistant_backend}
            icon={icon}
            conversation_id={conversation_id}
            isLeader={isLeader}
            className='min-w-0 flex-1'
            logoClassName={`w-14px h-14px object-contain rounded-2px ${isActive ? 'opacity-100' : 'opacity-70'}`}
            avatarClassName={`w-14px h-14px rounded-2px flex items-center justify-center text-11px leading-none bg-fill-2 shrink-0 ${isActive ? 'opacity-100' : 'opacity-80'}`}
            nameClassName='text-15px whitespace-nowrap overflow-hidden text-ellipsis select-none'
            nameTestId={`team-tab-name-${slot_id}`}
          />
        </div>
      )}
      <AgentStatusBadge status={status} testId={`team-tab-status-${slot_id}`} />
      {!editing && onRename && (
        <span
          data-testid={`team-tab-edit-${slot_id}`}
          className='opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity duration-150 shrink-0 flex items-center'
          onClick={startEditing}
        >
          <Edit theme='outline' size='12' fill='currentColor' />
        </span>
      )}
      {!editing && !isLeader && onRemove && (
        <span
          data-testid={`team-tab-remove-${slot_id}`}
          className='opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity duration-150 shrink-0 flex items-center text-[color:var(--color-text-3)] hover:text-[color:var(--color-danger-6)]'
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slot_id);
          }}
        >
          <CloseSmall theme='outline' size='14' fill='currentColor' />
        </span>
      )}
    </div>
  );
};

type TeamTabsProps = {
  onTabClick?: (slot_id: string) => void;
  /** Pending permission confirmation counts per assistant slot ID */
  pendingCounts?: Map<string, number>;
};

/**
 * Tab bar for team mode showing assistant tabs with status badges.
 * Supports scroll overflow with fade indicators.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({ onTabClick, pendingCounts }) => {
  const { assistants, activeSlotId, statusMap, switchTab, renameAssistant, removeAssistant, reorderAssistants } =
    useTeamTabs();
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

  const handleDragStart = useCallback((slot_id: string) => {
    dragSourceRef.current = slot_id;
  }, []);

  const handleDragOver = useCallback((slot_id: string) => {
    if (dragSourceRef.current && dragSourceRef.current !== slot_id) {
      setDragOverSlotId(slot_id);
    }
  }, []);

  const handleDrop = useCallback(() => {
    if (dragSourceRef.current && dragOverSlotId) {
      // Prevent dropping onto the leader's position (index 0)
      const targetIndex = assistants.findIndex((assistant) => assistant.slot_id === dragOverSlotId);
      if (targetIndex !== 0) {
        reorderAssistants(dragSourceRef.current, dragOverSlotId);
      }
    }
    dragSourceRef.current = null;
    setDragOverSlotId(null);
  }, [dragOverSlotId, reorderAssistants, assistants]);

  if (assistants.length === 0) return null;

  return (
    <div data-testid='team-tab-bar' className='relative shrink-0 bg-2 min-h-40px'>
      <div className='relative flex items-center h-40px w-full border-t border-x border-solid border-[color:var(--border-base)]'>
        <div
          ref={tabsContainerRef}
          className='flex items-center h-full flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
        >
          {assistants.map((assistant) => {
            const statusInfo = statusMap.get(assistant.slot_id);
            return (
              <TeamTabView
                key={assistant.slot_id}
                slot_id={assistant.slot_id}
                assistant_name={assistant.assistant_name}
                assistant_backend={assistant.assistant_backend}
                icon={assistant.icon}
                conversation_id={assistant.conversation_id}
                isActive={assistant.slot_id === activeSlotId}
                status={statusInfo?.status ?? assistant.status}
                isLeader={assistant.role === 'leader'}
                pendingCount={pendingCounts?.get(assistant.slot_id) ?? 0}
                onSwitch={(slot_id) => {
                  switchTab(slot_id);
                  onTabClick?.(slot_id);
                }}
                onRename={renameAssistant ? (sid, name) => void renameAssistant(sid, name) : undefined}
                onRemove={removeAssistant ? (sid) => void removeAssistant(sid) : undefined}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragOver={dragOverSlotId === assistant.slot_id}
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
