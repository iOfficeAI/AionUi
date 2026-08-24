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
  conversation_id?: string;
  /** Optional leading icon (e.g. agent logo) rendered inside the hover region, just before the title */
  leading?: React.ReactNode;
};

// Inline title display with click-to-edit rename support
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
  conversation_id,
  leading,
}) => {
  const { t } = useTranslation();

  // Conversations started from an empty input are persisted with an empty name,
  // so the title renders as nothing. Without a placeholder the header looks
  // blank and the click-to-rename region collapses to zero height, leaving no
  // way to name the conversation. The placeholder is display-only — the rename
  // draft still starts from the stored (empty) name.
  const isTitleBlank = typeof title === 'string' && title.trim() === '';
  const displayTitle = isTitleBlank ? t('conversation.historySearch.untitled') : title;

  const startEditing = () => {
    if (!canRenameTitle) return;
    setEditingTitle(true);
  };

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
      {leading && <div className='shrink-0 flex items-center ps-8px'>{leading}</div>}
      {editingTitle && canRenameTitle ? (
        <div className='min-w-0 flex-1 px-8px py-5px'>
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
        </div>
      ) : (
        // The whole padded region is the rename trigger: an empty title leaves
        // the text span with no box to hit, and the padding alone is only 10px
        // tall. `min-h-24px` sits below the natural height of a rendered title
        // (~29px), so it never affects layout — it only guarantees a usable hit
        // area if the title text is ever absent.
        <div
          data-testid='chat-title-editor-trigger'
          role={canRenameTitle ? 'button' : undefined}
          tabIndex={canRenameTitle ? 0 : undefined}
          className={classNames(
            'min-w-0 flex-1 px-8px py-5px min-h-24px',
            canRenameTitle && 'cursor-text focus:outline-none'
          )}
          onClick={startEditing}
          onKeyDown={(event) => {
            if (!canRenameTitle) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              startEditing();
            }
          }}
        >
          <span
            className={classNames(
              'block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-16px font-bold transition-colors duration-150',
              isTitleBlank ? 'text-t-tertiary' : 'text-t-primary',
              canRenameTitle &&
                'group-hover:text-[rgb(var(--primary-6))] group-focus-within:text-[rgb(var(--primary-6))]'
            )}
          >
            {displayTitle}
          </span>
        </div>
      )}
      {!editingTitle && (
        <div className='w-0 flex items-center overflow-hidden opacity-0 transition-all duration-180 group-hover:w-40px group-hover:opacity-100 group-focus-within:w-40px group-focus-within:opacity-100'>
          <span className='h-16px w-1px shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--color-text-4)_44%,transparent)]' />
          <div className='ms-4px me-4px flex items-center justify-center'>
            <ConversationTitleMinimap conversation_id={conversation_id} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatTitleEditor;
