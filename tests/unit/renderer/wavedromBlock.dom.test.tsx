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

// Realistic skin tree carrying the bundled dark skin's near-black style rules:
// the module-level dark-skin remap in WavedromBlock must rewrite these fills
// before renderAny receives the skin.
vi.mock('wavedrom/skins/dark.js', () => ({
  default: {
    dark: [
      'svg',
      {},
      [
        'style',
        {},
        '.s6{fill:#000000;stroke:none;fill-opacity:1}.s8{color:#000;fill:#000;fill-opacity:1;stroke:none}.s9{color:#000;fill:#0010c0;fill-opacity:1;stroke:none}.s10{color:#000;fill:#2d6500;fill-opacity:1;stroke:none}.s11{color:#000;fill:#870500;fill-opacity:1;stroke:none}.s12{color:#000;fill:#007a80;fill-opacity:1;stroke:none}.s13{color:#000;fill:#680066;fill-opacity:1;stroke:none}.s14{color:#000;fill:#5f5f5f;fill-opacity:1;stroke:none}.s15{color:#000;fill:#2e005e;fill-opacity:1;stroke:none}',
      ],
      ['defs', {}, ''],
      ['g', {}, ''],
    ],
  },
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

import WavedromBlock, { resolveWaveRenderTheme } from '@/renderer/components/Markdown/WavedromBlock';

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
    // The backdrop comes from the theme state (not the --bg-1 token) so it can
    // never drift away from the selected skin. (jsdom normalizes hex to rgb().)
    expect(diagram.style.backgroundColor).toBe('rgb(249, 250, 251)');
  });

  it('renders with the light skin even when the app theme is dark (light-only mode)', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    const diagram = await screen.findByTestId('wavedrom-diagram');
    // The theme mode is hardcoded to light-only, so the bundled dark skin is
    // never selected: the light skin's dark strokes land on the light backdrop
    // and stay readable whatever the app theme is.
    const [, , skin] = renderAnyMock.mock.calls[0];
    expect(skin).toEqual({ default: { name: 'default-skin' } });
    expect(diagram.style.backgroundColor).toBe('rgb(249, 250, 251)');
  });

  it('gives the zoom overlay card the same backdrop as the diagram', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<WavedromBlock code={VALID_WAVEJSON} />);
    const diagram = await screen.findByTestId('wavedrom-diagram');
    fireEvent.click(diagram);
    const card = await screen.findByTestId('diagram-zoom-content');
    // Light-only mode: the card follows the diagram's light backdrop.
    expect(card.style.background).toBe('rgb(249, 250, 251)');
  });

  it('remaps every near-black fill of the real bundled dark skin', async () => {
    const actual = await vi.importActual<typeof import('wavedrom/skins/dark.js')>('wavedrom/skins/dark.js');
    const { remapDarkSkinStyle } = await import('@/renderer/components/Markdown/WavedromBlock');
    const tree = actual.default.dark as unknown as [string, unknown, [string, unknown, string]];
    const remapped = remapDarkSkinStyle(tree[2][2]);
    expect(remapped).toContain('fill: #4a4a4a');
    expect(remapped).toContain('fill: #3050b8');
    expect(remapped).toContain('fill: #7a4ac0');
    expect(remapped).not.toMatch(
      /(\.s[0-9]+)\{[^}]*fill:\s*#(?:000000|000|0010c0|2d6500|870500|007a80|680066|5f5f5f|2e005e)/
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

describe('resolveWaveRenderTheme', () => {
  it('follows the app theme in auto mode', () => {
    expect(resolveWaveRenderTheme('auto', 'dark')).toBe('dark');
    expect(resolveWaveRenderTheme('auto', 'light')).toBe('light');
  });

  it('stays light in light-only mode regardless of the app theme', () => {
    expect(resolveWaveRenderTheme('light', 'dark')).toBe('light');
    expect(resolveWaveRenderTheme('light', 'light')).toBe('light');
  });
});
