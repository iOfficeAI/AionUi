/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MarkdownView from '@/renderer/components/Markdown';

const copyTextMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/renderer/components/Markdown/ShadowView', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Capturing CodeBlock mock: exposes the pan/zoom opt-in as a DOM attribute so the
// test asserts the chat markdown surface opts Mermaid diagrams in.
vi.mock('@/renderer/components/Markdown/CodeBlock', () => ({
  __esModule: true,
  default: ({
    children,
    className,
    mermaidPanZoom,
  }: {
    children?: React.ReactNode;
    className?: string;
    mermaidPanZoom?: boolean;
  }) => (
    <code
      data-testid='code-block'
      data-class={className || ''}
      data-mermaid-pan-zoom={mermaidPanZoom ? 'true' : 'false'}
    >
      {children}
    </code>
  ),
}));

vi.mock('@/renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: copyTextMock,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('MarkdownView mermaid pan/zoom opt-in', () => {
  it('enables pan/zoom on mermaid fences rendered through the chat markdown view', () => {
    render(<MarkdownView>{'```mermaid\ngraph TD; A-->B\n```'}</MarkdownView>);
    const code = screen.getByTestId('code-block');
    expect(code).toHaveAttribute('data-class', 'language-mermaid');
    expect(code).toHaveAttribute('data-mermaid-pan-zoom', 'true');
  });

  it('forwards the opt-in for an empty mermaid fence', () => {
    render(<MarkdownView>{'```mermaid\n```'}</MarkdownView>);
    const code = screen.getByTestId('code-block');
    expect(code).toHaveAttribute('data-mermaid-pan-zoom', 'true');
  });

  it('keeps rendering plain code fences with their source intact', () => {
    render(<MarkdownView>{'```ts\nconst answer = 42;\n```'}</MarkdownView>);
    const code = screen.getByTestId('code-block');
    expect(code).toHaveAttribute('data-class', 'language-ts');
    expect(code).toHaveTextContent('const answer = 42;');
  });
});
