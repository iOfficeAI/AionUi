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
import { ipcBridge } from '@/common';
import * as monaco from '@aionui/editor-monaco';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emitter } from '@/renderer/utils/emitter';
import { uriForBuffer } from './editorMonacoUri';
import { applyTheme, ensureAionuiThemesRegistered, initialThemeFor } from './monacoTheme';
import type { OpenBuffer } from './types';
import type { EditorUserSettings } from './editorSettings';

function getOrCreateModel(buffer: OpenBuffer): monaco.editor.ITextModel {
  const uri = uriForBuffer(buffer);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== buffer.content) {
      // External update — push content through pushEditOperations so undo
      // history is preserved.
      const fullRange = existing.getFullModelRange();
      existing.pushEditOperations([], [{ range: fullRange, text: buffer.content }], (): null => null);
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

/**
 * Phase 2 (agent-editor integration): the duration the agent-change
 * highlight stays on screen after an `fileStream.contentUpdate` lands.
 * Long enough to read, short enough not to clutter the editor.
 */
const AGENT_HIGHLIGHT_DURATION_MS = 1500;

/**
 * Mirrors `isBufferDirty` from EditorContext locally — duplicated here to
 * avoid importing the helper into a view component. The two checks must
 * stay in lock-step: a buffer is dirty iff `content !== originalContent`.
 */
const isBufferDirtyExternal = (buffer: { content: string; originalContent: string }): boolean =>
  buffer.content !== buffer.originalContent;

/**
 * Compute the 1-based start and end line of the region that differs between
 * `oldText` and `newText`, using a longest-common-prefix + longest-common-suffix
 * of LINES. This is intentionally a simple O(n) scan (no LCS / Myers diff) —
 * fast, dependency-free, and accurate for typical agent edits where most of
 * the file is untouched. Returns `{ start, end }` covering the full document
 * when there is no overlap, or the empty file on full rewrites.
 */
const computeChangedLineRange = (oldText: string, newText: string): { start: number; end: number } => {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Common prefix length (in lines).
  let prefix = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (prefix < minLen && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  // Common suffix length (in lines), bounded by the remaining unmatched
  // tail so the prefix and suffix don't overlap.
  let suffix = 0;
  const oldTail = oldLines.length - prefix;
  const newTail = newLines.length - prefix;
  const tailMin = Math.min(oldTail, newTail);
  while (suffix < tailMin && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) {
    suffix += 1;
  }

  const start = prefix + 1; // Monaco is 1-based.
  const end = newLines.length - suffix; // 1-based inclusive.
  return { start, end };
};

/**
 * Apply (or replace) the agent-change highlight on `editor` for the given
 * `changedRange` line span. Uses a single `IDecorationsCollection` cached on
 * `collectionRef` so each update atomically replaces the prior batch. The
 * previous timer (if any) is cleared so a burst of agent writes leaves
 * exactly one highlight on the latest region.
 */
const applyAgentHighlight = (
  editor: monaco.editor.IStandaloneCodeEditor,
  collectionRef: React.MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>,
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  changedRange: { start: number; end: number },
  model: monaco.editor.ITextModel
): void => {
  if (changedRange.end < changedRange.start) {
    // Pure deletion of a region (no replacement lines) — nothing to paint.
    if (collectionRef.current) collectionRef.current.clear();
    return;
  }
  if (!collectionRef.current) {
    collectionRef.current = editor.createDecorationsCollection([]);
  }
  const endCol = model.getLineMaxColumn(changedRange.end);
  collectionRef.current.set([
    {
      range: new monaco.Range(changedRange.start, 1, changedRange.end, endCol),
      options: {
        isWholeLine: true,
        className: 'editor-agent-change-line',
        glyphMarginClassName: 'editor-agent-change-glyph',
        // NeverGrowsWhenTypingAtEdges keeps the decoration anchored to the
        // visual region as the user types after the agent's edit; it
        // disappears if the user types inside the region itself.
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    },
  ]);
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    if (collectionRef.current) collectionRef.current.clear();
    timerRef.current = null;
  }, AGENT_HIGHLIGHT_DURATION_MS);
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
  /** Apply (or replace) git decorations on the current model. */
  setGitDecorations: (decorations: monaco.editor.IModelDeltaDecoration[]) => void;
  /**
   * Phase 3: if there's a pending conflict from the agent (the user has
   * unsaved changes and the agent wrote the same file), accept the
   * agent's version and replace the user's current model content with
   * it. No-op when no conflict is pending.
   */
  acceptAgentConflict: () => void;
  /**
   * Phase 3: if there's a pending conflict, dismiss it and exit any
   * open diff review without modifying the user's content. No-op when
   * no conflict is pending.
   */
  keepUserConflict: () => void;
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
  /** User settings (fontSize, fontFamily, tabSize, insertSpaces). */
  editorSettings: Pick<EditorUserSettings, 'fontSize' | 'fontFamily' | 'tabSize' | 'insertSpaces'>;
  /** Reported back via `EditorPanel`'s status bar. */
  onCursorChange: (line: number, column: number) => void;
  /** Reported back when the selection changes (for status-bar selection info). */
  onSelectionChange?: (info: MonacoSelectionInfo) => void;
  /**
   * Reconcile a buffer's content with an external writer (e.g. the agent's
   * `fileStream.contentUpdate`). Called AFTER the model has been updated
   * inside `suppressChangeRef`, so the editor doesn't echo the change back
   * out as a user edit. The receiver should update `content` AND
   * `originalContent` (so the dirty flag clears) — the on-disk file is now
   * the source of truth.
   */
  onApplyExternalContent?: (key: string, content: string) => void;
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
    editorSettings,
    onCursorChange,
    onSelectionChange,
    onApplyExternalContent,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const lastBufferKeyRef = useRef<string | null>(null);
  const fontSizeRef = useRef<number>(editorSettings.fontSize);
  const settingsRef = useRef(editorSettings);
  settingsRef.current = editorSettings;
  // Mirror of the active buffer used by the Phase 2 file-stream subscription
  // (declared with an empty dep array so the subscription survives tab
  // switches; the ref always reflects the current pane's active buffer).
  const activeBufferRef = useRef<OpenBuffer | null>(activeBuffer);
  activeBufferRef.current = activeBuffer;
  // Holds the prior batch of git decoration ids so we can swap them out
  // atomically on the next update (deltaDecorations API).
  const gitDecorationIdsRef = useRef<string[]>([]);
  // Suppresses the onContentChange callback for programmatic edits (model swap,
  // disk-sync). Without this, switching tabs would echo the new model's content
  // back into EditorContext as a "user edit" and clobber the originalContent.
  const suppressChangeRef = useRef(false);
  // Phase 2 (agent-editor integration): decoration collection for the
  // brief highlight that paints the lines the agent just modified when a
  // `fileStream.contentUpdate` lands. Auto-cleared on a timer so the user
  // sees what changed without leaving residual marks on every edit.
  const agentHighlightCollectionRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const agentHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase 3 (agent-editor integration): conflict UI state. When the agent
  // writes to a file the user has unsaved changes on, we stash the
  // incoming content here instead of clobbering the user's edits. The
  // banner surfaces it; clicking "Review Diff" mounts a DiffEditor that
  // compares the user's current model (Original) against this content
  // (Modified). Accept/Keep both clear this state and dispose the diff
  // editor.
  const [pendingConflictContent, setPendingConflictContent] = useState<string | null>(null);
  const [isReviewingDiff, setIsReviewingDiff] = useState<boolean>(false);
  // Refs mirror the React state so the file-stream subscription (which
  // lives behind an empty-deps effect) can read the latest values without
  // re-subscribing on every state change. They are also the cleanup
  // source of truth for the diff editor on unmount.
  const pendingConflictContentRef = useRef<string | null>(null);
  pendingConflictContentRef.current = pendingConflictContent;
  const isReviewingDiffRef = useRef<boolean>(false);
  isReviewingDiffRef.current = isReviewingDiff;
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const diffModifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const callbacksRef = useRef({
    onContentChange,
    onViewStateChange,
    onSave,
    onCursorChange,
    onSelectionChange,
    onApplyExternalContent,
  });
  callbacksRef.current = {
    onContentChange,
    onViewStateChange,
    onSave,
    onCursorChange,
    onSelectionChange,
    onApplyExternalContent,
  };
  const { theme } = useThemeContext();

  // --- Mount once, dispose on unmount -----------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    // Theme registration is normally already done by `monacoVscodeApiInit`
    // right after `wrapper.start()`. We still call it here so the editor
    // also works when mounted without the wrapper (e.g. a future fallback
    // path that doesn't go through `editorLazyEntry`). The helper is
    // defensive: if the workbench theme service is in scope and lacks
    // `defineTheme`, it falls back to `monaco.editor.setTheme(base)` and
    // logs a `[monacoTheme]` warning instead of throwing the
    // "defineTheme is not a function" that used to mark the editor
    // unavailable.
    const initialMode: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light';
    // Fire-and-forget: `applyTheme` synchronously sets the active base
    // theme (so the editor mounts with a valid color scheme even if the
    // async config write is slow or fails) and then writes the user's
    // `workbench.colorCustomizations` to repaint the editor with the
    // Chisl palette. In the standalone path it simply switches to the
    // registered aionui theme.
    void applyTheme(initialMode);
    void ensureAionuiThemesRegistered();
    const initialSettings = settingsRef.current;
    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      // `initialThemeFor` returns the registered aionui theme name on
      // the standalone path and the built-in base (`vs` / `vs-dark`)
      // on the workbench path. The workbench path's aionui themes are
      // not in the registry, so passing `aionui-light`/`aionui-dark`
      // here would mount the editor with the default white `vs`
      // surface — the user-visible "white background" bug. The actual
      // palette is applied by `applyTheme` above.
      theme: initialThemeFor(initialMode),
      // Font: ligature-capable coding fonts with conservative fallbacks. The
      // editor body inherits this; the minimap reflects it at minimum size.
      // User settings can override `fontSize` / `fontFamily` via the
      // `editorSettings` prop (mounted on initial paint and applied via the
      // follow-through effects below).
      fontFamily:
        initialSettings.fontFamily ??
        "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      fontLigatures: true,
      fontSize: initialSettings.fontSize,
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
      tabSize: initialSettings.tabSize,
      insertSpaces: initialSettings.insertSpaces,
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
      hover: { enabled: 'on', sticky: true, above: false, delay: 150 },
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
    fontSizeRef.current = initialSettings.fontSize;

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

    // Right-click context menu → "Send Selection to Chat" wires the active
    // editor selection into the conversation's chat composer (`sendbox.fill`).
    // Guarded on a non-empty selection so a bare right-click on a collapsed
    // cursor doesn't emit a stray empty message. The payload is a fenced
    // code block carrying the file path + line range so the model has
    // enough context to act on the snippet.
    editor.addAction({
      id: 'aionui.sendSelectionToChat',
      label: 'Send Selection to Chat',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1,
      run: (ed) => {
        const selection = ed.getSelection();
        const model = ed.getModel();
        if (!selection || !model || selection.isEmpty()) return;
        const text = model.getValueInRange(selection);
        if (!text) return;
        const filePath = model.uri.path;
        const startLine = selection.startLineNumber;
        const endLine = selection.endLineNumber;
        const header = filePath ? `// ${filePath}:${startLine}-${endLine}` : `// lines ${startLine}-${endLine}`;
        const language = model.getLanguageId() || '';
        const payload = ['```' + language, header, text, '```'].join('\n');
        emitter.emit('sendbox.fill', payload);
      },
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
  // `applyTheme` switches between the registered aionui themes on the
  // standalone path and writes `workbench.colorCustomizations` +
  // `workbench.colorTheme` on the workbench path. In both cases the
  // active palette tracks the user's current mode without dropping
  // back to the default white surface.
  useEffect(() => {
    void applyTheme(theme === 'dark' ? 'dark' : 'light');
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

  // --- Editor settings follow-through ----------------------------------------
  // Apply user-controlled settings (fontSize / fontFamily / tabSize /
  // insertSpaces) on mount and whenever the prop changes. These come from
  // `editorSettings.ts` and are persisted per workspace.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    fontSizeRef.current = editorSettings.fontSize;
    editor.updateOptions({
      fontSize: editorSettings.fontSize,
      ...(editorSettings.fontFamily ? { fontFamily: editorSettings.fontFamily } : {}),
    });
  }, [editorSettings.fontSize, editorSettings.fontFamily]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    model.updateOptions({
      tabSize: editorSettings.tabSize,
      insertSpaces: editorSettings.insertSpaces,
    });
  }, [editorSettings.tabSize, editorSettings.insertSpaces]);

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

  // --- Phase 3: reset conflict state on file change --------------------------
  // A conflict (pending agent content + optional diff review) is bound to
  // the active buffer. When the user switches tabs we drop it cleanly: a
  // conflict that was stashed for file A has no meaning once the editor
  // is showing file B. Both the pending content and the review flag are
  // cleared; the diff-editor effect below tears down the diff widget on
  // the `isReviewingDiff` flip from true → false.
  useEffect(() => {
    if (pendingConflictContent === null && !isReviewingDiff) return;
    setPendingConflictContent(null);
    setIsReviewingDiff(false);
  }, [activeBuffer?.key]);

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

  // --- Phase 3: diff review editor lifecycle ---------------------------------
  // When `isReviewingDiff` flips to true we mount a fresh DiffEditor
  // inside `diffContainerRef` and feed it two models:
  //   - original: the user's CURRENT model (live, so user edits in the
  //     background tab stay reflected if they make any — though the
  //     editor is hidden at this point).
  //   - modified: a dedicated scratch model seeded from
  //     `pendingConflictContent`. We can't reuse the user's model on the
  //     modified side (a model can only live in one editor at a time),
  //     so the temporary model is created and disposed alongside the
  //     diff editor itself.
  //
  // The diff editor mirrors the active pane's language + theme so syntax
  // highlighting and the Chisl palette are consistent. Disposal runs on
  // exit, on file change, and on unmount (the cleanup function in the
  // effect).
  useEffect(() => {
    if (!isReviewingDiff) return;
    const container = diffContainerRef.current;
    if (!container) return;
    const mainEditor = editorRef.current;
    const mainModel = mainEditor?.getModel();
    if (!mainModel) return;
    if (pendingConflictContent === null) return;

    const initialMode: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light';
    // Build a unique URI for the scratch model so it doesn't collide with
    // the user's real model. Monaco requires a URI for `createModel`.
    const scratchUri = monaco.Uri.parse(`aionui-conflict://${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const scratchModel = monaco.editor.createModel(pendingConflictContent, mainModel.getLanguageId(), scratchUri);
    diffModifiedModelRef.current = scratchModel;

    const diffEditor = monaco.editor.createDiffEditor(container, {
      automaticLayout: true,
      theme: initialThemeFor(initialMode),
      renderSideBySide: true,
      // Match the main editor's font so the diff doesn't look "smaller".
      fontSize: fontSizeRef.current,
      fontFamily:
        settingsRef.current.fontFamily ??
        "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      fontLigatures: true,
      readOnly: true,
      renderIndicators: true,
      originalEditable: false,
    });
    diffEditor.setModel({ original: mainModel, modified: scratchModel });
    diffEditorRef.current = diffEditor;

    return () => {
      // Detach the models BEFORE disposing them so Monaco doesn't trip
      // an assertion about orphaned listeners.
      try {
        diffEditor.setModel(null);
      } catch {
        // Diff editor was already disposed (e.g. unmount racing with a
        // state update). Swallow — the dispose below is still safe.
      }
      diffEditor.dispose();
      diffEditorRef.current = null;
      scratchModel.dispose();
      diffModifiedModelRef.current = null;
    };
    // We intentionally re-run when `pendingConflictContent` changes so an
    // arriving agent write during a review swaps the Modified side
    // in-place. The diff editor is rebuilt; the Original (user's) model
    // is preserved because it's the live active model — only the
    // scratch modified model is recreated.
  }, [isReviewingDiff, pendingConflictContent, theme]);

  // --- Phase 2: agent live content stream ------------------------------------
  // Subscribe to `ipcBridge.fileStream.contentUpdate` so that when the agent
  // writes a file the user already has open, the editor's model updates in
  // place (preserving undo) and a brief highlight paints the changed region.
  //
  // Suppress-pattern: wrap the model push in `suppressChangeRef` so the editor
  // does NOT echo the agent's edit back out as a user edit (which would
  // clobber the user's `originalContent` and mark the buffer dirty).
  //
  // User-typing guard: if the buffer is dirty (`content !== originalContent`),
  // the user has unsaved changes — don't clobber them with the agent's write.
  // The user can reload the file from disk explicitly when they want to.
  //
  // Phase 3 conflict path: instead of silently dropping the agent's write
  // when the buffer is dirty, we stash the incoming text in
  // `pendingConflictContent` and surface a banner so the user can review
  // the agent's changes via a DiffEditor (compare Original=user model vs
  // Modified=agent text) and pick Accept (overwrite) or Keep (dismiss).
  // A subsequent agent write while a conflict is still pending replaces
  // the stashed text with the latest — newest agent content wins.
  //
  // Highlight: a single `IDecorationsCollection` is reused per pane; the
  // previous batch is cleared on each new update so a burst of agent writes
  // leaves exactly one highlight on the latest region. Auto-cleared after a
  // short timeout so the editor returns to its normal chrome.
  useEffect(() => {
    const unsubscribe = ipcBridge.fileStream.contentUpdate.on(
      ({ file_path, content, workspace: eventWorkspace, operation }) => {
        const editor = editorRef.current;
        if (!editor) return;
        const buffer = activeBufferRef.current;
        if (!buffer || !buffer.filePath) return;
        // Only react when the stream event targets the file the user is
        // currently looking at. Other open tabs update through their own
        // pane subscriptions; we still update their `originalContent` via
        // the EditorContext so the dirty flag clears correctly.
        if (operation === 'delete') return; // close paths are handled by the editor
        // Match both path AND workspace — two workspaces with the same file
        // name (e.g. nested git worktrees) would otherwise collide.
        const bufferWorkspace = buffer.workspace ?? '';
        const eventWs = eventWorkspace ?? '';
        const pathMatches = file_path === buffer.filePath && bufferWorkspace === eventWs;
        if (!pathMatches) {
          // Even if not active, if a buffer for this path exists, clear its
          // dirty flag so the model on disk becomes the new truth.
          const key = `${eventWs}::${file_path}`;
          callbacksRef.current.onApplyExternalContent?.(key, content);
          return;
        }
        // Phase 3: dirty buffer → stash the agent's content for the user to
        // review. If a conflict is already pending, replace it with the
        // newest write (newest agent content wins). If a diff review is
        // already open, the diff editor's modified model is rebuilt from
        // the new content via the isReviewingDiff effect below.
        if (isBufferDirtyExternal(buffer)) {
          if (pendingConflictContentRef.current !== content) {
            pendingConflictContentRef.current = content;
            setPendingConflictContent(content);
          }
          return;
        }

        const model = editor.getModel();
        if (!model) return;
        const oldContent = model.getValue();
        if (oldContent === content) return;

        const changedRange = computeChangedLineRange(oldContent, content);

        suppressChangeRef.current = true;
        try {
          const fullRange = model.getFullModelRange();
          model.pushEditOperations([], [{ range: fullRange, text: content }], (): null => null);
        } finally {
          suppressChangeRef.current = false;
        }

        // Reconcile EditorContext state (clears dirty flag by setting
        // `originalContent` = `content`).
        callbacksRef.current.onApplyExternalContent?.(buffer.key, content);

        // Paint the changed region with a brief highlight so the user sees
        // *what* the agent just modified.
        applyAgentHighlight(editor, agentHighlightCollectionRef, agentHighlightTimerRef, changedRange, model);
      }
    );

    return () => {
      unsubscribe();
      // Clear any pending highlight on unmount / re-subscribe.
      if (agentHighlightTimerRef.current) {
        clearTimeout(agentHighlightTimerRef.current);
        agentHighlightTimerRef.current = null;
      }
      const editor = editorRef.current;
      const collection = agentHighlightCollectionRef.current;
      if (editor && collection) {
        collection.clear();
      }
      agentHighlightCollectionRef.current = null;
    };
    // We deliberately don't include activeBuffer in deps — we read it via
    // a ref so the subscription survives buffer switches. Re-subscribing on
    // every active change would miss updates in flight during the swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Imperative handle ------------------------------------------------------
  // Most actions are looked up by id via `getAction`; this is the supported
  // Monaco mechanism for invoking the same commands the command palette uses.
  // `trigger` is the older API and we use it for undo/redo where there's no
  // public action id.
  useImperativeHandle(ref, () => {
    const runAction = (id: string): void => {
      void editorRef.current
        ?.getAction(id)
        ?.run()
        .catch((): void => undefined);
    };
    const setFontSize = (px: number): void => {
      const clamped = Math.max(8, Math.min(40, px));
      fontSizeRef.current = clamped;
      editorRef.current?.updateOptions({ fontSize: clamped });
    };
    // Phase 3: accept the agent's pending changes. Pushes the stashed
    // content into the user's current model via pushEditOperations (so
    // undo history is preserved) and reconciles EditorContext so the
    // dirty flag clears. No-op when no conflict is pending.
    const acceptAgentConflict = (): void => {
      const content = pendingConflictContentRef.current;
      if (content === null) return;
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      const buffer = activeBufferRef.current;
      suppressChangeRef.current = true;
      try {
        const fullRange = model.getFullModelRange();
        model.pushEditOperations([], [{ range: fullRange, text: content }], (): null => null);
      } finally {
        suppressChangeRef.current = false;
      }
      if (buffer) {
        callbacksRef.current.onApplyExternalContent?.(buffer.key, content);
      }
      pendingConflictContentRef.current = null;
      setPendingConflictContent(null);
      setIsReviewingDiff(false);
    };
    // Phase 3: keep the user's version. Drops the stashed content and
    // exits any open diff review without touching the user's model.
    const keepUserConflict = (): void => {
      if (pendingConflictContentRef.current === null && !isReviewingDiffRef.current) return;
      pendingConflictContentRef.current = null;
      setPendingConflictContent(null);
      setIsReviewingDiff(false);
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
      // Reset to the user-configured default, falling back to the
      // compile-time default (14px) when settings haven't been hydrated
      // yet (e.g. the handle is invoked synchronously on mount).
      resetZoom: () => setFontSize(settingsRef.current.fontSize || DEFAULT_FONT_SIZE),
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
      // Replace the active git decoration set. Each call is idempotent —
      // the prior batch is removed before the new one is applied via
      // `deltaDecorations` so callers don't have to track ids themselves.
      setGitDecorations: (decorations) => {
        const editor = editorRef.current;
        if (!editor) return;
        gitDecorationIdsRef.current = editor.deltaDecorations(gitDecorationIdsRef.current, decorations);
      },
      acceptAgentConflict,
      keepUserConflict,
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/*
        Main Monaco host. Stays mounted across diff-review transitions so
        the user's model and undo stack are preserved (the diff editor
        is "above" it visually but the underlying editor isn't
        unmounted). When reviewing the diff, the host is visually hidden
        but kept in the DOM so re-entry is instant and the user's edit
        position isn't lost.
      */}
      <div
        ref={containerRef}
        className={isReviewingDiff ? 'editor-monaco-host--hidden' : undefined}
        style={{ width: '100%', height: '100%' }}
      />
      {/*
        Conflict banner — Phase 3. Sits above the editor when the agent
        has written a file the user has unsaved changes on. Hidden while
        a diff review is open (the diff review header takes over).
      */}
      {pendingConflictContent !== null && !isReviewingDiff ? (
        <ConflictBanner
          theme={theme}
          onReviewDiff={() => setIsReviewingDiff(true)}
          onIgnore={() => {
            pendingConflictContentRef.current = null;
            setPendingConflictContent(null);
          }}
        />
      ) : null}
      {/*
        Diff review surface. Renders on top of the main editor when the
        user clicks "Review Diff". The DiffEditor itself is mounted in
        an effect (above) so it picks up the live main model + the
        stashed agent text. The sticky header carries the resolution
        buttons (Accept / Keep).
      */}
      {isReviewingDiff ? (
        <>
          <DiffReviewHeader
            onAccept={() => {
              const content = pendingConflictContentRef.current;
              if (content === null) {
                setIsReviewingDiff(false);
                return;
              }
              const editor = editorRef.current;
              const model = editor?.getModel();
              if (!editor || !model) {
                setIsReviewingDiff(false);
                return;
              }
              const buffer = activeBufferRef.current;
              suppressChangeRef.current = true;
              try {
                const fullRange = model.getFullModelRange();
                model.pushEditOperations([], [{ range: fullRange, text: content }], (): null => null);
              } finally {
                suppressChangeRef.current = false;
              }
              if (buffer) {
                callbacksRef.current.onApplyExternalContent?.(buffer.key, content);
              }
              pendingConflictContentRef.current = null;
              setPendingConflictContent(null);
              setIsReviewingDiff(false);
            }}
            onKeep={() => {
              pendingConflictContentRef.current = null;
              setPendingConflictContent(null);
              setIsReviewingDiff(false);
            }}
          />
          <div ref={diffContainerRef} className='editor-diff-review-host' />
        </>
      ) : null}
    </div>
  );
});

/**
 * Phase 3 conflict banner — the small "Agent modified this file but you
 * have unsaved changes" strip that appears at the top of the editor when
 * the file-stream handler stashes incoming agent content. Two actions:
 *   - Review Diff: flip the parent into diff review mode (mounts a
 *     DiffEditor over the live model).
 *   - Ignore: drop the stashed content without applying it.
 *
 * Theme-aware: the warn-tone palette gets a darker background in dark
 * mode for contrast. Strings come from i18n with hard-coded fallbacks
 * so a missing translation never produces a blank banner.
 */
type ConflictBannerProps = {
  theme: 'light' | 'dark';
  onReviewDiff: () => void;
  onIgnore: () => void;
};
const ConflictBanner: React.FC<ConflictBannerProps> = ({ theme, onReviewDiff, onIgnore }) => {
  const { t } = useTranslation();
  const className = `editor-conflict-banner${theme === 'dark' ? ' editor-conflict-banner--dark' : ''}`;
  return (
    <div className={className} role='status' aria-live='polite'>
      <span className='editor-conflict-banner__message'>
        {t('conversation.editor.agentConflictMessage', {
          defaultValue: 'Agent modified this file but you have unsaved changes.',
        })}
      </span>
      <button
        type='button'
        className='editor-conflict-banner__button editor-conflict-banner__button--primary'
        onClick={onReviewDiff}
      >
        {t('conversation.editor.agentConflictReviewDiff', { defaultValue: 'Review Diff' })}
      </button>
      <button
        type='button'
        className='editor-conflict-banner__button editor-conflict-banner__button--ghost'
        onClick={onIgnore}
      >
        {t('conversation.editor.agentConflictIgnore', { defaultValue: 'Ignore' })}
      </button>
    </div>
  );
};

/**
 * Phase 3 diff review header — sticky bar above the DiffEditor carrying
 * the resolution actions. Sits over the editor chrome (not inside the
 * diff widget) so the diff itself stays clean of UI chrome.
 *
 * Accept: replaces the user's model content with the stashed agent
 * content (via the parent's `pushEditOperations` path) and exits
 * review mode. Keep: drops the stashed content and exits review mode
 * without touching the user's model.
 */
type DiffReviewHeaderProps = {
  onAccept: () => void;
  onKeep: () => void;
};
const DiffReviewHeader: React.FC<DiffReviewHeaderProps> = ({ onAccept, onKeep }) => {
  const { t } = useTranslation();
  return (
    <div className='editor-diff-review-header' role='toolbar' aria-label='Diff review actions'>
      <span className='editor-diff-review-header__label'>
        {t('conversation.editor.agentConflictOriginalLabel', { defaultValue: 'Your version' })}
        {' / '}
        {t('conversation.editor.agentConflictModifiedLabel', { defaultValue: "Agent's version" })}
      </span>
      <button
        type='button'
        className='editor-conflict-banner__button editor-conflict-banner__button--primary'
        onClick={onAccept}
      >
        {t('conversation.editor.agentConflictAccept', { defaultValue: 'Accept Agent Changes' })}
      </button>
      <button type='button' className='editor-conflict-banner__button' onClick={onKeep}>
        {t('conversation.editor.agentConflictKeepMine', { defaultValue: 'Keep My Version' })}
      </button>
    </div>
  );
};

export default MonacoEditor;
