/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tab strip for the terminal panel. Mirrors VSCode/Cursor: one tab per
 * session, click to focus, middle-click or × to close, double-click to rename,
 * `+` to spawn a new shell.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Tooltip } from '@arco-design/web-react';
import { Close, Down, Plus } from '@icon-park/react';
import classNames from 'classnames';

import type { TerminalSession } from './types';

type Props = {
  sessions: readonly TerminalSession[];
  activeId: string | null;
  onSelect: (client_id: string) => void;
  onClose: (client_id: string) => void;
  onRename: (client_id: string, title: string) => void;
  onAdd: () => void;
  onCollapsePanel: () => void;
};

const TerminalTabs: React.FC<Props> = ({ sessions, activeId, onSelect, onClose, onRename, onAdd, onCollapsePanel }) => {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const beginRename = useCallback((session: TerminalSession) => {
    setEditingId(session.client_id);
    setDraft(session.title);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId) {
      onRename(editingId, draft);
    }
    setEditingId(null);
    setDraft('');
  }, [editingId, draft, onRename]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setDraft('');
  }, []);

  return (
    <div
      className='shrink-0 flex items-center gap-2px h-32px px-8px bg-2 border-b border-solid border-b-base select-none'
      role='tablist'
      aria-label={t('terminal.tabsLabel')}
    >
      <div className='flex items-center gap-2px overflow-x-auto flex-1 min-w-0'>
        {sessions.map((session) => {
          const isActive = session.client_id === activeId;
          const tooltipText = buildTooltip(session, t);
          const isEditing = editingId === session.client_id;
          return (
            <Tooltip key={session.client_id} content={tooltipText} position='top' mini>
              <div
                role='tab'
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={classNames(
                  'group h-26px flex items-center gap-6px pl-10px pr-6px rd-6px shrink-0 cursor-pointer text-12px transition-colors',
                  {
                    'bg-1 text-t-primary': isActive,
                    'text-t-secondary hover:bg-fill-2 hover:text-t-primary': !isActive,
                    'opacity-60': session.exited,
                  }
                )}
                onClick={() => onSelect(session.client_id)}
                onDoubleClick={() => beginRename(session)}
                onMouseDown={(e) => {
                  // Middle-click closes the tab — matches browser/VSCode convention.
                  if (e.button === 1) {
                    e.preventDefault();
                    onClose(session.client_id);
                  }
                }}
              >
                {isEditing ? (
                  <Input
                    size='mini'
                    autoFocus
                    value={draft}
                    onChange={setDraft}
                    onBlur={commitRename}
                    onPressEnter={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelRename();
                    }}
                    style={{ width: 100, height: 20 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className='max-w-160px truncate'>{session.title}</span>
                )}
                <button
                  type='button'
                  className='flex-center size-16px bg-transparent border-none p-0 m-0 cursor-pointer rd-4px text-t-tertiary hover:bg-fill-3 hover:text-t-primary opacity-0 group-hover:opacity-100 transition-all'
                  aria-label={t('terminal.close')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(session.client_id);
                  }}
                >
                  <Close theme='outline' size='10' fill='currentColor' style={{ lineHeight: 0 }} />
                </button>
              </div>
            </Tooltip>
          );
        })}
      </div>

      <div className='flex items-center gap-2px shrink-0 pl-4px pr-4px'>
        <Tooltip content={t('terminal.new')} position='top' mini>
          <button
            type='button'
            className='flex-center size-22px bg-transparent border-none p-0 m-0 cursor-pointer rd-4px text-t-secondary hover:bg-fill-3 hover:text-t-primary transition-colors'
            aria-label={t('terminal.new')}
            onClick={onAdd}
          >
            <Plus theme='outline' size='14' fill='currentColor' style={{ lineHeight: 0 }} />
          </button>
        </Tooltip>
        <Tooltip content={t('terminal.collapse')} position='top' mini>
          <button
            type='button'
            className='flex-center size-22px bg-transparent border-none p-0 m-0 cursor-pointer rd-4px text-t-secondary hover:bg-fill-3 hover:text-t-primary transition-colors'
            aria-label={t('terminal.collapse')}
            onClick={onCollapsePanel}
          >
            <Down theme='outline' size='14' fill='currentColor' style={{ lineHeight: 0 }} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

function buildTooltip(session: TerminalSession, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (session.exited) {
    return session.exit_code === null
      ? t('terminal.exitedUnknown', { title: session.title })
      : t('terminal.exitedWithCode', { title: session.title, code: session.exit_code });
  }
  if (session.cwd) {
    return `${session.title} — ${session.cwd}`;
  }
  return session.title;
}

export default TerminalTabs;
