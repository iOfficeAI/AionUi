/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const QUERY = '(prefers-color-scheme: dark)';

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

/** Current OS appearance. Defaults to light when the media query is unavailable. */
export function getSystemPrefersDark(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

/** Subscribe to OS appearance changes. Returns an unsubscribe function. */
export function watchSystemPrefersDark(onChange: (prefersDark: boolean) => void): () => void {
  const mql = getMediaQueryList();
  if (!mql) return () => {};
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
