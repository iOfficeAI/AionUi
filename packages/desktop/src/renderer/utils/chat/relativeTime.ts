/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Locale-aware "3 minutes ago" formatting for mention/list subtitles.
 *
 * `Intl.RelativeTimeFormat` rather than a dayjs plugin: the app ships 13
 * locales, and this avoids pulling a per-locale dayjs bundle for one string.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** Coarsest unit first: the first threshold the delta clears wins. */
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', YEAR_MS],
  ['month', MONTH_MS],
  ['day', DAY_MS],
  ['hour', HOUR_MS],
  ['minute', MINUTE_MS],
];

// Constructing a formatter is comparatively expensive and these run per row per
// render, so keep one per locale.
const formatterCache = new Map<string, Intl.RelativeTimeFormat>();

const getFormatter = (locale: string): Intl.RelativeTimeFormat => {
  const cached = formatterCache.get(locale);
  if (cached) return cached;
  let formatter: Intl.RelativeTimeFormat;
  try {
    // `numeric: 'auto'` is what turns -1 day into "yesterday" / “昨天”.
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    // An unsupported/malformed tag (e.g. a stale persisted language) must not
    // take the picker down — fall back to the runtime default.
    formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  }
  formatterCache.set(locale, formatter);
  return formatter;
};

/**
 * @param timestampMs epoch millis of the event
 * @param locale BCP 47 tag, normally i18n's current language
 * @param nowMs injectable clock, for tests
 */
export const formatRelativeTime = (timestampMs: number, locale: string, nowMs: number = Date.now()): string => {
  if (!Number.isFinite(timestampMs)) return '';
  const formatter = getFormatter(locale);
  // Negative for the past, which is what RelativeTimeFormat expects.
  const deltaMs = timestampMs - nowMs;
  const absMs = Math.abs(deltaMs);
  for (const [unit, unitMs] of UNITS) {
    if (absMs >= unitMs) {
      return formatter.format(Math.round(deltaMs / unitMs), unit);
    }
  }
  // Sub-minute collapses to "now" rather than counting seconds: these rows are
  // static, so a ticking number would just go stale.
  return formatter.format(0, 'second');
};
