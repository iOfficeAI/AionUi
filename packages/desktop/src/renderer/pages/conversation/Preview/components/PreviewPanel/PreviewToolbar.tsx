/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Close } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { shouldShowDownload } from './previewToolbarUtils';

/**
 * PreviewToolbar 组件属性
 * PreviewToolbar component props
 */
interface PreviewToolbarProps {
  /**
   * 内容类型
   * Content type
   */
  content_type: string;

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
  file_name?: string;

  /**
   * 是否显示"在系统中打开"按钮
   * Whether to show "Open in System" button
   */
  showOpenInSystemButton: boolean;

  /**
   * 这个 tab 没有内容可操作（超过大小上限，或格式无法渲染）。
   * 视图切换、分屏、审查元素都是对内容的操作，隐藏；
   * 但「在系统中打开」与「下载」照常显示 —— 那是用户唯一的出路。
   *
   * The tab has no content to act on — either it exceeded the size ceiling or its
   * format cannot be rendered. View-mode switching, split screen and inspect all
   * operate on content, so they are hidden; "open in system" and "download" stay,
   * because they are the only way the user reaches the file.
   */
  hasNoRenderableContent?: boolean;

  /**
   * 文件是否在磁盘上（有 file_path）。
   * 刻意与 showOpenInSystemButton 分开传：后者现在也接受纯 fileRef（逃生出口），
   * 不再等价于「文件在磁盘上」，继续复用它会让 Explorer 打开的 code/md tab
   * 悄悄丢掉下载按钮。
   *
   * Whether the file exists on disk (has a file_path). Passed separately from
   * showOpenInSystemButton on purpose: that flag now also accepts a bare fileRef
   * (the escape hatch), so it no longer means "on disk". Reusing it here would
   * silently drop the download button from explorer-opened code/markdown tabs.
   */
  hasFilePath: boolean;

  /**
   * 刷新按钮状态 token；`'hidden'` 或未提供时不渲染。
   * Refresh control state token; not rendered when `'hidden'` or absent.
   */
  refreshState?: string;

  /** 刷新按钮是否可点 / Whether the refresh control accepts a click */
  refreshActionable?: boolean;

  /** 点击刷新 / Reload the current tab */
  onRefresh?: () => void;

  /**
   * 是否显示保存按钮（仅可编辑类型且有可渲染内容时）。
   * Whether to show the save button (only editable types with renderable content).
   */
  showSave?: boolean;

  /** 保存按钮是否可点（有未保存修改时）/ Whether the save control accepts a click (has unsaved edits) */
  saveActionable?: boolean;

