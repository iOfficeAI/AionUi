/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notebooksApi, notesApi } = vi.hoisted(() => ({
  notebooksApi: {
    list: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    listNotes: vi.fn(),
    createNote: vi.fn(),
  },
  notesApi: {
    list: vi.fn(),
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
      list: { invoke: notebooksApi.list },
      update: { invoke: notebooksApi.update },
      create: { invoke: notebooksApi.create },
      delete: { invoke: notebooksApi.delete },
      listNotes: { invoke: notebooksApi.listNotes },
      createNote: { invoke: notebooksApi.createNote },
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

import { useNotebookList } from '@/renderer/hooks/notes/useNotebookList';

const baseNotebook = {
  id: 'nb_1',
  name: 'Travel',
  description: '',
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

const otherNotebook = {
  id: 'nb_2',
  name: 'Personal',
  description: '',
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

const noteInTravel = {
  id: 'nt_1',
  title: 'Tokyo',
  notebookId: 'nb_1',
  filePath: 'notes/tokyo.md',
  tags: [],
  star: false,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

const noteInOther = {
  id: 'nt_2',
  title: 'Groceries',
  notebookId: 'nb_2',
  filePath: 'notes/groceries.md',
  tags: [],
  star: false,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

describe('useNotebookList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNotesByNotebookId', () => {
    it('groups notes under their parent notebook by id', async () => {
      notebooksApi.list.mockResolvedValue([baseNotebook, otherNotebook]);
      notesApi.list.mockResolvedValue([noteInTravel, noteInOther]);

      const { result } = renderHook(() => useNotebookList());

      await waitFor(() => {
        expect(result.current.notebooks).toHaveLength(2);
        expect(result.current.notes).toHaveLength(2);
      });

      expect(result.current.getNotesByNotebookId('nb_1').map((n) => n.id)).toEqual(['nt_1']);
      expect(result.current.getNotesByNotebookId('nb_2').map((n) => n.id)).toEqual(['nt_2']);
    });
  });

  describe('renameNotebook', () => {
    it('renames the notebook and leaves notes untouched (id-based ownership)', async () => {
      notebooksApi.list.mockResolvedValue([baseNotebook]);
      notesApi.list.mockResolvedValue([noteInTravel, noteInOther]);

      const { result } = renderHook(() => useNotebookList());

      await waitFor(() => {
        expect(result.current.notebooks).toHaveLength(1);
        expect(result.current.notes).toHaveLength(2);
      });

      const renamed = { ...baseNotebook, name: 'Travel 2026' };
      notebooksApi.update.mockResolvedValue(renamed);

      await act(async () => {
        await result.current.renameNotebook(baseNotebook.id, 'Travel 2026');
      });

      expect(notebooksApi.update).toHaveBeenCalledWith({ id: baseNotebook.id, name: 'Travel 2026' });
      expect(result.current.notebooks[0].name).toBe('Travel 2026');

      // Notes reference the notebook by stable id, so they remain under the
      // renamed notebook without any note-side mutation.
      expect(result.current.getNotesByNotebookId('nb_1').map((n) => n.id)).toEqual(['nt_1']);
      expect(result.current.notes.find((n) => n.id === noteInTravel.id)?.notebookId).toBe('nb_1');
      expect(result.current.notes.find((n) => n.id === noteInOther.id)?.notebookId).toBe('nb_2');
    });
  });

  describe('deleteNotebook', () => {
    it('removes the notebook and notes that belong to it by id', async () => {
      notebooksApi.list.mockResolvedValue([baseNotebook, otherNotebook]);
      notesApi.list.mockResolvedValue([noteInTravel, noteInOther]);
      notebooksApi.delete.mockResolvedValue(undefined);

      const { result } = renderHook(() => useNotebookList());

      await waitFor(() => {
        expect(result.current.notes).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteNotebook('nb_1');
      });

      expect(notebooksApi.delete).toHaveBeenCalledWith({ id: 'nb_1' });
      expect(result.current.notebooks.map((n) => n.id)).toEqual(['nb_2']);
      expect(result.current.notes.map((n) => n.id)).toEqual(['nt_2']);
    });
  });

  describe('createNote', () => {
    it('posts the parent notebook id and appends the new note', async () => {
      notebooksApi.list.mockResolvedValue([baseNotebook]);
      notesApi.list.mockResolvedValue([]);
      const created = { ...noteInTravel };
      notesApi.create.mockResolvedValue(created);

      const { result } = renderHook(() => useNotebookList());

      await waitFor(() => {
        expect(result.current.notebooks).toHaveLength(1);
      });

      await act(async () => {
        await result.current.createNote('nb_1', 'Tokyo');
      });

      expect(notesApi.create).toHaveBeenCalledWith({ notebook_id: 'nb_1', title: 'Tokyo', content: '' });
      expect(result.current.notes.map((n) => n.id)).toEqual(['nt_1']);
    });
  });

  describe('renameNote', () => {
    it('preserves the locally cached content when the backend response omits it', async () => {
      // Backend ApiNote has no `content` field — see ApiNote type. We mirror that.
      const backendUpdated = {
        id: noteInTravel.id,
        title: 'Tokyo renamed',
        notebook_id: 'nb_1',
        file_path: 'notes/tokyo.md',
        tags: [],
        star: false,
        created_at: new Date('2026-07-31').getTime(),
        updated_at: new Date('2026-07-31').getTime(),
      };
      notebooksApi.list.mockResolvedValue([baseNotebook]);
      notesApi.list.mockResolvedValue([{ ...noteInTravel }]);
      notesApi.update.mockResolvedValue(backendUpdated);

      const { result } = renderHook(() => useNotebookList());

      await waitFor(() => {
        expect(result.current.notes).toHaveLength(1);
      });

      // Seed the local cache with content (simulating a prior edit).
      await act(async () => {
        await result.current.updateNoteContent(noteInTravel.id, 'cached body text');
      });
      expect(result.current.notes[0].content).toBe('cached body text');

      await act(async () => {
        await result.current.renameNote(noteInTravel.id, 'Tokyo renamed');
      });

      // The bug: renameNote replaced the whole note object with the backend
      // response, which has no `content` field, so the cached body was wiped.
      expect(result.current.notes[0].title).toBe('Tokyo renamed');
      expect(result.current.notes[0].content).toBe('cached body text');
    });

    it('preserves the title when an updateNoteContent response omits the title field', async () => {
      // Simulates the Enter-keystroke flow: useNotesEditor calls both
      // `renameNote(id, 'Hello world')` and `updateNoteContent(id, body)`.
      // The backend's `ApiNote` does not include `title` (the list/get
      // endpoints source the title from a separate column / first-line
      // extraction), so the content PUT's response object has no `title`
      // key. Without an explicit re-attach, the merged note loses the
      // title we just set, and the sidebar snaps back to the previous
      // value even though the backend persisted both fields.
      const titleResponse = {
        id: noteInTravel.id,
        notebook_id: 'nb_1',
        file_path: 'notes/tokyo.md',
        tags: [],
        star: false,
        created_at: new Date('2026-07-31').getTime(),
        updated_at: new Date('2026-07-31').getTime(),
      };
      const contentResponse = {
        id: noteInTravel.id,
        notebook_id: 'nb_1',
        file_path: 'notes/tokyo.md',
        tags: [],
        star: false,
        created_at: new Date('2026-07-31').getTime(),
        updated_at: new Date('2026-07-31').getTime(),
      };
      notebooksApi.list.mockResolvedValue([baseNotebook]);
      notesApi.list.mockResolvedValue([{ ...noteInTravel }]);
      notesApi.update.mockImplementation((params: { title?: string; content?: string }) => {
        if (params.title !== undefined) return Promise.resolve(titleResponse);
        return Promise.resolve(contentResponse);
      });

      const { result } = renderHook(() => useNotebookList());
      await waitFor(() => expect(result.current.notes).toHaveLength(1));

      await act(async () => {
        await Promise.all([
          result.current.renameNote(noteInTravel.id, 'Hello world'),
          result.current.updateNoteContent(noteInTravel.id, 'Hello world\nbody'),
        ]);
      });

      expect(result.current.notes[0].title).toBe('Hello world');
      expect(result.current.notes[0].content).toBe('Hello world\nbody');
    });

    it('does not let a slow content PUT clobber a title rename', async () => {
      // Simulates the editor flow: pressing Enter triggers both an
      // `updateNoteContent` (body) and a `renameNote` (title) on the same
      // note. If the content PUT returns AFTER the title PUT but with a
      // stale title, the sidebar would snap back to the old title.
      const backendUpdated = {
        id: noteInTravel.id,
        title: 'Hello world',
        notebook_id: 'nb_1',
        file_path: 'notes/tokyo.md',
        tags: [],
        star: false,
        created_at: new Date('2026-07-31').getTime(),
        updated_at: new Date('2026-07-31').getTime(),
      };
      notebooksApi.list.mockResolvedValue([baseNotebook]);
      notesApi.list.mockResolvedValue([{ ...noteInTravel }]);
      const contentReply = new Promise<typeof backendUpdated>((resolve) => {
        setTimeout(() => resolve({ ...backendUpdated, title: 'Old title' }), 20);
      });
      const titleReply = new Promise<typeof backendUpdated>((resolve) => {
        setTimeout(() => resolve({ ...backendUpdated, title: 'Hello world' }), 0);
      });
      notesApi.update.mockImplementation((params: { title?: string; content?: string }) =>
        params.title ? titleReply : contentReply
      );

      const { result } = renderHook(() => useNotebookList());
      await waitFor(() => expect(result.current.notes).toHaveLength(1));

      await act(async () => {
        await Promise.all([
          result.current.updateNoteContent(noteInTravel.id, 'Hello world\nbody'),
          result.current.renameNote(noteInTravel.id, 'Hello world'),
        ]);
      });

      expect(result.current.notes[0].title).toBe('Hello world');
      expect(result.current.notes[0].content).toBe('Hello world\nbody');
    });

    it('keeps the new title even when the backend response carries the old one', async () => {
      // can return a stale snapshot (or read the title from a header that PUT
      // doesn't refresh), so the response object has the OLD title. Without
      // re-attaching the title we just sent, the optimistic local update
      // gets clobbered and the sidebar snaps back to the previous title.
      const staleBackendResponse = {
        id: noteInTravel.id,
        title: 'Untitled', // old title the backend still has
        notebook_id: 'nb_1',
        file_path: 'notes/tokyo.md',
        tags: [],
        star: false,
        created_at: new Date('2026-07-31').getTime(),
        updated_at: new Date('2026-07-31').getTime(),
      };
      notebooksApi.list.mockResolvedValue([baseNotebook]);
      notesApi.list.mockResolvedValue([{ ...noteInTravel }]);
      notesApi.update.mockResolvedValue(staleBackendResponse);

      const { result } = renderHook(() => useNotebookList());

      await waitFor(() => {
        expect(result.current.notes).toHaveLength(1);
      });

      await act(async () => {
        await result.current.renameNote(noteInTravel.id, 'New title');
      });

      // The sidebar must keep the title we just sent, not snap back to the
      // stale response value.
      expect(result.current.notes[0].title).toBe('New title');
    });
  });
});
