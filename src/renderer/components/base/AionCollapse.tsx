/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import type { CSSProperties } from 'react';
import React, { useMemo, useState } from 'react';

/**
 * 可折叠面板组件属性 / Collapsible panel component props
 */
export interface AionCollapseProps {
  children: React.ReactNode;
  /** 额外的类名 / Additional class name */
  className?: string;
  /** 非受控模式下默认展开的面板 key / Default active keys in uncontrolled mode */
  defaultActiveKey?: string | string[];
  /** 受控模式下当前展开的面板 key / Active keys in controlled mode */
  activeKey?: string | string[];
  /** 面板状态变化回调 / Callback when panel state changes */
  onChange?: (keys: string[]) => void;
  /** 手风琴模式，每次只能展开一个面板 / Accordion mode, only one panel can be expanded at a time */
  accordion?: boolean;
  /** 自定义展开图标 / Custom expand icon */
  expandIcon?: (active: boolean) => React.ReactNode;
  /** 展开图标位置 / Expand icon position */
  expandIconPosition?: 'left' | 'right';
  /** 是否显示边框 / Whether to show border */
  bordered?: boolean;
}

/**
 * 可折叠面板子项属性 / Collapsible panel item props
 */
export interface AionCollapseItemProps {
  /** 唯一标识符 / Unique identifier */
  name: string;
  /** 面板标题 / Panel header */
  header: React.ReactNode;
  /** 是否禁用 / Whether disabled */
  disabled?: boolean;
  /** 额外的类名 / Additional class name */
  className?: string;
  /** 标题额外的类名 / Additional header class name */
  headerClassName?: string;
  /** 内容额外的类名 / Additional content class name */
  contentClassName?: string;
  /** 内容额外的样式 / Additional content style */
  contentStyle?: CSSProperties;
  /** 子内容 / Children content */
  children?: React.ReactNode;
}

/**
 * 标准化 keys 参数为数组格式 / Normalize keys parameter to array format
 * @param keys - 单个 key 或 key 数组 / Single key or array of keys
 * @returns 标准化后的 key 数组 / Normalized array of keys
 */
const normalizeKeys = (keys?: string | string[]): string[] => {
  if (!keys) return [];
  return Array.isArray(keys) ? keys : [keys];
};

/**
 * 默认展开/收起图标 / Default expand/collapse icon
 */
const DefaultIcon: React.FC<{ active: boolean }> = ({ active }) => <span className={classNames('text-xs text-t-secondary transition-transform duration-200', active && 'rotate-180')}>▼</span>;

/**
 * 折叠面板子项组件（仅用于类型检查和结构化）
 * Collapse item component (used for type checking and structure only)
 */
const AionCollapseItem: React.FC<AionCollapseItemProps> = ({ children }) => <>{children}</>;
AionCollapseItem.displayName = 'AionCollapseItem';

/**
 * 可折叠面板组件 / Collapsible panel component
 *
 * 支持受控和非受控模式、手风琴模式、自定义图标等
 * Supports controlled/uncontrolled mode, accordion mode, custom icons, etc.
 *
 * @example
 * ```tsx
 * // 基本用法 / Basic usage
 * <AionCollapse defaultActiveKey={['1']}>
 *   <AionCollapse.Item name="1" header="面板1">
 *     内容1
 *   </AionCollapse.Item>
 *   <AionCollapse.Item name="2" header="面板2">
 *     内容2
 *   </AionCollapse.Item>
 * </AionCollapse>
 *
 * // 手风琴模式 / Accordion mode
 * <AionCollapse accordion defaultActiveKey="1">
 *   <AionCollapse.Item name="1" header="面板1">内容1</AionCollapse.Item>
 *   <AionCollapse.Item name="2" header="面板2">内容2</AionCollapse.Item>
 * </AionCollapse>
 *
 * // 自定义图标 / Custom icon
 * <AionCollapse
 *   expandIcon={(active) => <Icon type={active ? 'up' : 'down'} />}
 *   expandIconPosition="right"
 * >
 *   <AionCollapse.Item name="1" header="面板1">内容1</AionCollapse.Item>
 * </AionCollapse>
 * ```
 */
const AionCollapseComponent: React.FC<AionCollapseProps> & { Item: typeof AionCollapseItem } = ({ children, className, defaultActiveKey, activeKey, onChange, accordion, expandIcon, expandIconPosition = 'left', bordered = true }) => {
  // 判断是否为受控模式 / Determine if in controlled mode
  const isControlled = activeKey !== undefined;
  const [internalKeys, setInternalKeys] = useState<string[]>(normalizeKeys(defaultActiveKey));
  const currentKeys = isControlled ? normalizeKeys(activeKey) : internalKeys;

  // 提取并过滤有效的子面板项 / Extract and filter valid child panel items
  const items = useMemo(() => {
    return React.Children.toArray(children).filter((child): child is React.ReactElement<AionCollapseItemProps> => {
      return React.isValidElement(child) && child.type === AionCollapseItem;
    });
  }, [children]);

  /**
   * 处理面板切换 / Handle panel toggle
   * @param name - 面板唯一标识 / Panel unique identifier
   * @param disabled - 是否禁用 / Whether disabled
   */
  const handleToggle = (name: string, disabled?: boolean) => {
    if (disabled) return;
    let nextKeys: string[];
    if (currentKeys.includes(name)) {
      // 收起面板 / Collapse panel
      nextKeys = currentKeys.filter((key) => key !== name);
    } else {
      // 展开面板（手风琴模式只展开一个）/ Expand panel (accordion mode expands only one)
      nextKeys = accordion ? [name] : [...currentKeys, name];
    }
    if (!isControlled) {
      setInternalKeys(nextKeys);
    }
    onChange?.(nextKeys);
  };

  // 挂载状态，用于控制动画 / Mount state for animation control
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className={classNames('rounded-16px  flex flex-col gap-12px bg-2 py-18px px-[12px] md:px-[32px]', className)}>
      {items.map((child) => {
        const { name, header, disabled, className: itemClassName, headerClassName, contentClassName, contentStyle } = child.props;
        const isActive = currentKeys.includes(name);
        const iconNode = expandIcon ? expandIcon(isActive) : <DefaultIcon active={isActive} />;

        return (
          <div key={name} className={classNames('overflow-hidden border border-solid border-[color:var(--color-border-2)] rounded-12px', !bordered && 'border-transparent', itemClassName, disabled && 'opacity-50')}>
            {/* 面板标题 / Panel header */}
            <div onClick={() => handleToggle(name, disabled)} className={classNames('flex items-center gap-3 text-left transition-colors py-5px cursor-pointer', headerClassName)}>
              {expandIconPosition === 'left' && <span className='flex items-center'>{iconNode}</span>}
              <div className='flex-1 text-2 text-14px'>{header}</div>
              {expandIconPosition === 'right' && <span className='flex items-center'>{iconNode}</span>}
            </div>
            {/* 面板内容（使用 grid 实现平滑动画）/ Panel content (using grid for smooth animation) */}
            <div className='transition-all duration-300 ease-in-out'>
              {isActive && (
                <div className={classNames('grid overflow-hidden', mounted && 'transition-all duration-300 ease-in-out', contentClassName)} style={{ gridTemplateRows: '1fr', ...contentStyle }}>
                  <div className='overflow-hidden border-t border-[color:var(--color-border-2)]'>{child.props.children}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

AionCollapseComponent.Item = AionCollapseItem;

export default AionCollapseComponent;