  /** 点击保存 / Save the current tab */
  onSave?: () => void;

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
 * 包含文件名、视图模式切换、下载按钮、关闭按钮等
 * Contains filename, view mode toggle, download button, close button, etc.
 */
// eslint-disable-next-line max-len
const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  content_type,
  isMarkdown,
  isHTML,
  viewMode,
  isSplitScreenEnabled,
  file_name,
  showOpenInSystemButton,
  hasNoRenderableContent = false,
  hasFilePath,
  refreshState,
  refreshActionable = false,
  onRefresh,
  showSave = false,
  saveActionable = false,
  onSave,
  onViewModeChange,
  onSplitScreenToggle,
  onOpenInSystem,
  onDownload,
  onClose,
  inspectMode,
  onInspectModeToggle,
  leftExtra,
  rightExtra,
}) => {
  const { t } = useTranslation();
  const isDiff = content_type === 'diff';
  const preferActionButtonsInFront = Boolean(leftExtra);
  // 下载的隐藏规则看的是「文件是否在磁盘上」，用 hasFilePath 而不是
  // showOpenInSystemButton（后者已包含纯 fileRef 的情况）。
  // The download rule keys off "is the file on disk", so use hasFilePath rather
  // than showOpenInSystemButton (which now also covers bare-fileRef tabs).
  const showDownload = shouldShowDownload(content_type, hasFilePath);

  const toolbarBtn =
    'flex items-center gap-2px px-8px py-3px rd-4px cursor-pointer transition-colors duration-150 text-12px font-medium text-t-secondary hover:text-t-primary hover:bg-bg-3';
  const toolbarBtnActive = '!text-white bg-brand hover:!text-white hover:bg-brand-hover';
  const toolbarIconSize = 12;

  return (
    <div className='flex items-center justify-between h-32px px-10px bg-bg-2 flex-shrink-0 border-b border-border-1 overflow-x-auto'>
      <div className='flex items-center justify-between gap-8px w-full' style={{ minWidth: 'max-content' }}>
        {/* 左侧：Tabs（Markdown/HTML）+ 文件名 / Left: Tabs (Markdown/HTML) + Filename */}
        <div className='flex items-center h-full gap-8px'>
          {(isMarkdown || isHTML || isDiff) && !hasNoRenderableContent && (
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
                  <svg
                    width={toolbarIconSize}
                    height={toolbarIconSize}
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                  >
                    <rect x='3' y='3' width='18' height='18' rx='2' />
                    <line x1='12' y1='3' x2='12' y2='21' />
                  </svg>
                </div>
              )}
            </>
          )}

          {preferActionButtonsInFront && showOpenInSystemButton && (
            <div className={toolbarBtn} onClick={onOpenInSystem} title={t('preview.openInSystemApp')}>
              <svg
                width={toolbarIconSize}
                height={toolbarIconSize}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                className='text-t-secondary'
              >
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span>{t('preview.openInSystemApp')}</span>
            </div>
          )}
          {preferActionButtonsInFront && showDownload && (
            <div className={toolbarBtn} onClick={() => void onDownload()} title={t('preview.downloadFile')}>
              <svg
                width={toolbarIconSize}
                height={toolbarIconSize}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                className='text-t-secondary'
              >
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span>{t('common.download')}</span>
            </div>
          )}
          {leftExtra}
        </div>

        <div className='flex items-center gap-4px flex-shrink-0'>
          {/* 刷新：放在这个稳定容器里，不进下面那两个「前置/后置」重复块 ——
              那两块由 preferActionButtonsInFront 二选一，只有 PDF 注入 leftExtra，
              所以按钮会随 tab 类型左右跳。
              Refresh lives in this stable container rather than in the duplicated
              front/back action blocks below: those two are selected by
              preferActionButtonsInFront, and only PDF injects leftExtra, so anything
              placed in them jumps sides when the tab type changes. */}
          {refreshState !== undefined && refreshState !== 'hidden' && (
            <div
              data-testid='preview-refresh'
              data-refresh-state={refreshState}
              className={`${toolbarBtn} ${refreshState === 'updated' ? '!text-warning-6' : ''} ${
                refreshActionable ? '' : '!cursor-not-allowed opacity-50'
              }`}
              onClick={refreshActionable ? onRefresh : undefined}
              title={
                refreshState === 'updated'
                  ? t('preview.refresh.hasUpdate')
                  : refreshState === 'idle-no-signal'
                    ? t('preview.refresh.noSignalSource')
                    : refreshState === 'disabled'
                      ? t('preview.refresh.unavailable')
                      : t('preview.refresh.tooltip')
              }
            >
              <svg
                width={toolbarIconSize}
                height={toolbarIconSize}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
              >
                <path d='M21 12a9 9 0 1 1-3-6.7' />
                <polyline points='21 3 21 9 15 9' />
              </svg>
              <span>{t('preview.refresh.label')}</span>
            </div>
          )}

          {rightExtra}

          {!preferActionButtonsInFront && showOpenInSystemButton && (
            <div className={toolbarBtn} onClick={onOpenInSystem} title={t('preview.openInSystemApp')}>
              <svg
                width={toolbarIconSize}
                height={toolbarIconSize}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                className='text-t-secondary'
              >
                <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
                <polyline points='15 3 21 3 21 9' />
                <line x1='10' y1='14' x2='21' y2='3' />
              </svg>
              <span>{t('preview.openInSystemApp')}</span>
            </div>
          )}

          {!preferActionButtonsInFront && showDownload && (
            <div className={toolbarBtn} onClick={() => void onDownload()} title={t('preview.downloadFile')}>
              <svg
                width={toolbarIconSize}
                height={toolbarIconSize}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                className='text-t-secondary'
              >
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span>{t('common.download')}</span>
            </div>
          )}

          {isHTML && !hasNoRenderableContent && onInspectModeToggle && (
            <div
              className={`${toolbarBtn} ${inspectMode ? toolbarBtnActive : ''}`}
              onClick={onInspectModeToggle}
              title={inspectMode ? t('preview.html.inspectElementDisable') : t('preview.html.inspectElementEnable')}
            >
              <svg
                width={toolbarIconSize}
                height={toolbarIconSize}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                className={inspectMode ? 'text-white' : 'text-t-secondary'}
              >
                <path d='M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' />
                <path d='M13 13l6 6' />
              </svg>
              <span>{inspectMode ? t('preview.html.inspecting') : t('preview.html.inspectElement')}</span>
            </div>
          )}

          {/* 保存：可编辑类型才出现，放在这一栏最后、最靠右；无未保存修改时置灰不可点。
              Save: appears only for editable types, placed last (rightmost) in this row;
              greyed out and non-clickable when there is nothing unsaved. */}
          {showSave && (
            <div
              data-testid='preview-save'
              className={`${toolbarBtn} ${saveActionable ? '!text-warning-6' : '!cursor-not-allowed opacity-50'}`}
              onClick={saveActionable ? onSave : undefined}
              title={saveActionable ? t('preview.save.tooltip') : t('preview.save.clean')}
            >
              <svg
                width={toolbarIconSize}
                height={toolbarIconSize}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <path d='M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z' />
                <polyline points='17 21 17 13 7 13 7 21' />
                <polyline points='7 3 7 8 15 8' />
              </svg>
              <span>{t('common.save')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviewToolbar;
