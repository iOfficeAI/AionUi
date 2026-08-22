/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import CodeMirror from '@uiw/react-codemirror';
import { getMarkdownHighlightStyle } from '../../theme/markdownHighlightStyle';
import { codeEditorSurfaceTheme } from '../../theme/codeEditorTheme';
import { shouldDisableHighlighting } from '../../theme/languageLoader';
import React, { useMemo, useRef, useCallback } from 'react';
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

  // 大文件降级：只摘掉语法解析与高亮，保留表面主题（背景色跟随 token）。
  // 实测同量级下带语法扩展比不带慢约三个数量级 —— 解析成本随文档大小超线性增长，
  // 而增量编辑本身与文件大小无关。
  //
  // Large-file degradation: drop only syntax parsing/highlighting, keep the
  // surface theme (background follows theme tokens). Measured at the same size,
  // parsing with the syntax extension is ~3 orders of magnitude slower than
  // without: parse cost grows super-linearly with document size, while
  // incremental editing itself is size-independent.
  const disableHighlight = shouldDisableHighlighting(value.length);

  const extensions = useMemo<Extension[]>(() => {
    // 自定义 markdown 高亮（非 fallback，优先于 basicSetup 的默认高亮）
    // Custom markdown highlight (non-fallback) wins over basicSetup's default
    // highlighter, while basicSetup's treeHighlighter keeps painting.
    // basicSetup must keep syntaxHighlighting enabled.
    const syntax: Extension[] = disableHighlight
      ? []
      : [markdown(), syntaxHighlighting(getMarkdownHighlightStyle(theme === 'dark' ? 'dark' : 'light'))];
    return [...syntax, Prec.highest(codeEditorSurfaceTheme())];
  }, [disableHighlight, theme]);

  const basicSetupConfig = useMemo(
    () => ({
      lineNumbers: true, // 显示行号 / Show line numbers
      highlightActiveLineGutter: true, // 高亮当前行号 / Highlight active line gutter
      highlightActiveLine: true, // 高亮当前行 / Highlight active line
      // 折叠依赖语法树，降级时一起关 / Folding relies on the syntax tree; off when degraded
      foldGutter: !disableHighlight,
    }),
    [disableHighlight]
  );

  return (
    <div ref={containerRef} className='h-full w-full overflow-hidden'>
      <div ref={editorWrapperRef} className='h-full w-full'>
        <CodeMirror
          value={value}
          height='100%'
          theme={theme === 'dark' ? 'dark' : 'light'}
          extensions={extensions}
          onChange={onChange}
          readOnly={readOnly}
          basicSetup={basicSetupConfig}
          style={{
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 'var(--font-mono-weight)',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
};

export default MarkdownEditor;
