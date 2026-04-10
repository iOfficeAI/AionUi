/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import MessageThinking from '@/renderer/pages/conversation/Messages/components/MessageThinking';

// Mock react-i18next with support for specific keys
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'common.unit.second_short') return options?.defaultValue || 's';
      if (key === 'common.unit.minute_short') return options?.defaultValue || 'm';
      if (key === 'conversation.thinking.complete') return options?.defaultValue || 'Thought complete';
      return key;
    },
  }),
}));

// Mock @arco-design/web-react
vi.mock('@arco-design/web-react', () => ({
  Spin: () => <div data-testid='spin' />,
}));

describe('MessageThinking Component', () => {
  const mockMessage: any = {
    content: {
      content: 'Thinking details...',
      status: 'done',
      duration: 75000, // 1m 15s
      subject: 'Thought process',
    },
  };

  it('should render the thought summary with correct duration (75s -> 1m 15s)', () => {
    render(<MessageThinking message={mockMessage} />);

    // "Thought complete (1m 15s) — Thinking details..."
    const summary = screen.getByText(/1m 15s/);
    expect(summary).toBeTruthy();
    expect(summary.textContent).toContain('1m 15s');
  });

  it('should render 45s for duration less than a minute and not contain minute part', () => {
    const messageWithShortDuration = {
      ...mockMessage,
      content: { ...mockMessage.content, duration: 45000 },
    };
    render(<MessageThinking message={messageWithShortDuration} />);

    const summary = screen.getByText(/45s/);
    expect(summary).toBeTruthy();
    // Check that it doesn't contain the specific '1m' or '0m' pattern
    expect(summary.textContent).not.toMatch(/\dm/);
  });

  it('should show spinner when status is not done', () => {
    const runningMessage = {
      ...mockMessage,
      content: { ...mockMessage.content, status: 'thinking' },
    };
    render(<MessageThinking message={runningMessage} />);

    expect(screen.getByTestId('spin')).toBeTruthy();
  });
});
