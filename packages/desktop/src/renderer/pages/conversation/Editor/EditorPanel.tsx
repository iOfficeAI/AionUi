import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { EditorView, keymap } from '@codemirror/view';
import { loadLanguage, type LanguageName } from '@uiw/codemirror-extensions-langs';
import CodeMirror from '@uiw/react-codemirror';
import { Alert, Button, Modal, Message, Spin } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EditorToolbar from './EditorToolbar';
import { useEditorContext } from './EditorContext';
import './editor.css';

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
  const editor = useEditorContext();

  useEffect(() => {
    if (!editor.notice) return;
    messageApi[editor.notice.kind](t(editor.notice.key, editor.notice.values));
    editor.clearNotice(editor.notice.id);
  }, [editor, messageApi, t]);

  const extensions = useMemo(() => {
    const exts = [
      ...getLanguageExtension(editor.language),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            void editor.saveEditorFile();
            return true;
          },
        },
      ]),
    ];
    if (wordWrap) exts.push(EditorView.lineWrapping);
    return exts;
  }, [editor.language, wordWrap, editor]);

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
        onNew={editor.openUntitledEditor}
        onOpen={() => void editor.chooseAndOpenFile()}
        onSave={() => void editor.saveEditorFile()}
        onSaveAs={() => void editor.saveEditorFileAs()}
        onClose={editor.requestCloseEditor}
        onCollapse={editor.collapseEditor}
        onToggleWordWrap={() => setWordWrap((prev) => !prev)}
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
