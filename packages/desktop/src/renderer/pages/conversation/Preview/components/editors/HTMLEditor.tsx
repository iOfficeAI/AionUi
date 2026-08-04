/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { html } from '@codemirror/lang-html';
import { history, historyKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import CodeMirror from '@uiw/react-codemirror';
import { codeEditorSurfaceTheme } from '../../theme/codeEditorTheme';
import { shouldDisableHighlighting } from '../../theme/languageLoader';
import React, { useMemo, useRef, useCallback } from 'react';
import { useCodeMirrorScroll, useScrollSyncTarget } from '../../hooks/useScrollSyncHelpers';

interface HTMLEditorProps {
  value: string;
  onChange: (value: string) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  file_path?: string; // 用于生成稳定的 key / Used to generate stable key
}

/**
 * HTML 代码编辑器组件
 * HTML code editor component
 *
 * 使用 CodeMirror 进行 HTML 代码编辑，支持撤销/重做历史记录
 * Uses CodeMirror for HTML code editing with undo/redo history support
 */
const HTMLEditor: React.FC<HTMLEditorProps> = ({ value, onChange, containerRef, onScroll, file_path }) => {
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

  // 使用 file_path 作为 key 的一部分，确保编辑器实例稳定
  // Use file_path as part of key to ensure editor instance is stable
  const editorKey = useMemo(() => {
    return file_path || 'html-editor';
  }, [file_path]);

  // 包装 onChange 以添加类型检查 / Wrap onChange to add type checking
  const handleChange = useCallback(
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

  // 大文件降级：只摘掉 HTML 语法解析，保留 history / historyKeymap。
  // 🔴 不能照抄 CodeEditor 的写法把整个 extensions 清空 —— 下面 basicSetup 显式
  // `history: false`，撤销/重做完全依赖这里的 history()。清空会让大文件失去撤销。
  //
  // Large-file degradation: drop only HTML syntax parsing, keep history and its
  // keymap. Deliberately NOT the "empty the extensions array" shape used by
  // CodeEditor: basicSetup below sets `history: false`, so undo/redo depends
  // entirely on the history() here — clearing it would strip undo from exactly
  // the large files that need it most.
  const disableHighlight = shouldDisableHighlighting(value.length);

  // 配置扩展，包含 HTML 语法和历史记录支持
  // Configure extensions including HTML syntax and history support
  const extensions = useMemo<Extension[]>(
    () => [
      ...(disableHighlight ? [] : [html()]),
      history(), // 显式添加历史记录支持 / Explicitly add history support
      keymap.of(historyKeymap), // 添加历史记录快捷键 / Add history keymaps
      Prec.highest(codeEditorSurfaceTheme()), // surface bg follows theme tokens
    ],
    [disableHighlight]
  );

  const basicSetupConfig = useMemo(
    () => ({
      lineNumbers: true,
      highlightActiveLineGutter: true,
      highlightActiveLine: true,
      // 折叠依赖语法树，降级时一起关 / Folding relies on the syntax tree; off when degraded
      foldGutter: !disableHighlight,
      history: false, // 关闭 basicSetup 的 history，使用我们自己的 / Disable basicSetup history, use our own
    }),
    [disableHighlight]
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
          basicSetup={basicSetupConfig}
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
