/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wires the active editor buffer to the git diff feed.
 *
 * The hook is intentionally decoupled from the Monaco widget: it takes
 * the active buffer (read from `EditorContext`) and a callback to apply
 * decorations, and the parent component (currently `EditorPanel`)
 * supplies the bridge into the live editor. This keeps the hook
 * test-friendly and lets us swap editor implementations later without
 * re-implementing the diff-fetch loop.
 *
 * Refresh triggers:
 *   1. Buffer identity (key or filePath) change — initial load.
 *   2. Buffer content change — re-fetch so a fresh edit is reflected
 *      as a `modified` decoration on the new line.
 *   3. A debounced refresh of the active buffer's git status (catches
 *      external edits made by other processes / agents while the file
 *      is open in the editor).
 *
 * The hook does not throw on IPC failure — the editor stays usable
 * even when git is unavailable, and the error is silently swallowed
 * (decorations just won't appear).
 */

import { ipcBridge } from '@/common';
import * as monaco from '@aionui/editor-monaco';
import { useEffect, useRef } from 'react';
import { decorationsFromUnifiedPatch, type GitLineDecoration } from './gitDecorationsFromPatch';
import type { OpenBuffer } from './types';

const REFRESH_DEBOUNCE_MS = 600;

const editorLineDecorationClassNames = (kind: GitLineDecoration['kind']): string[] => {
  switch (kind) {
    case 'added':
      return ['editor-git-line', 'editor-git-line--added'];
    case 'modified':
      return ['editor-git-line', 'editor-git-line--modified'];
    case 'deleted':
      return ['editor-git-line', 'editor-git-line--deleted'];
  }
};

const applyDecorations = (editor: monaco.editor.IStandaloneCodeEditor, decorations: GitLineDecoration[]): void => {
  const modelDecorations: monaco.editor.IModelDeltaDecoration[] = [];
  for (const dec of decorations) {
    if (dec.line <= 0) continue; // skip pure deletions
    modelDecorations.push({
      range: new monaco.Range(dec.line, 1, dec.line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: `editor-git-glyph editor-git-glyph--${dec.kind}`,
        className: `editor-git-line editor-git-line--${dec.kind}`,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    });
  }
  const collection = editor.createDecorationsCollection(modelDecorations);
  void collection;
};

const emptyDecorations = (editor: monaco.editor.IStandaloneCodeEditor | null): void => {
  if (!editor) return;
  editor.createDecorationsCollection([]);
};

const fetchPatch = async (workspace: string | undefined, filePath: string): Promise<GitLineDecoration[] | null> => {
  try {
    const res = await ipcBridge.git.getDiff.invoke({ workspace, file_path: filePath });
    if (!res?.success) return null;
    if (!res.data) return null;
    if (res.data.binary) return []; // binary: explicit empty decoration set
    return decorationsFromUnifiedPatch(res.data.patch);
  } catch {
    return null;
  }
};

type UseEditorGitDecorationsOptions = {
  activeBuffer: OpenBuffer | null;
  editor: monaco.editor.IStandaloneCodeEditor | null;
};

/**
 * Subscribe to git diffs for the active buffer and push decorations into
 * the editor. Returns nothing — the side effect is the decoration update.
 */
export const useEditorGitDecorations = ({ activeBuffer, editor }: UseEditorGitDecorationsOptions): void => {
  const decorationIdsRef = useRef<string[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const lastContentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor) return;
    if (!activeBuffer || !activeBuffer.filePath) {
      emptyDecorations(editor);
      lastKeyRef.current = activeBuffer?.key ?? null;
      lastContentRef.current = activeBuffer?.content ?? null;
      return;
    }

    const filePath = activeBuffer.filePath;
    const workspace = activeBuffer.workspace;
    const key = activeBuffer.key;
    const content = activeBuffer.content;

    const refresh = async (): Promise<void> => {
      const decorations = await fetchPatch(workspace, filePath);
      if (decorations === null) {
        // IPC error — keep prior decorations; nothing to update.
        return;
      }
      const modelDecorations: monaco.editor.IModelDeltaDecoration[] = [];
      for (const dec of decorations) {
        if (dec.line <= 0) continue;
        modelDecorations.push({
          range: new monaco.Range(dec.line, 1, dec.line, 1),
          options: {
            isWholeLine: true,
            glyphMarginClassName: `editor-git-glyph editor-git-glyph--${dec.kind}`,
            className: editorLineDecorationClassNames(dec.kind).join(' '),
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
      // Use deltaDecorations on the editor (the supported public API).
      // Replace the prior batch with the new one.
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, modelDecorations);
    };

    // Initial / key-change refresh is immediate.
    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      lastContentRef.current = content;
      void refresh();
      return;
    }

    // Same buffer — debounce a re-fetch when content changes.
    if (lastContentRef.current !== content) {
      lastContentRef.current = content;
      const timer = window.setTimeout(() => {
        void refresh();
      }, REFRESH_DEBOUNCE_MS);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [activeBuffer?.key, activeBuffer?.filePath, activeBuffer?.workspace, activeBuffer?.content, editor]);

  // Refresh gutter when git status changes elsewhere (changes tab, commit, etc.).
  useEffect(() => {
    if (!editor || !activeBuffer?.filePath || !activeBuffer.workspace) return;
    const ws = activeBuffer.workspace;
    const filePath = activeBuffer.filePath;
    const unsub = ipcBridge.git.changed.on((event) => {
      if (event.workspace !== ws) return;
      void fetchPatch(ws, filePath).then((decorations) => {
        if (decorations === null || !editor) return;
        const modelDecorations: monaco.editor.IModelDeltaDecoration[] = [];
        for (const dec of decorations) {
          if (dec.line <= 0) continue;
          modelDecorations.push({
            range: new monaco.Range(dec.line, 1, dec.line, 1),
            options: {
              isWholeLine: true,
              glyphMarginClassName: `editor-git-glyph editor-git-glyph--${dec.kind}`,
              className: editorLineDecorationClassNames(dec.kind).join(' '),
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            },
          });
        }
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, modelDecorations);
      });
    });
    return unsub;
  }, [activeBuffer?.filePath, activeBuffer?.workspace, editor]);

  // Clear decorations when the editor unmounts / buffer goes away.
  useEffect(() => {
    return () => {
      if (editor && decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      }
    };
  }, [editor]);
};
