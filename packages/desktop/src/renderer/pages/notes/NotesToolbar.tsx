/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { ArrowLeft, Download, Delete } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type NotesToolbarProps = {
  noteTitle?: string;
  hasActiveNote?: boolean;
  onBack: () => void;
  onExport: () => void;
  onClear: () => void;
};

const NotesToolbar: React.FC<NotesToolbarProps> = ({ noteTitle, hasActiveNote, onBack, onExport, onClear }) => {
  const { t } = useTranslation();

  return (
    <div className='sticky top-0 z-10 flex h-48px flex-shrink-0 items-center gap-12px border-b border-border-2 bg-bg-0 px-18px'>
      <Button
        type='text'
        icon={<ArrowLeft size={16} />}
        onClick={onBack}
        className='!flex !items-center !gap-4px !rounded-8px !px-6px !text-t-primary'
      >
        {t('common.back', { defaultValue: 'Back' })}
      </Button>
      <div className='truncate text-14px font-600 text-t-primary'>{noteTitle ?? t('settings.notes')}</div>
      <div className='ml-auto flex items-center gap-8px'>
        <Button icon={<Download size={16} />} onClick={onExport} disabled={!hasActiveNote} className='!rounded-8px'>
          {t('settings.notesExport', { defaultValue: 'Export' })}
        </Button>
        <Button
          status='danger'
          icon={<Delete size={16} />}
          onClick={onClear}
          disabled={!hasActiveNote}
          className='!rounded-8px'
          style={{ backgroundColor: 'rgb(var(--danger-1))' }}
        >
          {t('settings.notesClear', { defaultValue: 'Clear' })}
        </Button>
      </div>
    </div>
  );
};

export default NotesToolbar;
