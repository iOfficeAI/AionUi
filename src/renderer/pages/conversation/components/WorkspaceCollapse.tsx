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
}) => {
  // 侧栏折叠时，强制展开内容并隐藏头部
  const showContent = siderCollapsed || expanded;

  return (
    <div className={classNames('workspace-collapse min-w-0', className)}>
      {/* 折叠头部 - 侧栏折叠时隐藏 */}
      {!siderCollapsed && (
        <div
          className='flex items-center gap-8px h-40px px-10px cursor-pointer hover:bg-[rgba(var(--primary-6),0.14)] rd-8px transition-colors min-w-0'
          onClick={onToggle}
        >
          {/* 展开/收起文件夹图标 — 28px 容器与其他 sider 行对齐 */}
          <span className='w-28px h-28px flex items-center justify-center shrink-0'>
            {expanded ? (
              <FolderOpen size={20} className='line-height-0' />
            ) : (
              <FolderClose size={20} className='line-height-0' />
            )}
          </span>

          {/* 标题内容 */}
          <div className='flex-1 min-w-0 overflow-hidden'>{header}</div>
        </div>
      )}

      {/* 折叠内容 - 子项缩进 20px,使子项 icon 中心落在父级文字起点附近,形成清晰的层级 */}
      {showContent && (
        <div className={classNames('workspace-collapse-content min-w-0', { 'pl-20px': !siderCollapsed })}>
          {children}
        </div>
      )}
    </div>
  );
};

export default WorkspaceCollapse;
