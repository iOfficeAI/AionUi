/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type LarkQrLoginSession = {
  expiresIn: number;
  loginUrl: string;
  qrcodeId: string;
};

export type GeaEndpointProfileV1 = {
  baseUrl: string;
  environmentId: string;
  revision: 1;
};

export type GeaEnvironmentSource = 'default' | 'environment' | 'legacyEnvironment' | 'profile';

export type GeaEnvironmentStatus = {
  baseUrl: string;
  editable: boolean;
  environmentId: string;
  source: GeaEnvironmentSource;
};

export type GeaEnvironmentUpdateResult = {
  changed: boolean;
  environment: GeaEnvironmentStatus;
};

export type LarkAuthUser = {
  /** Existing GEA role grants, used for UI affordances only. No credentials. */
  permissionCodes?: string[];
  tenantId?: string;
  environmentId?: string;
  avatar?: string;
  email?: string;
  id: string;
  phone?: string;
  realname: string;
  username: string;
};

export type LarkQrLoginStatus = 'pending' | 'expired' | 'authenticated';

export type PersonalModelSyncResult = {
  configured: number;
  failed: number;
  reason?:
    | 'credentialListFailed'
    | 'credentialClaimFailed'
    | 'credentialRecoveryRequired'
    | 'credentialSyncFailed'
    | 'localProxyFailed'
    | 'modelDiscoveryFailed'
    | 'notAuthenticated'
    | 'providerListFailed'
    | 'providerSaveFailed'
    | 'secureStorageUnavailable';
  skipped: number;
  status: 'completed' | 'notAuthenticated' | 'partial' | 'unavailable';
};

export type LarkQrLoginPollResult = {
  status: LarkQrLoginStatus;
  user?: LarkAuthUser;
  personalModelSync?: PersonalModelSyncResult;
};

export type LarkAuthStatus = {
  authenticated: boolean;
  user?: LarkAuthUser;
};

export type LarkAuthErrorCode = 'invalidResponse' | 'networkError' | 'secureStorageUnavailable' | 'serverError';

export type LarkAuthResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      code: LarkAuthErrorCode;
    };
