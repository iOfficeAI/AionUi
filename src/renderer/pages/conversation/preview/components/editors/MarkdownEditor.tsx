/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/context/ThemeContext';
import { markdown } from '@codemirror/lang-markdown';
import CodeMirror from '@uiw/react-codemirror';
import React, { useRef, useEffect } from 'react';

interface MarkdownEditorProps {
  value: string; // 编辑器内容 / Editor content
  onChange: (value: string) => void; // 内容变化回调 / Content change callback
  readOnly?: boolean; // 是否只读 / Whether read-only
  containerRef?: React.RefObject<HTMLDivElement>; // 容器引用，用于滚动同步 / Container ref for scroll sync
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void; // 滚动回调 / Scroll callback
}

/**
 * Markdown 编辑器组件
 * Markdown editor component
 *
 * 基于 CodeMirror 实现，支持语法高亮和实时编辑
 * Based on CodeMirror, supports syntax highlighting and live editing
 */
const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, readOnly = false, containerRef, onScroll }) => {
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
        console.warn('[MarkdownEditor] Could not find .cm-scroller element');
        return;
      }

      const handleScroll = () => {
        console.log('[MarkdownEditor] CodeMirror scroll:', {
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
            console.log('[MarkdownEditor] Syncing scroll from external:', { targetPercent, targetScroll });
            scroller.scrollTop = targetScroll;
          }
        }
      }
    });

    observer.observe(container, { attributes: true, attributeFilter: ['data-target-scroll-percent'] });
    return () => observer.disconnect();
  }, [containerRef]);

  return (
    <div ref={containerRef} className='h-full w-full overflow-hidden'>
      <div ref={editorWrapperRef} className='h-full w-full'>
        <CodeMirror
          value={value}
          height='100%'
          theme={theme === 'dark' ? 'dark' : 'light'}
          extensions={[markdown()]} // Markdown 语法支持 / Markdown syntax support
          onChange={onChange}
          readOnly={readOnly}
          basicSetup={{
            lineNumbers: true, // 显示行号 / Show line numbers
            highlightActiveLineGutter: true, // 高亮当前行号 / Highlight active line gutter
            highlightActiveLine: true, // 高亮当前行 / Highlight active line
            foldGutter: true, // 折叠功能 / Code folding
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

export default MarkdownEditor;
