/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import mermaid from 'mermaid';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import { copyText } from '@/renderer/utils/ui/clipboard';
import { Message } from '@arco-design/web-react';
import { Copy, PreviewOpen, Refresh, ZoomIn, ZoomOut } from '@icon-park/react';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DiagramZoomOverlay from './DiagramZoomOverlay';
import { withResponsiveSvg } from './markdownUtils';

type MermaidBlockProps = {
  code: string;
  style?: React.CSSProperties;
  showOpenInPanelButton?: boolean;
  // Enable drag-to-pan + zoom buttons over the rendered diagram. Chat messages and
  // the preview panel opt in via CodeBlock; other callers keep diagrams static by
  // default. Wheel is left to the page so scrolling a long document past a diagram
  // never zooms it (matches the prior Streamdown behaviour the preview shipped with).
  enablePanZoom?: boolean;
};

const MIN_MERMAID_SCALE = 0.25;
const MAX_MERMAID_SCALE = 4;
const MERMAID_ZOOM_STEP = 0.25;
// Pointer movement below this threshold counts as a click (opens the zoom
// overlay) instead of a pan, when drag-to-pan is enabled.
const PAN_CLICK_THRESHOLD = 4;

let initializedTheme: 'light' | 'dark' | null = null;
const ensureMermaidInitialized = (theme: 'light' | 'dark') => {
  if (initializedTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: theme === 'dark' ? 'dark' : 'default',
    fontFamily: 'inherit',
  });
  initializedTheme = theme;
};

function MermaidBlock({ code, style, showOpenInPanelButton = true, enablePanZoom = false }: MermaidBlockProps) {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const blockIdRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`);
  const preferredViewModeRef = useRef<'preview' | 'source' | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
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

  // Reset the view whenever a fresh diagram renders so a re-render never leaves the
  // user staring at an off-screen, zoomed-in fragment of the previous diagram.
  // A re-render also replaces the overlay content, so close it as well.
  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    setIsZoomOpen(false);
  }, [svg]);

  const zoomBy = (delta: number) =>
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(MAX_MERMAID_SCALE, Math.max(MIN_MERMAID_SCALE, Math.round((prev.scale + delta) * 100) / 100)),
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

  useEffect(() => {
    let cancelled = false;
    const source = debouncedCode.trim();

    if (!source) {
      setSvg(null);
      setIsRendering(false);
      setViewMode('source');
      return () => {
        cancelled = true;
      };
    }

    setSvg(null);
    setIsRendering(true);

    const renderDiagram = async () => {
      try {
        ensureMermaidInitialized(currentTheme);

        const { svg: renderedSvg } = await mermaid.render(`${blockIdRef.current}-${Date.now()}`, source);

        if (!cancelled) {
          setSvg(withResponsiveSvg(renderedSvg));
          setIsRendering(false);
          setViewMode(preferredViewModeRef.current === 'source' ? 'source' : 'preview');
        }
      } catch {
        if (!cancelled) {
          setSvg(null);
          setIsRendering(false);
          setViewMode('source');
        }
      }
    };

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [debouncedCode, currentTheme]);

  const codeTheme = currentTheme === 'dark' ? vs2015 : vs;
  const shouldShowLoading = isRendering && preferredViewModeRef.current !== 'source';
  const summary = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const previewTitle =
    summary && summary.length > 0
      ? `${t('preview.mermaidTitle')}: ${summary.slice(0, 48)}${summary.length > 48 ? '...' : ''}`
      : t('preview.mermaidTitle');

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: '100%', ...style }}>
      <div
        style={{
          border: '1px solid var(--bg-3)',
          borderRadius: '0.3rem',
          overflow: 'hidden',
          overflowX: 'auto',
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
              {'<mermaid>'}
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
                  data-testid='mermaid-zoom-out'
                  theme='outline'
                  size='16'
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  fill='var(--text-secondary)'
                  title={t('preview.zoomOut')}
                  onClick={() => zoomBy(-MERMAID_ZOOM_STEP)}
                />
                <ZoomIn
                  data-testid='mermaid-zoom-in'
                  theme='outline'
                  size='16'
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  fill='var(--text-secondary)'
                  title={t('preview.zoomIn')}
                  onClick={() => zoomBy(MERMAID_ZOOM_STEP)}
                />
                <Refresh
                  data-testid='mermaid-zoom-reset'
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
                data-testid='mermaid-open-in-panel'
                theme='outline'
                size='18'
                style={{ cursor: 'pointer', flexShrink: 0 }}
                fill='var(--text-secondary)'
                title={t('preview.openInPanelTooltip')}
                onClick={() => {
                  openPreview(`\`\`\`mermaid\n${code}\n\`\`\``, 'markdown', {
                    title: previewTitle,
                    editable: false,
                  });
                }}
              />
            )}
            <Copy
              data-testid='mermaid-copy'
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
              data-testid='mermaid-diagram'
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
              data-testid='mermaid-diagram'
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
        ) : shouldShowLoading ? (
          <div
            data-testid='mermaid-loading'
            style={{
              backgroundColor: 'var(--bg-1)',
              padding: '16px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              lineHeight: '20px',
            }}
          >
            <div
              aria-hidden='true'
              className='loading'
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '999px',
                border: '2px solid var(--bg-3)',
                borderTopColor: 'var(--text-secondary)',
                flexShrink: 0,
              }}
            />
            <span>{t('preview.loading')}</span>
          </div>
        ) : (
          <SyntaxHighlighter
            children={code}
            language='mermaid'
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
        <DiagramZoomOverlay svg={svg} onClose={() => setIsZoomOpen(false)} ariaLabel={t('preview.mermaidTitle')} />
      )}
    </div>
  );
}

export default React.memo(MermaidBlock);
