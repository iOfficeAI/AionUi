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
import WaveDrom, { type OnmlTree, type WaveSkin, type WaveSource } from 'wavedrom';
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

// WaveDrom derives the diagram's root id `svgcontent_<n>` from the index passed
// to renderAny, and applies the skin's lane geometry only for index 0 (its lane
// parameters live in a module-level singleton that later diagrams inherit). The
// caller therefore hands in an index that starts at 0 for the session's first
// diagram and is unique across diagrams — see the nextDiagramIndex allocation
// in WavedromBlock.

// Session-wide id allocation: each WavedromBlock instance reserves one number
// on its first render (it becomes the SVG root id `svgcontent_<n>` above), so
// every diagram in the document gets a unique id even when several instances
// render in the same commit — the reservations run synchronously in component
// order, so earlier mounts always pick lower numbers. The counter is never
// touched inside the svg memo, which stays pure; a StrictMode double-render
// only re-reads the already-reserved ref and reserves nothing again.
let nextDiagramIndex = 0;

// The bundled dark skin is a mechanical "swap black for white" job: its
// multi-bit value labels (s8-s15) and the gap fill (s6) are near-black, so they
// disappear on AionUi's dark panel (--bg-1: #1a1a1a). Remap those fills to
// mid-tone colors that stay visible on the dark background while keeping the
// white label text readable; the bundled light skin needs no adjustment.
const DARK_SKIN_FILL_REMAP: Record<string, string> = {
  s6: '#4a4a4a', // gap (no signal)
  s8: '#5c5c5c', // multi-bit value '2'
  s9: '#3050b8', // '3'
  s10: '#4a8a2a', // '4'
  s11: '#b04a3a', // '5'
  s12: '#1a8a90', // '6'
  s13: '#8a3a8a', // '7'
  s14: '#7a7a7a', // '8'
  s15: '#7a4ac0', // '9'
};

// The dark skin's wave strokes are pure white (s1-s5), so the diagram backdrop
// must always pair with the skin that was selected. Resolving it through the
// --bg-1 token is not safe: when the variable falls back to the light value
// (html without `data-color-scheme`, or a custom theme that overrides the
// token), white strokes land on a white panel and the timing lines vanish.
// Use the exact --bg-1 token values keyed by the same theme state that picks
// the skin, so the pairing is guaranteed on every surface that renders the
// diagram (inline, preview panel and zoom overlay alike).
const PANEL_BG: Record<'light' | 'dark', string> = {
  light: '#f9fafb', // --bg-1 light
  dark: '#1a1a1a', // --bg-1 dark
};

/**
 * WaveDrom diagram theme policy.
 *
 * - 'auto': render the diagram with the app theme (dark skin + dark backdrop
 *   in dark mode, light skin in light mode).
 * - 'light': always render with the bundled light skin (dark strokes on the
 *   light backdrop), which stays fully readable on any app theme.
 *
 * Hardcoded to 'light' for now: the light diagram is legible everywhere and
 * sidesteps the dark skin's white-stroke contrast issues entirely. Flip this
 * constant to 'auto' to restore theme-following, or expose it as a setting.
 */
export type WaveThemeMode = 'auto' | 'light';
const WAVEDROM_THEME_MODE: WaveThemeMode = 'light';

/** Resolve the effective render theme from the policy and the app theme. */
export const resolveWaveRenderTheme = (mode: WaveThemeMode, appTheme: 'light' | 'dark'): 'light' | 'dark' =>
  mode === 'auto' ? appTheme : 'light';

/**
 * Replace the near-black `fill` values of the bundled dark skin's s6/s8-s15
 * classes with the dark-theme-visible palette above.
 */
