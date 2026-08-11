/**
 * @vitest-environment node
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  accountErrorMessage,
  isAccountFeatureUnavailable,
  isAccountRateLimited,
} from '@/renderer/pages/settings/WebuiSettings/accountUi';
import { describe, expect, it, vi } from 'vitest';

const t = vi.fn((key: string) => key) as unknown as (key: string, options?: Record<string, unknown>) => string;

function backendError(status: number, code: string): BackendHttpError {
  return new BackendHttpError({
    method: 'GET',
    path: '/api/admin/users',
    status,
    body: { code, error: code },
  });
}

describe('accountUi helpers', () => {
  it('maps known admin error codes to i18n keys', () => {
    expect(accountErrorMessage(backendError(403, 'ADMIN_REQUIRED'), t as never)).toBe(
      'settings.account.errors.adminRequired'
    );
    expect(accountErrorMessage(backendError(409, 'USERNAME_TAKEN'), t as never)).toBe(
      'settings.account.errors.usernameTaken'
    );
    expect(accountErrorMessage(backendError(409, 'LAST_ACTIVE_ADMIN'), t as never)).toBe(
      'settings.account.errors.lastAdmin'
    );
  });

  it('falls back for unknown and non-backend errors', () => {
    expect(accountErrorMessage(backendError(500, 'WEIRD'), t as never)).toBe('settings.account.errors.failed');
    expect(accountErrorMessage(new Error('boom'), t as never)).toBe('settings.account.errors.failed');
  });

  it('detects missing multi-user admin endpoints as feature unavailable', () => {
    expect(isAccountFeatureUnavailable(backendError(404, 'NOT_FOUND'))).toBe(true);
    expect(isAccountFeatureUnavailable(backendError(501, 'FEATURE_NOT_AVAILABLE'))).toBe(true);
    expect(isAccountFeatureUnavailable(backendError(500, 'FAILED'))).toBe(false);
    expect(isAccountFeatureUnavailable(new Error('nope'))).toBe(false);
  });

  it('detects rate limiting without treating it as feature unavailability', () => {
    expect(isAccountRateLimited(backendError(429, 'RATE_LIMITED'))).toBe(true);
    expect(isAccountRateLimited(backendError(403, 'RATE_LIMITED'))).toBe(true);
    expect(isAccountRateLimited(backendError(500, 'FAILED'))).toBe(false);
    expect(isAccountFeatureUnavailable(backendError(429, 'RATE_LIMITED'))).toBe(false);
  });
});
