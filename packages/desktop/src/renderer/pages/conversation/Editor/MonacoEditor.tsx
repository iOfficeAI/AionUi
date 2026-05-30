/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Direct `monaco-editor` widget wrapper (not the `@monaco-editor/react` HOC).
 * Multi-buffer aware: each `OpenBuffer` gets its own `ITextModel` keyed by a
 * fake monaco URI built from the buffer key. Switching tabs swaps the model
 * on the same `IStandaloneCodeEditor` instance — fast, and preserves the
 * scroll/cursor view-state via `saveViewState` / `restoreViewState`.
 */

import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import * as monaco from 'monaco-editor';
import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { ensureMonacoEnvironment } from './monacoEnvironment';
import { ensureAionuiThemesRegistered, themeNameFor } from './monacoTheme';
import type { OpenBuffer } from './types';

ensureMonacoEnvironment();

const PATH_SEPARATOR_RE = /[\\:]/g;

/**
 * Build a stable monaco URI for an OpenBuffer.
 *
 * Real files use `file:///<path>` so language clients can reason about them
 * by path. Untitled buffers use `inmemory://untitled/<key>` so the URI
 * uniquely identifies the buffer without colliding with any disk path.
 */
function uriForBuffer(buffer: OpenBuffer): monaco.Uri {
  if (buffer.filePath) {
    // Normalize Windows backslashes / drive colons so the URI is well-formed.
    const normalized = buffer.filePath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '/$1:');
    return monaco.Uri.parse(`file://${normalized.startsWith('/') ? '' : '/'}${normalized}`);
  }
  return monaco.Uri.parse(`inmemory://untitled/${buffer.key.replace(PATH_SEPARATOR_RE, '_')}`);
}

function getOrCreateModel(buffer: OpenBuffer): monaco.editor.ITextModel {
  const uri = uriForBuffer(buffer);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== buffer.content) {
      // External update — push content through pushEditOperations so undo
      // history is preserved.
      const fullRange = existing.getFullModelRange();
      existing.pushEditOperations(
        [],
        [{ range: fullRange, text: buffer.content }],
        (): null => null
      );
    }
    const desiredLanguage = mapToMonacoLanguage(buffer.language);
    if (existing.getLanguageId() !== desiredLanguage) {
      monaco.editor.setModelLanguage(existing, desiredLanguage);
    }
    return existing;
  }
  return monaco.editor.createModel(buffer.content, mapToMonacoLanguage(buffer.language), uri);
}

/**
 * Map our internal language ids (`editorLanguage.ts`) to Monaco's built-in
 * language ids. Most are identical, but a handful need translation.
 */
function mapToMonacoLanguage(id: string): string {
  switch (id) {
    case 'shell':
      return 'shell';
    case 'tsx':
      return 'typescript';
    case 'jsx':
      return 'javascript';
    case 'diff':
      return 'plaintext';
    case 'plaintext':
      return 'plaintext';
    default:
      return id;
  }
}

export type MonacoSelectionInfo = {
  /** Number of selected characters across all selections. */
  selectedChars: number;
  /** Number of fully-selected lines (rough — counts line-count of the selection range). */
  selectedLines: number;
};

export type MonacoEditorHandle = {
  /** Underlying Monaco editor instance, or null before mount. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null;
  /** Trigger Monaco's built-in find widget. */
  openFind: () => void;
  /** Trigger Monaco's built-in find-and-replace widget. */
  openReplace: () => void;
  /** Open the "Go to Line/Column" quick input. */
  goToLine: () => void;
  /** Open the "Go to Symbol" quick-pick (document outline navigation). */
  goToSymbol: () => void;
  /** Open the command palette. */
  openCommandPalette: () => void;
  /** Run document formatting (no-op if the active model has no formatter). */
  formatDocument: () => void;
  /** Toggle line comment on the current selection. */
  toggleLineComment: () => void;
  /** Toggle block comment on the current selection. */
  toggleBlockComment: () => void;
  /** Fold all foldable regions in the active model. */
  foldAll: () => void;
  /** Unfold all folded regions. */
  unfoldAll: () => void;
  /** Increase editor font size by 1px. */
  zoomIn: () => void;
  /** Decrease editor font size by 1px (clamped at 8px). */
  zoomOut: () => void;
  /** Reset font size to the default (14px). */
  resetZoom: () => void;
  /** Force-change the active model's language. Pass a Monaco language id. */
  setLanguage: (languageId: string) => void;
  /** Switch indentation between tabs/spaces with a given tab size. */
  setIndent: (useSpaces: boolean, size: number) => void;
  /** Switch the active model's EOL sequence. */
  setEol: (eol: 'LF' | 'CRLF') => void;
  /** Scroll the given 1-based line into the centre and place the cursor there. */
  revealLine: (line: number) => void;
  /** Undo the last edit on the active model. */
  undo: () => void;
  /** Redo the last undone edit on the active model. */
  redo: () => void;
};

