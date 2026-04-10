/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'common.unit.second_short') return options?.defaultValue || 's';
      if (key === 'common.unit.minute_short') return options?.defaultValue || 'm';
      if (key === 'conversation.chat.processing') return options?.defaultValue || 'Processing...';
      return key;
    },
  }),
}));

// Mock ThemeContext
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'dark' }),
}));

// Mock @arco-design/web-react
vi.mock('@arco-design/web-react', () => ({
  Spin: () => <div data-testid='spin' />,
  Tag: ({ children }: { children: React.ReactNode }) => <div data-testid='tag'>{children}</div>,
}));

describe('ThoughtDisplay Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render null when not running and no thought data', () => {
    const { container } = render(<ThoughtDisplay running={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render elapsed time during processing (short duration)', () => {
    render(<ThoughtDisplay running={true} />);

    // Initial: (0s)
    expect(screen.getByText(/\(0s\)/)).toBeTruthy();

    // Advance 45s
    act(() => {
      vi.advanceTimersByTime(45000);
    });

    expect(screen.getByText(/\(45s\)/)).toBeTruthy();
  });

  it('should render formatted elapsed time (long duration 75s -> 1m 15s)', () => {
    render(<ThoughtDisplay running={true} />);

    // Advance 75s
    act(() => {
      vi.advanceTimersByTime(75000);
    });

    expect(screen.getByText(/\(1m 15s\)/)).toBeTruthy();
  });

  it('should render thought subject as a tag', () => {
    render(
      <ThoughtDisplay thought={{ subject: 'Reading file', description: 'Reading package.json' }} running={true} />
    );

    const tag = screen.getByTestId('tag');
    expect(tag.textContent).toBe('Reading file');
    expect(screen.getByText('Reading package.json')).toBeTruthy();
  });
});
