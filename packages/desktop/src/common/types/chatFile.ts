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
 *   - a file uploaded from the client device (blob → managed upload dir) → `upload` (`{path}`)
 *   - a file chosen from the backend machine's own filesystem (native picker
 *     in Electron / server-fs browse in WebUI) → `local` (`{path}`) — already an
 *     absolute path on the backend host, so it is sent as-is (no upload).
 */
export type ChatFileRef =
  | { kind: 'project'; pe_id: string; relative_path: string }
  | { kind: 'upload'; path: string }
  | { kind: 'local'; path: string };

/**
 * How `POST /api/fs/content` encodes returned file content. Mirrors the aioncore
 * `ContentEncoding` (serde lowercase): `utf8` for text, `dataurl` for images
 * (backend prepends `data:<mime>;base64,`), `base64` for raw bytes.
 */
export type ContentEncoding = 'utf8' | 'base64' | 'dataurl';

/** Build a project-scoped file ref from an Explorer tree node's identity. */
export const projectFileRef = (pe_id: string, relative_path: string): ChatFileRef => ({
  kind: 'project',
  pe_id,
  relative_path,
});

/** Build an upload file ref from a device-upload managed path. */
export const uploadFileRef = (path: string): ChatFileRef => ({ kind: 'upload', path });

/** Build a local file ref from a backend-machine absolute path (native/server picker). */
export const localFileRef = (path: string): ChatFileRef => ({ kind: 'local', path });

/** The on-disk/relative path carried by a ref (relative for project, absolute otherwise). */
export const chatFileRefPath = (ref: ChatFileRef): string => (ref.kind === 'project' ? ref.relative_path : ref.path);

/**
 * Stable dedup/identity key for a ref: project refs by pe identity, uploads and
 * locals by path (tagged by kind so an upload and a local sharing a path string
 * stay distinct). The `\0` separator can't occur in a path segment.
 */
export const chatFileRefKey = (ref: ChatFileRef): string =>
  ref.kind === 'project' ? `project\0${ref.pe_id}\0${ref.relative_path}` : `${ref.kind}\0${ref.path}`;

/** Runtime shape guard — validates untrusted (e.g. persisted) data is a ChatFileRef. */
export const isChatFileRef = (value: unknown): value is ChatFileRef => {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Record<string, unknown>;
  if (ref.kind === 'project') return typeof ref.pe_id === 'string' && typeof ref.relative_path === 'string';
  if (ref.kind === 'upload' || ref.kind === 'local') return typeof ref.path === 'string';
  return false;
};
