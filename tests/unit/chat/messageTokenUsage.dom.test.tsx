/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

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

import MessageTokenUsage from '@/renderer/pages/conversation/Messages/components/MessageTokenUsage';

describe('MessageTokenUsage', () => {
  beforeEach(() => {
    mockLanguage = 'en-US';
  });

  it('renders null when tokenUsage is null or empty', () => {
    const { container: c1 } = render(<MessageTokenUsage tokenUsage={null} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<MessageTokenUsage tokenUsage={{ total_tokens: 0 }} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders inline summary with Total, In, Out and Cache', () => {
    const { getByTestId } = render(
      <MessageTokenUsage
        tokenUsage={{
          total_tokens: 14_118,
          breakdown: {
            input_tokens: 14_088,
            output_tokens: 30,
            cached_read_tokens: 14_000,
          },
        }}
      />
    );

    const el = getByTestId('message-token-usage');
    expect(el.textContent).toContain('Total: 14.1K');
    expect(el.textContent).toContain('In: 14.1K');
    expect(el.textContent).toContain('Out: 30');
    expect(el.textContent).toContain('Cache: 14.0K');
  });

  it('renders popover with exact numbers and cost', () => {
    const { getByTestId } = render(
      <MessageTokenUsage
        tokenUsage={{
          total_tokens: 14_118,
          cost: { amount: 0.0042, currency: 'USD' },
          breakdown: {
            input_tokens: 14_088,
            output_tokens: 30,
            cached_read_tokens: 12_000,
            cached_write_tokens: 2_000,
            thought_tokens: 50,
          },
        }}
      />
    );

    const popover = getByTestId('popover-content').textContent ?? '';
    expect(popover).toContain('Reply tokens');
    expect(popover).toContain('14,118');
    expect(popover).toContain('14,088');
    expect(popover).toContain('30');
    expect(popover).toContain('12,000');
    expect(popover).toContain('2,000');
    expect(popover).toContain('50');
    expect(popover).toContain('$0.0042');
  });
});
