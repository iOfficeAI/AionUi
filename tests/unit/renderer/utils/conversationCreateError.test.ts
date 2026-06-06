/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  getConversationCreateErrorMessage,
  getConversationRuntimeWorkspaceErrorMessage,
  normalizeConversationCreateErrorCode,
  normalizeConversationRuntimeWorkspaceErrorCode,
} from '@/renderer/pages/conversation/utils/conversationCreateError';

const httpError = (code: string, error: string, details?: unknown) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/conversations',
    status: 400,
    body: { success: false, code, error, details },
  });

const t = (key: string, options?: { defaultValue?: string; workspacePath?: string }) => {
  const translations: Record<string, string> = {
    'conversation.createFailed': 'Failed to create conversation',
    'common.unknownError': 'Unknown error',
    'conversation.createError.pathVariants.WORKSPACE_PATH_UNAVAILABLE':
      'The selected workspace path is unavailable. Make sure the workspace path "{{workspacePath}}" exists and is accessible.',
    'conversation.agentError.codes.WORKSPACE_PATH_RUNTIME_UNAVAILABLE.body':
      'Make sure the current workspace path exists.',
    'conversation.agentError.codes.WORKSPACE_PATH_RUNTIME_UNAVAILABLE.bodyWithPath':
      'The current Agent failed to run in the workspace path "{{workspacePath}}". Make sure the workspace path exists.',
  };

  if (
    key === 'conversation.createError.pathVariants.WORKSPACE_PATH_UNAVAILABLE' ||
    key === 'conversation.agentError.codes.WORKSPACE_PATH_RUNTIME_UNAVAILABLE.bodyWithPath'
  ) {
    return translations[key].replace('{{workspacePath}}', options?.workspacePath ?? '');
  }

  return translations[key] ?? options?.defaultValue ?? key;
};

describe('conversationCreateError', () => {
  it('prefers the dedicated backend error code', () => {
    const error = httpError('WORKSPACE_PATH_UNAVAILABLE', 'Bad request: Workspace path contains whitespace', {
      workspace_path: '/tmp/Archive ',
    });

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_UNAVAILABLE');
    expect(getConversationCreateErrorMessage(error, t)).toBe(
      'The selected workspace path is unavailable. Make sure the workspace path "/tmp/Archive " exists and is accessible.'
    );
  });

  it('aliases the older trailing-whitespace backend code to the new frontend code', () => {
    const error = httpError(
      'WORKSPACE_TRAILING_WHITESPACE_UNSUPPORTED',
      'Bad request: Workspace directory names ending in whitespace are not supported'
    );

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_UNAVAILABLE');
  });

  it('falls back to legacy backend text matching for older builds', () => {
    const error = httpError(
      'BAD_REQUEST',
      'Bad request: Workspace directory names ending in whitespace are not supported: /tmp/My Dir '
    );

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_UNAVAILABLE');
  });

  it('falls back to the raw backend message for unrelated errors', () => {
    const error = httpError('BAD_REQUEST', 'Bad request: Something else failed');

    expect(normalizeConversationCreateErrorCode(error)).toBeUndefined();
    expect(getConversationCreateErrorMessage(error, t)).toBe('Bad request: Something else failed');
  });

  it('falls back to the raw backend message when create error details are missing workspace_path', () => {
    const error = httpError('WORKSPACE_PATH_UNAVAILABLE', 'Bad request: Workspace path contains whitespace');

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_UNAVAILABLE');
    expect(getConversationCreateErrorMessage(error, t)).toBe('Bad request: Workspace path contains whitespace');
  });

  it('does not treat runtime workspace code as a create error', () => {
    const error = httpError(
      'WORKSPACE_PATH_RUNTIME_UNAVAILABLE',
      'Bad request: Workspace path is no longer supported for send or warmup',
      { workspace_path: '/tmp/Archive ', msg_id: 'deadbeef' }
    );

    expect(normalizeConversationCreateErrorCode(error)).toBeUndefined();
    expect(normalizeConversationRuntimeWorkspaceErrorCode(error)).toBe('WORKSPACE_PATH_RUNTIME_UNAVAILABLE');
    expect(getConversationRuntimeWorkspaceErrorMessage(error, t)).toBe(
      'The current Agent failed to run in the workspace path "/tmp/Archive ". Make sure the workspace path exists.'
    );
  });

  it('extracts backend payloads from stringified BackendHttpError messages', () => {
    const error =
      'Backend POST /api/teams failed (400): {"success":false,"error":"Workspace path is unavailable: /Users/zhoukai/Documents/Archive . Make sure the selected workspace path exists and is accessible.","code":"WORKSPACE_PATH_UNAVAILABLE","details":{"workspace_path":"/Users/zhoukai/Documents/Archive ","operation":"create"}}';

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_UNAVAILABLE');
    expect(getConversationCreateErrorMessage(error, t)).toBe(
      'The selected workspace path is unavailable. Make sure the workspace path "/Users/zhoukai/Documents/Archive " exists and is accessible.'
    );
  });
});
