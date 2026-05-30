/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Text-first editor menubar. VS Code-style menu words (File / Edit / Find /
 * View) open Arco Dropdowns whose items are plain text + keyboard-shortcut
 * hint. Styling lives in `editor.css` under `.editor-menubar*` with explicit
 * hex colors keyed off `body[arco-theme='dark']` — semantic tokens were
 * routing through Chisl's brand orange in some theme combinations and
 * rendering as unreadable pale-orange-on-cream.
 */

import { Dropdown, Menu } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isMacEnvironment } from '@/renderer/pages/conversation/utils/detectPlatform';

type Props = {
  saving: boolean;
  wordWrap: boolean;
  showMinimap: boolean;
  renderWhitespace: boolean;
  outlineVisible: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onReplace: () => void;
  onGoToLine: () => void;
  onToggleComment: () => void;
  onFormatDocument: () => void;
  onToggleWordWrap: () => void;
  onToggleMinimap: () => void;
  onToggleWhitespace: () => void;
  onToggleOutline: () => void;
  onCollapse: () => void;
  onClose: () => void;
};

/** Render the keyboard accelerator hint string. */
function kbd(mac: string, other: string): string {
  return isMacEnvironment() ? mac : other;
}

type MenuRowProps = {
  label: string;
  shortcut?: string;
  checked?: boolean;
};

const MenuRow: React.FC<MenuRowProps> = ({ label, shortcut, checked }) => (
  <span className='editor-menu-row'>
    <span className='editor-menu-row__label'>
      <span className='editor-menu-row__check' aria-hidden>
        {checked ? '✓' : ''}
      </span>
      {label}
    </span>
    {shortcut && <span className='editor-menu-row__kbd'>{shortcut}</span>}
  </span>
);

const EditorToolbar: React.FC<Props> = ({
  saving: _saving,
  wordWrap,
  showMinimap,
  renderWhitespace,
  outlineVisible,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onFind,
  onReplace,
  onGoToLine,
  onToggleComment,
  onFormatDocument,
  onToggleWordWrap,
  onToggleMinimap,
  onToggleWhitespace,
  onToggleOutline,
  onCollapse,
  onClose,
}) => {
  const { t } = useTranslation();

  const fileMenu = useMemo(
    () => (
      <Menu>
        <Menu.Item key='new' onClick={onNew}>
          <MenuRow label={t('conversation.editor.newFile')} shortcut={kbd('⌘N', 'Ctrl+N')} />
        </Menu.Item>
        <Menu.Item key='open' onClick={onOpen}>
          <MenuRow label={t('conversation.editor.openFile')} shortcut={kbd('⌘O', 'Ctrl+O')} />
        </Menu.Item>
        <Menu.Item key='save' onClick={onSave}>
          <MenuRow label={t('common.save')} shortcut={kbd('⌘S', 'Ctrl+S')} />
        </Menu.Item>
        <Menu.Item key='saveAs' onClick={onSaveAs}>
          <MenuRow label={t('conversation.editor.saveAs')} shortcut={kbd('⌘⇧S', 'Ctrl+Shift+S')} />
        </Menu.Item>
      </Menu>
    ),
    [onNew, onOpen, onSave, onSaveAs, t]
  );

  const editMenu = useMemo(
    () => (
      <Menu>
        <Menu.Item key='undo' onClick={onUndo}>
          <MenuRow label={t('conversation.editor.undo')} shortcut={kbd('⌘Z', 'Ctrl+Z')} />
        </Menu.Item>
        <Menu.Item key='redo' onClick={onRedo}>
          <MenuRow label={t('conversation.editor.redo')} shortcut={kbd('⌘⇧Z', 'Ctrl+Shift+Z')} />
        </Menu.Item>
        <Menu.Item key='comment' onClick={onToggleComment}>
          <MenuRow label={t('conversation.editor.toggleComment')} shortcut={kbd('⌘/', 'Ctrl+/')} />
        </Menu.Item>
        <Menu.Item key='format' onClick={onFormatDocument}>
          <MenuRow label={t('conversation.editor.formatDocument')} shortcut={kbd('⇧⌥F', 'Shift+Alt+F')} />
        </Menu.Item>
      </Menu>
    ),
    [onUndo, onRedo, onToggleComment, onFormatDocument, t]
  );

  const findMenu = useMemo(
    () => (
      <Menu>
        <Menu.Item key='find' onClick={onFind}>
          <MenuRow label={t('conversation.editor.findInFile')} shortcut={kbd('⌘F', 'Ctrl+F')} />
        </Menu.Item>
        <Menu.Item key='replace' onClick={onReplace}>
          <MenuRow label={t('conversation.editor.replace')} shortcut={kbd('⌘⌥F', 'Ctrl+H')} />
        </Menu.Item>
        <Menu.Item key='goto' onClick={onGoToLine}>
          <MenuRow label={t('conversation.editor.goToLine')} shortcut={kbd('⌃G', 'Ctrl+G')} />
        </Menu.Item>
      </Menu>
    ),
    [onFind, onReplace, onGoToLine, t]
  );

  const viewMenu = useMemo(
    () => (
      <Menu>
        <Menu.Item key='outline' onClick={onToggleOutline}>
          <MenuRow label={t('conversation.editor.outlineToggle')} checked={outlineVisible} />
        </Menu.Item>
        <Menu.Item key='wrap' onClick={onToggleWordWrap}>
          <MenuRow label={t('conversation.editor.wordWrap')} shortcut={kbd('⌥Z', 'Alt+Z')} checked={wordWrap} />
        </Menu.Item>
        <Menu.Item key='minimap' onClick={onToggleMinimap}>
          <MenuRow label={t('conversation.editor.minimap')} checked={showMinimap} />
        </Menu.Item>
        <Menu.Item key='whitespace' onClick={onToggleWhitespace}>
          <MenuRow label={t('conversation.editor.whitespace')} checked={renderWhitespace} />
        </Menu.Item>
      </Menu>
    ),
    [onToggleOutline, onToggleWordWrap, onToggleMinimap, onToggleWhitespace, outlineVisible, wordWrap, showMinimap, renderWhitespace, t]
  );

  return (
    <div role='menubar' aria-label={t('conversation.editor.toolbarLabel')} className='editor-menubar'>
      <Dropdown droplist={fileMenu} trigger='click' position='bl'>
        <button type='button' className='editor-menubar__item' aria-haspopup='menu'>
          {t('conversation.editor.fileMenu')}
        </button>
      </Dropdown>
      <Dropdown droplist={editMenu} trigger='click' position='bl'>
        <button type='button' className='editor-menubar__item' aria-haspopup='menu'>
          {t('conversation.editor.editMenu')}
        </button>
      </Dropdown>
      <Dropdown droplist={findMenu} trigger='click' position='bl'>
        <button type='button' className='editor-menubar__item' aria-haspopup='menu'>
          {t('conversation.editor.findMenu')}
        </button>
      </Dropdown>
      <Dropdown droplist={viewMenu} trigger='click' position='bl'>
        <button type='button' className='editor-menubar__item' aria-haspopup='menu'>
          {t('conversation.editor.viewMenu')}
        </button>
      </Dropdown>

      <div className='editor-menubar__spacer' />

      <button
        type='button'
        className='editor-menubar__item editor-menubar__item--secondary'
        onClick={onCollapse}
      >
        {t('conversation.editor.collapseEditor')}
      </button>
      <button
        type='button'
        className='editor-menubar__item editor-menubar__item--secondary'
        onClick={onClose}
      >
        {t('common.close')}
      </button>
    </div>
  );
};

export default EditorToolbar;
