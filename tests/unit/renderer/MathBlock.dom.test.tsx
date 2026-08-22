/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import MathBlock from '@/renderer/components/Markdown/MathBlock';

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
      warning: vi.fn(),
    },
  };
});

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn(),
  }),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

describe('MathBlock Component', () => {
  const sampleMath = 'E = mc^2';

  it('renders header bar with <math> label and preview mode by default', () => {
    render(<MathBlock code={sampleMath} />);
    expect(screen.getByText('<math>')).toBeDefined();
    expect(screen.getByText('preview.preview')).toBeDefined();
    expect(screen.getByText('preview.source')).toBeDefined();
  });

  it('switches between preview and source view modes when clicked', () => {
    render(<MathBlock code={sampleMath} />);
    const sourceBtn = screen.getByText('preview.source');
    fireEvent.mouseDown(sourceBtn, { button: 0 });

    expect(screen.getByTestId('math-open-in-panel')).toBeDefined();

    const previewBtn = screen.getByText('preview.preview');
    fireEvent.mouseDown(previewBtn, { button: 0 });
  });
});
