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
  void configService
    .whenReady()
    .then(() => applyFontSizes(readFontSizes()))
    .catch((error) => console.error('Failed to apply persisted font sizes:', error));
}

export type UseFontSizes = {
  fontSizes: FontSizes;
  setFontSize: (key: FontSizeKey, px: number) => Promise<void>;
};

export const useFontSizes = (): UseFontSizes => {
  const [fontSizes, setFontSizesState] = useState<FontSizes>(defaultFontSizes);

  useEffect(() => {
    let mounted = true;
    void configService
      .whenReady()
      .then(() => {
        if (!mounted) return;
        const next = readFontSizes();
        setFontSizesState(next);
        applyFontSizes(next);
      })
      .catch((error) => console.error('Failed to load persisted font sizes:', error));
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
    // Single update path: configService.set writes the cache and notifies
    // subscribers synchronously (before its await), so the key subscription
    // registered in the effect immediately re-reads + re-applies. No optimistic
    // setState here, to avoid a double-apply.
    try {
      await configService.set(fontSizeConfigKey(key), clamped);
    } catch (error) {
      // Persistence failed: the synchronous notify already updated state + CSS
      // vars, so the last-applied value stays in effect — only durability is lost.
      console.error('Failed to persist font size:', error);
    }
  }, []);

  return { fontSizes, setFontSize };
};

export default useFontSizes;
