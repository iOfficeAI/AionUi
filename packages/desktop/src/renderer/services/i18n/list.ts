/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Join a list of display names in the app language.
 *
 * Hardcoded separators ('、', ', ') are wrong in most languages —
 * `Intl.ListFormat` picks the right one per locale (zh: 顿号+和, fa: Arabic
 * comma, de/fr: "und"/"et"). Pass `i18n.language`; falls back to en-US when the
 * tag is malformed.
 */
export function formatNameList(names: string[], language?: string | null): string {
  const locale = language && language.trim() ? language : 'en-US';
  try {
    return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
  } catch {
    return new Intl.ListFormat('en-US', { type: 'conjunction' }).format(names);
  }
}
