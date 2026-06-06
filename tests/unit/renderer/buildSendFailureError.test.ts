/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { buildSendFailureError } from '@/renderer/pages/conversation/platforms/acp/buildSendFailureError';

const httpError = (status: number, code: string, error: string) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/conversations/abc/messages',
    status,
    body: { success: false, code, error },
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
});
