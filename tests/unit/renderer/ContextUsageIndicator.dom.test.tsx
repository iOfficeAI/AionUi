/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const text = fallback ?? key;
      if (!options) return text;
      return Object.entries(options).reduce((acc, [name, value]) => acc.replaceAll(`{{${name}}}`, String(value)), text);
    },
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Popover: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
    <>
      {children}
      <div data-testid='popover-content'>{content}</div>
    </>
  ),
}));

import ContextUsageIndicator, { formatTokenCount } from '@/renderer/components/agent/ContextUsageIndicator';

describe('ContextUsageIndicator', () => {
  it('renders a progress ring and a percentage popover when the window size is known', () => {
    const { container, getByTestId } = render(
      <ContextUsageIndicator tokenUsage={{ total_tokens: 12_600 }} context_limit={262_144} />
    );

    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(getByTestId('popover-content').textContent).toContain('4.8% · 12.6K / 262.1K');
  });

  it('renders a hollow ring and a raw-count popover when the window size is unknown', () => {
    const { container, getByTestId } = render(
      <ContextUsageIndicator tokenUsage={{ total_tokens: 12_600 }} context_limit={0} />
    );

    // Track circle only — no progress arc, because a percentage against a
    // guessed denominator would lie.
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    const popover = getByTestId('popover-content').textContent ?? '';
    expect(popover).toContain('12.6K tokens used');
    expect(popover).toContain('Context window size unknown');
    expect(popover).not.toContain('%');
  });

  it('renders nothing without any usage report', () => {
    const { container } = render(<ContextUsageIndicator tokenUsage={null} context_limit={262_144} />);
    expect(container.querySelector('.context-usage-indicator')).toBeNull();
  });
});

describe('formatTokenCount', () => {
  it('formats thousands and millions', () => {
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(12_600)).toBe('12.6K');
    expect(formatTokenCount(1_000_000, true)).toBe('1M');
  });
});
