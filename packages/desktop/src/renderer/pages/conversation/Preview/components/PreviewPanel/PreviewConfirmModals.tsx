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

  /**
   * 批量关闭时，本次要关掉的**全部** tab id（含干净的）。
   *
   * 只有单个 tab 时留空，走原来的 `tabId` 路径。批量关闭（关闭左侧/右侧/其他/
   * 全部、收起面板）以前完全绕过确认，未保存的编辑被静默丢弃 —— 关一个 tab 会问、
   * 关十个不会问，同一个「关闭」动作两种安全等级。
   *
   * All tab ids this batch will close (including clean ones). Empty for a
   * single-tab close, which keeps using `tabId`. Batch closes (left/right/others/
   * all, collapsing the panel) previously skipped confirmation entirely and
   * silently discarded unsaved edits — closing one tab asked, closing ten did
   * not, two safety levels for the same "close" gesture.
   */
  batchTabIds?: string[];

  /**
   * 批量中未保存的 tab 数量，用于文案。
   * How many tabs in the batch are unsaved, for the message.
   */
  dirtyCount?: number;
}

/**
 * 刷新确认状态 / Refresh confirmation state
 *
 * Reloading a tab replaces its content with what is on disk, so an unsaved edit has
 * to be dealt with first — dropped deliberately, or saved. Skipping this prompt would
 * make "refresh" destroy work, which is the one thing the refresh button must not do.
 */
export interface RefreshConfirmState {
  show: boolean;
  /** Tab awaiting the user's decision. */
  tabId: string | null;
}

/**
 * PreviewConfirmModals 组件属性
 * PreviewConfirmModals component props
 */
interface PreviewConfirmModalsProps {
  /**
   * 关闭 Tab 确认状态
   * Close tab confirmation state
   */
  closeTabConfirm: CloseTabConfirmState;

  /**
   * 刷新确认状态
   * Refresh confirmation state
   */
  refreshConfirm?: RefreshConfirmState;

  /** 放弃修改并刷新 / Discard the edit and reload */
  onRefreshWithoutSave?: () => void;

  /** 取消刷新 / Cancel the reload */
  onCancelRefresh?: () => void;

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
 * 包含关闭 Tab 确认对话框
 * Contains the close tab confirmation dialog
 */
const PreviewConfirmModals: React.FC<PreviewConfirmModalsProps> = ({
  closeTabConfirm,
  refreshConfirm,
  onRefreshWithoutSave,
  onCancelRefresh,
  onSaveAndCloseTab,
  onCloseWithoutSave,
  onCancelCloseTab,
}) => {
  const { t } = useTranslation();

  // 批量关闭有多个未保存 tab 时，逐个弹窗会把用户按到烦 ⇒ 汇总成一次确认，
  // 并在文案里说清有几个未保存。单个 tab 保持原文案。
  //
  // Prompting once per dirty tab in a batch would just train the user to click
  // through, so a batch collapses into a single confirmation that states how many
  // tabs are unsaved. A single close keeps its original wording.
  const dirtyCount = closeTabConfirm.dirtyCount ?? 0;
  const isBatch = (closeTabConfirm.batchTabIds?.length ?? 0) > 0 && dirtyCount > 1;

  return (
    <>
      {/* 关闭tab确认对话框 / Close tab confirmation modal */}
      <Modal
        visible={closeTabConfirm.show}
        title={isBatch ? t('preview.closeTabsTitle') : t('preview.closeTabTitle')}
        onCancel={onCancelCloseTab}
        onOk={onSaveAndCloseTab}
        okText={t('preview.saveAndClose')}
        cancelText={t('common.cancel')}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
        footer={
          <div className='flex justify-end gap-8px'>
            <button
              className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary'
              onClick={onCancelCloseTab}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary'
              onClick={onCloseWithoutSave}
            >
              {t('preview.closeWithoutSave')}
            </button>
            <button
              className='px-16px py-6px cursor-pointer border-none bg-primary text-white hover:opacity-80 transition-opacity text-14px'
              onClick={onSaveAndCloseTab}
            >
              {t('preview.saveAndClose')}
            </button>
          </div>
        }
      >
        <div className='text-14px text-t-secondary'>
          {isBatch ? t('preview.closeTabsMessage', { count: dirtyCount }) : t('preview.closeTabMessage')}
        </div>
      </Modal>

      {/* 刷新前的未保存确认 / Unsaved-work confirmation before reloading */}
      <Modal
        visible={refreshConfirm?.show === true}
        title={t('preview.refresh.confirmTitle')}
        onCancel={onCancelRefresh}
        onOk={onRefreshWithoutSave}
        okText={t('preview.refresh.discardAndRefresh')}
        cancelText={t('common.cancel')}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
        footer={
          <div className='flex justify-end gap-8px'>
            <button
              className='px-16px py-6px cursor-pointer border-none hover:bg-bg-3 transition-colors text-14px text-t-primary'
              onClick={onCancelRefresh}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-16px py-6px cursor-pointer border-none bg-primary text-white hover:opacity-80 transition-opacity text-14px'
              onClick={onRefreshWithoutSave}
            >
              {t('preview.refresh.discardAndRefresh')}
            </button>
          </div>
        }
      >
        <div className='text-14px text-t-secondary'>{t('preview.refresh.confirmMessage')}</div>
      </Modal>
    </>
  );
};

export default PreviewConfirmModals;
