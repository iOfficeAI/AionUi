import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Input, Tooltip, Trigger } from '@arco-design/web-react';
import {
  Check,
  CloseSmall,
  Down,
  Drag,
  Edit,
  Left,
  Peoples,
  Plus,
  Right,
  Search,
  Github,
  BookOne,
} from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { ITeamSlotWork, TeamAssistant, TeammateStatus } from '@/common/types/team/teamTypes';
import { restrictToHorizontalAxis } from '@/renderer/utils/ui/dndModifiers';
import AgentStatusBadge from './AgentStatusBadge';
import TeamAgentIdentity from './TeamAgentIdentity';
import { useTeamTabs } from '../hooks/TeamTabsContext';
import TeamAddMemberPopover from './memberPicker/TeamAddMemberPopover';
import { KnowledgeRepoModal } from './KnowledgeRepoModal';
import { MemberRepoAssignModal } from './MemberRepoAssignModal';

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
  /** A drag is in progress somewhere in the bar: freeze hover affordances so pills don't reflow mid-drag. */
  dragActive: boolean;
  onSwitch: (slot_id: string) => void;
  onRename?: (slot_id: string, new_name: string) => void;
  onRemove?: (slot_id: string) => void;
  onAssignRepos?: (slot_id: string) => void;
};

