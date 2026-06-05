/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { resolveActiveTheme } from '@/common/theme/resolveTheme';
import { applyTheme, setActiveTheme } from '@/renderer/utils/theme/applyTheme';
import { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';
import { LIGHT_THEME_ID } from '@/common/theme/constants';
import type { Theme } from '@/common/theme/types';
import { useCallback, useEffect, useState } from 'react';

const APPEARANCE_CACHE_KEY = '__aionui_theme';

async function initActiveTheme(): Promise<Theme> {
  try {
    await configService.whenReady();
    const activeId = (configService.get('theme.activeId') as string) || LIGHT_THEME_ID;
    const userThemes = (configService.get('theme.userThemes') as Theme[]) ?? [];
    const resolved = resolveActiveTheme(activeId, [...BUILTIN_THEMES, ...userThemes]);
    applyTheme(resolved);
    try {
      localStorage.setItem(APPEARANCE_CACHE_KEY, resolved.appearance);
    } catch {
      /* noop */
    }
    // Seed the main-process relay so other surfaces (markdown shadow DOM, pet windows) can pull it.
    void ipcBridge.theme.setActive.invoke(resolved).catch(() => {});
    return resolved;
  } catch (e) {
    console.error('init theme failed', e);
    const fallback = resolveActiveTheme(LIGHT_THEME_ID, BUILTIN_THEMES);
    applyTheme(fallback);
    return fallback;
  }
}

let initialPromise: Promise<Theme> | null = null;
if (typeof window !== 'undefined') initialPromise = initActiveTheme();

/** Returns [activeTheme, selectThemeById]. */
const useTheme = (): [Theme | null, (activeId: string) => Promise<void>] => {
  const [active, setActive] = useState<Theme | null>(null);

  useEffect(() => {
    let mounted = true;
    initialPromise
      ?.then((t) => {
        if (mounted) setActive(t);
      })
      .catch((e) => console.error('init theme failed', e));
    const off = ipcBridge.theme.changed.on((t: Theme) => {
      applyTheme(t);
      if (mounted) setActive((prev) => (prev?.id === t.id ? prev : t));
      try {
        localStorage.setItem(APPEARANCE_CACHE_KEY, t.appearance);
      } catch {
        /* noop */
      }
    });
    return () => {
      mounted = false;
      off?.();
    };
  }, []);

  const select = useCallback(async (activeId: string) => {
    await setActiveTheme(activeId);
  }, []);

  return [active, select];
};

export default useTheme;
