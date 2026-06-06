/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExpandLeft } from '@icon-park/react';

import { EditorPanel, useEditorContext } from '@/renderer/pages/conversation/Editor';
import { useLayoutModeSafe } from '@/renderer/hooks/context/LayoutModeContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';

const EDITOR_BLADE_WIDTH_PX = 44;

/**
 * App-wide editor pane.
 *
 * `ChatLayout` hosts its own editor pane on conversation/team routes, where it
 * is coupled to the diff view and the workspace split. This standalone pane
 * provides the same editor + collapse-blade on every *other* route (e.g.
 * `/guid`), so the titlebar's "Command Center" control can open the editor
 * anywhere — not just inside an active conversation.
 *
 * Editor-only by design: the diff view is a conversation-scoped concern (it
 * diffs the active workspace) and stays in `ChatLayout`.
 *
 * Mounted by `Layout.tsx` only when `ChatLayout` is NOT present (i.e. when
 * `workspaceAvailable` is false) so the two editors never render at once.
 * Visibility is driven by `EditorContext` (`isOpen` / `isCollapsed`); when
 * closed the pane stays mounted at width 0 so it can slide via the shared
 * `.editor-pane` width transition.
 */
const EditorPane: React.FC = () => {
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
    // Share the width preference with ChatLayout's editor so the pane keeps a
    // consistent size across routes.
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
      ) : isExpanded ? (
        <>
          {createDragHandle({ className: 'absolute left-0 top-0 bottom-0 z-30', style: {}, reverse: true })}
          <div className='h-full w-full overflow-hidden'>
            <EditorPanel />
          </div>
        </>
      ) : null}
    </div>
  );
};

export default EditorPane;
