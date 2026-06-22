/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { buildSendFailureError } from '@/renderer/pages/conversation/platforms/acp/buildSendFailureError';

const httpError = (status: number, code: string, error: string, details?: unknown) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/conversations/abc/messages',
    status,
    body: { success: false, code, error, details },
  });

describe('buildSendFailureError', () => {
  it('classifies 409 already-processing as AIONUI_CONVERSATION_BUSY (wait, not retry)', () => {
    const err = httpError(409, 'CONFLICT', 'Conflict: Conversation is already processing a message');

    const result = buildSendFailureError(err, 'Conflict: Conversation is already processing a message');

    expect(result).toEqual({
      message: 'Conflict: Conversation is already processing a message',
      code: 'AIONUI_CONVERSATION_BUSY',
      ownership: 'aionui',
      detail: 'Conflict: Conversation is already processing a message',
      retryable: false,
      feedback_recommended: false,
      resolution: { kind: 'wait_for_current_response' },
    });
  });

  it('classifies 502 BAD_GATEWAY as UNKNOWN_UPSTREAM_ERROR (retryable)', () => {
    const err = httpError(502, 'BAD_GATEWAY', 'Bad gateway: upstream timeout');

    const result = buildSendFailureError(err, 'Bad gateway: upstream timeout');

    expect(result.code).toBe('UNKNOWN_UPSTREAM_ERROR');
    expect(result.ownership).toBe('unknown_upstream');
    expect(result.retryable).toBe(true);
  });

  it('classifies ACP protocol not connected as USER_AGENT_DISCONNECTED', () => {
    const err = httpError(502, 'BAD_GATEWAY', 'Bad gateway: ACP protocol is not connected.');

    const result = buildSendFailureError(err, 'Bad gateway: ACP protocol is not connected.');

    expect(result).toEqual({
      message: 'Bad gateway: ACP protocol is not connected.',
      code: 'USER_AGENT_DISCONNECTED',
      ownership: 'user_agent',
      detail: 'Bad gateway: ACP protocol is not connected.',
      retryable: true,
      feedback_recommended: false,
      resolution: { kind: 'reconnect_agent', target: 'agent_settings' },
    });
  });

  it('classifies ACP protocol not connected before generic BAD_GATEWAY', () => {
    const err = httpError(502, 'BAD_GATEWAY', 'ACP protocol not connected');

    const result = buildSendFailureError(err, 'ACP protocol not connected');

    expect(result.code).toBe('USER_AGENT_DISCONNECTED');
    expect(result.code).not.toBe('UNKNOWN_UPSTREAM_ERROR');
  });

  it('preserves workspace-path validation code as a structured non-retryable error', () => {
    const err = httpError(
      400,
      'WORKSPACE_PATH_RUNTIME_UNAVAILABLE',
      'Workspace path contains whitespace in one or more directory names and is no longer supported for send or warmup',
      { workspace_path: '/tmp/Archive ' }
    );

    const result = buildSendFailureError(
      err,
      'The existing workspace path "/tmp/Archive " is no longer supported for send or warmup.'
    );

    expect(result).toEqual({
      message: 'The existing workspace path "/tmp/Archive " is no longer supported for send or warmup.',
      code: 'WORKSPACE_PATH_RUNTIME_UNAVAILABLE',
      ownership: 'aionui',
      detail: 'The existing workspace path "/tmp/Archive " is no longer supported for send or warmup.',
      workspacePath: '/tmp/Archive ',
      retryable: false,
      feedback_recommended: false,
    });
  });

  it('falls back to AIONUI_INTERNAL_ERROR for non-conflict 409 (different message)', () => {
    const err = httpError(409, 'CONFLICT', 'Conflict: WebSocket not connected; nothing to cancel');

    const result = buildSendFailureError(err, 'Conflict: WebSocket not connected; nothing to cancel');

    expect(result.code).toBe('AIONUI_INTERNAL_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('falls back to AIONUI_INTERNAL_ERROR for non-HTTP errors', () => {
    const result = buildSendFailureError(new Error('boom'), 'boom');

    expect(result.code).toBe('AIONUI_INTERNAL_ERROR');
    expect(result.ownership).toBe('aionui');
    expect(result.retryable).toBe(true);
  });

  it('preserves a redacted summary of the original error in the fallback branch', () => {
    const original = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), { code: 'ECONNREFUSED' });

    const result = buildSendFailureError(original, 'Something went wrong, please try again.');

    expect(result.code).toBe('AIONUI_INTERNAL_ERROR');
    expect(result.rawError).toEqual({
      name: 'Error',
      message: 'connect ECONNREFUSED 127.0.0.1:8080',
      code: 'ECONNREFUSED',
      stack: expect.any(String),
    });
  });

  it('carries backend http diagnostics into the fallback rawError for unclassified HTTP errors', () => {
    const err = httpError(409, 'CONFLICT', 'Conflict: WebSocket not connected; nothing to cancel');

    const result = buildSendFailureError(err, 'Conflict: WebSocket not connected; nothing to cancel');

    expect(result.code).toBe('AIONUI_INTERNAL_ERROR');
    expect(result.rawError).toMatchObject({
      name: 'BackendHttpError',
      status: 409,
      code: 'CONFLICT',
      message: 'Conflict: WebSocket not connected; nothing to cancel',
    });
  });

  it('redacts secrets from the fallback rawError summary', () => {
    const original = new Error('auth failed for key sk-ant-api03-shouldNotLeak123456');

    const result = buildSendFailureError(original, 'failed');

    expect(result.rawError?.message).not.toContain('sk-ant-api03-shouldNotLeak123456');
    expect(result.rawError?.message).toContain('[REDACTED_KEY]');
  });

  it('does not attach rawError to classified (non-fallback) branches', () => {
    const err = httpError(502, 'BAD_GATEWAY', 'Bad gateway: upstream timeout');

    const result = buildSendFailureError(err, 'Bad gateway: upstream timeout');

    expect(result.code).toBe('UNKNOWN_UPSTREAM_ERROR');
    expect(result.rawError).toBeUndefined();
  });
});
