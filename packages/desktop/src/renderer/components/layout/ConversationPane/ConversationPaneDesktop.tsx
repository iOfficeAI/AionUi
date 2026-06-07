/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import { blurActiveElement } from '@/renderer/utils/ui/focus';
import { cleanupSiderTooltips } from '@/renderer/utils/ui/siderTooltip';

import ConversationPaneBottomPanel from './ConversationPaneBottomPanel';
import ConversationPaneHeader from './ConversationPaneHeader';
import styles from './ConversationPane.module.css';

const WorkspaceGroupedHistory = React.lazy(() => import('@/renderer/pages/conversation/GroupedHistory'));

const DEFAULT_PANE_WIDTH_PX = 300;
const MIN_PANE_WIDTH_PX = 240;
const MAX_PANE_WIDTH_PX = 560;
const PANE_WIDTH_STORAGE_KEY = 'aionui.conversationPaneWidth';

interface ConversationPaneDesktopProps {
  collapsed: boolean;
  onSessionClick?: () => void;
}

const ConversationPaneDesktop: React.FC<ConversationPaneDesktopProps> = ({ collapsed, onSessionClick }) => {
  const [isBatchMode, setIsBatchMode] = useState(false);
  const layout = useLayoutContext();
  const { closePreview } = usePreviewContext();
  const navigate = useNavigate();
  const { id: conversationId = '' } = useParams<{ id: string }>();

  // Drag-resizable width from the pane's left edge (reverse: dragging left
  // widens the right-docked pane). Persisted to localStorage.
  const { splitRatio: paneWidth, createDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: DEFAULT_PANE_WIDTH_PX,
    minWidth: MIN_PANE_WIDTH_PX,
    maxWidth: MAX_PANE_WIDTH_PX,
    storageKey: PANE_WIDTH_STORAGE_KEY,
  });

  // The width transition is ALWAYS on (so a collapse/expand toggle eases in
  // the very same render the width changes — mirrors the left sider's
  // `--duration-slow` / `--ease-out-expo` slide) and is suppressed only while
  // a resize-drag is in flight, so dragging stays pixel-perfect with no lag.
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    if (!isResizing) return;
    const stop = () => setIsResizing(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [isResizing]);

  const handleNewChat = useCallback(() => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    setIsBatchMode(false);
    Promise.resolve(navigate('/guid', { state: { resetAssistant: true } })).catch((error) => {
      console.error('Navigation failed:', error);
    });
    onSessionClick?.();
  }, [closePreview, navigate, onSessionClick]);

  const handleClosePane = useCallback(() => {
    layout?.setConversationPaneCollapsed(true);
  }, [layout]);

  const width = collapsed ? 0 : Math.round(paneWidth);

  return (
    <div
      className={classNames(styles.paneRoot, {
        [styles.paneAnimating]: !isResizing,
        [styles.paneCollapsed]: collapsed,
      })}
      style={{ width, flexBasis: width }}
      aria-hidden={collapsed}
    >
      {!collapsed && (
        <div style={{ display: 'contents' }} onPointerDown={() => setIsResizing(true)}>
          {createDragHandle({ className: 'left-0', reverse: true })}
        </div>
      )}
      <ConversationPaneHeader
        isBatchMode={isBatchMode}
        onToggleBatchMode={() => setIsBatchMode((prev) => !prev)}
        onNewChat={handleNewChat}
        onClose={handleClosePane}
        onSessionClick={onSessionClick}
      />
      <div className={styles.body}>
        <PanelGroup direction='vertical' autoSaveId='conversation-pane-split' className='size-full min-h-0'>
          <Panel defaultSize={60} minSize={20} className='min-h-0 overflow-hidden'>
            <div className={styles.bodyInner}>
              <Suspense fallback={<div className='min-h-200px' />}>
                <WorkspaceGroupedHistory
                  batchMode={isBatchMode}
                  onBatchModeChange={setIsBatchMode}
                  collapsed={false}
                  tooltipEnabled={false}
                  onSessionClick={onSessionClick}
                />
              </Suspense>
            </div>
          </Panel>
          <PanelResizeHandle className='group relative h-8px shrink-0 flex items-center justify-center cursor-row-resize'>
            <span className='h-3px w-32px rounded-full bg-[var(--color-border-2)] group-hover:bg-[var(--color-primary)] transition-colors' />
          </PanelResizeHandle>
          <Panel defaultSize={40} minSize={15} className='min-h-0'>
            <ConversationPaneBottomPanel conversationId={conversationId ?? ''} />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

export default ConversationPaneDesktop;
