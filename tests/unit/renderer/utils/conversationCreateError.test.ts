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
    'conversation.createError.pathVariants.WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED':
      'Selected workspace path "{{workspacePath}}" cannot contain whitespace in any directory name.',
    'conversation.agentError.codes.WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED.body':
      'AionUi no longer supports sending messages in conversations or tasks that use workspace paths with spaces or other whitespace characters. Create a new conversation or task with a workspace path that contains no whitespace.',
    'conversation.agentError.codes.WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED.bodyWithPath':
      'The existing workspace path "{{workspacePath}}" contains spaces or other whitespace characters. AionUi no longer supports sending messages in conversations or tasks that use this path. Create a new conversation or task with a workspace path that contains no whitespace.',
  };

  if (
    key === 'conversation.createError.pathVariants.WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED' ||
    key === 'conversation.agentError.codes.WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED.bodyWithPath'
  ) {
    return translations[key].replace('{{workspacePath}}', options?.workspacePath ?? '');
  }

  return translations[key] ?? options?.defaultValue ?? key;
};

describe('conversationCreateError', () => {
  it('prefers the dedicated backend error code', () => {
    const error = httpError(
      'WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED',
      'Bad request: Workspace path contains whitespace',
      { workspace_path: '/tmp/Archive ' }
    );

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED');
    expect(getConversationCreateErrorMessage(error, t)).toBe(
      'Selected workspace path "/tmp/Archive " cannot contain whitespace in any directory name.'
    );
  });

  it('aliases the older trailing-whitespace backend code to the new frontend code', () => {
    const error = httpError(
      'WORKSPACE_TRAILING_WHITESPACE_UNSUPPORTED',
      'Bad request: Workspace directory names ending in whitespace are not supported'
    );

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED');
  });

  it('falls back to legacy backend text matching for older builds', () => {
    const error = httpError(
      'BAD_REQUEST',
      'Bad request: Workspace directory names ending in whitespace are not supported: /tmp/My Dir '
    );

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED');
  });

  it('falls back to the raw backend message for unrelated errors', () => {
    const error = httpError('BAD_REQUEST', 'Bad request: Something else failed');

    expect(normalizeConversationCreateErrorCode(error)).toBeUndefined();
    expect(getConversationCreateErrorMessage(error, t)).toBe('Bad request: Something else failed');
  });

  it('falls back to the raw backend message when create error details are missing workspace_path', () => {
    const error = httpError(
      'WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED',
      'Bad request: Workspace path contains whitespace'
    );

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED');
    expect(getConversationCreateErrorMessage(error, t)).toBe('Bad request: Workspace path contains whitespace');
  });

  it('does not treat runtime workspace code as a create error', () => {
    const error = httpError(
      'WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED',
      'Bad request: Workspace path is no longer supported for send or warmup',
      { workspace_path: '/tmp/Archive ' }
    );

    expect(normalizeConversationCreateErrorCode(error)).toBeUndefined();
    expect(normalizeConversationRuntimeWorkspaceErrorCode(error)).toBe(
      'WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED'
    );
    expect(getConversationRuntimeWorkspaceErrorMessage(error, t)).toBe(
      'The existing workspace path "/tmp/Archive " contains spaces or other whitespace characters. AionUi no longer supports sending messages in conversations or tasks that use this path. Create a new conversation or task with a workspace path that contains no whitespace.'
    );
  });

  it('extracts backend payloads from stringified BackendHttpError messages', () => {
    const error =
      'Backend POST /api/teams failed (400): {"success":false,"error":"Workspace path contains whitespace in one or more directory names: /Users/zhoukai/Documents/Archive . Rename the affected directory or choose a path without whitespace in any directory name.","code":"WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED","details":{"workspace_path":"/Users/zhoukai/Documents/Archive ","offending_segments":["Archive "]}}';

    expect(normalizeConversationCreateErrorCode(error)).toBe('WORKSPACE_PATH_CONTAINS_WHITESPACE_UNSUPPORTED');
    expect(getConversationCreateErrorMessage(error, t)).toBe(
      'Selected workspace path "/Users/zhoukai/Documents/Archive " cannot contain whitespace in any directory name.'
    );
  });
});
