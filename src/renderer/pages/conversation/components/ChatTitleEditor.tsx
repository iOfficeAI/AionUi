import ConversationTitleMinimap from '@/renderer/pages/conversation/components/ConversationTitleMinimap';
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
  conversationId?: string;
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
  conversationId,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={classNames(
        'group flex min-w-0 max-w-full items-center rounded-12px border border-solid border-transparent transition-all duration-180',
        editingTitle
          ? 'bg-fill-2 border-[var(--color-fill-3)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
          : 'hover:bg-fill-2 hover:border-[var(--color-fill-3)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus-within:bg-fill-2 focus-within:border-[var(--color-fill-3)] focus-within:shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
      )}
      style={{ width: '100%', maxWidth: `${titleAreaMaxWidth}px` }}
    >
      <div className='min-w-0 flex-1 px-10px py-5px'>
        {editingTitle && canRenameTitle ? (
          <Input
            autoFocus
            value={titleDraft}
            disabled={renameLoading}
            className='w-full min-w-0 max-w-full border-none bg-transparent shadow-none [&_.arco-input-inner-wrapper]:border-none [&_.arco-input-inner-wrapper]:bg-transparent [&_.arco-input-inner-wrapper]:shadow-none [&_.arco-input]:bg-transparent [&_.arco-input]:px-0 [&_.arco-input]:text-16px [&_.arco-input]:font-700 [&_.arco-input]:leading-24px [&_.arco-input]:text-[var(--color-text-1)]'
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
              'block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-16px font-bold text-t-primary transition-colors duration-150',
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
      {!editingTitle && (
        <div className='w-0 flex items-center overflow-hidden opacity-0 transition-all duration-180 group-hover:w-40px group-hover:opacity-100 group-focus-within:w-40px group-focus-within:opacity-100'>
          <span className='h-16px w-1px shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--color-text-4)_44%,transparent)]' />
          <div className='ml-4px mr-4px flex items-center justify-center'>
            <ConversationTitleMinimap conversationId={conversationId} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatTitleEditor;
