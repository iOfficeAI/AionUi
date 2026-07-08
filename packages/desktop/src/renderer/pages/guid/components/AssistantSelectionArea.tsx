/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import styles from '../index.module.css';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import { Down, Robot, Search } from '@icon-park/react';
import { Button, Dropdown, Input } from '@arco-design/web-react';
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
  const [moreVisible, setMoreVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [availableWidth, setAvailableWidth] = useState(() => (typeof window === 'undefined' ? 800 : window.innerWidth));
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedId = selectedAssistantId || undefined;
  const widthVisibleLimit = Math.min(Math.max(1, maxVisibleAssistants), resolveAssistantVisibleLimit(availableWidth));
  const [adaptiveVisibleLimit, setAdaptiveVisibleLimit] = useState(widthVisibleLimit);
  const visibleLimit = Math.min(widthVisibleLimit, adaptiveVisibleLimit);
  const enabledAssistants = useMemo(() => selectableAssistants(assistants), [assistants]);

  useEffect(() => {
    setAdaptiveVisibleLimit(widthVisibleLimit);
  }, [enabledAssistants, selectedId, widthVisibleLimit]);

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
  const filteredOverflowAssistants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return overflowAssistants;
    return overflowAssistants.filter((assistant) => {
      const label = assistant.name_i18n?.[localeKey] || assistant.name;
      return label.toLowerCase().includes(query);
    });
  }, [localeKey, overflowAssistants, search]);

  if (enabledAssistants.length === 0) return null;

  const renderAssistantPill = (assistant: Assistant, testId: string) => {
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
        <span data-assistant-label='true' className='max-w-180px truncate whitespace-nowrap'>
          {label}
        </span>
      </Button>
    );
  };

  const overflowDroplist = (
    <div
      className='min-w-240px rounded-12px border border-border-2 p-8px shadow-lg'
      style={{ background: 'var(--bg-base, #fff)' }}
    >
      <div className='mb-8px'>
        <Input
          size='small'
          value={search}
          onChange={setSearch}
          prefix={<Search theme='outline' size={14} />}
          placeholder={t('team.create.searchPlaceholder', { defaultValue: 'Search assistants...' })}
        />
      </div>
      <div className='flex max-h-260px flex-col gap-4px overflow-y-auto'>
        {filteredOverflowAssistants.map((assistant) => (
          <div key={assistant.id}>{renderAssistantPill(assistant, `assistant-overflow-${assistant.id}`)}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className='mt-18px mb-16px w-full'>
      <div className='flex w-full justify-center'>
        <div
          className='inline-flex max-w-full items-center rounded-999px px-6px py-6px'
          style={{ background: 'var(--color-guid-agent-bar, var(--aou-2))' }}
        >
          <div className='flex min-w-0 max-w-full items-center gap-6px'>
            {visibleAssistants.map((assistant) => renderAssistantPill(assistant, `preset-pill-${assistant.id}`))}
            {hasOverflow ? (
              <Dropdown
                trigger='click'
                position='bl'
                droplist={overflowDroplist}
                popupVisible={moreVisible}
                onVisibleChange={setMoreVisible}
              >
                <Button
                  data-testid='assistant-more-btn'
                  type='text'
                  className={`!ml-6px !inline-flex !h-34px !shrink-0 !items-center !gap-4px !rounded-999px !border-none !px-12px !py-8px !text-13px !text-t-secondary opacity-75 transition-opacity hover:opacity-100 ${styles.assistantSelectorInactive}`}
                >
                  <span>{t('common.more', { defaultValue: 'More' })}</span>
                  <Down theme='outline' size={14} />
                </Button>
              </Dropdown>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantSelectionArea;
