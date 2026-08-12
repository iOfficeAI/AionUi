/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NoteItem, Notebook } from '@/renderer/pages/notes/types';
import { ipcBridge } from '@/common';
import { useCallback, useEffect, useState } from 'react';

/**
 * Manages the local notebooks/notes collection backed by the aionui-notebook
 * REST API.
 *
 * - `notebooks` / `notes` are mirrored in local state for snappy UI updates;
 * - mutations call the backend first, then patch local state on success;
 * - on failure, the local state is left untouched and the error is logged.
 *
 * Per `notebook-api.md`, notes are associated with notebooks by **id**
 * (`notebook_id`), and the full Markdown body is only available via the raw
 * endpoint — so `content` is fetched lazily on demand. Because ownership is
 * keyed by id, renaming a notebook never has to mutate the notes array.
 */
export const useNotebookList = () => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nbList, noteList] = await Promise.all([
          ipcBridge.notebooks.list.invoke(),
          ipcBridge.notes.list.invoke({}),
        ]);
        if (cancelled) return;
        setNotebooks(nbList);
        setNotes(noteList);
      } catch (e) {
        console.error('[useNotebookList] failed to load notebooks/notes', e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getNotesByNotebookId = useCallback(
    (notebookId: string) => notes.filter((n) => n.notebookId === notebookId),
    [notes]
  );

  const getNoteById = useCallback((id: string) => notes.find((n) => n.id === id), [notes]);

  const getNotebookById = useCallback((id: string) => notebooks.find((n) => n.id === id), [notebooks]);

  /** Lazily fetch the full Markdown body via the raw endpoint. */
  const loadNoteContent = useCallback(async (id: string): Promise<string> => {
    const content = await ipcBridge.notes.raw.invoke({ id });
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    return content;
  }, []);

  const createNotebook = useCallback(async (name: string): Promise<Notebook> => {
    const notebook = await ipcBridge.notebooks.create.invoke({ name });
    setNotebooks((prev) => [...prev, notebook]);
    return notebook;
  }, []);

  const renameNotebook = useCallback(async (id: string, name: string): Promise<void> => {
    const updated = await ipcBridge.notebooks.update.invoke({ id, name });
    setNotebooks((prev) => prev.map((n) => (n.id === id ? updated : n)));
  }, []);

  const deleteNotebook = useCallback(async (id: string): Promise<void> => {
    await ipcBridge.notebooks.delete.invoke({ id });
    setNotebooks((prev) => prev.filter((n) => n.id !== id));
    setNotes((prev) => prev.filter((n) => n.notebookId !== id));
  }, []);

  /** `notebookId` is the parent notebook id (ownership is resolved by id). */
  const createNote = useCallback(async (notebookId: string, title: string): Promise<NoteItem> => {
    const note = await ipcBridge.notes.create.invoke({ notebook_id: notebookId, title, content: '' });
    setNotes((prev) => [...prev, note]);
    return note;
  }, []);

  const renameNote = useCallback(
    (id: string, title: string): void => {
      // Optimistic local update so the sidebar re-renders before the IPC
      // round-trip resolves. We deliberately do not await the IPC here —
      // the title appears instantly, the local state stays the source of
      // truth, and the PUT is fired-and-forgotten. If the PUT later fails
      // we revert; if it succeeds we re-attach the just-sent title (the
      // backend response may carry a stale snapshot).
      const previous = notes.find((n) => n.id === id);
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title } : n)));
      void ipcBridge.notes.update
        .invoke({ id, title })
        .then((updated) => {
          // Backend ApiNote response may not reflect our just-sent title
          // (server-side persistence can lag or read the title from a
          // header PUT doesn't refresh). Re-attach the canonical title.
          setNotes((prev) => prev.map((n) => (n.id === id ? { ...updated, title, content: n.content } : n)));
        })
        .catch((e: unknown) => {
          console.error('[useNotebookList] renameNote failed, reverting', e);
          if (previous) {
            setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: previous.title } : n)));
          }
        });
    },
    [notes]
  );

  const updateNoteContent = useCallback(async (id: string, content: string): Promise<void> => {
    // The backend `ApiNote` response shape does not include `title` (the
    // list/get endpoints source it from a separate column / first-line
    // fallback). A concurrent `renameNote` may have already committed a
    // new title while this PUT was in flight — read the latest title from
    // the functional updater so the merged note keeps the user's just-set
    // title instead of reverting to the value captured by this closure.
    const updated = await ipcBridge.notes.update.invoke({ id, content });
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...updated, title: n.title, content } : n)));
  }, []);

  const deleteNote = useCallback(async (id: string): Promise<void> => {
    await ipcBridge.notes.delete.invoke({ id });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /** Toggle the star state via `POST /api/notes/{id}/star`. */
  const toggleNoteStar = useCallback(async (id: string): Promise<boolean> => {
    const star = await ipcBridge.notes.star.invoke({ id });
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, star } : n)));
    return star;
  }, []);

  /** Directly set the star state via `PUT /api/notes/{id}`. */
  const setNoteStar = useCallback(async (id: string, star: boolean): Promise<void> => {
    const updated = await ipcBridge.notes.update.invoke({ id, star });
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  }, []);

  return {
    notebooks,
    notes,
    loading,
    error,
    getNotesByNotebookId,
    getNoteById,
    getNotebookById,
    loadNoteContent,
    createNotebook,
    renameNotebook,
    deleteNotebook,
    createNote,
    renameNote,
    updateNoteContent,
    deleteNote,
    toggleNoteStar,
    setNoteStar,
  };
};
