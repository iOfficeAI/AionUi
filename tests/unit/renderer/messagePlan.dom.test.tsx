/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessagePlan } from '@/common/chat/chatLib';
import MessagePlan, { findLatestActivePlan } from '@/renderer/pages/conversation/Messages/components/MessagePlan';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      if (key === 'messages.plan.progress') return `Step ${options?.current} of ${options?.total}`;
      if (key === 'messages.scrollToBottom') return 'Scroll to bottom';
      return key.split('.').at(-1) ?? key;
    },
  }),
}));

const createMessage = (entries: IMessagePlan['content']['entries'], id = 'plan-1'): IMessagePlan => ({
  id,
  msg_id: id,
  conversation_id: 'conversation-1',
  type: 'plan',
  position: 'left',
  content: {
    session_id: 'session-1',
    entries,
  },
});

describe('MessagePlan', () => {
  it('keeps only progress visible until the pointer enters the floating plan', () => {
    render(
      <MessagePlan
        message={createMessage([
          { content: 'Inspect the task', status: 'completed' },
          { content: 'Implement the UI', status: 'in_progress' },
          { content: 'Verify the result', status: 'pending' },
        ])}
      />
    );

    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('message-plan-progress-icon')).toHaveAttribute('data-running', 'true');
    expect(screen.getByTestId('message-plan-progress-icon').querySelector('.arco-spin')).not.toBeNull();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId('message-plan').firstElementChild as HTMLElement);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByLabelText('completed: Inspect the task')).toBeInTheDocument();
    expect(screen.getByLabelText('in_progress: Implement the UI')).toBeInTheDocument();
    expect(screen.getByLabelText('pending: Verify the result')).toBeInTheDocument();
  });

  it('collapses when the pointer leaves and navigates to the latest content on click', () => {
    const onNavigateToLatest = vi.fn();
    render(
      <MessagePlan
        message={createMessage([{ content: 'Inspect the task', status: 'in_progress' }])}
        onNavigateToLatest={onNavigateToLatest}
      />
    );

    const plan = screen.getByTestId('message-plan');
    const trigger = plan.firstElementChild as HTMLElement;
    const toggle = screen.getByRole('button', { name: 'Scroll to bottom, Step 1 of 1' });

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onNavigateToLatest).toHaveBeenCalledTimes(1);
  });

  it('hides empty plans and selects the latest visible unfinished plan', () => {
    const activePlan = createMessage([{ content: 'Implement the UI', status: 'in_progress' }], 'active-plan');
    const completedPlan = createMessage([{ content: 'Old task', status: 'completed' }], 'completed-plan');
    const hiddenPlan = {
      ...createMessage([{ content: 'Hidden task', status: 'pending' }], 'hidden-plan'),
      hidden: true,
    };
    const { rerender } = render(<MessagePlan message={createMessage([])} />);

    expect(screen.queryByTestId('message-plan')).not.toBeInTheDocument();
    expect(findLatestActivePlan([completedPlan, activePlan, hiddenPlan])).toBe(activePlan);
    expect(findLatestActivePlan([activePlan, completedPlan])).toBeUndefined();
    expect(findLatestActivePlan([completedPlan])).toBeUndefined();

    rerender(<MessagePlan message={completedPlan} />);
    expect(screen.getByText('Step 1 of 1')).toBeInTheDocument();
    expect(screen.getByTestId('message-plan-progress-icon')).toHaveAttribute('data-running', 'false');
  });
});
