/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Locale-aware display formatting for numbers, currencies and dates.
 *
 * `Intl.NumberFormat(undefined, …)`, `Intl.DateTimeFormat(undefined, …)` and the
 * bare `toLocaleString()` / `toLocaleDateString()` / `toLocaleTimeString()` family
 * all resolve to the *host OS* locale, which has nothing to do with the language
 * the user picked inside AionUi. A German desktop running AionUi in English used
 * to render `0,42 $` and `17.8.2025` next to English labels, and the same app on
 * a `zh-HK` desktop rendered a locale AionUi does not even ship.
 *
 * Every user-visible number or date must therefore be formatted against the app
 * language, passed in explicitly from `useTranslation().i18n.language`. Reading
 * the i18next singleton in here instead would be invisible to React and would
 * leave already-rendered numbers stale after a language switch.
 *
 * Import this module directly (`@/renderer/services/i18n/format`) rather than
 * through `@/renderer/services/i18n`, whose index bootstraps i18next on load.
 */

import { DEFAULT_LANGUAGE, normalizeLanguageCode, type SupportedLanguage } from '@/common/config/i18n';

/** Option set that reproduces `Date.prototype.toLocaleString()` defaults. */
const DATE_TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
};

/**
 * Reduce any language hint to a locale AionUi actually ships, so formatting is
 * deterministic and never depends on the host OS.
 */
export function resolveFormatLocale(language?: string | null): SupportedLanguage {
  if (!language || !language.trim()) return DEFAULT_LANGUAGE;
  return normalizeLanguageCode(language);
}

// `Intl.*Format` construction is expensive relative to `format()`, and these run
// inside list renders. Cache one instance per (locale, options) pair.
const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

function getNumberFormat(locale: SupportedLanguage, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

function getDateTimeFormat(locale: SupportedLanguage, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = dateTimeFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Format a plain number in the app language, e.g. `12.6` → `12,6` in de-DE.
 */
export function formatNumber(value: number, language?: string | null, options?: Intl.NumberFormatOptions): string {
  return getNumberFormat(resolveFormatLocale(language), options).format(value);
}

/**
 * Format a monetary amount in the app language.
 *
 * Falls back to `<number> <code>` when the currency code is not renderable —
 * `Intl.NumberFormat` throws a RangeError on codes that are not well-formed.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  language?: string | null,
  options?: Intl.NumberFormatOptions
): string {
  const locale = resolveFormatLocale(language);
  try {
    return getNumberFormat(locale, { style: 'currency', currency, ...options }).format(amount);
  } catch {
    // Mirror the requested precision: significant digits win over fraction
    // digits in Intl, so a caller asking for them must not silently get the
    // fraction-digit fallback, which would round a sub-cent amount to zero.
    const digits = options?.maximumFractionDigits ?? 4;
    const fallbackOptions: Intl.NumberFormatOptions =
      options?.maximumSignificantDigits != null
        ? { maximumSignificantDigits: options.maximumSignificantDigits }
        : { minimumFractionDigits: digits, maximumFractionDigits: digits };
    return `${getNumberFormat(locale, fallbackOptions).format(amount)} ${currency}`;
  }
}

/**
 * Format a timestamp (or `Date`) in the app language.
 *
 * With no `options` this reproduces `toLocaleString()`'s numeric date + time.
 */
export function formatDateTime(
  value: number | Date,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return getDateTimeFormat(resolveFormatLocale(language), options ?? DATE_TIME_DEFAULTS).format(value);
}

/**
 * Format the date part only — the `toLocaleDateString()` replacement.
 */
export function formatDate(
  value: number | Date,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatDateTime(value, language, options ?? { year: 'numeric', month: 'numeric', day: 'numeric' });
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Format a byte count as "12.5 MB", with the number in the app language
 * (de-DE renders "12,5 MB"). Binary (1024) units, matching the rest of the app.
 */
export function formatByteSize(bytes: number, language?: string | null, maximumFractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return `0 ${BYTE_UNITS[0]}`;
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${formatNumber(value, language, { maximumFractionDigits })} ${BYTE_UNITS[exponent]}`;
}

/**
 * Format a transfer rate as "1.2 MB/s" in the app language.
 */
export function formatByteRate(bytesPerSecond: number, language?: string | null): string {
  return `${formatByteSize(bytesPerSecond, language)}/s`;
}

/**
 * Format the time part only — the `toLocaleTimeString()` replacement.
 */
export function formatTime(
  value: number | Date,
  language?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatDateTime(value, language, options ?? { hour: 'numeric', minute: 'numeric', second: 'numeric' });
}
