/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { getWorkspacePathFromErrorDetails, normalizeWorkspacePathErrorCode } from '../../utils/conversationCreateError';
import { buildRawErrorSummary } from './errorDiagnostics';
import type { AgentStreamErrorInfo } from '@/common/chat/chatLib';

const AIONUI_TRANSPORT_ERROR_CODES = new Set([
  'MCP_HTTP_RESPONSE_READ_FAILED',
  'MCP_TOOL_REMOTE_ERROR',
  'MCP_TOOL_RESPONSE_UNEXPECTED',
  'MCP_TCP_READ_FAILED',
  'TEAM_SERVICE_UNAVAILABLE',
]);

const TEAM_ASSISTANT_ERROR_CODES = new Set([
  'TEAM_ASSISTANT_ID_REQUIRED',
  'TEAM_ASSISTANT_NOT_FOUND',
  'TEAM_ASSISTANT_FIELD_UNSUPPORTED',
]);

const isConversationBusyError = (error: unknown): boolean => {
  if (!isBackendHttpError(error)) return false;
  if (error.status !== 409 || error.code !== 'CONFLICT') return false;
  return error.backendMessage.toLowerCase().includes('already processing');
};

const isAgentDisconnectedError = (error: unknown): boolean => {
  if (!isBackendHttpError(error)) return false;
  const backendMessage = error.backendMessage.toLowerCase();
  return (
    backendMessage.includes('acp protocol is not connected') || backendMessage.includes('acp protocol not connected')
  );
};

export const buildSendFailureError = (error: unknown, message: string): AgentStreamErrorInfo => {
  const workspacePathErrorCode = normalizeWorkspacePathErrorCode(error);
  if (workspacePathErrorCode) {
    const workspacePath = getWorkspacePathFromErrorDetails(error);
    return {
      message,
      code: workspacePathErrorCode,
      ownership: 'aionui',
      detail: message,
      ...(workspacePath ? { workspacePath } : {}),
      retryable: false,
      feedback_recommended: false,
    };
  }

  if (isBackendHttpError(error) && AIONUI_TRANSPORT_ERROR_CODES.has(error.code)) {
    return {
      message,
      code: error.code,
      ownership: 'aionui',
      detail: message,
      retryable: true,
      feedback_recommended: true,
    };
  }

  if (isBackendHttpError(error) && TEAM_ASSISTANT_ERROR_CODES.has(error.code)) {
    return {
      message,
      code: error.code,
      ownership: 'aionui',
      detail: message,
      retryable: false,
      feedback_recommended: false,
    };
  }

  if (isAgentDisconnectedError(error)) {
    return {
      message,
      code: 'USER_AGENT_DISCONNECTED',
      ownership: 'user_agent',
      detail: message,
      retryable: true,
      feedback_recommended: false,
      resolution: { kind: 'reconnect_agent', target: 'agent_settings' },
    };
  }

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

  // Fallback: this is the "catch-all" bucket where the original error was
  // previously discarded, leaving telemetry unable to locate the failure.
  // Preserve a redacted summary of the original error so it reaches Sentry.
  const rawError = buildRawErrorSummary(error);
  return {
    message,
    code: 'AIONUI_INTERNAL_ERROR',
    ownership: 'aionui',
    detail: message,
    retryable: true,
    feedback_recommended: true,
    ...(rawError ? { rawError } : {}),
  };
};
