/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

import { buildCrashMessage } from '../../../../../src/process/acp/session/AcpSession';

describe('buildCrashMessage', () => {
  it('returns message for process_exit with code', () => {
    const result = buildCrashMessage({ reason: 'process_exit', exitCode: 1, signal: null, stderr: '' });
    expect(result).toBe('process exited unexpectedly (code: 1, signal: none)');
  });

  it('returns message for process_exit with signal', () => {
    const result = buildCrashMessage({ reason: 'process_exit', exitCode: null, signal: 'SIGSEGV', stderr: '' });
    expect(result).toBe('process exited unexpectedly (code: unknown, signal: SIGSEGV)');
  });

  it('returns message for connection_close with no info', () => {
    const result = buildCrashMessage({ reason: 'connection_close', exitCode: null, signal: null, stderr: '' });
    expect(result).toBe('process exited unexpectedly (code: unknown, signal: none)');
  });

  it('returns message for pipe_close', () => {
    const result = buildCrashMessage({ reason: 'pipe_close', exitCode: null, signal: 'SIGILL', stderr: '' });
    expect(result).toBe('process exited unexpectedly (code: unknown, signal: SIGILL)');
  });

  it('returns null when info is undefined', () => {
    const result = buildCrashMessage(undefined);
    expect(result).toBeNull();
  });
});
