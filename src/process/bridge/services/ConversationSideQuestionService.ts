/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationSideQuestionResult } from '@/common/adapter/ipcBridge';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import type { TChatConversation } from '@/common/config/storage';
import type { AcpBackend } from '@/common/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';
import type { AcpClient } from '@process/acp/infra/IAcpClient';
import { LegacyConnectorFactory } from '@process/acp/compat/LegacyConnectorFactory';
import type { IConversationService } from '@process/services/IConversationService';
import { ProcessConfig } from '@process/utils/initStorage';

const ACP_SIDE_QUESTION_TIMEOUT_MS = 30_000;

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
    let answer = '';
    let toolsWereAttempted = false;
    let forkedSessionId = '';

    // Reference to client, captured by handlers below and set after creation.
    let clientRef: AcpClient | null = null;

    const factory = new LegacyConnectorFactory();
    const client = factory.create(
      {
        agentBackend: context.backend,
        agentSource: 'builtin',
        agentId: `btw-${conversationId}`,
        cwd: context.workspace,
        command: context.cliPath,
        args: context.customArgs,
        env: context.customEnv,
      },
      {
        onSessionUpdate: (notification) => {
          const update = notification.update;
          if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
            answer += update.content.text || '';
            return;
          }
          if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
            console.warn('[ConversationSideQuestionService] ACP /btw cancelled due to tool activity', {
              backend: context.backend,
              conversationId,
              update: update.sessionUpdate,
            });
            toolsWereAttempted = true;
            if (forkedSessionId && clientRef) {
              void clientRef.cancel(forkedSessionId).catch(() => {});
            }
          }
        },
        onRequestPermission: async (request) => {
          console.warn('[ConversationSideQuestionService] ACP /btw rejected permission request', {
            backend: context.backend,
            conversationId,
            tool: request.toolCall.title,
          });
          toolsWereAttempted = true;
          if (forkedSessionId && clientRef) {
            void clientRef.cancel(forkedSessionId).catch(() => {});
          }
          const rejectOption = request.options.find((o) => o.kind.startsWith('reject'));
          return {
            outcome: {
              outcome: 'selected' as const,
              optionId: rejectOption?.optionId || 'reject_once',
            },
          };
        },
        onReadTextFile: () => Promise.resolve({ content: '' }),
        onWriteTextFile: () => Promise.resolve({}),
      }
    );
    clientRef = client;

    client.onDisconnect((info) => {
      console.warn('[ConversationSideQuestionService] ACP /btw runner disconnected unexpectedly', {
        backend: context.backend,
        conversationId,
        reason: info.reason,
        exitCode: info.exitCode,
      });
    });

    try {
      await this.runWithTimeout(
        (async () => {
          await client.start();

          let forkResult;
          try {
            forkResult = await client.forkSession({
              sessionId: context.acpSessionId,
              cwd: context.workspace,
              mcpServers: [],
            });
          } catch {
            throw new AcpSideQuestionUnsupportedError('ACP forked side questions are not supported for this backend.');
          }
          forkedSessionId = forkResult.sessionId;

          await client.prompt(forkedSessionId, [{ type: 'text', text: this.buildAcpSideQuestionPrompt(question) }]);
        })(),
        ACP_SIDE_QUESTION_TIMEOUT_MS
      );

      return { answer: answer.trim(), toolsAttempted: toolsWereAttempted };
    } finally {
      await client.close().catch((error: unknown) => {
        console.warn('[ConversationSideQuestionService] Failed to close ACP /btw runner', {
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
