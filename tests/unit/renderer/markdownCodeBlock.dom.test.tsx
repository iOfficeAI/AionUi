/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CodeBlock from '@/renderer/components/Markdown/CodeBlock';

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
  Down: () => <span data-testid='down-icon' />,
  Up: () => <span data-testid='up-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

describe('CodeBlock — LaTeX vs Math code fences (#4311)', () => {
  it('renders fenced latex blocks as syntax-highlighted code, not KaTeX', () => {
    const latexSnippet = ['LHAM\\cite{muth2000lham}', '', 'Time-Split B-tree\\cite{lomet1989timesplit}'].join('\n');

    const { container } = render(<CodeBlock className='language-latex'>{latexSnippet}</CodeBlock>);

    // Must NOT render as a KaTeX display formula
    expect(container.querySelector('.katex-display')).toBeNull();
    expect(container.querySelector('.katex')).toBeNull();

    // Must render language label in header
    expect(screen.getByText('latex')).toBeDefined();

    // Must preserve LaTeX source code content
    expect(container.textContent).toContain('LHAM\\cite{muth2000lham}');
    expect(container.textContent).toContain('Time-Split B-tree\\cite{lomet1989timesplit}');
  });

  it('renders fenced tex blocks as syntax-highlighted code, not KaTeX', () => {
    const texSnippet = ['\\newcommand{\\foo}[1]{Hello #1}', '\\foo{World}'].join('\n');

    const { container } = render(<CodeBlock className='language-tex'>{texSnippet}</CodeBlock>);

    expect(container.querySelector('.katex-display')).toBeNull();
    expect(screen.getByText('tex')).toBeDefined();
    expect(container.textContent).toContain('\\newcommand{\\foo}[1]{Hello #1}');
  });

  it('renders fenced math blocks as KaTeX display formulas when valid', () => {
    const mathFormula = '\\sum_{i=1}^n x_i';

    const { container } = render(<CodeBlock className='language-math'>{mathFormula}</CodeBlock>);

    const katexDisplay = container.querySelector('.katex-display');
    expect(katexDisplay).not.toBeNull();
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('falls back to code-block rendering when fenced math block contains invalid KaTeX', () => {
    // Unsupported commands or malformed KaTeX throw ParseError with throwOnError: true
    const invalidMath = '\\unknownLatexCommandThatThrows{xyz}\n\\bad{';

    const { container } = render(<CodeBlock className='language-math'>{invalidMath}</CodeBlock>);

    // Fallback renders as code block
    expect(container.querySelector('.katex-display')).toBeNull();
    expect(screen.getByText('math')).toBeDefined();
    expect(container.textContent).toContain('\\unknownLatexCommandThatThrows{xyz}');
  });

  it('renders regular code blocks normally', () => {
    const tsCode = 'const x: number = 42;\nconsole.log(x);';

    const { container } = render(<CodeBlock className='language-typescript'>{tsCode}</CodeBlock>);

    expect(container.querySelector('.katex-display')).toBeNull();
    expect(screen.getByText('typescript')).toBeDefined();
    expect(container.textContent).toContain('const x: number = 42;');
  });
});
