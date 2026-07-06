/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { assertValidDatabaseVersion } from '@process/services/database/schema';
import { isValidLegacyPasswordHash } from '@process/utils/ensureAdminUser';
import { getPortSecurityWarnings, parsePortValue } from '@process/utils/webuiConfig';

describe('assertValidDatabaseVersion', () => {
  it('accepts valid non-negative integers', () => {
    expect(assertValidDatabaseVersion(0)).toBe(0);
    expect(assertValidDatabaseVersion(1)).toBe(1);
    expect(assertValidDatabaseVersion(26)).toBe(26);
  });

  it('accepts MAX_SAFE_INTEGER', () => {
    expect(assertValidDatabaseVersion(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects negative numbers', () => {
    expect(() => assertValidDatabaseVersion(-1)).toThrow('Invalid database version: -1 (must be >= 0)');
    expect(() => assertValidDatabaseVersion(-100)).toThrow();
  });

  it('rejects NaN', () => {
    expect(() => assertValidDatabaseVersion(NaN)).toThrow('Invalid database version: NaN');
  });

  it('rejects Infinity', () => {
    expect(() => assertValidDatabaseVersion(Infinity)).toThrow('Invalid database version: Infinity');
  });

  it('rejects -Infinity', () => {
    expect(() => assertValidDatabaseVersion(-Infinity)).toThrow();
  });

  it('rejects non-integer values', () => {
    expect(() => assertValidDatabaseVersion(1.5)).toThrow('Invalid database version: 1.5');
    expect(() => assertValidDatabaseVersion(0.9)).toThrow();
  });

  it('rejects values over MAX_SAFE_INTEGER', () => {
    expect(() => assertValidDatabaseVersion(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'Invalid database version: 9007199254740992 (must be <= Number.MAX_SAFE_INTEGER)'
    );
  });
});

describe('isValidLegacyPasswordHash', () => {
  it('accepts valid hex hashes of standard lengths (32-128 chars)', () => {
    expect(isValidLegacyPasswordHash('a'.repeat(32))).toBe(true);
    expect(isValidLegacyPasswordHash('A'.repeat(64))).toBe(true);
    expect(isValidLegacyPasswordHash('0123456789abcdef'.repeat(8))).toBe(true);
    expect(isValidLegacyPasswordHash('a'.repeat(128))).toBe(true);
  });

  it('rejects hex hashes shorter than 32 characters', () => {
    expect(isValidLegacyPasswordHash('a'.repeat(31))).toBe(false);
    expect(isValidLegacyPasswordHash('ab')).toBe(false);
  });

  it('rejects hex hashes longer than 128 characters', () => {
    expect(isValidLegacyPasswordHash('a'.repeat(129))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidLegacyPasswordHash('g'.repeat(32))).toBe(false);
    expect(isValidLegacyPasswordHash('xyz123'.repeat(6))).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidLegacyPasswordHash('')).toBe(false);
  });

  it('rejects strings with special characters', () => {
    expect(isValidLegacyPasswordHash('a'.repeat(32) + '!')).toBe(false);
    expect(isValidLegacyPasswordHash('a'.repeat(32) + ' ')).toBe(false);
  });
});

describe('getPortSecurityWarnings', () => {
  it('returns no warnings for non-privileged, non-well-known ports', () => {
    expect(getPortSecurityWarnings(25808)).toEqual([]);
    expect(getPortSecurityWarnings(30000)).toEqual([]);
  });

  it('returns warning for privileged ports (<1024)', () => {
    const warnings = getPortSecurityWarnings(80);
    expect(warnings).toHaveLength(2);
  });

  it('returns warning for privileged ports that are not well-known (e.g. port 443)', () => {
    const warnings = getPortSecurityWarnings(79);
    expect(warnings).toHaveLength(1);
  });

  it('returns warning for well-known ports', () => {
    const warnings = getPortSecurityWarnings(8080);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('well-known port');
  });

  it('returns both warnings for ports that are both privileged and well-known', () => {
    const warnings = getPortSecurityWarnings(80);
    expect(warnings).toHaveLength(2);
  });

  it('warns for port 443 which is both privileged and well-known', () => {
    const warnings = getPortSecurityWarnings(443);
    expect(warnings).toHaveLength(2);
  });

  it('warns for well-known port 8080', () => {
    const warnings = getPortSecurityWarnings(8080);
    expect(warnings).toHaveLength(1);
  });

  it('does not warn for non-privileged, non-well-known ports like 25808', () => {
    expect(getPortSecurityWarnings(25808)).toEqual([]);
  });
});

describe('parsePortValue (unchanged behavior)', () => {
  it('returns null for undefined, null, or empty string', () => {
    expect(parsePortValue(undefined)).toBeNull();
    expect(parsePortValue(null)).toBeNull();
    expect(parsePortValue('')).toBeNull();
  });

  it('returns null for invalid numbers', () => {
    expect(parsePortValue(NaN)).toBeNull();
    expect(parsePortValue(Infinity)).toBeNull();
  });

  it('returns null for out-of-range values', () => {
    expect(parsePortValue(0)).toBeNull();
    expect(parsePortValue(-1)).toBeNull();
    expect(parsePortValue(65536)).toBeNull();
  });

  it('parses valid port strings and numbers', () => {
    expect(parsePortValue(8080)).toBe(8080);
    expect(parsePortValue('3000')).toBe(3000);
  });

  it('rejects non-numeric strings', () => {
    expect(parsePortValue('abc')).toBeNull();
  });

  it('does not log warnings (warnings are in getPortSecurityWarnings)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parsePortValue(80);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
