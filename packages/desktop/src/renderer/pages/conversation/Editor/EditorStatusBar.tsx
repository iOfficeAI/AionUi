/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * VS Code-style bottom status bar. Houses status info that used to crowd
 * the old top toolbar: language label, cursor position, word-wrap toggle,
 * find shortcut. The top of the editor pane is now just tabs + pane-level
 * actions, leaving the body clean.
 */

import { Tooltip } from '@arco-design/web-react';
import { Search, TextWrapOverflow } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDisplayName } from './editorLanguage';

type Props = {
  language: string;
  cursorLine: number;
  cursorColumn: number;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  onFind: () => void;
};

const SEGMENT =
  'inline-flex items-center gap-4px h-22px px-8px text-11px font-medium text-t-secondary tabular-nums';

const BUTTON =
  'inline-flex items-center gap-4px h-22px px-8px text-11px font-medium text-t-secondary hover:bg-bg-3 hover:text-t-primary transition-colors duration-100 cursor-pointer select-none';

const BUTTON_ACTIVE =
  'inline-flex items-center gap-4px h-22px px-8px text-11px font-medium text-white bg-brand hover:bg-brand-hover transition-colors duration-100 cursor-pointer select-none';

const EditorStatusBar: React.FC<Props> = ({
  language,
  cursorLine,
  cursorColumn,
  wordWrap,
  onToggleWordWrap,
  onFind,
}) => {
  const { t } = useTranslation();
  const languageLabel = getLanguageDisplayName(language);

  return (
    <div className='flex items-center justify-between h-22px bg-bg-2 border-t border-b-1 flex-shrink-0 overflow-hidden'>
      <div className='flex items-center'>
        <span className={SEGMENT} aria-label={t('conversation.editor.languageLabel', { language: languageLabel })}>
          {languageLabel}
        </span>
      </div>
      <div className='flex items-center'>
        <span
          className={SEGMENT}
          aria-label={t('conversation.editor.cursorPosition', { line: cursorLine, col: cursorColumn })}
        >
          {t('conversation.editor.cursorPosition', { line: cursorLine, col: cursorColumn })}
        </span>
        <Tooltip
          content={wordWrap ? t('conversation.editor.disableWordWrap') : t('conversation.editor.enableWordWrap')}
          position='top'
          mini
        >
          <span
            role='button'
            tabIndex={0}
            aria-pressed={wordWrap}
            className={wordWrap ? BUTTON_ACTIVE : BUTTON}
            onClick={onToggleWordWrap}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleWordWrap();
              }
            }}
          >
            <TextWrapOverflow size={12} />
          </span>
        </Tooltip>
        <Tooltip content={t('conversation.editor.findInFile')} position='top' mini>
          <span
            role='button'
            tabIndex={0}
            aria-label={t('conversation.editor.findInFile')}
            className={BUTTON}
            onClick={onFind}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onFind();
              }
            }}
          >
            <Search size={12} />
          </span>
        </Tooltip>
      </div>
    </div>
  );
};

export default EditorStatusBar;
