/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import InlineMath from '@/renderer/components/Markdown/InlineMath';
import { copyText } from '@/renderer/utils/ui/clipboard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
});

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

describe('InlineMath Component', () => {
  it('renders inline math with rendered KaTeX content', () => {
    render(<InlineMath math='E = mc^2' />);
    expect(screen.getAllByText('E').length).toBeGreaterThan(0);
  });

  it('triggers copyText when inline math element is clicked', () => {
    render(<InlineMath math='E = mc^2' />);
    const mathElement = screen.getAllByText('E')[0];
    fireEvent.click(mathElement);
    expect(copyText).toHaveBeenCalledWith('E = mc^2');
  });
});
