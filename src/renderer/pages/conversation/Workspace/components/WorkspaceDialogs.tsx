/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Input, Modal } from '@arco-design/web-react';
import React from 'react';
import type { TFunction } from 'i18next';
import type { RenameModalState, DeleteModalState } from '../types';

type WorkspaceDialogsProps = {
  t: TFunction;
  // Rename modal
  renameModal: RenameModalState;
  setRenameModal: React.Dispatch<React.SetStateAction<RenameModalState>>;
  closeRenameModal: () => void;
  handleRenameConfirm: () => void;
  renameLoading: boolean;
  // Delete modal
  deleteModal: DeleteModalState;
  closeDeleteModal: () => void;
  handleDeleteConfirm: () => void;
};

/** Combined rename and delete confirmation modals. */
const WorkspaceDialogs: React.FC<WorkspaceDialogsProps> = ({
  t,
  renameModal,
  setRenameModal,
  closeRenameModal,
  handleRenameConfirm,
  renameLoading,
  deleteModal,
  closeDeleteModal,
  handleDeleteConfirm,
}) => {
  return (
    <>
      {/* Rename Modal */}
      <Modal
        visible={renameModal.visible}
        title={t('conversation.workspace.contextMenu.renameTitle')}
        onCancel={closeRenameModal}
        onOk={handleRenameConfirm}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={renameLoading}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModal.value}
          onChange={(value) => setRenameModal((prev) => ({ ...prev, value }))}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.workspace.contextMenu.renamePlaceholder')}
        />
      </Modal>

      {/* Delete Modal */}
      <Modal
        visible={deleteModal.visible}
        title={t('conversation.workspace.contextMenu.deleteTitle')}
        onCancel={closeDeleteModal}
        onOk={handleDeleteConfirm}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={deleteModal.loading}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='text-14px text-t-secondary'>{t('conversation.workspace.contextMenu.deleteConfirm')}</div>
      </Modal>
    </>
  );
};

export default WorkspaceDialogs;
