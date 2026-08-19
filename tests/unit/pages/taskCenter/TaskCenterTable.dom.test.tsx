/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'taskCenter.table.columns.index': '序号',
        'taskCenter.table.columns.name': '任务名称',
        'taskCenter.table.columns.mark': '标识',
        'taskCenter.table.columns.type': '任务类型',
        'taskCenter.table.columns.priority': '优先级',
        'taskCenter.table.columns.status': '状态',
        'taskCenter.table.columns.deadline': '要求完成时间',
        'taskCenter.table.columns.project': '项目名称',
        'taskCenter.table.columns.updator': '更新人',
        'taskCenter.table.columns.creator': '创建人',
        'taskCenter.table.columns.createdAt': '创建时间',
        'taskCenter.table.columns.actions': '操作',
        'taskCenter.actions.view': '查看',
        'taskCenter.empty': '暂无任务',
      };
      return map[key] ?? key;
    },
  }),
}));

const { default: TaskCenterTable } = await import('@/renderer/pages/task-center/TaskCenterTable');

const sampleItem = {
  id: '1',
  name: 'Task Alpha',
  mark: 'BD-AI-T001',
  projectName: 'Proj A',
  projectId: 'pa',
  partName: 'Mod A',
  milestoneName: 'M1',
  type: 0,
  typeDesc: '开发任务',
  urgency: 0,
  urgencyDesc: '紧急',
  status: 0,
  statusDesc: '未开展',
  deadlineTime: '2020-01-01',
  startTime: null,
  endTime: null,
  closeTime: null,
  creator: 'c',
  creatorName: '创A',
  currentUserId: 'u',
  currentUserName: '赵琳芝',
  updator: 'u',
  updatorName: '更A',
  createTime: '2024-04-10 09:57:08',
  updateTime: '2024-04-10 09:57:08',
  content: null,
  remark: null,
  raw: {},
};

const noop = (): void => undefined;

describe('TaskCenterTable', () => {
  it('renders row mark and task name', () => {
    render(
      <TaskCenterTable
        items={[sampleItem]}
        total={1}
        pageNo={1}
        perPageSize={30}
        loading={false}
        onPageChange={noop}
        onView={vi.fn()}
        onPerPageSizeChange={noop}
      />
    );
    expect(screen.getByText('BD-AI-T001')).toBeTruthy();
    expect(screen.getByText('Task Alpha')).toBeTruthy();
  });

  it('emits onView when 查看 link clicked', () => {
    const onView = vi.fn();
    render(
      <TaskCenterTable
        items={[sampleItem]}
        total={1}
        pageNo={1}
        perPageSize={30}
        loading={false}
        onPageChange={noop}
        onView={onView}
        onPerPageSizeChange={noop}
      />
    );
    fireEvent.click(screen.getByText('查看'));
    expect(onView).toHaveBeenCalledWith(sampleItem);
  });

  it('emits onView when task name clicked', () => {
    const onView = vi.fn();
    render(
      <TaskCenterTable
        items={[sampleItem]}
        total={1}
        pageNo={1}
        perPageSize={30}
        loading={false}
        onPageChange={noop}
        onView={onView}
        onPerPageSizeChange={noop}
      />
    );
    fireEvent.click(screen.getByText('Task Alpha'));
    expect(onView).toHaveBeenCalledWith(sampleItem);
  });

  it('shows empty state when items is empty and not loading', () => {
    render(
      <TaskCenterTable
        items={[]}
        total={0}
        pageNo={1}
        perPageSize={30}
        loading={false}
        onPageChange={noop}
        onView={vi.fn()}
        onPerPageSizeChange={noop}
      />
    );
    expect(screen.getByText('暂无任务')).toBeTruthy();
  });
});
