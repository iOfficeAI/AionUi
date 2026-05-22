/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Close } from '@icon-park/react';
import styles from './FilterPopover.module.css';

export type TimeFilter = 'today' | 'week' | 'month' | 'older' | null;

export interface LibraryFilter {
  agents: string[]; // selected agent display names
  time: TimeFilter;
}

export const EMPTY_FILTER: LibraryFilter = { agents: [], time: null };

export function isFilterEmpty(f: LibraryFilter): boolean {
  return f.agents.length === 0 && f.time === null;
}

export function filterCount(f: LibraryFilter): number {
  return (f.agents.length > 0 ? 1 : 0) + (f.time !== null ? 1 : 0);
}

interface FilterPopoverProps {
  filter: LibraryFilter;
  allAgents: string[]; // all unique agent names from assets
  onChange: (f: LibraryFilter) => void;
}

const TIME_OPTIONS: { key: NonNullable<TimeFilter>; i18nKey: string }[] = [
  { key: 'today', i18nKey: 'library.bucket.today' },
  { key: 'week', i18nKey: 'library.bucket.week' },
  { key: 'month', i18nKey: 'library.bucket.month' },
  { key: 'older', i18nKey: 'library.bucket.older' },
];

const FilterPopover: React.FC<FilterPopoverProps> = ({ filter, allAgents, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [panelPos, setPanelPos] = React.useState({ top: 0, right: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleAgent = (agent: string) => {
    const next = filter.agents.includes(agent) ? filter.agents.filter((a) => a !== agent) : [...filter.agents, agent];
    onChange({ ...filter, agents: next });
  };

  const setTime = (value: TimeFilter) => {
    onChange({ ...filter, time: filter.time === value ? null : value });
  };

  const clear = () => onChange(EMPTY_FILTER);

  const empty = isFilterEmpty(filter);

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        type='button'
        className={`${styles.filterBtn}${!empty ? ` ${styles.active}` : ''}`}
        onClick={() => {
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setPanelPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
          }
          setOpen((v) => !v);
        }}
      >
        <Filter theme='outline' size='13' fill='currentColor' />
        {t('library.filter.button')}
      </button>

      {open && (
        <div
          ref={panelRef}
          className={styles.panel}
          style={{ position: 'fixed', top: panelPos.top, right: panelPos.right, zIndex: 9999 }}
        >
          {/* Agent section */}
          {allAgents.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t('library.filter.agent')}</div>
              <div className={styles.agentList}>
                {allAgents.map((agent) => {
                  const selected = filter.agents.includes(agent);
                  return (
                    <div
                      key={agent}
                      className={`${styles.agentItem}${selected ? ` ${styles.selected}` : ''}`}
                      onClick={() => toggleAgent(agent)}
                    >
                      <span className={styles.agentCheck}>
                        {selected && (
                          <svg width='9' height='7' viewBox='0 0 9 7' fill='none'>
                            <path
                              d='M1 3.5L3.5 6L8 1'
                              stroke='white'
                              strokeWidth='1.5'
                              strokeLinecap='round'
                              strokeLinejoin='round'
                            />
                          </svg>
                        )}
                      </span>
                      {agent}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time section */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>{t('library.filter.time')}</div>
            <div className={styles.timeList}>
              {TIME_OPTIONS.map(({ key, i18nKey }) => (
                <div
                  key={key}
                  className={`${styles.timeChip}${filter.time === key ? ` ${styles.selected}` : ''}`}
                  onClick={() => setTime(key)}
                >
                  {t(i18nKey)}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          {!empty && (
            <div className={styles.footer}>
              <button type='button' className={styles.clearBtn} onClick={clear}>
                {t('library.filter.clear')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterPopover;

// ── Active filter tags (shown in toolbar) ─────────────────────────────────────

interface FilterTagsProps {
  filter: LibraryFilter;
  onChange: (f: LibraryFilter) => void;
}

export const FilterTags: React.FC<FilterTagsProps> = ({ filter, onChange }) => {
  const { t } = useTranslation();
  if (isFilterEmpty(filter)) return null;

  const removeAgent = (agent: string) => onChange({ ...filter, agents: filter.agents.filter((a) => a !== agent) });
  const removeTime = () => onChange({ ...filter, time: null });

  const timeLabel = filter.time ? TIME_OPTIONS.find((o) => o.key === filter.time) : null;

  return (
    <div className={styles.tagsRow}>
      {filter.agents.map((agent) => (
        <span key={agent} className={styles.tag}>
          {agent}
          <span className={styles.tagClose} onClick={() => removeAgent(agent)}>
            <Close theme='outline' size='10' fill='currentColor' />
          </span>
        </span>
      ))}
      {timeLabel && (
        <span className={styles.tag}>
          {t(timeLabel.i18nKey)}
          <span className={styles.tagClose} onClick={removeTime}>
            <Close theme='outline' size='10' fill='currentColor' />
          </span>
        </span>
      )}
    </div>
  );
};
