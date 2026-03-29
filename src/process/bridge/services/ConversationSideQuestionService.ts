/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationSideQuestionResult } from '@/common/adapter/ipcBridge';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import type { TChatConversation } from '@/common/config/storage';
import type { AcpBackend, AcpPermissionRequest, AcpSessionUpdate } from '@/common/types/acpTypes';
import { AcpConnection } from '@process/agent/acp/AcpConnection';
import type { IConversationService } from '@process/services/IConversationService';
import { ProcessConfig } from '@process/utils/initStorage';
import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';
const ACP_SIDE_QUESTION_TIMEOUT_MS = 30_000;
const ACP_SIDE_QUESTION_PROMPT_TIMEOUT_SECONDS = 30;

type ResolvedAcpContext = {
  acpSessionId: string;
  backend: AcpBackend;
  cliPath?: string;
  customEnv?: Record<string, string>;
  customArgs?: string[];
  workspace: string;
};

class AcpSideQuestionUnsupportedError extends Error {}
class AcpSideQuestionFailedError extends Error {}

export class ConversationSideQuestionService {
  constructor(private readonly conversationService: IConversationService) {}

  async ask(conversationId: string, question: string): Promise<ConversationSideQuestionResult> {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return { status: 'invalid', reason: 'emptyQuestion' };
    }

    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      return { status: 'unsupported' };
    }

    const backend = conversation.type === 'acp' ? conversation.extra.backend : undefined;
    if (!isSideQuestionSupported({ type: conversation.type, backend })) {
      return { status: 'unsupported' };
    }

    const resolvedAcpContext = await this.resolveAcpSideQuestionContext(conversation);
    if (resolvedAcpContext) {
      try {
        const result = await this.askWithAcpFork(conversationId, trimmedQuestion, resolvedAcpContext);
        if (result.toolsAttempted && !result.answer) {
          return { status: 'toolsRequired' };
        }
        if (!result.answer) {
          return { status: 'noAnswer' };
        }
        return {
          status: 'ok',
          answer: result.answer,
        };
      } catch (caughtError) {
        if (caughtError instanceof AcpSideQuestionUnsupportedError) {
          return { status: 'unsupported' };
        }
        throw caughtError;
      }
    }

    return { status: 'unsupported' };
  }

  private async askWithAcpFork(
    conversationId: string,
    question: string,
    context: ResolvedAcpContext
  ): Promise<{ answer: string; toolsAttempted: boolean }> {
    const connection = new AcpConnection();
    connection.setPromptTimeout(ACP_SIDE_QUESTION_PROMPT_TIMEOUT_SECONDS);

    const completion = this.createAcpCompletionPromise(connection, conversationId, context.backend);

    try {
      await this.runWithTimeout(
        (async () => {
          await connection.connect(
            context.backend,
            context.cliPath,
            context.workspace,
            context.customArgs,
            context.customEnv
          );

          try {
            await connection.newSession(context.workspace, {
              resumeSessionId: context.acpSessionId,
              forkSession: true,
              mcpServers: [],
            });
          } catch {
            throw new AcpSideQuestionUnsupportedError('ACP forked side questions are not supported for this backend.');
          }

          await Promise.all([completion.promise, connection.sendPrompt(this.buildAcpSideQuestionPrompt(question))]);
        })(),
        ACP_SIDE_QUESTION_TIMEOUT_MS
      );

      return { answer: completion.getAnswer(), toolsAttempted: completion.toolsAttempted() };
    } finally {
      completion.dispose();
      await connection.disconnect().catch((error: unknown) => {
        console.warn('[ConversationSideQuestionService] Failed to disconnect ACP /btw runner', {
          backend: context.backend,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private async resolveAcpSideQuestionContext(conversation: TChatConversation): Promise<ResolvedAcpContext | null> {
    if (conversation.type !== 'acp') {
      return null;
    }

    const extra = conversation.extra;
    if (!extra?.backend || !extra.acpSessionId || !extra.workspace) {
      return null;
    }

    if (extra.backend !== 'claude') {
      return null;
    }

    const acpConfig = await ProcessConfig.get('acp.config');
    const backendConfig = ACP_BACKENDS_ALL[extra.backend];
    const cliPath = extra.cliPath || acpConfig?.[extra.backend]?.cliPath || backendConfig?.cliCommand;
    if (!cliPath?.trim()) {
      return null;
    }

    return {
      acpSessionId: extra.acpSessionId,
      backend: extra.backend,
      cliPath: cliPath.trim(),
      customArgs: backendConfig?.acpArgs,
      workspace: extra.workspace,
    };
  }

  private buildAcpSideQuestionPrompt(question: string): string {
    return [
      'Answer this brief side question using the current session context.',
      'Do not use tools.',
      'Do not ask follow-up questions.',
      'Return one concise answer only.',
      '',
      `Side question: ${question}`,
    ].join('\n');
  }

  private createAcpCompletionPromise(
    connection: AcpConnection,
    conversationId: string,
    backend: AcpBackend
  ): {
    dispose: () => void;
    getAnswer: () => string;
    promise: Promise<void>;
    toolsAttempted: () => boolean;
  } {
    let settled = false;
    let answer = '';
    let toolsWereAttempted = false;

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const succeed = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((innerResolve, innerReject) => {
      resolve = innerResolve;
      reject = innerReject;
    });

    const previousSessionUpdate = connection.onSessionUpdate;
    const previousPermissionRequest = connection.onPermissionRequest;
    const previousEndTurn = connection.onEndTurn;
    const previousDisconnect = connection.onDisconnect;

    connection.onSessionUpdate = (data: AcpSessionUpdate) => {
      previousSessionUpdate(data);
      if (data.update.sessionUpdate === 'agent_message_chunk' && data.update.content.type === 'text') {
        answer += data.update.content.text || '';
        return;
      }
      if (data.update.sessionUpdate === 'tool_call' || data.update.sessionUpdate === 'tool_call_update') {
        console.warn('[ConversationSideQuestionService] ACP /btw cancelled due to tool activity', {
          backend,
          conversationId,
          update: data.update.sessionUpdate,
        });
        toolsWereAttempted = true;
        connection.cancelPrompt();
        succeed();
      }
    };

    connection.onPermissionRequest = async (data: AcpPermissionRequest) => {
      console.warn('[ConversationSideQuestionService] ACP /btw rejected permission request', {
        backend,
        conversationId,
        tool: data.toolCall.title,
      });
      toolsWereAttempted = true;
      connection.cancelPrompt();
      succeed();
      return {
        optionId: data.options.find((option) => option.kind.startsWith('reject'))?.optionId || 'reject_once',
      };
    };

    connection.onEndTurn = () => {
      previousEndTurn();
      succeed();
    };

    connection.onDisconnect = (error) => {
      previousDisconnect(error);
      fail(
        new AcpSideQuestionFailedError(
          `ACP /btw runner disconnected unexpectedly (${error.code ?? 'unknown'}:${error.signal ?? 'none'}).`
        )
      );
    };

    return {
      dispose: () => {
        connection.onSessionUpdate = previousSessionUpdate;
        connection.onPermissionRequest = previousPermissionRequest;
        connection.onEndTurn = previousEndTurn;
        connection.onDisconnect = previousDisconnect;
      },
      getAnswer: () => answer.trim(),
      promise,
      toolsAttempted: () => toolsWereAttempted,
    };
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new AcpSideQuestionFailedError('ACP /btw timed out.'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
