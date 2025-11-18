/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { useThemeContext } from '@/renderer/context/ThemeContext';

interface MarkdownEditorProps {
  value: string; // 编辑器内容 / Editor content
  onChange: (value: string) => void; // 内容变化回调 / Content change callback
  readOnly?: boolean; // 是否只读 / Whether read-only
}

/**
 * Markdown 编辑器组件
 * Markdown editor component
 *
 * 基于 CodeMirror 实现，支持语法高亮和实时编辑
 * Based on CodeMirror, supports syntax highlighting and live editing
 */
const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, readOnly = false }) => {
  const { theme } = useThemeContext();

  return (
    <div className='h-full w-full overflow-auto'>
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
