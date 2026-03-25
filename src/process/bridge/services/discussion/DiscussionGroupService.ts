/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDiscussionGroupCreateParams } from '@/common/adapter/ipcBridge';
import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type { IMessageText } from '@/common/chat/chatLib';
import type {
  DiscussionGroupParticipant,
  DiscussionGroupOrchestration,
  MessageGroupMeta,
  TChatConversation,
} from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { getChannelMessageService } from '@process/channels/agent/ChannelMessageService';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { getDatabase } from '@process/services/database';
import {
  buildDiscussionRoundPrompt,
  normalizeDiscussionOrchestration,
  type DiscussionRoundSummary,
} from './discussionHelpers';

type GroupConversation = Extract<TChatConversation, { type: 'group' }>;

class DiscussionGroupCancelledError extends Error {
  constructor(conversationId: string) {
    super(`Discussion group cancelled: ${conversationId}`);
    this.name = 'DiscussionGroupCancelledError';
  }
}

const isGroupConversation = (conversation: TChatConversation | undefined): conversation is GroupConversation => {
  return conversation?.type === 'group';
};

const buildProjectedMessageMeta = (
  participant: DiscussionGroupParticipant,
  childConversationId: string,
  orchestration: DiscussionGroupOrchestration,
  round: number
): MessageGroupMeta => {
  return {
    participantId: participant.id,
    participantName: participant.name,
    participantAvatar: participant.avatar,
    childConversationId,
    mode: orchestration.mode,
    round,
  };
};

export class DiscussionGroupService {
  private readonly activeChildConversationIdByGroup = new Map<string, string>();
  private readonly cancelledGroupIds = new Set<string>();

  constructor(
    private readonly conversationService: IConversationService,
    private readonly workerTaskManager: IWorkerTaskManager
  ) {}

  async createConversation(
    params: IDiscussionGroupCreateParams & {
      source?: TChatConversation['source'];
      channelChatId?: string;
    }
  ): Promise<GroupConversation> {
    const parentId = params.id || uuid();
    const orchestration = normalizeDiscussionOrchestration(params.extra.orchestration);
    const participants: DiscussionGroupParticipant[] = [];

    for (const participant of params.extra.participants) {
      const childConversation = await this.conversationService.createConversation({
        ...participant.conversation,
        name: participant.name,
        source: params.source,
        channelChatId: params.channelChatId,
        extra: {
          ...participant.conversation.extra,
          workspace: participant.conversation.extra.workspace || params.extra.workspace,
          customWorkspace: participant.conversation.extra.customWorkspace ?? params.extra.customWorkspace,
          groupMeta: {
            parentGroupId: parentId,
            participantId: participant.id,
            participantName: participant.name,
            participantAvatar: participant.avatar,
            hiddenFromHistory: true,
          },
        },
      });

      participants.push({
        id: participant.id,
        assistantId: participant.assistantId,
        name: participant.name,
        avatar: participant.avatar,
        description: participant.description,
        childConversationId: childConversation.id,
      });
    }

    const parentConversation = await this.conversationService.createConversation({
      type: 'group',
      id: parentId,
      name: params.name,
      model: params.model,
      source: params.source,
      channelChatId: params.channelChatId,
      extra: {
        workspace: params.extra.workspace,
        customWorkspace: params.extra.customWorkspace,
        participants,
        orchestration,
      },
    });

    return parentConversation as GroupConversation;
  }

  async deleteConversation(conversation: GroupConversation): Promise<void> {
    for (const participant of conversation.extra.participants) {
      this.workerTaskManager.kill(participant.childConversationId);
      await this.conversationService.deleteConversation(participant.childConversationId);
    }
    await this.conversationService.deleteConversation(conversation.id);
  }

  async stopConversation(conversationId: string): Promise<void> {
    this.cancelledGroupIds.add(conversationId);
    const activeChildConversationId = this.activeChildConversationIdByGroup.get(conversationId);
    if (!activeChildConversationId) {
      return;
    }

    await getChannelMessageService().stopStreaming(activeChildConversationId);
  }

