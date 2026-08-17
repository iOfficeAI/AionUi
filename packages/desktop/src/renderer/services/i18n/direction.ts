/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Layout direction for the app language.
 *
 * fa-IR is the only right-to-left language AionUi ships. Direction is derived
 * from the app language (`i18n.language`), never from the host OS, for the same
 * reason number and date formatting is: the two must not disagree.
 *
 * Content that is inherently left-to-right — code blocks, terminal output,
 * file paths — must opt out locally with `dir="ltr"` on its container rather
 * than fighting the document direction.
 */

import { normalizeLanguageCode } from '@/common/config/i18n';

const RTL_LANGUAGES: ReadonlySet<string> = new Set(['fa-IR']);

export type LayoutDirection = 'ltr' | 'rtl';

/** Whether the given app language lays out right-to-left. */
export function isRtlLanguage(language: string | undefined | null): boolean {
  if (!language) return false;
  return RTL_LANGUAGES.has(normalizeLanguageCode(language));
}

/** Resolve the document direction for the given app language. */
export function directionForLanguage(language: string | undefined | null): LayoutDirection {
  return isRtlLanguage(language) ? 'rtl' : 'ltr';
}

/**
 * Apply the language's direction (and the language tag itself) to <html>.
 *
 * `dir` drives the CSS logical properties and flex/grid start/end used
 * throughout the renderer; `lang` drives spell-check, CJK glyph selection and
 * assistive technology.
 */
export function applyDocumentDirection(language: string | undefined | null): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = directionForLanguage(language);
  if (language) {
    document.documentElement.lang = normalizeLanguageCode(language);
  }
}
