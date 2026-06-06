/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { blurActiveElement } from '@/renderer/utils/ui/focus';
import { cleanupSiderTooltips } from '@/renderer/utils/ui/siderTooltip';

import ConversationPaneHeader from './ConversationPaneHeader';
import styles from './ConversationPane.module.css';

const WorkspaceGroupedHistory = React.lazy(
  () => import('@/renderer/pages/conversation/GroupedHistory')
);

interface ConversationPaneMobileOverlayProps {
  onSessionClick?: () => void;
}

const ConversationPaneMobileOverlay: React.FC<ConversationPaneMobileOverlayProps> = ({ onSessionClick }) => {
  const [isBatchMode, setIsBatchMode] = useState(false);
  const layout = useLayoutContext();
  const { closePreview } = usePreviewContext();
  const navigate = useNavigate();

  // Mobile: collapse on unmount and on conversation-route change so the
  // overlay never lingers over a freshly-loaded chat.
  useEffect(() => {
    return () => {
      layout?.setConversationPaneCollapsed(true);
    };
  }, [layout]);

  const handleNewChat = useCallback(() => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    setIsBatchMode(false);
    Promise.resolve(navigate('/guid', { state: { resetAssistant: true } })).catch((error) => {
      console.error('Navigation failed:', error);
    });
    layout?.setConversationPaneCollapsed(true);
    onSessionClick?.();
  }, [closePreview, layout, navigate, onSessionClick]);

  const handleClosePane = useCallback(() => {
    layout?.setConversationPaneCollapsed(true);
    onSessionClick?.();
  }, [layout, onSessionClick]);

  const handleBackdropClick = useCallback(() => {
    layout?.setConversationPaneCollapsed(true);
    onSessionClick?.();
  }, [layout, onSessionClick]);

  return (
    <>
      <div className={styles.mobileBackdrop} onClick={handleBackdropClick} aria-hidden='true' />
      <div className={styles.mobilePanel} role='dialog' aria-modal='true'>
        <ConversationPaneHeader
          isBatchMode={isBatchMode}
          onToggleBatchMode={() => setIsBatchMode((prev) => !prev)}
          onNewChat={handleNewChat}
          onClose={handleClosePane}
          onSessionClick={handleClosePane}
        />
        <div className={styles.body}>
          <Suspense fallback={<div className='min-h-200px' />}>
            <WorkspaceGroupedHistory
              batchMode={isBatchMode}
              onBatchModeChange={setIsBatchMode}
              collapsed={false}
              tooltipEnabled={false}
              onSessionClick={handleClosePane}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
};

export default ConversationPaneMobileOverlay;
