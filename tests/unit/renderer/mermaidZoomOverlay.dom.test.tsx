/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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

const SVG = '<svg style="max-width: 100%; height: auto; display: block;" width="200" height="100"></svg>';

const getScale = (el: HTMLElement): number => {
  const match = /scale\(([\d.]+)\)/.exec(el.style.transform);
  if (!match) throw new Error(`no scale in transform: ${el.style.transform}`);
  return parseFloat(match[1]);
};

const renderOverlay = (onClose = vi.fn()) => render(<MermaidZoomOverlay svg={SVG} onClose={onClose} />);

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

  it('lifts the inline max-width so the diagram keeps its natural size', () => {
    renderOverlay();
    const content = screen.getByTestId('mermaid-zoom-content');
    expect(content.innerHTML).toContain('max-width: none');
    expect(content.innerHTML).not.toContain('max-width: 100%');
  });

  it('zooms in and out with the mouse wheel', () => {
    renderOverlay();
    const overlay = screen.getByTestId('mermaid-zoom-overlay');
    const content = screen.getByTestId('mermaid-zoom-content');

    fireEvent.wheel(overlay, { deltaY: -100 });
    expect(getScale(content)).toBeCloseTo(1.1);

    fireEvent.wheel(overlay, { deltaY: 100 });
    expect(getScale(content)).toBeCloseTo(1);
  });

  it('clamps the scale between 0.1 and 10 when zooming with the wheel', () => {
    renderOverlay();
    const overlay = screen.getByTestId('mermaid-zoom-overlay');
    const content = screen.getByTestId('mermaid-zoom-content');

    for (let i = 0; i < 50; i += 1) fireEvent.wheel(overlay, { deltaY: -100 });
    expect(getScale(content)).toBeCloseTo(10);

    for (let i = 0; i < 120; i += 1) fireEvent.wheel(overlay, { deltaY: 100 });
    expect(getScale(content)).toBeCloseTo(0.1);
  });

  it('zooms with the toolbar buttons and resets to the fit scale', () => {
    renderOverlay();
    const content = screen.getByTestId('mermaid-zoom-content');

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-in'));
    expect(getScale(content)).toBeCloseTo(1.2);

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-in'));
    expect(getScale(content)).toBeCloseTo(1.44);

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-out'));
    expect(getScale(content)).toBeCloseTo(1.2);

    fireEvent.click(screen.getByTestId('mermaid-overlay-zoom-reset'));
    expect(getScale(content)).toBeCloseTo(1);
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
