/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Close, Refresh, ZoomIn, ZoomOut } from '@icon-park/react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getSvgIntrinsicSize, type DiagramSize } from './markdownUtils';

type MermaidZoomOverlayProps = {
  svg: string;
  onClose: () => void;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const BUTTON_ZOOM_FACTOR = 1.2;
const WHEEL_ZOOM_FACTOR = 1.1;
// Viewport padding used when auto-fitting the diagram on open.
const FIT_PADDING = 80;
// Overlay viewport caps (percentage of the window) for deeply zoomed diagrams.
const MAX_BOX_WIDTH = '90vw';
const MAX_BOX_HEIGHT = '85vh';

const toolbarButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  cursor: 'pointer',
};

// MermaidBlock injects `max-width: min(100%, <natural width>)` into the SVG root
// so inline diagrams never stretch past their natural size. Drop that cap here:
// the overlay panel already sizes the wrapper from the natural dimensions and
// the SVG must fill it.
const stripInlineMaxWidth = (svg: string): string =>
  svg.replace(/<svg\b[^>]*>/i, (tag) => tag.replace(/max-width\s*:\s*[^;"']+;?/gi, ''));

/**
 * Fullscreen mermaid viewer opened by clicking a rendered diagram.
 *
 * Interaction follows the classic lightbox pattern: wheel zooms around the fit
 * scale (0.1x-10x), dragging pans, ESC / backdrop click / the close button close
 * it. Visuals stick to AionUi tokens: Arco mask, --bg-* panels and icon-park icons
 * in the same order as the inline MermaidBlock header (zoom out / zoom in /
 * reset), plus a close action.
 *
 * Sizing: the card hugs the diagram's natural aspect ratio and grows with the
 * zoom level. The overlay root is the only clip window, so content is cut off
 * only at the screen edges — never by a smaller panel while free space is still
 * available. Pan moves the card across the screen; deep zooms clip at the
 * viewport and stay draggable. The open scale is a contain-fit against the
 * viewport (padding 80px), so whichever side of the diagram is larger
 * constrains the fit — a tall diagram fits by height instead of stretching
 * across the screen.
 */
function MermaidZoomOverlay({ svg, onClose }: MermaidZoomOverlayProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<DiagramSize | null>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const initialScaleRef = useRef(1);

  const overlaySvg = useMemo(() => stripInlineMaxWidth(svg), [svg]);

  // Resolve the natural diagram size (viewBox first, then a DOM measurement for
  // SVGs without one).
  useLayoutEffect(() => {
    if (base) return;
    const intrinsic = getSvgIntrinsicSize(overlaySvg);
    if (intrinsic) {
      setBase(intrinsic);
      return;
    }
    const svgElement = overlayRef.current?.querySelector('svg');
    const width = svgElement?.scrollWidth || svgElement?.clientWidth;
    const height = svgElement?.scrollHeight || svgElement?.clientHeight;
    if (width && height) setBase({ width, height });
  }, [overlaySvg, base]);

  // Contain-fit the diagram into the viewport: the larger side constrains the
  // scale so neither dimension overflows.
  useLayoutEffect(() => {
    if (!base) return;
    const fitScale = Math.min(
      (window.innerWidth - FIT_PADDING * 2) / base.width,
      (window.innerHeight - FIT_PADDING * 2) / base.height
    );
    const clamped = Math.min(Math.max(fitScale, MIN_SCALE), MAX_SCALE);
    initialScaleRef.current = clamped;
    setScale(clamped);
  }, [base]);

  // Wheel zoom needs a native listener: React's root wheel listeners are
  // passive, so preventDefault via the synthetic event cannot stop page scroll.
  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((prev) => {
        const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor));
      });
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);

  // ESC closes.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const zoomBy = (factor: number) => setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor)));
  const resetView = () => {
    setScale(initialScaleRef.current);
    setTranslate({ x: 0, y: 0 });
  };

  const handlePanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: translate.x,
      originY: translate.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handlePanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setTranslate({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
  };

  // With a known natural size the card is an explicit box hugging the diagram at
  // its rendered size — uncapped, so it only stops growing past the screen edges
  // where the overlay root clips it. Without one, fall back to the natural SVG
  // layout with a transform scale.
  const contentStyle: React.CSSProperties = base
    ? { width: base.width * scale, height: base.height * scale }
    : { maxWidth: MAX_BOX_WIDTH, maxHeight: MAX_BOX_HEIGHT };
  // Pan transforms the card itself: the overlay root is the fixed clip window,
  // so every part of an oversized diagram stays reachable by dragging.
  const diagramTransform = base
    ? `translate(${translate.x}px, ${translate.y}px)`
    : `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;

  return createPortal(
    <div
      ref={overlayRef}
      data-testid='mermaid-zoom-overlay'
      role='dialog'
      aria-modal='true'
      aria-label={t('preview.mermaidTitle')}
      onClick={(event: React.MouseEvent) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'var(--color-bg-mask, rgba(29, 33, 41, 0.6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 10001,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          background: 'var(--bg-2)',
          border: '1px solid var(--bg-3)',
          borderRadius: '8px',
        }}
      >
        <button
          type='button'
          data-testid='mermaid-overlay-zoom-out'
          title={t('preview.zoomOut')}
          style={toolbarButtonStyle}
          onClick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)}
        >
          <ZoomOut theme='outline' size='16' fill='var(--text-secondary)' />
        </button>
        <button
          type='button'
          data-testid='mermaid-overlay-zoom-in'
          title={t('preview.zoomIn')}
          style={toolbarButtonStyle}
          onClick={() => zoomBy(BUTTON_ZOOM_FACTOR)}
        >
          <ZoomIn theme='outline' size='16' fill='var(--text-secondary)' />
        </button>
        <button
          type='button'
          data-testid='mermaid-overlay-zoom-reset'
          title={t('preview.zoomReset')}
          style={toolbarButtonStyle}
          onClick={resetView}
        >
          <Refresh theme='outline' size='16' fill='var(--text-secondary)' />
        </button>
        <button
          type='button'
          data-testid='mermaid-overlay-close'
          title={t('common.close')}
          style={toolbarButtonStyle}
          onClick={onClose}
        >
          <Close theme='outline' size='16' fill='var(--text-secondary)' />
        </button>
      </div>

      <div
        data-testid='mermaid-zoom-content'
        onPointerDown={handlePanPointerDown}
        onPointerMove={handlePanPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        style={{
          padding: '12px',
          background: 'var(--bg-1)',
          borderRadius: '8px',
          flexShrink: 0,
          cursor: isPanning ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          transform: diagramTransform,
          ...contentStyle,
        }}
        dangerouslySetInnerHTML={{ __html: overlaySvg }}
      />

      <div
        data-testid='mermaid-zoom-hint'
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '6px 12px',
          background: 'var(--bg-2)',
          border: '1px solid var(--bg-3)',
          borderRadius: '8px',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          lineHeight: '20px',
          pointerEvents: 'none',
        }}
      >
        {t('preview.mermaidZoomHint')}
      </div>
    </div>,
    document.body
  );
}

export default React.memo(MermaidZoomOverlay);
