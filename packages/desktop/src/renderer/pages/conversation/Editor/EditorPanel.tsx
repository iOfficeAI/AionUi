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
import EditorBreadcrumb from './EditorBreadcrumb';
import EditorOutline from './EditorOutline';
import EditorStatusBar from './EditorStatusBar';
import EditorTabs from './EditorTabs';
import EditorToolbar from './EditorToolbar';
import MonacoEditor, { type MonacoEditorHandle, type MonacoSelectionInfo } from './MonacoEditor';
import { useLspBridge } from './useLspBridge';
import './editor.css';

const INITIAL_CURSOR = { line: 1, col: 1 };
const INITIAL_SELECTION: MonacoSelectionInfo = { selectedChars: 0, selectedLines: 0 };

const EditorPanel: React.FC = () => {
  const { t } = useTranslation();
  const [messageApi, messageContextHolder] = Message.useMessage();
  const [wordWrap, setWordWrap] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [renderWhitespace, setRenderWhitespace] = useState(false);
  const [cursor, setCursor] = useState(INITIAL_CURSOR);
  const [selectionInfo, setSelectionInfo] = useState<MonacoSelectionInfo>(INITIAL_SELECTION);
  const [indent, setIndent] = useState<{ useSpaces: boolean; size: number }>({ useSpaces: true, size: 2 });
  const [eol, setEol] = useState<'LF' | 'CRLF'>('LF');
  const [outlineVisible, setOutlineVisible] = useState(true);
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
    setSelectionInfo(INITIAL_SELECTION);
  }, [editor.activeKey]);

  const handleSelectionChange = useCallback((info: MonacoSelectionInfo) => {
    setSelectionInfo(info);
  }, []);

  const handleChangeLanguage = useCallback((languageId: string) => {
    monacoRef.current?.setLanguage(languageId);
  }, []);

  const handleChangeIndent = useCallback((useSpaces: boolean, size: number) => {
    monacoRef.current?.setIndent(useSpaces, size);
    setIndent({ useSpaces, size });
  }, []);

  const handleChangeEol = useCallback((next: 'LF' | 'CRLF') => {
    monacoRef.current?.setEol(next);
    setEol(next);
  }, []);

  const handleZoomIn = useCallback(() => monacoRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => monacoRef.current?.zoomOut(), []);
  const handleResetZoom = useCallback(() => monacoRef.current?.resetZoom(), []);
  const handleGoToSymbol = useCallback(() => monacoRef.current?.goToSymbol(), []);

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

  if (!editor.isOpen || editor.isCollapsed) return null;

  const active = editor.activeBuffer;
  const showLoading = active?.loading ?? false;
  const showDiskAlert = active?.diskChanged ?? false;

  return (
    <div className='editor-panel'>
      {messageContextHolder}
      <EditorBreadcrumb activeBuffer={active} />
      <EditorTabs />
      <EditorToolbar
        saving={active?.saving ?? false}
        wordWrap={wordWrap}
        showMinimap={showMinimap}
        renderWhitespace={renderWhitespace}
        outlineVisible={outlineVisible}
        onNew={editor.openUntitledEditor}
        onOpen={() => void editor.chooseAndOpenFile()}
        onSave={handleSave}
        onSaveAs={() => void editor.saveEditorFileAs()}
        onUndo={() => monacoRef.current?.undo()}
        onRedo={() => monacoRef.current?.redo()}
        onFind={() => monacoRef.current?.openFind()}
        onReplace={() => monacoRef.current?.openReplace()}
        onGoToLine={() => monacoRef.current?.goToLine()}
        onToggleComment={() => monacoRef.current?.toggleLineComment()}
        onFormatDocument={() => monacoRef.current?.formatDocument()}
        onToggleWordWrap={() => setWordWrap((prev) => !prev)}
        onToggleMinimap={() => setShowMinimap((prev) => !prev)}
        onToggleWhitespace={() => setRenderWhitespace((prev) => !prev)}
        onToggleOutline={() => setOutlineVisible((prev) => !prev)}
        onCollapse={editor.collapseEditor}
        onClose={editor.requestCloseEditor}
      />
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
          <div className='editor-panel__split'>
            {outlineVisible && (
              <EditorOutline
                activeBuffer={active}
                onSelectSymbol={(s) => monacoRef.current?.revealLine(s.line)}
              />
            )}
            <div className='editor-panel__editor'>
              <MonacoEditor
                ref={monacoRef}
                activeBuffer={active}
                onContentChange={handleContentChange}
                onViewStateChange={handleViewStateChange}
                onSave={handleSave}
                wordWrap={wordWrap}
                showMinimap={showMinimap}
                renderWhitespace={renderWhitespace}
                onCursorChange={handleCursorChange}
                onSelectionChange={handleSelectionChange}
              />
            </div>
          </div>
        )}
      </div>
      <EditorStatusBar
        language={active?.language ?? 'plaintext'}
        cursorLine={cursor.line}
        cursorColumn={cursor.col}
        totalChars={active?.content.length ?? 0}
        selectedChars={selectionInfo.selectedChars}
        selectedLines={selectionInfo.selectedLines}
        indentSize={indent.size}
        indentUsesSpaces={indent.useSpaces}
        eol={eol}
        encoding='UTF-8'
        dirty={editor.isDirty}
        onGoToSymbol={handleGoToSymbol}
        onChangeLanguage={handleChangeLanguage}
        onChangeIndent={handleChangeIndent}
        onChangeEol={handleChangeEol}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
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
