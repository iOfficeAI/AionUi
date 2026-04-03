/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Gap between duplicated texts in px */
const MARQUEE_GAP = 32;
/** Scroll speed in px per second */
const MARQUEE_SPEED = 30;

/**
 * A pill label that adapts to available space:
 * - When space is ample: shows full text (inline-block, sizes to content)
 * - When space is tight: shrinks via flex and clips text (no ellipsis)
 * - On hover when clipped: plays seamless marquee animation
 *
 * Active state is managed via React state so that parent re-renders
 * (e.g. Arco Dropdown hover) never reset visibility. Animation props
 * are applied via refs in useLayoutEffect to avoid flicker.
 *
 * A hidden measurement span detects overflow since the visible
 * inline-block container always has scrollWidth === clientWidth.
 */
const MarqueePillLabel: React.FC<{
  children: string;
}> = ({ children }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const marqueeRef = useRef<HTMLSpanElement>(null);

  const [active, setActive] = useState(false);
  // Store computed scroll distance for useLayoutEffect
  const scrollDistRef = useRef(0);

  const handleMouseEnter = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const textWidth = measure.offsetWidth;
    const containerWidth = container.clientWidth;
    if (textWidth <= containerWidth) return;

    scrollDistRef.current = textWidth + MARQUEE_GAP;
    setActive(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActive(false);
  }, []);

  // Apply animation properties synchronously after React commits the
  // active state change — runs before browser paint, so no flicker.
  useLayoutEffect(() => {
    const marqueeEl = marqueeRef.current;
    if (!marqueeEl) return;

    if (active) {
      const duration = scrollDistRef.current / MARQUEE_SPEED;
      marqueeEl.style.setProperty('--pill-marquee-scroll', `-${scrollDistRef.current}px`);
      marqueeEl.style.animationDuration = `${duration}s`;
      void marqueeEl.offsetWidth;
      marqueeEl.classList.add('pill-marquee-track');
    } else {
      marqueeEl.classList.remove('pill-marquee-track');
      marqueeEl.style.removeProperty('--pill-marquee-scroll');
      marqueeEl.style.animationDuration = '';
    }
  }, [active]);

  return (
    <span
      ref={containerRef}
      className='inline-block overflow-hidden whitespace-nowrap leading-none min-w-0 relative'
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hidden measurement span: full text width, not clipped */}
      <span
        ref={measureRef}
        className='invisible absolute whitespace-nowrap leading-none pointer-events-none'
        aria-hidden='true'
      >
        {children}
      </span>
      {/* Static text: visible by default, hidden when marquee is active */}
      <span className={active ? 'leading-none invisible' : 'leading-none'}>{children}</span>
      {/* Marquee track: overlaid via absolute, visible only when active */}
      <span
        ref={marqueeRef}
        className={
          active
            ? 'whitespace-nowrap leading-none absolute left-0 top-0'
            : 'invisible whitespace-nowrap leading-none absolute left-0 top-0'
        }
      >
        {children}
        <span className='inline-block' style={{ width: MARQUEE_GAP }} />
        {children}
      </span>
    </span>
  );
};

export default MarqueePillLabel;
