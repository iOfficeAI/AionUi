/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Message, Modal, Spin } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useEditorContext } from './EditorContext';
import EditorBreadcrumb from './EditorBreadcrumb';
import EditorGroupView from './EditorGroupView';
import EditorStatusBar from './EditorStatusBar';
import EditorToolbar from './EditorToolbar';
import EditorProblems from './EditorProblems';
import { type MonacoEditorHandle, type MonacoSelectionInfo } from './MonacoEditorGate';
import type { LspBridgeStatus } from './useLspBridge';
import { EDITOR_REVEAL_LINE_EVENT, isEditorRevealLineEvent, requestEditorRevealInTree } from './editorReveal';
import { readEditorSettings, writeEditorSettings, type EditorUserSettings } from './editorSettings';
import { useEditorTabsHydration } from './useEditorTabsHydration';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import './editor.css';

type EditorPanelProps = {
  /** Workspace root for tab restore (conversation routes). */
  workspaceRoot?: string;
};

const INITIAL_CURSOR = { line: 1, col: 1 };
const INITIAL_SELECTION: MonacoSelectionInfo = { selectedChars: 0, selectedLines: 0 };

// Per-workspace persistence key for the Expert-mode toggle. `workspaceId` is
// the route :id param (conversation_id in single chats, team_id in team mode),
// matching the existing `workspace-preference-${id}` convention from
// useWorkspaceCollapse. Falls back to '__global__' if no workspace is in scope.
const expertModeStorageKey = (workspaceId: string | undefined): string =>
  `chisl.editor.expert.${workspaceId ?? '__global__'}`;

const readPersistedExpertMode = (workspaceId: string | undefined): boolean => {
  try {
    return localStorage.getItem(expertModeStorageKey(workspaceId)) === 'true';
  } catch {
    return false;
  }
};

