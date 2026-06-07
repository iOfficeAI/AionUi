/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { configService } from '@/common/config/configService';
import {
  FONT_SIZE_KEYS,
  clampFontSize,
  defaultFontSizes,
  fontSizeConfigKey,
  type FontSizeKey,
  type FontSizes,
} from '@/common/config/fontSizes';
import { applyFontSizes } from '@renderer/utils/theme/applyFontSizes';

/** Read persisted sizes (falling back to defaults) from the ready config cache. */
function readFontSizes(): FontSizes {
  const base = defaultFontSizes();
  for (const key of FONT_SIZE_KEYS) {
    const raw = configService.get(fontSizeConfigKey(key));
    if (typeof raw === 'number') {
      base[key] = clampFontSize(key, raw);
    }
  }
  return base;
}

// Apply persisted sizes ASAP at module load to minimize first-paint flash (FOUC).
if (typeof window !== 'undefined') {
  void configService.whenReady().then(() => applyFontSizes(readFontSizes()));
}

export type UseFontSizes = {
  fontSizes: FontSizes;
  setFontSize: (key: FontSizeKey, px: number) => Promise<void>;
};

export const useFontSizes = (): UseFontSizes => {
  const [fontSizes, setFontSizesState] = useState<FontSizes>(defaultFontSizes);

  useEffect(() => {
    let mounted = true;
    void configService.whenReady().then(() => {
      if (!mounted) return;
      const next = readFontSizes();
      setFontSizesState(next);
      applyFontSizes(next);
    });
    // Same-window reactivity: re-apply if any font-size key changes elsewhere.
    const offs = FONT_SIZE_KEYS.map((key) =>
      configService.subscribe(fontSizeConfigKey(key), () => {
        if (!mounted) return;
        const next = readFontSizes();
        setFontSizesState(next);
        applyFontSizes(next);
      })
    );
    return () => {
      mounted = false;
      offs.forEach((off) => off());
    };
  }, []);

  const setFontSize = useCallback(async (key: FontSizeKey, px: number) => {
    const clamped = clampFontSize(key, px);
    setFontSizesState((prev) => {
      const next = { ...prev, [key]: clamped };
      applyFontSizes(next);
      return next;
    });
    try {
      await configService.set(fontSizeConfigKey(key), clamped);
    } catch (error) {
      console.error('Failed to persist font size:', error);
    }
  }, []);

  return { fontSizes, setFontSize };
};

export default useFontSizes;
