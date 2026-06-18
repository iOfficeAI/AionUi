/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import CodeMirror from '@uiw/react-codemirror';
import { getMarkdownHighlightStyle } from '../../theme/markdownHighlightStyle';
import { codeEditorSurfaceTheme } from '../../theme/codeEditorTheme';
import React, { useRef, useCallback } from 'react';
import { useCodeMirrorScroll, useScrollSyncTarget } from '../../hooks/useScrollSyncHelpers';

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
const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  containerRef,
  onScroll,
}) => {
  const { theme } = useThemeContext();
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // 使用 CodeMirror 滚动 Hook / Use CodeMirror scroll hook
  const { setScrollPercent } = useCodeMirrorScroll(editorWrapperRef, onScroll);

  // 监听外部滚动同步请求 / Listen for external scroll sync requests
  const handleTargetScroll = useCallback(
    (targetPercent: number) => {
      setScrollPercent(targetPercent);
    },
    [setScrollPercent]
  );
  useScrollSyncTarget(containerRef, handleTargetScroll);

  return (
    <div ref={containerRef} className='h-full w-full overflow-hidden'>
      <div ref={editorWrapperRef} className='h-full w-full'>
        <CodeMirror
          value={value}
          height='100%'
          theme={theme === 'dark' ? 'dark' : 'light'}
          // 自定义 markdown 高亮（非 fallback，优先于 basicSetup 的默认高亮）
          // Custom markdown highlight (non-fallback) wins over basicSetup's default highlighter,
          // while basicSetup's treeHighlighter keeps painting. basicSetup must keep syntaxHighlighting enabled.
          extensions={[
            markdown(),
            syntaxHighlighting(getMarkdownHighlightStyle(theme === 'dark' ? 'dark' : 'light')),
            Prec.highest(codeEditorSurfaceTheme()),
          ]}
          onChange={onChange}
          readOnly={readOnly}
          basicSetup={{
            lineNumbers: true, // 显示行号 / Show line numbers
            highlightActiveLineGutter: true, // 高亮当前行号 / Highlight active line gutter
            highlightActiveLine: true, // 高亮当前行 / Highlight active line
            foldGutter: true, // 折叠功能 / Code folding
          }}
          style={{
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
};

export default MarkdownEditor;
