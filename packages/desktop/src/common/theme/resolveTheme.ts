/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from './types';
import { LIGHT_THEME_ID } from './constants';

/** Pure: caller supplies the full theme list (builtins + user). Falls back to Light, then first. */
export function resolveActiveTheme(activeId: string, themes: Theme[]): Theme {
  return themes.find((t) => t.id === activeId) ?? themes.find((t) => t.id === LIGHT_THEME_ID) ?? themes[0];
}
