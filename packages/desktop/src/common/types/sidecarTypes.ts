/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sidecar — embedded reverse-proxied local services in tabs (Phase 3 WS3).
 *
 * The backend (AionCore) exposes a registration table of `id` → `port` → `url`.
 * Registration is idempotent for the same `(name, port)` pair and the response
 * carries a single-use token that the renderer hands to the webview on first
 * navigation. The token is exchanged for a session cookie by the proxy and
 * later in-tab navigations ride the cookie.
 *
 * Only `name` and `port` are persisted client-side; `id`, `url`, and `token`
 * are returned by the backend at runtime and must NOT be stored in user
 * config (the token is single-use, and `id`/`url` are derivable from port).
 */

/** User-facing sidecar configuration persisted under `sidecars.items`. */
export type SidecarConfig = {
  /** Backend-assigned id; set after first successful registration. */
  id?: string;
  /** Display name (must be unique within a workspace). */
  name: string;
  /** Localhost port the target service listens on (1024–65535). */
  port: number;
};

/** Runtime registration returned by the backend `POST /api/sidecars`. */
export type SidecarRegistration = {
  id: string;
  name: string;
  port: number;
  /** Relative proxy path the renderer prepends the backend origin to. */
  url: string;
  /** One-shot token; consumed by the proxy on first navigation. */
  token: string;
};

/** Row the backend returns from `GET /api/sidecars`. */
export type SidecarBackendRow = {
  id: string;
  name: string;
  port: number;
  url: string;
};
