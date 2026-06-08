/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExpandLeft } from '@icon-park/react';

import ErrorBoundary from '@/renderer/components/base/ErrorBoundary';
import { useEditorContext } from '@/renderer/pages/conversation/Editor';
import { useLayoutModeSafe } from '@/renderer/hooks/context/LayoutModeContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';

const EditorLazyEntry = React.lazy(() => import('@/renderer/pages/conversation/Editor/editorLazyEntry'));

const EDITOR_BLADE_WIDTH_PX = 44;

type CommandCenterEditorHostProps = {
  /**
   * Workspace root passed to the lazy editor entry for tab restore. Supplied
   * on conversation/team routes (the active workspace path); omitted on other
   * routes (e.g. `/guid`).
   */
  workspaceRoot?: string;
};

/**
 * Command Center editor pane — single editor host.
 *
 * Extracted from the editor shell that previously lived inline in `ChatLayout`,
 * so there is one source of truth for the pane's chrome. Purely presentational
 * with respect to editor open/collapse state: it reads `isOpen` / `isCollapsed`
 * / `expandEditor` from `EditorContext` and renders:
 *   - expanded → editor at its resizable, persisted width (`chat-editor-width-px`)
 *   - blade    → a narrow 44px vertical "drawer handle" strip (collapsed-but-open)
 *   - closed   → a 0-width pane that still mounts the editor surface (kept warm),
 *                matching the prior in-`ChatLayout` behavior exactly.
 *
 * Visibility is gated to `command-center` layout mode; renders null otherwise.
 *
 * Phase 1 mounts this in place inside `ChatLayout` to prove visual/behavioral
 * parity; a later phase hoists it to the app shell.
 */
const CommandCenterEditorHost: React.FC<CommandCenterEditorHostProps> = ({ workspaceRoot }) => {
  const { t } = useTranslation();
  const layoutMode = useLayoutModeSafe();
  const activeMode = layoutMode?.mode ?? 'chat';
  const { isOpen, isCollapsed, expandEditor } = useEditorContext();
  const isExpanded = isOpen && !isCollapsed;
  const isBlade = isOpen && isCollapsed;

  const { splitRatio: editorWidthPx, createDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: 520,
    minWidth: 360,
    maxWidth: 960,
    storageKey: 'chat-editor-width-px',
  });

  const sizePx = isBlade ? EDITOR_BLADE_WIDTH_PX : isExpanded ? Math.round(editorWidthPx) : 0;

  if (activeMode !== 'command-center') {
    return null;
  }

  return (
    <div
      className={classNames(
        'editor-pane chat-pane relative layout-sider flex flex-col',
        isExpanded && 'editor-pane--expanded editor-pane-enter',
        isBlade && 'editor-pane--blade overflow-hidden',
        !isBlade && 'overflow-visible'
      )}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: `${sizePx}px`,
        width: `${sizePx}px`,
        minWidth: isBlade ? `${EDITOR_BLADE_WIDTH_PX}px` : isExpanded ? '360px' : '0px',
        overflow: isBlade ? 'hidden' : isExpanded ? 'visible' : 'hidden',
        boxSizing: 'border-box',
      }}
      aria-hidden={!isOpen}
    >
      {isBlade ? (
        <button
          type='button'
          className='editor-blade'
          onClick={expandEditor}
          aria-label={t('conversation.editor.expandEditor', { defaultValue: 'Expand editor' })}
          title={t('conversation.editor.expandEditor', { defaultValue: 'Expand editor' })}
        >
          <ExpandLeft size={16} className='editor-blade__icon' />
          <span className='editor-blade__label'>{t('conversation.editor.bladeLabel', { defaultValue: 'Editor' })}</span>
        </button>
      ) : (
        <>
          {isExpanded &&
            createDragHandle({ className: 'absolute left-0 top-0 bottom-0 z-30', style: {}, reverse: true })}
          <div className='h-full w-full overflow-hidden'>
            <React.Suspense
              fallback={
                <div className='editor-panel editor-panel__loading h-full flex items-center justify-center gap-2'>
                  <span>{t('common.loading')}</span>
                </div>
              }
            >
              <ErrorBoundary
                label={t('conversation.editor.bladeLabel', { defaultValue: 'Editor' })}
                onError={(err) => {
                  // eslint-disable-next-line no-console
                  console.error('[CommandCenterEditorHost] Editor chunk crashed; rendering fallback surface.', err);
                }}
              >
                <EditorLazyEntry workspaceRoot={workspaceRoot} />
              </ErrorBoundary>
            </React.Suspense>
          </div>
        </>
      )}
    </div>
  );
};

export default CommandCenterEditorHost;
