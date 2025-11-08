/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect } from 'react';
import usePwaMode from '@/renderer/hooks/usePwaMode';

/**
 * Lightweight pull-to-refresh for iOS PWA standalone mode.
 * - Triggers reload when user pulls down from top beyond a threshold.
 * - No persistent UI; avoids an always-visible button.
 */
const PwaPullToRefresh: React.FC = () => {
  const isPwa = usePwaMode();

  useEffect(() => {
    if (!isPwa) return;

    const container = (document.querySelector('.layout-content') as HTMLElement) || (document.scrollingElement as HTMLElement) || document.documentElement;

    let startY = 0;
    let deltaY = 0;
    let tracking = false;
    const threshold = 70; // px

    const getNearestScrollable = (el: EventTarget | null): HTMLElement | null => {
      let node: HTMLElement | null = el instanceof HTMLElement ? el : null;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        const canScroll = (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
        if (canScroll) return node;
        node = node.parentElement;
      }
      return null;
    };

    const isAtPageTop = (startTarget: EventTarget | null): boolean => {
      const root = (document.scrollingElement as HTMLElement) || document.documentElement;
      const layout = document.querySelector('.layout-content') as HTMLElement | null;
      const nearest = getNearestScrollable(startTarget);
      const values: number[] = [typeof window.scrollY === 'number' ? window.scrollY : 0, root && typeof (root as any).scrollTop === 'number' ? (root as any).scrollTop : 0, layout && typeof (layout as any).scrollTop === 'number' ? (layout as any).scrollTop : 0, nearest && typeof (nearest as any).scrollTop === 'number' ? (nearest as any).scrollTop : 0];
      const topMost = Math.max.apply(null, values);
      return topMost <= 0;
    };

    const isTextInput = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (isTextInput(e.target)) return; // avoid interfering with text selection/editing
      if (!isAtPageTop(e.target)) return;
      startY = e.touches[0].clientY;
      deltaY = 0;
      tracking = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const currentY = e.touches[0].clientY;
      deltaY = currentY - startY;
      if (deltaY <= 0) return; // only consider pull down
      // Do not prevent default to preserve natural bounce; we only act on release
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (deltaY >= threshold) {
        window.location.reload();
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart, false);
      container.removeEventListener('touchmove', onTouchMove, false);
      container.removeEventListener('touchend', onTouchEnd, false);
    };
  }, [isPwa]);

  return null;
};

export default PwaPullToRefresh;
