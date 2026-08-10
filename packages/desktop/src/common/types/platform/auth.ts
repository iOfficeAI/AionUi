/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuthRole = 'admin' | 'member';

export type AuthAccountStatus = 'active' | 'disabled';

/** Public identity returned by login and current-user endpoints. */
export type AuthUser = {
  id: string;
  username: string;
  role: AuthRole;
  status: AuthAccountStatus;
  must_change_password: boolean;
};

export type AdminUser = AuthUser & {
  user_type: 'local' | 'aionpro';
  created_at: number;
  updated_at: number;
  last_login: number | null;
};

export type AdminUserList = {
  items: AdminUser[];
  total: number;
};

export type TemporaryPasswordResult = {
  user?: AdminUser;
  temporary_password: string;
};

export type AdminAuditEntry = {
  id: string;
  occurred_at: number;
  actor_user_id: string | null;
  actor_username: string | null;
  action: string;
  target_user_id: string | null;
  target_username: string | null;
  details: Record<string, unknown>;
};

export type AdminAuditPage = {
  items: AdminAuditEntry[];
  next_cursor?: string | null;
};
