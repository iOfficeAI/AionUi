/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

/**
 * Enumerate the fonts installed on the user's machine via the Local Font Access
 * API (`window.queryLocalFonts`). The API is only defined in a secure context
 * and, critically, must be called from within a user gesture (transient
 * activation) — so `load()` is invoked when the font dropdown opens, never on
 * mount. Results are cached at module scope: the first successful query is
 * shared by every dropdown for the rest of the session.
 */

/** Subset of the FontData interface we consume (not in TS's DOM lib yet). */
type LocalFontData = { readonly family: string };
type QueryLocalFonts = () => Promise<LocalFontData[]>;

export type SystemFontsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type UseSystemFonts = {
  /** Deduplicated, locale-sorted family names ([] until a successful load). */
  fonts: string[];
  status: SystemFontsStatus;
  /** Trigger enumeration; must be called from a user gesture. No-op once loaded. */
  load: () => void;
};

// Module-level cache shared across hook instances for the whole session.
let cachedFonts: string[] | null = null;
let inflight: Promise<string[]> | null = null;

const getQueryLocalFonts = (): QueryLocalFonts | undefined => {
  if (typeof window === 'undefined') return undefined;
  const fn = (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  return typeof fn === 'function' ? (fn as QueryLocalFonts) : undefined;
};

const queryFamilies = async (): Promise<string[]> => {
  const query = getQueryLocalFonts();
  if (!query) return [];
  const records = await query();
  // Collapse the per-style records (e.g. "Roboto" appears once per weight) to
  // unique family names, then sort case-insensitively for a stable menu order.
  const families = new Set<string>();
  for (const record of records) {
    const family = record.family?.trim();
    if (family) families.add(family);
  }
  return Array.from(families).toSorted((a, b) => a.localeCompare(b));
};

export const useSystemFonts = (): UseSystemFonts => {
  const [fonts, setFonts] = useState<string[]>(() => cachedFonts ?? []);
  const [status, setStatus] = useState<SystemFontsStatus>(cachedFonts ? 'ready' : 'idle');

  const load = useCallback(() => {
    if (cachedFonts) {
      setFonts(cachedFonts);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    // Share a single in-flight query across concurrent callers.
    if (!inflight) inflight = queryFamilies();
    void inflight
      .then((list) => {
        cachedFonts = list;
        setFonts(list);
        setStatus('ready');
      })
      .catch((error) => {
        // Permission denied / unsupported: reset so a later gesture can retry.
        inflight = null;
        console.error('Failed to enumerate local fonts:', error);
        setStatus('error');
      });
  }, []);

  return { fonts, status, load };
};

export default useSystemFonts;
