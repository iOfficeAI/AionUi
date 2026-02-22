/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewHistoryTarget } from '@/common/types/preview';
import { iconColors } from '@/renderer/theme/colors';
import { Dropdown } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * PreviewToolbar 组件属性
 * PreviewToolbar component props
 */
interface PreviewToolbarProps {
  /**
   * 内容类型
   * Content type
   */
  contentType: string;

  /**
   * 是否为 Markdown 文件
   * Whether it's a Markdown file
   */
  isMarkdown: boolean;

  /**
   * 是否为 HTML 文件
   * Whether it's an HTML file
   */
  isHTML: boolean;

  /**
   * 是否可编辑
   * Whether editable
   */
  isEditable: boolean;

  /**
   * 是否处于编辑模式
   * Whether in edit mode
   */
  isEditMode: boolean;

  /**
   * 当前视图模式
   * Current view mode
   */
  viewMode: 'source' | 'preview';

  /**
   * 是否启用分屏模式
   * Whether split-screen mode is enabled
   */
  isSplitScreenEnabled: boolean;

  /**
   * 文件名
   * Filename
   */
  fileName?: string;

  /**
   * 是否显示"在系统中打开"按钮
   * Whether to show "Open in System" button
   */
  showOpenInSystemButton: boolean;

  /**
   * 历史目标
   * History target
   */
  historyTarget: PreviewHistoryTarget | null;

  /**
   * 是否正在保存快照
   * Whether snapshot is saving
   */
  snapshotSaving: boolean;

  /**
   * 设置视图模式
   * Set view mode
   */
  onViewModeChange: (mode: 'source' | 'preview') => void;

  /**
   * 设置分屏模式
   * Set split-screen mode
   */
  onSplitScreenToggle: () => void;

  /**
   * 编辑按钮点击
   * Edit button click
   */
  onEditClick: () => void;

  /**
   * 退出编辑按钮点击
   * Exit edit button click
   */
  onExitEdit: () => void;

  /**
   * 保存快照
   * Save snapshot
   */
  onSaveSnapshot: () => void;

  /**
   * 刷新历史列表
   * Refresh history list
   */
  onRefreshHistory: () => void;

  /**
   * 渲染历史下拉菜单
   * Render history dropdown
   */
  renderHistoryDropdown: () => React.ReactNode;

  /**
   * 在系统中打开文件
   * Open file in system
   */
  onOpenInSystem: () => void;

  /**
   * 下载文件
   * Download file
   */
  onDownload: () => void;

  /**
   * 关闭预览面板
   * Close preview panel
   */
  onClose: () => void;

  /**
   * HTML 审核元素模式（仅HTML类型使用）
   * HTML inspect mode (only for HTML type)
   */
  inspectMode?: boolean;

  /**
   * 切换HTML审核元素模式（仅HTML类型使用）
   * Toggle HTML inspect mode (only for HTML type)
   */
  onInspectModeToggle?: () => void;

  /**
   * 左侧额外渲染内容
   * Extra content rendered on the left section
   */
  leftExtra?: React.ReactNode;

  /**
   * 右侧额外渲染内容
   * Extra content rendered on the right section
   */
  rightExtra?: React.ReactNode;
}

/**
 * 预览面板工具栏组件
 * Preview panel toolbar component
 *
 * 包含文件名、视图模式切换、编辑按钮、快照/历史按钮、下载按钮、关闭按钮等
 * Contains filename, view mode toggle, edit button, snapshot/history buttons, download button, close button, etc.
 */
