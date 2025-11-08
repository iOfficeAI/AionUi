/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

/**
 * Detect whether the app is running as a PWA (standalone display mode).
 * - Uses CSS media query for `display-mode: standalone`
 * - Falls back to iOS Safari `navigator.standalone`
 */
export function usePwaMode(): boolean {
  const [isPwa, setIsPwa] = useState(false);

  useEffect(() => {
    try {
      const byMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
      const byIOSStandalone = typeof navigator !== 'undefined' && (navigator as any).standalone === true;
      setIsPwa(Boolean(byMedia || byIOSStandalone));
    } catch {
      setIsPwa(false);
    }
  }, []);

  return isPwa;
}

export default usePwaMode;
