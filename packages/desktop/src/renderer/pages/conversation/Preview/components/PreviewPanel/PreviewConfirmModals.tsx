/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Modal } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 确认对话框模式
 * Confirmation dialog mode
 *
 * - `close`：关闭有未保存修改的标签页 / close a tab with unsaved changes
 * - `refresh`：刷新有未保存修改的标签页 / refresh a tab with unsaved changes
 */
export type PreviewConfirmMode = 'close' | 'refresh';

/**
 * 预览确认状态（关闭 / 刷新共用）
 * Preview confirmation state (shared by close / refresh)
 */
export interface PreviewConfirmState {
  /**
   * 是否显示确认对话框
   * Whether to show confirmation dialog
   */
  show: boolean;

  /**
   * 目标 Tab ID
   * Target tab ID
   */
  tabId: string | null;

  /**
   * 当前模式
   * Current mode
   */
  mode: PreviewConfirmMode;
}

/**
 * PreviewConfirmModals 组件属性
 * PreviewConfirmModals component props
 */
interface PreviewConfirmModalsProps {
  /**
   * 确认状态（关闭 / 刷新）
   * Confirmation state (close / refresh)
   */
  confirm: PreviewConfirmState;

  /**
   * 保存后执行主操作（保存并关闭 / 保存并刷新）
   * Save then run the primary action (save and close / save and refresh)
   */
  onSave: () => void;

  /**
   * 不保存直接执行（不保存关闭 / 不保存刷新）
   * Run without saving (close without save / refresh without save)
   */
  onDiscard: () => void;

  /**
   * 取消
   * Cancel
   */
  onCancel: () => void;
}

/**
 * 预览面板确认对话框组件
 * Preview panel confirmation modals component
 *
 * 泛化为「关闭 / 刷新」两种模式：三按钮语义一致（保存并执行 / 不保存执行 / 取消），
 * 仅文案与主操作不同。
 * Generalized into close / refresh modes: identical three-button semantics
 * (save & run / run without save / cancel); only copy and the primary action differ.
 */
const PreviewConfirmModals: React.FC<PreviewConfirmModalsProps> = ({ confirm, onSave, onDiscard, onCancel }) => {
  const { t } = useTranslation();

  const isRefresh = confirm.mode === 'refresh';
  const title = isRefresh ? t('preview.refreshTabTitle') : t('preview.closeTabTitle');
  const message = isRefresh ? t('preview.refreshTabMessage') : t('preview.closeTabMessage');
  const saveText = isRefresh ? t('preview.saveAndRefresh') : t('preview.saveAndClose');
  const discardText = isRefresh ? t('preview.refreshWithoutSave') : t('preview.closeWithoutSave');

  return (
    <>
      {/* 关闭 / 刷新确认对话框 / Close / refresh confirmation modal */}
      <Modal
        visible={confirm.show}
        title={title}
        onCancel={onCancel}
        onOk={onSave}
        okText={saveText}
        cancelText={t('common.cancel')}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
        footer={
          <div className='flex justify-end gap-8px'>
            <button
              className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary'
              onClick={onCancel}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary'
              onClick={onDiscard}
            >
              {discardText}
            </button>
            <button
              className='px-16px py-6px cursor-pointer border-none bg-primary text-white hover:opacity-80 transition-opacity text-14px'
              onClick={onSave}
            >
              {saveText}
            </button>
          </div>
        }
      >
        <div className='text-14px text-t-secondary'>{message}</div>
      </Modal>
    </>
  );
};

export default PreviewConfirmModals;
