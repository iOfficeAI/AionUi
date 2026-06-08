/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editor tab affordance. Renders in two modes depending on Phase 9's
 * `expertMode` flag:
 *
 *   - Calm (default): single-file breadcrumb header, or compact pill list
 *     when 2+ buffers are open. Pills are 28px, rounded-control, with a 2px
 *     brand bottom-border on the active pill. Hover reveals the close
 *     affordance. Horizontal scroll has arrow buttons at the edges when
 *     overflow is present.
 *
 *   - Expert: the prior 36px PreviewTabs-style strip with file-type badges,
 *     dirty dots, drag-to-reorder, and middle-click close.
 *
 * Drag-to-reorder, middle-click close, Cmd/Ctrl+W, and Cmd/Ctrl+Tab cycle
 * are preserved in both modes — the calm view is a presentation change, not
 * a feature regression.
 */

import { Tooltip } from '@arco-design/web-react';
import { Close, Left, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from './EditorContext';
import { badgeForFileName } from './fileTypeBadge';
import type { OpenBuffer } from './types';

type DragState = { fromKey: string | null };

/** DnD payload MIME for moving a tab across split groups. */
const TAB_DND_MIME = 'application/x-aionui-editor-tab';

type TabDragPayload = { groupId: string; key: string };

const readTabDragPayload = (e: React.DragEvent): TabDragPayload | null => {
  try {
    const raw = e.dataTransfer.getData(TAB_DND_MIME);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as TabDragPayload).groupId === 'string' &&
      typeof (parsed as TabDragPayload).key === 'string'
    ) {
      return parsed as TabDragPayload;
    }
  } catch {
    /* not our payload */
  }
  return null;
};

const isBufferDirty = (b: OpenBuffer): boolean => b.content !== b.originalContent;

const breadcrumbPathFor = (buffer: OpenBuffer): string => buffer.filePath ?? buffer.fileName;

type Props = {
  expertMode: boolean;
  /** When set, the strip is scoped to a single split group. Defaults to the focused group. */
  groupId?: string;
  /** Whether this strip's group is focused — gates the global keyboard shortcuts. */
  isFocused?: boolean;
};

