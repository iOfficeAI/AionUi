/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Button, Input, Menu, Tooltip } from '@arco-design/web-react';
import { Star } from '@icon-park/react';
import React, { useEffect, useState, type ReactNode } from 'react';
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
  const [searchValue, setSearchValue] = useState('');
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => readFavoriteKeys(storageKey));

  useEffect(() => {
    setFavoriteKeys(readFavoriteKeys(storageKey));
  }, [storageKey]);

  const optionsByKey = new Map(options.map((option) => [option.key, option]));
  const favoriteOptions = favoriteKeys
    .map((key) => optionsByKey.get(key))
    .filter((option): option is GroupedModelDropdownOption => Boolean(option));
  const favoriteKeySet = new Set(favoriteKeys);
  const groups = groupModelOptions(options, searchValue, providerFallbackLabel);
  const hasProviderMatches = groups.some((group) => group.options.length > 0);

  const toggleFavorite = (key: string) => {
    setFavoriteKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((favoriteKey) => favoriteKey !== key) : [...prev, key];
      writeFavoriteKeys(storageKey, next);
      return next;
    });
  };

  const renderOption = (option: GroupedModelDropdownOption, renderKey: string) => {
    const isFavorite = favoriteKeySet.has(option.key);
    const favoriteLabel = isFavorite ? removeFavoriteLabel : addFavoriteLabel;

    return (
      <Menu.Item
        key={renderKey}
        data-testid={option.testId}
        className={`${styles.option} ${option.key === selectedOptionKey ? styles.selected : ''}`}
        onClick={() => onSelect(option)}
      >
        <div className='flex items-center gap-8px w-full min-w-0'>
          {option.leading}
          <span className={`flex-1 ${styles.optionLabel}`}>{option.label}</span>
          <Tooltip content={favoriteLabel} position='top'>
            <Button
              type='text'
              size='mini'
              aria-label={favoriteLabel}
              className={`${styles.favoriteButton} shrink-0`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(option.key);
              }}
            >
              <Star
                theme={isFavorite ? 'filled' : 'outline'}
                size='14'
                fill={isFavorite ? iconColors.warning : iconColors.secondary}
              />
            </Button>
          </Tooltip>
        </div>
      </Menu.Item>
    );
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
      <Menu className={styles.menu}>
        {(() => {
          const nodes: React.ReactNode[] = [];

          // 1. Favorites Section
          if (favoriteOptions.length > 0) {
            nodes.push(
              <Menu.Item key='header-favorites' disabled className={styles.groupHeader}>
                {favoritesLabel}
              </Menu.Item>
            );
            favoriteOptions.forEach((option) => {
              nodes.push(renderOption(option, `favorite:${option.key}`));
            });
          }

          // 2. Provider Groups Section
          groups.forEach((group, index) => {
            // Add thick visual divider before provider groups
            if (index > 0 || favoriteOptions.length > 0) {
              nodes.push(
                <Menu.Item key={`divider-${group.key}`} disabled className={styles.groupDivider}>
                  <div className={styles.dividerLine} />
                </Menu.Item>
              );
            }

            // Provider Header
            nodes.push(
              <Menu.Item key={`header-${group.key}`} disabled className={styles.groupHeader}>
                {group.label}
              </Menu.Item>
            );

            // Provider Models
            group.options.forEach((option) => {
              nodes.push(renderOption(option, `provider:${group.key}:${option.key}`));
            });
          });

          return nodes;
        })()}

        {!hasProviderMatches && (
          <Menu.Item key='no-matching-models' className={styles.emptyOption} disabled>
            {noMatchesLabel}
          </Menu.Item>
        )}
      </Menu>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
};

export default ModelSelectorDropdownMenu;
