/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConfirmation } from '@/common/chat/chatLib';
import type { CodexJsonRpcRequest } from './types';

type PermissionResolverDeps = {
  addConfirmation: (confirmation: IConfirmation<string>) => void;
};

type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

type CommandOrFileApprovalResponse = {
  decision: ApprovalDecision;
  reason?: string;
};

type PermissionsApprovalResponse = {
  permissions: Record<string, unknown>;
  scope: 'turn' | 'session';
  strictAutoReview?: boolean;
};

type ApprovalResponse = CommandOrFileApprovalResponse | PermissionsApprovalResponse;

type PendingApproval = {
  resolve: (result: ApprovalResponse) => void;
  responseForOption: (option: string) => ApprovalResponse;
};

const DECISION_MAP: Record<string, ApprovalDecision> = {
  allow_once: 'accept',
  allow_always: 'acceptForSession',
  reject_once: 'decline',
  reject_always: 'cancel',
};

const CONFIRMATION_OPTIONS: IConfirmation<string>['options'] = [
  { label: 'codex.permissions.allow_once', value: 'allow_once' },
  { label: 'codex.permissions.allow_always', value: 'allow_always' },
  { label: 'codex.permissions.reject_once', value: 'reject_once' },
  { label: 'codex.permissions.reject_always', value: 'reject_always' },
];

export class CodexPermissionResolver {
  private readonly pending = new Map<string, PendingApproval>();

  constructor(private readonly deps: PermissionResolverDeps) {}

  async handleRequest(request: CodexJsonRpcRequest): Promise<ApprovalResponse> {
    if (request.method === 'item/commandExecution/requestApproval') {
      return this.createCommandApproval(request);
    }

    if (request.method === 'item/fileChange/requestApproval' || request.method === 'item/permissions/requestApproval') {
      if (request.method === 'item/permissions/requestApproval') {
        return this.createPermissionsApproval(request);
      }
      return this.createFileApproval(request);
    }

    return {
      decision: 'decline',
      reason: `Unsupported Codex app-server request: ${request.method}`,
    };
  }

  resolve(callId: string, option: string): void {
    const pending = this.pending.get(callId);
    if (!pending) return;
    this.pending.delete(callId);
    pending.resolve(pending.responseForOption(option));
  }

  private createCommandApproval(request: CodexJsonRpcRequest): Promise<ApprovalResponse> {
    const callId = createCallId(request);
    const params = asRecord(request.params);
    const command = formatCommand(params?.command);
    const reason = readString(params?.reason);
    const cwd = readString(params?.cwd);
    const description = describeParts(
      [
        command ? `Command: ${command}` : undefined,
        cwd ? `Directory: ${cwd}` : undefined,
        reason ? `Reason: ${reason}` : undefined,
      ],
      'Codex requests command execution approval'
    );

    return this.createPendingApproval(
      callId,
      {
        title: 'codex.permissions.titles.command_execution',
        id: callId,
        action: 'exec',
        description,
        callId,
        options: CONFIRMATION_OPTIONS,
        commandType: command?.split(/\s+/)[0],
      },
      (option) => ({ decision: DECISION_MAP[option] || 'decline' })
    );
  }

  private createFileApproval(request: CodexJsonRpcRequest): Promise<ApprovalResponse> {
    const callId = createCallId(request);
    const params = asRecord(request.params);
    const target = readFirstString(params, ['path', 'filePath', 'permission', 'operation', 'itemId']);
    const reason = readString(params?.reason);
    const summary = readString(params?.summary) || readString(params?.description);
    const description = describeParts(
      [
        summary,
        target ? `Target: ${target}` : undefined,
        reason ? `Reason: ${reason}` : undefined,
        `Request: ${request.method}`,
      ],
      `Codex requests file or permission approval: ${request.method}`
    );

    return this.createPendingApproval(
      callId,
      {
        title: 'codex.permissions.titles.file_write',
        id: callId,
        action: 'edit',
        description,
        callId,
        options: CONFIRMATION_OPTIONS,
      },
      (option) => ({ decision: DECISION_MAP[option] || 'decline' })
    );
  }

  private createPermissionsApproval(request: CodexJsonRpcRequest): Promise<ApprovalResponse> {
    const callId = createCallId(request);
    const params = asRecord(request.params);
    const permissions = asRecord(params?.permissions) || {};
    const target = readFirstString(params, ['path', 'filePath', 'permission', 'operation', 'itemId']);
    const reason = readString(params?.reason);
    const summary = readString(params?.summary) || readString(params?.description);
    const description = describeParts(
      [
        summary,
        target ? `Target: ${target}` : undefined,
        reason ? `Reason: ${reason}` : undefined,
        `Request: ${request.method}`,
      ],
      `Codex requests permission approval: ${request.method}`
    );

    return this.createPendingApproval(
      callId,
      {
        title: 'codex.permissions.titles.apply_patch_approval_request',
        id: callId,
        action: 'edit',
        description,
        callId,
        options: CONFIRMATION_OPTIONS,
      },
      (option) => {
        if (option === 'allow_once' || option === 'allow_always') {
          return {
            permissions,
            scope: option === 'allow_always' ? 'session' : 'turn',
          };
        }
        return { permissions: {}, scope: 'turn' };
      }
    );
  }

  private createPendingApproval(
    callId: string,
    confirmation: IConfirmation<string>,
    responseForOption: (option: string) => ApprovalResponse
  ): Promise<ApprovalResponse> {
    return new Promise<ApprovalResponse>((resolve) => {
      this.pending.set(callId, { resolve, responseForOption });
      this.deps.addConfirmation(confirmation);
    });
  }
}

function createCallId(request: CodexJsonRpcRequest): string {
  return `codex_native_${request.id}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFirstString(params: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!params) return undefined;
  for (const key of keys) {
    const value = readString(params[key]);
    if (value) return value;
  }
  return undefined;
}

function formatCommand(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const command = value.filter((part): part is string => typeof part === 'string').join(' ');
    return command.length > 0 ? command : undefined;
  }
  return readString(value);
}

function describeParts(parts: Array<string | undefined>, fallback: string): string {
  const description = parts.filter((part): part is string => Boolean(part)).join('\n');
  return description || fallback;
}
