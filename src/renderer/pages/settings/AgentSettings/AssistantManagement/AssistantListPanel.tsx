/**
 * AssistantListPanel — Renders the collapsible list of assistants
 * with avatar, name, enabled switch, and edit/duplicate actions.
 */
import {
  filterAssistants,
  getAssistantSource,
  groupAssistantsByEnabled,
  type AssistantListFilter,
} from './assistantUtils';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import type { AssistantListItem } from './types';
import AssistantAvatar from './AssistantAvatar';
import { Button, Input, Switch, Tabs, Tag } from '@arco-design/web-react';
import { Plus, Search, SettingOne, CloseSmall } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
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
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<AssistantListFilter>('all');
  const [searchExpanded, setSearchExpanded] = useState(false);

  const filteredAssistants = useMemo(
    () => filterAssistants(assistants, searchQuery, activeFilter, localeKey),
    [activeFilter, assistants, localeKey, searchQuery]
  );
  const { enabledAssistants, disabledAssistants } = useMemo(
    () => groupAssistantsByEnabled(filteredAssistants),
    [filteredAssistants]
  );

  const filterOptions: Array<{ key: AssistantListFilter; label: string }> = [
    { key: 'all', label: t('settings.assistantFilterAll', { defaultValue: 'All' }) },
    { key: 'builtin', label: t('settings.assistantFilterBuiltin', { defaultValue: 'System' }) },
    { key: 'custom', label: t('settings.assistantFilterCustom', { defaultValue: 'Custom' }) },
  ];

  const renderSourceTag = (assistant: AssistantListItem) => {
    const source = getAssistantSource(assistant);

    if (source === 'builtin' || source === 'extension') {
      return null;
    }

    return (
      <Tag
        size='small'
        color='green'
        bordered={false}
        className='!text-11px !leading-16px !px-8px !py-1px !rounded-8px !bg-primary-1 !text-primary-6'
      >
        {t('settings.assistantSourceCustom', { defaultValue: 'Custom' })}
      </Tag>
    );
  };

  const renderAssistantCard = (assistant: AssistantListItem) => {
    const assistantIsExtension = isExtensionAssistant(assistant);

    return (
      <div
        key={assistant.id}
        className='group border border-solid border-[var(--color-neutral-3)] bg-fill-0 rounded-16px px-16px py-14px flex items-center justify-between cursor-pointer transition-all duration-180 hover:border-[var(--color-primary-light-4)] hover:bg-bg-1'
        onClick={() => {
          setActiveAssistantId(assistant.id);
          onEdit(assistant);
        }}
      >
        <div className='flex items-center gap-12px min-w-0 flex-1'>
          <AssistantAvatar assistant={assistant} size={28} avatarImageMap={avatarImageMap} />
          <div className='min-w-0 flex-1'>
            <div className='font-medium text-t-primary min-w-0 flex items-center gap-10px'>
              <span className='truncate'>{assistant.nameI18n?.[localeKey] || assistant.name}</span>
              <div className='flex items-center gap-6px flex-shrink-0'>{renderSourceTag(assistant)}</div>
            </div>
            <div className='text-12px text-t-secondary truncate'>
              {assistant.descriptionI18n?.[localeKey] || assistant.description || ''}
            </div>
          </div>
        </div>
        <div
          className='flex items-center gap-10px text-t-secondary ml-12px flex-shrink-0'
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className='invisible group-hover:visible text-12px text-primary cursor-pointer hover:underline transition-all'
            onClick={() => {
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
          />
          <Button
            type='text'
            size='small'
            icon={<SettingOne size={16} />}
            className='!rounded-10px'
            onClick={() => {
              onEdit(assistant);
            }}
          />
        </div>
      </div>
    );
  };

  const renderSection = (title: string, sectionAssistants: AssistantListItem[]) => {
    if (sectionAssistants.length === 0) return null;

    return (
      <div className='space-y-12px'>
        <div className='flex items-center gap-8px text-13px font-medium text-t-secondary px-4px'>
          {title}
          <span className='text-t-tertiary'>({sectionAssistants.length})</span>
        </div>
        <div className='space-y-12px'>{sectionAssistants.map(renderAssistantCard)}</div>
      </div>
    );
  };

  const isSearchVisible = searchExpanded || searchQuery.length > 0;

  return (
    <div className='py-2'>
      <div className={`bg-fill-2 rounded-24px ${isMobile ? 'p-16px' : 'p-20px'}`}>
        <div className='flex flex-col gap-14px mb-20px'>
          <div className={`flex gap-12px ${isMobile ? 'flex-col' : 'items-start justify-between'}`}>
            <div className='min-w-0'>
              <h2 className='m-0 text-28px font-700 leading-[1.1] text-t-primary'>
                {t('settings.assistants', { defaultValue: 'Assistants' })}
              </h2>
            </div>
            <div className={`${isMobile ? 'w-full' : 'flex-shrink-0'}`}>
              <Button
                type='primary'
                size='small'
                className={`!rounded-[100px] ${isMobile ? '!w-full !h-36px' : '!px-16px !h-32px'}`}
                icon={<Plus size={14} fill='currentColor' />}
                onClick={onCreate}
              >
                {t('settings.createAssistant', { defaultValue: 'Create Assistant' })}
              </Button>
            </div>
          </div>
          <div className={`flex gap-12px ${isMobile ? 'flex-col' : 'items-end justify-between'}`}>
            <div className='min-w-0 max-w-[760px] space-y-6px'>
              <p className='m-0 text-14px text-t-secondary leading-relaxed'>
                {t('settings.assistantsListDescription', {
                  defaultValue: 'Build task-specific assistants by combining an AI agent with custom rules and skills.',
                })}
              </p>
            </div>
            <div
              className={`flex ${isMobile ? 'items-center justify-between' : 'items-center'} gap-10px text-12px text-t-tertiary`}
            >
              <Button
                type={isSearchVisible ? 'secondary' : 'text'}
                size='small'
                className='!rounded-10px !h-34px !w-34px !p-0 flex items-center justify-center !text-t-secondary hover:!bg-fill-1 hover:!text-t-primary'
                icon={
                  isSearchVisible ? (
                    <CloseSmall size={16} fill='currentColor' />
                  ) : (
                    <Search size={16} fill='currentColor' />
                  )
                }
                onClick={() => {
                  if (isSearchVisible) {
                    setSearchExpanded(false);
                    setSearchQuery('');
                    return;
                  }
                  setSearchExpanded(true);
                }}
              />
            </div>
          </div>
          {isSearchVisible && (
            <Input
              allowClear
              autoFocus
              value={searchQuery}
              onChange={setSearchQuery}
              className='!bg-[var(--color-bg-2)]'
              placeholder={t('settings.searchAssistants', {
                defaultValue: 'Search assistants by name or description',
              })}
              prefix={<Search size={14} fill='currentColor' />}
            />
          )}
          <Tabs
            activeTab={activeFilter}
            onChange={(key) => setActiveFilter((key as AssistantListFilter) || 'all')}
            type='line'
            className='assistant-filter-tabs w-full'
          >
            {filterOptions.map((filterOption) => (
              <Tabs.TabPane key={filterOption.key} title={filterOption.label} />
            ))}
          </Tabs>
        </div>

        {filteredAssistants.length > 0 ? (
          <div className='space-y-16px'>
            {renderSection(t('settings.assistantSectionEnabled', { defaultValue: 'Enabled' }), enabledAssistants)}
            {renderSection(t('settings.assistantSectionDisabled', { defaultValue: 'Disabled' }), disabledAssistants)}
          </div>
        ) : (
          <div className='text-center text-t-secondary py-12px'>
            {t('settings.assistantNoMatch', {
              defaultValue: 'No assistants match the current filters.',
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssistantListPanel;
