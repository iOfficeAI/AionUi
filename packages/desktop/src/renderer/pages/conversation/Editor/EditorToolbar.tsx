import { Button, Tooltip } from '@arco-design/web-react';
import { CloseSmall, FolderOpen, Plus, Save, Search, TextWrapOverflow, UploadLogs } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDisplayName } from './editorLanguage';

type EditorToolbarProps = {
  fileName: string;
  filePath: string | null;
  isDirty: boolean;
  saving: boolean;
  wordWrap: boolean;
  language: string;
  cursorLine: number;
  cursorColumn: number;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onClose: () => void;
  onCollapse: () => void;
  onToggleWordWrap: () => void;
  onFind: () => void;
};

const toolbarBtn =
  'flex items-center gap-2px px-6px py-3px rd-4px cursor-pointer transition-colors duration-150 text-12px font-medium text-t-secondary hover:text-t-primary hover:bg-bg-3';

const statusItem = 'text-11px text-t-secondary tabular-nums leading-none px-4px';

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  fileName,
  filePath,
  isDirty,
  saving,
  wordWrap,
  language,
  cursorLine,
  cursorColumn,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onClose,
  onCollapse,
  onToggleWordWrap,
  onFind,
}) => {
  const { t } = useTranslation();
  const languageLabel = getLanguageDisplayName(language);

  return (
    <div className='flex items-center justify-between h-32px px-10px bg-bg-2 flex-shrink-0 border-b border-b-1 overflow-hidden'>
      <div className='flex items-center gap-2px'>
        <Tooltip content={t('conversation.editor.newFile')} position='bottom' mini>
          <Button size='mini' type='text' className={toolbarBtn} onClick={onNew}>
            <Plus size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('conversation.editor.openFile')} position='bottom' mini>
          <Button size='mini' type='text' className={toolbarBtn} onClick={onOpen}>
            <FolderOpen size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('common.save')} position='bottom' mini>
          <Button size='mini' type='text' className={toolbarBtn} loading={saving} onClick={onSave}>
            <Save size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('conversation.editor.saveAs')} position='bottom' mini>
          <Button size='mini' type='text' className={toolbarBtn} onClick={onSaveAs}>
            <Save size={14} style={{ opacity: 0.6 }} />
          </Button>
        </Tooltip>
      </div>
      <Tooltip content={filePath || fileName} position='bottom' mini>
        <div className='flex items-center gap-4px min-w-0 mx-8px'>
          {isDirty && <span className='w-6px h-6px rd-full bg-brand flex-shrink-0' />}
          <span className='text-12px text-t-primary truncate max-w-200px'>{fileName}</span>
        </div>
      </Tooltip>
      <div className='flex items-center gap-2px'>
        <span className={statusItem} aria-label={t('conversation.editor.languageLabel', { language: languageLabel })}>
          {languageLabel}
        </span>
        <span className='w-1px h-12px bg-bg-3 mx-2px' aria-hidden />
        <span
          className={statusItem}
          aria-label={t('conversation.editor.cursorPosition', { line: cursorLine, col: cursorColumn })}
        >
          {t('conversation.editor.cursorPosition', { line: cursorLine, col: cursorColumn })}
        </span>
        <span className='w-1px h-12px bg-bg-3 mx-4px' aria-hidden />
        <Tooltip content={t('conversation.editor.findInFile')} position='bottom' mini>
          <Button size='mini' type='text' className={toolbarBtn} onClick={onFind}>
            <Search size={14} />
          </Button>
        </Tooltip>
        <Tooltip
          content={wordWrap ? t('conversation.editor.disableWordWrap') : t('conversation.editor.enableWordWrap')}
          position='bottom'
          mini
        >
          <Button
            size='mini'
            type='text'
            className={`${toolbarBtn} ${wordWrap ? '!text-white bg-brand hover:!text-white hover:bg-brand-hover' : ''}`}
            onClick={onToggleWordWrap}
          >
            <TextWrapOverflow size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('conversation.editor.collapseEditor')} position='bottom' mini>
          <Button size='mini' type='text' className={toolbarBtn} onClick={onCollapse}>
            <UploadLogs size={14} />
          </Button>
        </Tooltip>
        <Tooltip content={t('common.close')} position='bottom' mini>
          <Button size='mini' type='text' className={toolbarBtn} onClick={onClose}>
            <CloseSmall size={14} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default EditorToolbar;
