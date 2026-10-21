/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export interface WindowControlsOverlayState {
  isSupported: boolean;
  isVisible: boolean;
  titlebarAreaRect: DOMRect | null;
}

/**
 * Hook to observe the Window Controls Overlay API for Progressive Web Apps (PWA).
 * When enabled (e.g. in Microsoft Edge or Google Chrome installed PWA with WCO enabled),
 * `isVisible` will be true, allowing web titlebar to blend seamlessly with the window controls.
 */
export function useWindowControlsOverlay(): WindowControlsOverlayState {
  const isSupported = typeof window !== 'undefined' && 'windowControlsOverlay' in navigator;

  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const overlay = (navigator as unknown as { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay;
    return Boolean(overlay?.visible);
  });

  const [titlebarAreaRect, setTitlebarAreaRect] = useState<DOMRect | null>(() => {
    if (typeof window === 'undefined') return null;
    const overlay = (
      navigator as unknown as { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect?: () => DOMRect } }
    ).windowControlsOverlay;
    if (overlay?.visible && typeof overlay.getTitlebarAreaRect === 'function') {
      return overlay.getTitlebarAreaRect();
    }
    return null;
  });

  useEffect(() => {
    if (!isSupported) return;

    const overlay = (
      navigator as unknown as {
        windowControlsOverlay: {
          visible: boolean;
          getTitlebarAreaRect?: () => DOMRect;
          addEventListener: (
            type: string,
            listener: (event: { visible: boolean; titlebarAreaRect?: DOMRect }) => void
          ) => void;
          removeEventListener: (
            type: string,
            listener: (event: { visible: boolean; titlebarAreaRect?: DOMRect }) => void
          ) => void;
        };
      }
    ).windowControlsOverlay;

    if (!overlay) return;

    const handleGeometryChange = (event: { visible: boolean; titlebarAreaRect?: DOMRect }) => {
      setIsVisible(event.visible);
      if (event.titlebarAreaRect) {
        setTitlebarAreaRect(event.titlebarAreaRect);
      } else if (typeof overlay.getTitlebarAreaRect === 'function') {
        setTitlebarAreaRect(overlay.getTitlebarAreaRect());
      }
    };

    overlay.addEventListener('geometrychange', handleGeometryChange);
    return () => {
      overlay.removeEventListener('geometrychange', handleGeometryChange);
    };
  }, [isSupported]);

  return {
    isSupported,
    isVisible,
    titlebarAreaRect,
  };
}

export default useWindowControlsOverlay;
