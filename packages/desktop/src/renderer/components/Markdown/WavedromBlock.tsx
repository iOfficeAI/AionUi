/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import JSON5 from 'json5';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import WaveDrom, { type WaveSkin, type WaveSource } from 'wavedrom';
import waveSkinDark from 'wavedrom/skins/dark.js';
import waveSkinDefault from 'wavedrom/skins/default.js';

import { Message } from '@arco-design/web-react';
import { Copy, PreviewOpen, Refresh, ZoomIn, ZoomOut } from '@icon-park/react';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { copyText } from '@/renderer/utils/ui/clipboard';
import DiagramZoomOverlay from './DiagramZoomOverlay';
import { withResponsiveSvg } from './markdownUtils';

type WavedromBlockProps = {
  code: string;
  style?: React.CSSProperties;
  showOpenInPanelButton?: boolean;
  // Enable drag-to-pan + zoom buttons over the rendered diagram. Chat messages and
  // the preview panel opt in via CodeBlock; other callers keep diagrams static by
  // default. Wheel is left to the page so scrolling a long document past a diagram
  // never zooms it (matches the Mermaid blocks).
  enablePanZoom?: boolean;
};

// Module-level counter so every rendered diagram gets a unique `svgcontent_<n>`
// id (WaveDrom derives it from the index passed to renderAny); duplicate ids in
// the DOM would otherwise accumulate when several diagrams share a message.
let diagramIndex = 0;

const MIN_WAVE_SCALE = 0.25;
const MAX_WAVE_SCALE = 4;
const WAVE_ZOOM_STEP = 0.25;
// Pointer movement below this threshold counts as a click (opens the zoom
// overlay) instead of a pan, when drag-to-pan is enabled.
const PAN_CLICK_THRESHOLD = 4;

/**
 * Render WaveJSON source into a responsive SVG string, or null when the source
 * is not a valid waveform description. Parsing is lenient (JSON5, the same
 * parser the official WaveDrom editor uses) so hand-written or LLM-generated
 * WaveJSON with comments or trailing commas still renders; anything that does
 * not describe signal/assign/reg lanes falls back to the source view.
 */
const renderWaveSvg = (code: string, isDark: boolean): string | null => {
  const skin: WaveSkin = isDark ? waveSkinDark : waveSkinDefault;
  try {
    const parsed: unknown = JSON5.parse(code.trim());
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const source = parsed as WaveSource;
    const hasLanes = Array.isArray(source.signal) || Array.isArray(source.assign) || Array.isArray(source.reg);
    if (!hasLanes) return null;
    const tree = WaveDrom.renderAny(diagramIndex++, source, skin);
    return withResponsiveSvg(WaveDrom.onml.stringify(tree));
  } catch {
    return null;
  }
};

