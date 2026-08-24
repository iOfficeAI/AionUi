/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { configService } from '@/common/config/configService';
import {
  FONT_FAMILY_KEYS,
  defaultFontFamilies,
  fontFamilyConfigKey,
  sanitizeFontFamily,
  type FontFamilies,
  type FontFamilyKey,
} from '@/common/config/fontFamilies';
import { applyFontFamilies } from '@renderer/utils/theme/applyFontFamilies';

/** Read persisted families (falling back to "no override") from the ready config cache. */
function readFontFamilies(): FontFamilies {
  const base = defaultFontFamilies();
  for (const key of FONT_FAMILY_KEYS) {
    const raw = configService.get(fontFamilyConfigKey(key));
    if (typeof raw === 'string') {
      base[key] = sanitizeFontFamily(raw);
    }
  }
  return base;
}

// Apply persisted families ASAP at module load to minimize first-paint flash (FOUC).
if (typeof window !== 'undefined') {
  void configService
    .whenReady()
    .then(() => applyFontFamilies(readFontFamilies()))
    .catch((error) => console.error('Failed to apply persisted font families:', error));
}

export type UseFontFamilies = {
  fontFamilies: FontFamilies;
  setFontFamily: (key: FontFamilyKey, family: string) => Promise<void>;
};

export const useFontFamilies = (): UseFontFamilies => {
  const [fontFamilies, setFontFamiliesState] = useState<FontFamilies>(defaultFontFamilies);

  useEffect(() => {
    let mounted = true;
    void configService
      .whenReady()
      .then(() => {
        if (!mounted) return;
        const next = readFontFamilies();
        setFontFamiliesState(next);
        applyFontFamilies(next);
      })
      .catch((error) => console.error('Failed to load persisted font families:', error));
    // Same-window reactivity: re-apply if any font-family key changes elsewhere.
    const offs = FONT_FAMILY_KEYS.map((key) =>
      configService.subscribe(fontFamilyConfigKey(key), () => {
        if (!mounted) return;
        const next = readFontFamilies();
        setFontFamiliesState(next);
        applyFontFamilies(next);
      })
    );
    return () => {
      mounted = false;
      offs.forEach((off) => off());
    };
  }, []);

  const setFontFamily = useCallback(async (key: FontFamilyKey, family: string) => {
    const normalized = sanitizeFontFamily(family);
    // Single update path: configService.set writes the cache and notifies
    // subscribers synchronously (before its await), so the key subscription
    // registered in the effect immediately re-reads + re-applies. No optimistic
    // setState here, to avoid a double-apply.
    try {
      await configService.set(fontFamilyConfigKey(key), normalized);
    } catch (error) {
      // Persistence failed: the synchronous notify already updated state + CSS
      // vars, so the last-applied value stays in effect — only durability is lost.
      console.error('Failed to persist font family:', error);
    }
  }, []);

  return { fontFamilies, setFontFamily };
};

export default useFontFamilies;
