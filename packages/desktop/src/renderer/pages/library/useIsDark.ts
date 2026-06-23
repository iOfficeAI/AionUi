/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

// ── Module-level singleton ────────────────────────────────────────────────────
// One MutationObserver shared across ALL components, regardless of how many
// call useIsDark(). Observers are only created/destroyed as subscriber count
// goes 0→1 or 1→0.

type Listener = () => void;
const listeners = new Set<Listener>();
let observer: MutationObserver | null = null;

function getSnapshot(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
}

function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) {
    observer = new MutationObserver(() => listeners.forEach((l) => l()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

/** Returns true when data-theme="dark" is set on <html>. One shared observer for all callers. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