function WavedromBlock({ code, style, showOpenInPanelButton = true, enablePanZoom = false }: WavedromBlockProps) {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const preferredViewModeRef = useRef<'preview' | 'source' | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('source');
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  // Pan/zoom transform for the rendered diagram (only used when enablePanZoom).
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCode(code), 300);
    return () => clearTimeout(timer);
  }, [code]);

  useEffect(() => {
    const updateTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // Rendering is synchronous; the memo recomputes when debounced code or the
  // theme changes and returns null for invalid input (source view fallback).
  const svg = useMemo(() => renderWaveSvg(debouncedCode, currentTheme === 'dark'), [debouncedCode, currentTheme]);

  // Restore the user's preferred view once a fresh diagram renders; invalid
  // input stays on the source view. A re-render also replaces the overlay
  // content, so reset the pan/zoom view and close the overlay — a fresh diagram
  // must never leave the user staring at an off-screen, zoomed-in fragment of
  // the previous one.
  useEffect(() => {
    setViewMode(svg ? (preferredViewModeRef.current === 'source' ? 'source' : 'preview') : 'source');
    setTransform({ scale: 1, x: 0, y: 0 });
    setIsZoomOpen(false);
  }, [svg]);

  const codeTheme = currentTheme === 'dark' ? vs2015 : vs;
  const summary = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const previewTitle =
    summary && summary.length > 0
      ? `${t('preview.wavedromTitle')}: ${summary.slice(0, 48)}${summary.length > 48 ? '...' : ''}`
      : t('preview.wavedromTitle');

  const zoomBy = (delta: number) =>
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(MAX_WAVE_SCALE, Math.max(MIN_WAVE_SCALE, Math.round((prev.scale + delta) * 100) / 100)),
    }));
  const resetTransform = () => setTransform({ scale: 1, x: 0, y: 0 });

  const handlePanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handlePanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Stay in "click" territory until the pointer travels past the threshold so
    // a plain click opens the zoom overlay instead of nudging the diagram.
    if (
      !drag.moved &&
      Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < PAN_CLICK_THRESHOLD
    ) {
      return;
    }
    drag.moved = true;
    setTransform((prev) => ({
      ...prev,
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    }));
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const isClick = !drag.moved && event.type === 'pointerup';
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
    if (isClick) setIsZoomOpen(true);
  };

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: '100%', ...style }}>
      <div
        style={{
          border: '1px solid var(--bg-3)',
          borderRadius: '0.3rem',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--bg-2)',
            borderTopLeftRadius: '0.3rem',
            borderTopRightRadius: '0.3rem',
            padding: '6px 10px',
            borderBottom: '1px solid var(--bg-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                textDecoration: 'none',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                lineHeight: '20px',
              }}
            >
              {'<wavedrom>'}
            </span>
            {svg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div
                  style={{
                    cursor: 'pointer',
                    color: viewMode === 'preview' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    lineHeight: '20px',
                  }}
                  onMouseDown={(event: React.MouseEvent) => {
                    if (event.button === 0) {
                      event.preventDefault();
                      preferredViewModeRef.current = 'preview';
                      setViewMode('preview');
                    }
                  }}
                >
                  {t('preview.preview')}
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '20px' }}>/</span>
                <div
                  style={{
                    cursor: 'pointer',
                    color: viewMode === 'source' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    lineHeight: '20px',
                  }}
                  onMouseDown={(event: React.MouseEvent) => {
                    if (event.button === 0) {
                      event.preventDefault();
                      preferredViewModeRef.current = 'source';
                      setViewMode('source');
                    }
                  }}
                >
                  {t('preview.source')}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {enablePanZoom && svg && viewMode === 'preview' && (
              <>
                <ZoomOut
                  data-testid='wavedrom-zoom-out'
                  theme='outline'
                  size='16'
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  fill='var(--text-secondary)'
                  title={t('preview.zoomOut')}
                  onClick={() => zoomBy(-WAVE_ZOOM_STEP)}
                />
                <ZoomIn
                  data-testid='wavedrom-zoom-in'
                  theme='outline'
                  size='16'
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  fill='var(--text-secondary)'
                  title={t('preview.zoomIn')}
                  onClick={() => zoomBy(WAVE_ZOOM_STEP)}
                />
                <Refresh
                  data-testid='wavedrom-zoom-reset'
                  theme='outline'
                  size='16'
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  fill='var(--text-secondary)'
                  title={t('preview.zoomReset')}
                  onClick={resetTransform}
                />
              </>
            )}
            {showOpenInPanelButton && (
              <PreviewOpen
                data-testid='wavedrom-open-in-panel'
                theme='outline'
                size='18'
                style={{ cursor: 'pointer', flexShrink: 0 }}
                fill='var(--text-secondary)'
                title={t('preview.openInPanelTooltip')}
                onClick={() => {
                  openPreview(`\`\`\`wavedrom\n${code}\n\`\`\``, 'markdown', {
                    title: previewTitle,
                    editable: false,
                  });
                }}
              />
            )}
            <Copy
              data-testid='wavedrom-copy'
              theme='outline'
              size='18'
              style={{ cursor: 'pointer', flexShrink: 0 }}
              fill='var(--text-secondary)'
              onClick={() => {
                void copyText(code)
                  .then(() => {
                    Message.success(t('common.copySuccess'));
                  })
                  .catch(() => {
                    Message.error(t('common.copyFailed'));
                  });
              }}
            />
          </div>
        </div>

        {svg && viewMode === 'preview' ? (
          enablePanZoom ? (
            <div
              data-testid='wavedrom-diagram'
              style={{
                backgroundColor: 'var(--bg-1)',
                padding: '12px',
                position: 'relative',
                overflow: 'hidden',
                cursor: isPanning ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
              onPointerDown={handlePanPointerDown}
              onPointerMove={handlePanPointerMove}
              onPointerUp={endPan}
              onPointerCancel={endPan}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: 'center center',
                  transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          ) : (
            <div
              data-testid='wavedrom-diagram'
              style={{
                backgroundColor: 'var(--bg-1)',
                padding: '12px',
                overflowX: 'auto',
                display: 'flex',
                justifyContent: 'center',
                cursor: 'zoom-in',
              }}
              onClick={() => setIsZoomOpen(true)}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )
        ) : (
          <SyntaxHighlighter
            children={code}
            language='json'
            style={codeTheme}
            PreTag='div'
            customStyle={{
              margin: 0,
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              overflowX: 'auto',
              maxWidth: '100%',
            }}
            codeTagProps={{ style: { color: 'var(--text-primary)' } }}
          />
        )}
      </div>
      {isZoomOpen && svg && (
        <DiagramZoomOverlay svg={svg} onClose={() => setIsZoomOpen(false)} ariaLabel={t('preview.wavedromTitle')} />
      )}
    </div>
  );
}

export default React.memo(WavedromBlock);
