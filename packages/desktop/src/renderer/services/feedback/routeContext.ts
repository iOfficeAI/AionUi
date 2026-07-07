/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export function captureFeedbackRoute(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const hash = window.location.hash.trim();
  if (hash) return hash;
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return path.trim() || undefined;
}
