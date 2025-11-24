/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/context/ThemeContext';
import { markdown } from '@codemirror/lang-markdown';
import CodeMirror from '@uiw/react-codemirror';
import React from 'react';

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

  // 监听容器滚动事件 / Listen to container scroll events
  React.useEffect(() => {
    const container = containerRef?.current;
    if (!container || !onScroll) return;

    const handleScroll = () => {
      onScroll(container.scrollTop, container.scrollHeight, container.clientHeight);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, onScroll]);

  return (
    <div ref={containerRef} className='h-full w-full overflow-auto'>
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
  );
};

export default MarkdownEditor;
