/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import dayjs from 'dayjs';

/**
 * Formats an activity card timestamp (the item's `created_at`, aligned with the
 * board's newest/oldest sort key). Compact and unambiguous:
 * - same day  -> `HH:mm`
 * - same year -> `MM-DD HH:mm`
 * - earlier   -> `YYYY-MM-DD HH:mm`
 *
 * `full` is the complete `YYYY-MM-DD HH:mm:ss` for a hover tooltip. `nowMs` is
 * injectable for deterministic tests; it defaults to the current time.
 */
export function formatActivityTime(ms: number, nowMs: number = Date.now()): { label: string; full: string } {
  const d = dayjs(ms);
  const now = dayjs(nowMs);
  let label: string;
  if (d.isSame(now, 'day')) {
    label = d.format('HH:mm');
  } else if (d.isSame(now, 'year')) {
    label = d.format('MM-DD HH:mm');
  } else {
    label = d.format('YYYY-MM-DD HH:mm');
  }
  return { label, full: d.format('YYYY-MM-DD HH:mm:ss') };
}
