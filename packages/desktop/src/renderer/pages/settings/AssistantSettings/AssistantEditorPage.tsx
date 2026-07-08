import type { AssistantEditorViewModel, AssistantListItem } from './types';
import { Button } from '@arco-design/web-react';
import { ArrowLeft } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import AssistantEditorSections from './AssistantEditorSections';

type AssistantEditorPageProps = {
  editor: AssistantEditorViewModel;
  activeAssistant: AssistantListItem | null;
  onBack: () => void;
};

const AssistantEditorPage: React.FC<AssistantEditorPageProps> = ({ editor, activeAssistant, onBack }) => {
  const { t } = useTranslation();
  const { isCreating, actions, profile } = editor;
  const canDelete = !isCreating && activeAssistant?.source === 'user';
  const canSave = isCreating || Boolean(activeAssistant);

  return (
    <div data-testid='assistant-editor-page' className='flex h-full min-h-0 flex-col overflow-hidden bg-transparent'>
      <div
        data-testid='assistant-editor-bar'
        className='sticky top-0 z-10 flex h-48px flex-shrink-0 items-center gap-12px border-b border-border-2 bg-bg-0 px-18px'
      >
        <div className='flex min-w-0 items-center gap-10px'>
          <Button
            type='text'
            icon={<ArrowLeft size={16} />}
            onClick={onBack}
            data-testid='btn-back-assistant-editor'
            className='!flex !items-center !gap-4px !rounded-8px !px-6px !text-t-primary'
          >
            {t('settings.assistantBackToList', { defaultValue: 'All assistants' })}
          </Button>
          <div className='truncate text-14px font-600 text-t-primary'>
            {profile.name.trim() ||
              (isCreating
                ? t('settings.createAssistant', { defaultValue: 'Create Assistant' })
                : t('settings.editAssistant', { defaultValue: 'Assistant Details' }))}
          </div>
        </div>
        <div className='ml-auto flex items-center gap-8px'>
          {canDelete && (
            <Button
              status='danger'
              className='!rounded-8px'
              style={{ backgroundColor: 'rgb(var(--danger-1))' }}
              onClick={actions.requestDelete}
              data-testid='btn-delete-assistant'
            >
              {t('common.delete', { defaultValue: 'Delete' })}
            </Button>
          )}
          <Button onClick={onBack} className='!rounded-8px bg-fill-1' data-testid='btn-cancel-assistant-editor'>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='primary'
            onClick={actions.save}
            data-testid='btn-save-assistant'
            className='!rounded-8px'
            disabled={!canSave}
          >
            {isCreating ? t('common.create', { defaultValue: 'Create' }) : t('common.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      </div>

      <div
        data-testid='assistant-editor-body'
        data-editor-popup-root
        className='relative min-h-0 flex-1 overflow-auto px-18px py-18px pb-24px'
      >
        <div className='mx-auto w-full max-w-760px'>
          <AssistantEditorSections editor={editor} activeAssistant={activeAssistant} />
        </div>
      </div>
    </div>
  );
};

export default AssistantEditorPage;
