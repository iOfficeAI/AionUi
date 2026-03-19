/**
 * AssistantListPanel — Renders the collapsible list of assistants
 * with avatar, name, enabled switch, and edit/duplicate actions.
 */
import type { AssistantListItem } from './types';
import AssistantAvatar from './AssistantAvatar';
import { Button, Collapse, Switch } from '@arco-design/web-react';
import { Plus, SettingOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type AssistantListPanelProps = {
  assistants: AssistantListItem[];
  localeKey: string;
  avatarImageMap: Record<string, string>;
  isExtensionAssistant: (assistant: AssistantListItem | null | undefined) => boolean;
  onEdit: (assistant: AssistantListItem) => void;
  onDuplicate: (assistant: AssistantListItem) => void;
  onCreate: () => void;
  onToggleEnabled: (assistant: AssistantListItem, checked: boolean) => void;
  setActiveAssistantId: (id: string) => void;
};

const AssistantListPanel: React.FC<AssistantListPanelProps> = ({
  assistants,
  localeKey,
  avatarImageMap,
  isExtensionAssistant,
  onEdit,
  onDuplicate,
  onCreate,
  onToggleEnabled,
  setActiveAssistantId,
}) => {
  const { t } = useTranslation();

  return (
    <Collapse.Item
      header={
        <div className='flex items-center justify-between w-full'>
          <span>{t('settings.assistants', { defaultValue: 'Assistants' })}</span>
        </div>
      }
      name='smart-assistants'
      extra={
        <Button
          type='text'
          size='small'
          style={{ color: 'var(--text-primary)' }}
          icon={<Plus size={14} fill='currentColor' />}
          onClick={(e) => {
            e.stopPropagation();
            onCreate();
          }}
        >
          {t('settings.createAssistant', { defaultValue: 'Create' })}
        </Button>
      }
    >
      <div className='py-2'>
        <div className='bg-fill-2 rounded-2xl p-20px'>
          <div className='text-14px text-t-secondary mb-12px'>
            {t('settings.assistantsList', { defaultValue: 'Available assistants' })}
          </div>
          {assistants.length > 0 ? (
            <div className='space-y-12px'>
              {assistants.map((assistant) => {
                const assistantIsExtension = isExtensionAssistant(assistant);
                return (
                  <div
                    key={assistant.id}
                    className='group bg-fill-0 rounded-lg px-16px py-12px flex items-center justify-between cursor-pointer hover:bg-fill-1 transition-colors'
                    onClick={() => {
                      setActiveAssistantId(assistant.id);
                      onEdit(assistant);
                    }}
                  >
                    <div className='flex items-center gap-12px min-w-0'>
                      <AssistantAvatar assistant={assistant} size={28} avatarImageMap={avatarImageMap} />
                      <div className='min-w-0'>
                        <div className='font-medium text-t-primary truncate flex items-center gap-6px'>
                          <span className='truncate'>{assistant.nameI18n?.[localeKey] || assistant.name}</span>
                        </div>
                        <div className='text-12px text-t-secondary truncate'>
                          {assistant.descriptionI18n?.[localeKey] || assistant.description || ''}
                        </div>
                      </div>
                    </div>
                    <div className='flex items-center gap-12px text-t-secondary'>
                      <span
                        className='invisible group-hover:visible text-12px text-primary cursor-pointer hover:underline transition-all'
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate(assistant);
                        }}
                      >
                        {t('settings.duplicateAssistant', { defaultValue: 'Duplicate' })}
                      </span>
                      <Switch
                        size='small'
                        checked={assistantIsExtension ? true : assistant.enabled !== false}
                        disabled={assistantIsExtension}
                        onChange={(checked) => {
                          onToggleEnabled(assistant, checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type='text'
                        size='small'
                        icon={<SettingOne size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(assistant);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className='text-center text-t-secondary py-12px'>
              {t('settings.assistantsEmpty', { defaultValue: 'No assistants configured.' })}
            </div>
          )}
        </div>
      </div>
    </Collapse.Item>
  );
};

export default AssistantListPanel;
