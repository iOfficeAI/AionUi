/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tab strip for the editor pane. Matches `Preview/components/PreviewPanel/PreviewTabs.tsx`
 * — same height (36px), same active/inactive coloring (bg-bg-1 vs bg-bg-2),
 * same close button (Close at size 14). The editor sits beside the preview
 * in the same workspace; its tabs should read as the same kind of object.
 */

import { Tooltip } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from './EditorContext';
import { badgeForFileName } from './fileTypeBadge';
import type { OpenBuffer } from './types';

type DragState = { fromKey: string | null };

const isBufferDirty = (b: OpenBuffer): boolean => b.content !== b.originalContent;

const EditorTabs: React.FC = () => {
  const { t } = useTranslation();
  const editor = useEditorContext();
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>({ fromKey: null });

  const onTabClick = useCallback(
    (key: string) => {
      editor.setActiveBuffer(key);
    },
    [editor]
  );

  // Middle-click closes tab. Using onAuxClick on a role="tab" div, which the
  // AionUi raw-HTML rule allows (the rule applies to interactive form
  // controls, not ARIA-roled divs).
  const onTabAuxClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, key: string) => {
      if (e.button === 1) {
        e.preventDefault();
        editor.requestCloseBuffer(key);
      }
    },
    [editor]
  );

  const onCloseClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, key: string) => {
      e.stopPropagation();
      e.preventDefault();
      editor.requestCloseBuffer(key);
    },
    [editor]
  );

  // Horizontal scroll on wheel — vertical scroll wheels become horizontal,
  // matching common editor tab behavior.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  useEffect(() => {
    if (!editor.activeKey) return;
    const el = stripRef.current?.querySelector(`[data-tab-key="${CSS.escape(editor.activeKey)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [editor.activeKey]);

  // Cmd/Ctrl+W close, Cmd/Ctrl+Tab next, Cmd/Ctrl+Shift+Tab prev.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'w' || e.key === 'W') {
        if (editor.buffers.length === 0) return;
        e.preventDefault();
        editor.requestCloseBuffer();
        return;
      }
      if (e.key === 'Tab') {
        if (editor.buffers.length < 2 || !editor.activeKey) return;
        e.preventDefault();
        const idx = editor.buffers.findIndex((b) => b.key === editor.activeKey);
        const dir = e.shiftKey ? -1 : 1;
        const next = editor.buffers[(idx + dir + editor.buffers.length) % editor.buffers.length];
        editor.setActiveBuffer(next.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const onDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, key: string) => {
    setDrag({ fromKey: key });
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, toKey: string) => {
      e.preventDefault();
      if (drag.fromKey && drag.fromKey !== toKey) {
        editor.reorderBuffers(drag.fromKey, toKey);
      }
      setDrag({ fromKey: null });
    },
    [drag.fromKey, editor]
  );
  const onDragEnd = useCallback(() => setDrag({ fromKey: null }), []);

  if (editor.buffers.length === 0) return null;

  return (
    <div
      ref={stripRef}
      role='tablist'
      aria-label={t('conversation.editor.tabsList')}
      // Match PreviewTabs: 36px tall, bg-bg-2 base, bottom border using --border-base
      // so the bar visually rhymes with the preview panel above/beside it.
      className='editor-tabs flex items-stretch bg-bg-2 flex-shrink-0 overflow-x-auto overflow-y-hidden h-36px'
      style={{ borderBottom: '1px solid var(--border-base)' }}
    >
      {editor.buffers.map((b) => {
        const active = b.key === editor.activeKey;
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
                    <span
                      className='editor-tab__badge'
                      style={{ background: badge.bg, color: badge.fg }}
                      aria-hidden
                    >
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
