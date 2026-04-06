import { Edit, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import type { TeammateStatus } from '@/common/types/teamTypes';
import AddAgentModal from './AddAgentModal';
import AgentStatusBadge from './AgentStatusBadge';
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
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}) => {
  const logo = getAgentLogo(agentType);
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
      {logo && (
        <img
          src={logo}
          alt={agentType}
          className={`w-14px h-14px object-contain rounded-2px ${isActive ? 'opacity-100' : 'opacity-70'}`}
        />
      )}
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
        <span className='text-15px whitespace-nowrap overflow-hidden text-ellipsis select-none flex-1'>
          {agentName}
        </span>
      )}
      {isLead && (
        <span className='text-10px px-4px py-1px rd-4px bg-[var(--color-primary-1)] text-[var(--color-primary-6)] shrink-0'>
          Lead
        </span>
      )}
      {!editing && onRename && (
        <span
          className='opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity duration-150 shrink-0 flex items-center'
          onClick={startEditing}
        >
          <Edit theme='outline' size='12' fill='currentColor' />
        </span>
      )}
      <AgentStatusBadge status={status} />
    </div>
  );
};

type AddAgentTriggerProps = {
  onAddAgent: (data: { agentName: string; agentKey: string }) => void;
};

const AddAgentTrigger: React.FC<AddAgentTriggerProps> = ({ onAddAgent }) => {
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
      <AddAgentModal visible={modalVisible} onClose={() => setModalVisible(false)} onConfirm={onAddAgent} />
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
  const { agents, activeSlotId, statusMap, switchTab, renameAgent, reorderAgents } = useTeamTabs();
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
    <div className='relative shrink-0 bg-2 min-h-40px'>
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
                isActive={agent.slotId === activeSlotId}
                status={statusInfo?.status ?? agent.status}
                isLead={agent.role === 'lead'}
                onSwitch={(slotId) => {
                  switchTab(slotId);
                  onTabClick?.(slotId);
                }}
                onRename={renameAgent ? (sid, name) => void renameAgent(sid, name) : undefined}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragOver={dragOverSlotId === agent.slotId}
              />
            );
          })}
        </div>
        {/* AddAgentTrigger hidden — agents are created by the leader via MCP tools */}
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
