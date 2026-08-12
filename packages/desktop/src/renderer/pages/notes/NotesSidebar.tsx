/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NotebookItem from './NotebookItem';
import type { NoteItem, Notebook } from './types';
import styles from './NotesSidebar.module.css';

type NotesSidebarProps = {
  notebooks: Notebook[];
  notes: NoteItem[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNotebook: (name: string) => Promise<Notebook> | Notebook;
  onRenameNotebook: (id: string, name: string) => Promise<void> | void;
  onDeleteNotebook: (id: string) => Promise<void> | void;
  onCreateNote: (notebookId: string, title: string) => Promise<NoteItem> | NoteItem;
  onRenameNote: (id: string, title: string) => Promise<void> | void;
  onDeleteNote: (id: string) => Promise<void> | void;
};

const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notebooks,
  notes,
  activeNoteId,
  onSelectNote,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onCreateNote,
  onRenameNote,
  onDeleteNote,
}) => {
  const { t } = useTranslation();
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [draftNotebookName, setDraftNotebookName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (creatingNotebook) inputRef.current?.focus();
  }, [creatingNotebook]);

  const startCreatingNotebook = useCallback(() => {
    setCreatingNotebook(true);
    setDraftNotebookName('');
  }, []);

  const commitNotebook = () => {
    const trimmed = draftNotebookName.trim();
    setCreatingNotebook(false);
    setDraftNotebookName('');
    if (!trimmed) return;
    void onCreateNotebook(trimmed);
  };

  const cancelNotebook = () => {
    setCreatingNotebook(false);
    setDraftNotebookName('');
  };

  const handleCreateNote = useCallback(
    (notebookId: string, title: string) => {
      const result = onCreateNote(notebookId, title);
      if (result instanceof Promise) {
        void result.then((note) => onSelectNote(note.id));
      } else {
        onSelectNote(result.id);
      }
    },
    [onCreateNote, onSelectNote]
  );

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className='text-14px font-600 text-t-primary'>
          {t('settings.notesSidebarTitle', { defaultValue: 'Notebooks' })}
        </span>
        <Button
          type='text'
          icon={<Plus size={16} />}
          onClick={startCreatingNotebook}
          className='!flex !h-28px !w-28px !items-center !justify-center !rounded-6px !p-0'
          aria-label={t('settings.notesCreateNotebook', { defaultValue: 'New Notebook' })}
        />
      </div>
      <div className={styles.sidebarList}>
        {notebooks.length === 0 && !creatingNotebook ? (
          <div className={styles.empty}>
            <Empty description={t('settings.notesNoNotebooks', { defaultValue: 'No notebooks yet' })} />
            <div className='mt-8px text-12px text-t-secondary'>
              {t('settings.notesNoNotebooksHint', {
                defaultValue: 'Create your first notebook to organize your notes.',
              })}
            </div>
            <Button type='primary' size='small' className='!mt-12px !rounded-8px' onClick={startCreatingNotebook}>
              {t('settings.notesCreateNotebook', { defaultValue: 'New Notebook' })}
            </Button>
          </div>
        ) : (
          <div className='flex flex-col gap-8px'>
            {creatingNotebook && (
              <div className={styles.createInput}>
                <input
                  ref={inputRef}
                  value={draftNotebookName}
                  onChange={(e) => setDraftNotebookName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNotebook();
                    else if (e.key === 'Escape') cancelNotebook();
                  }}
                  onBlur={commitNotebook}
                  placeholder={t('settings.notesNotebookPlaceholder', { defaultValue: 'Notebook name' })}
                  className={styles.input}
                />
              </div>
            )}
            {notebooks.map((notebook) => (
              <NotebookItem
                key={notebook.id}
                notebook={notebook}
                notes={notes.filter((n) => n.notebookId === notebook.id)}
                activeNoteId={activeNoteId}
                onSelectNote={onSelectNote}
                onRenameNotebook={onRenameNotebook}
                onDeleteNotebook={onDeleteNotebook}
                onCreateNote={handleCreateNote}
                onRenameNote={onRenameNote}
                onDeleteNote={onDeleteNote}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default NotesSidebar;
