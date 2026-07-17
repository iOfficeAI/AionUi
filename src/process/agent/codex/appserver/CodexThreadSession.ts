/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { IConfirmation } from '@/common/chat/chatLib';
import type { CodexAppServerClient } from './CodexAppServerClient';
import { CodexEventTranslator } from './CodexEventTranslator';
import { readCodexContextUsageMetrics } from './tokenUsageMetrics';
import type {
  CodexJsonRpcNotification,
  CodexSandboxPolicy,
  CodexThreadSessionOptions,
  CodexThreadStartResponse,
  CodexTurnStartResponse,
} from './types';

type CodexThreadSessionDependencies = {
  client: Pick<CodexAppServerClient, 'request' | 'onNotification' | 'onFailure' | 'onServerRequest'>;
  options: CodexThreadSessionOptions;
  emitMessage: (message: IResponseMessage, persist: boolean) => void;
  emitConfirmation: (confirmation: IConfirmation<string>) => void;
  persistConversationExtra: (extra: Record<string, unknown>) => Promise<void>;
};

type PendingTurnCompletion = {
  turnId: string;
  resolve: () => void;
  reject: (error: Error) => void;
};

export class CodexThreadSession {
  private threadId: string | undefined;
  private turnId: string | undefined;
  private readonly translator: CodexEventTranslator;
  private unsubscribeNotifications: (() => void) | undefined;
  private unsubscribeFailures: (() => void) | undefined;
  private pendingTurnCompletion: PendingTurnCompletion | undefined;
  private turnInFlight = false;
  private disposed = false;
  private readonly completedTurnIds = new Set<string>();

  constructor(private readonly deps: CodexThreadSessionDependencies) {
    this.threadId = deps.options.threadId;
    this.translator = new CodexEventTranslator(deps.options.conversationId);
  }

  async start(): Promise<void> {
    if (this.threadId && this.unsubscribeNotifications && this.unsubscribeFailures) {
      return;
    }

    const unsubscribeNotifications = this.deps.client.onNotification(this.handleNotification);
    const unsubscribeFailures = this.deps.client.onFailure(this.handleFailure);

    try {
      if (this.threadId) {
        await this.deps.client.request('thread/resume', {
          threadId: this.threadId,
          cwd: this.deps.options.workspace,
          approvalPolicy: this.deps.options.approvalPolicy,
          sandbox: this.deps.options.sandboxPolicy,
          ...(this.deps.options.model ? { model: this.deps.options.model } : {}),
        });
        this.unsubscribeNotifications = unsubscribeNotifications;
        this.unsubscribeFailures = unsubscribeFailures;
        await this.deps.persistConversationExtra({ codexNative: true, codexThreadId: this.threadId });
        return;
      }

      const result = await this.deps.client.request<CodexThreadStartResponse>('thread/start', {
        cwd: this.deps.options.workspace,
        approvalPolicy: this.deps.options.approvalPolicy,
        sandbox: this.deps.options.sandboxPolicy,
        model: this.deps.options.model,
      });
      this.threadId = readThreadId(result);
      this.unsubscribeNotifications = unsubscribeNotifications;
      this.unsubscribeFailures = unsubscribeFailures;
      await this.deps.persistConversationExtra({ codexNative: true, codexThreadId: this.threadId });
    } catch (error) {
      unsubscribeNotifications();
      unsubscribeFailures();
      if (this.unsubscribeNotifications === unsubscribeNotifications) {
        this.unsubscribeNotifications = undefined;
      }
      if (this.unsubscribeFailures === unsubscribeFailures) {
        this.unsubscribeFailures = undefined;
      }
      throw error;
    }
  }

  async startTurn(input: { content: string; msgId: string; files?: string[] }): Promise<void> {
    if (!this.threadId) {
      throw new Error('Cannot start Codex turn before thread start');
    }
    if (this.turnInFlight) {
      throw new Error('Cannot start a new Codex turn while another turn is running');
    }
    this.turnInFlight = true;
    try {
      this.deps.emitMessage(
        {
          type: 'start',
          conversation_id: this.deps.options.conversationId,
          msg_id: input.msgId,
          data: {},
        },
        false
      );
      const result = await this.deps.client.request<CodexTurnStartResponse>('turn/start', {
        threadId: this.threadId,
        cwd: this.deps.options.workspace,
        input: [{ type: 'text', text: input.content }],
        approvalPolicy: this.deps.options.approvalPolicy,
        sandboxPolicy: toTurnSandboxPolicy(this.deps.options.sandboxPolicy),
        ...(this.deps.options.model ? { model: this.deps.options.model } : {}),
        ...(this.deps.options.reasoningEffort ? { effort: this.deps.options.reasoningEffort } : {}),
      });
      if (this.disposed) {
        throw new Error('Codex thread session disposed');
      }
      const turnId = readTurnId(result);
      this.turnId = turnId;
      await new Promise<void>((resolve, reject) => {
        this.pendingTurnCompletion = { turnId, resolve, reject };
        this.completePendingTurn();
      });
    } finally {
      this.turnInFlight = false;
    }
  }

