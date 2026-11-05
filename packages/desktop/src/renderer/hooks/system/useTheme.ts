/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { resolveActiveTheme } from '@/common/theme/resolveTheme';
import { applyTheme, seedElectronTheme, setActiveTheme } from '@/renderer/utils/theme/applyTheme';
import { getSystemPrefersDark } from '@/renderer/utils/theme/systemAppearance';
import { startSystemThemeWatcher } from '@/renderer/utils/theme/systemThemeWatcher';
import { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';
import { LIGHT_THEME_ID } from '@/common/theme/constants';
import type { Theme } from '@/common/theme/types';
import { useCallback, useEffect, useState } from 'react';

const APPEARANCE_CACHE_KEY = '__aionui_theme';

function cacheAppearance(theme: Theme): void {
  try {
    localStorage.setItem(APPEARANCE_CACHE_KEY, theme.appearance);
  } catch {
    /* noop */
  }
}

function getPersistedActiveId(): string {
  return (configService.get('theme.activeId') as string) || LIGHT_THEME_ID;
}

function applyPersistedTheme(): Theme {
  const activeId = getPersistedActiveId();
  const userThemes = (configService.get('theme.userThemes') as Theme[]) ?? [];
  const resolved = resolveActiveTheme(activeId, [...BUILTIN_THEMES, ...userThemes], getSystemPrefersDark());
  applyTheme(resolved);
  cacheAppearance(resolved);
  // Seed other surfaces after loading persisted settings, including retries.
  void seedElectronTheme(resolved).catch(() => {});
  return resolved;
}

async function initActiveTheme(): Promise<Theme> {
  try {
    await configService.whenReady();
    return applyPersistedTheme();
  } catch (e) {
    console.error('init theme failed', e);
    const fallback = resolveActiveTheme(LIGHT_THEME_ID, BUILTIN_THEMES);
    applyTheme(fallback);
    return fallback;
  }
}

let initialPromise: Promise<Theme> | null = null;
if (typeof window !== 'undefined') initialPromise = initActiveTheme();

/**
 * Returns [resolvedActiveTheme, selectThemeById, rawActiveId]. `rawActiveId` may be the
 * `system` sentinel while the resolved theme is the Light/Dark builtin — the gallery
 * highlights cards by `rawActiveId`.
 */
const useTheme = (): [Theme | null, (activeId: string) => Promise<void>, string | null] => {
  const [active, setActive] = useState<Theme | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let settingsChanged = false;
    const refresh = () => {
      settingsChanged = true;
      const theme = applyPersistedTheme();
      if (mounted) {
        setActive(theme);
        setActiveId(getPersistedActiveId());
      }
    };
    const offActiveId = configService.subscribe('theme.activeId', refresh);
    const offUserThemes = configService.subscribe('theme.userThemes', refresh);
    initialPromise
      ?.then((t) => {
        if (mounted && !settingsChanged) {
          // A retry may already have succeeded before this hook mounted.
          setActive(configService.isInitialized() ? applyPersistedTheme() : t);
          setActiveId(getPersistedActiveId());
        }
      })
      .catch((e) => console.error('init theme failed', e));
    const off = ipcBridge.theme.changed.on((t: Theme) => {
      applyTheme(t);
      if (mounted) {
        setActive((prev) => (prev?.id === t.id ? prev : t));
        // Best-effort: config was persisted before the broadcast, fall back to the resolved id.
        setActiveId((configService.get('theme.activeId') as string) || t.id);
      }
      cacheAppearance(t);
    });
    const offSystemWatch = startSystemThemeWatcher();
    return () => {
      mounted = false;
      off?.();
      offActiveId();
      offUserThemes();
      offSystemWatch();
    };
  }, []);

  const select = useCallback(async (selectedId: string) => {
    const resolved = await setActiveTheme(selectedId);
    setActive(resolved);
    setActiveId(selectedId);
    cacheAppearance(resolved);
  }, []);

  return [active, select, activeId];
};

export default useTheme;
