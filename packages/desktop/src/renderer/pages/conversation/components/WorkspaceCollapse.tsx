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
  /** 标题尾部插槽 - 例如 hover 显示的菜单按钮，点击不会触发 onToggle */
  trailing?: React.ReactNode;
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
  trailing,
}) => {
  // 侧栏折叠时，强制展开内容并隐藏头部
  const showContent = siderCollapsed || expanded;

  return (
    <div className={classNames('workspace-collapse min-w-0', className)}>
      {/* 折叠头部 - 侧栏折叠时隐藏 */}
      {!siderCollapsed && (
        <div
          className='flex items-center gap-6px h-22px pl-6px pr-4px cursor-pointer hover:bg-fill-3 rd-6px transition-colors min-w-0 group'
          onClick={onToggle}
        >
          <span className='size-14px flex items-center justify-center shrink-0 text-t-primary'>
            {expanded ? (
              <FolderOpen theme='outline' size={12} fill='currentColor' className='line-height-0' />
            ) : (
              <FolderClose theme='outline' size={12} fill='currentColor' className='line-height-0' />
            )}
          </span>

          {/* 标题内容 — flex 容器让内部 header span 的 truncate 生效 */}
          <div className='flex-1 min-w-0 flex items-center overflow-hidden'>{header}</div>

          {/* 尾部操作槽 — 固定宽度让文本提前截断；按钮 hover 才出现时允许左溢出到文本区覆盖最后 1-2 字 */}
          {trailing && (
            <div className='shrink-0 flex items-center justify-end w-22px' onClick={(e) => e.stopPropagation()}>
              {trailing}
            </div>
          )}
        </div>
      )}

      {/* 折叠内容 — row 保持全宽以便选中态 bg 填满整行；视觉缩进由 ConversationRow 的 dimIcon 分支自行处理 */}
      {showContent && <div className='workspace-collapse-content min-w-0'>{children}</div>}
    </div>
  );
};

export default WorkspaceCollapse;
