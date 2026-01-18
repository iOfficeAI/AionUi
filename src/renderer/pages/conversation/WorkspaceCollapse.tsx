/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Down } from '@icon-park/react';
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
const WorkspaceCollapse: React.FC<WorkspaceCollapseProps> = ({ expanded, onToggle, header, children, className, siderCollapsed = false }) => {
  // 侧栏折叠时，强制展开内容并隐藏头部
  const showContent = siderCollapsed || expanded;

  return (
    <div className={classNames('workspace-collapse min-w-0', className)}>
      {/* 折叠头部 - 侧栏折叠时隐藏 */}
      {!siderCollapsed && (
        <div className='flex items-center ml-2px gap-8px h-32px p-4px cursor-pointer hover:bg-hover rd-4px transition-colors min-w-0' onClick={onToggle}>
          {/* 展开/收起箭头 */}
          <Down size={16} className={classNames('line-height-0 transition-transform duration-200 flex-shrink-0', expanded ? 'rotate-0' : '-rotate-90')} />

          {/* 标题内容 */}
          <div className='flex-1 ml-6px min-w-0 overflow-hidden'>{header}</div>
        </div>
      )}

      {/* 折叠内容 - 侧栏折叠时移除左边距 */}
      {showContent && <div className={classNames('workspace-collapse-content min-w-0', { 'ml-8px': !siderCollapsed })}>{children}</div>}
    </div>
  );
};

export default WorkspaceCollapse;