  async sendMessage(options: { conversationId: string; input: string; msgId: string }): Promise<void> {
    const conversation = await this.conversationService.getConversation(options.conversationId);
    if (!isGroupConversation(conversation)) {
      throw new Error(`Group conversation not found: ${options.conversationId}`);
    }

    this.cancelledGroupIds.delete(conversation.id);
    const orchestration = normalizeDiscussionOrchestration(conversation.extra.orchestration);
    const roundSummariesByParticipant = new Map<string, DiscussionRoundSummary>();

    ipcBridge.conversation.responseStream.emit({
      type: 'start',
      data: null,
      msg_id: options.msgId,
      conversation_id: conversation.id,
    });

    await this.conversationService.updateConversation(conversation.id, { status: 'running' });
    this.emitTurnState(conversation, 'running', 'ai_generating', 'Discussion group is responding');

    try {
      for (let round = 1; round <= orchestration.rounds; round += 1) {
        this.throwIfCancelled(conversation.id);

        for (const participant of conversation.extra.participants) {
          this.throwIfCancelled(conversation.id);

          const peerSummaries =
            round <= 1
              ? []
              : conversation.extra.participants
                  .filter((item) => item.id !== participant.id)
                  .map((item) => roundSummariesByParticipant.get(item.id))
                  .filter((item): item is DiscussionRoundSummary => Boolean(item));

          const prompt = buildDiscussionRoundPrompt({
            mode: orchestration.mode,
            round,
            userInput: options.input,
            participantName: participant.name,
            peerSummaries,
          });

          const latestMessages = await this.collectParticipantRoundMessages(conversation, participant, prompt, round);
          this.throwIfCancelled(conversation.id);
          const summaryText = latestMessages
            .filter((message) => message.position === 'left')
            .map((message) => message.content.content.trim())
            .filter(Boolean)
            .join('\n\n');

          if (summaryText) {
            roundSummariesByParticipant.set(participant.id, {
              participantId: participant.id,
              participantName: participant.name,
              content: summaryText,
            });
          }
        }
      }

      await this.conversationService.updateConversation(conversation.id, { status: 'finished' });
      this.emitTurnState(conversation, 'finished', 'ai_waiting_input', 'Discussion group completed');
      ipcBridge.conversation.responseStream.emit({
        type: 'finish',
        data: null,
        msg_id: options.msgId,
        conversation_id: conversation.id,
      });
    } catch (error) {
      if (error instanceof DiscussionGroupCancelledError) {
        await this.conversationService.updateConversation(conversation.id, { status: 'finished' });
        this.emitTurnState(conversation, 'finished', 'ai_waiting_input', 'Discussion group stopped');
        ipcBridge.conversation.responseStream.emit({
          type: 'finish',
          data: null,
          msg_id: options.msgId,
          conversation_id: conversation.id,
        });
        return;
      }

      await this.conversationService.updateConversation(conversation.id, { status: 'finished' });
      const message = error instanceof Error ? error.message : String(error);
      await this.persistProjectedMessage(
        conversation,
        {
          id: uuid(),
          type: 'text',
          msg_id: `group-error:${options.msgId}`,
          conversation_id: conversation.id,
          position: 'left',
          content: {
            content: message,
            groupMeta: {
              participantId: 'group-error',
              participantName: 'Discussion Group',
              mode: orchestration.mode,
              round: 0,
            },
          },
          createdAt: Date.now(),
        },
        true
      );
      this.emitTurnState(conversation, 'finished', 'error', message);
      ipcBridge.conversation.responseStream.emit({
        type: 'finish',
        data: null,
        msg_id: options.msgId,
        conversation_id: conversation.id,
      });
      throw error;
    } finally {
      this.activeChildConversationIdByGroup.delete(conversation.id);
      this.cancelledGroupIds.delete(conversation.id);
    }
  }

