/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const makeIcon = vi.hoisted(() => (name: string) => () => <span data-icon={name} />);

vi.mock('@icon-park/react', () => ({
  Close: makeIcon('close'),
  ZoomIn: makeIcon('zoom-in'),
  ZoomOut: makeIcon('zoom-out'),
  Refresh: makeIcon('refresh'),
}));

import MermaidZoomOverlay from '@/renderer/components/Markdown/MermaidZoomOverlay';

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

// jsdom viewport: 1024x768. With FIT_PADDING 80 the available box is 864x608;
// the overlay caps the panel at 90vw (921.6px) x 85vh (652.8px).
const SVG_WIDE =
  '<svg style="max-width: 100%; height: auto; display: block;" viewBox="0 0 200 100" width="100%"></svg>';
const SVG_TALL =
  '<svg style="max-width: 100%; height: auto; display: block;" viewBox="0 0 100 200" width="100%"></svg>';
const SVG_SQUARE =
  '<svg style="max-width: 100%; height: auto; display: block;" viewBox="0 0 100 100" width="100%"></svg>';

const getContent = (): HTMLElement => screen.getByTestId('mermaid-zoom-content');

// The host box carries plain pixel values (e.g. "864.0000000000001px").
const getBoxPixels = (value: string): number => {
  const match = /^([\d.]+)px$/.exec(value);
  if (!match) throw new Error(`no box size in: ${value}`);
  return parseFloat(match[1]);
};

const renderOverlay = (onClose = vi.fn(), svg = SVG_WIDE) => render(<MermaidZoomOverlay svg={svg} onClose={onClose} />);

describe('MermaidZoomOverlay', () => {
  it('renders toolbar controls and the interaction hint over the page', () => {
    renderOverlay();
    expect(screen.getByTestId('mermaid-zoom-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-overlay-zoom-in')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-overlay-zoom-out')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-overlay-zoom-reset')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-overlay-close')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-zoom-hint')).toHaveTextContent('preview.mermaidZoomHint');
  });

  it('strips the inline max-width so the diagram fills the sized panel', () => {
    renderOverlay();
    const content = getContent();
    expect(content.querySelector('svg')?.getAttribute('style')).not.toContain('max-width');
  });

  it('fits a wide diagram by its width', () => {
    renderOverlay(undefined, SVG_WIDE);
    const content = getContent();
    // fit = min(864/200, 608/100) = 4.32 -> 200x100 diagram at 864x432.
    expect(getBoxPixels(content.style.width)).toBeCloseTo(864);
    expect(getBoxPixels(content.style.height)).toBeCloseTo(432);
  });

  it('fits a tall diagram by its height instead of stretching by width', () => {
    renderOverlay(undefined, SVG_TALL);
    const content = getContent();
    // fit = min(864/100, 608/200) = 3.04 -> 100x200 diagram at 304x608.
    expect(getBoxPixels(content.style.width)).toBeCloseTo(304);
    expect(getBoxPixels(content.style.height)).toBeCloseTo(608);
  });

  it('zooms in and out with the mouse wheel', () => {
    renderOverlay(undefined, SVG_SQUARE);
    const overlay = screen.getByTestId('mermaid-zoom-overlay');
    const content = getContent();
    // fit = min(864/100, 608/100) = 6.08 -> 608x608.
    expect(getBoxPixels(content.style.width)).toBeCloseTo(608);

    fireEvent.wheel(overlay, { deltaY: -100 });
    expect(getBoxPixels(content.style.width)).toBeCloseTo(668.8);

    fireEvent.wheel(overlay, { deltaY: 100 });
    expect(getBoxPixels(content.style.width)).toBeCloseTo(608);
  });

  it('clamps the scale between 0.1 and 10 when zooming with the wheel', () => {
    renderOverlay(undefined, SVG_SQUARE);
    const overlay = screen.getByTestId('mermaid-zoom-overlay');
    const content = getContent();

    for (let i = 0; i < 50; i += 1) fireEvent.wheel(overlay, { deltaY: -100 });
    expect(getBoxPixels(content.style.width)).toBeCloseTo(1000);

    for (let i = 0; i < 120; i += 1) fireEvent.wheel(overlay, { deltaY: 100 });
    expect(getBoxPixels(content.style.width)).toBeCloseTo(10);
  });

  it('keeps the diagram uncapped while the screen has room', () => {
    renderOverlay(undefined, SVG_SQUARE);
    const overlay = screen.getByTestId('mermaid-zoom-overlay');
    const content = getContent();

    // 608 * 1.1^5 would have exceeded the old 90vw panel cap; the card must keep
    // growing instead of clipping the diagram at a smaller panel edge.
    for (let i = 0; i < 5; i += 1) fireEvent.wheel(overlay, { deltaY: -100 });
    expect(getBoxPixels(content.style.width)).toBeCloseTo(979.19);
    expect(content.style.overflow).toBe('');
  });

  it('zooms with the toolbar buttons and resets to the fit scale', () => {
    renderOverlay(undefined, SVG_SQUARE);
    const content = getContent();

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-in'));
    expect(getBoxPixels(content.style.width)).toBeCloseTo(729.6);

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-in'));
    expect(getBoxPixels(content.style.width)).toBeCloseTo(875.52);

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-out'));
    expect(getBoxPixels(content.style.width)).toBeCloseTo(729.6);

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-reset'));
    expect(getBoxPixels(content.style.width)).toBeCloseTo(608);
  });

  it('pans the diagram card across the screen so clipped sides stay reachable', () => {
    renderOverlay(undefined, SVG_SQUARE);
    const content = getContent();

    fireEvent.pointerDown(content, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(content, { pointerId: 1 });

    // The overlay root is the only clip window; the card itself moves.
    expect(content.style.transform).toContain('translate(50px, 30px)');
  });

  it('closes on ESC', () => {
    const onClose = vi.fn();
    renderOverlay(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop or the close button is clicked', () => {
    const onClose = vi.fn();
    renderOverlay(onClose);

    fireEvent.click(screen.getByTestId('mermaid-overlay-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mermaid-zoom-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('stays open when the diagram content itself is clicked', () => {
    const onClose = vi.fn();
    renderOverlay(onClose);
    fireEvent.click(screen.getByTestId('mermaid-zoom-content'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
