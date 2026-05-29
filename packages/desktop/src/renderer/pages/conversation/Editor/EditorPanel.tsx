/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Message, Modal, Spin } from '@arco-design/web-react';
import type * as monaco from 'monaco-editor';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from './EditorContext';
import EditorStatusBar from './EditorStatusBar';
import EditorTabs from './EditorTabs';
import MonacoEditor, { type MonacoEditorHandle } from './MonacoEditor';
import { useLspBridge } from './useLspBridge';
import './editor.css';

const INITIAL_CURSOR = { line: 1, col: 1 };

const EditorPanel: React.FC = () => {
  const { t } = useTranslation();
  const [messageApi, messageContextHolder] = Message.useMessage();
  const [wordWrap, setWordWrap] = useState(true);
  const [cursor, setCursor] = useState(INITIAL_CURSOR);
  const editor = useEditorContext();
  const monacoRef = useRef<MonacoEditorHandle | null>(null);

  useLspBridge(editor.activeBuffer);

  useEffect(() => {
    if (!editor.notice) return;
    messageApi[editor.notice.kind](t(editor.notice.key, editor.notice.values));
    editor.clearNotice(editor.notice.id);
  }, [editor, messageApi, t]);

  // Reset cursor display when switching files so stale values don't linger.
  useEffect(() => {
    setCursor(INITIAL_CURSOR);
  }, [editor.activeKey]);

  const handleCursorChange = useCallback((line: number, column: number) => {
    setCursor((prev) => (prev.line === line && prev.col === column ? prev : { line, col: column }));
  }, []);

  const handleContentChange = useCallback(
    (next: string) => {
      editor.setEditorContent(next);
    },
    [editor]
  );

  const handleViewStateChange = useCallback(
    (key: string, viewState: monaco.editor.ICodeEditorViewState | null) => {
      editor.setBufferViewState(key, viewState);
    },
    [editor]
  );

  const handleSave = useCallback(() => {
    void editor.saveEditorFile();
  }, [editor]);

  const handleOpenFind = useCallback(() => {
    monacoRef.current?.openFind();
  }, []);

  if (!editor.isOpen || editor.isCollapsed) return null;

  const active = editor.activeBuffer;
  const showLoading = active?.loading ?? false;
  const showDiskAlert = active?.diskChanged ?? false;

  return (
    <div className='editor-panel'>
      {messageContextHolder}
      <EditorTabs />
      {showDiskAlert && (
        <Alert className='editor-panel__alert' type='warning' content={t('conversation.editor.fileChangedOnDisk')} />
      )}
      <div className='editor-panel__body'>
        {showLoading ? (
          <div className='editor-panel__loading'>
            <Spin />
            <span>{t('common.loading')}</span>
          </div>
        ) : (
          <MonacoEditor
            ref={monacoRef}
            activeBuffer={active}
            onContentChange={handleContentChange}
            onViewStateChange={handleViewStateChange}
            onSave={handleSave}
            wordWrap={wordWrap}
            onCursorChange={handleCursorChange}
          />
        )}
      </div>
      <EditorStatusBar
        language={active?.language ?? 'plaintext'}
        cursorLine={cursor.line}
        cursorColumn={cursor.col}
        wordWrap={wordWrap}
        onToggleWordWrap={() => setWordWrap((prev) => !prev)}
        onFind={handleOpenFind}
      />
      <Modal
        visible={Boolean(editor.pendingAction)}
        title={t('conversation.editor.unsavedTitle')}
        okText={t('conversation.editor.saveAndContinue')}
        cancelText={t('common.cancel')}
        onOk={() => void editor.confirmPendingActionWithSave()}
        onCancel={editor.cancelPendingAction}
        footer={(cancelButton, okButton) => (
          <div className='editor-panel__modal-footer'>
            {cancelButton}
            <Button onClick={() => void editor.discardPendingAction()}>
              {t('conversation.editor.discardChanges')}
            </Button>
            {okButton}
          </div>
        )}
      >
        {t('conversation.editor.unsavedMessage')}
      </Modal>
    </div>
  );
};

export default EditorPanel;
