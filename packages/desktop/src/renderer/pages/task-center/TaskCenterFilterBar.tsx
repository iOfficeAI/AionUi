/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { Input, Select, Button } from '@arco-design/web-react';
import React from 'react';
import { useTaskCenterT } from './useTaskCenterT';

export interface ProjectOption {
  id: string;
  name: string;
}

export interface TaskCenterFilterBarProps {
  keyword: string;
  urgency: number | 'all';
  projectId: string | 'all';
  type: number | 'all';
  projects: ProjectOption[];
  onKeywordChange: (v: string) => void;
  onUrgencyChange: (v: number | 'all') => void;
  onProjectChange: (v: string | 'all') => void;
  onTypeChange: (v: number | 'all') => void;
  onReset: () => void;
}

const URGENCY_OPTIONS = [
  { value: 0, labelKey: 'urgent' as const },
  { value: 1, labelKey: 'important' as const },
  { value: 2, labelKey: 'normal' as const },
];

const TYPE_OPTIONS = [{ value: 0, label: '开发任务' }];

const TaskCenterFilterBar: React.FC<TaskCenterFilterBarProps> = ({
  keyword,
  urgency,
  projectId,
  type,
  projects,
  onKeywordChange,
  onUrgencyChange,
  onProjectChange,
  onTypeChange,
  onReset,
}) => {
  const t = useTaskCenterT();

  return (
    <div className='flex flex-wrap items-center gap-8px px-20px py-12px bg-bg-1 rd-8px border border-solid border-[var(--color-border-2)]'>
      <Input
        allowClear
        placeholder={String(t('taskCenter.searchPlaceholder'))}
        value={keyword}
        onChange={onKeywordChange}
        className='w-240px'
      />
      <Select value={urgency} onChange={onUrgencyChange} className='w-160px'>
        <Select.Option value='all'>{String(t('taskCenter.filter.all'))}</Select.Option>
        {URGENCY_OPTIONS.map((o) => (
          <Select.Option key={o.value} value={o.value}>
            {String(t(`taskCenter.priorityOptions.${o.labelKey}`))}
          </Select.Option>
        ))}
      </Select>
      <Select value={projectId} onChange={onProjectChange} className='w-200px'>
        <Select.Option value='all'>{String(t('taskCenter.filter.all'))}</Select.Option>
        {projects.map((p) => (
          <Select.Option key={p.id} value={p.id}>
            {p.name}
          </Select.Option>
        ))}
      </Select>
      <Select value={type} onChange={onTypeChange} className='w-160px'>
        <Select.Option value='all'>{String(t('taskCenter.filter.all'))}</Select.Option>
        {TYPE_OPTIONS.map((o) => (
          <Select.Option key={o.value} value={o.value}>
            {o.label}
          </Select.Option>
        ))}
      </Select>
      <div className='flex-1' />
      <Button onClick={onReset}>{String(t('taskCenter.reset'))}</Button>
    </div>
  );
};

export default TaskCenterFilterBar;