type Props = {
  activeBuffer: OpenBuffer | null;
  /** Called whenever the active buffer's content changes (debounced internally). */
  onContentChange: (next: string) => void;
  /** Called when the active buffer's view state should be persisted (e.g. before switching tabs). */
  onViewStateChange: (key: string, viewState: monaco.editor.ICodeEditorViewState | null) => void;
  /** Called on Cmd/Ctrl+S inside the editor. */
  onSave: () => void;
  wordWrap: boolean;
  showMinimap: boolean;
  renderWhitespace: boolean;
  /** Reported back via `EditorPanel`'s status bar. */
  onCursorChange: (line: number, column: number) => void;
  /** Reported back when the selection changes (for status-bar selection info). */
  onSelectionChange?: (info: MonacoSelectionInfo) => void;
};

const DEFAULT_FONT_SIZE = 14;

const MonacoEditor = React.forwardRef<MonacoEditorHandle, Props>(function MonacoEditor(
  {
    activeBuffer,
    onContentChange,
    onViewStateChange,
    onSave,
    wordWrap,
    showMinimap,
    renderWhitespace,
    onCursorChange,
    onSelectionChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const lastBufferKeyRef = useRef<string | null>(null);
  const fontSizeRef = useRef<number>(DEFAULT_FONT_SIZE);
  // Suppresses the onContentChange callback for programmatic edits (model swap,
  // disk-sync). Without this, switching tabs would echo the new model's content
  // back into EditorContext as a "user edit" and clobber the originalContent.
  const suppressChangeRef = useRef(false);
  const callbacksRef = useRef({ onContentChange, onViewStateChange, onSave, onCursorChange, onSelectionChange });
  callbacksRef.current = { onContentChange, onViewStateChange, onSave, onCursorChange, onSelectionChange };
  const { theme } = useThemeContext();

  // --- Mount once, dispose on unmount -----------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    ensureAionuiThemesRegistered();
    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      theme: themeNameFor(theme === 'dark' ? 'dark' : 'light'),
      // Font: ligature-capable coding fonts with conservative fallbacks. The
      // editor body inherits this; the minimap reflects it at minimum size.
      fontFamily:
        "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      fontLigatures: true,
      fontSize: DEFAULT_FONT_SIZE,
      lineHeight: 1.55,
      letterSpacing: 0.2,

      // Layout / gutter — rich Notepad++-style chrome around the text.
      minimap: { enabled: showMinimap, renderCharacters: true, showSlider: 'always', size: 'proportional' },
      lineNumbers: 'on',
      lineNumbersMinChars: 4,
      lineDecorationsWidth: 12,
      glyphMargin: true,
      folding: true,
      foldingStrategy: 'auto',
      foldingHighlight: true,
      showFoldingControls: 'always',
      unfoldOnClickAfterEndOfLine: true,

      // Sticky scroll: pins the enclosing function / class header at the top
      // as you scroll. The single highest-impact "feels like a real editor"
      // flag Monaco ships.
      stickyScroll: { enabled: true, maxLineCount: 5 },

      // Selection / cursor
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      cursorStyle: 'line',
      cursorWidth: 2,
      roundedSelection: true,
      smoothScrolling: true,
      mouseWheelZoom: true,
      multiCursorModifier: 'alt',

      // Highlighting
      renderLineHighlight: 'all',
      renderLineHighlightOnlyWhenFocus: false,
      occurrencesHighlight: 'singleFile',
      selectionHighlight: true,
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      guides: {
        bracketPairs: 'active',
        bracketPairsHorizontal: 'active',
        highlightActiveBracketPair: true,
        indentation: true,
        highlightActiveIndentation: 'always',
      },
      matchBrackets: 'always',
      'semanticHighlighting.enabled': true,

      // Whitespace / indentation
      renderWhitespace: renderWhitespace ? 'all' : 'selection',
      renderControlCharacters: true,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: true,
      trimAutoWhitespace: true,

      // Word wrap + scroll
      wordWrap: wordWrap ? 'on' : 'off',
      wordWrapColumn: 120,
      scrollBeyondLastLine: false,
      scrollBeyondLastColumn: 8,

      // Editor intelligence affordances
      suggestOnTriggerCharacters: true,
      quickSuggestions: { other: true, comments: false, strings: false },
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      formatOnPaste: false,
      formatOnType: false,
      linkedEditing: true,
      links: true,
      colorDecorators: true,
      hover: { enabled: true, sticky: true, above: false, delay: 150 },
      parameterHints: { enabled: true, cycle: true },
      inlineSuggest: { enabled: true },
      suggest: {
        showWords: true,
        showSnippets: true,
        showStatusBar: true,
        preview: true,
        insertMode: 'replace',
      },

      // Scrollbar — visible but slim, native-app feel
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 12,
        horizontalScrollbarSize: 12,
        useShadows: true,
        alwaysConsumeMouseWheel: false,
      },
      overviewRulerLanes: 3,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: false,

      // Padding so text doesn't kiss the gutter
      padding: { top: 10, bottom: 10 },
    });
    editorRef.current = editor;
    fontSizeRef.current = DEFAULT_FONT_SIZE;

    const onContent = editor.onDidChangeModelContent(() => {
      if (suppressChangeRef.current) return;
      const model = editor.getModel();
      if (!model) return;
      callbacksRef.current.onContentChange(model.getValue());
    });

    const onCursor = editor.onDidChangeCursorPosition((e: monaco.editor.ICursorPositionChangedEvent) => {
      callbacksRef.current.onCursorChange(e.position.lineNumber, e.position.column);
    });

    const onSelection = editor.onDidChangeCursorSelection(() => {
      const model = editor.getModel();
      if (!model) return;
      let chars = 0;
      let lines = 0;
      for (const sel of editor.getSelections() ?? []) {
        if (sel.isEmpty()) continue;
        chars += model.getValueLengthInRange(sel);
        lines += sel.endLineNumber - sel.startLineNumber + 1;
      }
      callbacksRef.current.onSelectionChange?.({ selectedChars: chars, selectedLines: lines });
    });

    // Cmd/Ctrl+S → save.  Monaco's KeyMod treats CtrlCmd as platform-aware.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      callbacksRef.current.onSave();
    });

    return () => {
      onContent.dispose();
      onCursor.dispose();
      onSelection.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Theme follow-through ---------------------------------------------------
  useEffect(() => {
    monaco.editor.setTheme(themeNameFor(theme === 'dark' ? 'dark' : 'light'));
  }, [theme]);

  // --- Word wrap follow-through ----------------------------------------------
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' });
  }, [wordWrap]);

  // --- Minimap follow-through ------------------------------------------------
  useEffect(() => {
    editorRef.current?.updateOptions({ minimap: { enabled: showMinimap } });
  }, [showMinimap]);

  // --- Whitespace render follow-through --------------------------------------
  useEffect(() => {
    editorRef.current?.updateOptions({ renderWhitespace: renderWhitespace ? 'all' : 'selection' });
  }, [renderWhitespace]);

  // --- Active buffer follow-through ------------------------------------------
  // Whenever the active buffer changes we (1) snapshot the previous model's
  // view state, (2) swap to the new buffer's model, (3) restore that model's
  // saved view state if any.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const prevKey = lastBufferKeyRef.current;
    if (prevKey && prevKey !== activeBuffer?.key) {
      const snapshot = editor.saveViewState();
      callbacksRef.current.onViewStateChange(prevKey, snapshot);
    }

    if (!activeBuffer) {
      editor.setModel(null);
      lastBufferKeyRef.current = null;
      return;
    }

    suppressChangeRef.current = true;
    try {
      const model = getOrCreateModel(activeBuffer);
      editor.setModel(model);
      if (activeBuffer.viewState) {
        editor.restoreViewState(activeBuffer.viewState as monaco.editor.ICodeEditorViewState);
      }
      editor.focus();
    } finally {
      suppressChangeRef.current = false;
    }
    lastBufferKeyRef.current = activeBuffer.key;
  }, [activeBuffer]);

  // --- Sync external content updates into the active model -------------------
  // When the EditorContext disk-poller refreshes a buffer's content (e.g. an
  // external save was detected), the new content lands in `activeBuffer.content`
  // without the user typing. Push it into the model via pushEditOperations so
  // undo history is preserved, while suppressing the change callback.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeBuffer) return;
    const model = editor.getModel();
    if (!model) return;
    const current = model.getValue();
    if (current === activeBuffer.content) return;
    suppressChangeRef.current = true;
    try {
      const fullRange = model.getFullModelRange();
      model.pushEditOperations([], [{ range: fullRange, text: activeBuffer.content }], (): null => null);
    } finally {
      suppressChangeRef.current = false;
    }
  }, [activeBuffer?.key, activeBuffer?.content]);

  // --- Imperative handle ------------------------------------------------------
  // Most actions are looked up by id via `getAction`; this is the supported
  // Monaco mechanism for invoking the same commands the command palette uses.
  // `trigger` is the older API and we use it for undo/redo where there's no
  // public action id.
  useImperativeHandle(
    ref,
    () => {
      const runAction = (id: string): void => {
        void editorRef.current?.getAction(id)?.run().catch((): void => undefined);
      };
      const setFontSize = (px: number): void => {
        const clamped = Math.max(8, Math.min(40, px));
        fontSizeRef.current = clamped;
        editorRef.current?.updateOptions({ fontSize: clamped });
      };
      return {
        getEditor: () => editorRef.current,
        openFind: () => runAction('actions.find'),
        openReplace: () => runAction('editor.action.startFindReplaceAction'),
        goToLine: () => runAction('editor.action.gotoLine'),
        goToSymbol: () => runAction('editor.action.quickOutline'),
        openCommandPalette: () => runAction('editor.action.quickCommand'),
        formatDocument: () => runAction('editor.action.formatDocument'),
        toggleLineComment: () => runAction('editor.action.commentLine'),
        toggleBlockComment: () => runAction('editor.action.blockComment'),
        foldAll: () => runAction('editor.foldAll'),
        unfoldAll: () => runAction('editor.unfoldAll'),
        zoomIn: () => setFontSize(fontSizeRef.current + 1),
        zoomOut: () => setFontSize(fontSizeRef.current - 1),
        resetZoom: () => setFontSize(DEFAULT_FONT_SIZE),
        setLanguage: (languageId: string) => {
          const model = editorRef.current?.getModel();
          if (model) monaco.editor.setModelLanguage(model, languageId);
        },
        setIndent: (useSpaces: boolean, size: number) => {
          editorRef.current?.getModel()?.updateOptions({ insertSpaces: useSpaces, tabSize: size });
        },
        setEol: (eol: 'LF' | 'CRLF') => {
          editorRef.current
            ?.getModel()
            ?.setEOL(eol === 'LF' ? monaco.editor.EndOfLineSequence.LF : monaco.editor.EndOfLineSequence.CRLF);
        },
        revealLine: (line: number) => {
          const ed = editorRef.current;
          if (!ed) return;
          ed.revealLineInCenter(line, monaco.editor.ScrollType.Smooth);
          ed.setPosition({ lineNumber: line, column: 1 });
          ed.focus();
        },
        undo: () => {
          editorRef.current?.trigger('toolbar', 'undo', null);
        },
        redo: () => {
          editorRef.current?.trigger('toolbar', 'redo', null);
        },
      };
    },
    []
  );

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});

export default MonacoEditor;