// eslint-disable-next-line max-len
const PreviewToolbar: React.FC<PreviewToolbarProps> = ({ contentType, isMarkdown, isHTML, isEditable, isEditMode, viewMode, isSplitScreenEnabled, fileName, showOpenInSystemButton, historyTarget, snapshotSaving, onViewModeChange, onSplitScreenToggle, onEditClick, onExitEdit, onSaveSnapshot, onRefreshHistory, renderHistoryDropdown, onOpenInSystem, onDownload, onClose, inspectMode, onInspectModeToggle, leftExtra, rightExtra }) => {
  const { t } = useTranslation();
  const isDiff = contentType === 'diff';

  const toolbarBtn = 'flex items-center gap-2px px-8px py-3px rd-4px cursor-pointer transition-colors duration-150 text-12px font-medium text-t-secondary hover:text-t-primary hover:bg-bg-3';
  const toolbarBtnActive = '!text-white bg-brand hover:!text-white hover:bg-brand-hover';
  const toolbarIconSize = 12;

  return (
    <div className='flex items-center justify-between h-32px px-10px bg-bg-2 flex-shrink-0 border-b border-border-1 overflow-x-auto'>
      <div className='flex items-center justify-between gap-8px w-full' style={{ minWidth: 'max-content' }}>
        {/* 左侧：Tabs（Markdown/HTML）+ 文件名 / Left: Tabs (Markdown/HTML) + Filename */}
        <div className='flex items-center h-full gap-8px'>
          {(isMarkdown || isHTML || isDiff) && (
            <>
              <div className='flex items-center h-full gap-0'>
                <div
                  className={`flex items-center h-full px-10px cursor-pointer transition-all duration-150 text-12px font-medium ${viewMode === 'source' ? 'text-brand bg-aou-2 border-b-4 border-brand' : 'text-t-secondary hover:text-t-primary hover:bg-bg-3'}`}
                  onClick={() => {
                    try {
                      onViewModeChange('source');
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {isHTML ? t('preview.code') : t('preview.source')}
                </div>
                <div
                  className={`flex items-center h-full px-10px cursor-pointer transition-all duration-150 text-12px font-medium ${viewMode === 'preview' ? 'text-brand bg-aou-2 border-b-4 border-brand' : 'text-t-secondary hover:text-t-primary hover:bg-bg-3'}`}
                  onClick={() => {
                    try {
                      onViewModeChange('preview');
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {t('preview.preview')}
                </div>
              </div>
              {!isDiff && (
                <div
                  className={`flex items-center px-8px py-3px rd-4px cursor-pointer transition-colors duration-150 ${isSplitScreenEnabled ? toolbarBtnActive : 'text-t-secondary hover:bg-bg-3'}`}
                  onClick={() => {
                    try {
                      onSplitScreenToggle();
                    } catch {
                      /* ignore */
                    }
                  }}
                  title={isSplitScreenEnabled ? t('preview.closeSplitScreen') : t('preview.openSplitScreen')}
                >
                  <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                    <rect x='3' y='3' width='18' height='18' rx='2' />
                    <line x1='12' y1='3' x2='12' y2='21' />
                  </svg>
                </div>
              )}
            </>
          )}

          {contentType === 'code' && isEditable && (
            <div className={`${toolbarBtn} ${isEditMode ? toolbarBtnActive : ''}`} onClick={() => (isEditMode ? onExitEdit() : onEditClick())} title={isEditMode ? t('preview.exitEdit') : t('preview.edit')}>
              <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className={isEditMode ? 'text-white' : 'text-t-secondary'}>
                <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
              </svg>
              <span>{isEditMode ? t('preview.exitEdit') : t('preview.edit')}</span>
            </div>
          )}

          {isEditable && isEditMode && (
            <div
              className={`flex items-center px-8px py-3px rd-4px cursor-pointer transition-colors duration-150 ${isSplitScreenEnabled ? toolbarBtnActive : 'text-t-secondary hover:bg-bg-3'}`}
              onClick={() => {
                try {
                  onSplitScreenToggle();
                } catch {
                  /* ignore */
                }
              }}
              title={isSplitScreenEnabled ? t('preview.closeSplitScreen') : t('preview.openSplitScreen')}
            >
              <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                <rect x='3' y='3' width='18' height='18' rx='2' />
                <line x1='12' y1='3' x2='12' y2='21' />
              </svg>
            </div>
          )}

          {leftExtra}
        </div>

        <div className='flex items-center gap-4px flex-shrink-0'>
          {rightExtra}

          {((contentType === 'markdown' && (viewMode === 'source' || isSplitScreenEnabled)) || (contentType === 'html' && (viewMode === 'source' || isSplitScreenEnabled)) || (contentType === 'code' && isEditable && isEditMode)) && (
            <>
              <div className={`${toolbarBtn} ${historyTarget ? '' : '!cursor-not-allowed opacity-50'} ${snapshotSaving ? 'opacity-60' : ''}`} onClick={historyTarget && !snapshotSaving ? onSaveSnapshot : undefined} title={historyTarget ? t('preview.saveSnapshot') : t('preview.snapshotNotSupported')}>
                <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className='text-t-secondary'>
                  <path d='M5 7h3l1-2h6l1 2h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z' />
                  <circle cx='12' cy='13' r='3' />
                </svg>
                <span>{t('preview.snapshot')}</span>
              </div>
              {historyTarget ? (
                <Dropdown droplist={renderHistoryDropdown()} trigger={['hover']} position='br' onVisibleChange={(visible) => visible && onRefreshHistory()}>
                  <div className={toolbarBtn} title={t('preview.historyVersions')}>
                    <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className='text-t-secondary'>
                      <path d='M12 8v5l3 2' />
                      <path d='M12 3a9 9 0 1 0 9 9' />
                      <polyline points='21 3 21 9 15 9' />
                    </svg>
                    <span>{t('preview.history')}</span>
                  </div>
                </Dropdown>
              ) : (
                <div className={`${toolbarBtn} !cursor-not-allowed opacity-50`} title={t('preview.historyNotSupported')}>
                  <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' className='text-t-secondary'>
                    <path d='M12 8v5l3 2' />
                    <path d='M12 3a9 9 0 1 0 9 9' />
                    <polyline points='21 3 21 9 15 9' />
                  </svg>
                  <span>{t('preview.history')}</span>
                </div>
              )}
            </>
          )}

          {showOpenInSystemButton && (
            <div className={toolbarBtn} onClick={onOpenInSystem} title={t('preview.openInSystemApp')}>
              <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span>{t('preview.openInSystemApp')}</span>
            </div>
          )}

          <div className={toolbarBtn} onClick={() => void onDownload()} title={t('preview.downloadFile')}>
            <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
              <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
              <polyline points='7 10 12 15 17 10' />
              <line x1='12' y1='15' x2='12' y2='3' />
            </svg>
            <span>{t('common.download')}</span>
          </div>

          {isHTML && onInspectModeToggle && (
            <div className={`${toolbarBtn} ${inspectMode ? toolbarBtnActive : ''}`} onClick={onInspectModeToggle} title={inspectMode ? t('preview.html.inspectElementDisable') : t('preview.html.inspectElementEnable')}>
              <svg width={toolbarIconSize} height={toolbarIconSize} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className={inspectMode ? 'text-white' : 'text-t-secondary'}>
                <path d='M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' />
                <path d='M13 13l6 6' />
              </svg>
              <span>{inspectMode ? t('preview.html.inspecting') : t('preview.html.inspectElement')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviewToolbar;
