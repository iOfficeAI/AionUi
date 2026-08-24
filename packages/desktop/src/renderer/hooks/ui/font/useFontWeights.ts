/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { configService } from '@/common/config/configService';
import {
  FONT_WEIGHT_KEYS,
  defaultFontWeights,
  fontWeightConfigKey,
  sanitizeFontWeight,
  type FontWeightKey,
  type FontWeights,
} from '@/common/config/fontWeights';
import { applyFontWeights } from '@renderer/utils/theme/applyFontWeights';

/** Read persisted weights (falling back to "no override") from the ready config cache. */
function readFontWeights(): FontWeights {
  const base = defaultFontWeights();
  for (const key of FONT_WEIGHT_KEYS) {
    const raw = configService.get(fontWeightConfigKey(key));
    if (typeof raw === 'string') {
      base[key] = sanitizeFontWeight(raw);
    }
  }
  return base;
}

// Apply persisted weights ASAP at module load to minimize first-paint flash (FOUC).
if (typeof window !== 'undefined') {
  void configService
    .whenReady()
    .then(() => applyFontWeights(readFontWeights()))
    .catch((error) => console.error('Failed to apply persisted font weights:', error));
}

export type UseFontWeights = {
  fontWeights: FontWeights;
  setFontWeight: (key: FontWeightKey, weight: string) => Promise<void>;
};

export const useFontWeights = (): UseFontWeights => {
  const [fontWeights, setFontWeightsState] = useState<FontWeights>(defaultFontWeights);

  useEffect(() => {
    let mounted = true;
    void configService
      .whenReady()
      .then(() => {
        if (!mounted) return;
        const next = readFontWeights();
        setFontWeightsState(next);
        applyFontWeights(next);
      })
      .catch((error) => console.error('Failed to load persisted font weights:', error));
    // Same-window reactivity: re-apply if any font-weight key changes elsewhere.
    const offs = FONT_WEIGHT_KEYS.map((key) =>
      configService.subscribe(fontWeightConfigKey(key), () => {
        if (!mounted) return;
        const next = readFontWeights();
        setFontWeightsState(next);
        applyFontWeights(next);
      })
    );
    return () => {
      mounted = false;
      offs.forEach((off) => off());
    };
  }, []);

  const setFontWeight = useCallback(async (key: FontWeightKey, weight: string) => {
    const normalized = sanitizeFontWeight(weight);
    // Single update path: configService.set writes the cache and notifies
    // subscribers synchronously (before its await), so the key subscription
    // registered in the effect immediately re-reads + re-applies. No optimistic
    // setState here, to avoid a double-apply.
    try {
      await configService.set(fontWeightConfigKey(key), normalized);
    } catch (error) {
      // Persistence failed: the synchronous notify already updated state + CSS
      // vars, so the last-applied value stays in effect — only durability is lost.
      console.error('Failed to persist font weight:', error);
    }
  }, []);

  return { fontWeights, setFontWeight };
};

export default useFontWeights;
