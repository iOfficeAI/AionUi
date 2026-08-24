/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const renderAnyMock = vi.hoisted(() => vi.fn());
const stringifyMock = vi.hoisted(() => vi.fn());

vi.mock('wavedrom', () => ({
  default: { renderAny: renderAnyMock, onml: { stringify: stringifyMock } },
}));

vi.mock('wavedrom/skins/default.js', () => ({
  default: { default: { name: 'default-skin' } },
}));

vi.mock('wavedrom/skins/dark.js', () => ({
  default: { dark: { name: 'dark-skin' } },
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-syntax-highlighter', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <pre data-testid='wavedrom-source'>{children}</pre>,
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({ vs: {}, vs2015: {} }));

vi.mock('@arco-design/web-react', () => ({
  Message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

// icon-park icons render as clickable spans that forward data-testid/title/onClick.
const makeIcon = vi.hoisted(
  () =>
    (name: string) =>
    ({
      ['data-testid']: testId,
      title,
      onClick,
    }: {
      ['data-testid']?: string;
      title?: string;
      onClick?: () => void;
    }) => <span data-icon={name} data-testid={testId} title={title} onClick={onClick} />
);

vi.mock('@icon-park/react', () => ({
  Copy: makeIcon('copy'),
  PreviewOpen: makeIcon('preview-open'),
  ZoomIn: makeIcon('zoom-in'),
  ZoomOut: makeIcon('zoom-out'),
  Refresh: makeIcon('refresh'),
  Close: makeIcon('close'),
}));

import WavedromBlock from '@/renderer/components/Markdown/WavedromBlock';

// jsdom lacks the pointer capture API used by the drag handlers.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    value: vi.fn(() => false),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
});

const VALID_WAVEJSON = JSON.stringify({
  signal: [
    { name: 'clk', wave: 'p......' },
    { name: 'Data', wave: 'x345x.', data: ['a', 'b', 'c', 'd'] },
  ],
});

describe('WavedromBlock pan/zoom', () => {
  beforeEach(() => {
    renderAnyMock.mockReset().mockReturnValue(['svg', {}, '']);
    stringifyMock.mockReset().mockReturnValue('<svg viewBox="0 0 100 50" width="100"></svg>');
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('renders a static diagram without zoom controls by default', () => {
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    const diagram = screen.getByTestId('wavedrom-diagram');
    // Default path scrolls natively and exposes no zoom controls.
    expect(diagram.style.overflowX).toBe('auto');
    expect(screen.queryByTestId('wavedrom-zoom-in')).toBeNull();
    expect(screen.queryByTestId('wavedrom-zoom-reset')).toBeNull();
  });

  it('shows zoom controls and applies/resets scale when enablePanZoom is set', () => {
    render(<WavedromBlock code={VALID_WAVEJSON} enablePanZoom />);
    const diagram = screen.getByTestId('wavedrom-diagram');
    // Pan viewport clips (hidden overflow) instead of native scroll.
    expect(diagram.style.overflow).toBe('hidden');

    const inner = diagram.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('scale(1)');

    fireEvent.click(screen.getByTestId('wavedrom-zoom-in'));
    expect(inner.style.transform).toContain('scale(1.25)');

    fireEvent.click(screen.getByTestId('wavedrom-zoom-out'));
    expect(inner.style.transform).toContain('scale(1)');

    fireEvent.click(screen.getByTestId('wavedrom-zoom-in'));
    fireEvent.click(screen.getByTestId('wavedrom-zoom-reset'));
    expect(inner.style.transform).toContain('translate(0px, 0px) scale(1)');
  });

  it('opens the zoom overlay when the static diagram is clicked', () => {
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    const diagram = screen.getByTestId('wavedrom-diagram');
    fireEvent.click(diagram);
    expect(screen.getByTestId('diagram-zoom-overlay')).toBeInTheDocument();
  });

  it('opens the zoom overlay on click without panning when drag-to-pan is enabled', () => {
    render(<WavedromBlock code={VALID_WAVEJSON} enablePanZoom />);
    const diagram = screen.getByTestId('wavedrom-diagram');

    fireEvent.pointerDown(diagram, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(diagram, { pointerId: 1, clientX: 12, clientY: 11 });
    fireEvent.pointerUp(diagram, { pointerId: 1 });

    const inner = diagram.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('translate(0px, 0px) scale(1)');
    expect(screen.getByTestId('diagram-zoom-overlay')).toBeInTheDocument();
  });

  it('pans instead of opening the overlay when the pointer drags past the threshold', () => {
    render(<WavedromBlock code={VALID_WAVEJSON} enablePanZoom />);
    const diagram = screen.getByTestId('wavedrom-diagram');

    fireEvent.pointerDown(diagram, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(diagram, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(diagram, { pointerId: 1 });

    const inner = diagram.firstElementChild as HTMLElement;
    expect(inner.style.transform).toContain('translate(50px, 30px)');
    expect(screen.queryByTestId('diagram-zoom-overlay')).toBeNull();
  });

  it('closes the zoom overlay via its close button', () => {
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    fireEvent.click(screen.getByTestId('wavedrom-diagram'));
    expect(screen.getByTestId('diagram-zoom-overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('diagram-overlay-close'));
    expect(screen.queryByTestId('diagram-zoom-overlay')).toBeNull();
  });
});
