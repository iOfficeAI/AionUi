// POUNDING: stub types for managed CLI integrations
// These types were moved from POUNDING-specific modules

export type ManagedRuntimeCliTarget = 'claude' | 'codex' | 'hermes' | 'opencode' | 'openclaw';

export interface NewApiAccountStatus {
  loggedIn: boolean;
  baseUrl: string;
  models: string[];
  updatedAt: number;
  user?: NewApiDesktopUser;
  token?: string;
  cookies?: string[];
  managedProviderId?: string;
  envConflicts?: EnvConflict[];
}

export interface EnvConflict {
  key: string;
  source: string;
}

export interface NewApiDesktopUser {
  username: string;
  display_name?: string;
  id?: string | number;
  displayName?: string;
  email?: string;
  quota?: number;
  usedQuota?: number;
  unlimitedQuota?: boolean;
  avatarLetter?: string;
}

export interface NewApiLoginParams {
  username: string;
  password: string;
}

export interface NewApiLoginResponse {
  status?: NewApiAccountStatus;
  token?: string;
}

export interface NewApiUserPayload {
  username?: string;
  display_name?: string;
  sub?: string;
  user_name?: string;
  displayName?: string;
  name?: string;
  email?: string;
  id?: string | number;
  usedQuota?: number;
  used_quota?: number;
  quota?: number;
  remain_quota?: number;
  unlimited_quota?: boolean;
}

export interface NewApiTokenPayload {
  sub?: string;
  username?: string;
  exp?: number;
}

export interface NewApiManagedCliPrepStatus {
  inProgress: boolean;
  completed: boolean;
  stage: 'idle' | 'preparing_environment' | 'installing_hermes' | 'installing_openclaw' | 'completed' | 'failed';
  currentTarget?: string;
  completedTargets: ManagedRuntimeCliTarget[];
  percent: number;
  error?: string;
}
