import { Button, Dropdown, Input, Menu } from '@arco-design/web-react';
import { MoreOne, Plus, Right } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamPreset } from '@/common/types/team/teamTypes';

type Props = {
  presets: TeamPreset[];
  selectedId?: string;
  onSelect: (preset: TeamPreset) => void;
  onInvoke: (preset: TeamPreset) => void;
  onCreate?: () => void;
  onEdit?: (preset: TeamPreset) => void;
  onRemove?: (preset: TeamPreset) => void;
};

const TeamPresetPicker: React.FC<Props> = ({ presets, selectedId, onSelect, onInvoke, onCreate, onEdit, onRemove }) => {
  const { t } = useTranslation();

  // 空态（旧版 e3f154559 同款）：标题行 + 新建按钮保留，下方纯文案居中，不用插画/额外按钮。
  if (presets.length === 0) {
    return (
      <div className='flex h-full flex-col' data-testid='team-preset-picker'>
        <div className='mb-12px flex items-center justify-between'>
          <span className='text-15px font-600 text-t-secondary'>
            {t('team.presets.title', { defaultValue: 'Expert teams' })}
          </span>
          <Button
            type='primary'
            size='mini'
            icon={<Plus theme='outline' size='14' fill='currentColor' />}
            onClick={onCreate}
            data-testid='preset-picker-new'
          >
            {t('team.presets.newPreset', { defaultValue: 'New' })}
          </Button>
        </div>
        <div className='flex flex-1 items-center justify-center' data-testid='preset-picker-empty'>
          {t('team.presets.emptyDescription', {
            defaultValue: 'Create reusable expert teams to speed up team setup.',
          })}
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col' data-testid='team-preset-picker'>
      <div className='mb-12px flex items-center justify-between gap-10px'>
        <span className='text-15px font-600 text-t-secondary'>
          {t('team.presets.title', { defaultValue: 'Expert teams' })}
        </span>
        <Button
          type='primary'
          size='mini'
          icon={<Plus theme='outline' size='14' fill='currentColor' />}
          onClick={onCreate}
          data-testid='preset-picker-new'
        >
          {t('team.presets.newPreset', { defaultValue: 'New' })}
        </Button>
      </div>
      <Input.Search
        placeholder={t('team.presets.searchPlaceholder', { defaultValue: 'Search expert teams' })}
        className='mb-12px'
        data-testid='preset-picker-search'
      />
      <div className='flex min-h-0 flex-1 flex-col gap-8px overflow-y-auto pr-4px'>
        {presets.map((preset) => (
          <div key={preset.id} className='group relative flex items-center rounded-8px'>
            <Button
              type='text'
              onClick={() => onSelect(preset)}
              data-testid={`preset-picker-item-${preset.id}`}
              aria-label={preset.name}
              className={`absolute inset-0 z-0 h-auto !rounded-8px border px-12px py-10px transition-colors ${preset.id === selectedId ? 'border-primary bg-[rgba(var(--primary-6),0.08)]' : 'border-border-2 bg-fill-1 hover:border-primary hover:bg-fill-2'}`}
            />
            <div className='relative z-10 flex w-full items-center gap-10px px-12px py-10px pointer-events-none'>
              <div className='flex min-w-0 flex-1 flex-col gap-4px'>
                <span className='truncate text-13px font-500 text-t-primary'>{preset.name}</span>
                {preset.category && <span className='truncate text-11px text-t-tertiary'>{preset.category}</span>}
              </div>
              <Button
                type='text'
                size='mini'
                icon={<Right theme='outline' size='14' />}
                className='pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100'
                onClick={(e) => {
                  e.stopPropagation();
                  onInvoke(preset);
                }}
                data-testid={`preset-picker-invoke-${preset.id}`}
              >
                {t('team.presets.invoke', { defaultValue: 'Invoke' })}
              </Button>
              <div className='pointer-events-auto'>
                <Dropdown
                  droplist={
                    <Menu
                      onClickMenuItem={(key) => {
                        if (key === 'edit') onEdit?.(preset);
                        if (key === 'remove') onRemove?.(preset);
                      }}
                    >
                      <Menu.Item key='edit'>{t('common.edit', { defaultValue: 'Edit' })}</Menu.Item>
                      <Menu.Item key='remove'>{t('common.delete', { defaultValue: 'Delete' })}</Menu.Item>
                    </Menu>
                  }
                  trigger='click'
                  position='br'
                  getPopupContainer={() => document.body}
                >
                  <Button
                    type='text'
                    size='mini'
                    icon={<MoreOne theme='outline' size='14' />}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`preset-picker-more-${preset.id}`}
                  />
                </Dropdown>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamPresetPicker;
