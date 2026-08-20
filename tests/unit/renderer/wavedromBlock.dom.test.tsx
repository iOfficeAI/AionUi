/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const renderAnyMock = vi.hoisted(() => vi.fn());
const stringifyMock = vi.hoisted(() => vi.fn());
const openPreviewMock = vi.hoisted(() => vi.fn());

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
  usePreviewContext: () => ({ openPreview: openPreviewMock }),
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

const VALID_WAVEJSON = JSON.stringify({
  signal: [
    { name: 'clk', wave: 'p......' },
    { name: 'Data', wave: 'x345x.', data: ['a', 'b', 'c', 'd'] },
  ],
});

describe('WavedromBlock', () => {
  beforeEach(() => {
    renderAnyMock.mockReset().mockReturnValue(['svg', {}, '']);
    stringifyMock.mockReset().mockReturnValue('<svg viewBox="0 0 100 50" width="100"></svg>');
    openPreviewMock.mockReset();
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('renders valid WaveJSON into an SVG diagram using the light skin', async () => {
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    const diagram = await screen.findByTestId('wavedrom-diagram');
    expect(diagram.querySelector('svg')).not.toBeNull();
    expect(renderAnyMock).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ signal: expect.any(Array) }),
      {
        default: { name: 'default-skin' },
      }
    );
    expect(stringifyMock).toHaveBeenCalledTimes(1);
  });

  it('uses the dark skin when the app theme is dark', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    await screen.findByTestId('wavedrom-diagram');
    expect(renderAnyMock).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ signal: expect.any(Array) }),
      { dark: { name: 'dark-skin' } }
    );
  });

  it('caps narrow diagrams at their natural width so they render 1:1', async () => {
    stringifyMock.mockReturnValue('<svg viewBox="0 0 100 200" width="100%"></svg>');
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    const diagram = await screen.findByTestId('wavedrom-diagram');
    expect(diagram.querySelector('svg')?.getAttribute('style')).toContain('max-width: min(100%, 100px)');
  });

  it('falls back to the source view when the source is not valid JSON', async () => {
    render(<WavedromBlock code={'{ not valid json'} />);
    expect(await screen.findByTestId('wavedrom-source')).toHaveTextContent('{ not valid json');
    expect(screen.queryByTestId('wavedrom-diagram')).toBeNull();
    expect(renderAnyMock).not.toHaveBeenCalled();
  });

  it('falls back to the source view when no signal/assign/reg lanes are present', async () => {
    render(<WavedromBlock code={'{"foo": "bar"}'} />);
    expect(await screen.findByTestId('wavedrom-source')).toHaveTextContent('{"foo": "bar"}');
    expect(screen.queryByTestId('wavedrom-diagram')).toBeNull();
  });

  it('toggles between preview and source views', async () => {
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    await screen.findByTestId('wavedrom-diagram');

    fireEvent.mouseDown(screen.getByText('preview.source'), { button: 0 });
    expect(await screen.findByTestId('wavedrom-source')).toHaveTextContent(VALID_WAVEJSON);

    fireEvent.mouseDown(screen.getByText('preview.preview'), { button: 0 });
    expect(await screen.findByTestId('wavedrom-diagram')).toBeInTheDocument();
  });

  it('copies the source when the copy button is clicked', async () => {
    const { copyText } = await import('@/renderer/utils/ui/clipboard');
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    await screen.findByTestId('wavedrom-diagram');
    fireEvent.click(screen.getByTestId('wavedrom-copy'));
    expect(copyText).toHaveBeenCalledWith(VALID_WAVEJSON);
  });

  it('opens the source in the preview panel with a wavedrom fence', async () => {
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    await screen.findByTestId('wavedrom-diagram');
    fireEvent.click(screen.getByTestId('wavedrom-open-in-panel'));
    expect(openPreviewMock).toHaveBeenCalledWith(
      `\`\`\`wavedrom\n${VALID_WAVEJSON}\n\`\`\``,
      'markdown',
      expect.objectContaining({ editable: false })
    );
  });

  it('tolerates comments and trailing commas (JSON5 parsing)', async () => {
    const lenient = '{ signal: [{ name: "clk", wave: "p..." }], } // comment';
    render(<WavedromBlock code={lenient} />);
    const diagram = await screen.findByTestId('wavedrom-diagram');
    expect(diagram.querySelector('svg')).not.toBeNull();
  });
});
