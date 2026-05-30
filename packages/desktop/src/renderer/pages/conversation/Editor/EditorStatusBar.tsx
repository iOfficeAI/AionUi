/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * VS Code / Notepad++-style status bar. Clickable segments for:
 *   - Go to Symbol (document outline)
 *   - Language picker
 *   - Indent type / size
 *   - End-of-line (LF / CRLF)
 *   - Encoding (placeholder — switching is not wired)
 *   - Zoom controls
 * Plain read-only segments for cursor position, selection info, char count.
 *
 * All styling lives in editor.css under `.editor-statusbar*` with explicit
 * hex colors — semantic tokens were producing unreadable results across the
 * various Chisl color-scheme combinations.
 */

import { Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDisplayName } from './editorLanguage';

type Props = {
  language: string;
  cursorLine: number;
  cursorColumn: number;
  totalChars: number;
  selectedChars: number;
  selectedLines: number;
  indentSize: number;
  indentUsesSpaces: boolean;
  eol: 'LF' | 'CRLF';
  encoding: string;
  dirty: boolean;
  onGoToSymbol: () => void;
  onChangeLanguage: (languageId: string) => void;
  onChangeIndent: (useSpaces: boolean, size: number) => void;
  onChangeEol: (eol: 'LF' | 'CRLF') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

const LANGUAGE_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'less', label: 'Less' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
  { id: 'csharp', label: 'C#' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
  { id: 'lua', label: 'Lua' },
  { id: 'shell', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
];

const INDENT_CHOICES: Array<{ useSpaces: boolean; size: number; label: string }> = [
  { useSpaces: true, size: 2, label: 'Spaces: 2' },
  { useSpaces: true, size: 4, label: 'Spaces: 4' },
  { useSpaces: true, size: 8, label: 'Spaces: 8' },
  { useSpaces: false, size: 2, label: 'Tabs: 2' },
  { useSpaces: false, size: 4, label: 'Tabs: 4' },
  { useSpaces: false, size: 8, label: 'Tabs: 8' },
];

const EditorStatusBar: React.FC<Props> = ({
  language,
  cursorLine,
  cursorColumn,
  totalChars,
  selectedChars,
  selectedLines,
  indentSize,
  indentUsesSpaces,
  eol,
  encoding,
  dirty,
  onGoToSymbol,
  onChangeLanguage,
  onChangeIndent,
  onChangeEol,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const { t } = useTranslation();
  const languageLabel = getLanguageDisplayName(language);
  const indentLabel = indentUsesSpaces
    ? t('conversation.editor.indentSpaces', { count: indentSize })
    : t('conversation.editor.indentTabsN', { count: indentSize });

  const languageMenu = useMemo(
    () => (
      <Menu className='editor-status-menu'>
        {LANGUAGE_CHOICES.map((c) => (
          <Menu.Item key={c.id} onClick={() => onChangeLanguage(c.id)}>
            <span className='editor-menu-row'>
              <span className='editor-menu-row__label'>
                <span className='editor-menu-row__check' aria-hidden>
                  {c.id === language ? '✓' : ''}
                </span>
                {c.label}
              </span>
              <span className='editor-menu-row__kbd'>{c.id}</span>
            </span>
          </Menu.Item>
        ))}
      </Menu>
    ),
    [language, onChangeLanguage]
  );

  const indentMenu = useMemo(
    () => (
      <Menu className='editor-status-menu'>
        {INDENT_CHOICES.map((c) => {
          const isActive = c.useSpaces === indentUsesSpaces && c.size === indentSize;
          return (
            <Menu.Item key={`${c.useSpaces ? 's' : 't'}${c.size}`} onClick={() => onChangeIndent(c.useSpaces, c.size)}>
              <span className='editor-menu-row'>
                <span className='editor-menu-row__label'>
                  <span className='editor-menu-row__check' aria-hidden>
                    {isActive ? '✓' : ''}
                  </span>
                  {c.label}
                </span>
              </span>
            </Menu.Item>
          );
        })}
      </Menu>
    ),
    [indentUsesSpaces, indentSize, onChangeIndent]
  );

  const eolMenu = useMemo(
    () => (
      <Menu className='editor-status-menu'>
        {(['LF', 'CRLF'] as const).map((opt) => (
          <Menu.Item key={opt} onClick={() => onChangeEol(opt)}>
            <span className='editor-menu-row'>
              <span className='editor-menu-row__label'>
                <span className='editor-menu-row__check' aria-hidden>
                  {opt === eol ? '✓' : ''}
                </span>
                {opt}
              </span>
            </span>
          </Menu.Item>
        ))}
      </Menu>
    ),
    [eol, onChangeEol]
  );

  return (
    <div className='editor-statusbar' role='status'>
      <div className='editor-statusbar__group'>
        <Tooltip content={t('conversation.editor.goToSymbol')} mini position='top'>
          <button type='button' className='editor-statusbar__seg' onClick={onGoToSymbol}>
            <span className='editor-statusbar__seg-icon' aria-hidden>
              {'{ }'}
            </span>
            {t('conversation.editor.symbolJump')}
          </button>
        </Tooltip>
        {dirty && (
          <span className='editor-statusbar__seg editor-statusbar__seg--dirty' aria-label={t('conversation.editor.unsavedDot')}>
            <span className='editor-statusbar__dirty-dot' />
            {t('conversation.editor.modified')}
          </span>
        )}
      </div>

      <div className='editor-statusbar__group'>
        <span className='editor-statusbar__seg editor-statusbar__seg--readonly'>
          {t('conversation.editor.cursorPosition', { line: cursorLine, col: cursorColumn })}
        </span>
        {selectedChars > 0 && (
          <span className='editor-statusbar__seg editor-statusbar__seg--readonly'>
            {t('conversation.editor.selectionInfo', { chars: selectedChars, lines: selectedLines })}
          </span>
        )}
        <span className='editor-statusbar__seg editor-statusbar__seg--readonly'>
          {t('conversation.editor.totalChars', { count: totalChars })}
        </span>

        <Dropdown droplist={indentMenu} trigger='click' position='tr'>
          <button type='button' className='editor-statusbar__seg' aria-label={indentLabel}>
            {indentLabel}
          </button>
        </Dropdown>
        <Dropdown droplist={eolMenu} trigger='click' position='tr'>
          <button type='button' className='editor-statusbar__seg' aria-label={eol}>
            {eol}
          </button>
        </Dropdown>
        <Tooltip content={t('conversation.editor.encodingTooltip')} mini position='top'>
          <span className='editor-statusbar__seg editor-statusbar__seg--readonly'>{encoding}</span>
        </Tooltip>
        <Dropdown droplist={languageMenu} trigger='click' position='tr'>
          <button type='button' className='editor-statusbar__seg' aria-label={languageLabel}>
            {languageLabel}
          </button>
        </Dropdown>

        <span className='editor-statusbar__divider' aria-hidden />

        <Tooltip content={t('conversation.editor.zoomOut')} mini position='top'>
          <button type='button' className='editor-statusbar__seg editor-statusbar__seg--icon' onClick={onZoomOut}>
            −
          </button>
        </Tooltip>
        <Tooltip content={t('conversation.editor.resetZoom')} mini position='top'>
          <button type='button' className='editor-statusbar__seg editor-statusbar__seg--icon' onClick={onResetZoom}>
            ⌖
          </button>
        </Tooltip>
        <Tooltip content={t('conversation.editor.zoomIn')} mini position='top'>
          <button type='button' className='editor-statusbar__seg editor-statusbar__seg--icon' onClick={onZoomIn}>
            +
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default EditorStatusBar;
