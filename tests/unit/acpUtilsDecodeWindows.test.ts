/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for decodeWindowsError in src/process/agent/acp/utils.ts
 *
 * Verifies that Windows command error messages (which may be in GBK encoding)
 * are properly decoded for readable log output.
 */

import { describe, it, expect } from 'vitest';
import { decodeWindowsError } from '@process/agent/acp/utils';

describe('decodeWindowsError', () => {
  it('returns stderr string when it is readable', () => {
    const error = { stderr: 'Access denied', code: 1 };
    expect(decodeWindowsError(error)).toBe('Access denied');
  });

  it('returns exit code when stderr contains replacement characters', () => {
    const error = { stderr: 'some \ufffd garbled \ufffd text', code: 5 };
    expect(decodeWindowsError(error)).toBe('exit code 5');
  });

  it('decodes GBK buffer to readable Chinese text', () => {
    // "成功" in GBK encoding
    const gbkBuffer = Buffer.from([0xb3, 0xc9, 0xb9, 0xa6]);
    const error = { stderr: gbkBuffer, code: 0 };
    expect(decodeWindowsError(error)).toBe('成功');
  });

  it('falls back to error message when no stderr', () => {
    const error = { message: 'spawn ENOENT' };
    expect(decodeWindowsError(error)).toBe('spawn ENOENT');
  });

  it('handles non-object errors', () => {
    expect(decodeWindowsError('string error')).toBe('string error');
    expect(decodeWindowsError(null)).toBe('null');
  });

  it('returns exit code unknown when stderr is garbled and no code', () => {
    const error = { stderr: '\ufffd\ufffd\ufffd' };
    expect(decodeWindowsError(error)).toBe('exit code unknown');
  });
});
