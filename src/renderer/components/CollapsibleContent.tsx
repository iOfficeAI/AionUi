/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/context/ThemeContext';
import { Down, Up } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// 渐变遮罩常量 Gradient mask constants
// mask-image 模式：让内容本身淡出，适用于有背景色的场景（如 Alert）
// mask-image mode: fade out content itself, suitable for scenarios with background color (like Alert)
const MASK_GRADIENT = 'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 60%, rgba(0, 0, 0, 0.4) 90%, rgba(0, 0, 0, 0) 100%)';

// 背景渐变模式：使用固定颜色遮罩，适用于普通场景
// Background gradient mode: use fixed color mask, suitable for normal scenarios
const BG_GRADIENT_DARK = 'linear-gradient(to bottom, rgba(30, 30, 30, 0) 0%, rgba(30, 30, 30, 0.6) 40%, rgba(30, 30, 30, 0.95) 80%, rgba(30, 30, 30, 1) 100%)';
const BG_GRADIENT_LIGHT = 'linear-gradient(to bottom, rgba(247, 248, 250, 0) 0%, rgba(247, 248, 250, 0.6) 40%, rgba(247, 248, 250, 0.95) 80%, rgba(247, 248, 250, 1) 100%)';

interface CollapsibleContentProps {
  children: React.ReactNode;
  /**
   * 最大高度（像素），超过此高度时显示展开/折叠按钮
   * Maximum height in pixels, show expand/collapse button when content exceeds this height
   * @default 240
   */
  maxHeight?: number;
  /**
   * 初始是否折叠
   * Whether initially collapsed
   * @default true
   */
  defaultCollapsed?: boolean;
  /**
   * 自定义样式类名
   * Custom className
   */
  className?: string;
  /**
   * 内容区域样式类名
   * Content area className
   */
  contentClassName?: string;
  /**
   * 是否使用 mask 模式（适用于有背景色的场景，如 Alert）
   * Whether to use mask mode (suitable for scenarios with background color, like Alert)
   * @default false
   */
  useMask?: boolean;
  /**
   * 是否允许横向滚动，避免宽内容被裁剪
   * Allow horizontal scrolling to prevent clipping wide content
   */
  allowHorizontalScroll?: boolean;
}

/**
 * 长内容展示组件，支持折叠/展开功能
 * Collapsible content component with expand/collapse functionality
 *
 * 特性 Features:
 * - 自动检测内容高度并显示折叠按钮 Auto-detect content height and show collapse button
 * - 渐变遮罩效果，让内容自然淡出 Gradient mask for natural content fade-out
 * - 支持亮色/暗色主题 Support light/dark theme
 *
 * @example
 * ```tsx
 * <CollapsibleContent maxHeight={200}>
 *   <div>很长的内容...</div>
 * </CollapsibleContent>
 * ```
 */
