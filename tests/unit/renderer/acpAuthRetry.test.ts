/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { AgentStreamErrorInfo } from '@/common/chat/chatLib';
import {
  ACP_AUTH_FAILED_CODE,
  decideAuthRetry,
  isAcpAuthError,
} from '@/renderer/pages/conversation/platforms/acp/acpAuthRetry';

const authError: AgentStreamErrorInfo = {
  message: 'Internal error: Failed to authenticate. API Error: 401 Invalid authentication credentials',
  code: ACP_AUTH_FAILED_CODE,
  ownership: 'user_llm_provider',
  retryable: false,
};

const otherError: AgentStreamErrorInfo = {
  message: 'rate limited',
  code: 'USER_LLM_PROVIDER_RATE_LIMITED',
};

describe('isAcpAuthError', () => {
  it('is true only for the provider auth-failed code', () => {
    expect(isAcpAuthError(authError)).toBe(true);
  });

  it('is false for a different error code', () => {
    expect(isAcpAuthError(otherError)).toBe(false);
  });

  it('is false when the error is missing or has no code', () => {
    expect(isAcpAuthError(undefined)).toBe(false);
    expect(isAcpAuthError(null)).toBe(false);
    expect(isAcpAuthError({ message: 'boom' })).toBe(false);
  });
});

describe('decideAuthRetry', () => {
  it('retries an auth error when budget remains and a handler is registered', () => {
    expect(decideAuthRetry({ error: authError, retriesRemaining: 1, canRetry: true })).toBe('retry');
  });

  it('surfaces an auth error once the retry budget is exhausted', () => {
    expect(decideAuthRetry({ error: authError, retriesRemaining: 0, canRetry: true })).toBe('surface');
  });

  it('surfaces an auth error when no retry handler is registered', () => {
    expect(decideAuthRetry({ error: authError, retriesRemaining: 1, canRetry: false })).toBe('surface');
  });

  it('never treats a negative budget as retryable', () => {
    expect(decideAuthRetry({ error: authError, retriesRemaining: -1, canRetry: true })).toBe('surface');
  });

  it('ignores non-auth errors regardless of budget', () => {
    expect(decideAuthRetry({ error: otherError, retriesRemaining: 1, canRetry: true })).toBe('ignore');
    expect(decideAuthRetry({ error: undefined, retriesRemaining: 1, canRetry: true })).toBe('ignore');
  });
});
