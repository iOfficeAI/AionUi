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
