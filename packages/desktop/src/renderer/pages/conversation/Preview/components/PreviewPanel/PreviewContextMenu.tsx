/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { isMacOS } from '@/renderer/utils/platform';
import type { PreviewTab } from './PreviewTabs';

/**
 * 上下文菜单状态
 * Context menu state
 */
export interface ContextMenuState {
  /**
   * 是否显示菜单
   * Whether to show menu
   */
  show: boolean;

  /**
   * 菜单 X 坐标
   * Menu X coordinate
   */
  x: number;

  /**
   * 菜单 Y 坐标
   * Menu Y coordinate
   */
  y: number;

  /**
   * 关联的 Tab ID
   * Associated tab ID
   */
  tabId: string | null;
}

/**
 * 菜单与视口边缘的最小间距，避免贴边显示。
 * Minimum gap between the menu and the viewport edge, so it never sits flush.
 */
const VIEWPORT_MARGIN_PX = 8;

/**
 * PreviewContextMenu 组件属性
 * PreviewContextMenu component props
 */
interface PreviewContextMenuProps {
  /**
   * 上下文菜单状态
   * Context menu state
   */
  contextMenu: ContextMenuState;

  /**
   * Tabs 列表
   * Tabs list
   */
  tabs: PreviewTab[];

  /**
   * 当前主题
   * Current theme
   */
  currentTheme: 'light' | 'dark';

  /**
   * 关闭菜单回调
   * Close menu callback
   */
  onClose: () => void;

  /**
   * 关闭右键点中的这个 Tab
   * Close the tab that was right-clicked
   */
  onCloseTab: (tabId: string) => void;

  /**
   * 关闭左侧 Tabs
   * Close tabs to the left
   */
  onCloseLeft: (tabId: string) => void;

  /**
   * 关闭右侧 Tabs
   * Close tabs to the right
   */
  onCloseRight: (tabId: string) => void;

  /**
   * 关闭其他 Tabs
   * Close other tabs
   */
  onCloseOthers: (tabId: string) => void;

  /**
   * 关闭所有未修改的 Tabs
   * Close all tabs without unsaved changes
   */
  onCloseUnmodified: () => void;

  /**
   * 关闭所有 Tabs
   * Close all tabs
   */
  onCloseAll: () => void;

  /**
   * 复制该 Tab 的绝对路径（浏览器 tab 为其 URL）
   * Copy the tab's absolute path (its URL, for browser tabs)
   */
  onCopyPath: (tabId: string) => void;

  /**
   * 复制该 Tab 的 workspace 相对路径
   * Copy the tab's workspace-relative path
   */
  onCopyRelativePath: (tabId: string) => void;

  /**
   * 在系统文件管理器中打开该文件所在目录
   * Show the tab's file in the OS file manager
   */
  onRevealInFolder: (tabId: string) => void;
}

/**
 * 单个菜单项。禁用态只置灰并吞掉点击 —— 保留条目而不是隐藏，菜单的行高才稳定，
 * 用户也能看出「这项存在，只是现在没有目标」。
 *
 * A single menu entry. The disabled state greys out and swallows the click:
 * keeping the entry rather than hiding it holds the menu's layout steady and
 * shows the user the action exists but currently has no target.
 */
const MenuItem: React.FC<{
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}> = ({ label, shortcut, disabled, onSelect }) => (
  <div
    className={`flex items-center justify-between gap-24px px-12px py-8px text-12px transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed text-t-tertiary' : 'cursor-pointer text-t-primary hover:bg-bg-3'
    }`}
    onClick={() => {
      if (disabled) return;
      onSelect();
    }}
  >
    <span>{label}</span>
    {shortcut && <span className='text-11px text-t-tertiary flex-shrink-0'>{shortcut}</span>}
  </div>
);

/** 分隔线 / Divider */
const MenuDivider: React.FC = () => <div className='h-1px bg-border-1 my-4px mx-8px' />;

