/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteItem } from '@/renderer/pages/notes/types';

/**
 * Tracks the currently selected note and delegates content changes back to
 * the notebook list hook so updates persist in local state.
 *
 * The full Markdown body is not part of the note list response, so `content`
 * is loaded lazily via `loadNoteContent` when a note is selected.
 *
 * The first line of the note body is treated as the note's title. The
 * sidebar/toolbar stay in sync with the persisted title — the title updates
 * only when the first line is "finalized" (Enter to leave the title line,
 * or clearing the first line entirely).
 */
const isFirstLineFinalized = (prev: string, next: string): boolean => {
  // Plain-text finalization (SV/IR Markdown or raw textareas): Enter inserts
  // a literal '\n' inside the previously single-line buffer.
  if (prev !== '' && !prev.includes('\n') && next.includes('\n')) return true;
  // Plain-text "Enter after the first line already exists": prev has at
  // least one '\n' and the user added another line. Treat as finalization
  // so editing the first line on a finalized document and pressing Enter
  // syncs the new title.
  if (prev.includes('\n') && next.split('\n').length > prev.split('\n').length) return true;
  // Vditor wysiwyg HTML — Enter creates a new <p>/<h…>/<blockquote>/… block.
  // Treat any increase in block count as an Enter event. We require
  // either:
  //   - both sides look like Vditor HTML and the previous state was
  //     already structured (prevBlocks >= 1, then nextBlocks > prevBlocks);
  //     this catches the re-enter case on a finalized document and the
  //     normal 1→2 first-Enter on an existing single-block document.
  //   - the previous state was empty and the next state already has
  //     2+ blocks; this catches the 0→2 path where Vditor emits the
  //     post-Enter HTML as a single onChange without an intermediate
  //     1-block state. A first-keystroke 0→1 emit does not match.
  if (prev === '' && next.includes('<') && countBlocks(next) >= 2) return true;
  if (prev !== '' && next.includes('<') && prev.includes('<')) {
    const prevBlocks = countBlocks(prev);
    const nextBlocks = countBlocks(next);
    if (prevBlocks >= 1 && nextBlocks > prevBlocks) return true;
  }
  // Vditor undoDelay (800 ms) debounce: when typing the first line and
  // pressing Enter quickly, the intermediate single-line Markdown state
  // may never reach this callback — prev stays empty while next has a
  // meaningful first line followed by blank line(s). Detect this as a
  // first-line Enter finalization (not a multi-line paste where every
  // line typically has content).
  if (prev === '' && next.includes('\n')) {
    const [firstLine, ...rest] = next.split('\n');
    if (firstLine.trim() !== '' && rest.every((l) => l.trim() === '')) return true;
  }
  // The first line was emptied (e.g., backspaced). Works for both plain
  // text and HTML because we count block elements below.
  const prevFirst = firstBlockText(prev);
  const nextFirst = firstBlockText(next);
  if (prevFirst.trim() !== '' && nextFirst.trim() === '') return true;
  return false;
};

const normalizeFirstLine = (content: string): string => {
  // Works for both plain text (split on '\n') and Vditor wysiwyg HTML
  // (split on block elements). Strip Markdown's leading emphasis markers
  // and surrounding whitespace.
  const raw = firstBlockText(content);
  return raw.replace(/^[\s*]+/, '').trim();
};

/** Number of top-level blocks in a plain-text or HTML document. */
const countBlocks = (content: string): number => {
  if (!content) return 0;
  if (content.includes('<')) {
    // Vditor wysiwyg HTML — block elements delimit lines.
    const matches = content.match(/<(p|h[1-6]|blockquote|ul|ol|pre|hr|table|div)\b[^>]*>/gi);
    return matches ? matches.length : content.trim() ? 1 : 0;
  }
  return content.split('\n').filter((line) => line.trim() !== '').length;
};

