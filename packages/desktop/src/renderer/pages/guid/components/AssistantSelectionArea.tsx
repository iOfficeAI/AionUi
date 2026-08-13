/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import styles from '../index.module.css';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import { Down, Drag, Robot, Star } from '@icon-park/react';
import { Button } from '@arco-design/web-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
/* arrayMove lives in @dnd-kit/sortable */
import { AionSearchInput } from '@/renderer/components/base';
import { useAssistantOrder } from '@/renderer/hooks/assistant/useAssistantOrder';
import { normalizeFavoriteAssistantIds } from '@/renderer/hooks/assistant/useAssistantFavorites';
import { resolveFavoriteFrontRow } from '@/renderer/pages/guid/hooks/favoriteAssistants';
import { useManagedAgentRuntimeCatalog } from '@/renderer/hooks/agent/useManagedAgents';
import { managedAgentSearchText } from '@/renderer/utils/model/agentTypes';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';
import { useTranslation } from 'react-i18next';

/**
 * Mirrors the Agent settings search: matches the assistant's own name and
 * description plus the joined runtime-agent haystack (backend/command/binary),
 * so both surfaces find the same agents for the same query.
 */
export function assistantMatchesSearch(
  assistant: Assistant,
  localeKey: string,
  query: string,
  agentSearchText?: string
): boolean {
  const searchableText = [
    assistant.name,
    assistant.name_i18n?.[localeKey],
    assistant.description,
    assistant.description_i18n?.[localeKey],
    agentSearchText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return searchableText.includes(query);
}

export function resolveAssistantVisibleLimit(width: number): number {
  if (width >= 720) return 4;
  if (width >= 600) return 3;
  if (width >= 460) return 2;
  return 1;
}

export function hasTruncatedAssistantLabels(root: HTMLElement | null): boolean {
  if (!root) return false;
  return Array.from(root.querySelectorAll<HTMLElement>('[data-assistant-label="true"]')).some(
    (element) => element.scrollWidth > element.clientWidth + 1
  );
}

type AssistantSelectionAreaProps = {
  selectedAssistantId?: string | null;
  assistants: Assistant[];
  localeKey: string;
  maxVisibleAssistants?: number;
  onSelectAssistant: (assistantId: string) => void;
  /**
   * User-pinned favorite assistant ids (in pinned order). When non-empty the
   * front row is made up of these; otherwise behaviour is unchanged (the first
   * `visibleLimit` enabled assistants).
   */
  favoriteAssistantIds?: string[];
  /** Toggle an assistant's pinned/favorite state. */
  onToggleFavorite?: (assistantId: string) => void;
  /** Reorder the favorite list (full list, not just the visible slice). */
  onReorderFavorites?: (nextIds: string[]) => void;
  /** Localized accessibility/tooltip label for the pin button. */
  favoriteLabelFn?: (isFavorite: boolean) => string;
  testIds?: { favoriteToggle?: (assistantId: string) => string; dragHandle?: (assistantId: string) => string };
};

/**
 * Wrapper that makes a front-row favorite pill draggable for reordering,
 * exposing a drag handle on the left. Uses the project's dnd-kit sortable
 * pattern (same as TeamTabs / enabled-assistants reordering).
 */
const SortableAssistantPill: React.FC<{
  assistantId: string;
  dragHandleTestId?: string;
  children: React.ReactNode;
}> = ({ assistantId, dragHandleTestId, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: assistantId });

  return (
    <div
      ref={setNodeRef}
      data-testid={dragHandleTestId ? `${dragHandleTestId}-container` : undefined}
      className='inline-flex min-w-0 items-center'
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      <span
        {...attributes}
        {...listeners}
        data-testid={dragHandleTestId}
        aria-label='Drag to reorder'
        className='inline-flex h-16px w-12px cursor-grab items-center justify-center text-13px text-t-tertiary active:cursor-grabbing'
      >
        <Drag size={12} />
      </span>
      {children}
    </div>
  );
};

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  selectedAssistantId,
  assistants,
  localeKey,
  maxVisibleAssistants = 4,
  onSelectAssistant,
  favoriteAssistantIds = [],
  onToggleFavorite,
  onReorderFavorites,
  favoriteLabelFn,
  testIds,
}) => {
  const { t } = useTranslation();
  const { assistantOrder } = useAssistantOrder();
  const [moreVisible, setMoreVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [availableWidth, setAvailableWidth] = useState(() => (typeof window === 'undefined' ? 800 : window.innerWidth));
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedId = selectedAssistantId || undefined;
  const widthVisibleLimit = Math.min(Math.max(1, maxVisibleAssistants), resolveAssistantVisibleLimit(availableWidth));
  const [adaptiveVisibleLimit, setAdaptiveVisibleLimit] = useState(widthVisibleLimit);
  const visibleLimit = Math.min(widthVisibleLimit, adaptiveVisibleLimit);
  const enabledAssistants = useMemo(
    () => selectableAssistants(assistants, assistantOrder),
    [assistantOrder, assistants]
  );

  useEffect(() => {
    setAdaptiveVisibleLimit(widthVisibleLimit);
  }, [enabledAssistants, selectedId, widthVisibleLimit]);

  const clearHoverTimers = () => {
    if (hoverOpenTimer.current) {
      clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = null;
    }
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };

  useEffect(() => clearHoverTimers, []);

  const handleBarMouseEnter = () => {
    clearHoverTimers();
    // Slight delay so a mouse passing through the bar doesn't flash the panel.
    hoverOpenTimer.current = setTimeout(() => setMoreVisible(true), 120);
  };

  const handleBarMouseLeave = () => {
    clearHoverTimers();
    // Grace period keeps the panel open while the mouse travels into it.
    hoverCloseTimer.current = setTimeout(() => setMoreVisible(false), 240);
  };

  useEffect(() => {
    if (!moreVisible) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (barRef.current && event.target instanceof Node && !barRef.current.contains(event.target)) {
        setMoreVisible(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreVisible(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [moreVisible]);

  useEffect(() => {
    const updateAvailableWidth = () => {
      setAvailableWidth(containerRef.current?.offsetWidth || (typeof window === 'undefined' ? 800 : window.innerWidth));
    };

    updateAvailableWidth();

    const element = containerRef.current;
    if (element && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (typeof width === 'number') {
          setAvailableWidth(width);
        }
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('resize', updateAvailableWidth);
    return () => window.removeEventListener('resize', updateAvailableWidth);
  }, []);

  const favoritesEnabled = onToggleFavorite !== undefined && onReorderFavorites !== undefined;

  // Decide which assistants occupy the front row. When the user has pinned
  // favorites that are still enabled, the front row is the pinned set (in the
  // user's pinned order, capped at the visible limit); otherwise it falls back
  // to the default first-N-of-enabled behaviour (unchanged from before).
  const favoriteIds = normalizeFavoriteAssistantIds(favoriteAssistantIds);
  const { frontRowIds, hasCustomFavorites } = resolveFavoriteFrontRow(
    enabledAssistants,
    favoriteIds,
    visibleLimit,
    selectedId
  );

  const visibleAssistants = useMemo(() => {
    if (!hasCustomFavorites) {
      if (enabledAssistants.length <= visibleLimit || !selectedId) {
        return enabledAssistants.slice(0, visibleLimit);
      }

      const selectedIndex = enabledAssistants.findIndex((assistant) => assistant.id === selectedId);
      if (selectedIndex < 0 || selectedIndex < visibleLimit) {
        return enabledAssistants.slice(0, visibleLimit);
      }

      return [...enabledAssistants.slice(0, visibleLimit - 1), enabledAssistants[selectedIndex]];
    }

    const byId = new Map(enabledAssistants.map((assistant) => [assistant.id, assistant]));
    return frontRowIds.map((id) => byId.get(id)).filter((assistant): assistant is Assistant => Boolean(assistant));
  }, [enabledAssistants, selectedId, visibleLimit, hasCustomFavorites, frontRowIds]);

  useLayoutEffect(() => {
    if (visibleLimit <= 1 || !hasTruncatedAssistantLabels(containerRef.current)) {
      return;
    }

    setAdaptiveVisibleLimit((currentLimit) => Math.max(1, Math.min(currentLimit, visibleLimit) - 1));
  }, [visibleAssistants, visibleLimit]);

  const hasOverflow = enabledAssistants.length > visibleAssistants.length;
  const overflowAssistants = useMemo(() => {
    const visibleIds = new Set(visibleAssistants.map((assistant) => assistant.id));
    return enabledAssistants.filter((assistant) => !visibleIds.has(assistant.id));
  }, [enabledAssistants, visibleAssistants]);
  const overflowColumns = widthVisibleLimit;
  // Search only earns its row when the unfiltered list is long enough to scan.
  const showOverflowSearch = Math.ceil(overflowAssistants.length / overflowColumns) > 5;
  const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
  // Same haystack as the Agent settings search: joining the runtime catalog row
  // adds backend/command/binary fields, so e.g. "ag" finds Antigravity (`agy`).
  const agentSearchTextById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of managedAgentRuntimeCatalog) {
      map.set(agent.id, managedAgentSearchText(agent, localeKey));
    }
    return map;
  }, [localeKey, managedAgentRuntimeCatalog]);
  const filteredOverflowAssistants = useMemo(() => {
    const query = showOverflowSearch ? search.trim().toLowerCase() : '';
    if (!query) return overflowAssistants;
    return overflowAssistants.filter((assistant) =>
      assistantMatchesSearch(
        assistant,
        localeKey,
        query,
        assistant.agent_id ? agentSearchTextById.get(assistant.agent_id) : undefined
      )
    );
  }, [agentSearchTextById, localeKey, overflowAssistants, search, showOverflowSearch]);

  // Front-row favorite ids eligible for drag reordering (favorites still enabled).
  const sortableFavoriteIds = useMemo(() => {
    if (!favoritesEnabled || !hasCustomFavorites) return [];
    const enabledIds = new Set(enabledAssistants.map((assistant) => assistant.id));
    return favoriteIds.filter((id) => enabledIds.has(id));
  }, [favoritesEnabled, hasCustomFavorites, favoriteIds, enabledAssistants]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortableFavoriteIds.indexOf(String(active.id));
      const newIndex = sortableFavoriteIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onReorderFavorites?.(arrayMove(sortableFavoriteIds, oldIndex, newIndex));
    },
    [onReorderFavorites, sortableFavoriteIds]
  );

  if (enabledAssistants.length === 0) return null;

  const renderAssistantPill = (assistant: Assistant, testId: string, fullWidth = false, isFavorite = false) => {
    const avatar = resolveAssistantAvatar(assistant.avatar);
    const isSelected = selectedId === assistant.id;
    const label = assistant.name_i18n?.[localeKey] || assistant.name;
    const favoriteLabel = favoriteLabelFn?.(isFavorite);

    const favoriteToggle = favoritesEnabled ? (
      <span
        role='button'
        tabIndex={0}
        data-testid={testIds?.favoriteToggle?.(assistant.id) ?? `assistant-favorite-toggle-${assistant.id}`}
        data-assistant-id={assistant.id}
        data-favorite={isFavorite ? 'true' : 'false'}
        aria-label={favoriteLabel ?? (isFavorite ? 'Un-favorite' : 'Favorite')}
        title={favoriteLabel}
        className='inline-flex h-16px w-16px cursor-pointer items-center justify-center text-13px'
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite?.(assistant.id);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite?.(assistant.id);
          }
        }}
      >
        <Star
          theme={isFavorite ? 'filled' : 'outline'}
          size={13}
          style={{ color: isFavorite ? '#f5a524' : 'currentColor' }}
        />
      </span>
    ) : null;

    return (
      <Button
        key={assistant.id}
        data-testid={testId}
        data-assistant-id={assistant.id}
        data-assistant-backend={assistantRuntimeKey(assistant)}
        data-assistant-selected={isSelected ? 'true' : 'false'}
        type='text'
        className={`!inline-flex !min-w-0 !h-auto !items-center !gap-6px !rounded-999px !border-none !px-12px !py-8px !text-13px transition-all ${
          fullWidth ? '!w-full !justify-start' : ''
        } ${
          isSelected
            ? 'font-600 text-t-primary shadow-sm'
            : `text-t-secondary opacity-75 hover:opacity-100 ${styles.assistantSelectorInactive}`
        }`}
        style={isSelected ? { background: 'var(--bg-base, #fff)' } : { background: 'transparent' }}
        onClick={() => {
          onSelectAssistant(assistant.id);
          setMoreVisible(false);
        }}
      >
        {favoriteToggle}
        <span className='inline-flex h-20px w-20px items-center justify-center overflow-hidden rounded-999px bg-fill-2'>
          {avatar.kind === 'image' ? (
            <img src={avatar.value} alt='' className='h-full w-full object-contain' />
          ) : avatar.kind === 'emoji' ? (
            <span className={styles.assistantCardEmoji}>{avatar.value}</span>
          ) : (
            <Robot theme='outline' size={14} />
          )}
        </span>
        <span data-assistant-label='true' className='min-w-0 max-w-180px truncate whitespace-nowrap'>
          {label}
        </span>
      </Button>
    );
  };

  const overflowPanel = (
    <div
      data-testid='assistant-overflow-panel'
      data-overflow-columns={overflowColumns}
      className={`absolute left-0 top-[calc(100%+8px)] z-100 w-full rounded-12px border border-border-2 p-8px shadow-lg ${styles.assistantOverflowPanel}`}
      style={{ background: 'var(--bg-base, #fff)' }}
    >
      {showOverflowSearch ? (
        <div className='mb-8px'>
          <AionSearchInput
            className='w-full'
            value={search}
            onChange={setSearch}
            placeholder={t('team.create.searchPlaceholder', { defaultValue: 'Search' })}
          />
        </div>
      ) : null}
      <div
        className='grid max-h-260px gap-6px overflow-y-auto'
        style={{ gridTemplateColumns: `repeat(${overflowColumns}, minmax(0, 1fr))` }}
      >
        {filteredOverflowAssistants.map((assistant) => (
          <div key={assistant.id} className='min-w-0'>
            {renderAssistantPill(
              assistant,
              `assistant-overflow-${assistant.id}`,
              true,
              favoriteIds.includes(assistant.id)
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className='mt-18px mb-16px w-full'>
      <div className='flex w-full justify-center'>
        <div
          ref={barRef}
          className='relative inline-flex max-w-full items-center rounded-999px px-6px py-6px'
          style={{ background: 'var(--color-guid-agent-bar, var(--aou-2))' }}
          onMouseEnter={hasOverflow ? handleBarMouseEnter : undefined}
          onMouseLeave={hasOverflow ? handleBarMouseLeave : undefined}
        >
          <div className='flex min-w-0 max-w-full items-center gap-6px'>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableFavoriteIds} strategy={horizontalListSortingStrategy}>
                {visibleAssistants.map((assistant) => {
                  const isSortableFavorite = sortableFavoriteIds.includes(assistant.id);
                  const pill = renderAssistantPill(
                    assistant,
                    `preset-pill-${assistant.id}`,
                    false,
                    favoriteIds.includes(assistant.id)
                  );
                  if (!isSortableFavorite) return <div key={assistant.id}>{pill}</div>;
                  return (
                    <SortableAssistantPill
                      key={assistant.id}
                      assistantId={assistant.id}
                      dragHandleTestId={testIds?.dragHandle?.(assistant.id) ?? `assistant-drag-handle-${assistant.id}`}
                    >
                      {pill}
                    </SortableAssistantPill>
                  );
                })}
              </SortableContext>
            </DndContext>
            {hasOverflow ? (
              <Button
                data-testid='assistant-more-btn'
                type='text'
                className={`!ml-6px !inline-flex !h-34px !shrink-0 !items-center !gap-4px !rounded-999px !border-none !px-12px !py-8px !text-13px !text-t-secondary opacity-75 transition-opacity hover:opacity-100 ${styles.assistantSelectorInactive}`}
                onClick={() => setMoreVisible((visible) => !visible)}
              >
                <span>{t('common.more', { defaultValue: 'More' })}</span>
                <Down theme='outline' size={14} />
              </Button>
            ) : null}
          </div>
          {hasOverflow && moreVisible ? overflowPanel : null}
        </div>
      </div>
    </div>
  );
};

export default AssistantSelectionArea;
