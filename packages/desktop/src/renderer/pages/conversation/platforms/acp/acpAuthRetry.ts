/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentStreamErrorInfo } from '@/common/chat/chatLib';

/**
 * Terminal error code emitted by the aioncore backend when the local LLM
 * provider (e.g. the claude CLI) rejects the request with a 401. For a Claude
 * subscription this is almost always an expired OAuth access token, which a
 * fresh session warmup (re-spawning the claude process) transparently refreshes.
 */
export const ACP_AUTH_FAILED_CODE = 'USER_LLM_PROVIDER_AUTH_FAILED';

/** Maximum automatic retries per user turn after an auth failure. */
export const MAX_ACP_AUTH_RETRIES = 1;

/** Whether a stream error is a provider auth failure we can recover from. */
export function isAcpAuthError(error: AgentStreamErrorInfo | undefined | null): boolean {
  return error?.code === ACP_AUTH_FAILED_CODE;
}

export type AuthRetryDecision =
  /** Re-warm (refresh token) and resend the turn. */
  | 'retry'
  /** Auth failure, but no budget/handler left — render the hard error. */
  | 'surface'
  /** Not an auth failure — leave normal error handling untouched. */
  | 'ignore';

/**
 * Decide how the response-stream handler should react to a terminal error.
 *
 * @param error            normalized stream error
 * @param retriesRemaining auto-retries still allowed for the current turn
 * @param canRetry         a resend handler is registered
 */
export function decideAuthRetry(params: {
  error: AgentStreamErrorInfo | undefined | null;
  retriesRemaining: number;
  canRetry: boolean;
}): AuthRetryDecision {
  if (!isAcpAuthError(params.error)) return 'ignore';
  if (params.retriesRemaining > 0 && params.canRetry) return 'retry';
  return 'surface';
}
