/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from '@arco-design/web-react';
import { Copy, PreviewOpen, Refresh, ZoomIn, ZoomOut } from '@icon-park/react';
import katex from 'katex';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { copyText } from '@/renderer/utils/ui/clipboard';
import DiagramZoomOverlay from './DiagramZoomOverlay';
import { formatCode } from './markdownUtils';

const MATH_ZOOM_STEP = 0.25;
const MATH_MIN_SCALE = 0.5;
const MATH_MAX_SCALE = 4.0;

type MathBlockProps = {
  code: string;
  style?: React.CSSProperties;
  className?: string;
  showOpenInPanelButton?: boolean;
  enablePanZoom?: boolean;
  [key: string]: unknown;
};

function katexToSvgWrapper(html: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="overflow: visible; display: flex; align-items: center; justify-content: center;"><foreignObject width="100%" height="100%" style="overflow: visible;"><div xmlns="http://www.w3.org/1999/xhtml" class="katex-display" style="margin: 0; display: flex; justify-content: center; align-items: center; width: 100%; min-height: 100%;">${html}</div></foreignObject></svg>`;
}

function MathBlock(props: MathBlockProps) {
  const { code, style, showOpenInPanelButton = true, enablePanZoom = false } = props;
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const preferredViewModeRef = useRef<'preview' | 'source' | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    const update = () => {
      setCurrentTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light');
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const formattedCode = formatCode(code);
  const isDark = currentTheme === 'dark';
  const codeTheme = isDark ? vs2015 : vs;

  let html = '';
  let hasRenderError = false;
  try {
    html = katex.renderToString(formattedCode, { displayMode: true, throwOnError: false });
  } catch {
    hasRenderError = true;
  }

  const svg = hasRenderError ? '' : katexToSvgWrapper(html);
  const previewTitle = `${t('preview.mathTitle', { defaultValue: 'LaTeX Math' })}: ${formattedCode.slice(0, 30)}${formattedCode.length > 30 ? '...' : ''}`;

  const resetTransform = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setTransform((t) => ({
      ...t,
      scale: Math.min(MATH_MAX_SCALE, Math.max(MATH_MIN_SCALE, Number((t.scale + delta).toFixed(2)))),
    }));
  }, []);

  const handlePanPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: transform.x,
      origY: transform.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handlePanPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.moved = true;
    }
    setTransform((t) => ({ ...t, x: drag.origX + dx, y: drag.origY + dy }));
  };

  const endPan = (event: React.PointerEvent) => {
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
        {/* Control Toolbar */}
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
              {'<math>'}
            </span>
            {!hasRenderError && (
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
            {enablePanZoom && !hasRenderError && viewMode === 'preview' && (
              <>
                <ZoomOut
                  data-testid='math-zoom-out'
                  theme='outline'
                  size='16'
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  fill='var(--text-secondary)'
                  title={t('preview.zoomOut')}
                  onClick={() => zoomBy(-MATH_ZOOM_STEP)}
                />
                <ZoomIn
                  data-testid='math-zoom-in'
                  theme='outline'
                  size='16'
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  fill='var(--text-secondary)'
                  title={t('preview.zoomIn')}
                  onClick={() => zoomBy(MATH_ZOOM_STEP)}
                />
                <Refresh
                  data-testid='math-zoom-reset'
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
                data-testid='math-open-in-panel'
                theme='outline'
                size='18'
                style={{ cursor: 'pointer', flexShrink: 0 }}
                fill='var(--text-secondary)'
                title={t('preview.openInPanelTooltip')}
                onClick={() => {
                  openPreview(`$$\n${formattedCode}\n$$`, 'markdown', {
                    title: previewTitle,
                    editable: false,
                  });
                }}
              />
            )}
            <Copy
              data-testid='math-copy'
              theme='outline'
              size='18'
              style={{ cursor: 'pointer', flexShrink: 0 }}
              fill='var(--text-secondary)'
              onClick={() => {
                void copyText(formattedCode)
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

        {!hasRenderError && viewMode === 'preview' ? (
          enablePanZoom ? (
            <div
              data-testid='math-diagram'
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
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ) : (
            <div
              data-testid='math-diagram'
              style={{
                backgroundColor: 'var(--bg-1)',
                padding: '12px',
                overflowX: 'auto',
                display: 'flex',
                justifyContent: 'center',
                cursor: 'zoom-in',
              }}
              onClick={() => setIsZoomOpen(true)}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        ) : (
          <SyntaxHighlighter
            children={formattedCode}
            language='latex'
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
        <DiagramZoomOverlay
          svg={svg}
          onClose={() => setIsZoomOpen(false)}
          ariaLabel={previewTitle}
        />
      )}
    </div>
  );
}

export default React.memo(MathBlock);
