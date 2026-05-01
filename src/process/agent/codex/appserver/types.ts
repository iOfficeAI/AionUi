/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { IConfirmation } from '@/common/chat/chatLib';

export type CodexJsonRpcId = string | number;

export type CodexJsonRpcRequest<TParams = unknown> = {
  jsonrpc: '2.0';
  id: CodexJsonRpcId;
  method: string;
  params?: TParams;
};

export type CodexJsonRpcNotification<TParams = unknown> = {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
};

export type CodexJsonRpcSuccess<TResult = unknown> = {
  jsonrpc: '2.0';
  id: CodexJsonRpcId;
  result: TResult;
};

export type CodexJsonRpcFailure = {
  jsonrpc: '2.0';
  id: CodexJsonRpcId | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type CodexJsonRpcMessage =
  | CodexJsonRpcRequest
  | CodexJsonRpcNotification
  | CodexJsonRpcSuccess
  | CodexJsonRpcFailure;

export type CodexJsonRpcOutgoing =
  | CodexJsonRpcRequest
  | CodexJsonRpcNotification
  | CodexJsonRpcSuccess
  | CodexJsonRpcFailure;

export type CodexThreadStartResponse = { thread: { id: string } } | { threadId: string };

export type CodexTurnStartResponse = { turn: { id: string } } | { turnId: string };

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type CodexSandboxPolicy =
  | { type: 'dangerFullAccess' }
  | { type: 'readOnly'; access: { type: 'fullAccess' }; networkAccess: boolean }
  | {
      type: 'workspaceWrite';
      writableRoots: string[];
      readOnlyAccess: { type: 'fullAccess' };
      networkAccess: boolean;
      excludeTmpdirEnvVar: boolean;
      excludeSlashTmp: boolean;
    };

export type CodexAppServerTransportStreams = {
  stdout: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
};

export type CodexAppServerClientOptions = {
  command: string;
  args: string[];
  cwd: string;
  initializeParams?: Record<string, unknown>;
};

export type CodexThreadSessionOptions = {
  conversationId: string;
  workspace: string;
  threadId?: string;
  approvalPolicy: string;
  sandboxPolicy: CodexSandboxMode;
  model?: string;
  reasoningEffort?: string;
};

export type CodexRuntimeDiagnostics = {
  pid?: number;
  initialized: boolean;
  threadId?: string;
  turnId?: string;
  lastMethod?: string;
  lastWarning?: string;
  stderrTail: string[];
  pendingApprovalCount: number;
};

export type CodexTranslatedEvent =
  | { kind: 'message'; message: IResponseMessage; persist: boolean }
  | { kind: 'confirmation'; confirmation: IConfirmation<string> }
  | { kind: 'diagnostics'; diagnostics: Partial<CodexRuntimeDiagnostics> };

export type CodexServerRequestHandler = (request: CodexJsonRpcRequest) => Promise<unknown>;