  private async collectParticipantRoundMessages(
    groupConversation: GroupConversation,
    participant: DiscussionGroupParticipant,
    prompt: string,
    round: number
  ): Promise<IMessageText[]> {
    const messageService = getChannelMessageService();
    const latestTextByMessageId = new Map<string, IMessageText>();
    const orderedMessageIds: string[] = [];
    const fallbackTexts: string[] = [];
    const orchestration = normalizeDiscussionOrchestration(groupConversation.extra.orchestration);

    this.activeChildConversationIdByGroup.set(groupConversation.id, participant.childConversationId);

    await messageService.sendMessage(groupConversation.id, participant.childConversationId, prompt, (chunk) => {
      if (chunk.type === 'text' && chunk.position === 'left') {
        const messageId = chunk.msg_id || chunk.id;
        if (!latestTextByMessageId.has(messageId)) {
          orderedMessageIds.push(messageId);
        }
        latestTextByMessageId.set(messageId, {
          ...chunk,
          conversation_id: groupConversation.id,
          msg_id: `group:${participant.id}:round:${round}:${messageId}`,
          content: {
            ...chunk.content,
            groupMeta: buildProjectedMessageMeta(participant, participant.childConversationId, orchestration, round),
          },
        });
        return;
      }

      if (chunk.type === 'tips') {
        fallbackTexts.push(chunk.content.content);
      }
    });

    const projectedMessages = orderedMessageIds
      .map((messageId) => latestTextByMessageId.get(messageId))
      .filter((message): message is IMessageText => Boolean(message));

    if (projectedMessages.length === 0 && fallbackTexts.length > 0) {
      projectedMessages.push({
        id: uuid(),
        type: 'text',
        msg_id: `group:${participant.id}:round:${round}:fallback`,
        conversation_id: groupConversation.id,
        position: 'left',
        content: {
          content: fallbackTexts.join('\n\n'),
          groupMeta: buildProjectedMessageMeta(participant, participant.childConversationId, orchestration, round),
        },
        createdAt: Date.now(),
      });
    }

    for (const message of projectedMessages) {
      await this.persistProjectedMessage(groupConversation, message, false);
    }

    return projectedMessages;
  }

  private throwIfCancelled(conversationId: string): void {
    if (this.cancelledGroupIds.has(conversationId)) {
      throw new DiscussionGroupCancelledError(conversationId);
    }
  }

  private async persistProjectedMessage(
    conversation: GroupConversation,
    message: IMessageText,
    skipCompletionRefresh: boolean
  ): Promise<void> {
    const db = await getDatabase();
    db.insertMessage(message);
    if (!skipCompletionRefresh) {
      await this.conversationService.updateConversation(conversation.id, {
        status: 'running',
      });
    }

    ipcBridge.conversation.responseStream.emit({
      type: 'content',
      conversation_id: conversation.id,
      msg_id: message.msg_id || message.id,
      data: message.content,
    });
  }

  private emitTurnState(
    conversation: GroupConversation,
    status: IConversationTurnCompletedEvent['status'],
    state: IConversationTurnCompletedEvent['state'],
    detail: string
  ): void {
    const event: IConversationTurnCompletedEvent = {
      sessionId: conversation.id,
      status,
      state,
      detail,
      canSendMessage: state !== 'ai_generating',
      runtime: {
        hasTask: false,
        isProcessing: state === 'ai_generating',
        pendingConfirmations: 0,
        dbStatus: status,
      },
      workspace: conversation.extra.workspace || '',
      model: {
        platform: conversation.model.platform,
        name: conversation.model.name,
        useModel: conversation.model.useModel,
      },
      lastMessage: {
        content: detail,
        createdAt: Date.now(),
      },
    };

    ipcBridge.conversation.turnCompleted.emit(event);
  }
}
