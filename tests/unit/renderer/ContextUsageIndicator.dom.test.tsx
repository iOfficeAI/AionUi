/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

// The component formats numbers against the app language, so the tests drive
// the locale from here — never from the host OS, which would make the decimal
// separator depend on whichever machine runs the suite.
let mockLanguage = 'en-US';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const text = fallback ?? key;
      if (!options) return text;
      return Object.entries(options).reduce((acc, [name, value]) => acc.replaceAll(`{{${name}}}`, String(value)), text);
    },
    i18n: { language: mockLanguage },
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

import ContextUsageIndicator, {
  formatCostAmount,
  formatTokenCount,
} from '@/renderer/components/agent/ContextUsageIndicator';

describe('ContextUsageIndicator', () => {
  beforeEach(() => {
    mockLanguage = 'en-US';
  });

  it('renders a progress ring and a percentage popover when the window size is known', () => {
    const { container, getByTestId } = render(
      <ContextUsageIndicator tokenUsage={{ total_tokens: 12_600 }} context_limit={262_144} />
    );

    const ring = container.querySelector('.context-usage-indicator') as HTMLElement;
    expect(ring.style.width).toBe('32px');
    expect(ring.style.height).toBe('32px');
    const progressSvg = ring.querySelector('svg');
    expect(progressSvg?.getAttribute('width')).toBe('20');
    expect(progressSvg?.getAttribute('height')).toBe('20');
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

  it('shows session cost and per-turn breakdown when the agent reported them', () => {
    const { getByTestId } = render(
      <ContextUsageIndicator
        tokenUsage={{
          total_tokens: 14_118,
          cost: { amount: 0.42, currency: 'USD' },
          breakdown: {
            input_tokens: 14_088,
            output_tokens: 30,
            cached_read_tokens: 14_080,
            thought_tokens: 0,
          },
        }}
        context_limit={1_000_000}
      />
    );

    const popover = getByTestId('popover-content').textContent ?? '';
    expect(popover).toContain('Session cost');
    expect(popover).toContain('$0.42');
    expect(popover).toContain('Input 14.1K');
    expect(popover).toContain('Output 30');
    expect(popover).toContain('Cache read 14.1K');
    // Zero-valued optional counters are noise, not information.
    expect(popover).not.toContain('Thinking');
  });

  it('formats cost, percentage and token counts in the app language, not the host locale', () => {
    mockLanguage = 'de-DE';
    const { getByTestId } = render(
      <ContextUsageIndicator
        tokenUsage={{
          total_tokens: 14_118,
          cost: { amount: 0.42, currency: 'USD' },
          breakdown: { input_tokens: 14_088 },
        }}
        context_limit={1_000_000}
      />
    );

    const popover = getByTestId('popover-content').textContent ?? '';
    // German writes the decimal separator as a comma and puts the currency
    // symbol last — for every number in the popover, not just the cost.
    expect(popover).toContain('0,42\u00a0$');
    expect(popover).toContain('1,4\u00a0%');
    expect(popover).toContain('14,1K');
    expect(popover).toContain('Input 14,1K');
    // The separators must not be mixed within one popover.
    expect(popover).not.toContain('14.1K');
    expect(popover).not.toContain('$0.42');
  });

  it('omits cost and breakdown lines when the agent reported neither', () => {
    const { getByTestId } = render(
      <ContextUsageIndicator tokenUsage={{ total_tokens: 12_600 }} context_limit={262_144} />
    );

    const popover = getByTestId('popover-content').textContent ?? '';
    expect(popover).not.toContain('Session cost');
    expect(popover).not.toContain('Input');
  });
});

describe('formatTokenCount', () => {
  it('formats thousands and millions', () => {
    expect(formatTokenCount(999, 'en-US')).toBe('999');
    expect(formatTokenCount(12_600, 'en-US')).toBe('12.6K');
    expect(formatTokenCount(1_000_000, 'en-US', true)).toBe('1M');
  });

  it('keeps the K/M suffix but localises the decimal separator', () => {
    // Intl compact notation is not usable here: de-DE renders 12600 as
    // "12.600", which reads as a grouped integer rather than a compact one.
    expect(formatTokenCount(12_600, 'de-DE')).toBe('12,6K');
    expect(formatTokenCount(262_144, 'fr-FR')).toBe('262,1K');
    expect(formatTokenCount(1_000_000, 'de-DE', true)).toBe('1M');
  });

  it('collapses a trailing zero decimal exactly as before', () => {
    // 1.04M renders as "1.0M" at one decimal, so it collapses to "1M".
    expect(formatTokenCount(1_040_000, 'en-US', true)).toBe('1M');
    expect(formatTokenCount(1_040_000, 'en-US')).toBe('1.0M');
  });
});

describe('formatCostAmount', () => {
  it('formats in the given app language', () => {
    expect(formatCostAmount({ amount: 0.42, currency: 'USD' }, 'en-US')).toBe('$0.42');
    expect(formatCostAmount({ amount: 0.42, currency: 'USD' }, 'de-DE')).toBe('0,42\u00a0$');
  });

  it('keeps four fraction digits for ordinary amounts', () => {
    expect(formatCostAmount({ amount: 0, currency: 'USD' }, 'en-US')).toBe('$0.00');
    expect(formatCostAmount({ amount: 0.0001, currency: 'USD' }, 'en-US')).toBe('$0.0001');
    expect(formatCostAmount({ amount: 1.2345, currency: 'USD' }, 'en-US')).toBe('$1.2345');
    expect(formatCostAmount({ amount: 12.3, currency: 'USD' }, 'en-US')).toBe('$12.30');
    // Significant digits applied across the whole range would render this as
    // "$1,200"; large amounts must keep their fraction digits.
    expect(formatCostAmount({ amount: 1234.5678, currency: 'USD' }, 'en-US')).toBe('$1,234.5678');
  });

  it('does not round a sub-cent charge down to "$0.00"', () => {
    // A single cheap turn bills fractions of a cent. Four fraction digits round
    // these to zero, which reads as free.
    expect(formatCostAmount({ amount: 0.00003, currency: 'USD' }, 'en-US')).toBe('$0.00003');
    expect(formatCostAmount({ amount: 0.000012, currency: 'USD' }, 'en-US')).toBe('$0.000012');
    expect(formatCostAmount({ amount: 0.00003, currency: 'USD' }, 'de-DE')).toBe('0,00003\u00a0$');
  });

  it('falls back to "<amount> <code>" for a currency code Intl cannot render', () => {
    expect(formatCostAmount({ amount: 0.42, currency: 'US' }, 'en-US')).toBe('0.4200 US');
    // The fallback must honour significant digits too, or it reintroduces the
    // "$0.00" rounding it was meant to avoid.
    expect(formatCostAmount({ amount: 0.00003, currency: 'US' }, 'en-US')).toBe('0.00003 US');
  });
});
