/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Close, Refresh, ZoomIn, ZoomOut } from '@icon-park/react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

type MermaidZoomOverlayProps = {
  svg: string;
  onClose: () => void;
};

type DiagramSize = { width: number; height: number };

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

/**
 * Extract the diagram's natural size from the SVG markup so the overlay can fit by
 * the larger of its two sides instead of by the container width. Mermaid always
 * emits a viewBox; numeric width/height attributes are a fallback for hand-written
 * SVGs.
 */
const getSvgIntrinsicSize = (svg: string): DiagramSize | null => {
  const svgTag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!svgTag) return null;

  const viewBox = /viewBox\s*=\s*["']\s*[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*["']/i.exec(svgTag);
  if (viewBox) {
    const width = parseFloat(viewBox[1]);
    const height = parseFloat(viewBox[2]);
    if (width > 0 && height > 0) return { width, height };
  }

  const widthAttr = /width\s*=\s*["']([\d.]+)\s*(?:px)?["']/i.exec(svgTag);
  const heightAttr = /height\s*=\s*["']([\d.]+)\s*(?:px)?["']/i.exec(svgTag);
  if (widthAttr && heightAttr) {
    const width = parseFloat(widthAttr[1]);
    const height = parseFloat(heightAttr[1]);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
};

/**
 * Fullscreen mermaid viewer opened by clicking a rendered diagram.
 *
 * Interaction follows the classic lightbox pattern: wheel zooms around the fit
 * scale (0.1x-10x), dragging pans, ESC / backdrop click / the close button close
 * it. Visuals stick to AionUi tokens: Arco mask, --bg-* panels and icon-park icons
 * in the same order as the inline MermaidBlock header (zoom out / zoom in /
 * reset), plus a close action.
 *
 * Sizing: the panel hugs the diagram's natural aspect ratio. The open scale is a
 * contain-fit against the viewport (padding 80px), so whichever side of the
 * diagram is larger constrains the fit — a tall diagram fits by height instead of
 * stretching across the screen.
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

  // Resolve the natural diagram size (viewBox first, then a DOM measurement for
  // SVGs without one).
  useLayoutEffect(() => {
    if (base) return;
    const intrinsic = getSvgIntrinsicSize(svg);
    if (intrinsic) {
      setBase(intrinsic);
      return;
    }
    const svgElement = overlayRef.current?.querySelector('svg');
    const width = svgElement?.scrollWidth || svgElement?.clientWidth;
    const height = svgElement?.scrollHeight || svgElement?.clientHeight;
    if (width && height) setBase({ width, height });
  }, [svg, base]);

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

  // With a known natural size the panel is an explicit box hugging the diagram,
  // capped at ~90vw x ~85vh so deeply zoomed diagrams clip inside the panel
  // instead of overflowing the window. Without one, fall back to the natural
  // SVG layout with a transform scale.
  const contentStyle: React.CSSProperties = base
    ? {
        width: Math.min(base.width * scale, window.innerWidth * 0.9),
        height: Math.min(base.height * scale, window.innerHeight * 0.85),
      }
    : { maxWidth: MAX_BOX_WIDTH, maxHeight: MAX_BOX_HEIGHT };
  const contentTransform = base
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
          background: 'var(--bg-1)',
          borderRadius: '8px',
          overflow: 'hidden',
          flexShrink: 0,
          cursor: isPanning ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          transform: contentTransform,
          ...contentStyle,
        }}
      >
        <div
          style={base ? { width: base.width * scale, height: base.height * scale, flexShrink: 0 } : undefined}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

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
