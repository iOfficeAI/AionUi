/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { buildRawErrorSummary, redactErrorText } from '@/renderer/pages/conversation/platforms/acp/errorDiagnostics';

describe('redactErrorText', () => {
  it('masks OpenAI/Anthropic-style api keys', () => {
    const out = redactErrorText('request failed with key sk-ant-api03-abcDEF123456789');
    expect(out).not.toContain('sk-ant-api03-abcDEF123456789');
    expect(out).toContain('[REDACTED_KEY]');
  });

  it('masks bearer tokens', () => {
    const out = redactErrorText('Authorization: Bearer aaa.bbb.ccc-DDD');
    expect(out).toBe('Authorization: Bearer [REDACTED]');
  });

  it('masks key=value secrets regardless of casing', () => {
    expect(redactErrorText('api_key=mysecret123')).toBe('api_key=[REDACTED]');
    expect(redactErrorText('"token": "abc123"')).toBe('"token": "[REDACTED]"');
    expect(redactErrorText('Password=hunter2')).toBe('Password=[REDACTED]');
  });

  it('masks the username segment of unix home paths', () => {
    expect(redactErrorText('cannot read /Users/alice/secret/file.txt')).toBe(
      'cannot read /Users/[user]/secret/file.txt'
    );
    expect(redactErrorText('/home/bob/.config')).toBe('/home/[user]/.config');
  });

  it('masks the username segment of windows home paths', () => {
    expect(redactErrorText('C:\\Users\\Carol\\AppData')).toBe('C:\\Users\\[user]\\AppData');
  });

  it('leaves benign text untouched', () => {
    expect(redactErrorText('Conflict: nothing to cancel')).toBe('Conflict: nothing to cancel');
  });
});

describe('buildRawErrorSummary', () => {
  it('summarizes a plain Error with name, redacted message and a stack string', () => {
    const error = new Error('boom from /Users/alice/x');
    const summary = buildRawErrorSummary(error);

    expect(summary?.name).toBe('Error');
    expect(summary?.message).toBe('boom from /Users/[user]/x');
    expect(typeof summary?.stack).toBe('string');
    expect(summary?.code).toBeUndefined();
  });

  it('captures a string error code when present (e.g. node errno codes)', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const summary = buildRawErrorSummary(error);

    expect(summary?.code).toBe('ECONNREFUSED');
  });

  it('prefers backend http status/code/message for BackendHttpError', () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/abc/messages',
      status: 500,
      body: { success: false, code: 'INTERNAL', error: 'boom downstream' },
    });
    const summary = buildRawErrorSummary(error);

    expect(summary?.name).toBe('BackendHttpError');
    expect(summary?.status).toBe(500);
    expect(summary?.code).toBe('INTERNAL');
    expect(summary?.message).toBe('boom downstream');
  });

  it('truncates very long stacks to a bounded summary', () => {
    const error = new Error('big');
    error.stack = [
      'Error: big',
      ...Array.from({ length: 50 }, (_, i) => `    at frame${i} (/Users/alice/app.js:${i}:1)`),
    ].join('\n');
    const summary = buildRawErrorSummary(error);

    expect(summary?.stack).toBeDefined();
    expect(summary!.stack!.length).toBeLessThanOrEqual(1000);
    expect(summary!.stack).not.toContain('/Users/alice/');
  });

  it('falls back to String() for non-error values', () => {
    expect(buildRawErrorSummary('plain string failure')?.message).toBe('plain string failure');
    expect(buildRawErrorSummary(undefined)).toBeUndefined();
    expect(buildRawErrorSummary(null)).toBeUndefined();
  });
});
