/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import styles from '../index.module.css';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import { Down, Robot } from '@icon-park/react';
import { Button } from '@arco-design/web-react';
import { AionSearchInput } from '@/renderer/components/base';
import { useAssistantOrder } from '@/renderer/hooks/assistant/useAssistantOrder';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';
import { useTranslation } from 'react-i18next';

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
};

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  selectedAssistantId,
  assistants,
  localeKey,
  maxVisibleAssistants = 4,
  onSelectAssistant,
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

  const visibleAssistants = useMemo(() => {
    if (enabledAssistants.length <= visibleLimit || !selectedId) {
      return enabledAssistants.slice(0, visibleLimit);
    }

    const selectedIndex = enabledAssistants.findIndex((assistant) => assistant.id === selectedId);
    if (selectedIndex < 0 || selectedIndex < visibleLimit) {
      return enabledAssistants.slice(0, visibleLimit);
    }

    return [...enabledAssistants.slice(0, visibleLimit - 1), enabledAssistants[selectedIndex]];
  }, [enabledAssistants, selectedId, visibleLimit]);

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
  const filteredOverflowAssistants = useMemo(() => {
    const query = showOverflowSearch ? search.trim().toLowerCase() : '';
    if (!query) return overflowAssistants;
    return overflowAssistants.filter((assistant) => {
      const label = assistant.name_i18n?.[localeKey] || assistant.name;
      return label.toLowerCase().includes(query);
    });
  }, [localeKey, overflowAssistants, search, showOverflowSearch]);

  if (enabledAssistants.length === 0) return null;

  const renderAssistantPill = (assistant: Assistant, testId: string, fullWidth = false) => {
    const avatar = resolveAssistantAvatar(assistant.avatar);
    const isSelected = selectedId === assistant.id;
    const label = assistant.name_i18n?.[localeKey] || assistant.name;

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
            {renderAssistantPill(assistant, `assistant-overflow-${assistant.id}`, true)}
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
            {visibleAssistants.map((assistant) => renderAssistantPill(assistant, `preset-pill-${assistant.id}`))}
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
