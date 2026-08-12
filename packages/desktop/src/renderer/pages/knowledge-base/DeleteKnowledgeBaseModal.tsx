/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeBaseListItem } from './types';
import KnowledgeBaseAvatar from './KnowledgeBaseAvatar';
import { Modal } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type DeleteKnowledgeBaseModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  activeKnowledgeBase: KnowledgeBaseListItem | null;
};

const DeleteKnowledgeBaseModal: React.FC<DeleteKnowledgeBaseModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  activeKnowledgeBase,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('settings.knowledgeBaseDeleteTitle', { defaultValue: 'Delete Knowledge Base' })}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      okButtonProps={{ status: 'danger' }}
      wrapClassName='delete-knowledge-base-modal'
      data-testid='modal-delete-knowledge-base'
      okText={t('common.delete', { defaultValue: 'Delete' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      className='w-[90vw] md:w-[400px]'
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <p>
        {t('settings.knowledgeBaseDeleteConfirm', {
          defaultValue: 'Are you sure you want to delete this knowledge base? This action cannot be undone.',
        })}
      </p>
      {activeKnowledgeBase && (
        <div className='mt-12px p-12px bg-fill-2 rounded-lg flex items-center gap-12px'>
          <KnowledgeBaseAvatar knowledgeBase={activeKnowledgeBase} size={32} />
          <div>
            <div className='font-medium'>{activeKnowledgeBase.name}</div>
            <div className='text-12px text-t-secondary'>{activeKnowledgeBase.description}</div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default DeleteKnowledgeBaseModal;
