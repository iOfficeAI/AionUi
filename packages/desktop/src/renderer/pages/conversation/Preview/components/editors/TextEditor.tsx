/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { EditorView } from '@codemirror/view';
import { loadLanguage, type LanguageName } from '@uiw/codemirror-extensions-langs';
import CodeMirror from '@uiw/react-codemirror';
import React, { useCallback, useMemo } from 'react';

interface TextEditorProps {
  value: string; // 编辑器内容 / Editor content
  onChange: (value: string) => void; // 内容变化回调 / Content change callback
  readOnly?: boolean; // 是否只读 / Whether read-only
  language?: string | null; // 语言标识，用于语法高亮 / Language id used for syntax highlighting
  containerRef?: React.RefObject<HTMLDivElement>; // 容器引用，用于滚动同步 / Container ref for scroll sync
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void; // 滚动回调 / Scroll callback
}

// 语言标识符映射：将上游传入的人类可读名称规范化为
// @uiw/codemirror-extensions-langs 实际支持的键（多为扩展名形式）。
// Language id map: normalize human-readable names to the short identifiers
// actually supported by @uiw/codemirror-extensions-langs (mostly extension-style).
const LANGUAGE_ID_MAP: Record<string, LanguageName> = {
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  python: 'py',
  py: 'py',
  ruby: 'rb',
  rb: 'rb',
  rust: 'rs',
  rs: 'rs',
  shell: 'bash',
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
  yaml: 'yaml',
  yml: 'yaml',
  markdown: 'markdown',
  md: 'markdown',
  html: 'html',
  htm: 'html',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  go: 'go',
  php: 'php',
  sql: 'sql',
  xml: 'xml',
  lua: 'lua',
};

function resolveLanguageExtension(language: string | null | undefined) {
  if (!language) return [];
  const normalized = language.toLowerCase();
  if (normalized === 'plaintext' || normalized === 'text' || normalized === 'diff') return [];
  const name = LANGUAGE_ID_MAP[normalized];
  if (!name) return [];
  const ext = loadLanguage(name);
  return ext ? [ext] : [];
}

/**
 * 通用文本编辑器组件
 * Generic text editor component
 *
 * 基于 CodeMirror 实现，支持语法高亮和实时编辑
 * Based on CodeMirror, supports syntax highlighting and live editing
 */
const TextEditor: React.FC<TextEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  language,
  containerRef,
  onScroll,
}) => {
  const { theme } = useThemeContext();

  // 根据传入的语言加载对应的 CodeMirror 扩展（含换行）
  // Load matching CodeMirror language extension for the provided language (plus line wrapping)
  const extensions = useMemo(() => [...resolveLanguageExtension(language), EditorView.lineWrapping], [language]);

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

  // 使用 useCallback 包装 onChange，避免每次渲染都创建新函数 / Use useCallback to avoid creating new function on each render
  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange]
  );

  // 缓存 basicSetup 配置，避免每次渲染都创建新对象 / Memoize basicSetup config
  const basicSetupConfig = useMemo(
    () => ({
      lineNumbers: true, // 显示行号 / Show line numbers
      highlightActiveLineGutter: true, // 高亮当前行号 / Highlight active line gutter
      highlightActiveLine: true, // 高亮当前行 / Highlight active line
      foldGutter: true, // 折叠功能 / Code folding
    }),
    []
  );

  // 缓存样式对象 / Memoize style object
  const editorStyle = useMemo(
    () => ({
      fontSize: '14px',
      height: '100%',
      textAlign: 'left' as const, // 文本左对齐 / Text align left
    }),
    []
  );

  return (
    <div ref={containerRef} className='h-full w-full overflow-auto text-left'>
      <CodeMirror
        value={value}
        height='100%'
        theme={theme === 'dark' ? 'dark' : 'light'}
        extensions={extensions}
        onChange={handleChange}
        readOnly={readOnly}
        basicSetup={basicSetupConfig}
        style={editorStyle}
      />
    </div>
  );
};

// 使用 React.memo 优化，只在 props 真正改变时才重新渲染 / Use React.memo to only re-render when props actually change
export default React.memo(TextEditor);
