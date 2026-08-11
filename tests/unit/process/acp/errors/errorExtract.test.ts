// tests/unit/process/acp/errors/errorExtract.test.ts

import { describe, it, expect } from 'vitest';
import { extractAcpError, formatUnknownError } from '@process/acp/errors/errorExtract';

describe('extractAcpError', () => {
  it('extracts top-level ACP error with code and message', () => {
    const error = { code: -32603, message: 'Internal error', data: { foo: 'bar' } };
    const result = extractAcpError(error);
    expect(result).toEqual({ code: -32603, message: 'Internal error', data: { foo: 'bar' } });
  });

  it('extracts nested error from cause field', () => {
    const error = { cause: { code: -32001, message: 'Session not found' } };
    const result = extractAcpError(error);
    expect(result).toEqual({ code: -32001, message: 'Session not found' });
  });

  it('extracts nested error from error field', () => {
    const error = { error: { code: -32700, message: 'Parse error' } };
    const result = extractAcpError(error);
    expect(result).toEqual({ code: -32700, message: 'Parse error' });
  });

  it('extracts from acp field', () => {
    const error = { acp: { code: -32602, message: 'Invalid params' } };
    const result = extractAcpError(error);
    expect(result).toEqual({ code: -32602, message: 'Invalid params' });
  });

  it('returns null for non-ACP error', () => {
    expect(extractAcpError(new Error('generic'))).toBeNull();
    expect(extractAcpError('string error')).toBeNull();
    expect(extractAcpError(null)).toBeNull();
  });

  it('respects max depth (5 levels)', () => {
    let nested: Record<string, unknown> = { code: -32603, message: 'deep' };
    for (let i = 0; i < 6; i++) nested = { cause: nested };
    expect(extractAcpError(nested)).toBeNull();
  });
});

describe('formatUnknownError', () => {
  it('formats Error instance', () => {
    expect(formatUnknownError(new Error('test'))).toBe('test');
  });

  it('formats object with message', () => {
    expect(formatUnknownError({ message: 'hello' })).toBe('hello');
  });

  it('formats primitive', () => {
    expect(formatUnknownError('raw')).toBe('raw');
  });

  it('formats null/undefined', () => {
    expect(formatUnknownError(null)).toBe('Unknown error');
    expect(formatUnknownError(undefined)).toBe('Unknown error');
  });
});
