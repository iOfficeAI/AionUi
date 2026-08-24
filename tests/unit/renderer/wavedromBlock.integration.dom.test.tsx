/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Integration test: exercises the REAL wavedrom render path (no module mocks —
// only the block's surroundings are stubbed). Locks the behavior the unit
// tests mock away: unique `svgcontent_<n>` root ids across multiple diagrams
// in one document, real skin geometry and the light skin's black strokes.
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const openPreviewMock = vi.hoisted(() => vi.fn());

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

const makeIcon = vi.hoisted(() => (name: string) => () => <span data-icon={name} />);

vi.mock('@icon-park/react', () => ({
  Copy: makeIcon('copy'),
  PreviewOpen: makeIcon('preview-open'),
  ZoomIn: makeIcon('zoom-in'),
  ZoomOut: makeIcon('zoom-out'),
  Refresh: makeIcon('refresh'),
  Close: makeIcon('close'),
}));

import WavedromBlock from '@/renderer/components/Markdown/WavedromBlock';

const WAVE = JSON.stringify({
  signal: [
    { name: 'clk', wave: 'p......' },
    { name: 'Data', wave: 'x345x.', data: ['a', 'b', 'c', 'd'] },
  ],
});

describe('WavedromBlock integration (real wavedrom)', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('renders real diagrams with unique svgcontent ids and skin geometry', async () => {
    render(
      <>
        <WavedromBlock code={WAVE} />
        <WavedromBlock code={WAVE} />
      </>
    );

    const diagrams = await screen.findAllByTestId('wavedrom-diagram');
    expect(diagrams).toHaveLength(2);
    const svgs = diagrams.map((diagram) => diagram.querySelector('svg'));
    expect(svgs[0]).not.toBeNull();
    expect(svgs[1]).not.toBeNull();

    const ids = svgs.map((svg) => svg?.getAttribute('id'));
    for (const id of ids) {
      expect(id).toMatch(/^svgcontent_\d+$/);
    }
    // Distinct root ids — the module-level allocation must not collide even when
    // both instances mount in the same commit.
    expect(new Set(ids).size).toBe(2);

    for (const svg of svgs as Element[]) {
      // The light skin paints black strokes (no dark skin in light-only mode).
      expect(svg.querySelector('style')?.textContent).toContain('.s1{fill:none;stroke:#000');
      // Real skin geometry: wave paths and lane labels come from the actual
      // render, not a mocked stringify.
      expect(svg.querySelectorAll('.s1').length).toBeGreaterThan(0);
      expect(svg.innerHTML).toContain('clk');
      expect(svg.innerHTML).toContain('Data');
      // Skin socket applied for index 0: the defs socket rect (its first child)
      // carries the skin's lane dimensions (xs/ys 20x20, xlabel 6, ym 15). The
      // rect is queried structurally — jsdom's scoped `#id` queries resolve
      // against the document and hit the duplicate socket id of the other
      // diagram, a jsdom quirk absent in real browsers.
      const socketRect = svg.querySelector('defs rect');
      expect(socketRect?.getAttribute('width')).toBe('20');
      expect(socketRect?.getAttribute('height')).toBe('20');
      expect(socketRect?.getAttribute('x')).toBe('6');
      expect(socketRect?.getAttribute('y')).toBe('15');
    }

    // A diagram mounted in a later commit reserves a fresh id from the same
    // module counter — it must not reuse an id from the earlier mounts.
    render(<WavedromBlock code={WAVE} />);
    const thirdDiagram = (await screen.findAllByTestId('wavedrom-diagram')).at(-1);
    const thirdId = thirdDiagram?.querySelector('svg')?.getAttribute('id');
    expect(thirdId).toMatch(/^svgcontent_\d+$/);
    expect(ids).not.toContain(thirdId);
  });

  it('opens the zoom overlay with the real rendered diagram inside', async () => {
    render(<WavedromBlock code={WAVE} />);
    const diagram = await screen.findByTestId('wavedrom-diagram');
    fireEvent.click(diagram);
    const content = await screen.findByTestId('diagram-zoom-content');
    const svg = content.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('id')).toMatch(/^svgcontent_\d+$/);
    expect(svg?.getAttribute('style')).toContain('width: 100%; height: 100%;');
  });
});
