/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

interface InspectMessages {
  copySuccess: string;
}

const DEFAULT_MESSAGES: InspectMessages = {
  copySuccess: '✓ Copied HTML snippet',
};

/**
 * 生成 HTML 审核元素的注入脚本
 * Generate HTML inspect mode injection script
 *
 * @param inspectMode - 是否启用审核模式
 * @param messages - 自定义提示消息
 * @returns 注入脚本字符串
 */
export function generateInspectScript(inspectMode: boolean, messages: InspectMessages = DEFAULT_MESSAGES): string {
  const copySuccess = JSON.stringify(messages.copySuccess);
  return `
    (function() {

      // 移除旧的检查模式样式和监听器 / Remove old inspect mode styles and listeners
      const oldStyle = document.getElementById('inspect-mode-style');
      if (oldStyle) oldStyle.remove();

      const oldOverlay = document.getElementById('inspect-mode-overlay');
      if (oldOverlay) oldOverlay.remove();

      const oldMenu = document.getElementById('inspect-mode-menu');
      if (oldMenu) oldMenu.remove();

      // 移除旧的事件监听器 / Remove old event listeners
      const oldListeners = window.__inspectModeListeners || {};
      if (oldListeners.mousemove) {
        document.removeEventListener('mousemove', oldListeners.mousemove);
      }
      if (oldListeners.click) {
        document.removeEventListener('click', oldListeners.click);
      }

      if (!${inspectMode}) {
        // 如果关闭检查模式，移除所有相关元素 / If inspect mode is off, remove all related elements
        document.body.style.cursor = '';
        window.__inspectModeListeners = null;
        return;
      }

      // 添加检查模式样式 / Add inspect mode styles
      const style = document.createElement('style');
      style.id = 'inspect-mode-style';
      style.textContent = \`
        .inspect-overlay {
          position: fixed;
          pointer-events: none;
          background: rgba(59, 130, 246, 0.1);
          border: 2px solid #3b82f6;
          z-index: 999999;
          transition: all 0.1s ease;
        }
      \`;
      document.head.appendChild(style);

      // 创建高亮覆盖层 / Create highlight overlay
      const overlay = document.createElement('div');
      overlay.id = 'inspect-mode-overlay';
      overlay.className = 'inspect-overlay';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);

      let currentElement = null;

      // 显示提示通知 / Show notification
      const showNotification = (message) => {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = \`
          position: fixed;
          top: 20px;
          right: 20px;
          background: #10b981;
          color: white;
          padding: 12px 20px;
          border-radius: 6px;
          font-size: 14px;
          z-index: 1000000;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        \`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
      };

      // 鼠标移动时高亮元素 / Highlight element on mouse move
      const handleMouseMove = (e) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (element && element !== currentElement && element !== overlay) {
          currentElement = element;
          const rect = element.getBoundingClientRect();
          overlay.style.display = 'block';
          overlay.style.left = rect.left + 'px';
          overlay.style.top = rect.top + 'px';
          overlay.style.width = rect.width + 'px';
          overlay.style.height = rect.height + 'px';
        }
      };

      // 获取元素的简化标签名 / Get simplified tag name for display
      const getSimplifiedTag = (element) => {
        const tagName = element.tagName.toLowerCase();
        const id = element.id ? '#' + element.id : '';
        const className = element.className && typeof element.className === 'string'
          ? '.' + element.className.split(' ').filter(c => c).slice(0, 1).join('.')
          : '';
        return tagName + id + className;
      };

      // 点击元素发送 HTML 到父窗口 / Click element to send HTML to parent window
      const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (element && element !== overlay) {
          const html = element.outerHTML;
          const tag = getSimplifiedTag(element);

          // 通过 console.log 发送消息（webview 会捕获）/ Send message via console.log (webview will capture)
          console.log('__INSPECT_ELEMENT__' + JSON.stringify({ html: html, tag: tag }));

          // 显示提示 / Show notification
          showNotification(${copySuccess});
        }
      };

      // 添加事件监听 / Add event listeners
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('click', handleClick);

      // 保存监听器引用以便后续移除 / Save listener references for later removal
      window.__inspectModeListeners = {
        mousemove: handleMouseMove,
        click: handleClick
      };

      // 修改鼠标样式 / Change cursor style
      document.body.style.cursor = 'crosshair';
    })();
  `;
}
