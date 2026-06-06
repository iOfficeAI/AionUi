/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { AgentStreamErrorInfo } from '@/common/chat/chatLib';

const isConversationBusyError = (error: unknown): boolean => {
  if (!isBackendHttpError(error)) return false;
  if (error.status !== 409 || error.code !== 'CONFLICT') return false;
  return error.backendMessage.toLowerCase().includes('already processing');
};

export const buildSendFailureError = (error: unknown, message: string): AgentStreamErrorInfo => {
  if (isBackendHttpError(error) && error.code === 'BAD_GATEWAY') {
    return {
      message,
      code: 'UNKNOWN_UPSTREAM_ERROR',
      ownership: 'unknown_upstream',
      detail: message,
      retryable: true,
      feedback_recommended: true,
    };
  }

  if (isConversationBusyError(error)) {
    return {
      message,
      code: 'AIONUI_CONVERSATION_BUSY',
      ownership: 'aionui',
      detail: message,
      retryable: false,
      feedback_recommended: false,
      resolution: { kind: 'wait_for_current_response' },
    };
  }

  return {
    message,
    code: 'AIONUI_INTERNAL_ERROR',
    ownership: 'aionui',
    detail: message,
    retryable: true,
    feedback_recommended: true,
  };
};
