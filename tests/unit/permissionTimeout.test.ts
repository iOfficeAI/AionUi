/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { GLOBAL_PERMISSION_TIMEOUT_ENV, resolvePermissionTimeoutMs } from '@/common/approval/permissionTimeout';

const ACP_TIMEOUT_ENV = 'AIONUI_ACP_PERMISSION_REQUEST_TIMEOUT_MS';

const originalGlobalValue = process.env[GLOBAL_PERMISSION_TIMEOUT_ENV];
const originalScopedValue = process.env[ACP_TIMEOUT_ENV];

afterEach(() => {
  if (originalGlobalValue === undefined) {
    delete process.env[GLOBAL_PERMISSION_TIMEOUT_ENV];
  } else {
    process.env[GLOBAL_PERMISSION_TIMEOUT_ENV] = originalGlobalValue;
  }

  if (originalScopedValue === undefined) {
    delete process.env[ACP_TIMEOUT_ENV];
  } else {
    process.env[ACP_TIMEOUT_ENV] = originalScopedValue;
  }
});

describe('resolvePermissionTimeoutMs', () => {
  it('uses fallback default when no env var is set', () => {
    delete process.env[GLOBAL_PERMISSION_TIMEOUT_ENV];
    delete process.env[ACP_TIMEOUT_ENV];

    expect(resolvePermissionTimeoutMs(30000, ACP_TIMEOUT_ENV)).toBe(30000);
  });

  it('returns null when fallback default is non-positive', () => {
    delete process.env[GLOBAL_PERMISSION_TIMEOUT_ENV];
    delete process.env[ACP_TIMEOUT_ENV];

    expect(resolvePermissionTimeoutMs(0, ACP_TIMEOUT_ENV)).toBeNull();
    expect(resolvePermissionTimeoutMs(-1, ACP_TIMEOUT_ENV)).toBeNull();
  });

  it('uses global env value when scoped env is absent', () => {
    process.env[GLOBAL_PERMISSION_TIMEOUT_ENV] = '45000';
    delete process.env[ACP_TIMEOUT_ENV];

    expect(resolvePermissionTimeoutMs(30000, ACP_TIMEOUT_ENV)).toBe(45000);
  });

  it('scoped env takes precedence over global env', () => {
    process.env[GLOBAL_PERMISSION_TIMEOUT_ENV] = '45000';
    process.env[ACP_TIMEOUT_ENV] = '15000';

    expect(resolvePermissionTimeoutMs(30000, ACP_TIMEOUT_ENV)).toBe(15000);
  });

  it('non-positive env values disable timeout (infinite wait)', () => {
    process.env[GLOBAL_PERMISSION_TIMEOUT_ENV] = '0';
    expect(resolvePermissionTimeoutMs(30000)).toBeNull();

    process.env[GLOBAL_PERMISSION_TIMEOUT_ENV] = '-100';
    expect(resolvePermissionTimeoutMs(30000)).toBeNull();
  });

  it('falls back to default when env value is invalid', () => {
    process.env[GLOBAL_PERMISSION_TIMEOUT_ENV] = 'not-a-number';
    delete process.env[ACP_TIMEOUT_ENV];

    expect(resolvePermissionTimeoutMs(30000, ACP_TIMEOUT_ENV)).toBe(30000);
  });
});
