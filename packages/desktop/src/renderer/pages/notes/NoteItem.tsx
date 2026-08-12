/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dropdown, Input, Menu } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { FileText, MoreOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoteItem } from './types';
// 在 import 区域加：
import { Tooltip } from '@arco-design/web-react';
import { formatRelativeTime, formatAbsoluteTime } from '@renderer/utils/formatRelativeTime';

type NoteItemRowProps = {
  note: NoteItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

const NoteItemRow: React.FC<NoteItemRowProps> = ({ note, isActive, onSelect, onRename, onDelete }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(note.title);
  const inputRef = useRef<RefInputType | null>(null);

  useEffect(() => {
    setDraftTitle(note.title);
  }, [note.title]);

  useEffect(() => {
    if (isEditing) {
      const handle = window.setTimeout(() => {
        const dom = inputRef.current?.dom as HTMLInputElement | undefined;
        inputRef.current?.focus();
        dom?.select();
      }, 0);
      return () => window.clearTimeout(handle);
    }
  }, [isEditing]);

  const commit = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== note.title) {
      void onRename(note.id, trimmed);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setDraftTitle(note.title);
    setIsEditing(false);
  };

  const droplist = (
    <Menu
      className='notes-item-dropdown'
      onClickMenuItem={(key) => {
        if (key === 'rename') {
          setIsEditing(true);
        } else if (key === 'delete') {
          onDelete(note.id);
        }
      }}
    >
      <Menu.Item key='rename'>{t('settings.notesRename', { defaultValue: 'Rename' })}</Menu.Item>
      <Menu.Item key='delete'>{t('settings.notesDeleteNote', { defaultValue: 'Delete Note' })}</Menu.Item>
    </Menu>
  );
  // 在组件内部、return 之前加：
  const timeText = note.updatedAt ? formatRelativeTime(note.updatedAt) : '';
  const timeTip = note.updatedAt ? formatAbsoluteTime(note.updatedAt) : '';

  return (
    <div
      className={classNames(
        'group flex items-center gap-6px rounded-6px px-6px py-4px text-12px transition-colors cursor-pointer',
        isActive ? 'bg-fill-3 text-t-primary' : 'text-t-secondary hover:bg-fill-2'
      )}
      onClick={() => !isEditing && onSelect(note.id)}
    >
      {/* 左：图标 + 标题 + 更新时间（你上一轮加的） */}
      <div className='flex min-w-0 flex-1 items-center gap-6px'>
        <FileText size={14} theme='outline' fill='currentColor' className='flex-shrink-0' />
        {isEditing ? (
          <Input
            ref={inputRef}
            size='mini'
            value={draftTitle}
            onChange={setDraftTitle}
            onPressEnter={commit}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
            }}
            placeholder={t('settings.notesNotePlaceholder', { defaultValue: 'Note title' })}
            className='flex-1'
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className='flex-1 truncate'>{note.title}</span>
        )}
        {timeText && !isEditing && (
          <Tooltip content={timeTip}>
            <span className={classNames('flex-shrink-0 text-10px', isActive ? 'text-t-tertiary' : 'text-t-secondary')}>
              {timeText}
            </span>
          </Tooltip>
        )}
      </div>

      {/* 右：菜单按钮（hover 才显示） */}
      {!isEditing && (
        <Dropdown trigger='click' droplist={droplist} position='br'>
          <button
            type='button'
            className='flex h-18px w-18px flex-shrink-0 cursor-pointer items-center justify-center rounded-4px opacity-0 transition-opacity hover:bg-fill-3 group-hover:!opacity-100'
            onClick={(e) => e.stopPropagation()}
          >
            <MoreOne size={12} theme='outline' fill='currentColor' />
          </button>
        </Dropdown>
      )}
    </div>
  );
};

export default NoteItemRow;
