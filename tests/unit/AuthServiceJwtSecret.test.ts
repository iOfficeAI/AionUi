/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type AuthUser = {
  id: string;
  username: string;
  password_hash: string;
  jwt_secret: string | null;
  created_at: number;
  updated_at: number;
  last_login: number | null;
};

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'system_default_user',
    username: 'admin',
    password_hash: 'hash',
    jwt_secret: null,
    created_at: 0,
    updated_at: 0,
    last_login: null,
    ...overrides,
  };
}

describe('AuthService primary WebUI user JWT handling', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.JWT_SECRET;
  });

  it('reads the JWT secret from the primary WebUI user', async () => {
    const getPrimaryWebUIUserMock = vi.fn(async () => makeUser({ username: 'alice', jwt_secret: 'db-secret' }));
    const updateJwtSecretMock = vi.fn();

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getPrimaryWebUIUser: getPrimaryWebUIUserMock,
        updateJwtSecret: updateJwtSecretMock,
      },
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const jwtSecret = await AuthService.getJwtSecret();

    expect(jwtSecret).toBe('db-secret');
    expect(getPrimaryWebUIUserMock).toHaveBeenCalledOnce();
    expect(updateJwtSecretMock).not.toHaveBeenCalled();
  });

  it('rotates the JWT secret for the primary WebUI user when invalidating tokens', async () => {
    const getPrimaryWebUIUserMock = vi.fn(async () => makeUser({ id: 'legacy-admin', username: 'alice' }));
    const updateJwtSecretMock = vi.fn(async () => undefined);

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getPrimaryWebUIUser: getPrimaryWebUIUserMock,
        updateJwtSecret: updateJwtSecretMock,
      },
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    await AuthService.invalidateAllTokens();

    expect(getPrimaryWebUIUserMock).toHaveBeenCalledOnce();
    expect(updateJwtSecretMock).toHaveBeenCalledWith('legacy-admin', expect.any(String));
  });
});
