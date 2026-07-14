import { CloseSmall, Edit, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeammateStatus } from '@/common/types/team/teamTypes';
import AgentStatusBadge from './AgentStatusBadge';
import TeamAgentIdentity from './TeamAgentIdentity';
import { useTeamTabs } from '../hooks/TeamTabsContext';
import TeamAddMemberPopover from './memberPicker/TeamAddMemberPopover';

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
  /** warmup 失败：头像加红环 + 感叹角标提示。 */
  warmupFailed?: boolean;
  /** 成员身份色 CSS 值（胶囊底色 / 选中描边）。 */
  color: string;
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
  warmupFailed = false,
  color,
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
  const [hovered, setHovered] = useState(false);
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

  // 胶囊底色恒定浅灰（hover / 选中都不改底色，避免压低彩色名字可读性）；
  // 选中态用一圈成员自己的身份色边框表示（与彩色名字呼应，明显但不脏）。身份色只落在名字与边框上。
  return (
    <div
      data-testid={`team-tab-${slot_id}`}
      data-team-tab-role={isLeader ? 'leader' : 'teammate'}
      data-active={isActive ? 'true' : 'false'}
      draggable={!isLeader}
      className={`relative flex items-center gap-6px pl-6px pr-10px h-34px max-w-220px cursor-pointer rounded-999px border border-solid transition-colors duration-150 shrink-0 bg-[color:var(--bg-2)] ${
        isDragOver ? DRAG_OVER_CLASS : ''
      }`}
      style={{ ['--mc' as string]: color, borderColor: isActive ? color : 'transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
            className='min-w-0 flex-1 !gap-6px'
            logoClassName={`w-22px h-22px object-cover rounded-full ${warmupFailed ? 'grayscale' : ''}`}
            avatarClassName={`w-22px h-22px rounded-full flex items-center justify-center text-12px leading-none bg-fill-2 shrink-0 ${warmupFailed ? 'grayscale' : ''}`}
            nameClassName='text-13px font-600 whitespace-nowrap overflow-hidden text-ellipsis select-none'
            nameStyle={{ color }}
            nameTestId={`team-tab-name-${slot_id}`}
            avatarOverlay={
              warmupFailed ? (
                <span
                  data-testid={`team-tab-failed-${slot_id}`}
                  className='absolute -right-2px -bottom-2px w-12px h-12px rounded-full flex items-center justify-center text-9px font-700 text-white'
                  style={{ background: 'var(--danger)', border: '1.5px solid var(--bg-base)' }}
                >
                  !
                </span>
              ) : (
                <AgentStatusBadge status={status} testId={`team-tab-status-${slot_id}`} />
              )
            }
          />
        </div>
      )}
      {/* hover 时胶囊变宽、露出操作按钮；失焦则收起（胶囊变窄，只剩头像+文字）。 */}
      {!editing && hovered && onRename && (
        <span
          data-testid={`team-tab-edit-${slot_id}`}
          className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text-primary)] transition-colors duration-150'
          onClick={startEditing}
        >
          <Edit theme='outline' size='13' fill='currentColor' />
        </span>
      )}
      {!editing && hovered && !isLeader && onRemove && (
        <span
          data-testid={`team-tab-remove-${slot_id}`}
          className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--color-danger-6)] transition-colors duration-150'
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
  /** 团队 warmup 进行中：禁用改成员（添加/移除/重命名）——PRD 第 7 节要求。 */
  warmingUp?: boolean;
  /** warmup 失败的成员 slot：胶囊头像标红提示，引导用户移除/换模型自救。 */
  failedSlotIds?: Set<string>;
};

