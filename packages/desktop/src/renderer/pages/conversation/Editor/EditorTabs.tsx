/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import { CloseSmall, FolderOpen, Plus, Save, UploadLogs } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from './EditorContext';
import type { OpenBuffer } from './types';

type DragState = { fromKey: string | null };

const TAB_BTN_BASE =
  'group relative inline-flex items-center gap-6px h-32px px-12px text-12px font-medium border-r border-b-1 cursor-pointer select-none whitespace-nowrap transition-colors duration-100';

const PANE_ACTION_BTN =
  'inline-flex items-center justify-center w-28px h-28px rd-4px text-t-secondary hover:text-t-primary hover:bg-bg-3 transition-colors duration-100';

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

  // Middle-click closes tab — using onAuxClick on a role="tab" div, which the
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

  // Keep the active tab scrolled into view.
  useEffect(() => {
    if (!editor.activeKey) return;
    const el = stripRef.current?.querySelector(`[data-tab-key="${CSS.escape(editor.activeKey)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [editor.activeKey]);

  // Keyboard shortcuts: Cmd/Ctrl+W close, Cmd/Ctrl+Tab next, Cmd/Ctrl+Shift+Tab prev.
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

  const activeSaving = editor.activeBuffer?.saving ?? false;

  return (
    <div className='flex items-stretch h-36px bg-bg-2 border-b border-b-1 flex-shrink-0'>
      <div
        ref={stripRef}
        role='tablist'
        aria-label={t('conversation.editor.tabsList')}
        className='editor-tabs flex items-stretch flex-1 min-w-0 overflow-x-auto overflow-y-hidden'
      >
        {editor.buffers.map((b) => {
          const active = b.key === editor.activeKey;
          const dirty = isBufferDirty(b);
          const className = `${TAB_BTN_BASE} ${
            active
              ? 'bg-bg-1 text-t-primary border-b-transparent'
              : 'bg-bg-2 text-t-secondary hover:bg-bg-3 hover:text-t-primary'
          }`;
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
                {dirty && (
                  <span
                    className='w-6px h-6px rd-full bg-brand flex-shrink-0'
                    aria-label={t('conversation.editor.unsavedDot')}
                  />
                )}
                <span className='truncate max-w-220px'>{b.fileName}</span>
                <span
                  role='button'
                  aria-label={t('common.close')}
                  className='inline-flex items-center justify-center w-16px h-16px rd-4px opacity-60 hover:opacity-100 hover:bg-bg-3'
                  onClick={(e) => onCloseClick(e, b.key)}
                >
                  <CloseSmall size={12} />
                </span>
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className='flex items-center gap-2px px-6px border-l border-b-1 flex-shrink-0'>
        <Tooltip content={t('conversation.editor.newFile')} position='bottom' mini>
          <Button size='mini' type='text' className={PANE_ACTION_BTN} onClick={editor.openUntitledEditor}>
            <Plus size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('conversation.editor.openFile')} position='bottom' mini>
          <Button
            size='mini'
            type='text'
            className={PANE_ACTION_BTN}
            onClick={() => void editor.chooseAndOpenFile()}
          >
            <FolderOpen size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('common.save')} position='bottom' mini>
          <Button
            size='mini'
            type='text'
            className={PANE_ACTION_BTN}
            loading={activeSaving}
            onClick={() => void editor.saveEditorFile()}
          >
            <Save size={14} />
          </Button>
        </Tooltip>
        <span className='w-1px h-16px bg-bg-3 mx-2px' aria-hidden />
        <Tooltip content={t('conversation.editor.collapseEditor')} position='bottom' mini>
          <Button size='mini' type='text' className={PANE_ACTION_BTN} onClick={editor.collapseEditor}>
            <UploadLogs size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('common.close')} position='bottom' mini>
          <Button size='mini' type='text' className={PANE_ACTION_BTN} onClick={editor.requestCloseEditor}>
            <CloseSmall size={14} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default EditorTabs;
