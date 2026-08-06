/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import type { PreviewTab, PreviewTabPatch } from '../context/PreviewContext';
import BrowserViewer from './BrowserViewer';

export interface BrowserTabLayerProps {
  /** 所有浏览器类型的 tab / Every browser-type tab */
  browserTabs: PreviewTab[];
  /** 当前激活的 tab id（可能不是浏览器 tab）/ Active tab id (may not be a browser tab) */
  activeTabId: string | null;
  /** 回写 tab 字段 / Patch fields back onto a tab */
  updateTab: (tabId: string, patch: PreviewTabPatch) => void;
}

/**
 * 常驻挂载的浏览器层 / Always-mounted browser layer.
 *
 * 预览面板原本只渲染当前激活的 tab，对文档没问题，但对浏览器是致命的：
 * 切走再切回会重新加载页面，滚动位置、表单内容、未提交的操作全部丢失，
 * Agent 正在进行的操作也会被打断。
 *
 * 所以这一层把所有浏览器 tab 一直挂着，只切换可见性 —— webview 进程不销毁，
 * 页面状态完整保留。非激活的 tab 用 visibility 隐藏而不是 display:none，
 * 这样它们仍有真实尺寸，切回来时不需要重新布局。
 *
 * The preview panel renders only the active tab, which is fine for documents but
 * fatal for a browser: switching away and back would reload the page, losing
 * scroll position, form input, and any in-flight agent operation. This layer keeps
 * every browser tab mounted and only toggles visibility, so the webview process
 * survives. Inactive tabs are hidden via `visibility` rather than `display:none`
 * so they retain real dimensions and need no relayout when shown again.
 */
const BrowserTabLayer: React.FC<BrowserTabLayerProps> = ({ browserTabs, activeTabId, updateTab }) => {
  const handleUrlChange = useCallback(
    (tabId: string, url: string) => {
      // 地址存在 content 里，与其他 tab 类型保持一致 / Address lives in content, like other tab types
      updateTab(tabId, { content: url });
    },
    [updateTab]
  );

  const handleTitleChange = useCallback((tabId: string, title: string) => updateTab(tabId, { title }), [updateTab]);

  const handleFaviconChange = useCallback(
    (tabId: string, favicon: string) => updateTab(tabId, { metadata: { favicon } }),
    [updateTab]
  );

  if (browserTabs.length === 0) return null;

  const isBrowserActive = browserTabs.some((tab) => tab.id === activeTabId);

  return (
    <div className='relative flex-1 overflow-hidden' style={{ display: isBrowserActive ? undefined : 'none' }}>
      {browserTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className='absolute inset-0 flex flex-col'
            style={{
              visibility: isActive ? 'visible' : 'hidden',
              pointerEvents: isActive ? undefined : 'none',
              zIndex: isActive ? 1 : 0,
            }}
          >
            <BrowserViewer
              url={tab.content}
              tabId={tab.id}
              onUrlChange={handleUrlChange}
              onTitleChange={handleTitleChange}
              onFaviconChange={handleFaviconChange}
            />
          </div>
        );
      })}
    </div>
  );
};

export default BrowserTabLayer;
