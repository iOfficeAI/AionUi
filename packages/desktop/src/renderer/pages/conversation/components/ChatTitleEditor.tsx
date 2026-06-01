import { Input } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

type ChatTitleEditorProps = {
  editingTitle: boolean;
  titleDraft: string;
  setTitleDraft: (value: string) => void;
  setEditingTitle: (value: boolean) => void;
  renameLoading: boolean;
  canRenameTitle: boolean;
  submitTitleRename: () => Promise<void>;
  titleAreaMaxWidth: number;
  title: React.ReactNode;
  conversation_id?: string;
  /** Optional leading icon (e.g. agent logo) rendered inside the hover region, just before the title */
  leading?: React.ReactNode;
};

// Inline title display with double-click-to-edit rename support
const ChatTitleEditor: React.FC<ChatTitleEditorProps> = ({
  editingTitle,
  titleDraft,
  setTitleDraft,
  setEditingTitle,
  renameLoading,
  canRenameTitle,
  submitTitleRename,
  titleAreaMaxWidth,
  title,
  leading,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={classNames(
        'group flex min-w-0 max-w-full items-center rounded-4px transition-colors duration-150',
        editingTitle ? 'bg-fill-1' : ''
      )}
      style={{ width: '100%', maxWidth: `${titleAreaMaxWidth}px` }}
    >
      {leading && <div className='shrink-0 flex items-center pl-4px'>{leading}</div>}
      <div className='min-w-0 flex-1 px-6px py-1px'>
        {editingTitle && canRenameTitle ? (
          <Input
            autoFocus
            value={titleDraft}
            disabled={renameLoading}
            className='w-full min-w-0 max-w-full border-none bg-transparent shadow-none [&_.arco-input-inner-wrapper]:border-none [&_.arco-input-inner-wrapper]:bg-transparent [&_.arco-input-inner-wrapper]:shadow-none [&_.arco-input]:bg-transparent [&_.arco-input]:px-0 [&_.arco-input]:text-13px [&_.arco-input]:font-700 [&_.arco-input]:leading-18px [&_.arco-input]:text-[var(--color-text-1)]'
            style={{
              width: '100%',
              maxWidth: '100%',
            }}
            maxLength={120}
            onChange={setTitleDraft}
            onFocus={(event) => {
              event.target.select();
            }}
            onPressEnter={() => {
              void submitTitleRename();
            }}
            onBlur={() => {
              void submitTitleRename();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTitleDraft(typeof title === 'string' ? title : '');
                setEditingTitle(false);
              }
            }}
            placeholder={t('conversation.history.renamePlaceholder')}
            size='default'
          />
        ) : (
          <span
            role={canRenameTitle ? 'button' : undefined}
            tabIndex={canRenameTitle ? 0 : undefined}
            className={classNames(
              'block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-12px font-medium text-t-primary transition-colors duration-150',
              canRenameTitle &&
                'cursor-text group-hover:text-[rgb(var(--primary-6))] group-focus-within:text-[rgb(var(--primary-6))] focus:outline-none'
            )}
            onClick={() => {
              if (!canRenameTitle) return;
              setEditingTitle(true);
            }}
            onKeyDown={(event) => {
              if (!canRenameTitle) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setEditingTitle(true);
              }
            }}
          >
            {title}
          </span>
        )}
      </div>
    </div>
  );
};

export default ChatTitleEditor;
