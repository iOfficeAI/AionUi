/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { FolderClose, FolderOpen } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';

interface WorkspaceCollapseProps {
  /** 是否展开 */
  expanded: boolean;
  /** 切换展开状态的回调 */
  onToggle: () => void;
  /** 折叠面板的标题 */
  header: React.ReactNode;
  /** 折叠面板的内容 */
  children: React.ReactNode;
  /** 额外的类名 */
  className?: string;
  /** 侧栏是否折叠 - 折叠时隐藏组标题并移除缩进 */
  siderCollapsed?: boolean;
  /** 子级内容是否做 20px 左缩进。默认 true。
   *  传 false 的场景：使用方自己通过 dimIcon 等机制表达层级（例如 cron job 子级）。 */
  nestedIndent?: boolean;
}

/**
 * 工作空间折叠组件 - 简单的折叠面板，用于工作空间分组
 */
const WorkspaceCollapse: React.FC<WorkspaceCollapseProps> = ({
  expanded,
  onToggle,
  header,
  children,
  className,
  siderCollapsed = false,
  nestedIndent = true,
}) => {
  // 侧栏折叠时，强制展开内容并隐藏头部
  const showContent = siderCollapsed || expanded;

  return (
    <div className={classNames('workspace-collapse min-w-0', className)}>
      {/* 折叠头部 - 侧栏折叠时隐藏 */}
      {!siderCollapsed && (
        <div
          className='flex items-center gap-8px h-34px pl-10px pr-8px cursor-pointer hover:bg-fill-3 rd-8px transition-colors min-w-0 group'
          onClick={onToggle}
        >
          {/* 文件夹图标 — 22px 容器，颜色与 header 文本同步退一层 */}
          <span className='size-22px flex items-center justify-center shrink-0 text-[var(--color-text-2)] group-hover:text-t-primary transition-colors'>
            {expanded ? (
              <FolderOpen theme='outline' size={16} fill='currentColor' className='line-height-0' />
            ) : (
              <FolderClose theme='outline' size={16} fill='currentColor' className='line-height-0' />
            )}
          </span>

          {/* 标题内容 */}
          <div className='flex-1 min-w-0 overflow-hidden'>{header}</div>
        </div>
      )}

      {/* 折叠内容 — 是否缩进由 nestedIndent 控制 */}
      {showContent && (
        <div
          className={classNames('workspace-collapse-content min-w-0', {
            'pl-20px': nestedIndent && !siderCollapsed,
          })}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default WorkspaceCollapse;