export const CollapsibleContent: React.FC<CollapsibleContentProps> = ({ children, maxHeight = 240, defaultCollapsed = true, className, contentClassName, useMask = false, allowHorizontalScroll = false }) => {
  const { t } = useTranslation(); // 国际化 i18n
  const { theme } = useThemeContext(); // 主题上下文（亮色/暗色）Theme context (light/dark)
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed); // 折叠状态 Collapse state
  const [needsCollapse, setNeedsCollapse] = useState(false); // 是否需要折叠功能 Whether collapse feature is needed
  const contentRef = useRef<HTMLDivElement>(null); // 内容容器引用 Content container ref

  // 检测内容高度 Detect content height using ResizeObserver
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    // 检测内容高度的辅助函数 Helper function to check content height
    let rafId: number | null = null;
    const scheduleHeightCheck = () => {
      const update = () => {
        const contentHeight = element.scrollHeight;
        setNeedsCollapse(contentHeight > maxHeight);
      };

      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        rafId = window.requestAnimationFrame(update);
      } else {
        update();
      }
    };

    // 使用 ResizeObserver 替代 setTimeout，更精确地检测内容变化
    // Use ResizeObserver instead of setTimeout for more accurate content change detection
    // Electron 环境完全支持 ResizeObserver，但添加检查以增强兼容性
    // ResizeObserver is fully supported in Electron, but add check for enhanced compatibility
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        scheduleHeightCheck();
      });

      resizeObserver.observe(element);

      // 初始检测 Initial check
      scheduleHeightCheck();

      return () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        resizeObserver.disconnect();
      };
    } else {
      // Fallback: 如果 ResizeObserver 不可用（理论上不会发生），使用 setTimeout
      // Fallback: use setTimeout if ResizeObserver is unavailable (should not happen in practice)
      const timer = setTimeout(scheduleHeightCheck, 100);
      return () => {
        clearTimeout(timer);
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    }
  }, [children, maxHeight]);

  // 切换折叠状态 Toggle collapse state
  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  // 计算内容区域样式 Calculate content area style
  const contentStyle = useMemo(() => {
    const style: React.CSSProperties = {
      maxHeight: isCollapsed ? `${maxHeight}px` : undefined,
      overflowX: allowHorizontalScroll ? 'auto' : 'hidden',
      overflowY: isCollapsed ? 'hidden' : 'visible',
    };

    if (!allowHorizontalScroll && !isCollapsed) {
      style.overflowX = 'visible';
    }

    // mask-image 模式：让内容本身淡出 mask-image mode: fade out content itself
    if (useMask && isCollapsed) {
      style.maskImage = MASK_GRADIENT;
      style.WebkitMaskImage = MASK_GRADIENT;
    }

    return style;
  }, [allowHorizontalScroll, isCollapsed, maxHeight, useMask]);

  // 计算背景渐变颜色 Calculate background gradient color
  const bgGradient = useMemo(() => {
    return theme === 'dark' ? BG_GRADIENT_DARK : BG_GRADIENT_LIGHT;
  }, [theme]);

  return (
    <div className={classNames('relative', className)}>
      {/* 内容区域 Content area */}
      <div ref={contentRef} className={classNames('transition-all duration-300', contentClassName)} style={contentStyle}>
        {children}
      </div>

      {/* 渐变遮罩（仅在非 mask 模式、折叠且内容超出时显示）
          Gradient mask (only shown in non-mask mode when collapsed and content exceeds)
          采用多段渐变实现内容淡出效果：
          Multi-step gradient for content fade-out effect:
          - 0%: 完全透明，内容清晰可见 Fully transparent, content clearly visible
          - 40%: 60% 不透明度，内容隐约可见 60% opacity, content faintly visible
          - 80%: 95% 不透明度，内容几乎看不见 95% opacity, content barely visible
          - 100%: 完全不透明，融入背景色 Fully opaque, blends with background */}
      {!useMask && needsCollapse && isCollapsed && (
        <div
          className='absolute bottom-0 left-0 right-0 pointer-events-none'
          style={{
            height: '80px',
            background: bgGradient,
          }}
        />
      )}

      {/* 展开/折叠按钮 Expand/Collapse button */}
      {needsCollapse && (
        <div className='flex justify-center relative z-10'>
          <button onClick={toggleCollapse} className='flex items-center gap-1 px-3 py-1.5 text-sm text-t-primary hover:text-primary transition-colors cursor-pointer border-none bg-transparent font-medium [&_svg]:transition-colors [&_svg]:inline-block [&_svg]:align-middle' type='button'>
            {isCollapsed ? (
              <>
                {/* 展开更多 Expand more */}
                <span className='leading-none'>{t('common.expandMore')}</span>
                <Down theme='outline' size='14' fill='currentColor' className='inline-block' />
              </>
            ) : (
              <>
                {/* 收起 Collapse */}
                <span className='leading-none'>{t('common.collapse')}</span>
                <Up theme='outline' size='14' fill='currentColor' className='inline-block' />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default CollapsibleContent;
