/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * A single split-editor group (pane). Owns its OWN Monaco instance, tab strip,
 * git-gutter decorations, and LSP attachment — all scoped to this group's
 * active buffer (drawn from the shared buffer pool in EditorContext). Multiple
 * groups render side-by-side in EditorPanel; the focused group drives the
 * panel-level toolbar / status bar.
 */

import type * as monaco from '@aionui/editor-monaco';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Close } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

import { useEditorContext } from './EditorContext';
import EditorTabs from './EditorTabs';
import MonacoEditorGate, { type MonacoEditorHandle, type MonacoSelectionInfo } from './MonacoEditorGate';
import type { EditorUserSettings } from './editorSettings';
import { useEditorGitDecorations } from './useEditorGitDecorations';
import { useLspBridge, type LspBridgeStatus } from './useLspBridge';

type Props = {
  groupId: string;
  isFocused: boolean;
  /** Whether more than one group is open (controls the close-group affordance). */
  showClose: boolean;
  expertMode: boolean;
  wordWrap: boolean;
  showMinimap: boolean;
  renderWhitespace: boolean;
  editorSettings: Pick<EditorUserSettings, 'fontSize' | 'fontFamily' | 'tabSize' | 'insertSpaces'>;
  /** Register/unregister this group's imperative editor handle with the panel. */
  onRegisterHandle: (groupId: string, handle: MonacoEditorHandle | null) => void;
  /** Cursor / selection reporting — panel ignores updates from blurred groups. */
  onCursorChange: (line: number, column: number) => void;
  onSelectionChange: (info: MonacoSelectionInfo) => void;
  /** LSP status for the focused group (panel renders the install banner). */
  onLspStatus: (status: LspBridgeStatus) => void;
  onSave: () => void;
};

const EditorGroupView: React.FC<Props> = ({
  groupId,
  isFocused,
  showClose,
  expertMode,
  wordWrap,
  showMinimap,
  renderWhitespace,
  editorSettings,
  onRegisterHandle,
  onCursorChange,
  onSelectionChange,
  onLspStatus,
  onSave,
}) => {
  const { t } = useTranslation();
  const editor = useEditorContext();
  const monacoRef = useRef<MonacoEditorHandle | null>(null);
  const [monacoEditor, setMonacoEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  const group = editor.groups.find((g) => g.id === groupId) ?? null;
  const activeBuffer = group?.activeKey ? (editor.buffers.find((b) => b.key === group.activeKey) ?? null) : null;
  const activeKey = group?.activeKey ?? null;

  // Per-group git gutter + LSP, scoped to THIS pane's active buffer.
  useEditorGitDecorations({ activeBuffer, editor: monacoEditor });
  useLspBridge(activeBuffer, isFocused ? onLspStatus : undefined);

  // Mirror the live Monaco instance into state so the git-decorations hook
  // re-runs when this pane mounts/unmounts or swaps models.
  const captureEditor = useCallback(() => {
    setMonacoEditor(monacoRef.current?.getEditor() ?? null);
  }, []);
  useEffect(() => {
    captureEditor();
    onRegisterHandle(groupId, monacoRef.current);
    return () => onRegisterHandle(groupId, null);
  }, [captureEditor, groupId, onRegisterHandle, activeKey]);

  const handleContentChange = useCallback(
    (next: string) => {
      if (activeKey) editor.setBufferContentByKey(activeKey, next);
    },
    [editor, activeKey]
  );

  // Phase 2: invoked by MonacoEditor when an `fileStream.contentUpdate`
  // lands for this pane's active buffer. Reconciles EditorContext state so
  // the dirty flag clears and the buffer reflects what's on disk.
  const handleApplyExternalContent = useCallback(
    (key: string, content: string) => {
      editor.applyExternalContent(key, content);
    },
    [editor]
  );

  const handleViewStateChange = useCallback(
    (key: string, viewState: monaco.editor.ICodeEditorViewState | null) => {
      editor.setBufferViewState(key, viewState);
    },
    [editor]
  );

  const handleCursorChange = useCallback(
    (line: number, column: number) => {
      if (isFocused) onCursorChange(line, column);
    },
    [isFocused, onCursorChange]
  );

  const handleSelectionChange = useCallback(
    (info: MonacoSelectionInfo) => {
      if (isFocused) onSelectionChange(info);
    },
    [isFocused, onSelectionChange]
  );

  const focusThisGroup = useCallback(() => {
    if (!isFocused) editor.focusGroup(groupId);
  }, [editor, groupId, isFocused]);

  if (!group || !activeBuffer) {
    return <div className='editor-group editor-group--empty' aria-hidden />;
  }

  return (
    <div
      className={classNames('editor-group', isFocused && 'editor-group--focused')}
      onMouseDownCapture={focusThisGroup}
      data-group-id={groupId}
    >
      <div className='editor-group__tabbar'>
        <div className='editor-group__tabs'>
          <EditorTabs expertMode={expertMode} groupId={groupId} isFocused={isFocused} />
        </div>
        {showClose && (
          <button
            type='button'
            className='editor-group__close'
            onClick={() => editor.closeGroup(groupId)}
            aria-label={t('conversation.editor.closeSplit')}
            title={t('conversation.editor.closeSplit')}
          >
            <Close size={14} strokeWidth={3} />
          </button>
        )}
      </div>
      <div className='editor-group__editor'>
        <MonacoEditorGate
          ref={monacoRef}
          activeBuffer={activeBuffer}
          onContentChange={handleContentChange}
          onViewStateChange={handleViewStateChange}
          onSave={onSave}
          wordWrap={wordWrap}
          showMinimap={showMinimap}
          renderWhitespace={renderWhitespace}
          editorSettings={editorSettings}
          onCursorChange={handleCursorChange}
          onSelectionChange={handleSelectionChange}
          onApplyExternalContent={handleApplyExternalContent}
        />
      </div>
    </div>
  );
};

export default EditorGroupView;
