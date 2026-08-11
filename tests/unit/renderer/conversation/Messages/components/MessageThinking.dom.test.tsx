/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import MessageThinking from '@/renderer/pages/conversation/Messages/components/MessageThinking';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'common.unit.second_short') return options?.defaultValue || 's';
      if (key === 'common.unit.minute_short') return options?.defaultValue || 'm';
      if (key === 'conversation.thinking.complete') return options?.defaultValue || 'Thought complete';
      if (key === 'conversation.thinking.label') return options?.defaultValue || 'Thinking...';
      return key;
    },
  }),
}));

// Mock @arco-design/web-react
vi.mock('@arco-design/web-react', () => ({
  Spin: () => <div data-testid='spin' />,
}));

describe('MessageThinking Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
    const summary = screen.getByText(/1m 15s/);
    expect(summary).toBeTruthy();
  });

  it('should render 45s for duration less than a minute', () => {
    const messageWithShortDuration = {
      ...mockMessage,
      content: { ...mockMessage.content, duration: 45000 },
    };
    render(<MessageThinking message={messageWithShortDuration} />);
    const summary = screen.getByText(/45s/);
    expect(summary).toBeTruthy();
    expect(summary.textContent).not.toMatch(/\dm/);
  });

  it('should format active thinking elapsed time (timer test)', () => {
    const runningMessage = {
      ...mockMessage,
      content: { ...mockMessage.content, status: 'thinking' },
    };
    render(<MessageThinking message={runningMessage} />);

    // Initial (0s)
    expect(screen.getByText(/\(0s\)/)).toBeTruthy();

    // Advance 75 seconds to test minutes in elapsed time
    act(() => {
      vi.advanceTimersByTime(75000);
    });

    expect(screen.getByText(/\(1m 15s\)/)).toBeTruthy();
  });

  it('should show spinner and subject when thinking', () => {
    const runningMessage = {
      ...mockMessage,
      content: { ...mockMessage.content, status: 'thinking', subject: 'Analyzing' },
    };
    render(<MessageThinking message={runningMessage} />);

    expect(screen.getByTestId('spin')).toBeTruthy();
    expect(screen.getByText(/Analyzing/)).toBeTruthy();
  });
});
