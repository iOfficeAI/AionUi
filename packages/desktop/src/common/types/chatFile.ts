/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A file reference sent with a chat message. Mirrors the aioncore `ChatFileRef`
 * serde shape (internally-tagged on `kind`) — the backend is the source of
 * truth; this must stay aligned with it.
 *
 * The backend resolves each ref to an absolute path at the edge (project refs
 * via `resolve_reference`, uploads by their stored path) and injects it into the
 * agent — so the front-end no longer builds absolute paths nor splices them into
 * the message body.
 *
 * `kind` is discriminated by SOURCE, not by any setting:
 *   - a file picked from the Explorer tree → `project` (`{pe_id, relative_path}`)
 *   - a file added via the upload button    → `upload` (`{path}`)
 */
export type ChatFileRef = { kind: 'project'; pe_id: string; relative_path: string } | { kind: 'upload'; path: string };

/** Build a project-scoped file ref from an Explorer tree node's identity. */
export const projectFileRef = (pe_id: string, relative_path: string): ChatFileRef => ({
  kind: 'project',
  pe_id,
  relative_path,
});

/** Build an upload file ref from a device/upload path. */
export const uploadFileRef = (path: string): ChatFileRef => ({ kind: 'upload', path });

/**
 * Stable dedup/identity key for a ref: project refs by pe identity, uploads by
 * path. The `\0` separator can't occur in a path segment, so keys never collide
 * across the two kinds.
 */
export const chatFileRefKey = (ref: ChatFileRef): string =>
  ref.kind === 'project' ? `project\0${ref.pe_id}\0${ref.relative_path}` : `upload\0${ref.path}`;

/** Runtime shape guard — validates untrusted (e.g. persisted) data is a ChatFileRef. */
export const isChatFileRef = (value: unknown): value is ChatFileRef => {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Record<string, unknown>;
  if (ref.kind === 'project') return typeof ref.pe_id === 'string' && typeof ref.relative_path === 'string';
  if (ref.kind === 'upload') return typeof ref.path === 'string';
  return false;
};
