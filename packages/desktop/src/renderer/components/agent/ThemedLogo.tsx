/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ThemedLogo — logo image that follows the active theme color.
 *
 * Monochrome brand SVGs served by the backend use `fill="currentColor"` by
 * convention. Inside a plain `<img>`, `currentColor` resolves to the SVG
 * document's initial color (black), so those marks are invisible on dark
 * backgrounds. For tintable assets this component paints the logo through a
 * CSS mask instead, so the mark inherits `currentColor` from the surrounding
 * text style and adapts to any theme. Color logos (and PNG / data: sources)
 * keep rendering through a regular `<img>` unchanged.
 *
 * Tintability is detected from the asset content itself (the SVG contains
 * `currentColor`) and cached per URL — no manual logo lists to maintain.
 */

import { LinkCloud } from '@icon-park/react';
import React, { useEffect, useState } from 'react';

/**
 * Per-URL detection cache. A boolean is a settled result; a promise is an
 * in-flight detection shared by all subscribers of the same URL.
 */
const detectionCache = new Map<string, boolean | Promise<boolean>>();

/**
 * Only served `.svg` files are worth inspecting. Emoji, PNGs and inline
 * `data:`/`blob:` sources always go through the plain `<img>`/text path.
 */
export function isTintableLogoCandidate(src: string | null | undefined): src is string {
  if (!src) return false;
  if (/^(data:|blob:|file:)/i.test(src)) return false;
  const pathname = src.replace(/[?#].*$/, '');
  return /\.svg$/i.test(pathname);
}

/**
 * Detect whether a served SVG is tintable (declares `currentColor`).
 * Any fetch failure marks the URL as not tintable so rendering never breaks —
 * the caller falls back to the plain `<img>` behavior.
 */
export function detectTintableLogo(src: string): Promise<boolean> {
  const cached = detectionCache.get(src);
  if (typeof cached === 'boolean') return Promise.resolve(cached);
  if (cached) return cached;

  const detection = fetch(src)
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => text.includes('currentColor'))
    .catch(() => false)
    .then((tintable) => {
      detectionCache.set(src, tintable);
      return tintable;
    });
  detectionCache.set(src, detection);
  return detection;
}

/**
 * Subscribe to the tintability of a logo URL. Returns:
 * - `undefined` — detection in progress (first sight of this URL)
 * - `true` — the SVG declares currentColor → render as mask
 * - `false` — color SVG / non-SVG / fetch error → render as <img>
 *
 * Resolves synchronously from the cache on re-renders; triggers a single
 * shared detection on first sight.
 */
function useTintableLogo(src: string | null | undefined): boolean | undefined {
  const [, setDetectionTick] = useState(0);
  const candidate = isTintableLogoCandidate(src);

  useEffect(() => {
    if (!candidate) return;
    if (typeof detectionCache.get(src!) === 'boolean') return;
    let cancelled = false;
    void detectTintableLogo(src!).then(() => {
      if (!cancelled) setDetectionTick((tick) => tick + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [src, candidate]);

  if (!candidate) return false;
  const cached = detectionCache.get(src!);
  if (typeof cached === 'boolean') return cached;
  return undefined; // detection in flight — caller hides until settled
}

export type ThemedLogoProps = {
  /** Logo URL. Empty values render the `fallback` node. */
  src?: string | null;
  /** Accessible name. Empty string marks the logo as decorative. */
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** Rendered when `src` is empty. */
  fallback?: React.ReactNode;
};

const ThemedLogo: React.FC<ThemedLogoProps> = ({ src, alt, className, style, title, fallback = null }) => {
  const tintable = useTintableLogo(src);

  if (!src) return <>{fallback}</>;

  // Detection still in flight — render nothing visible (avoids the black
  // flash of a tintable SVG rendered through <img> before detection settles).
  if (tintable === undefined) {
    return (
      <span
        aria-hidden='true'
        className={className}
        style={{ display: 'inline-block', visibility: 'hidden', ...style }}
      />
    );
  }

  if (tintable) {
    const maskImage = `url("${encodeURI(src)}")`;
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        title={title}
        className={className}
        style={{
          display: 'inline-block',
          backgroundColor: 'currentColor',
          maskImage,
          WebkitMaskImage: maskImage,
          maskMode: 'alpha',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          ...style,
        }}
      />
    );
  }

  return <img src={src} alt={alt} title={title} className={className} style={style} />;
};

/**
 * Provider/platform logo with the shared cloud fallback. Extracted from the
 * copies previously duplicated in AddPlatformModal and EditModeModal.
 */
export const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({
  logo,
  name,
  size = 20,
}) => (
  <ThemedLogo
    src={logo}
    alt={name}
    className='object-contain shrink-0'
    style={{ width: size, height: size }}
    fallback={<LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />}
  />
);

export default ThemedLogo;
