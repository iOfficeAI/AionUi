/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { codeEditorFontTheme, getCodeEditorBaseTheme } from '../../theme/codeEditorTheme';
import { loadLanguageSupport, shouldDisableHighlighting } from '../../theme/languageLoader';

interface CodeEditorProps {
  value: string; // 编辑器内容 / Editor content
  onChange: (value: string) => void; // 内容变化回调 / Content change callback
  language?: string; // 来自 metadata.language / From metadata.language
  fileName?: string; // 用于扩展名兜底推断语言 / Extension-based fallback
  readOnly?: boolean; // 是否只读 / Whether read-only
  containerRef?: React.RefObject<HTMLDivElement>; // 滚动同步容器 / Scroll sync container
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void; // 滚动回调 / Scroll callback
}

// 流式判定空闲超时：超过此时长无外部增长则视为流结束
// Idle timeout for streaming detection
const STREAMING_IDLE_MS = 1200;

/**
 * 统一代码编辑器（始终可编辑）/ Unified code editor (always editable)
 *
 * 基于 CodeMirror 6：语法高亮、行号、折叠、搜索（Cmd/Ctrl+F）、自动换行。
 * 主题/字体来自 Preview/theme 抽象层；大文件自动降级；流式写入自动滚动 + AI 写入角标。
 */
const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, language, fileName, readOnly = false, containerRef, onScroll }) => {
  const { theme } = useThemeContext();
  const { t } = useTranslation();

  const [languageExt, setLanguageExt] = useState<Extension[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const userEditRef = useRef(false); // 最近一次 value 变化来自用户编辑 / Last value change came from a user edit
  const prevLenRef = useRef(value.length);
  const viewRef = useRef<EditorView | null>(null);
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disableHighlight = shouldDisableHighlighting(value.length);

  // 语言切换时动态加载语法（大文件跳过）/ Load language support on change (skip for large files)
  useEffect(() => {
    let cancelled = false;
    if (disableHighlight) {
      setLanguageExt([]);
      return;
    }
    void loadLanguageSupport(language, fileName).then((support) => {
      if (!cancelled) setLanguageExt(support ? [support] : []);
    });
    return () => {
      cancelled = true;
    };
  }, [language, fileName, disableHighlight]);

  // 区分外部流式增长 vs 用户编辑：外部增长时显示角标并自动滚到底
  // Distinguish external streaming growth from user edits: badge + auto-scroll on external growth
  useEffect(() => {
    const grew = value.length > prevLenRef.current;
    prevLenRef.current = value.length;
    if (userEditRef.current) {
      userEditRef.current = false;
      return;
    }
    if (!grew) return;

    setIsStreaming(true);
    if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
    streamingTimerRef.current = setTimeout(() => setIsStreaming(false), STREAMING_IDLE_MS);

    const view = viewRef.current;
    if (view && !view.hasFocus) {
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    }
  }, [value]);

  useEffect(
    () => () => {
      if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
    },
    []
  );

  // 容器滚动监听 / Container scroll listener
  useEffect(() => {
    const container = containerRef?.current;
    if (!container || !onScroll) return;
    const handleScroll = () => onScroll(container.scrollTop, container.scrollHeight, container.clientHeight);
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, onScroll]);

  const handleChange = useCallback(
    (val: string) => {
      userEditRef.current = true;
      onChange(val);
    },
    [onChange]
  );

  const basicSetupConfig = useMemo(
    () => ({
      lineNumbers: true,
      highlightActiveLineGutter: true,
      highlightActiveLine: true,
      foldGutter: !disableHighlight,
      searchKeymap: false, // 由下方 extensions 显式提供 / Provided explicitly below
    }),
    [disableHighlight]
  );

  const extensions = useMemo<Extension[]>(
    () => [EditorView.lineWrapping, codeEditorFontTheme(), highlightSelectionMatches(), keymap.of(searchKeymap), ...languageExt],
    [languageExt]
  );

  const editorStyle = useMemo(() => ({ height: '100%', textAlign: 'left' as const }), []);

  return (
    <div ref={containerRef} className='relative h-full w-full overflow-auto text-left'>
      {isStreaming && (
        <div className='absolute right-12px top-8px z-2 flex items-center px-8px py-2px rd-4px bg-bg-3 text-11px text-t-secondary pointer-events-none'>
          {t('preview.aiWriting')}
        </div>
      )}
      <CodeMirror
        value={value}
        height='100%'
        theme={getCodeEditorBaseTheme(theme === 'dark' ? 'dark' : 'light')}
        extensions={extensions}
        onChange={handleChange}
        onCreateEditor={(view: EditorView, _state: EditorState) => {
          viewRef.current = view;
        }}
        readOnly={readOnly}
        basicSetup={basicSetupConfig}
        style={editorStyle}
      />
    </div>
  );
};

// 只在 props 真正改变时重渲染 / Re-render only when props actually change
export default React.memo(CodeEditor);
