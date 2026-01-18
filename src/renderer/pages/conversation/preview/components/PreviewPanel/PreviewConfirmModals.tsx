/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Modal } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 关闭 Tab 确认状态
 * Close tab confirmation state
 */
export interface CloseTabConfirmState {
  /**
   * 是否显示确认对话框
   * Whether to show confirmation dialog
   */
  show: boolean;

  /**
   * 要关闭的 Tab ID
   * Tab ID to close
   */
  tabId: string | null;
}

/**
 * PreviewConfirmModals 组件属性
 * PreviewConfirmModals component props
 */
interface PreviewConfirmModalsProps {
  /**
   * 是否显示退出编辑确认对话框
   * Whether to show exit edit confirmation dialog
   */
  showExitConfirm: boolean;

  /**
   * 关闭 Tab 确认状态
   * Close tab confirmation state
   */
  closeTabConfirm: CloseTabConfirmState;

  /**
   * 确认退出编辑
   * Confirm exit edit
   */
  onConfirmExit: () => void;

  /**
   * 取消退出编辑
   * Cancel exit edit
   */
  onCancelExit: () => void;

  /**
   * 保存并关闭 Tab
   * Save and close tab
   */
  onSaveAndCloseTab: () => void;

  /**
   * 不保存直接关闭 Tab
   * Close tab without saving
   */
  onCloseWithoutSave: () => void;

  /**
   * 取消关闭 Tab
   * Cancel close tab
   */
  onCancelCloseTab: () => void;
}

/**
 * 预览面板确认对话框组件
 * Preview panel confirmation modals component
 *
 * 包含退出编辑确认和关闭 Tab 确认两个对话框
 * Contains exit edit confirmation and close tab confirmation dialogs
 */
const PreviewConfirmModals: React.FC<PreviewConfirmModalsProps> = ({ showExitConfirm, closeTabConfirm, onConfirmExit, onCancelExit, onSaveAndCloseTab, onCloseWithoutSave, onCancelCloseTab }) => {
  const { t } = useTranslation();

  return (
    <>
      {/* 退出编辑确认对话框 / Exit edit confirmation modal */}
      <Modal visible={showExitConfirm} title={t('preview.unsavedChangesTitle')} onCancel={onCancelExit} onOk={onConfirmExit} okText={t('preview.confirmExit')} cancelText={t('preview.continueEdit')} style={{ borderRadius: '12px' }} alignCenter getPopupContainer={() => document.body}>
        <div className='text-14px text-t-secondary'>{t('preview.unsavedChangesMessage')}</div>
      </Modal>

      {/* 关闭tab确认对话框 / Close tab confirmation modal */}
      <Modal
        visible={closeTabConfirm.show}
        title={t('preview.closeTabTitle')}
        onCancel={onCancelCloseTab}
        onOk={onSaveAndCloseTab}
        okText={t('preview.saveAndClose')}
        cancelText={t('common.cancel')}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
        footer={
          <div className='flex justify-end gap-8px'>
            <button className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary' onClick={onCancelCloseTab}>
              {t('common.cancel')}
            </button>
            <button className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary' onClick={onCloseWithoutSave}>
              {t('preview.closeWithoutSave')}
            </button>
            <button className='px-16px py-6px cursor-pointer border-none bg-primary text-white hover:opacity-80 transition-opacity text-14px' onClick={onSaveAndCloseTab}>
              {t('preview.saveAndClose')}
            </button>
          </div>
        }
      >
        <div className='text-14px text-t-secondary'>{t('preview.closeTabMessage')}</div>
      </Modal>
    </>
  );
};

export default PreviewConfirmModals;
