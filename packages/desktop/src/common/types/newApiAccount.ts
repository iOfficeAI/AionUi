/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type NewApiLoginParams = {
  username: string;
  password: string;
};

export type ManagedRuntimeCliTarget = 'claude' | 'hermes' | 'opencode' | 'openclaw';

export type NewApiDesktopUser = {
  id?: string;
  username: string;
  displayName?: string;
  email?: string;
  quota?: number;
  usedQuota?: number;
  avatarLetter?: string;
};

export type NewApiAccountStatus = {
  loggedIn: boolean;
  baseUrl: string;
  models: string[];
  updatedAt: number;
  user?: NewApiDesktopUser;
  token?: string;
  cookies?: string[];
  managedProviderId?: string;
};

export type NewApiLoginResponse = {
  status: NewApiAccountStatus;
};

export type NewApiManagedCliPrepStage =
  | 'idle'
  | 'preparing_environment'
  | 'installing_hermes'
  | 'installing_openclaw'
  | 'completed'
  | 'failed';

export type NewApiManagedCliPrepStatus = {
  inProgress: boolean;
  completed: boolean;
  stage: NewApiManagedCliPrepStage;
  currentTarget?: ManagedRuntimeCliTarget;
  completedTargets: ManagedRuntimeCliTarget[];
  percent: number;
  error?: string;
};

export type NewApiTokenPayload = {
  token?: string;
  access_token?: string;
  accessToken?: string;
  key?: string;
  value?: string;
  data?: unknown;
};

export type NewApiUserPayload = NewApiDesktopUser & {
  quota_used?: number;
  used_quota?: number;
  remain_quota?: number;
  quota?: number;
  user_name?: string;
  name?: string;
};
