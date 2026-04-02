/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AuthService } from '@process/webserver/auth/service/AuthService';

describe('AuthService constant-time verification helpers', () => {
  it('returns false for the dedicated missing-user bcrypt verification path', async () => {
    await expect(AuthService.constantTimeVerifyMissingUser()).resolves.toBe(false);
  });

  it('returns true when the provided password matches a valid bcrypt hash', async () => {
    const password = 'MyStr0ng!Pass';
    const hash = await AuthService.hashPassword(password);

    await expect(AuthService.constantTimeVerify(password, hash, true)).resolves.toBe(true);
  });
});
