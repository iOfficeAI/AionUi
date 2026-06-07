/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Input } from '@arco-design/web-react';
import { Star } from '@icon-park/react';
import React, { memo, useContext, useMemo, useState, type ReactNode } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { ModelSelectorDropdownContext } from './ModelSelectorDropdownContext';
import { computeModelListHeight } from './modelSelectorDropdownLayout';
import styles from './ModelSelectorDropdownMenu.module.css';
import {
  groupModelOptions,
  parseFavoriteModelKeys,
  serializeFavoriteModelKeys,
  type ModelSelectorOptionBase,
} from './modelSelectorUtils';

export const MODEL_SELECTOR_FAVORITES_STORAGE_KEY = 'model-selector.favorite-models.v1';

export type GroupedModelDropdownOption = ModelSelectorOptionBase & {
  leading?: ReactNode;
  testId?: string;
};

type ModelSelectorDropdownMenuProps = {
  options: GroupedModelDropdownOption[];
  selectedOptionKey?: string;
  onSelect: (option: GroupedModelDropdownOption) => void;
  searchPlaceholder: string;
  favoritesLabel: string;
  providerFallbackLabel: string;
  noMatchesLabel: string;
  addFavoriteLabel: string;
  removeFavoriteLabel: string;
  footer?: ReactNode;
  storageKey?: string;
};

type VirtualRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'divider'; id: string }
  | { kind: 'option'; id: string; option: GroupedModelDropdownOption }
  | { kind: 'empty'; id: string; label: string };

function readFavoriteKeys(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseFavoriteModelKeys(window.localStorage.getItem(storageKey));
  } catch {
    return [];
  }
}

function writeFavoriteKeys(storageKey: string, keys: Iterable<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, serializeFavoriteModelKeys(keys));
  } catch {
    // Ignore storage failures so model selection still works in restricted browser contexts.
  }
}

function buildVirtualRows(
  favoriteOptions: GroupedModelDropdownOption[],
  groups: ReturnType<typeof groupModelOptions<GroupedModelDropdownOption>>,
  favoritesLabel: string,
  noMatchesLabel: string
): VirtualRow[] {
  const rows: VirtualRow[] = [];

  if (favoriteOptions.length > 0) {
    rows.push({ kind: 'header', id: 'header-favorites', label: favoritesLabel });
    for (const option of favoriteOptions) {
      rows.push({ kind: 'option', id: `favorite:${option.key}`, option });
    }
  }

  groups.forEach((group, index) => {
    if (index > 0 || favoriteOptions.length > 0) {
      rows.push({ kind: 'divider', id: `divider-${group.key}` });
    }
    rows.push({ kind: 'header', id: `header-${group.key}`, label: group.label });
    for (const option of group.options) {
      rows.push({ kind: 'option', id: `provider:${group.key}:${option.key}`, option });
    }
  });

  if (rows.length === 0) {
    rows.push({ kind: 'empty', id: 'no-matching-models', label: noMatchesLabel });
  }

  return rows;
}

type ModelOptionRowProps = {
  option: GroupedModelDropdownOption;
  selected: boolean;
  isFavorite: boolean;
  favoriteLabel: string;
  onSelect: (option: GroupedModelDropdownOption) => void;
  onToggleFavorite: (key: string) => void;
};

const ModelOptionRow = memo(function ModelOptionRow({
  option,
  selected,
  isFavorite,
  favoriteLabel,
  onSelect,
  onToggleFavorite,
}: ModelOptionRowProps) {
  return (
    <div
      role='menuitem'
      data-model-option-row
      data-testid={option.testId}
      className={`${styles.option} ${selected ? styles.selected : ''}`}
      onClick={() => onSelect(option)}
    >
      <div className='flex items-center gap-8px w-full min-w-0'>
        {option.leading}
        <span className={`flex-1 ${styles.optionLabel}`}>{option.label}</span>
        <button
          type='button'
          aria-label={favoriteLabel}
          title={favoriteLabel}
          className={styles.favoriteButton}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite(option.key);
          }}
        >
          <Star
            theme={isFavorite ? 'filled' : 'outline'}
            size='14'
            fill={isFavorite ? iconColors.warning : iconColors.secondary}
          />
        </button>
      </div>
    </div>
  );
});

const ModelSelectorDropdownMenu: React.FC<ModelSelectorDropdownMenuProps> = ({
  options,
  selectedOptionKey,
  onSelect,
  searchPlaceholder,
  favoritesLabel,
  providerFallbackLabel,
  noMatchesLabel,
  addFavoriteLabel,
  removeFavoriteLabel,
  footer,
  storageKey = MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
}) => {
  const { close, panelMaxHeight } = useContext(ModelSelectorDropdownContext);
  const [searchValue, setSearchValue] = useState('');
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => readFavoriteKeys(storageKey));

  const listHeight = useMemo(() => computeModelListHeight(panelMaxHeight, Boolean(footer)), [footer, panelMaxHeight]);

  const optionsByKey = useMemo(() => new Map(options.map((option) => [option.key, option])), [options]);
  const favoriteKeySet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

  const favoriteOptions = useMemo(
    () =>
      favoriteKeys
        .map((key) => optionsByKey.get(key))
        .filter((option): option is GroupedModelDropdownOption => Boolean(option)),
    [favoriteKeys, optionsByKey]
  );

  const groups = useMemo(
    () => groupModelOptions(options, searchValue, providerFallbackLabel),
    [options, providerFallbackLabel, searchValue]
  );

  const rows = useMemo(
    () => buildVirtualRows(favoriteOptions, groups, favoritesLabel, noMatchesLabel),
    [favoriteOptions, favoritesLabel, groups, noMatchesLabel]
  );

  const toggleFavorite = (key: string) => {
    setFavoriteKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((favoriteKey) => favoriteKey !== key) : [...prev, key];
      writeFavoriteKeys(storageKey, next);
      return next;
    });
  };

  const handleSelect = (option: GroupedModelDropdownOption) => {
    onSelect(option);
    close();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.searchWrap}>
        <Input
          allowClear
          size='small'
          className={styles.searchInput}
          value={searchValue}
          onChange={setSearchValue}
          placeholder={searchPlaceholder}
        />
      </div>
      <div className={styles.menuList} role='menu'>
        <Virtuoso
          style={{ height: listHeight }}
          data={rows}
          defaultItemHeight={34}
          increaseViewportBy={{ top: 160, bottom: 320 }}
          itemContent={(_index, row) => {
            switch (row.kind) {
              case 'header':
                return (
                  <div className={styles.groupHeader} role='presentation'>
                    {row.label}
                  </div>
                );
              case 'divider':
                return (
                  <div className={styles.groupDivider} role='separator'>
                    <div className={styles.dividerLine} />
                  </div>
                );
              case 'empty':
                return (
                  <div className={styles.emptyOption} role='presentation'>
                    {row.label}
                  </div>
                );
              case 'option': {
                const isFavorite = favoriteKeySet.has(row.option.key);
                return (
                  <ModelOptionRow
                    option={row.option}
                    selected={row.option.key === selectedOptionKey}
                    isFavorite={isFavorite}
                    favoriteLabel={isFavorite ? removeFavoriteLabel : addFavoriteLabel}
                    onSelect={handleSelect}
                    onToggleFavorite={toggleFavorite}
                  />
                );
              }
              default:
                return null;
            }
          }}
        />
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
};

export default memo(ModelSelectorDropdownMenu);