/**
 * Tab bar for team mode showing assistant tabs with status badges.
 * Supports scroll overflow with fade indicators.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({ onTabClick, pendingCounts, warmingUp = false, failedSlotIds }) => {
  const { t } = useTranslation();
  const {
    assistants,
    activeSlotId,
    statusMap,
    switchTab,
    renameAssistant,
    removeAssistant,
    reorderAssistants,
    addAssistant,
    colorOf,
  } = useTeamTabs();
  // 胶囊操作（增/删/改名）只在「warmup 进行中」禁用。warmup 一旦结束——无论成功还是失败——
  // 就全部放开。后端对增删改成员本身有并发锁保证串行，前端不需要再叠一层忙碌禁用
  // （否则删完一个成员，后端重建剩余成员时又会把胶囊锁住，出现「删一个卡一下」的怪体验）。
  const memberOpsDisabled = warmingUp;
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
    <div
      data-testid='team-tab-bar'
      className='relative shrink-0 bg-1 border-t border-x border-b border-solid border-[color:var(--border-base)]'
    >
      <div className='relative flex items-stretch min-h-48px'>
        {/* 可横向滚动的成员胶囊列表 */}
        <div
          ref={tabsContainerRef}
          className='flex items-center gap-6px flex-1 min-w-0 overflow-x-auto overflow-y-hidden py-8px px-12px [scrollbar-width:none]'
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
                warmupFailed={failedSlotIds?.has(assistant.slot_id) ?? false}
                color={colorOf(assistant.slot_id)}
                pendingCount={pendingCounts?.get(assistant.slot_id) ?? 0}
                onSwitch={(slot_id) => {
                  switchTab(slot_id);
                  onTabClick?.(slot_id);
                }}
                onRename={
                  renameAssistant && !memberOpsDisabled ? (sid, name) => void renameAssistant(sid, name) : undefined
                }
                onRemove={removeAssistant && !memberOpsDisabled ? (sid) => void removeAssistant(sid) : undefined}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragOver={dragOverSlotId === assistant.slot_id}
              />
            );
          })}
        </div>
        {/* 两侧渐隐提示「还有更多」，只覆盖滚动区、不盖固定的添加入口 */}
        {showLeftFade && (
          <div
            className='pointer-events-none absolute left-0 top-0 bottom-0 w-28px z-10'
            style={{ background: 'linear-gradient(90deg, var(--color-bg-1), transparent)' }}
          />
        )}
        {showRightFade && (
          <div
            className='pointer-events-none absolute top-0 bottom-0 w-28px z-10'
            style={{
              right: 'var(--team-add-w, 132px)',
              background: 'linear-gradient(270deg, var(--color-bg-1), transparent)',
            }}
          />
        )}
        {/* 固定在最右、不随列表滚动的「添加成员」；左侧一根分隔线与成员列表隔开，按钮本身无边框。 */}
        {addAssistant ? (
          <div className='flex items-center shrink-0 border-l border-solid border-[color:var(--border-base)] px-8px'>
            <TeamAddMemberPopover disabled={memberOpsDisabled}>
              <button
                type='button'
                disabled={memberOpsDisabled}
                data-testid='team-tab-add-member'
                // 禁用态：只把文字调浅，位置/尺寸/背景/边框都不变。
                // 原生 <button>:disabled 会叠加浏览器默认灰底 + 收缩高度，className 的 appearance/bg
                // 在禁用态下可能被 UA 样式盖过；这里用内联 style 强制关掉原生外观并锁定盒模型，保证两态一致。
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: 'transparent',
                  border: 'none',
                  height: 32,
                  lineHeight: 'normal',
                }}
                className={`flex items-center gap-6px px-10px rounded-8px text-13px font-500 whitespace-nowrap transition-colors duration-150 ${
                  memberOpsDisabled
                    ? 'text-[color:var(--text-disabled)] cursor-not-allowed'
                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--brand)] hover:bg-[color:var(--bg-2)] cursor-pointer'
                }`}
              >
                <Plus theme='outline' size='15' fill='currentColor' className='leading-none' />
                {t('team.addMember.title', { defaultValue: 'Add member' })}
              </button>
            </TeamAddMemberPopover>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TeamTabs;
