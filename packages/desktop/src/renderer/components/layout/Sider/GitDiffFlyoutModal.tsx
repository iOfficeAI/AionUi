/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import ChatWorkspace from '@/renderer/pages/conversation/Workspace';
import type { WorkspaceEventPrefix } from '@/renderer/pages/conversation/Workspace/types';
import { Typography } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './GitDiffFlyoutModal.css';

interface GitDiffFlyoutModalProps {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  workspace: string;
  isTemporaryWorkspace?: boolean;
  eventPrefix: string;
}

const GitDiffFlyoutModal: React.FC<GitDiffFlyoutModalProps> = ({
  visible,
  onClose,
  conversationId,
  workspace,
  isTemporaryWorkspace,
  eventPrefix,
}) => {
  const { t } = useTranslation();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      footer={null}
      showCustomClose={false}
      unmountOnExit
      className='git-diff-flyout-modal'
      maskStyle={{
        background: 'var(--git-diff-flyout-mask-bg)',
        backdropFilter: 'blur(1px)',
        WebkitBackdropFilter: 'blur(1px)',
      }}
      style={{
        width: 'min(920px, calc(100vw - 48px))',
        borderRadius: '24px',
        background: 'transparent',
        boxShadow: 'none',
      }}
      contentStyle={{
        background: 'transparent',
        borderRadius: '24px',
        padding: '0',
        overflow: 'hidden',
        height: 'min(85vh, 900px)',
      }}
    >
      <div className='git-diff-flyout-modal__panel flex flex-col h-full min-h-0'>
        <div className='git-diff-flyout-modal__header'>
          <div className='git-diff-flyout-modal__header-main'>
            <div className='git-diff-flyout-modal__title'>
              {t('conversation.workspace.changes.flyoutTitle', { defaultValue: 'Source control' })}
            </div>
            <Typography.Paragraph className='git-diff-flyout-modal__description !mb-0 text-13px text-t-secondary'>
              {t('conversation.workspace.changes.flyoutDescription', {
                defaultValue: 'Review, stage, and commit changes with more room for diffs.',
              })}
            </Typography.Paragraph>
          </div>
          <button type='button' className='git-diff-flyout-modal__close-btn' onClick={handleClose} aria-label='Close'>
            <Close size={16} />
          </button>
        </div>
        <div className='git-diff-flyout-modal__workspace'>
          <ChatWorkspace
            conversation_id={conversationId}
            workspace={workspace}
            isTemporaryWorkspace={isTemporaryWorkspace}
            eventPrefix={eventPrefix as WorkspaceEventPrefix}
            panelMode='changes'
          />
        </div>
      </div>
    </AionModal>
  );
};

export default GitDiffFlyoutModal;
