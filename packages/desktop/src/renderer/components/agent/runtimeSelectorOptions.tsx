/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpConfigSetStatus, AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import AionInlineSearchInput from '@/renderer/components/base/AionInlineSearchInput';
import { Menu, Tooltip } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Above this model count the model list gains a search box. */
export const MODEL_SEARCH_THRESHOLD = 5;

/** Trigger props for a Menu.SubMenu: fly out to the left, auto-flip when there is no room. */
export const RUNTIME_SUBMENU_TRIGGER_PROPS = { position: 'lt', autoFitPosition: true } as const;

type RuntimeSelectorModel = { id: string; label?: string; description?: string };

/** A titled group of models (e.g. one provider), used by the grouped model list. */
export type RuntimeSelectorModelGroup = { key: string; title: string; models: RuntimeSelectorModel[] };

const matchesModelQuery = (model: RuntimeSelectorModel, keyword: string): boolean =>
  (model.label || model.id).toLowerCase().includes(keyword);

export const getCurrentThoughtLevelLabel = (thoughtLevel: AcpDerivedOption | null | undefined): string => {
  if (!thoughtLevel) return '';
  return (
    thoughtLevel.options.find((item) => item.value === thoughtLevel.currentValue)?.label ||
    thoughtLevel.currentValue ||
    ''
  );
};

export const composeRuntimeSelectorLabel = ({
  modelLabel,
  thoughtLevel,
}: {
  modelLabel: string;
  thoughtLevel?: AcpDerivedOption | null;
}): string => {
  const thoughtLevelLabel = getCurrentThoughtLevelLabel(thoughtLevel);
  if (!thoughtLevelLabel) return modelLabel;
  return `${modelLabel} · ${thoughtLevelLabel}`;
};

export const isConfigSetting = (setStatus?: AcpConfigSetStatus): boolean => setStatus?.state === 'setting';

export const RuntimeSelectorCheckedItem: React.FC<{
  selected: boolean;
  description?: React.ReactNode;
  children: React.ReactNode;
}> = ({ selected, description, children }) => {
  const content = (
    <div className='flex items-center gap-8px w-full min-w-0'>
      <span aria-hidden='true' className='w-16px shrink-0 text-primary'>
        {selected ? '\u2713' : ''}
      </span>
      <span className='min-w-0 truncate'>{children}</span>
    </div>
  );

  return description ? (
    <Tooltip content={description} position='right'>
      {content}
    </Tooltip>
  ) : (
    content
  );
};

/**
 * Title row for a first-level entry in the two-level runtime selector:
 * `Label ............ currentValue`. Menu.SubMenu renders its own expand arrow,
 * so we must not add another chevron here.
 */
export const RuntimeSelectorSubMenuTitle: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className='flex items-center justify-between gap-8px w-full min-w-0'>
    <span className='shrink-0'>{label}</span>
    <span className='min-w-0 truncate text-t-tertiary'>{value}</span>
  </div>
);

/**
 * Model options with search + fixed-height scroll. Reused by:
 * - the direct dropdown (no thought level) and the model submenu — flat via `models`;
 * - the aionrs selector — provider-grouped via `groups`.
 * Search box shows only when the total model count exceeds MODEL_SEARCH_THRESHOLD;
 * filtering is client-side, case-insensitive on label/id, and spans all groups.
 */
export const RuntimeSelectorModelList: React.FC<{
  models?: RuntimeSelectorModel[];
  groups?: RuntimeSelectorModelGroup[];
  currentModelId?: string | null;
  disabled?: boolean;
  onSelect: (modelId: string) => void;
}> = ({ models, groups, currentModelId, disabled = false, onSelect }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const totalCount = groups ? groups.reduce((sum, group) => sum + group.models.length, 0) : (models?.length ?? 0);
  const showSearch = totalCount > MODEL_SEARCH_THRESHOLD;
  const keyword = query.trim().toLowerCase();

  const filteredModels = useMemo(() => {
    if (!models) return [];
    if (!keyword) return models;
    return models.filter((model) => matchesModelQuery(model, keyword));
  }, [models, keyword]);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    return groups
      .map((group) => ({
        ...group,
        models: keyword ? group.models.filter((m) => matchesModelQuery(m, keyword)) : group.models,
      }))
      .filter((group) => group.models.length > 0);
  }, [groups, keyword]);

  const renderRow = (model: RuntimeSelectorModel) => (
    <Menu.Item
      key={model.id}
      className={model.id === currentModelId ? 'bg-2!' : ''}
      onClick={() => {
        if (!disabled) onSelect(model.id);
      }}
    >
      <RuntimeSelectorCheckedItem selected={model.id === currentModelId} description={model.description}>
        {model.label || model.id}
      </RuntimeSelectorCheckedItem>
    </Menu.Item>
  );

  const isEmpty = groups ? filteredGroups.length === 0 : filteredModels.length === 0;

  // Layout: a fixed (non-scrolling) search box on top, and a single scroll
  // container below for the list (`.runtime-model-scroll`). The host Arco popup's
  // own scroll/height cap is disabled via a CSS override keyed off
  // `:has(.runtime-model-scroll)`, so there is exactly one scrollbar — this one.
  // The search box lives outside it, so it never moves or leaves a gap, and
  // provider group titles pin to the top of the scroll container cleanly.
  return (
    <>
      {showSearch ? (
        <div className='px-6px pt-4px pb-6px' style={{ background: 'var(--color-bg-popup)' }}>
          <AionInlineSearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('agent.model.searchPlaceholder', { defaultValue: 'Search models' })}
            data-testid='runtime-selector-model-search'
          />
        </div>
      ) : null}
      <div className='runtime-model-scroll max-h-280px overflow-y-auto'>
        {isEmpty ? (
          <div className='px-12px py-10px text-12px text-t-tertiary text-center'>
            {t('agent.model.noResults', { defaultValue: 'No matching models' })}
          </div>
        ) : groups ? (
          filteredGroups.map((group) => (
            <Menu.ItemGroup key={group.key} title={group.title}>
              {group.models.map(renderRow)}
            </Menu.ItemGroup>
          ))
        ) : (
          filteredModels.map(renderRow)
        )}
      </div>
    </>
  );
};
