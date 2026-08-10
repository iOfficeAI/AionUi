/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ShareResourceType } from '@/common/types/platform/share';
import type { TFunction } from 'i18next';
import { isAccountFeatureUnavailable } from './accountUi';

/** Map backend share errors to i18n keys. */
export function shareErrorMessage(error: unknown, t: TFunction): string {
  if (!isBackendHttpError(error)) return t('settings.account.collaboration.errors.failed');
  const keys: Record<string, string> = {
    ADMIN_REQUIRED: 'settings.account.errors.adminRequired',
    USER_NOT_FOUND: 'settings.account.errors.userNotFound',
    SHARE_NOT_FOUND: 'settings.account.collaboration.errors.notFound',
    SHARE_EXISTS: 'settings.account.collaboration.errors.alreadyShared',
    SHARE_SELF: 'settings.account.collaboration.errors.cannotShareSelf',
    INVALID_PERMISSION: 'settings.account.collaboration.errors.invalidPermission',
    INVALID_RESOURCE: 'settings.account.collaboration.errors.invalidResource',
    FORBIDDEN: 'settings.account.collaboration.errors.forbidden',
    FEATURE_NOT_AVAILABLE: 'settings.account.collaboration.errors.featureUnavailable',
    RATE_LIMITED: 'settings.account.errors.rateLimited',
  };
  const key = keys[error.code];
  return key ? t(key) : t('settings.account.collaboration.errors.failed');
}

export function isShareFeatureUnavailable(error: unknown): boolean {
  return isAccountFeatureUnavailable(error);
}

/** First non-empty project_id among conversations (workspace groups often carry it). */
export function resolveProjectIdFromConversations(conversations: Array<{ project_id?: string | null }>): string | null {
  for (const conversation of conversations) {
    const id = conversation.project_id;
    if (typeof id === 'string' && id.trim().length > 0) return id.trim();
  }
  return null;
}

export function shareResourceLabel(type: ShareResourceType, t: TFunction): string {
  return t(`settings.account.collaboration.resourceTypes.${type}`);
}

export function sharePermissionLabel(permission: 'view' | 'edit', t: TFunction): string {
  return t(`settings.account.collaboration.permissions.${permission}`);
}

/** Prefer backend resource_name, then fall back to the raw resource id. */
export function shareDisplayName(resourceName: string | null | undefined, resourceId: string): string {
  if (typeof resourceName === 'string' && resourceName.trim().length > 0) return resourceName.trim();
  return resourceId;
}
