import { Button, Input } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard } from './editorSectionPrimitives';

type PromptsSectionProps = {
  isReadOnly: boolean;
  recommendedPromptItems: string[];
  addingPrompt: boolean;
  setAddingPrompt: (value: boolean) => void;
  newPromptDraft: string;
  setNewPromptDraft: (value: string) => void;
  editingPromptIndex: number | null;
  setEditingPromptIndex: (value: number | null) => void;
  editingPromptDraft: string;
  setEditingPromptDraft: (value: string) => void;
  onAddPrompt: () => void;
  onBeginPromptEdit: (index: number) => void;
  onSavePromptEdit: () => void;
  onDeletePrompt: (index: number) => void;
  readOnlyLabel: string;
};

const PromptsSection: React.FC<PromptsSectionProps> = ({
  isReadOnly,
  recommendedPromptItems,
  addingPrompt,
  setAddingPrompt,
  newPromptDraft,
  setNewPromptDraft,
  editingPromptIndex,
  setEditingPromptIndex,
  editingPromptDraft,
  setEditingPromptDraft,
  onAddPrompt,
  onBeginPromptEdit,
  onSavePromptEdit,
  onDeletePrompt,
  readOnlyLabel,
}) => {
  const { t } = useTranslation();
  const isPromptEditable = !isReadOnly;
  const showPromptPanel = addingPrompt || recommendedPromptItems.length > 0;

  return (
    <SectionCard
      title={t('settings.assistantRecommendedPromptsLabel', { defaultValue: 'Recommended Prompts' })}
      legend={{
        label: t('settings.assistantEffectiveImmediately', { defaultValue: 'Applies immediately' }),
        tone: 'now',
      }}
      readOnly={isReadOnly}
      readOnlyLabel={readOnlyLabel}
      extra={
        isPromptEditable ? (
          <Button
            type='outline'
            size='small'
            className='!rounded-full'
            aria-label={t('common.add', { defaultValue: 'Add' })}
            onClick={() => {
              setAddingPrompt(true);
              setEditingPromptIndex(null);
              setEditingPromptDraft('');
            }}
          >
            + {t('common.add', { defaultValue: 'Add' })}
          </Button>
        ) : null
      }
      testId='assistant-card-prompts'
    >
      {showPromptPanel ? (
        <div className='space-y-6px rounded-12px border border-border-2 bg-fill-1 px-12px py-6px'>
          {recommendedPromptItems.length > 0 ? (
            <div className='space-y-4px'>
              {recommendedPromptItems.map((prompt, index) => {
                const isEditingPrompt = editingPromptIndex === index;
                return (
                  <div
                    key={`${prompt}-${index}`}
                    className={isEditingPrompt ? 'flex items-start gap-10px' : 'flex items-center gap-10px'}
                  >
                    <div
                      className={
                        isEditingPrompt
                          ? 'w-24px pt-9px text-right text-12px font-500 leading-18px text-t-quaternary'
                          : 'flex h-36px w-24px items-center justify-end text-right text-12px font-500 leading-18px text-t-quaternary'
                      }
                    >
                      {index + 1}.
                    </div>
                    <div className='min-w-0 flex-1'>
                      {isEditingPrompt ? (
                        <div className='space-y-8px'>
                          <Input
                            value={editingPromptDraft}
                            onChange={(value) => setEditingPromptDraft(value)}
                            data-testid={`input-assistant-recommended-prompt-${index}`}
                          />
                          <div className='flex items-center gap-8px'>
                            <Button size='small' type='primary' className='!rounded-full' onClick={onSavePromptEdit}>
                              {t('common.save', { defaultValue: 'Save' })}
                            </Button>
                            <Button
                              size='small'
                              type='secondary'
                              className='!rounded-full'
                              onClick={() => {
                                setEditingPromptIndex(null);
                                setEditingPromptDraft('');
                              }}
                            >
                              {t('common.cancel', { defaultValue: 'Cancel' })}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className='flex items-center gap-12px'>
                          <div className='flex h-36px flex-1 items-center px-4px text-13px font-500 leading-18px text-t-primary'>
                            {prompt}
                          </div>
                          {isPromptEditable ? (
                            <div className='flex flex-shrink-0 items-center gap-8px'>
                              <Button
                                size='small'
                                type='secondary'
                                className='!rounded-full'
                                onClick={() => onBeginPromptEdit(index)}
                              >
                                {t('common.edit', { defaultValue: 'Edit' })}
                              </Button>
                              <Button
                                size='small'
                                type='secondary'
                                className='!rounded-full'
                                onClick={() => onDeletePrompt(index)}
                              >
                                {t('common.delete', { defaultValue: 'Delete' })}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {addingPrompt && isPromptEditable ? (
            <div className='flex items-center gap-8px rounded-10px bg-base p-4px'>
              <Input
                value={newPromptDraft}
                onChange={(value) => setNewPromptDraft(value)}
                placeholder={t('settings.assistantRecommendedPromptsPlaceholder', {
                  defaultValue: 'Enter one suggested prompt per line',
                })}
                data-testid='input-assistant-recommended-prompt-new'
              />
              <Button size='small' type='primary' className='!rounded-full' onClick={onAddPrompt}>
                {t('common.add', { defaultValue: 'Add' })}
              </Button>
              <Button
                size='small'
                type='secondary'
                className='!rounded-full'
                onClick={() => {
                  setAddingPrompt(false);
                  setNewPromptDraft('');
                }}
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
};

export default PromptsSection;
