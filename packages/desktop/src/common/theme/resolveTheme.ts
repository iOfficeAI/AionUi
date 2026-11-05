/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from './types';
import { LIGHT_THEME_ID, DARK_THEME_ID, SYSTEM_THEME_ID } from './constants';

export type SystemThemePreferences = {
  darkThemeId?: string;
  lightThemeId?: string;
};

/**
 * Pure: caller supplies the full theme list (builtins + user). Falls back to Light, then first.
 * `system` resolves to the preferred (or built-in default) Dark/Light theme via `prefersDark`
 * (callers pass the `prefers-color-scheme` media query result; this module must stay DOM-free).
 */
export function resolveActiveTheme(
  activeId: string,
  themes: Theme[],
  prefersDark?: boolean,
  systemPreferences?: SystemThemePreferences
): Theme {
  const targetId =
    activeId === SYSTEM_THEME_ID
      ? prefersDark
        ? systemPreferences?.darkThemeId || DARK_THEME_ID
        : systemPreferences?.lightThemeId || LIGHT_THEME_ID
      : activeId;
  return themes.find((t) => t.id === targetId) ?? themes.find((t) => t.id === LIGHT_THEME_ID) ?? themes[0];
}
