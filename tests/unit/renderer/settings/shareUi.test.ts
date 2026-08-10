/**
 * @vitest-environment node
 */

import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  isShareFeatureUnavailable,
  shareDisplayName,
  shareErrorMessage,
  sharePermissionLabel,
  shareResourceLabel,
} from '@/renderer/pages/settings/WebuiSettings/shareUi';
import { describe, expect, it, vi } from 'vitest';

const t = vi.fn((key: string) => key) as unknown as (key: string, options?: Record<string, unknown>) => string;

describe('shareUi helpers', () => {
  it('maps known backend codes to collaboration error keys', () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/shares',
      status: 409,
      body: { code: 'SHARE_EXISTS', error: 'exists' },
    });
    expect(shareErrorMessage(error, t as never)).toBe('settings.account.collaboration.errors.alreadyShared');
  });

  it('falls back for unknown errors', () => {
    expect(shareErrorMessage(new Error('boom'), t as never)).toBe('settings.account.collaboration.errors.failed');
  });

  it('treats missing endpoints as feature unavailable', () => {
    const missing = new BackendHttpError({
      method: 'GET',
      path: '/api/shares/received',
      status: 404,
      body: { code: 'NOT_FOUND', error: 'missing' },
    });
    expect(isShareFeatureUnavailable(missing)).toBe(true);
    expect(isShareFeatureUnavailable(new Error('nope'))).toBe(false);
  });

  it('labels resources and permissions through i18n keys', () => {
    expect(shareResourceLabel('provider', t as never)).toBe('settings.account.collaboration.resourceTypes.provider');
    expect(sharePermissionLabel('edit', t as never)).toBe('settings.account.collaboration.permissions.edit');
  });

  it('prefers a non-empty resource name over the id', () => {
    expect(shareDisplayName('  Plan  ', 'id-1')).toBe('Plan');
    expect(shareDisplayName(null, 'id-1')).toBe('id-1');
    expect(shareDisplayName('   ', 'id-1')).toBe('id-1');
  });
});
