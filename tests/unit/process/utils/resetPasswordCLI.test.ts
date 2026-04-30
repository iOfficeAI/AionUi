/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('resetPasswordCLI helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@process/utils');
    vi.doUnmock('@process/webserver/auth/repository/UserRepository');
  });

  it('returns admin when resetpass is missing', async () => {
    const { resolveResetPasswordUsername } = await import('@process/utils/resetPasswordCLI');
    expect(resolveResetPasswordUsername(['node', 'server.mjs'])).toBe('admin');
  });

  it('returns admin when resetpass has no username', async () => {
    const { resolveResetPasswordUsername } = await import('@process/utils/resetPasswordCLI');
    expect(resolveResetPasswordUsername(['node', 'server.mjs', '--resetpass'])).toBe('admin');
  });

  it('returns the first positional arg after resetpass', async () => {
    const { resolveResetPasswordUsername } = await import('@process/utils/resetPasswordCLI');
    expect(resolveResetPasswordUsername(['node', 'server.mjs', '--resetpass', 'alice'])).toBe('alice');
  });

  it('skips flags and still resolves username', async () => {
    const { resolveResetPasswordUsername } = await import('@process/utils/resetPasswordCLI');
    expect(resolveResetPasswordUsername(['node', 'server.mjs', '--resetpass', '--verbose', 'alice'])).toBe('alice');
  });

  it('uses the backend-backed user repository for successful resets', async () => {
    vi.doMock('@process/utils', () => ({
      getDataPath: vi.fn(() => 'C:/mock/.aionui/aionui'),
    }));
    const userRepo = {
      hasUsers: vi.fn(async () => true),
      findByUsername: vi.fn(async () => ({
        id: 'user-1',
        username: 'admin',
        password_hash: 'old-hash',
        jwt_secret: 'old-secret',
        created_at: 0,
        updated_at: 0,
        last_login: null,
      })),
      listUsers: vi.fn(async () => []),
      updatePassword: vi.fn(async () => undefined),
      updateJwtSecret: vi.fn(async () => undefined),
    };
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: userRepo,
    }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined as never) as never);

    const { resetPasswordCLI } = await import('@process/utils/resetPasswordCLI');

    await expect(resetPasswordCLI('admin')).resolves.toBeUndefined();
    expect(userRepo.hasUsers).toHaveBeenCalledOnce();
    expect(userRepo.findByUsername).toHaveBeenCalledWith('admin');
    expect(userRepo.updatePassword).toHaveBeenCalledOnce();
    expect(userRepo.updateJwtSecret).toHaveBeenCalledOnce();
    expect(exitSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
