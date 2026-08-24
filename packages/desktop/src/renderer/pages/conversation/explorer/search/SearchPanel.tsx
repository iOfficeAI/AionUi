/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Project filename-search skin #2: a persistent search area at the top of the
 * Explorer column (search.md §结果 UI — "same stream, two skins"). Shares the
 * exact stream/ranking the `@`-mention dropdown uses (useFileSearch → searchStore
 * → rankSearchHits).
 *
 * Layout: the search input is always present. While the query is empty the tree
 * (passed as `children`) shows; while it is non-empty a flat, streaming result
 * list replaces it. The tree stays MOUNTED across that toggle (display switch,
 * not unmount) so its WS subscriptions never thrash — empty↔non-empty is free.
 *
 * Interaction (product decision Y — find the file, don't presume intent):
 *   - clicking a result = reveal (locate in the tree), NOT preview;
 *   - add-to-chat is an explicit per-row action, shown only when a conversation
 *     is active. Preview is a deferred feature — no action wired here yet.
 */

import { Button, Input } from '@arco-design/web-react';
import { Plus, Search } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DirRef } from '../explorerModel';
import FileTypeIcon from '../fileIcon/FileTypeIcon';
import { useFileSearch } from './useFileSearch';
import { type PeNameMap, peLabeledPath, type SearchHit, searchHitKey } from './searchModel';
import { PANEL_SEARCH_OWNER } from './searchStore';

export type SearchPanelProps = {
  /** Search roots = the project's bound folders (each a pe root, rel=''). */
  roots: DirRef[];
  /** pe_id → folder name for the `PE · REL` secondary label (multi-folder). */
  peNames: PeNameMap;
  /** Locate a hit in the tree (expand ancestors + select). Default click action. */
  onRevealHit: (hit: SearchHit) => void;
  /** Explicit add-to-chat for a hit. Omit to hide the action (no active conversation). */
  onAddHit?: (hit: SearchHit) => void;
  /** The Explorer tree — kept mounted underneath; shown only while the query is empty. */
  children: React.ReactNode;
};