/** Plain-text of the first block in a plain-text or HTML document. */
const firstBlockText = (content: string): string => {
  if (!content) return '';
  if (content.includes('<')) {
    // Strip the leading block-level open tag, then read up to the next
    // block-level open tag or the close of the first block. Vditor's
    // wysiwyg HTML uses `<p>...</p>` paragraphs as its line delimiter.
    const openTag = /<(p|h[1-6]|blockquote|ul|ol|pre|hr|table|div)\b[^>]*>/i;
    const afterOpen = content.replace(openTag, '');
    const closerMatch = afterOpen.match(/<\/(p|h[1-6]|blockquote|ul|ol|pre|table|div)>/i);
    const inner = closerMatch ? afterOpen.slice(0, closerMatch.index) : afterOpen;
    return inner
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }
  return content.split('\n', 1)[0] ?? '';
};

export const useNotesEditor = (params: {
  notes: NoteItem[];
  updateNoteContent: (id: string, content: string) => void;
  loadNoteContent?: (id: string) => Promise<string>;
  renameNote?: (id: string, title: string) => Promise<void> | void;
}) => {
  const { notes, updateNoteContent, loadNoteContent, renameNote } = params;
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const lastContentRef = useRef<Map<string, string>>(new Map());

  const handleContentChange = useCallback(
    (noteId: string, content: string) => {
      updateNoteContent(noteId, content);

      // Persist the title on finalize events only (Enter, clearing the
      // first line). Comparing against the local notes[].title is safe
      // because we no longer mutate it locally — the only writer is the
      // backend response, so a match means the backend already has this
      // title and the IPC would be a no-op.
      if (renameNote) {
        const prevContent = lastContentRef.current.get(noteId) ?? '';
        if (isFirstLineFinalized(prevContent, content)) {
          const normalized = normalizeFirstLine(content);
          const current = notes.find((n) => n.id === noteId)?.title;
          if (normalized && normalized !== current) {
            Promise.resolve(renameNote(noteId, normalized)).catch((err: unknown) => {
              console.error('[useNotesEditor] renameNote failed', err);
            });
          }
        }
      }

      lastContentRef.current.set(noteId, content);
    },
    [updateNoteContent, renameNote, notes]
  );

  useEffect(() => {
    return () => {
      lastContentRef.current.clear();
    };
  }, []);

  const activeNote = useMemo(
    () => (activeNoteId ? (notes.find((n) => n.id === activeNoteId) ?? null) : null),
    [activeNoteId, notes]
  );

  const selectNote = useCallback(
    (id: string) => {
      setActiveNoteId(id);
      // The note list omits the body — fetch it from the raw endpoint.
      if (loadNoteContent) {
        const note = notes.find((n) => n.id === id);
        if (note && note.content === undefined) {
          setLoadingContent(true);
          void loadNoteContent(id).finally(() => setLoadingContent(false));
        }
      }
    },
    [loadNoteContent, notes]
  );
  const deselectNote = useCallback(() => setActiveNoteId(null), []);

  const commitTitle = useCallback(
    (noteId: string, content?: string): void => {
      // Force-sync the first line of the most recent content as the
      // note's title. Used by the editor's `blur` callback so the
      // sidebar stays in sync when the user clicks away without
      // pressing Enter.
      // When `content` is provided (e.g. from a direct Vditor getValue()
      // call), use it directly instead of the debounced lastContentRef.
      if (!renameNote) return;
      const latestContent = content ?? lastContentRef.current.get(noteId) ?? '';
      const normalized = normalizeFirstLine(latestContent);
      const current = notes.find((n) => n.id === noteId)?.title;
      if (normalized && normalized !== current) {
        renameNote(noteId, normalized);
      }
    },
    [renameNote, notes]
  );

  return {
    activeNoteId,
    setActiveNoteId,
    activeNote,
    loadingContent,
    selectNote,
    deselectNote,
    handleContentChange,
    commitTitle,
  };
};
