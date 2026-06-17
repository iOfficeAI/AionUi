/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** `office` = simplified UI for non-technical users; `power` = full developer UI. */
export type ExperienceMode = 'office' | 'power';

export const DEFAULT_EXPERIENCE_MODE: ExperienceMode = 'office';

export function normalizeExperienceMode(value: unknown): ExperienceMode {
  return value === 'power' ? 'power' : 'office';
}

export function isOfficeExperienceMode(value: unknown): boolean {
  return normalizeExperienceMode(value) === 'office';
}
