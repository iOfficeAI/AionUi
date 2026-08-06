/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Preview isolation scope — the single switch point for "when does the preview
 * panel reset". The preview is isolated per **scope**: switching to a different
 * scope closes the open preview; staying within the same scope keeps it open.
 *
 * The scope dimension is the **project** (`project_id`), matching the product
 * model where the Explorer + preview are Project-level: switching conversations
 * within the same project keeps the preview open; switching project resets it.
 * Until the backend populates `conversation.project_id` (stage-3 contract), and
 * for conversations without a bound project, it falls back to the **workspace**
 * path — preserving the previous per-workspace behavior with no regression.
 *
 * Pure: no React, no I/O — so it is trivially unit-testable in isolation.
 */
export type PreviewScopeKey = string | null;

/**
 * Derive the preview isolation scope key. Project id takes precedence; workspace
 * is the fallback while project id is unavailable. Empty/undefined values are
 * treated as absent, yielding the next fallback or `null`.
 */
export function previewScopeKey(
  projectId: string | null | undefined,
  workspace: string | null | undefined
): PreviewScopeKey {
  return projectId || workspace || null;
}

/**
 * localStorage key prefix for a scope's persisted preview state.
 *
 * Lives in this pure module (rather than beside the persistence code in
 * `PreviewContext`) so non-preview callers — logout cleanup in particular — can
 * identify these keys without importing the whole preview panel into their path.
 *
 * `preview-ui:` matches the Explorer's `explorer-ui:` so the two panels' persisted UI
 * state reads as one family. Renamed from `aionui_preview:` with no migration: that
 * earlier prefix appears in release tags, but the product had no real users at the
 * rename, so no stored data existed under the old key to carry over. Were that not the
 * case, this change would have needed a read-time migration — a bare rename would
 * otherwise strand every existing user's open tabs under a key nothing reads.
 */
export const PREVIEW_SCOPE_KEY_PREFIX = 'preview-ui:';

/** Storage key holding the persisted state for one preview scope. */
export const previewScopeStorageKey = (scope: string): string => `${PREVIEW_SCOPE_KEY_PREFIX}${scope}`;

/** Every persisted preview-scope key currently present in localStorage. */
export const listPersistedPreviewScopeKeys = (): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREVIEW_SCOPE_KEY_PREFIX)) keys.push(key);
  }
  return keys;
};

/**
 * Drop every persisted preview scope.
 *
 * Called on logout: these entries are keyed by project id and hold file content,
 * so leaving them would show the next account the previous one's open tabs.
 * Nothing cleaned them up before — the logout sweep only matched auth/csrf/token.
 */
export const clearPersistedPreviewScopes = (): void => {
  try {
    listPersistedPreviewScopeKeys().forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable — nothing to clear.
  }
};
