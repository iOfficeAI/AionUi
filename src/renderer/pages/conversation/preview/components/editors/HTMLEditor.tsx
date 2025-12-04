/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/context/ThemeContext';
import { html } from '@codemirror/lang-html';
import { history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import React, { useMemo, useRef, useEffect } from 'react';

interface HTMLEditorProps {
  value: string;
  onChange: (value: string) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  filePath?: string; // 用于生成稳定的 key / Used to generate stable key
}

/**
 * HTML 代码编辑器组件
 * HTML code editor component
 *
 * 使用 CodeMirror 进行 HTML 代码编辑，支持撤销/重做历史记录
 * Uses CodeMirror for HTML code editing with undo/redo history support
 */
const HTMLEditor: React.FC<HTMLEditorProps> = ({ value, onChange, containerRef, onScroll, filePath }) => {
  const { theme } = useThemeContext();
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // 监听 CodeMirror 内部滚动容器的滚动事件
  // Listen to CodeMirror's internal scroller scroll events
  useEffect(() => {
    if (!onScroll) return;

    // 延迟获取 scroller，等待 CodeMirror 渲染完成
    // Delay getting scroller to wait for CodeMirror to render
    const timer = setTimeout(() => {
      const wrapper = editorWrapperRef.current;
      if (!wrapper) return;

      // CodeMirror 的滚动容器是 .cm-scroller 元素
      // CodeMirror's scroll container is the .cm-scroller element
      const scroller = wrapper.querySelector('.cm-scroller') as HTMLElement;
      if (!scroller) {
        console.warn('[HTMLEditor] Could not find .cm-scroller element');
        return;
      }

      const handleScroll = () => {
        console.log('[HTMLEditor] CodeMirror scroll:', {
          scrollTop: scroller.scrollTop,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
        });
        onScroll(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
      };

      scroller.addEventListener('scroll', handleScroll, { passive: true });

      // 存储清理函数以便在 effect 清理时调用
      // Store cleanup function for effect cleanup
      (editorWrapperRef.current as HTMLDivElement & { __scrollCleanup?: () => void }).__scrollCleanup = () => {
        scroller.removeEventListener('scroll', handleScroll);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      const wrapper = editorWrapperRef.current as (HTMLDivElement & { __scrollCleanup?: () => void }) | null;
      wrapper?.__scrollCleanup?.();
    };
  }, [onScroll]);

  // 监听外部滚动同步请求（通过 data-target-scroll-percent 属性）
  // Listen for external scroll sync requests (via data-target-scroll-percent attribute)
  useEffect(() => {
    if (!containerRef?.current) return;

    const container = containerRef.current;

    // 使用 MutationObserver 监听 data 属性变化
    // Use MutationObserver to listen for data attribute changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-target-scroll-percent') {
          const targetPercent = parseFloat(container.dataset.targetScrollPercent || '0');
          if (isNaN(targetPercent)) return;

          const wrapper = editorWrapperRef.current;
          if (!wrapper) return;

          const scroller = wrapper.querySelector('.cm-scroller') as HTMLElement;
          if (scroller) {
            const targetScroll = targetPercent * (scroller.scrollHeight - scroller.clientHeight);
            console.log('[HTMLEditor] Syncing scroll from external:', { targetPercent, targetScroll });
            scroller.scrollTop = targetScroll;
          }
        }
      }
    });

    observer.observe(container, { attributes: true, attributeFilter: ['data-target-scroll-percent'] });
    return () => observer.disconnect();
  }, [containerRef]);

  // 使用 filePath 作为 key 的一部分，确保编辑器实例稳定
  // Use filePath as part of key to ensure editor instance is stable
  const editorKey = useMemo(() => {
    return filePath || 'html-editor';
  }, [filePath]);

  // 包装 onChange 以添加日志和类型检查 / Wrap onChange to add logging and type checking
  const handleChange = React.useCallback(
    (newValue: string) => {
      // 严格类型检查 / Strict type checking
      if (typeof newValue !== 'string') {
        console.error('[HTMLEditor] onChange received non-string value:', newValue);
        return;
      }

      onChange(newValue);
    },
    [onChange]
  );

  // 配置扩展，包含 HTML 语法和历史记录支持
  // Configure extensions including HTML syntax and history support
  const extensions = useMemo(
    () => [
      html(),
      history(), // 显式添加历史记录支持 / Explicitly add history support
      keymap.of(historyKeymap), // 添加历史记录快捷键 / Add history keymaps
    ],
    []
  );

  return (
    <div ref={containerRef} className='h-full w-full overflow-hidden'>
      <div ref={editorWrapperRef} className='h-full w-full'>
        <CodeMirror
          key={editorKey}
          value={value}
          height='100%'
          theme={theme === 'dark' ? 'dark' : 'light'}
          extensions={extensions}
          onChange={handleChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            history: false, // 关闭 basicSetup 的 history，使用我们自己的 / Disable basicSetup history, use our own
          }}
          style={{
            fontSize: '14px',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
};

export default HTMLEditor;
