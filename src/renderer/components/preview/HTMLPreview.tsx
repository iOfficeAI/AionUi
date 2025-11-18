/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '@arco-design/web-react';
import MonacoEditor from '@monaco-editor/react';

interface HTMLPreviewProps {
  content: string;
  filePath?: string;
  hideToolbar?: boolean;
}

interface SelectedElement {
  path: string; // DOM 路径，如 "html > body > div:nth-child(2) > p:nth-child(1)"
  html: string; // 元素的 outerHTML
  startLine?: number; // 代码起始行（估算）
  endLine?: number; // 代码结束行（估算）
}

/**
 * HTML 预览组件
 * - 支持实时预览和代码编辑
 * - 支持元素选择器（类似 DevTools）
 * - 支持双向定位：预览 ↔ 代码
 */
const HTMLPreview: React.FC<HTMLPreviewProps> = ({ content, filePath, hideToolbar = false }) => {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [htmlCode, setHtmlCode] = useState(content);
  const [inspectorMode, setInspectorMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; element: SelectedElement } | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  // 监听主题变化
  useEffect(() => {
    const updateTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // 初始化 iframe 内容
  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (!iframeDoc) return;

    // 写入 HTML 内容
    iframeDoc.open();
    iframeDoc.write(htmlCode);
    iframeDoc.close();

    // 注入元素选择器脚本
    if (inspectorMode) {
      injectInspectorScript(iframeDoc);
    }
  }, [htmlCode, inspectorMode]);

  /**
   * 注入元素选择器脚本到 iframe
   */
  const injectInspectorScript = (iframeDoc: Document) => {
    const script = iframeDoc.createElement('script');
    script.textContent = `
      (function() {
        let hoveredElement = null;
        let overlay = null;

        // 创建高亮遮罩
        function createOverlay() {
          overlay = document.createElement('div');
          overlay.style.position = 'absolute';
          overlay.style.border = '2px solid #2196F3';
          overlay.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = '999999';
          overlay.style.boxSizing = 'border-box';
          document.body.appendChild(overlay);
        }

        // 更新遮罩位置
        function updateOverlay(element) {
          if (!overlay) createOverlay();
          const rect = element.getBoundingClientRect();
          overlay.style.top = rect.top + window.scrollY + 'px';
          overlay.style.left = rect.left + window.scrollX + 'px';
          overlay.style.width = rect.width + 'px';
          overlay.style.height = rect.height + 'px';
          overlay.style.display = 'block';
        }

        // 隐藏遮罩
        function hideOverlay() {
          if (overlay) {
            overlay.style.display = 'none';
          }
        }

        // 获取元素的 CSS 选择器路径
        function getElementPath(element) {
          const path = [];
          while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase();
            if (element.id) {
              selector += '#' + element.id;
              path.unshift(selector);
              break;
            } else {
              let sibling = element;
              let nth = 1;
              while (sibling.previousElementSibling) {
                sibling = sibling.previousElementSibling;
                if (sibling.nodeName.toLowerCase() === selector) {
                  nth++;
                }
              }
              if (nth > 1) {
                selector += ':nth-child(' + nth + ')';
              }
            }
            path.unshift(selector);
            element = element.parentElement;
          }
          return path.join(' > ');
        }

        // 鼠标移动事件
        document.addEventListener('mousemove', function(e) {
          hoveredElement = e.target;
          if (hoveredElement && hoveredElement !== document.body && hoveredElement !== document.documentElement) {
            updateOverlay(hoveredElement);
          } else {
            hideOverlay();
          }
        });

        // 鼠标离开事件
        document.addEventListener('mouseleave', function() {
          hideOverlay();
        });

        // 点击事件 - 选中元素
        document.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();

          if (hoveredElement && hoveredElement !== document.body && hoveredElement !== document.documentElement) {
            const elementInfo = {
              path: getElementPath(hoveredElement),
              html: hoveredElement.outerHTML,
            };

            // 发送消息到父窗口
            window.parent.postMessage({
              type: 'element-selected',
              data: elementInfo
            }, '*');
          }
        });

        // 右键菜单事件
        document.addEventListener('contextmenu', function(e) {
          e.preventDefault();

          if (hoveredElement && hoveredElement !== document.body && hoveredElement !== document.documentElement) {
            const elementInfo = {
              path: getElementPath(hoveredElement),
              html: hoveredElement.outerHTML,
            };

            // 发送消息到父窗口
            window.parent.postMessage({
              type: 'element-contextmenu',
              data: {
                element: elementInfo,
                x: e.clientX,
                y: e.clientY
              }
            }, '*');
          }
        });
      })();
    `;
    iframeDoc.body.appendChild(script);
  };

  /**
   * 监听 iframe 消息
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'element-selected') {
        const elementInfo: SelectedElement = event.data.data;
        setSelectedElement(elementInfo);
        console.log('[HTMLPreview] Element selected:', elementInfo);
        messageApi.info(`已选中元素: ${elementInfo.path}`);
      } else if (event.data.type === 'element-contextmenu') {
        const { element, x, y } = event.data.data;

        // 计算上下文菜单位置（相对于父窗口）
        const iframe = iframeRef.current;
        if (iframe) {
          const iframeRect = iframe.getBoundingClientRect();
          setContextMenu({
            x: iframeRect.left + x,
            y: iframeRect.top + y,
            element: element,
          });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [messageApi]);

  /**
   * 关闭右键菜单
   */
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  /**
   * 复制元素 HTML
   */
  const handleCopyHTML = useCallback(
    (html: string) => {
      void navigator.clipboard.writeText(html);
      messageApi.success('已复制元素 HTML');
      setContextMenu(null);
    },
    [messageApi]
  );

  /**
   * 下载 HTML
   */
  const handleDownload = () => {
    const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filePath?.split('/').pop() || 'document'}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * 切换编辑模式
   */
  const handleToggleEdit = () => {
    if (editMode) {
      // 保存编辑
      setHtmlCode(htmlCode);
    }
    setEditMode(!editMode);
  };

  /**
   * 切换检查器模式
   */
  const handleToggleInspector = () => {
    setInspectorMode(!inspectorMode);
    if (!inspectorMode) {
      messageApi.info('元素选择器已开启，点击预览中的元素可定位代码');
    }
  };

  return (
    <div className='h-full w-full flex flex-col bg-bg-1'>
      {messageContextHolder}

      {/* 工具栏 */}
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 border-b border-border-base flex-shrink-0'>
          <div className='flex items-center gap-8px'>
            {/* 编辑按钮 */}
            <button onClick={handleToggleEdit} className={`px-12px py-4px rd-4px text-12px transition-colors ${editMode ? 'bg-primary text-white' : 'bg-bg-3 text-t-primary hover:bg-bg-4'}`}>
              {editMode ? '💾 保存' : '✏️ 编辑'}
            </button>

            {/* 元素选择器按钮 */}
            <button onClick={handleToggleInspector} className={`px-12px py-4px rd-4px text-12px transition-colors ${inspectorMode ? 'bg-primary text-white' : 'bg-bg-3 text-t-primary hover:bg-bg-4'}`} title='开启后，点击预览中的元素可查看其 HTML 代码'>
              🔍 {inspectorMode ? '选择中...' : '元素选择器'}
            </button>

            {/* 选中的元素路径 */}
            {selectedElement && (
              <div className='text-12px text-t-secondary ml-8px'>
                已选中: <code className='bg-bg-3 px-4px rd-2px'>{selectedElement.path}</code>
              </div>
            )}
          </div>

          <div className='flex items-center gap-8px'>
            {/* 下载按钮 */}
            <button onClick={handleDownload} className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' title='下载 HTML 文件'>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span className='text-12px text-t-secondary'>{t('common.download')}</span>
            </button>
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className='flex-1 flex overflow-hidden'>
        {/* 左侧：代码编辑器（编辑模式时显示） */}
        {editMode && (
          <div className='flex-1 overflow-hidden border-r border-border-base'>
            <MonacoEditor
              height='100%'
              language='html'
              theme={currentTheme === 'dark' ? 'vs-dark' : 'vs'}
              value={htmlCode}
              onChange={(value) => setHtmlCode(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                formatOnPaste: true,
                formatOnType: true,
              }}
            />
          </div>
        )}

        {/* 右侧：HTML 预览 */}
        <div className={`${editMode ? 'flex-1' : 'w-full'} overflow-auto bg-white`}>
          <iframe ref={iframeRef} className='w-full h-full border-0' sandbox='allow-scripts allow-same-origin' title='HTML Preview' />
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className='fixed bg-bg-1 border border-border-base rd-6px shadow-lg py-4px z-9999'
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className='px-12px py-6px text-13px text-t-primary hover:bg-bg-2 cursor-pointer transition-colors' onClick={() => handleCopyHTML(contextMenu.element.html)}>
            📋 复制元素 HTML
          </div>
          <div
            className='px-12px py-6px text-13px text-t-primary hover:bg-bg-2 cursor-pointer transition-colors'
            onClick={() => {
              console.log('[HTMLPreview] Element info:', contextMenu.element);
              messageApi.info('已在控制台打印元素信息');
              setContextMenu(null);
            }}
          >
            🔍 查看元素信息
          </div>
        </div>
      )}
    </div>
  );
};

export default HTMLPreview;