const EditorPanel: React.FC<EditorPanelProps> = ({ workspaceRoot }) => {
  const { t } = useTranslation();
  const { id: workspaceId } = useParams<{ id: string }>();
  useEditorTabsHydration({ workspaceRoot });
  const [messageApi, messageContextHolder] = Message.useMessage();
  // Phase 9: calm defaults. Word-wrap and minimap start off; the
  // user can toggle each individually via the existing toolbar controls, or
  // flip Expert mode to restore the prior IDE-chrome posture wholesale.
  const [expertMode, setExpertMode] = useState<boolean>(() => readPersistedExpertMode(workspaceId));
  const [wordWrap, setWordWrap] = useState(false);
  const [showMinimap, setShowMinimap] = useState<boolean>(() => readPersistedExpertMode(workspaceId));
  const [renderWhitespace, setRenderWhitespace] = useState(false);
  const [cursor, setCursor] = useState(INITIAL_CURSOR);
  const [selectionInfo, setSelectionInfo] = useState<MonacoSelectionInfo>(INITIAL_SELECTION);
  const [indent, setIndent] = useState<{ useSpaces: boolean; size: number }>({ useSpaces: true, size: 2 });
  const [eol, setEol] = useState<'LF' | 'CRLF'>('LF');
  // Editor user-settings (persisted per workspace). Seeded from localStorage
  // on mount and on workspace change. `formatOnSave` and the chrome flags
  // (minimap / word-wrap / whitespace) share the same Expert-mode
  // posture so toggling Expert flips them all to the persisted state.
  const [editorSettings, setEditorSettings] = useState<EditorUserSettings>(() => ({
    ...readEditorSettings(workspaceId),
    showMinimap: readPersistedExpertMode(workspaceId),
    wordWrap: readPersistedExpertMode(workspaceId),
    renderWhitespace: false,
    formatOnSave: false,
  }));
  const editor = useEditorContext();
  // Registry of each split group's imperative Monaco handle. Toolbar / status
  // bar / problems act on the FOCUSED group's handle.
  const groupHandles = useRef<Map<string, MonacoEditorHandle>>(new Map());
  const registerHandle = useCallback((groupId: string, handle: MonacoEditorHandle | null) => {
    if (handle) groupHandles.current.set(groupId, handle);
    else groupHandles.current.delete(groupId);
  }, []);
  const focusedHandle = useCallback(
    (): MonacoEditorHandle | null => groupHandles.current.get(editor.activeGroupId) ?? null,
    [editor.activeGroupId]
  );
  const [lspStatus, setLspStatus] = useState<LspBridgeStatus>({ state: 'idle' });
  const { splitRatio, createDragHandle } = useResizableSplit({
    unit: 'ratio',
    defaultWidth: 50,
    minWidth: 20,
    maxWidth: 80,
    storageKey: 'chisl.editor.split-ratio',
  });

  // Re-read persistence on workspace change. Switching conversations (or
  // entering a team) should pick up that workspace's Expert preference without
  // a reload. Each derived chrome flag (minimap) tracks the toggle.
  useEffect(() => {
    const persisted = readPersistedExpertMode(workspaceId);
    setExpertMode(persisted);
    setShowMinimap(persisted);
  }, [workspaceId]);

  // Hydrate persisted editor settings (font size / family / tab / etc.) on
  // mount and on workspace change. The other chrome flags are managed
  // separately by Expert mode and the toolbar.
  useEffect(() => {
    setEditorSettings((prev) => ({
      ...readEditorSettings(workspaceId),
      showMinimap: prev.showMinimap,
      wordWrap: prev.wordWrap,
      renderWhitespace: prev.renderWhitespace,
      formatOnSave: prev.formatOnSave,
    }));
  }, [workspaceId]);

  const toggleExpertMode = useCallback(() => {
    setExpertMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(expertModeStorageKey(workspaceId), String(next));
      } catch {
        // ignore storage errors
      }
      setShowMinimap(next);
      return next;
    });
  }, [workspaceId]);

  // ---------------------------------------------------------------------------
  // Auto-Save
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!editorSettings.autoSave || !editor.isDirty) return;
    const active = editor.activeBuffer;
    if (!active || active.filePath === null) return; // skip untitled
    const timer = window.setTimeout(() => {
      editor.saveEditorFile({ isAutoSave: true }).catch(() => {
        /* ignore */
      });
    }, editorSettings.autoSaveDelay);
    return () => window.clearTimeout(timer);
  }, [editor.isDirty, editorSettings.autoSave, editorSettings.autoSaveDelay, editor, editor.activeBuffer]);
  // shell picks them up next session. Each handler updates the local state
  // AND writes the persistent copy. We don't bump the Expert-mode storage
  // key — Expert mode is a coarse posture, not a per-flag persistence.
  const persistSetting = useCallback(
    (patch: Partial<EditorUserSettings>) => {
      setEditorSettings((prev) => {
        const next = writeEditorSettings(workspaceId, { ...prev, ...patch });
        return next;
      });
    },
    [workspaceId]
  );

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

  // Cmd/Ctrl+\ splits the editor (VS Code parity). Panes are closed via each
  // pane's close-split affordance.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        editor.splitEditor('right');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  // Listen for external "reveal a line" requests (e.g. the Sider Outline
  // section). The Outline has been moved out of the editor body into the
  // left Sider, so it dispatches a `window` CustomEvent instead of calling
  // into the Monaco ref directly.
  useEffect(() => {
    const handler = (event: Event) => {
      if (!isEditorRevealLineEvent(event)) return;
      focusedHandle()?.revealLine(event.detail.line);
    };
    window.addEventListener(EDITOR_REVEAL_LINE_EVENT, handler);
    return () => window.removeEventListener(EDITOR_REVEAL_LINE_EVENT, handler);
  }, [focusedHandle]);

  const handleSelectionChange = useCallback((info: MonacoSelectionInfo) => {
    setSelectionInfo(info);
  }, []);

  const handleChangeLanguage = useCallback(
    (languageId: string) => {
      focusedHandle()?.setLanguage(languageId);
    },
    [focusedHandle]
  );

  const handleChangeIndent = useCallback(
    (useSpaces: boolean, size: number) => {
      focusedHandle()?.setIndent(useSpaces, size);
      setIndent({ useSpaces, size });
    },
    [focusedHandle]
  );

  const handleChangeEol = useCallback(
    (next: 'LF' | 'CRLF') => {
      focusedHandle()?.setEol(next);
      setEol(next);
    },
    [focusedHandle]
  );

  const handleZoomIn = useCallback(() => focusedHandle()?.zoomIn(), [focusedHandle]);
  const handleZoomOut = useCallback(() => focusedHandle()?.zoomOut(), [focusedHandle]);
  const handleResetZoom = useCallback(() => focusedHandle()?.resetZoom(), [focusedHandle]);
  const handleGoToSymbol = useCallback(() => focusedHandle()?.goToSymbol(), [focusedHandle]);

  const handleCursorChange = useCallback((line: number, column: number) => {
    setCursor((prev) => (prev.line === line && prev.col === column ? prev : { line, col: column }));
  }, []);

  const handleSave = useCallback(() => {
    void editor.saveEditorFile(
      editorSettings.formatOnSave
        ? {
            format: async () => {
              focusedHandle()?.formatDocument();
              await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 50);
              });
            },
          }
        : undefined
    );
  }, [editor, editorSettings.formatOnSave]);

  if (!editor.isOpen || editor.isCollapsed) return null;

  const active = editor.activeBuffer;
  const showLoading = active?.loading ?? false;
  const showDiskAlert = active?.diskChanged ?? false;

  return (
    <div className='editor-panel'>
      {messageContextHolder}
      <EditorBreadcrumb
        activeBuffer={active}
        onRevealSegment={(rel) => {
          if (!active?.workspace) return;
          requestEditorRevealInTree({
            workspace: active.workspace,
            filePath: active.filePath ?? rel,
            relativePath: rel,
          });
        }}
      />
      <EditorToolbar
        saving={active?.saving ?? false}
        wordWrap={wordWrap}
        showMinimap={showMinimap}
        renderWhitespace={renderWhitespace}
        autoSave={editorSettings.autoSave}
        isSplit={editor.groups.length > 1}
        onToggleSplit={() => editor.splitEditor('right')}
        onNew={editor.openUntitledEditor}
        onOpen={() => void editor.chooseAndOpenFile()}
        onSave={handleSave}
        onSaveAs={() => void editor.saveEditorFileAs()}
        onUndo={() => focusedHandle()?.undo()}
        onRedo={() => focusedHandle()?.redo()}
        onFind={() => focusedHandle()?.openFind()}
        onReplace={() => focusedHandle()?.openReplace()}
        onGoToLine={() => focusedHandle()?.goToLine()}
        onToggleComment={() => focusedHandle()?.toggleLineComment()}
        onFormatDocument={() => focusedHandle()?.formatDocument()}
        onToggleWordWrap={() => {
          setWordWrap((prev) => {
            const next = !prev;
            persistSetting({ wordWrap: next });
            return next;
          });
        }}
        onToggleMinimap={() => {
          setShowMinimap((prev) => {
            const next = !prev;
            persistSetting({ showMinimap: next });
            return next;
          });
        }}
        onToggleWhitespace={() => {
          setEditorSettings((prev) => {
            const next = !prev.renderWhitespace;
            persistSetting({ renderWhitespace: next });
            return { ...prev, renderWhitespace: next };
          });
        }}
        onToggleAutoSave={() => {
          setEditorSettings((prev) => {
            const next = !prev.autoSave;
            persistSetting({ autoSave: next });
            return { ...prev, autoSave: next };
          });
        }}
        onCollapse={editor.collapseEditor}
      />
      {showDiskAlert && (
        <Alert className='editor-panel__alert' type='warning' content={t('conversation.editor.fileChangedOnDisk')} />
      )}
      {lspStatus.state === 'not-installed' && (
        <Alert
          className='editor-panel__alert'
          type='info'
          content={t('conversation.editor.lspNotInstalled', { command: lspStatus.command ?? lspStatus.language })}
        />
      )}
      <div className='editor-panel__body'>
        {showLoading ? (
          <div className='editor-panel__loading'>
            <Spin />
            <span>{t('common.loading')}</span>
          </div>
        ) : (
          <div className='editor-panel__split'>
            <div className='editor-panel__aside'>
              <EditorProblems activeBuffer={active} onSelectProblem={(line) => focusedHandle()?.revealLine(line)} />
            </div>
            <div className='editor-panel__groups'>
              {editor.groups.map((g, i) => {
                const isSplit = editor.groups.length > 1;
                // Two panes get a draggable ratio; 3+ panes distribute evenly
                // (per-divider resize for N>2 is deferred polish).
                const isTwoPane = editor.groups.length === 2;
                const slotStyle: React.CSSProperties = isTwoPane
                  ? {
                      flexGrow: 0,
                      flexShrink: 0,
                      flexBasis: `${i === 0 ? splitRatio : 100 - splitRatio}%`,
                      minWidth: 0,
                    }
                  : { flex: 1, minWidth: 0 };
                return (
                  <React.Fragment key={g.id}>
                    {i > 0 &&
                      (isTwoPane ? (
                        <div className='editor-split-divider'>
                          {createDragHandle({ className: 'editor-split-handle', style: {} })}
                        </div>
                      ) : (
                        <div className='editor-split-divider editor-split-divider--static' />
                      ))}
                    <div className='editor-panel__group-slot' style={slotStyle}>
                      <EditorGroupView
                        groupId={g.id}
                        isFocused={g.id === editor.activeGroupId}
                        showClose={isSplit}
                        expertMode={expertMode}
                        wordWrap={wordWrap}
                        showMinimap={showMinimap}
                        renderWhitespace={renderWhitespace}
                        editorSettings={{
                          fontSize: editorSettings.fontSize,
                          fontFamily: editorSettings.fontFamily,
                          tabSize: editorSettings.tabSize,
                          insertSpaces: editorSettings.insertSpaces,
                        }}
                        onRegisterHandle={registerHandle}
                        onCursorChange={handleCursorChange}
                        onSelectionChange={handleSelectionChange}
                        onLspStatus={setLspStatus}
                        onSave={handleSave}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
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
        expertMode={expertMode}
        onToggleExpertMode={toggleExpertMode}
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
