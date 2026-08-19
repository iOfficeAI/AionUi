/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Close, Refresh, ZoomIn, ZoomOut } from '@icon-park/react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

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

// MermaidBlock's withResponsiveSvg injects `max-width: 100%` into the SVG root so
// inline diagrams fit the message column. Lift that cap in the overlay so the
// diagram keeps its natural size and can be zoomed freely.
const stripInlineMaxWidth = (svg: string): string => svg.replace(/max-width:\s*100%/gi, 'max-width: none');

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
 * Fullscreen mermaid viewer opened by clicking a rendered diagram.
 *
 * Interaction follows the classic lightbox pattern: wheel zooms around the fit
 * scale (0.1x-10x), dragging pans, ESC / backdrop click / the close button close
 * it. Visuals stick to AionUi tokens: Arco mask, --bg-* panels and icon-park icons
 * in the same order as the inline MermaidBlock header (zoom out / zoom in /
 * reset), plus a close action.
 */
function MermaidZoomOverlay({ svg, onClose }: MermaidZoomOverlayProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
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

  // Auto-fit the diagram to the viewport when the overlay opens (jsdom has no
  // layout, so measurement is skipped there and scale stays at 1).
  useLayoutEffect(() => {
    const svgElement = overlayRef.current?.querySelector('svg');
    if (!svgElement) return;
    const svgWidth = svgElement.scrollWidth || svgElement.clientWidth;
    const svgHeight = svgElement.scrollHeight || svgElement.clientHeight;
    if (svgWidth <= 0 || svgHeight <= 0) return;

    const fitScale = Math.min(
      (window.innerWidth - FIT_PADDING * 2) / svgWidth,
      (window.innerHeight - FIT_PADDING * 2) / svgHeight
    );
    const clamped = Math.min(Math.max(fitScale, MIN_SCALE), MAX_SCALE);
    initialScaleRef.current = clamped;
    setScale(clamped);
  }, [overlaySvg]);

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
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'hidden',
          cursor: isPanning ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
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
