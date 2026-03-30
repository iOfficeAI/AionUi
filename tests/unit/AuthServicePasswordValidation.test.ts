/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AuthService } from '@process/webserver/auth/service/AuthService';

describe('AuthService.validatePasswordStrength', () => {
  it('should return PASSWORD_TOO_SHORT for passwords under 8 characters', () => {
    const result = AuthService.validatePasswordStrength('short');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('PASSWORD_TOO_SHORT');
  });

  it('should return PASSWORD_TOO_LONG for passwords over 128 characters', () => {
    const result = AuthService.validatePasswordStrength('a'.repeat(129));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('PASSWORD_TOO_LONG');
  });

  it('should return PASSWORD_TOO_COMMON for weak passwords', () => {
    const result = AuthService.validatePasswordStrength('password');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('PASSWORD_TOO_COMMON');
  });

  it('should accept a strong password', () => {
    const result = AuthService.validatePasswordStrength('MyStr0ng!Pass');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return error codes in UPPER_SNAKE_CASE, not human-readable strings', () => {
    const result = AuthService.validatePasswordStrength('short');
    for (const error of result.errors) {
      expect(error).toMatch(/^[A-Z_]+$/);
    }
  });
});
