/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notesApi } = vi.hoisted(() => ({
  notesApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    raw: vi.fn(),
    get: vi.fn(),
    star: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    notebooks: {
      list: { invoke: vi.fn().mockResolvedValue([]) },
      update: { invoke: vi.fn() },
      create: { invoke: vi.fn() },
      delete: { invoke: vi.fn() },
      listNotes: { invoke: vi.fn() },
      createNote: { invoke: vi.fn() },
    },
    notes: {
      list: { invoke: notesApi.list },
      create: { invoke: notesApi.create },
      update: { invoke: notesApi.update },
      delete: { invoke: notesApi.delete },
      raw: { invoke: notesApi.raw },
      get: { invoke: notesApi.get },
      star: { invoke: notesApi.star },
    },
  },
}));

import { useNotesEditor } from '@/renderer/hooks/notes/useNotesEditor';
import type { NoteItem } from '@/renderer/pages/notes/types';

const baseNote: NoteItem = {
  id: 'nt_1',
  title: 'Old title',
  notebookId: 'nb_1',
  filePath: 'notes/x.md',
  tags: [],
  star: false,
  content: '',
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

describe('useNotesEditor.firstLineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call renameNote while the user is typing on the first line', async () => {
    // The user types each character in sequence; prevContent tracks the
    // last emit. Block count grows from 0 to 1 on the first character
    // and then stays at 1 for the rest — the "+1 block" rule only
    // fires once (for the empty → first character transition), but the
    // hook-level "current title" check short-circuits when the new
    // normalized value matches the existing title, so the IPC is not
    // actually called.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const updateNoteContent = vi.fn();
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent,
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', 'H');
    });
    await act(async () => {
      result.current.handleContentChange('nt_1', 'He');
    });
    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello');
    });

    expect(renameNote).not.toHaveBeenCalled();
    expect(updateNoteContent).toHaveBeenCalledTimes(3);
  });

  it('calls renameNote with the first line when Enter finalizes it', async () => {
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const updateNoteContent = vi.fn();
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent,
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello world');
    });
    expect(renameNote).not.toHaveBeenCalled();

    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello world\nbody text');
    });
    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenCalledWith('nt_1', 'Hello world');
    expect(updateNoteContent).toHaveBeenCalledWith('nt_1', 'Hello world\nbody text');
  });

  it('renames on the very first Enter (0→2 block transition in Vditor wysiwyg)', async () => {
    // User-reported repro: open a brand-new note, type the title and
    // press Enter in one go. Vditor may emit the post-Enter HTML as a
    // single onChange with 0 → 2 blocks (skipping the intermediate 1-block
    // state). The finalize detector must recognize this as a finalization
    // — block count grew, even if not by exactly +1 — and sync the title.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [{ ...baseNote, title: '' }],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello world</p><p><br></p>');
    });

    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenCalledWith('nt_1', 'Hello world');
  });

  it('renames when commitTitle is called (e.g. on editor blur)', async () => {
    // The editor's `blur` callback (when the user clicks outside the
    // first line or focuses another panel) commits the current first
    // line as the title without needing the user to press Enter. The
    // hook exposes commitTitle(noteId) so the editor can drive the
    // sync explicitly.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    // Seed the latest content (the editor calls handleContentChange on
    // every input).
    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello world</p>');
    });
    expect(renameNote).not.toHaveBeenCalled();

    // User clicks away — commit.
    await act(async () => {
      result.current.commitTitle?.('nt_1');
    });

    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenCalledWith('nt_1', 'Hello world');
  });

  it('skips the rename when the first line is empty', async () => {
    const renameNote = vi.fn();
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', '\nbody only');
    });

    expect(renameNote).not.toHaveBeenCalled();
  });

  it('does not rename when a fresh note is populated with a multi-line document', async () => {
    // Pasting a full document into a fresh note shouldn't fire an immediate
    // rename just because the content contains a newline — there's no
    // "Enter" event, just a paste.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', 'First line\nSecond line');
    });

    expect(renameNote).not.toHaveBeenCalled();
  });

  it('syncs the first block as title when Vditor wysiwyg emits HTML (no newline)', async () => {
    // Vditor's wysiwyg mode delivers HTML via `input` — no '\n' is present,
    // so the previous "next.includes('\n')" finalize detector never fires
    // and the title silently stops syncing. The hook must instead detect a
    // new second block appearing in the HTML and rename from the first
    // block's plain text.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const updateNoteContent = vi.fn();
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent,
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello world</p>');
    });
    expect(renameNote).not.toHaveBeenCalled();

    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello world</p><p>body text</p>');
    });

    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenCalledWith('nt_1', 'Hello world');
    expect(updateNoteContent).toHaveBeenLastCalledWith('nt_1', '<p>Hello world</p><p>body text</p>');
  });

  it('renames on Enter when the note starts empty (Vditor wysiwyg HTML)', async () => {
    // User-reported repro: open a brand-new note, type the title, press
    // Enter. Vditor wysiwyg first emits `<p>title</p>`, then on Enter emits
    // `<p>title</p><p><br></p>`. The finalize detector must recognize the
    // 0→2-block transition as "Enter" even when the prev buffer is empty.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [{ ...baseNote, title: '' }],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello world</p>');
    });
    expect(renameNote).not.toHaveBeenCalled();

    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello world</p><p><br></p>');
    });

    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenCalledWith('nt_1', 'Hello world');
  });

  it('renames again when the user edits the first line and presses Enter after finalization', async () => {
    // Repro: title finalized as 'Hello' (Enter left the first line),
    // then the user clicks back to the first line, changes Hello →
    // 'Hello world', and presses Enter to commit. Block count goes
    // 2 → 3, so the finalize detector must fire on that "+1 block"
    // transition.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello');
    });
    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello\nbody');
    });
    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenLastCalledWith('nt_1', 'Hello');

    // User edits the first line to 'Hello world' and presses Enter.
    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello world\nbody\n');
    });

    expect(renameNote).toHaveBeenCalledTimes(2);
    expect(renameNote).toHaveBeenLastCalledWith('nt_1', 'Hello world');
  });

  it('renames again when the user edits the first line and presses Enter after finalization (Vditor wysiwyg HTML)', async () => {
    // Same as above but with Vditor's HTML onChange payloads.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello</p>');
    });
    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello</p><p>body</p>');
    });
    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenLastCalledWith('nt_1', 'Hello');

    // User edits first line to 'Hello world' and presses Enter — block
    // count goes 2 → 3.
    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>Hello world</p><p>body</p><p><br></p>');
    });

    expect(renameNote).toHaveBeenCalledTimes(2);
    expect(renameNote).toHaveBeenLastCalledWith('nt_1', 'Hello world');
  });

  it('renames when the user edits the first line and presses Enter after finalization', async () => {
    // Repro: title is 'A' (finalized as a Vditor HTML document), user
    // goes back to the first line, changes A→B and presses Enter to
    // start a new line. The block count goes from 2 to 3. The hook
    // must sync 'B' as the new title the moment Enter adds a block.
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    // Phase 1: type 'A' and press Enter (all in Vditor wysiwyg).
    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>A</p>');
    });
    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>A</p><p>body</p>');
    });
    expect(renameNote).toHaveBeenLastCalledWith('nt_1', 'A');

    // Phase 2: click back to the first line, replace A→B, press Enter.
    await act(async () => {
      result.current.handleContentChange('nt_1', '<p>B</p><p>body</p><p><br></p>');
    });

    expect(renameNote).toHaveBeenCalledTimes(2);
    expect(renameNote).toHaveBeenLastCalledWith('nt_1', 'B');
  });

  it('renames when the first line is cleared (delete / backspace to empty)', async () => {
    const renameNote = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent: vi.fn(),
        renameNote,
      })
    );

    // Type the first line and press Enter to finalize.
    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello world');
    });
    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello world\nbody');
    });
    expect(renameNote).toHaveBeenCalledTimes(1);
    expect(renameNote).toHaveBeenLastCalledWith('nt_1', 'Hello world');

    // User backspaces the entire first line — finalize event fires again.
    // The empty-first-line guard skips the IPC rename (nothing meaningful
    // to send).
    await act(async () => {
      result.current.handleContentChange('nt_1', '\nbody');
    });
    expect(renameNote).toHaveBeenCalledTimes(1);
  });

  it('works without renameNote (does not throw)', async () => {
    const updateNoteContent = vi.fn();
    const { result } = renderHook(() =>
      useNotesEditor({
        notes: [baseNote],
        updateNoteContent,
      })
    );

    await act(async () => {
      result.current.handleContentChange('nt_1', 'Hello world\nbody');
    });
    expect(updateNoteContent).toHaveBeenCalledWith('nt_1', 'Hello world\nbody');
  });
});
