/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Project Explorer HTTP control-plane DTOs (stage3 contract
 * `explorer-stage3-be-http-contract.md`). The control plane (project metadata:
 * roots / display_path / runtime_status) is HTTP; the data plane (directory
 * contents) is the WS `fs/*` monitor. These shapes mirror the backend
 * `aionui-api-types/project` DTOs 1:1 — no absolute path / canonical / folder_id
 * is ever sent to the front-end (it only ever deals in `{ pe_id, relative_path }`).
 */

/** Whether a root's underlying folder is currently reachable (root-row status). */
export type ProjectRuntimeStatus = 'available' | 'missing' | 'permission_denied' | 'disconnected';

/** A pe entry's role in the project: the immutable workspace vs an attached folder. */
export type ProjectEntryRole = 'workspace' | 'attached';

/**
 * One project_explorer entry (a pe root). Same shape whether returned inside
 * `GET /api/projects/{id}` or from `POST .../folders` (attach). Backend sorts
 * `entries` by `order_index` ascending — the front-end does not re-sort.
 */
export type ProjectEntryDto = {
  pe_id: string;
  role: ProjectEntryRole;
  /** User label; when null the front-end falls back to the display_path basename. */
  display_name?: string | null;
  /** Human-facing read-only path (derived from the folder's resource_uri). */
  display_path: string;
  order_index: number;
  runtime_status: ProjectRuntimeStatus;
};

/** `GET /api/projects/{id}` response. */
export type ProjectDetailDto = {
  project_id: string;
  name: string;
  explorer: {
    /** pe_id of the workspace root (pinned + non-removable in the tree). */
    workspace_pe_id: string;
    entries: ProjectEntryDto[];
  };
};

/** `POST /api/projects/{id}/folders` request body. `uri` is a `file://…` URI. */
export type AttachFolderRequest = {
  uri: string;
  display_name?: string;
};

/**
 * Stable domain error codes on the attach path (surfaced via BackendHttpError.code).
 * Subdir attach is idempotent focus (200, existing entry — not an error); the
 * codes below are the 4xx cases the UI branches on.
 */
export const PROJECT_ERROR_DUPLICATE = 'project_explorer_duplicate';
export const PROJECT_ERROR_OVERLAP = 'project_explorer_overlap';
