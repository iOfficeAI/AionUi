/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/utils/describeUncaughtError — covers the attribution fields the
 * global uncaughtException / unhandledRejection handlers log so that Node-internal stacks
 * (e.g. TCP.onStreamRead / ECONNRESET) stay triageable (AIONUI-128).
 */

import { describe, expect, it } from 'vitest';
import { describeUncaughtError } from '@/process/utils/describeUncaughtError';

/** Shape Node produces for a socket reset: an Error carrying code/syscall/errno. */
function makeSystemError(): NodeJS.ErrnoException {
  const error = new Error('read ECONNRESET') as NodeJS.ErrnoException;
  error.code = 'ECONNRESET';
  error.syscall = 'read';
  error.errno = -54;
  return error;
}

describe('describeUncaughtError', () => {
  it('extracts code/syscall/errno from a Node system error', () => {
    const diagnostics = describeUncaughtError(makeSystemError(), 'uncaughtException');

    expect(diagnostics.origin).toBe('uncaughtException');
    expect(diagnostics.valueType).toBe('Error');
    expect(diagnostics.name).toBe('Error');
    expect(diagnostics.message).toBe('read ECONNRESET');
    expect(diagnostics.code).toBe('ECONNRESET');
    expect(diagnostics.syscall).toBe('read');
    expect(diagnostics.errno).toBe(-54);
    expect(diagnostics.stack).toContain('read ECONNRESET');
  });

  it('records the origin passed by the caller', () => {
    expect(describeUncaughtError(makeSystemError(), 'unhandledRejection').origin).toBe('unhandledRejection');
  });

  it('omits code/syscall/errno for a plain Error', () => {
    const error = new TypeError('boom');

    const diagnostics = describeUncaughtError(error, 'uncaughtException');

    expect(diagnostics.name).toBe('TypeError');
    expect(diagnostics.message).toBe('boom');
    expect(diagnostics).not.toHaveProperty('code');
    expect(diagnostics).not.toHaveProperty('syscall');
    expect(diagnostics).not.toHaveProperty('errno');
  });

  it('uses a thrown string as the message', () => {
    const diagnostics = describeUncaughtError('something went wrong', 'unhandledRejection');

    expect(diagnostics.valueType).toBe('string');
    expect(diagnostics.name).toBe('UnknownError');
    expect(diagnostics.message).toBe('something went wrong');
    expect(diagnostics.stack).toBeUndefined();
  });

  it('reads allow-listed fields from a non-Error rejection object', () => {
    const reason = { name: 'SocketFailure', message: 'connection dropped', code: 'ECONNRESET', syscall: 'read' };

    const diagnostics = describeUncaughtError(reason, 'unhandledRejection');

    expect(diagnostics.valueType).toBe('object');
    expect(diagnostics.name).toBe('SocketFailure');
    expect(diagnostics.message).toBe('connection dropped');
    expect(diagnostics.code).toBe('ECONNRESET');
    expect(diagnostics.syscall).toBe('read');
  });

  it('never copies non-allow-listed properties out of a rejection object', () => {
    const reason = {
      message: 'request failed',
      code: 'EAUTH',
      token: 'super-secret-token',
      body: { password: 'hunter2' },
    };

    const diagnostics = describeUncaughtError(reason, 'unhandledRejection');

    expect(Object.keys(diagnostics).toSorted()).toEqual(['code', 'message', 'name', 'origin', 'valueType']);
    expect(JSON.stringify(diagnostics)).not.toContain('super-secret-token');
    expect(JSON.stringify(diagnostics)).not.toContain('hunter2');
  });

  it('does not reveal the payload of an object without a message', () => {
    const diagnostics = describeUncaughtError({ token: 'super-secret-token' }, 'unhandledRejection');

    expect(diagnostics.message).toBe('[object Object]');
    expect(JSON.stringify(diagnostics)).not.toContain('super-secret-token');
  });

  it('handles null and undefined rejections', () => {
    const nullDiagnostics = describeUncaughtError(null, 'unhandledRejection');
    expect(nullDiagnostics.valueType).toBe('null');
    expect(nullDiagnostics.name).toBe('UnknownError');
    expect(nullDiagnostics.message).toBe('null');

    const undefinedDiagnostics = describeUncaughtError(undefined, 'unhandledRejection');
    expect(undefinedDiagnostics.valueType).toBe('undefined');
    expect(undefinedDiagnostics.message).toBe('undefined');
  });

  it('renders thrown primitives without throwing', () => {
    expect(describeUncaughtError(42, 'uncaughtException').message).toBe('42');
    expect(describeUncaughtError(false, 'uncaughtException').message).toBe('false');
    expect(describeUncaughtError(Symbol('sym'), 'uncaughtException').message).toBe('Symbol(sym)');
  });

  it('truncates an oversized message and stack', () => {
    const error = new Error('x'.repeat(5000));
    error.stack = 'y'.repeat(9000);

    const diagnostics = describeUncaughtError(error, 'uncaughtException');

    expect(diagnostics.message).toHaveLength(1000 + '... (truncated)'.length);
    expect(diagnostics.message.endsWith('... (truncated)')).toBe(true);
    expect(diagnostics.stack).toHaveLength(4000 + '... (truncated)'.length);
  });

  it('survives values whose getters throw', () => {
    const hostile = {
      get message(): string {
        throw new Error('getter exploded');
      },
      get code(): string {
        throw new Error('getter exploded');
      },
      get stack(): string {
        throw new Error('getter exploded');
      },
    };

    const diagnostics = describeUncaughtError(hostile, 'uncaughtException');

    expect(diagnostics.name).toBe('UnknownError');
    expect(diagnostics.message).toBe('[object Object]');
    expect(diagnostics.code).toBeUndefined();
    expect(diagnostics.stack).toBeUndefined();
  });

  it('survives a null-prototype object with no toString', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.code = 'ENOSPC';

    const diagnostics = describeUncaughtError(bare, 'uncaughtException');

    expect(diagnostics.code).toBe('ENOSPC');
    expect(diagnostics.message).toBe('[object Object]');
  });

  it('never throws for any input shape', () => {
    const inputs: unknown[] = [
      makeSystemError(),
      new Error('plain'),
      'string reason',
      42,
      0,
      '',
      true,
      null,
      undefined,
      {},
      [],
      Object.create(null),
      Symbol('s'),
      10n,
      () => undefined,
      new Proxy(
        {},
        {
          get() {
            throw new Error('proxy trap exploded');
          },
        }
      ),
    ];

    for (const input of inputs) {
      expect(() => describeUncaughtError(input, 'uncaughtException')).not.toThrow();
    }
  });
});