export const remapDarkSkinStyle = (styleText: string): string => {
  let remapped = styleText;
  for (const [className, fill] of Object.entries(DARK_SKIN_FILL_REMAP)) {
    remapped = remapped.replace(new RegExp(`\\.${className}\\{[^}]*\\}`, 'g'), (rule) =>
      rule.replace(/fill:\s*#[0-9a-fA-F]{3,8}/, `fill: ${fill}`)
    );
  }
  return remapped;
};

// Pre-compute a readable dark skin once: renderAny copies the skin's style text
// verbatim into every rendered SVG, so remapping the shared tree covers the
// inline diagram and the zoom overlay alike. Falls back to the bundled skin
// when the shape is unexpected (e.g. stub skins in tests).
const waveSkinDarkRemapped: WaveSkin = (() => {
  const original = waveSkinDark.dark as unknown as OnmlTree | undefined;
  if (!original) return waveSkinDark;
  const styleElement = original[2];
  if (Array.isArray(styleElement) && styleElement[0] === 'style' && typeof styleElement[2] === 'string') {
    const tree = [...original] as OnmlTree;
    tree[2] = [styleElement[0], styleElement[1], remapDarkSkinStyle(styleElement[2])];
    return { dark: tree as unknown as Record<string, unknown> };
  }
  return waveSkinDark;
})();

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
 *
 * `index` is the unique diagram id reserved for this instance from the module
 * counter (see the comment above); it must stay pure — no mutation here — so
 * the caller can safely drive it from a memo.
 */
const renderWaveSvg = (code: string, isDark: boolean, index: number): string | null => {
  const skin: WaveSkin = isDark ? waveSkinDarkRemapped : waveSkinDefault;
  try {
    const parsed: unknown = JSON5.parse(code.trim());
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const source = parsed as WaveSource;
    const hasLanes = Array.isArray(source.signal) || Array.isArray(source.assign) || Array.isArray(source.reg);
    if (!hasLanes) return null;
    const tree = WaveDrom.renderAny(index, source, skin);
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

  // Effective diagram theme: the skin and the backdrop both derive from this so
  // they can never drift apart (see PANEL_BG). In light-only mode it stays
  // 'light' regardless of the app theme — the observer above still tracks the
  // theme for the source-view highlight and for a future 'auto' mode.
  const renderTheme = resolveWaveRenderTheme(WAVEDROM_THEME_MODE, currentTheme);

  // Diagram id for this instance: reserved lazily on the first render from the
  // module counter so it stays unique across every instance for the life of the
  // page. useRef's argument is evaluated on every render, so a raw
  // `useRef(nextDiagramIndex++)` would bump the counter on each re-render —
  // the sentinel guard runs the reservation exactly once instead.
  const idRef = useRef<number>(-1);
  if (idRef.current < 0) {
    idRef.current = nextDiagramIndex++;
  }

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
  // render theme changes and returns null for invalid input (source view
  // fallback). In light-only mode the render theme never changes with the app
  // theme, so the diagram is not re-rendered on theme switches.
  const svg = useMemo(
    () => renderWaveSvg(debouncedCode, renderTheme === 'dark', idRef.current),
    [debouncedCode, renderTheme]
  );

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
  // Backdrop for the rendered diagram (and the zoom overlay card): stays in
  // lock-step with the skin via the shared render theme, see PANEL_BG above.
  const panelBackground = PANEL_BG[renderTheme];
  // First non-empty line of the source doubles as the preview panel title,
  // truncated to 48 chars; memoized since it only changes with the source or
  // the locale.
  const previewTitle = useMemo(() => {
    const summary = code
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return summary && summary.length > 0
      ? `${t('preview.wavedromTitle')}: ${summary.slice(0, 48)}${summary.length > 48 ? '...' : ''}`
      : t('preview.wavedromTitle');
  }, [code, t]);

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
                backgroundColor: panelBackground,
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
                backgroundColor: panelBackground,
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
        <DiagramZoomOverlay
          svg={svg}
          onClose={() => setIsZoomOpen(false)}
          ariaLabel={t('preview.wavedromTitle')}
          panelBackground={panelBackground}
        />
      )}
    </div>
  );
}

export default React.memo(WavedromBlock);
