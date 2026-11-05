/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isValidContextLimit, normalizeContextLimit } from '@/common/utils/modelCapabilities';

describe('normalizeContextLimit', () => {
  it('turns the string an Arco number input returns into an integer', () => {
    expect(normalizeContextLimit('100000')).toBe(100000);
    expect(normalizeContextLimit(200000)).toBe(200000);
    // Surrounding whitespace comes from pasted values.
    expect(normalizeContextLimit('  128000 ')).toBe(128000);
  });

  it('treats a blank field as "no limit configured"', () => {
    expect(normalizeContextLimit('')).toBeUndefined();
    expect(normalizeContextLimit('   ')).toBeUndefined();
    expect(normalizeContextLimit(undefined)).toBeUndefined();
    expect(normalizeContextLimit(null)).toBeUndefined();
  });

  it('rejects values the backend cannot store as a positive integer', () => {
    expect(normalizeContextLimit('abc')).toBeUndefined();
    expect(normalizeContextLimit('12.5')).toBeUndefined();
    expect(normalizeContextLimit('0')).toBeUndefined();
    expect(normalizeContextLimit('-1000')).toBeUndefined();
    // parseInt would have silently truncated these to 12 / 1.
    expect(normalizeContextLimit('12abc')).toBeUndefined();
    expect(normalizeContextLimit('1e5')).toBe(100000);
  });
});

describe('isValidContextLimit', () => {
  it('accepts an empty field and positive integers', () => {
    expect(isValidContextLimit(undefined)).toBe(true);
    expect(isValidContextLimit(null)).toBe(true);
    expect(isValidContextLimit('')).toBe(true);
    expect(isValidContextLimit('100000')).toBe(true);
  });

  it('flags anything that would be dropped on save', () => {
    expect(isValidContextLimit('abc')).toBe(false);
    expect(isValidContextLimit('12.5')).toBe(false);
    expect(isValidContextLimit('0')).toBe(false);
    expect(isValidContextLimit('-1')).toBe(false);
  });
});