export const SearchPanel: React.FC<SearchPanelProps> = ({ roots, peNames, onRevealHit, onAddHit, children }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { view, runSearch, cancel } = useFileSearch(PANEL_SEARCH_OWNER, roots);

  const active = query.trim().length > 0;
  // Render results only while this panel owns the shared stream. If the `@`
  // mention took over, the view holds its results — suppress them here so the
  // panel doesn't flash the other skin's hits (mutual exclusion).
  const owned = view.owner === PANEL_SEARCH_OWNER;

  const onQueryChange = useCallback(
    (value: string): void => {
      setQuery(value);
      if (value.trim().length > 0) {
        runSearch(value);
      } else {
        cancel();
      }
    },
    [runSearch, cancel]
  );

  // Reveal + EXIT search: locate the hit in the tree, then clear the query so the
  // covering result list collapses and the (now-revealed) tree is visible. Without
  // the clear, the result list stays on top and hides the reveal (bug #2).
  const handleReveal = useCallback(
    (hit: SearchHit): void => {
      onRevealHit(hit);
      setQuery('');
      cancel();
    },
    [onRevealHit, cancel]
  );

  const rows = owned ? view.hits : []; // non-owner: show nothing (the other skin owns the stream)
  const showSearching = owned && view.status === 'searching' && rows.length === 0;
  const showEmpty = owned && view.status === 'done' && rows.length === 0;

  return (
    <div className='h-full flex flex-col min-h-0'>
      {/* pt-8px 让搜索框跟上方 tab 栏那条分割线拉开距离，不再贴着它。
          ps-12px 把输入框外框对到面板基准线；输入框自带 12px 内边距会把里面的放大镜
          推到 24px，用 !ps-8px 收成 8px，图标正好落在 20px —— 与 tab 文字、树箭头
          同一条线（见 ExplorerContainer.tsx 的基准线说明）。

          pt-8px lifts the box off the tab bar's bottom border instead of touching it.
          ps-12px puts the input's outer border on the panel baseline; the input's own
          12px inner padding would push the magnifier to 24px, so !ps-8px trims it to
          8px and lands the icon at 20px — the same line as the tab text and the tree
          arrow (see the baseline note in ExplorerContainer.tsx). */}
      <div className='flex-shrink-0 ps-12px pe-8px pt-8px pb-4px'>
        <Input
          value={query}
          onChange={onQueryChange}
          allowClear
          size='small'
          className='[&_.arco-input-inner-wrapper]:!ps-8px'
          prefix={<Search theme='outline' size='14' />}
          placeholder={t('conversation.explorer.search.placeholder')}
          aria-label={t('conversation.explorer.search.placeholder')}
        />
      </div>

      {/* Tree slot — always mounted; hidden (not unmounted) only while THIS panel
          owns an active search. If the `@` mention took the stream, fall back to
          showing the tree (never a blank pane) even though our query is non-empty
          — the user re-owns by typing in the box again.

          ps-12px 把树的行外框放到面板基准线上；行内箭头再由 arco-override.css 的
          .workspace-tree 规则补 8px，落到 20px。
          ps-12px puts the tree's row boxes on the panel baseline; the arrow inside
          is then offset a further 8px by the .workspace-tree rules in
          arco-override.css, landing at 20px. */}
      <div className='flex-1 min-h-0 overflow-auto ps-12px' style={active && owned ? { display: 'none' } : undefined}>
        {children}
      </div>

      {active && owned && (
        // ps-4px + 行自身 px-8px = 12px，与树、搜索框外框同一条基准线，
        // 这样输入时结果列表顶掉树的一刻不会横向跳动。
        // ps-4px plus each row's own px-8px lands on the same 12px baseline as the
        // tree and the search box, so the list replacing the tree as you type does
        // not shift sideways.
        <div className='flex-1 min-h-0 overflow-auto ps-4px pe-4px'>
          {showSearching && (
            <div className='px-8px py-6px text-t-secondary text-13px'>
              {t('conversation.explorer.search.searching')}
            </div>
          )}
          {showEmpty && (
            <div className='px-8px py-6px text-t-secondary text-13px'>{t('conversation.explorer.search.empty')}</div>
          )}
          {rows.map((hit) => (
            <div
              key={searchHitKey(hit)}
              role='button'
              tabIndex={0}
              onClick={() => handleReveal(hit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleReveal(hit);
                }
              }}
              className='group flex items-center gap-4px px-8px py-3px rd-4px cursor-pointer hover:bg-2 min-w-0'
              title={hit.relative_path}
            >
              <FileTypeIcon node={{ name: hit.name, relativePath: hit.relative_path, isFile: true }} />
              {/* File names/paths are code-like: keep LTR under an RTL document. */}
              <span dir='ltr' className='overflow-hidden text-ellipsis whitespace-nowrap flex-shrink-0 max-w-[45%]'>
                {hit.name}
              </span>
              <span
                dir='ltr'
                className='overflow-hidden text-ellipsis whitespace-nowrap text-t-tertiary text-12px flex-1 min-w-0'
              >
                {peLabeledPath(hit.pe_id, hit.relative_path, peNames)}
              </span>
              {onAddHit && (
                <Button
                  type='text'
                  size='mini'
                  className='flex-shrink-0 opacity-0 group-hover:opacity-100'
                  icon={<Plus theme='outline' size='14' />}
                  aria-label={t('conversation.explorer.contextMenu.addToChat')}
                  title={t('conversation.explorer.contextMenu.addToChat')}
                  onClick={(e) => {
                    e.stopPropagation(); // explicit action — must not trigger row reveal
                    onAddHit(hit);
                  }}
                />
              )}
            </div>
          ))}
          {owned && view.limitReached && (
            <div className='px-8px py-6px text-t-tertiary text-12px'>
              {t('conversation.explorer.search.limitReached', { count: view.total })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
