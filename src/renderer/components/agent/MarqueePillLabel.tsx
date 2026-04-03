/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useRef } from 'react';

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
 * Uses direct DOM manipulation to avoid React re-render flicker.
 * A hidden measurement span detects overflow since the visible
 * inline-block container always has scrollWidth === clientWidth.
 */
const MarqueePillLabel: React.FC<{
  children: string;
}> = ({ children }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const staticRef = useRef<HTMLSpanElement>(null);
  const marqueeRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    const staticEl = staticRef.current;
    const marqueeEl = marqueeRef.current;
    if (!container || !measure || !staticEl || !marqueeEl) return;

    // Compare full text width vs constrained container width
    const textWidth = measure.offsetWidth;
    const containerWidth = container.clientWidth;
    if (textWidth <= containerWidth) return;

    const scrollDist = textWidth + MARQUEE_GAP;
    const duration = scrollDist / MARQUEE_SPEED;

    // Lock container width, swap visibility, start animation — all synchronous
    container.style.width = `${containerWidth}px`;
    staticEl.style.display = 'none';
    marqueeEl.style.display = 'inline-block';
    marqueeEl.style.setProperty('--pill-marquee-scroll', `-${scrollDist}px`);
    marqueeEl.style.animationDuration = `${duration}s`;
    // Force reflow so the browser sees the element before adding animation
    void marqueeEl.offsetWidth;
    marqueeEl.classList.add('pill-marquee-track');
  }, []);

  const handleMouseLeave = useCallback(() => {
    const container = containerRef.current;
    const staticEl = staticRef.current;
    const marqueeEl = marqueeRef.current;
    if (!container || !staticEl || !marqueeEl) return;

    marqueeEl.classList.remove('pill-marquee-track');
    marqueeEl.style.display = 'none';
    staticEl.style.display = '';
    container.style.width = '';
  }, []);

  return (
    <span
      ref={containerRef}
      className='inline-block overflow-hidden whitespace-nowrap leading-none min-w-0'
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
      {/* Static text: visible by default */}
      <span ref={staticRef} className='leading-none'>
        {children}
      </span>
      {/* Marquee track: hidden by default, shown on hover */}
      <span ref={marqueeRef} className='whitespace-nowrap leading-none' style={{ display: 'none' }}>
        {children}
        <span className='inline-block' style={{ width: MARQUEE_GAP }} />
        {children}
      </span>
    </span>
  );
};

export default MarqueePillLabel;
