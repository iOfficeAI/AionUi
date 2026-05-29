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

export type MonacoEditorHandle = {
  /** Underlying Monaco editor instance, or null before mount. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null;
  /** Trigger Monaco's built-in find widget. */
  openFind: () => void;
  /** Trigger Monaco's built-in find-and-replace widget. */
  openReplace: () => void;
  /** Open the "Go to Line/Column" quick input. */
  goToLine: () => void;
  /** Run document formatting (no-op if the active model has no formatter). */
  formatDocument: () => void;
  /** Toggle line comment on the current selection. */
  toggleLineComment: () => void;
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
};

const MonacoEditor = React.forwardRef<MonacoEditorHandle, Props>(function MonacoEditor(
  { activeBuffer, onContentChange, onViewStateChange, onSave, wordWrap, showMinimap, renderWhitespace, onCursorChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const lastBufferKeyRef = useRef<string | null>(null);
  // Suppresses the onContentChange callback for programmatic edits (model swap,
  // disk-sync). Without this, switching tabs would echo the new model's content
  // back into EditorContext as a "user edit" and clobber the originalContent.
  const suppressChangeRef = useRef(false);
  const callbacksRef = useRef({ onContentChange, onViewStateChange, onSave, onCursorChange });
  callbacksRef.current = { onContentChange, onViewStateChange, onSave, onCursorChange };
  const { theme } = useThemeContext();

  // --- Mount once, dispose on unmount -----------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    ensureAionuiThemesRegistered();
    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      theme: themeNameFor(theme === 'dark' ? 'dark' : 'light'),
      minimap: { enabled: true },
      fontSize: 14,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: wordWrap ? 'on' : 'off',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      bracketPairColorization: { enabled: true },
      'semanticHighlighting.enabled': true,
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      lineNumbersMinChars: 3,
      glyphMargin: false,
    });
    editorRef.current = editor;

    const onContent = editor.onDidChangeModelContent(() => {
      if (suppressChangeRef.current) return;
      const model = editor.getModel();
      if (!model) return;
      callbacksRef.current.onContentChange(model.getValue());
    });

    const onCursor = editor.onDidChangeCursorPosition((e: monaco.editor.ICursorPositionChangedEvent) => {
      callbacksRef.current.onCursorChange(e.position.lineNumber, e.position.column);
    });

    // Cmd/Ctrl+S → save.  Monaco's KeyMod treats CtrlCmd as platform-aware.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      callbacksRef.current.onSave();
    });

    return () => {
      onContent.dispose();
      onCursor.dispose();
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
      return {
        getEditor: () => editorRef.current,
        openFind: () => runAction('actions.find'),
        openReplace: () => runAction('editor.action.startFindReplaceAction'),
        goToLine: () => runAction('editor.action.gotoLine'),
        formatDocument: () => runAction('editor.action.formatDocument'),
        toggleLineComment: () => runAction('editor.action.commentLine'),
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
