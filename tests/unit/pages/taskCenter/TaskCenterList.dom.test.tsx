/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'taskCenter.empty': '暂无任务',
        'taskCenter.loading': '加载中...',
        'taskCenter.actions.view': '查看',
        'taskCenter.loadMore': '加载更多',
        'taskCenter.totalCount': '共 {{total}} 条',
        'taskCenter.list.overdue': '已逾期',
      };
      let v = map[key] ?? key;
      if (key === 'taskCenter.totalCount' && typeof v === 'string') {
        // simple interpolation passthrough for the test
        v = `共 ${(arguments[0] && key) || ''} 条`;
      }
      return v;
    },
  }),
}));

const { default: TaskCenterList } = await import('@/renderer/pages/task-center/TaskCenterList');

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const sampleItem = {
  id: '1',
  name: '策略库调整',
  mark: 'BD-AIServices-T359',
  projectName: '八斗AI-应用服务支撑平台',
  projectId: 'p1',
  partName: '策略库管理',
  milestoneName: '2024.04.15',
  type: 0,
  typeDesc: '开发任务',
  urgency: 0,
  urgencyDesc: '紧急',
  status: 0,
  statusDesc: '未开展',
  deadlineTime: '2024-04-12',
  startTime: null,
  endTime: null,
  closeTime: null,
  creator: 'c',
  creatorName: '黄纯敏',
  currentUserId: 'u',
  currentUserName: '赵琳芝',
  updator: 'u',
  updatorName: '黄纯敏',
  createTime: '2024-04-10 09:57:08',
  updateTime: '2024-04-10 09:57:08',
  content: '1、列表策略定义按钮移动到每一行数据右侧操作字段',
  remark: null,
  raw: {},
};

const noop = (): void => undefined;

describe('TaskCenterList', () => {
  it('renders task name, project, deadline, urgency tag', () => {
    render(
      <TaskCenterList
        items={[sampleItem]}
        total={1}
        loading={false}
        pageNo={1}
        pageSize={30}
        onView={vi.fn()}
        onLoadMore={noop}
      />
    );
    expect(screen.getByText('策略库调整')).toBeTruthy();
    expect(screen.getByText('八斗AI-应用服务支撑平台')).toBeTruthy();
    expect(screen.getByText('紧急')).toBeTruthy();
    expect(screen.getByText('未开展')).toBeTruthy();
  });

  it('emits onView when card clicked', () => {
    const onView = vi.fn();
    const { container } = render(
      <TaskCenterList
        items={[sampleItem]}
        total={1}
        loading={false}
        pageNo={1}
        pageSize={30}
        onView={onView}
        onLoadMore={noop}
      />
    );
    // Click the card (top-level div with data-testid)
    const card = container.querySelector('[data-testid="task-card-1"]');
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    expect(onView).toHaveBeenCalledWith(sampleItem);
  });

  it('shows empty state when items empty and not loading', () => {
    render(
      <TaskCenterList
        items={[]}
        total={0}
        loading={false}
        pageNo={1}
        pageSize={30}
        onView={vi.fn()}
        onLoadMore={noop}
      />
    );
    expect(screen.getByText('暂无任务')).toBeTruthy();
  });

  it('shows retry button beside empty state when error is provided and items empty', () => {
    const onRetry = vi.fn();
    render(
      <TaskCenterList
        items={[]}
        total={0}
        loading={false}
        pageNo={1}
        pageSize={30}
        onView={vi.fn()}
        onLoadMore={noop}
        error='HTTP 500'
        onRetry={onRetry}
      />
    );
    expect(screen.getByText('暂无任务')).toBeTruthy();
    const retryBtn = screen.getByTestId('task-list-retry');
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows loading state when loading and items empty', () => {
    render(<TaskCenterList items={[]} total={0} loading pageNo={1} pageSize={30} onView={vi.fn()} onLoadMore={noop} />);
    expect(screen.getByText('加载中...')).toBeTruthy();
  });

  it('emits onLoadMore when load more button clicked', () => {
    const onLoadMore = vi.fn();
    render(
      <TaskCenterList
        items={[sampleItem]}
        total={50}
        loading={false}
        pageNo={1}
        pageSize={30}
        onView={vi.fn()}
        onLoadMore={onLoadMore}
      />
    );
    const btn = screen.getByTestId('task-list-load-more');
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('hides load more when total loaded', () => {
    render(
      <TaskCenterList
        items={[sampleItem]}
        total={1}
        loading={false}
        pageNo={1}
        pageSize={30}
        onView={vi.fn()}
        onLoadMore={noop}
      />
    );
    expect(screen.queryByTestId('task-list-load-more')).toBeNull();
  });
});
