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
    vi.doUnmock('@process/services/database/export');
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

  it('uses the shared database abstraction for successful resets', async () => {
    const mockDb = {
      hasUsers: vi.fn(() => ({ success: true, data: true })),
      getUserByUsername: vi.fn(() => ({
        success: true,
        data: {
          id: 'user-1',
          username: 'admin',
          password_hash: 'old-hash',
          jwt_secret: 'old-secret',
        },
      })),
      getAllUsers: vi.fn(() => ({ success: true, data: [] })),
      updateUserPassword: vi.fn(() => ({ success: true, data: true })),
      updateUserJwtSecret: vi.fn(() => ({ success: true, data: true })),
    };
    const closeDatabase = vi.fn();

    vi.doMock('@process/utils', () => ({
      getDataPath: vi.fn(() => 'C:/mock/.aionui/aionui'),
    }));
    vi.doMock('@process/services/database/export', () => ({
      getDatabase: vi.fn(() => Promise.resolve(mockDb)),
      closeDatabase,
    }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined as never) as never);

    const { resetPasswordCLI } = await import('@process/utils/resetPasswordCLI');

    await expect(resetPasswordCLI('admin')).resolves.toBeUndefined();
    expect(mockDb.hasUsers).toHaveBeenCalledOnce();
    expect(mockDb.getUserByUsername).toHaveBeenCalledWith('admin');
    expect(mockDb.updateUserPassword).toHaveBeenCalledOnce();
    expect(mockDb.updateUserJwtSecret).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(exitSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