/**
 * 预览面板右键菜单组件
 * Preview panel context menu component
 *
 * 提供关闭当前/左侧/右侧/其他/未修改/全部 Tab，以及复制路径、定位文件的功能
 * Provides closing this/left/right/other/unmodified/all tabs, copying paths, and
 * locating the file on disk
 */
const PreviewContextMenu: React.FC<PreviewContextMenuProps> = ({
  contextMenu,
  tabs,
  currentTheme,
  onClose,
  onCloseTab,
  onCloseLeft,
  onCloseRight,
  onCloseOthers,
  onCloseUnmodified,
  onCloseAll,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFolder,
}) => {
  const { t } = useTranslation();
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: contextMenu.x, y: contextMenu.y });

  // 点击外部关闭上下文菜单 / Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!contextMenu.show) return;
      // 如果点击的是菜单内部，不关闭 / Don't close if clicking inside menu
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) {
        return;
      }
      onClose();
    };

    // 使用 mousedown 而不是 click,避免与右键菜单的 onClick 冲突
    // Use mousedown instead of click to avoid conflicts with context menu onClick
    document.addEventListener('mousedown', handleClickOutside, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.show, onClose]);

  // Esc 关闭：右键菜单一旦打开就抢走了注意力，键盘必须有一条退路。
  // Escape closes: an open context menu owns the user's attention, so the
  // keyboard needs a way out of it.
  useEffect(() => {
    if (!contextMenu.show) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu.show, onClose]);

  // 把菜单收进视口内。在 tab 栏底部靠右点开时，菜单本来会有一半探出窗口 ——
  // 条目变多之后更明显，因为菜单更高了。
  //
  // Clamp the menu inside the viewport. Opened near the bottom or right edge of
  // the tab strip it would otherwise hang half outside the window — more visibly
  // so now that the extra entries have made it taller.
  //
  // useLayoutEffect 而非 useEffect：修正必须发生在浏览器绘制之前，否则用户会
  // 看到菜单先闪在错位置再跳回来。
  //
  // useLayoutEffect rather than useEffect: the correction has to land before the
  // browser paints, or the menu visibly flashes at the wrong spot first.
  useLayoutEffect(() => {
    if (!contextMenu.show) return;
    const element = contextMenuRef.current;
    if (!element) return;

    const { width, height } = element.getBoundingClientRect();
    const maxX = window.innerWidth - width - VIEWPORT_MARGIN_PX;
    const maxY = window.innerHeight - height - VIEWPORT_MARGIN_PX;

    setPosition({
      x: Math.max(VIEWPORT_MARGIN_PX, Math.min(contextMenu.x, maxX)),
      y: Math.max(VIEWPORT_MARGIN_PX, Math.min(contextMenu.y, maxY)),
    });
  }, [contextMenu.show, contextMenu.x, contextMenu.y, contextMenu.tabId]);

  if (!contextMenu.show || !contextMenu.tabId) {
    return null;
  }

  const tabId = contextMenu.tabId;
  const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
  const currentTab = currentIndex >= 0 ? tabs[currentIndex] : undefined;
  const hasLeftTabs = currentIndex > 0;
  const hasRightTabs = currentIndex >= 0 && currentIndex < tabs.length - 1;
  const hasOtherTabs = tabs.length > 1;
  const hasUnmodifiedTabs = tabs.some((tab) => !tab.isDirty);

  // 每一项选完都关菜单，而不是指望各个 handler 自己记得关。批量关闭那几个恰好
  // 会自行关闭，但依赖这一点会让新增条目多一个容易漏掉的隐性契约。
  //
  // Every entry dismisses the menu rather than trusting each handler to remember.
  // The batch closes happen to dismiss it themselves, but relying on that would
  // make each new entry carry an implicit contract that is easy to miss.
  const select = (action: () => void) => () => {
    action();
    onClose();
  };

  const primaryModifierLabel = isMacOS() ? '⌘' : 'Ctrl+';

  return createPortal(
    // fixed 定位必须挂到 body 才可靠：预览面板带着入场动画的 transform（
    // animation-fill-mode: forwards 让末帧的 translateX(0) 常驻），会给后代的
    // fixed 元素造出包含块，于是菜单的视口坐标被当成相对面板的坐标，直接被推到
    // 屏幕外 —— 表现就是「右键没反应」。portal 到 body 让它重新相对视口定位。
    //
    // A fixed-position menu has to hang off body to be reliable: the preview
    // panel's enter animation leaves a transform behind (animation-fill-mode:
    // forwards keeps the final translateX(0) applied), which establishes a
    // containing block for fixed descendants. The menu's viewport coordinates
    // were then resolved against the panel instead and pushed it off-screen —
    // which read to the user as right-click doing nothing. Portalling to body
    // restores positioning against the viewport.
    <div
      ref={contextMenuRef}
      className='fixed shadow-lg rd-8px py-4px z-9999'
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: currentTheme === 'dark' ? '#1d1d1f' : '#ffffff',
        border: '1px solid var(--border-base, #e5e6eb)',
        minWidth: '180px',
      }}
    >
      {/* 关闭当前 Tab / Close this tab.
          永远可用：即便只剩一个 tab 也应当能关掉它，这与关闭左侧/右侧/其他不同 —
          那几项在没有对应目标时才置灰。
          Always enabled: closing the last remaining tab is legitimate, unlike the
          bulk entries below, which grey out when they have no target. */}
      <MenuItem
        label={t('preview.close')}
        shortcut={`${primaryModifierLabel}W`}
        onSelect={select(() => onCloseTab(tabId))}
      />

      <MenuDivider />

      {/* 关闭左侧 / Close tabs to the left */}
      <MenuItem label={t('preview.closeLeft')} disabled={!hasLeftTabs} onSelect={select(() => onCloseLeft(tabId))} />

      {/* 关闭右侧 / Close tabs to the right */}
      <MenuItem label={t('preview.closeRight')} disabled={!hasRightTabs} onSelect={select(() => onCloseRight(tabId))} />

      {/* 关闭其他 / Close other tabs */}
      <MenuItem
        label={t('preview.closeOthers')}
        disabled={!hasOtherTabs}
        onSelect={select(() => onCloseOthers(tabId))}
      />

      {/* 关闭未修改 / Close unmodified tabs.
          按 dirty 与否而非按位置筛选：这是「清掉只看过没改过的」那一批，
          右键点中的 tab 若本身干净也在其中，和编辑器里的同名操作一致。
          Filters by dirty state rather than position: this clears the tabs that
          were only read, including the right-clicked one when it is itself
          clean — matching the same-named action in editors. */}
      <MenuItem
        label={t('preview.closeUnmodified')}
        disabled={!hasUnmodifiedTabs}
        onSelect={select(onCloseUnmodified)}
      />

      <MenuDivider />

      {/* 全部关闭 / Close all tabs */}
      <MenuItem label={t('preview.closeAll')} onSelect={select(onCloseAll)} />

      <MenuDivider />

      {/* 复制路径 / Copy path.
          浏览器 tab 这里复制的是 URL —— 对它而言那就是「路径」。
          只传 tabId：项目文件的绝对路径由后端解析并写剪贴板，菜单手上没有那个字符串。
          For a browser tab this copies the URL, which is its path. Only the tabId is
          passed: a project file's absolute path is resolved and copied backend-side,
          so the menu never holds the string. */}
      <MenuItem
        label={t('preview.copyPath')}
        disabled={!currentTab?.canCopyPath}
        onSelect={select(() => onCopyPath(tabId))}
      />

      {/* 复制相对路径 / Copy relative path */}
      <MenuItem
        label={t('preview.copyRelativePath')}
        disabled={!currentTab?.canCopyRelativePath}
        onSelect={select(() => onCopyRelativePath(tabId))}
      />

      {/* 打开文件所在目录 / Show in folder */}
      <MenuItem
        label={t('preview.openLocation')}
        disabled={!currentTab?.canRevealInFolder}
        onSelect={select(() => onRevealInFolder(tabId))}
      />
    </div>,
    document.body
  );
};

export default PreviewContextMenu;
