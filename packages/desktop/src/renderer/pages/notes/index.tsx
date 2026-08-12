/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import { useNotebookList, useNotesEditor } from '@renderer/hooks/notes';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import DeleteConfirmModal from './DeleteConfirmModal';
import EmptyState from './EmptyState';
import NotesSidebar from './NotesSidebar';
import NotesToolbar from './NotesToolbar';
import NotesHint from './NotesHint';
import VditorEditor from './VditorEditor';
import styles from './index.module.css';

type DeleteTarget = { type: 'notebook' | 'note'; id: string };

const NotesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme } = useThemeContext();
  const [clearModalVisible, setClearModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const list = useNotebookList();
  const editor = useNotesEditor({
    notes: list.notes,
    updateNoteContent: list.updateNoteContent,
    loadNoteContent: list.loadNoteContent,
    renameNote: list.renameNote,
  });
  const { activeNote } = editor;

  const handleBack = useCallback(() => {
    navigate('/guid');
  }, [navigate]);

  const handleExport = useCallback(() => {
    if (!activeNote) return;
    // The list response omits the body — fall back to the lazily loaded content.
    const blob = new Blob([activeNote.content ?? ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (activeNote.title || 'note').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeNote]);

  const handleClear = useCallback(() => {
    if (!activeNote) return;
    setClearModalVisible(true);
  }, [activeNote]);

  const handleClearConfirm = useCallback(() => {
    if (activeNote) {
      void list.updateNoteContent(activeNote.id, '');
    }
    setClearModalVisible(false);
  }, [activeNote, list]);

  const requestDeleteNotebook = useCallback((id: string) => setDeleteTarget({ type: 'notebook', id }), []);
  const requestDeleteNote = useCallback(
    (id: string) => {
      if (activeNote?.id === id) editor.deselectNote();
      setDeleteTarget({ type: 'note', id });
    },
    [activeNote, editor]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'notebook') {
      void list.deleteNotebook(deleteTarget.id);
    } else {
      void list.deleteNote(deleteTarget.id);
    }
    setDeleteTarget(null);
  }, [deleteTarget, list]);

  const handleDeleteCancel = useCallback(() => setDeleteTarget(null), []);

  if (list.loading) {
    return <AppLoader />;
  }

  if (list.error) {
    return (
      <div className='flex h-full min-h-0 items-center justify-center bg-transparent p-24px text-t-secondary'>
        {list.error}
      </div>
    );
  }

  return (
    <div className='flex h-full min-h-0 overflow-hidden bg-transparent'>
      <NotesSidebar
        notebooks={list.notebooks}
        notes={list.notes}
        activeNoteId={editor.activeNoteId}
        onSelectNote={editor.selectNote}
        onCreateNotebook={list.createNotebook}
        onRenameNotebook={list.renameNotebook}
        onDeleteNotebook={requestDeleteNotebook}
        onCreateNote={list.createNote}
        onRenameNote={list.renameNote}
        onDeleteNote={requestDeleteNote}
      />
      <div className='flex min-w-0 flex-1 flex-col'>
        <NotesToolbar
          noteTitle={activeNote?.title}
          hasActiveNote={Boolean(activeNote)}
          onBack={handleBack}
          onExport={handleExport}
          onClear={handleClear}
        />
        {activeNote && <NotesHint />}
        <div className={styles.editorContainer}>
          {activeNote ? (
            <VditorEditor
              key={activeNote.id}
              value={activeNote.content ?? ''}
              onChange={(value) => void editor.handleContentChange(activeNote.id, value)}
              onBlur={() => editor.commitTitle(activeNote.id)}
              onLeaveFirstLine={(content) => editor.commitTitle(activeNote.id, content)}
              theme={theme}
              placeholder={t('settings.notesPlaceholder', { defaultValue: 'Start writing in Markdown...' })}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
      <DeleteConfirmModal
        visible={clearModalVisible}
        title={t('common.confirmDelete', { defaultValue: 'Confirm Delete' })}
        description={t('settings.notesClearConfirm', { defaultValue: 'Are you sure you want to clear the note?' })}
        okText={t('settings.notesClear', { defaultValue: 'Clear' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        onCancel={() => setClearModalVisible(false)}
        onConfirm={handleClearConfirm}
      />
      <DeleteConfirmModal
        visible={deleteTarget !== null}
        title={
          deleteTarget?.type === 'notebook'
            ? t('settings.notesDeleteNotebook', { defaultValue: 'Delete Notebook' })
            : t('settings.notesDeleteNote', { defaultValue: 'Delete Note' })
        }
        description={
          deleteTarget?.type === 'notebook'
            ? t('settings.notesDeleteNotebookConfirm', {
                defaultValue: 'Are you sure you want to delete this notebook and all its notes?',
              })
            : t('settings.notesDeleteNoteConfirm', { defaultValue: 'Are you sure you want to delete this note?' })
        }
        okText={t('common.delete', { defaultValue: 'Delete' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

export default NotesPage;