const TeamTabView: React.FC<TeamTabViewProps> = React.memo(
  ({
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
    dragActive,
    onSwitch,
    onRename,
    onRemove,
    onAssignRepos,
  }) => {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(assistant_name);
    const [hovered, setHovered] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // Leader stays fixed at index 0 and never takes part in sorting.
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
      id: slot_id,
      disabled: isLeader,
    });

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
    // 拖拽走 dnd-kit sortable：hover 时手柄内联出现在头像前（同改名/移除按钮的「hover 增宽」语言，
    // 不遮头像和状态点），拖动时兄弟胶囊实时让位（transform 平移），松手原位落地。
    // dragActive 期间冻结其他胶囊的 hover 增宽（拖动经过时布局不能跳）；正被拖动的胶囊则保持
    // 手柄和按钮可见，宽度全程恒定。
    const showDragHandle = !isLeader && !editing && ((hovered && !dragActive) || isDragging);
    const showHoverActions = !editing && ((hovered && !dragActive) || isDragging);
    return (
      <div
        ref={setNodeRef}
        data-testid={`team-tab-${slot_id}`}
        data-team-tab-role={isLeader ? 'leader' : 'teammate'}
        data-active={isActive ? 'true' : 'false'}
        className='relative flex items-center gap-6px ps-6px pe-10px h-34px max-w-220px cursor-pointer rounded-999px border border-solid transition-colors duration-150 shrink-0 bg-[color:var(--bg-2)]'
        style={{
          ['--mc' as string]: color,
          borderColor: isActive ? color : 'transparent',
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.72 : undefined,
          zIndex: isDragging ? 1 : undefined,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => !editing && onSwitch(slot_id)}
        onDoubleClick={onRename ? startEditing : undefined}
      >
        {showDragHandle && (
          <span
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            role='button'
            aria-label={t('team.reorderMember', { defaultValue: 'Drag to reorder member' })}
            data-testid={`team-tab-drag-${slot_id}`}
            className={`shrink-0 flex items-center justify-center w-14px h-20px text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ touchAction: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Drag theme='outline' size='13' fill='currentColor' />
          </span>
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
                    className='absolute -end-2px -bottom-2px w-12px h-12px rounded-full flex items-center justify-center text-9px font-700 text-white'
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
        {/* hover 时胶囊变宽、露出操作按钮；失焦则收起（胶囊变窄，只剩头像+文字）。拖拽期间冻结，避免布局跳动。 */}
        {showHoverActions && onRename && (
          <span
            data-testid={`team-tab-edit-${slot_id}`}
            className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text-primary)] transition-colors duration-150'
            onClick={startEditing}
          >
            <Edit theme='outline' size='13' fill='currentColor' />
          </span>
        )}
        {showHoverActions && onAssignRepos && (
          <span
            data-testid={`team-tab-repos-${slot_id}`}
            className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--brand)] transition-colors duration-150'
            title='Attach Knowledge Repos'
            onClick={(e) => {
              e.stopPropagation();
              onAssignRepos(slot_id);
            }}
          >
            <BookOne theme='outline' size='13' fill='currentColor' />
          </span>
        )}
        {showHoverActions && !isLeader && onRemove && (
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
  }
);

type TeamMembersDropdownProps = {
  assistants: TeamAssistant[];
  activeSlotId: string;
  statusMap: Map<string, { status: TeammateStatus }>;
  failedSlotIds?: Set<string>;
  colorOf: (slot_id: string) => string;
  visibleSlotIds: Set<string>;
  hasOverflow: boolean;
  onSelectMember: (slot_id: string) => void;
};

/**
 * 下拉菜单：查看团队全部成员 / 其余折叠成员，支持在成员较多时快速搜索和一键跳转。
 */
const TeamMembersDropdown: React.FC<TeamMembersDropdownProps> = ({
  assistants,
  activeSlotId,
  statusMap,
  failedSlotIds,
  colorOf,
  visibleSlotIds,
  hasOverflow,
  onSelectMember,
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const hiddenAssistants = useMemo(
    () => assistants.filter((a) => !visibleSlotIds.has(a.slot_id)),
    [assistants, visibleSlotIds]
  );
  const inViewAssistants = useMemo(
    () => assistants.filter((a) => visibleSlotIds.has(a.slot_id)),
    [assistants, visibleSlotIds]
  );
  const hiddenCount = hasOverflow ? hiddenAssistants.length : 0;

  const allFiltered = useMemo(() => {
    if (!search.trim()) return assistants;
    const q = search.toLowerCase();
    return assistants.filter((a) => a.assistant_name.toLowerCase().includes(q));
  }, [assistants, search]);

  const handleSelect = (slot_id: string) => {
    onSelectMember(slot_id);
    setVisible(false);
    setSearch('');
  };

  const renderMemberItem = (assistant: TeamAssistant) => {
    const isActive = assistant.slot_id === activeSlotId;
    const isLeader = assistant.role === 'leader';
    const status = statusMap.get(assistant.slot_id)?.status ?? assistant.status;
    const color = colorOf(assistant.slot_id);
    const warmupFailed = failedSlotIds?.has(assistant.slot_id) ?? false;

    return (
      <div
        key={assistant.slot_id}
        data-testid={`team-dropdown-member-${assistant.slot_id}`}
        className={`flex items-center justify-between gap-8px px-8px py-6px rounded-6px cursor-pointer transition-colors duration-150 ${
          isActive ? 'bg-[color:var(--color-fill-3)] font-600' : 'hover:bg-[color:var(--color-fill-2)]'
        }`}
        onClick={() => handleSelect(assistant.slot_id)}
      >
        <div className='flex items-center gap-8px min-w-0 flex-1'>
          <div
            className='relative shrink-0 w-22px h-22px flex items-center justify-center rounded-full text-11px font-600 bg-fill-2'
            style={{ border: `1.5px solid ${color}` }}
          >
            {assistant.icon ? (
              <img src={assistant.icon} alt='' className='w-full h-full object-cover rounded-full' />
            ) : (
              <span style={{ color }}>{assistant.assistant_name.slice(0, 1).toUpperCase()}</span>
            )}
            {warmupFailed ? (
              <span className='absolute -end-2px -bottom-2px w-8px h-8px rounded-full bg-[color:var(--color-danger-6)]' />
            ) : (
              <span className='absolute -end-2px -bottom-2px'>
                <AgentStatusBadge status={status} overlay />
              </span>
            )}
          </div>
          <span className='text-13px text-t-primary truncate' style={{ color: isActive ? color : undefined }}>
            {assistant.assistant_name}
          </span>
          {isLeader && (
            <span className='shrink-0 text-10px font-medium px-4px py-1px rounded-4px bg-[color:var(--color-fill-3)] text-t-tertiary'>
              {t('team.create.teamLeader')}
            </span>
          )}
        </div>
        {isActive && (
          <span className='shrink-0 text-[color:var(--color-brand)]'>
            <Check theme='outline' size='14' fill='currentColor' />
          </span>
        )}
      </div>
    );
  };

  return (
    <Trigger
      popupVisible={visible}
      onVisibleChange={setVisible}
      trigger='click'
      position='br'
      popupAlign={{ bottom: 8 }}
      getPopupContainer={() => document.body}
      popup={() => (
        <div
          data-testid='team-members-dropdown-panel'
          className='flex max-h-[min(380px,65vh)] w-260px min-h-0 flex-col rounded-10px border border-solid border-3 bg-dialog-fill-0 p-8px shadow-[0_4px_16px_rgba(0,0,0,0.12)]'
          style={{ zIndex: 10020 }}
        >
          {/* Header */}
          <div className='flex items-center justify-between pb-6px px-4px border-b border-solid border-3 mb-6px'>
            <span className='text-13px font-600 text-t-primary'>
              {hasOverflow && hiddenCount > 0 ? t('team.restMembers') : t('team.allMembers')}
            </span>
            <span className='text-11px text-t-tertiary font-medium'>
              {t('team.memberCount', {
                visible: hasOverflow ? inViewAssistants.length : assistants.length,
                total: assistants.length,
              })}
            </span>
          </div>

          {/* Search if more than 3 members */}
          {assistants.length > 3 && (
            <div className='mb-6px px-2px'>
              <Input
                size='mini'
                allowClear
                value={search}
                onChange={setSearch}
                prefix={<Search size='12' />}
                placeholder={t('team.searchMembers')}
                className='rounded-6px'
              />
            </div>
          )}

          {/* List */}
          <div className='flex-1 overflow-y-auto min-h-0 flex flex-col gap-2px pr-2px'>
            {search.trim() ? (
              allFiltered.length > 0 ? (
                allFiltered.map(renderMemberItem)
              ) : (
                <div className='py-16px text-center text-12px text-t-tertiary'>{t('team.noMatchingMembers')}</div>
              )
            ) : hasOverflow && hiddenCount > 0 ? (
              <>
                <div className='text-11px font-600 text-t-tertiary px-6px py-2px uppercase tracking-wider'>
                  {t('team.hiddenMembers')} ({hiddenCount})
                </div>
                {hiddenAssistants.map(renderMemberItem)}
                <div className='text-11px font-600 text-t-tertiary px-6px pt-6px pb-2px uppercase tracking-wider border-t border-solid border-3 mt-4px'>
                  {t('team.inViewMembers')} ({inViewAssistants.length})
                </div>
                {inViewAssistants.map(renderMemberItem)}
              </>
            ) : (
              assistants.map(renderMemberItem)
            )}
          </div>
        </div>
      )}
    >
      <Tooltip
        content={hasOverflow && hiddenCount > 0 ? `${t('team.restMembers')} (+${hiddenCount})` : t('team.allMembers')}
        position='bottom'
      >
        <Button
          type='text'
          size='small'
          data-testid='team-tab-members-dropdown-btn'
          className={`h-28px px-6px text-12px font-medium rounded-6px flex items-center gap-4px transition-colors duration-150 ${
            hasOverflow && hiddenCount > 0
              ? 'text-[color:var(--brand)] bg-[color:var(--color-primary-light-1)] hover:bg-[color:var(--color-primary-light-2)]'
              : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-2)]'
          }`}
        >
          <Peoples theme='outline' size='14' />
          {hasOverflow && hiddenCount > 0 ? (
            <span className='font-600 text-11px'>+{hiddenCount}</span>
          ) : (
            <Down theme='outline' size='12' />
          )}
        </Button>
      </Tooltip>
    </Trigger>
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
  /** Controls to render on the right side of the tab bar (e.g. active teammate's model selector, actions, fullscreen) */
  rightSlot?: React.ReactNode;
};

/**
 * Tab bar for team mode showing assistant tabs with status badges.
 * Supports scroll overflow with visible arrow buttons, inline search filter, and dropdown for rest of members.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({
  onTabClick,
  pendingCounts,
  warmingUp = false,
  failedSlotIds,
  rightSlot,
}) => {
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
  const memberOpsDisabled = warmingUp;
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [visibleSlotIds, setVisibleSlotIds] = useState<Set<string>>(new Set());
  const [tabFilterQuery, setTabFilterQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [assignRepoAssistant, setAssignRepoAssistant] = useState<TeamAssistant | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const filteredAssistants = useMemo(() => {
    if (!tabFilterQuery.trim()) return assistants;
    const q = tabFilterQuery.toLowerCase();
    return assistants.filter((assistant) => assistant.assistant_name.toLowerCase().includes(q));
  }, [assistants, tabFilterQuery]);

  // Only teammates are sortable; the leader pill is rendered outside the sortable id list.
  const sortableIds = useMemo(
    () => filteredAssistants.filter((assistant) => assistant.role !== 'leader').map((assistant) => assistant.slot_id),
    [filteredAssistants]
  );

  const overflowRafRef = useRef<number | null>(null);

  const measureTabOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const overflow = container.scrollWidth > container.clientWidth + 1;
    setHasOverflow(overflow);
    setShowLeftFade(overflow && container.scrollLeft > TAB_OVERFLOW_THRESHOLD);
    setShowRightFade(
      overflow && container.scrollLeft + container.clientWidth < container.scrollWidth - TAB_OVERFLOW_THRESHOLD
    );

    const containerRect = container.getBoundingClientRect();
    const visible = new Set<string>();
    const tabElements = container.querySelectorAll<HTMLElement>('[data-testid^="team-tab-"]');
    tabElements.forEach((el) => {
      const testId = el.getAttribute('data-testid') || '';
      if (
        !testId.startsWith('team-tab-') ||
        testId.includes('-drag-') ||
        testId.includes('-name-') ||
        testId.includes('-edit-') ||
        testId.includes('-remove-') ||
        testId.includes('-failed-') ||
        testId.includes('-status-') ||
        testId.includes('-bar') ||
        testId.includes('-add-member') ||
        testId.includes('-scroll-') ||
        testId.includes('-filter-') ||
        testId.includes('-members-')
      ) {
        return;
      }
      const slotId = testId.replace('team-tab-', '');
      const rect = el.getBoundingClientRect();
      if (rect.right > containerRect.left + 20 && rect.left < containerRect.right - 20) {
        visible.add(slotId);
      }
    });
    setVisibleSlotIds(visible);
  }, []);

  const updateTabOverflow = useCallback(() => {
    if (overflowRafRef.current !== null) {
      cancelAnimationFrame(overflowRafRef.current);
    }
    overflowRafRef.current = requestAnimationFrame(() => {
      overflowRafRef.current = null;
      measureTabOverflow();
    });
  }, [measureTabOverflow]);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateTabOverflow, { passive: true });
    window.addEventListener('resize', updateTabOverflow);
    const observer = new ResizeObserver(updateTabOverflow);
    observer.observe(container);
    updateTabOverflow();
    return () => {
      if (overflowRafRef.current !== null) {
        cancelAnimationFrame(overflowRafRef.current);
        overflowRafRef.current = null;
      }
      container.removeEventListener('scroll', updateTabOverflow);
      window.removeEventListener('resize', updateTabOverflow);
      observer.disconnect();
    };
  }, [updateTabOverflow]);

  useEffect(() => {
    updateTabOverflow();
  }, [assistants, updateTabOverflow]);

  const handleDragStart = useCallback(() => setDragActive(true), []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setDragActive(false);
      if (!over || active.id === over.id) return;
      reorderAssistants(String(active.id), String(over.id));
    },
    [reorderAssistants]
  );

  const handleDragCancel = useCallback(() => setDragActive(false), []);

  const scrollTabBar = useCallback((direction: 'left' | 'right') => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const scrollAmount = 200;
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  }, []);

  const scrollTabIntoView = useCallback((slot_id: string) => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const tabEl = container.querySelector<HTMLElement>(`[data-testid="team-tab-${slot_id}"]`);
    if (tabEl) {
      tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, []);

  const handleTabSwitch = useCallback(
    (slot_id: string) => {
      switchTab(slot_id);
      onTabClick?.(slot_id);
    },
    [switchTab, onTabClick]
  );

  const handleTabRename = useMemo<((sid: string, name: string) => void) | undefined>(
    () =>
      renameAssistant && !memberOpsDisabled
        ? (sid: string, name: string): void => {
            void renameAssistant(sid, name);
          }
        : undefined,
    [renameAssistant, memberOpsDisabled]
  );

  const handleTabRemove = useMemo<((sid: string) => void) | undefined>(
    () =>
      removeAssistant && !memberOpsDisabled
        ? (sid: string): void => {
            void removeAssistant(sid);
          }
        : undefined,
    [removeAssistant, memberOpsDisabled]
  );

  const handleTabAssignRepos = useCallback(
    (sid: string) => {
      const target = assistants.find((a) => a.slot_id === sid);
      if (target) setAssignRepoAssistant(target);
    },
    [assistants]
  );

  if (assistants.length === 0) return null;

  return (
    <div
      data-testid='team-tab-bar'
      className='relative shrink-0 bg-1 border-b border-solid border-[color:var(--border-base)]'
    >
      <div className='relative flex items-center justify-between min-h-40px h-40px px-12px gap-12px'>
        {/* 可横向滚动的成员胶囊列表 + 滚动箭头 + 下拉查看其余成员 + 添加成员 */}
        <div className='relative flex items-center flex-1 min-w-0 h-full overflow-hidden'>
          {/* Left scroll arrow */}
          {showLeftFade && (
            <div
              className='absolute start-0 top-0 bottom-0 z-20 flex items-center'
              style={{ background: 'linear-gradient(90deg, var(--color-bg-1) 60%, transparent)' }}
            >
              <Tooltip content={t('team.scrollTabs.left')} position='bottom'>
                <Button
                  type='secondary'
                  shape='circle'
                  size='mini'
                  aria-label={t('team.scrollTabs.left')}
                  data-testid='team-tab-scroll-left'
                  className='!w-24px !h-24px ms-2px shrink-0 !p-0 flex items-center justify-center text-[color:var(--color-text-2)] bg-[color:var(--color-bg-2)] border-[color:var(--color-border-2)] hover:bg-[color:var(--color-bg-3)] hover:text-[color:var(--color-text-1)]'
                  onClick={() => scrollTabBar('left')}
                  icon={<Left size='14' fill='currentColor' />}
                />
              </Tooltip>
            </div>
          )}
          <div
            ref={tabsContainerRef}
            className='flex items-center gap-6px flex-1 min-w-0 overflow-x-auto overflow-y-hidden py-3px [scrollbar-width:none]'
            style={{
              paddingLeft: showLeftFade ? '32px' : undefined,
              paddingRight: showRightFade ? '32px' : undefined,
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToHorizontalAxis]}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
                {filteredAssistants.length > 0 ? (
                  filteredAssistants.map((assistant) => {
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
                        dragActive={dragActive}
                        onSwitch={handleTabSwitch}
                        onRename={handleTabRename}
                        onRemove={handleTabRemove}
                        onAssignRepos={handleTabAssignRepos}
                      />
                    );
                  })
                ) : (
                  <div className='flex items-center px-12px text-12px text-t-tertiary italic'>
                    {t('team.noMatchingMembers')}
                  </div>
                )}
              </SortableContext>
            </DndContext>
          </div>
          {/* Right scroll arrow */}
          {showRightFade && (
            <div
              className='absolute end-0 top-0 bottom-0 z-20 flex items-center justify-end'
              style={{ background: 'linear-gradient(270deg, var(--color-bg-1) 60%, transparent)' }}
            >
              <Tooltip content={t('team.scrollTabs.right')} position='bottom'>
                <Button
                  type='secondary'
                  shape='circle'
                  size='mini'
                  aria-label={t('team.scrollTabs.right')}
                  data-testid='team-tab-scroll-right'
                  className='!w-24px !h-24px me-2px shrink-0 !p-0 flex items-center justify-center text-[color:var(--color-text-2)] bg-[color:var(--color-bg-2)] border-[color:var(--color-border-2)] hover:bg-[color:var(--color-bg-3)] hover:text-[color:var(--color-text-1)]'
                  onClick={() => scrollTabBar('right')}
                  icon={<Right size='14' fill='currentColor' />}
                />
              </Tooltip>
            </div>
          )}

          {/* 搜索/过滤成员按钮或输入框 */}
          {assistants.length >= 2 && (
            <div className='flex items-center shrink-0 ms-4px'>
              {isFilterOpen ? (
                <div className='flex items-center gap-4px'>
                  <Input
                    size='mini'
                    allowClear
                    autoFocus
                    data-testid='team-tab-filter-input'
                    value={tabFilterQuery}
                    onChange={setTabFilterQuery}
                    placeholder={t('team.filterMembers')}
                    prefix={<Search size='12' />}
                    className='w-120px h-28px rounded-6px'
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setTabFilterQuery('');
                        setIsFilterOpen(false);
                      }
                    }}
                  />
                  <Button
                    type='text'
                    size='mini'
                    icon={<CloseSmall size='14' />}
                    className='h-24px w-24px p-0 text-[color:var(--text-secondary)]'
                    onClick={() => {
                      setTabFilterQuery('');
                      setIsFilterOpen(false);
                    }}
                  />
                </div>
              ) : (
                <Tooltip content={t('team.filterMembers')} position='bottom'>
                  <Button
                    type='text'
                    size='small'
                    data-testid='team-tab-filter-toggle'
                    icon={<Search size='14' />}
                    className='h-28px w-28px p-0 rounded-6px text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-2)]'
                    onClick={() => setIsFilterOpen(true)}
                  />
                </Tooltip>
              )}
            </div>
          )}

          {/* 下拉菜单查看其余成员 / 全部成员 */}
          {assistants.length > 1 && (
            <div className='flex items-center shrink-0 ms-2px'>
              <TeamMembersDropdown
                assistants={assistants}
                activeSlotId={activeSlotId}
                statusMap={statusMap}
                failedSlotIds={failedSlotIds}
                colorOf={colorOf}
                visibleSlotIds={visibleSlotIds}
                hasOverflow={hasOverflow}
                onSelectMember={(slot_id) => {
                  switchTab(slot_id);
                  onTabClick?.(slot_id);
                  scrollTabIntoView(slot_id);
                }}
              />
            </div>
          )}

          {/* 添加成员 */}
          {addAssistant ? (
            <div className='flex items-center shrink-0 border-s border-solid border-[color:var(--border-base)] ms-6px ps-6px'>
              <TeamAddMemberPopover disabled={memberOpsDisabled}>
                <Tooltip content={t('team.addMember.title', { defaultValue: 'Add member' })} position='bottom'>
                  <Button
                    type='text'
                    size='mini'
                    disabled={memberOpsDisabled}
                    data-testid='team-tab-add-member'
                    className='h-18px px-4px text-10px font-semibold rounded-4px leading-none text-[color:var(--text-secondary)] hover:text-[color:var(--brand)] hover:bg-[color:var(--bg-2)]'
                  >
                    {t('team.addMember.btn', { defaultValue: '+Mate' })}
                  </Button>
                </Tooltip>
              </TeamAddMemberPopover>
            </div>
          ) : null}

          {/* Knowledge Repos Button */}
          <div className='flex items-center shrink-0 border-s border-solid border-[color:var(--border-base)] ms-6px ps-6px'>
            <Button
              type='text'
              size='small'
              icon={<Github theme='outline' size='14' />}
              onClick={() => setIsKnowledgeModalOpen(true)}
              className='h-28px px-8px text-12px font-medium rounded-6px text-[color:var(--text-secondary)] hover:text-[color:var(--brand)] hover:bg-[color:var(--bg-2)]'
            >
              {t('team.knowledgeRepos.tabLabel')}
            </Button>
          </div>
        </div>

        {/* 右侧插槽：单聊 / 单成员时的模型选择、运行重启及全屏切换 */}
        {rightSlot && (
          <div className='flex items-center gap-8px shrink-0 ps-10px border-s border-solid border-[color:var(--border-base)]'>
            {rightSlot}
          </div>
        )}
      </div>

      <KnowledgeRepoModal visible={isKnowledgeModalOpen} onClose={() => setIsKnowledgeModalOpen(false)} />

      {assignRepoAssistant && (
        <MemberRepoAssignModal
          visible={Boolean(assignRepoAssistant)}
          assistant={assignRepoAssistant}
          onClose={() => setAssignRepoAssistant(null)}
          onSave={(assignedRepoIds, whenToUseHint) => {
            assignRepoAssistant.knowledgeRepoIds = assignedRepoIds;
            assignRepoAssistant.whenToUseHint = whenToUseHint;
            setAssignRepoAssistant(null);
          }}
        />
      )}
    </div>
  );
};

export type TeamActiveMembersProps = {
  assistants: TeamAssistant[];
  statusMap: Map<string, { status: TeammateStatus }>;
  activeSlotId?: string;
  colorOf: (slot_id: string | undefined) => string;
  onSelectMember: (slot_id: string) => void;
  slotWorkBySlot?: Record<string, ITeamSlotWork | undefined>;
};

export const TeamActiveMembers: React.FC<TeamActiveMembersProps> = React.memo(
  ({ assistants, statusMap, activeSlotId, colorOf, onSelectMember, slotWorkBySlot }) => {
    const { t } = useTranslation();

    const activeAssistants = useMemo(() => {
      return assistants.filter((assistant) => {
        const status = statusMap.get(assistant.slot_id)?.status;
        if (status === 'active') return true;
        const work = slotWorkBySlot?.[assistant.slot_id];
        return work?.state === 'starting' || work?.state === 'running';
      });
    }, [assistants, statusMap, slotWorkBySlot]);

    if (activeAssistants.length === 0) return null;

    return (
      <div
        className='flex items-center gap-8px min-w-0 max-w-full overflow-x-auto no-scrollbar py-2px'
        data-testid='team-active-members'
      >
        <span className='h-16px w-1px shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--color-text-4)_40%,transparent)]' />
        {activeAssistants.map((assistant) => {
          const isCurrent = assistant.slot_id === activeSlotId;
          const color = colorOf(assistant.slot_id);
          const displayName = assistant.assistant_name || 'Assistant';

          return (
            <Tooltip
              key={assistant.slot_id}
              content={t('team.activeMembers.workingTooltip', {
                name: displayName,
                defaultValue: `${displayName} is working`,
              })}
              position='bottom'
            >
              <div
                role='button'
                tabIndex={0}
                data-testid={`team-active-member-${assistant.slot_id}`}
                className={classNames(
                  'group flex items-center h-26px px-8px rounded-full cursor-pointer select-none border transition-all duration-150 shrink-0 gap-6px',
                  isCurrent
                    ? 'bg-fill-3 border-[rgb(var(--primary-6))] shadow-sm'
                    : 'bg-fill-1 border-transparent hover:bg-fill-2 hover:border-[color:var(--border-base)]'
                )}
                onClick={() => onSelectMember(assistant.slot_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMember(assistant.slot_id);
                  }
                }}
              >
                <TeamAgentIdentity
                  assistant_name={assistant.assistant_name}
                  assistant_backend={assistant.assistant_backend}
                  icon={assistant.icon}
                  conversation_id={assistant.conversation_id}
                  isLeader={assistant.role === 'leader'}
                  className='min-w-0 !gap-6px'
                  logoClassName='w-18px h-18px object-cover rounded-full'
                  avatarClassName='w-18px h-18px rounded-full flex items-center justify-center text-11px leading-none bg-fill-2 shrink-0'
                  nameClassName='text-12px font-600 whitespace-nowrap overflow-hidden text-ellipsis select-none max-w-100px'
                  nameStyle={{ color }}
                  nameTestId={`team-active-member-name-${assistant.slot_id}`}
                  avatarOverlay={<AgentStatusBadge status='active' overlay />}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
    );
  }
);

export default React.memo(TeamTabs);
