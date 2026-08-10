/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Resources that AionCore can share between multi-user accounts. */
export type ShareResourceType = 'conversation' | 'project' | 'provider';

/** Access level granted to a share grantee. */
export type SharePermission = 'view' | 'edit';

/** One share grant returned by list/create endpoints. */
export type ShareRecord = {
  id: string;
  resource_type: ShareResourceType;
  resource_id: string;
  /** Optional display label when the backend resolves the resource name. */
  resource_name?: string | null;
  permission: SharePermission;
  owner_user_id: string;
  owner_username: string;
  grantee_user_id: string;
  grantee_username: string;
  created_at: number;
};

export type ShareList = {
  items: ShareRecord[];
};

export type CreateShareRequest = {
  resource_type: ShareResourceType;
  resource_id: string;
  grantee_username: string;
  permission: SharePermission;
};

/** Active account listed by GET /api/users/directory for the share picker. */
export type DirectoryUser = {
  id: string;
  username: string;
};

export type UserDirectory = {
  items: DirectoryUser[];
};

const SHARE_RESOURCE_TYPES = new Set<ShareResourceType>(['conversation', 'project', 'provider']);
const SHARE_PERMISSIONS = new Set<SharePermission>(['view', 'edit']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Normalize one share payload from AionCore (defensive against field drift). */
export function normalizeShareRecord(raw: unknown): ShareRecord | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const id = asString(obj.id);
  const resourceType = asString(obj.resource_type);
  const resourceId = asString(obj.resource_id);
  const permission = asString(obj.permission);
  const ownerUserId = asString(obj.owner_user_id);
  const ownerUsername = asString(obj.owner_username);
  const granteeUserId = asString(obj.grantee_user_id);
  const granteeUsername = asString(obj.grantee_username);
  const createdAt = asNumber(obj.created_at) ?? 0;

  if (
    !id ||
    !resourceType ||
    !SHARE_RESOURCE_TYPES.has(resourceType as ShareResourceType) ||
    !resourceId ||
    !permission ||
    !SHARE_PERMISSIONS.has(permission as SharePermission) ||
    !ownerUserId ||
    !ownerUsername ||
    !granteeUserId ||
    !granteeUsername
  ) {
    return null;
  }

  const resourceName = obj.resource_name;
  return {
    id,
    resource_type: resourceType as ShareResourceType,
    resource_id: resourceId,
    resource_name: typeof resourceName === 'string' ? resourceName : null,
    permission: permission as SharePermission,
    owner_user_id: ownerUserId,
    owner_username: ownerUsername,
    grantee_user_id: granteeUserId,
    grantee_username: granteeUsername,
    created_at: createdAt,
  };
}

/**
 * Accept either `{ items: [...] }` or a bare array — both shapes appear in
 * list-style AionCore endpoints during rollouts.
 */
export function normalizeShareList(raw: unknown): ShareList {
  const itemsSource = Array.isArray(raw) ? raw : (asRecord(raw)?.items ?? asRecord(raw)?.shares);
  if (!Array.isArray(itemsSource)) return { items: [] };
  return {
    items: itemsSource.map(normalizeShareRecord).filter((item): item is ShareRecord => item !== null),
  };
}

export function normalizeDirectoryUser(raw: unknown): DirectoryUser | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = asString(obj.id);
  const username = asString(obj.username);
  if (!id || !username) return null;
  return { id, username };
}

export function normalizeUserDirectory(raw: unknown): UserDirectory {
  const itemsSource = Array.isArray(raw) ? raw : (asRecord(raw)?.items ?? asRecord(raw)?.users);
  if (!Array.isArray(itemsSource)) return { items: [] };
  return {
    items: itemsSource.map(normalizeDirectoryUser).filter((item): item is DirectoryUser => item !== null),
  };
}
