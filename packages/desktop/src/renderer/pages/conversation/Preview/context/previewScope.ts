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
