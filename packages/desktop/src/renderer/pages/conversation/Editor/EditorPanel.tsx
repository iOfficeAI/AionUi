import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { indentWithTab, toggleComment } from '@codemirror/commands';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { EditorView, keymap } from '@codemirror/view';
import { loadLanguage, type LanguageName } from '@uiw/codemirror-extensions-langs';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { Alert, Button, Modal, Message, Spin } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EditorToolbar from './EditorToolbar';
import { useEditorContext } from './EditorContext';
import './editor.css';

type CursorPosition = {
  line: number;
  col: number;
};

const INITIAL_CURSOR: CursorPosition = { line: 1, col: 1 };

const LANGUAGE_MAP: Record<string, string> = {
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  css: 'css',
  go: 'go',
  html: 'html',
  java: 'java',
  javascript: 'javascript',
  json: 'json',
  jsx: 'jsx',
  less: 'less',
  lua: 'lua',
  markdown: 'markdown',
  php: 'php',
  python: 'python',
  ruby: 'ruby',
  rust: 'rust',
  scss: 'scss',
  shell: 'shell',
  sql: 'sql',
  typescript: 'typescript',
  tsx: 'tsx',
  xml: 'xml',
  yaml: 'yaml',
};

function getLanguageExtension(language: string) {
  const name = LANGUAGE_MAP[language] || language;
  if (name === 'plaintext' || name === 'diff') return [];
  const ext = loadLanguage(name as LanguageName);
  return ext ? [ext] : [];
}

const EditorPanel: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();
  const [messageApi, messageContextHolder] = Message.useMessage();
  const [wordWrap, setWordWrap] = useState(true);
  const [cursor, setCursor] = useState<CursorPosition>(INITIAL_CURSOR);
  const editor = useEditorContext();
  const codeMirrorRef = useRef<ReactCodeMirrorRef | null>(null);

  useEffect(() => {
    if (!editor.notice) return;
    messageApi[editor.notice.kind](t(editor.notice.key, editor.notice.values));
    editor.clearNotice(editor.notice.id);
  }, [editor, messageApi, t]);

  // Reset displayed cursor when switching files so stale values don't linger.
  useEffect(() => {
    setCursor(INITIAL_CURSOR);
  }, [editor.filePath, editor.fileName]);

  const cursorListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const head = update.state.selection.main.head;
        const lineInfo = update.state.doc.lineAt(head);
        const nextCol = head - lineInfo.from + 1;
        setCursor((prev) =>
          prev.line === lineInfo.number && prev.col === nextCol ? prev : { line: lineInfo.number, col: nextCol }
        );
      }),
    []
  );

  const extensions = useMemo(() => {
    const exts = [
      ...getLanguageExtension(editor.language),
      search({ top: true }),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            void editor.saveEditorFile();
            return true;
          },
        },
        { key: 'Mod-/', run: toggleComment },
        indentWithTab,
        ...searchKeymap,
      ]),
      cursorListener,
    ];
    if (wordWrap) exts.push(EditorView.lineWrapping);
    return exts;
  }, [editor.language, wordWrap, editor, cursorListener]);

  const handleOpenFind = useCallback(() => {
    const view = codeMirrorRef.current?.view;
    if (!view) return;
    openSearchPanel(view);
    view.focus();
  }, []);

  if (!editor.isOpen || editor.isCollapsed) {
    return null;
  }

  return (
    <div className='editor-panel'>
      {messageContextHolder}
      <EditorToolbar
        fileName={editor.fileName}
        filePath={editor.filePath}
        isDirty={editor.isDirty}
        saving={editor.saving}
        wordWrap={wordWrap}
        language={editor.language}
        cursorLine={cursor.line}
        cursorColumn={cursor.col}
        onNew={editor.openUntitledEditor}
        onOpen={() => void editor.chooseAndOpenFile()}
        onSave={() => void editor.saveEditorFile()}
        onSaveAs={() => void editor.saveEditorFileAs()}
        onClose={editor.requestCloseEditor}
        onCollapse={editor.collapseEditor}
        onToggleWordWrap={() => setWordWrap((prev) => !prev)}
        onFind={handleOpenFind}
      />
      {editor.diskChanged && (
        <Alert className='editor-panel__alert' type='warning' content={t('conversation.editor.fileChangedOnDisk')} />
      )}
      <div className='editor-panel__body'>
        {editor.loading ? (
          <div className='editor-panel__loading'>
            <Spin />
            <span>{t('common.loading')}</span>
          </div>
        ) : (
          <CodeMirror
            ref={codeMirrorRef}
            value={editor.content}
            height='100%'
            theme={theme === 'dark' ? 'dark' : 'light'}
            onChange={(value) => editor.setEditorContent(value || '')}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: true,
            }}
            style={{ fontSize: '14px', height: '100%' }}
          />
        )}
      </div>
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