const EditorTabs: React.FC<Props> = ({ expertMode, groupId, isFocused = true }) => {
  const { t } = useTranslation();
  const editor = useEditorContext();
  // Resolve the group this strip represents. Falls back to the focused group
  // so legacy single-group call sites keep working unchanged.
  const resolvedGroupId = groupId ?? editor.activeGroupId;
  const group = editor.groups.find((g) => g.id === resolvedGroupId) ?? null;
  const tabBuffers: OpenBuffer[] = group
    ? group.bufferKeys.map((k) => editor.buffers.find((b) => b.key === k)).filter((b): b is OpenBuffer => Boolean(b))
    : editor.buffers;
  const activeKey = group ? group.activeKey : editor.activeKey;
  const activate = useCallback(
    (key: string) => editor.setActiveBufferInGroup(resolvedGroupId, key),
    [editor, resolvedGroupId]
  );
  const closeTab = useCallback(
    (key?: string) => editor.requestCloseBufferInGroup(resolvedGroupId, key),
    [editor, resolvedGroupId]
  );
  const reorder = useCallback(
    (fromKey: string, toKey: string) => editor.reorderWithinGroup(resolvedGroupId, fromKey, toKey),
    [editor, resolvedGroupId]
  );
  const stripRef = useRef<HTMLDivElement | null>(null);
  const pillScrollRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>({ fromKey: null });
  const [pillOverflow, setPillOverflow] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  const onTabClick = useCallback(
    (key: string) => {
      activate(key);
    },
    [activate]
  );

  // Middle-click closes a tab. Preserved in both calm-pill and expert modes
  // because users have built muscle memory for it. Using onAuxClick on an
  // ARIA-roled div is permitted by the AionUi raw-HTML rule.
  const onTabAuxClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, key: string) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(key);
      }
    },
    [closeTab]
  );

  const onCloseClick = useCallback(
    (e: React.MouseEvent<HTMLElement>, key: string) => {
      e.stopPropagation();
      e.preventDefault();
      closeTab(key);
    },
    [closeTab]
  );

  // Horizontal scroll on wheel — vertical scroll wheels become horizontal,
  // matching common editor tab behavior. Applied to whichever strip is
  // currently mounted (expert vs. calm pills).
  useEffect(() => {
    const el = expertMode ? stripRef.current : pillScrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [expertMode]);

  useEffect(() => {
    if (!activeKey) return;
    const root = expertMode ? stripRef.current : pillScrollRef.current;
    const el = root?.querySelector(`[data-tab-key="${CSS.escape(activeKey)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeKey, expertMode]);

  // Track pill overflow so the left/right arrow affordances only render when
  // the strip can actually scroll. Re-evaluated on buffer change, mode flip,
  // and resize.
  useEffect(() => {
    if (expertMode) return;
    const el = pillScrollRef.current;
    if (!el) return;
    const recompute = () => {
      const canLeft = el.scrollLeft > 1;
      const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setPillOverflow((prev) =>
        prev.left === canLeft && prev.right === canRight ? prev : { left: canLeft, right: canRight }
      );
    };
    recompute();
    el.addEventListener('scroll', recompute, { passive: true });
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', recompute);
      observer.disconnect();
    };
  }, [expertMode, tabBuffers.length, activeKey]);

  const scrollPills = useCallback((direction: 'left' | 'right') => {
    const el = pillScrollRef.current;
    if (!el) return;
    const delta = Math.max(120, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({ left: direction === 'left' ? -delta : delta, behavior: 'smooth' });
  }, []);

  // Cmd/Ctrl+W close, Cmd/Ctrl+Tab next, Cmd/Ctrl+Shift+Tab prev — same in
  // both modes.
  useEffect(() => {
    // Only the focused group's strip handles the global tab shortcuts, so a
    // split layout doesn't double-fire Cmd/Ctrl+W / Cmd/Ctrl+Tab.
    if (!isFocused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'w' || e.key === 'W') {
        if (tabBuffers.length === 0) return;
        e.preventDefault();
        closeTab();
        return;
      }
      if (e.key === 'Tab') {
        if (tabBuffers.length < 2 || !activeKey) return;
        e.preventDefault();
        const idx = tabBuffers.findIndex((b) => b.key === activeKey);
        const dir = e.shiftKey ? -1 : 1;
        const next = tabBuffers[(idx + dir + tabBuffers.length) % tabBuffers.length];
        activate(next.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocused, tabBuffers, activeKey, activate, closeTab]);

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, key: string) => {
      setDrag({ fromKey: key });
      e.dataTransfer.effectAllowed = 'move';
      // Carry the source group + key so a DROP in a DIFFERENT group's strip
      // (a separate EditorTabs instance) can move the tab across panes.
      try {
        e.dataTransfer.setData(TAB_DND_MIME, JSON.stringify({ groupId: resolvedGroupId, key }));
        e.dataTransfer.setData('text/plain', key);
      } catch {
        /* dataTransfer unavailable (older webview) — same-group reorder still works */
      }
    },
    [resolvedGroupId]
  );
  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, toKey: string) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = readTabDragPayload(e);
      if (payload) {
        if (payload.groupId === resolvedGroupId) {
          if (payload.key !== toKey) reorder(payload.key, toKey);
        } else {
          const idx = tabBuffers.findIndex((b) => b.key === toKey);
          editor.moveBufferToGroup(payload.key, payload.groupId, resolvedGroupId, idx < 0 ? undefined : idx);
        }
      } else if (drag.fromKey && drag.fromKey !== toKey) {
        reorder(drag.fromKey, toKey);
      }
      setDrag({ fromKey: null });
    },
    [drag.fromKey, reorder, resolvedGroupId, tabBuffers, editor]
  );
  // Drop on empty strip space → append the moved tab to the end of this group.
  const onStripDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const payload = readTabDragPayload(e);
      if (payload && payload.groupId !== resolvedGroupId) {
        e.preventDefault();
        editor.moveBufferToGroup(payload.key, payload.groupId, resolvedGroupId, tabBuffers.length);
      }
      setDrag({ fromKey: null });
    },
    [resolvedGroupId, tabBuffers.length, editor]
  );
  const onDragEnd = useCallback(() => setDrag({ fromKey: null }), []);

  if (tabBuffers.length === 0) return null;

  // --- Calm mode: single file → breadcrumb; 2+ files → pill list -------------
  if (!expertMode) {
    if (tabBuffers.length === 1) {
      const buffer = tabBuffers[0];
      const dirty = isBufferDirty(buffer);
      return (
        <div
          className='editor-tabs-breadcrumb'
          aria-label={t('conversation.editor.tabsList')}
          onDragOver={onDragOver}
          onDrop={onStripDrop}
        >
          <Tooltip content={buffer.filePath ?? buffer.fileName} position='bottom' mini>
            <span className='editor-tabs-breadcrumb__path'>{breadcrumbPathFor(buffer)}</span>
          </Tooltip>
          {dirty && <span className='editor-tabs-breadcrumb__dirty' aria-label={t('conversation.editor.unsavedDot')} />}
        </div>
      );
    }

    return (
      <div className='editor-tabs-pills' role='tablist' aria-label={t('conversation.editor.tabsList')}>
        {pillOverflow.left && (
          <button
            type='button'
            className='editor-tabs-pills__arrow editor-tabs-pills__arrow--left'
            onClick={() => scrollPills('left')}
            aria-label={t('common.scrollLeft', { defaultValue: 'Scroll left' })}
          >
            <Left size={14} />
          </button>
        )}
        <div ref={pillScrollRef} className='editor-tabs-pills__scroll' onDragOver={onDragOver} onDrop={onStripDrop}>
          {tabBuffers.map((b) => {
            const active = b.key === activeKey;
            const dirty = isBufferDirty(b);
            return (
              <Tooltip key={b.key} content={b.filePath ?? b.fileName} position='bottom' mini>
                <div
                  role='tab'
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  data-tab-key={b.key}
                  className={'editor-tabs-pill' + (active ? ' editor-tabs-pill--active' : '')}
                  draggable
                  onDragStart={(e) => onDragStart(e, b.key)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, b.key)}
                  onDragEnd={onDragEnd}
                  onClick={() => onTabClick(b.key)}
                  onAuxClick={(e) => onTabAuxClick(e, b.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTabClick(b.key);
                    }
                  }}
                >
                  <span className='truncate max-w-200px'>{b.fileName}</span>
                  {dirty && (
                    <span className='editor-tabs-pill__dirty' aria-label={t('conversation.editor.unsavedDot')} />
                  )}
                  <span
                    role='button'
                    aria-label={t('common.close')}
                    className='editor-tabs-pill__close'
                    onClick={(e) => onCloseClick(e, b.key)}
                  >
                    <Close size={12} strokeWidth={3} />
                  </span>
                </div>
              </Tooltip>
            );
          })}
        </div>
        {pillOverflow.right && (
          <button
            type='button'
            className='editor-tabs-pills__arrow editor-tabs-pills__arrow--right'
            onClick={() => scrollPills('right')}
            aria-label={t('common.scrollRight', { defaultValue: 'Scroll right' })}
          >
            <Right size={14} />
          </button>
        )}
      </div>
    );
  }

  // --- Expert mode: prior 36px strip ---------------------------------------
  return (
    <div
      ref={stripRef}
      role='tablist'
      aria-label={t('conversation.editor.tabsList')}
      // Match PreviewTabs: 36px tall, bg-bg-2 base, bottom border using --border-base
      // so the bar visually rhymes with the preview panel above/beside it.
      className='editor-tabs flex items-stretch bg-bg-2 flex-shrink-0 overflow-x-auto overflow-y-hidden h-36px'
      style={{ borderBottom: '1px solid var(--border-base)' }}
      onDragOver={onDragOver}
      onDrop={onStripDrop}
    >
      {tabBuffers.map((b) => {
        const active = b.key === activeKey;
        const dirty = isBufferDirty(b);
        // Active tab "lifts" out of the bar by taking the body bg (bg-1) —
        // matches PreviewTabs and the conversation pane's tab idiom.
        const className =
          'group relative flex items-center gap-6px px-10px h-full text-12px cursor-pointer select-none whitespace-nowrap transition-colors duration-150 flex-shrink-0 ' +
          (active ? 'bg-bg-1 text-t-primary' : 'text-t-secondary hover:bg-bg-3 hover:text-t-primary');
        return (
          <Tooltip key={b.key} content={b.filePath ?? b.fileName} position='bottom' mini>
            <div
              role='tab'
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-tab-key={b.key}
              className={className}
              draggable
              onDragStart={(e) => onDragStart(e, b.key)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, b.key)}
              onDragEnd={onDragEnd}
              onClick={() => onTabClick(b.key)}
              onAuxClick={(e) => onTabAuxClick(e, b.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTabClick(b.key);
                }
              }}
            >
              <span className='flex items-center gap-6px whitespace-nowrap'>
                {/* File-type badge — GitHub-style colored letter mark. Single biggest
                    "this is an editor" signal at a glance. Colors are explicit per
                    language, not theme-tokenised — yellow JS, blue TS, etc. */}
                {(() => {
                  const badge = badgeForFileName(b.fileName);
                  return (
                    <span className='editor-tab__badge' style={{ background: badge.bg, color: badge.fg }} aria-hidden>
                      {badge.label}
                    </span>
                  );
                })()}
                <span className='truncate max-w-220px'>{b.fileName}</span>
                {/* Dirty indicator matches PreviewTabs: 6px primary-colored dot, trailing the title. */}
                {dirty && (
                  <span
                    className='w-6px h-6px rd-full bg-primary inline-block'
                    aria-label={t('conversation.editor.unsavedDot')}
                  />
                )}
              </span>
              <span
                role='button'
                aria-label={t('common.close')}
                // Close affordance: visually defers until hover, then expresses
                // bg-3 lift — same family as PreviewTabs.
                className='inline-flex items-center justify-center w-16px h-16px rd-4px text-t-tertiary opacity-60 hover:opacity-100 hover:text-t-primary hover:bg-bg-3'
                onClick={(e) => onCloseClick(e, b.key)}
              >
                <Close size={14} strokeWidth={2} />
              </span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default EditorTabs;
