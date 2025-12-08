/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';

/**
 * 自定义滚动区域组件 / Custom scroll area component
 *
 * 提供统一的滚动条样式，支持垂直、水平或双向滚动
 * Provides unified scrollbar styling, supports vertical, horizontal or both directions
 *
 * @example
 * ```tsx
 * // 垂直滚动（默认）/ Vertical scroll (default)
 * <AionScrollArea className="h-400px">
 *   <div>Content...</div>
 * </AionScrollArea>
 *
 * // 水平滚动 / Horizontal scroll
 * <AionScrollArea direction="x" className="w-400px">
 *   <div className="whitespace-nowrap">Content...</div>
 * </AionScrollArea>
 *
 * // 双向滚动 / Both directions
 * <AionScrollArea direction="both" className="h-400px w-400px">
 *   <div>Content...</div>
 * </AionScrollArea>
 * ```
 */
interface AionScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 滚动方向：y-垂直，x-水平，both-双向 / Scroll direction: y-vertical, x-horizontal, both-bidirectional */
  direction?: 'y' | 'x' | 'both';
  /** 是否禁用滚动（用于嵌入式页面展示） */
  disableOverflow?: boolean;
}

const AionScrollArea: React.FC<AionScrollAreaProps> = ({ children, className, direction = 'y', disableOverflow = false, ...rest }) => {
  // 根据方向设置 overflow 类名 / Set overflow class based on direction
  const overflowClass = disableOverflow ? '' : direction === 'both' ? 'overflow-auto' : direction === 'x' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden';

  return (
    <div data-scroll-area='' className={classNames(overflowClass, disableOverflow && 'overflow-visible', className)} {...rest}>
      {children}
    </div>
  );
};

AionScrollArea.displayName = 'AionScrollArea';

export default AionScrollArea;
