/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const messageInfoMock = vi.fn();

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: { ...actual.Message, info: messageInfoMock },
  };
});

beforeEach(() => {
  messageInfoMock.mockReset();
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'taskCenter.detail.title': '任务详情',
        'taskCenter.detail.startTask': '开始任务',
        'taskCenter.detail.startTaskTip': '功能正在开发',
        'taskCenter.detail.basicInfo': '基本信息',
        'taskCenter.detail.progressInfo': '进度信息',
        'taskCenter.detail.content': '任务内容',
        'taskCenter.detail.remark': '备注',
        'taskCenter.detail.showRawFields': '展开原始字段',
        'taskCenter.detail.hideRawFields': '收起原始字段',
        'taskCenter.detail.fields.name': '任务名称',
        'taskCenter.detail.fields.mark': '标识',
        'taskCenter.detail.fields.projectName': '项目名称',
        'taskCenter.detail.fields.partName': '所属模块',
        'taskCenter.detail.fields.milestoneName': '里程碑',
        'taskCenter.detail.fields.typeDesc': '任务类型',
        'taskCenter.detail.fields.urgencyDesc': '优先级',
        'taskCenter.detail.fields.statusDesc': '状态',
        'taskCenter.detail.fields.deadlineTime': '要求完成时间',
        'taskCenter.detail.fields.startTime': '开始时间',
        'taskCenter.detail.fields.endTime': '结束时间',
        'taskCenter.detail.fields.closeTime': '关闭时间',
        'taskCenter.detail.fields.creatorName': '创建人',
        'taskCenter.detail.fields.createTime': '创建时间',
        'taskCenter.detail.fields.updatorName': '更新人',
        'taskCenter.detail.fields.updateTime': '更新时间',
        'common.close': '关闭',
      };
      return map[key] ?? key;
    },
  }),
}));

const { default: TaskCenterDetailModal } = await import('@/renderer/pages/task-center/TaskCenterDetailModal');

const item = {
  id: '1',
  name: 'Task A',
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
  deadlineTime: '2024-04-12',
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
  content: 'Long content here...',
  remark: 'A remark',
  raw: { extraField: 'extra' },
};

describe('TaskCenterDetailModal', () => {
  it('renders sections and content', () => {
    render(<TaskCenterDetailModal visible item={item} onClose={vi.fn()} />);
    expect(screen.getByText('Long content here...')).toBeTruthy();
    // Descriptions wraps values; use a permissive matcher
    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('BD-AI-T001'))).length).toBeGreaterThan(0);
  });

  it('toggles raw fields on click', () => {
    render(<TaskCenterDetailModal visible item={item} onClose={vi.fn()} />);
    expect(screen.queryByText(/extraField/)).toBeNull();
    fireEvent.click(screen.getByText('展开原始字段'));
    expect(screen.getByText(/extraField/)).toBeTruthy();
    fireEvent.click(screen.getByText('收起原始字段'));
    expect(screen.queryByText(/extraField/)).toBeNull();
  });

  it('calls onClose when cancel/ok button clicked', () => {
    const onClose = vi.fn();
    render(<TaskCenterDetailModal visible item={item} onClose={onClose} />);
    // The Modal's cancel (×) icon and ok button both invoke onClose
    const closeButton = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('关闭') || b.getAttribute('aria-label') === 'Close');
    if (closeButton) fireEvent.click(closeButton);
    // It's fine if closeButton isn't found — the test only requires onClose is wired.
    // Click the OK button by testid — two buttons now exist (primary "开始任务" + secondary "关闭")
    const okBtn = screen.getAllByText('关闭').find((b) => b.closest('button')) as HTMLElement;
    fireEvent.click(okBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "开始任务" button that triggers a "功能正在开发" toast', () => {
    render(<TaskCenterDetailModal visible item={item} onClose={vi.fn()} />);
    const startBtn = screen.getByTestId('task-detail-start');
    expect(startBtn.textContent).toContain('开始任务');
    fireEvent.click(startBtn);
    expect(messageInfoMock).toHaveBeenCalledWith('功能正在开发');
  });
});
