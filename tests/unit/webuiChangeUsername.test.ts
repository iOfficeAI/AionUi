/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// AuthService.validateUsername  (pure string validation, no DB involved)
// ---------------------------------------------------------------------------

describe('AuthService.validateUsername', () => {
  beforeEach(() => {
    vi.resetModules();
    // Break the DB import chain triggered by UserRepository
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() => ({})),
    }));
  });

  it('returns valid for a well-formed username', async () => {
    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const result = AuthService.validateUsername('alice_42');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects username shorter than 3 characters', async () => {
    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const result = AuthService.validateUsername('ab');
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toMatch(/3/);
  });

  it('rejects username longer than 32 characters', async () => {
    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const result = AuthService.validateUsername('a'.repeat(33));
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toMatch(/32/);
  });

  it('rejects username with invalid characters (space)', async () => {
    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const result = AuthService.validateUsername('user name');
    expect(result.isValid).toBe(false);
  });

  it('rejects username starting with hyphen', async () => {
    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const result = AuthService.validateUsername('-alice');
    expect(result.isValid).toBe(false);
  });

  it('rejects username ending with underscore', async () => {
    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const result = AuthService.validateUsername('alice_');
    expect(result.isValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UserRepository.updateUsername
// ---------------------------------------------------------------------------

describe('UserRepository.updateUsername', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not throw when db.updateUserUsername succeeds', async () => {
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() =>
        Promise.resolve({
          updateUserUsername: vi.fn(() => ({ success: true, data: true })),
        })
      ),
    }));

    const { UserRepository } = await import('@process/webserver/auth/repository/UserRepository');
    await expect(UserRepository.updateUsername('user-123', 'newname')).resolves.not.toThrow();
  });

  it('throws when db.updateUserUsername returns failure', async () => {
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() =>
        Promise.resolve({
          updateUserUsername: vi.fn(() => ({
            success: false,
            error: 'UNIQUE constraint failed',
            data: false,
          })),
        })
      ),
    }));

    const { UserRepository } = await import('@process/webserver/auth/repository/UserRepository');
    await expect(UserRepository.updateUsername('user-123', 'taken')).rejects.toThrow('UNIQUE constraint failed');
  });

  it('calls db.updateUserUsername with correct arguments', async () => {
    const updateUserUsernameMock = vi.fn(() => ({ success: true, data: true }));
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() => Promise.resolve({ updateUserUsername: updateUserUsernameMock })),
    }));

    const { UserRepository } = await import('@process/webserver/auth/repository/UserRepository');
    await UserRepository.updateUsername('user-123', 'newname');
    expect(updateUserUsernameMock).toHaveBeenCalledWith('user-123', 'newname');
  });
});

// ---------------------------------------------------------------------------
// UserRepository.getPrimaryWebUIUser
// ---------------------------------------------------------------------------