  async interrupt(): Promise<void> {
    if (!this.threadId || !this.turnId) return;
    await this.deps.client.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
    this.completePendingTurn(this.turnId);
  }

  updateRuntimeConfig(
    config: Partial<Pick<CodexThreadSessionOptions, 'approvalPolicy' | 'sandboxPolicy' | 'model' | 'reasoningEffort'>>
  ): void {
    Object.assign(this.deps.options, config);
  }

  dispose(): void {
    this.disposed = true;
    this.detachClientListeners();
    this.completePendingTurn(undefined, true);
  }

  private readonly handleNotification = (notification: CodexJsonRpcNotification): void => {
    if (notification.method === 'thread/tokenUsage/updated') {
      const tokenUsage = readCodexContextUsageMetrics(notification.params);
      void this.deps.persistConversationExtra({
        lastTokenUsage: { totalTokens: tokenUsage.used },
        lastContextLimit: tokenUsage.size,
      });
    }

    for (const event of this.translator.translate(notification)) {
      if (event.kind === 'message') {
        this.deps.emitMessage(event.message, event.persist);
      } else if (event.kind === 'confirmation') {
        this.deps.emitConfirmation(event.confirmation);
      }
    }

    if (notification.method === 'turn/completed') {
      const turnId = readNotificationTurnId(notification.params);
      if (turnId) {
        this.completedTurnIds.add(turnId);
      }
      this.completePendingTurn(turnId);
    }
  };

  private readonly handleFailure = (error: Error): void => {
    this.rejectPendingTurn(error);
    this.detachClientListeners();
    this.turnId = undefined;
    this.completedTurnIds.clear();
  };

  private detachClientListeners(): void {
    this.unsubscribeNotifications?.();
    this.unsubscribeNotifications = undefined;
    this.unsubscribeFailures?.();
    this.unsubscribeFailures = undefined;
  }

  private completePendingTurn(turnId?: string, force = false): void {
    if (!this.pendingTurnCompletion) return;
    if (turnId && turnId !== this.pendingTurnCompletion.turnId) return;
    if (!force && !turnId && !this.completedTurnIds.has(this.pendingTurnCompletion.turnId)) return;
    const pendingTurnCompletion = this.pendingTurnCompletion;
    this.pendingTurnCompletion = undefined;
    this.completedTurnIds.delete(pendingTurnCompletion.turnId);
    pendingTurnCompletion.resolve();
  }

  private rejectPendingTurn(error: Error): void {
    if (!this.pendingTurnCompletion) return;
    const pendingTurnCompletion = this.pendingTurnCompletion;
    this.pendingTurnCompletion = undefined;
    this.completedTurnIds.delete(pendingTurnCompletion.turnId);
    pendingTurnCompletion.reject(error);
  }
}

function readThreadId(response: CodexThreadStartResponse): string {
  if ('thread' in response) return response.thread.id;
  return response.threadId;
}

function readTurnId(response: CodexTurnStartResponse): string {
  if ('turn' in response) return response.turn.id;
  return response.turnId;
}

function toTurnSandboxPolicy(sandboxMode: CodexThreadSessionOptions['sandboxPolicy']): CodexSandboxPolicy {
  if (sandboxMode === 'danger-full-access') {
    return { type: 'dangerFullAccess' };
  }

  if (sandboxMode === 'read-only') {
    return { type: 'readOnly', access: { type: 'fullAccess' }, networkAccess: false };
  }

  return {
    type: 'workspaceWrite',
    writableRoots: [],
    readOnlyAccess: { type: 'fullAccess' },
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function readNotificationTurnId(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const turn = (params as { turn?: { id?: unknown } }).turn;
  if (turn && typeof turn === 'object' && typeof turn.id === 'string') {
    return turn.id;
  }
  const turnId = (params as { turnId?: unknown }).turnId;
  return typeof turnId === 'string' ? turnId : undefined;
}
