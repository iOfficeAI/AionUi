/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Radio, Select, Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { ActivitySortDirection } from './activityTypes';

export type ActivityContentFilter = 'all' | 'messages' | 'tasks';

export type ActivityMemberOption = { slotId: string; name: string };

export type ActivityControlsState = {
  sortDirection: ActivitySortDirection;
  showConnectors: boolean;
  contentFilter: ActivityContentFilter;
  /** Selected member lane ids. Empty array means "all members" (default). */
  selectedMembers: string[];
  showSystemMessages: boolean;
  showTerminalTasks: boolean;
};

type Props = {
  value: ActivityControlsState;
  onChange: (next: ActivityControlsState) => void;
  members: ActivityMemberOption[];
  /** Connector toggle is only meaningful in the swimlane layout. */
  showConnectorToggle: boolean;
};

const ActivityControlBar: React.FC<Props> = ({ value, onChange, members, showConnectorToggle }) => {
  const { t } = useTranslation();
  const patch = (partial: Partial<ActivityControlsState>) => onChange({ ...value, ...partial });

  return (
    <div
      className='flex flex-wrap items-center gap-12px px-12px py-8px border-b border-solid border-[color:var(--border-base)] bg-2'
      data-testid='activity-control-bar'
    >
      <Radio.Group
        type='button'
        size='small'
        value={value.sortDirection}
        onChange={(v: ActivitySortDirection) => patch({ sortDirection: v })}
        data-testid='activity-sort'
      >
        <Radio value='desc'>{t('team.activity.control.sortNewest', { defaultValue: 'Newest' })}</Radio>
        <Radio value='asc'>{t('team.activity.control.sortOldest', { defaultValue: 'Oldest' })}</Radio>
      </Radio.Group>

      <Radio.Group
        type='button'
        size='small'
        value={value.contentFilter}
        onChange={(v: ActivityContentFilter) => patch({ contentFilter: v })}
        data-testid='activity-filter'
      >
        <Radio value='all'>{t('team.activity.control.filterAll', { defaultValue: 'All' })}</Radio>
        <Radio value='messages'>{t('team.activity.control.filterMessages', { defaultValue: 'Messages' })}</Radio>
        <Radio value='tasks'>{t('team.activity.control.filterTasks', { defaultValue: 'Tasks' })}</Radio>
      </Radio.Group>

      <Select
        mode='multiple'
        size='small'
        allowClear
        className='min-w-160px max-w-260px'
        placeholder={t('team.activity.control.allMembers', { defaultValue: 'All members' })}
        value={value.selectedMembers}
        onChange={(v: string[]) => patch({ selectedMembers: v })}
        data-testid='activity-members'
        maxTagCount={2}
      >
        {members.map((m) => (
          <Select.Option key={m.slotId} value={m.slotId}>
            {m.name}
          </Select.Option>
        ))}
      </Select>

      {showConnectorToggle && (
        <label className='flex items-center gap-6px text-12px text-[color:var(--color-text-2)] select-none'>
          <Switch
            size='small'
            checked={value.showConnectors}
            onChange={(checked) => patch({ showConnectors: checked })}
            data-testid='activity-connectors'
          />
          {t('team.activity.control.connectors', { defaultValue: 'Connectors' })}
        </label>
      )}

      <label className='flex items-center gap-6px text-12px text-[color:var(--color-text-2)] select-none'>
        <Switch
          size='small'
          checked={value.showSystemMessages}
          onChange={(checked) => patch({ showSystemMessages: checked })}
          data-testid='activity-show-system'
        />
        {t('team.activity.control.showSystem', { defaultValue: 'System messages' })}
      </label>

      <label className='flex items-center gap-6px text-12px text-[color:var(--color-text-2)] select-none'>
        <Switch
          size='small'
          checked={value.showTerminalTasks}
          onChange={(checked) => patch({ showTerminalTasks: checked })}
          data-testid='activity-show-terminal'
        />
        {t('team.activity.control.showTerminal', { defaultValue: 'Finished tasks' })}
      </label>
    </div>
  );
};

export default ActivityControlBar;
