import MarkdownView from '@/renderer/components/Markdown';
import { Button, Input } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard } from './editorSectionPrimitives';

type RulesSectionProps = {
  isReadOnly: boolean;
  promptViewMode: 'edit' | 'preview';
  setPromptViewMode: (value: 'edit' | 'preview') => void;
  rulesExpanded: boolean;
  setRulesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  rulesContainerHeight: string;
  editContext: string;
  setEditContext: (value: string) => void;
  readOnlyLabel: string;
};

const RulesSection: React.FC<RulesSectionProps> = ({
  isReadOnly,
  promptViewMode,
  setPromptViewMode,
  rulesExpanded,
  setRulesExpanded,
  rulesContainerHeight,
  editContext,
  setEditContext,
  readOnlyLabel,
}) => {
  const { t } = useTranslation();
  const isRuleEditable = !isReadOnly;

  return (
    <SectionCard
      title={t('settings.assistantRules', { defaultValue: 'Rules' })}
      legend={{
        label: t('settings.assistantOnlyNewConversation', { defaultValue: 'New conversations only' }),
        tone: 'next',
      }}
      readOnlyLabel={readOnlyLabel}
      extra={
        <div className='flex items-center gap-6px'>
          {isReadOnly ? (
            <span className='rounded-8px bg-fill-1 px-8px py-3px text-10px font-500 text-t-tertiary'>
              {readOnlyLabel}
            </span>
          ) : null}
          {isRuleEditable ? (
            <div className='flex items-center rounded-10px bg-fill-1 p-2px'>
              <Button
                type='text'
                size='mini'
                className={`${promptViewMode === 'edit' ? '!rounded-8px !bg-base !text-primary-6' : '!rounded-8px !text-t-secondary'}`}
                onClick={() => setPromptViewMode('edit')}
              >
                {t('settings.promptEdit', { defaultValue: 'Edit' })}
              </Button>
              <Button
                type='text'
                size='mini'
                className={`${promptViewMode === 'preview' ? '!rounded-8px !bg-base !text-primary-6' : '!rounded-8px !text-t-secondary'}`}
                onClick={() => setPromptViewMode('preview')}
              >
                {t('settings.promptPreview', { defaultValue: 'Preview' })}
              </Button>
            </div>
          ) : null}
          <Button
            type='text'
            size='mini'
            data-testid='btn-expand-rules'
            onClick={() => setRulesExpanded((previous) => !previous)}
          >
            {rulesExpanded
              ? t('common.collapse', { defaultValue: 'Collapse' })
              : t('common.expand', { defaultValue: 'Expand' })}
          </Button>
        </div>
      }
      testId='assistant-card-rules'
    >
      <div
        className='overflow-hidden rounded-12px border border-border-2 bg-fill-1'
        style={{ height: rulesContainerHeight }}
      >
        {promptViewMode === 'edit' && isRuleEditable ? (
          <div className='h-full'>
            <Input.TextArea
              value={editContext}
              onChange={(value) => setEditContext(value)}
              placeholder={t('settings.assistantRulesPlaceholder', {
                defaultValue: 'Enter rules in Markdown format...',
              })}
              autoSize={false}
              className='!h-full !rounded-none !border-none !bg-transparent'
            />
          </div>
        ) : (
          <div className='h-full overflow-auto px-14px py-12px text-13px leading-22px text-t-secondary'>
            {editContext ? (
              <MarkdownView hiddenCodeCopyButton>{editContext}</MarkdownView>
            ) : (
              <div className='py-24px text-center text-t-tertiary'>
                {t('settings.promptPreviewEmpty', { defaultValue: 'No content to preview' })}
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default RulesSection;
