/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import { ExpandLeft, ExpandRight } from '@icon-park/react';

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import ErrorBoundary from '@/renderer/components/base/ErrorBoundary';
import { useEditorContext } from '@/renderer/pages/conversation/Editor';
import { useLayoutModeSafe } from '@/renderer/hooks/context/LayoutModeContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import { useEditorDock } from '@/renderer/utils/layout/editorDock';

const EditorLazyEntry = React.lazy(() => import('@/renderer/pages/conversation/Editor/editorLazyEntry'));

const EDITOR_BLADE_WIDTH_PX = 44;

type CommandCenterEditorHostProps = {
  /**
   * Explicit workspace root override for the lazy editor entry (tab restore).
   * When omitted the host resolves it from the active conversation route, the
   * same way the Sider file tree does. Kept as an override for future
   * non-conversation hosts (e.g. `/guid`).
   */
  workspaceRoot?: string;
};

/**
 * Command Center editor pane — single, shell-level editor host.
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
 * Mounted once at the app shell (`Layout.tsx`) between the Sider and the chat
 * content on all non-team routes (conversation, `/guid`, settings), so the
 * editor reads as a peer column to the LEFT of chat. A later phase adds the
 * left/right dock-side preference.
 */
const CommandCenterEditorHost: React.FC<CommandCenterEditorHostProps> = ({ workspaceRoot }) => {
  const { t } = useTranslation();
  const layoutMode = useLayoutModeSafe();
  const activeMode = layoutMode?.mode ?? 'chat';
  const { isOpen, isCollapsed, expandEditor } = useEditorContext();
  const isExpanded = isOpen && !isCollapsed;
  const isBlade = isOpen && isCollapsed;

  // Dock side: 'start' = editor left of chat (default), 'end' = right of chat.
  // Drives the flex order, the resize-handle edge, the seam side (CSS), and the
  // blade chevron direction.
  const { dock } = useEditorDock();
  const isDockEnd = dock === 'end';

  // Resolve the active conversation's workspace root from the route `:id`
  // (mirrors SiderFileTree). Only fetched in command-center mode; an explicit
  // `workspaceRoot` prop, when provided, takes precedence.
  const { id: conversationId } = useParams<{ id: string }>();
  const { data: conversation } = useSWR<TChatConversation | undefined>(
    conversationId && activeMode === 'command-center' ? `command-center-editor.conversation.${conversationId}` : null,
    () => ipcBridge.conversation.get.invoke({ id: conversationId as string }),
    { revalidateOnFocus: false }
  );
  const resolvedWorkspaceRoot = workspaceRoot ?? conversation?.extra?.workspace;

  const { splitRatio: editorWidthPx, createDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: 520,
    // Generous, near-unrestricted operator range — the pane also flex-shrinks
    // (below) so it never forces its neighbors to overflow/clip regardless of
    // the chosen width.
    minWidth: 120,
    maxWidth: 2000,
    // Single shared editor width preference across all routes.
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
        isDockEnd ? 'editor-pane--dock-end' : 'editor-pane--dock-start',
        isExpanded && 'editor-pane--expanded editor-pane-enter',
        isBlade && 'editor-pane--blade overflow-hidden',
        !isBlade && 'overflow-visible'
      )}
      style={{
        // Flex order swaps the editor across the chat content without
        // reparenting (no Monaco remount): start → left of chat, end → right.
        // Chat content carries the complementary order in Layout; the
        // conversation pane stays pinned rightmost (order 3).
        order: isDockEnd ? 2 : 1,
        flexGrow: 0,
        // Expanded editor flex-shrinks so it yields space under viewport
        // pressure instead of forcing the chat / conversation pane to clip.
        // The blade (collapsed) and closed states stay rigid at their fixed
        // widths. `flexBasis` carries the operator's chosen width; `minWidth: 0`
        // removes the hard floor so the operator can size it freely.
        flexShrink: isExpanded ? 1 : 0,
        flexBasis: `${sizePx}px`,
        width: `${sizePx}px`,
        minWidth: isBlade ? `${EDITOR_BLADE_WIDTH_PX}px` : '0px',
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
          {isDockEnd ? (
            <ExpandLeft size={16} className='editor-blade__icon' />
          ) : (
            <ExpandRight size={16} className='editor-blade__icon' />
          )}
          <span className='editor-blade__label'>{t('conversation.editor.bladeLabel', { defaultValue: 'Editor' })}</span>
        </button>
      ) : (
        <>
          {/* Resize grip on the chat-facing edge of the editor: the RIGHT edge
              when docked left (drag right = wider), the LEFT edge when docked
              right (reverse → drag left = wider). */}
          {isExpanded &&
            createDragHandle({
              className: classNames('absolute top-0 bottom-0 z-30', isDockEnd ? 'left-0' : 'right-0'),
              style: {},
              reverse: isDockEnd,
            })}
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
                <EditorLazyEntry workspaceRoot={resolvedWorkspaceRoot} />
              </ErrorBoundary>
            </React.Suspense>
          </div>
        </>
      )}
    </div>
  );
};

export default CommandCenterEditorHost;
