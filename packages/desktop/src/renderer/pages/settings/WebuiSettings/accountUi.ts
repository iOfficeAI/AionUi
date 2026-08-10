/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { TFunction } from 'i18next';

export function accountErrorMessage(error: unknown, t: TFunction): string {
  if (!isBackendHttpError(error)) return t('settings.account.errors.failed');
  const keys: Record<string, string> = {
    ADMIN_REQUIRED: 'settings.account.errors.adminRequired',
    LAST_ACTIVE_ADMIN: 'settings.account.errors.lastAdmin',
    USER_NOT_FOUND: 'settings.account.errors.userNotFound',
    USERNAME_TAKEN: 'settings.account.errors.usernameTaken',
    PASSWORD_CHANGE_REQUIRED: 'settings.account.errors.passwordChangeRequired',
    RATE_LIMITED: 'settings.account.errors.rateLimited',
  };
  const key = keys[error.code];
  return key ? t(key) : t('settings.account.errors.failed');
}

export function isAccountFeatureUnavailable(error: unknown): boolean {
  return isBackendHttpError(error) && (error.status === 404 || error.code === 'FEATURE_NOT_AVAILABLE');
}

/** True when the failure is transient rate limiting (do not loop retry toasts). */
export function isAccountRateLimited(error: unknown): boolean {
  return isBackendHttpError(error) && (error.status === 429 || error.code === 'RATE_LIMITED');
}
