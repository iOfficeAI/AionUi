/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useRef, useState } from 'react';

/** Gap between duplicated texts in px */
const MARQUEE_GAP = 32;
/** Scroll speed in px per second */
const MARQUEE_SPEED = 30;

/**
 * A pill label that shows truncated text normally,
 * and plays a seamless marquee animation on hover when text overflows.
 */
const MarqueePillLabel: React.FC<{
  children: string;
  maxWidth?: number;
}> = ({ children, maxWidth = 120 }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [marquee, setMarquee] = useState<{ active: boolean; duration: number; scroll: number }>({
    active: false,
    duration: 0,
    scroll: 0,
  });

  const handleMouseEnter = useCallback(() => {
    const text = textRef.current;
    if (!text) return;
    const overflow = text.scrollWidth - text.clientWidth;
    if (overflow <= 0) return;
    const scrollDist = text.scrollWidth + MARQUEE_GAP;
    setMarquee({ active: true, duration: scrollDist / MARQUEE_SPEED, scroll: scrollDist });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMarquee((prev) => (prev.active ? { ...prev, active: false } : prev));
  }, []);

  return (
    <span
      ref={containerRef}
      className='block overflow-hidden leading-none'
      style={{ maxWidth }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {marquee.active ? (
        <span
          className='inline-block whitespace-nowrap leading-none pill-marquee-track'
          style={
            {
              '--pill-marquee-scroll': `-${marquee.scroll}px`,
              animationDuration: `${marquee.duration}s`,
            } as React.CSSProperties
          }
        >
          {children}
          <span className='inline-block' style={{ width: MARQUEE_GAP }} />
          {children}
        </span>
      ) : (
        <span ref={textRef} className='block truncate leading-none'>
          {children}
        </span>
      )}
    </span>
  );
};

export default MarqueePillLabel;