describe('UserRepository.getPrimaryWebUIUser', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const makeDbUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'system_default_user',
    username: 'system_default_user',
    password_hash: '',
    jwt_secret: null,
    created_at: 0,
    updated_at: 0,
    last_login: null,
    ...overrides,
  });

  it('prefers the initialized system user when it already has a password', async () => {
    const getUserByUsernameMock = vi.fn();

    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() =>
        Promise.resolve({
          getSystemUser: vi.fn(() => makeDbUser({ username: 'alice', password_hash: 'hash' })),
          getUserByUsername: getUserByUsernameMock,
        })
      ),
    }));

    const { UserRepository } = await import('@process/webserver/auth/repository/UserRepository');
    const result = await UserRepository.getPrimaryWebUIUser();

    expect(result?.username).toBe('alice');
    expect(getUserByUsernameMock).not.toHaveBeenCalled();
  });

  it('falls back to the legacy admin record when the system placeholder has no password', async () => {
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() =>
        Promise.resolve({
          getSystemUser: vi.fn(() => makeDbUser()),
          getUserByUsername: vi.fn(() => ({
            success: true,
            data: makeDbUser({
              id: 'legacy-admin',
              username: 'admin',
              password_hash: 'legacy-hash',
            }),
          })),
        })
      ),
    }));

    const { UserRepository } = await import('@process/webserver/auth/repository/UserRepository');
    const result = await UserRepository.getPrimaryWebUIUser();

    expect(result?.id).toBe('legacy-admin');
    expect(result?.username).toBe('admin');
  });

  it('returns a renamed system user when the placeholder has been customized but not initialized', async () => {
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() =>
        Promise.resolve({
          getSystemUser: vi.fn(() => makeDbUser({ username: 'alice' })),
          getUserByUsername: vi.fn(() => ({
            success: true,
            data: null,
          })),
        })
      ),
    }));

    const { UserRepository } = await import('@process/webserver/auth/repository/UserRepository');
    const result = await UserRepository.getPrimaryWebUIUser();

    expect(result?.id).toBe('system_default_user');
    expect(result?.username).toBe('alice');
  });

  it('returns null when only an empty placeholder system user exists', async () => {
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() =>
        Promise.resolve({
          getSystemUser: vi.fn(() => makeDbUser()),
          getUserByUsername: vi.fn(() => ({
            success: true,
            data: null,
          })),
        })
      ),
    }));

    const { UserRepository } = await import('@process/webserver/auth/repository/UserRepository');

    await expect(UserRepository.getPrimaryWebUIUser()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WebuiService.changeUsername
// ---------------------------------------------------------------------------

describe('WebuiService.changeUsername', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const makeAdminUser = (username = 'admin') => ({
    id: 'system_default_user',
    username,
    password_hash: 'hash',
    jwt_secret: null,
    created_at: 0,
    updated_at: 0,
    last_login: null,
  });

  it('returns current username without calling updateUsername when name is unchanged', async () => {
    const updateUsernameMock = vi.fn();
    const invalidateAllTokensMock = vi.fn();

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getSystemUser: vi.fn(() => makeAdminUser('admin')),
        getPrimaryWebUIUser: vi.fn(() => makeAdminUser('admin')),
        findByUsername: vi.fn(() => null),
        updateUsername: updateUsernameMock,
      },
    }));
    vi.doMock('@process/webserver/auth/service/AuthService', () => ({
      AuthService: {
        validateUsername: vi.fn(() => ({ isValid: true, errors: [] })),
        invalidateAllTokens: invalidateAllTokensMock,
      },
    }));
    vi.doMock('@process/webserver/index', () => ({
      getInitialAdminPassword: vi.fn(() => null),
      clearInitialAdminPassword: vi.fn(),
    }));

    const { WebuiService } = await import('@/process/bridge/services/WebuiService');
    const result = await WebuiService.changeUsername('admin');
    expect(result).toBe('admin');
    expect(updateUsernameMock).not.toHaveBeenCalled();
    expect(invalidateAllTokensMock).not.toHaveBeenCalled();
  });

  it('throws when username fails validation', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getSystemUser: vi.fn(() => makeAdminUser('admin')),
        getPrimaryWebUIUser: vi.fn(() => makeAdminUser('admin')),
        findByUsername: vi.fn(() => null),
        updateUsername: vi.fn(),
      },
    }));
    vi.doMock('@process/webserver/auth/service/AuthService', () => ({
      AuthService: {
        validateUsername: vi.fn(() => ({
          isValid: false,
          errors: ['Username must be at least 3 characters long'],
        })),
        invalidateAllTokens: vi.fn(),
      },
    }));
    vi.doMock('@process/webserver/index', () => ({
      getInitialAdminPassword: vi.fn(() => null),
      clearInitialAdminPassword: vi.fn(),
    }));

    const { WebuiService } = await import('@/process/bridge/services/WebuiService');
    await expect(WebuiService.changeUsername('ab')).rejects.toThrow('Username must be at least 3 characters long');
  });

  it('throws when username is already taken by another user', async () => {
    const otherUser = { ...makeAdminUser('taken'), id: 'other-user-id' };

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getSystemUser: vi.fn(() => makeAdminUser('admin')),
        getPrimaryWebUIUser: vi.fn(() => makeAdminUser('admin')),
        findByUsername: vi.fn(() => otherUser),
        updateUsername: vi.fn(),
      },
    }));
    vi.doMock('@process/webserver/auth/service/AuthService', () => ({
      AuthService: {
        validateUsername: vi.fn(() => ({ isValid: true, errors: [] })),
        invalidateAllTokens: vi.fn(),
      },
    }));
    vi.doMock('@process/webserver/index', () => ({
      getInitialAdminPassword: vi.fn(() => null),
      clearInitialAdminPassword: vi.fn(),
    }));

    const { WebuiService } = await import('@/process/bridge/services/WebuiService');
    await expect(WebuiService.changeUsername('taken')).rejects.toThrow('Username already exists');
  });

  it('calls updateUsername and invalidateAllTokens on successful change', async () => {
    const updateUsernameMock = vi.fn();
    const invalidateAllTokensMock = vi.fn();

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getSystemUser: vi.fn(() => makeAdminUser('admin')),
        getPrimaryWebUIUser: vi.fn(() => makeAdminUser('admin')),
        findByUsername: vi.fn(() => null),
        updateUsername: updateUsernameMock,
      },
    }));
    vi.doMock('@process/webserver/auth/service/AuthService', () => ({
      AuthService: {
        validateUsername: vi.fn(() => ({ isValid: true, errors: [] })),
        invalidateAllTokens: invalidateAllTokensMock,
      },
    }));
    vi.doMock('@process/webserver/index', () => ({
      getInitialAdminPassword: vi.fn(() => null),
      clearInitialAdminPassword: vi.fn(),
    }));

    const { WebuiService } = await import('@/process/bridge/services/WebuiService');
    const result = await WebuiService.changeUsername('newname');
    expect(result).toBe('newname');
    expect(updateUsernameMock).toHaveBeenCalledWith('system_default_user', 'newname');
    expect(invalidateAllTokensMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// WebuiService.getStatus
// ---------------------------------------------------------------------------

describe('WebuiService.getStatus', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses the primary WebUI user for the reported admin username', async () => {
    const primaryUser = {
      id: 'system_default_user',
      username: 'alice',
      password_hash: 'hash',
      jwt_secret: null,
      created_at: 0,
      updated_at: 0,
      last_login: null,
    };

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getPrimaryWebUIUser: vi.fn(async () => primaryUser),
      },
    }));
    vi.doMock('@process/webserver/index', () => ({
      getInitialAdminPassword: vi.fn(() => null),
      clearInitialAdminPassword: vi.fn(),
    }));

    const { WebuiService } = await import('@/process/bridge/services/WebuiService');
    const status = await WebuiService.getStatus({
      server: {} as never,
      wss: {} as never,
      port: 3000,
      allowRemote: false,
    });

    expect(status.adminUsername).toBe('alice');
  });
});
