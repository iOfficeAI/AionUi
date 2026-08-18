/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const renderMock = vi.hoisted(() => vi.fn());

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: renderMock },
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-syntax-highlighter', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <pre data-testid='mermaid-source'>{children}</pre>,
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({ vs: {}, vs2015: {} }));

vi.mock('@arco-design/web-react', () => ({
  Message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

// icon-park icons render as clickable spans that forward data-testid/title/onClick.
vi.mock('@icon-park/react', () => {
  const makeIcon =
    (name: string) =>
    ({
      ['data-testid']: testId,
      title,
      onClick,
    }: {
      ['data-testid']?: string;
      title?: string;
      onClick?: () => void;
    }) => <span data-icon={name} data-testid={testId} title={title} onClick={onClick} />;
  return {
    Copy: makeIcon('copy'),
    PreviewOpen: makeIcon('preview-open'),
    ZoomIn: makeIcon('zoom-in'),
    ZoomOut: makeIcon('zoom-out'),
    Refresh: makeIcon('refresh'),
  };
});

import MermaidBlock from '@/renderer/components/Markdown/MermaidBlock';

describe('MermaidBlock pan/zoom', () => {
  beforeEach(() => {
    renderMock.mockReset().mockResolvedValue({ svg: '<svg width="120" height="80"></svg>' });
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('renders a static diagram without zoom controls by default', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    // Default path scrolls natively and exposes no zoom controls.
    expect(diagram.style.overflowX).toBe('auto');
    expect(screen.queryByTestId('mermaid-zoom-in')).toBeNull();
    expect(screen.queryByTestId('mermaid-zoom-reset')).toBeNull();
  });

  it('shows zoom controls and applies/resets scale when enablePanZoom is set', async () => {
    render(<MermaidBlock code={'graph TD; A-->B'} enablePanZoom />);
    const diagram = await screen.findByTestId('mermaid-diagram');
    // Pan viewport clips (hidden overflow) instead of native scroll.
    expect(diagram.style.overflow).toBe('hidden');

    const inner = diagram.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('scale(1)');

    fireEvent.click(screen.getByTestId('mermaid-zoom-in'));
    expect(inner.style.transform).toContain('scale(1.25)');

    fireEvent.click(screen.getByTestId('mermaid-zoom-out'));
    expect(inner.style.transform).toContain('scale(1)');

    fireEvent.click(screen.getByTestId('mermaid-zoom-in'));
    fireEvent.click(screen.getByTestId('mermaid-zoom-reset'));
    expect(inner.style.transform).toContain('translate(0px, 0px) scale(1)');
  });
});
