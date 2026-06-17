/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** User-visible product name for this fork. */
export const APP_DISPLAY_NAME = 'Coworker';

/** User-visible name for the built-in aionrs agent (formerly "Aion CLI"). */
export const BUILTIN_AGENT_DISPLAY_NAME = 'Coworker CLI';

const LEGACY_DISPLAY_NAME_MAP: Record<string, string> = {
  'Aion CLI': BUILTIN_AGENT_DISPLAY_NAME,
  'AionUi': APP_DISPLAY_NAME,
  AionUI: APP_DISPLAY_NAME,
  'Aion UI': APP_DISPLAY_NAME,
  'AionUi Image Generation': 'Coworker Image Generation',
};

/** Remap upstream display labels to Coworker branding. */
export function remapLegacyDisplayName(name: string): string {
  return LEGACY_DISPLAY_NAME_MAP[name] ?? name;
}

/** Dev-mode Electron app name (isolates userData from production). */
export const APP_DEV_NAME = 'Coworker-Dev';

/** Second dev instance when AIONUI_MULTI_INSTANCE=1. */
export const APP_DEV_NAME_MULTI = 'Coworker-Dev-2';

/** Upstream open-source project (for attribution & sync). */
export const UPSTREAM_REPO = 'iOfficeAI/AionUi';

/** This fork's GitHub repo (update after `gh repo rename`). */
export const FORK_REPO = 'songyipan/Coworker';
