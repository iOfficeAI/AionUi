import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { getDatabase } from '@process/services/database';
import { mainWarn } from '@process/utils/mainLogger';
import type { AgentStatus } from './agentTypes';

export type TurnCompletionContext = {
  status?: AgentStatus;
  state?: IConversationTurnCompletedEvent['state'];
  detail?: string;
  canSendMessage?: boolean;
  workspace?: string;
  backend?: string;
  modelId?: string;
  modelLabel?: string;
  pendingConfirmations?: number;
};

export class ConversationTurnCompletionService {
  private static instance: ConversationTurnCompletionService;
  private readonly dedupeWindowMs = 1000;
  private readonly pendingEmits = new Map<string, NodeJS.Timeout>();

  static getInstance(): ConversationTurnCompletionService {
    if (!ConversationTurnCompletionService.instance) {
      ConversationTurnCompletionService.instance = new ConversationTurnCompletionService();
    }
    return ConversationTurnCompletionService.instance;
  }

  async notifyPotentialCompletion(conversationId: string, context: TurnCompletionContext = {}): Promise<void> {
    if (!conversationId || this.pendingEmits.has(conversationId)) {
      return;
    }

    const timeout = setTimeout(() => {
      this.pendingEmits.delete(conversationId);
    }, this.dedupeWindowMs);
    timeout.unref?.();
    this.pendingEmits.set(conversationId, timeout);

    let conversation: TChatConversation | undefined;
    try {
      const db = await getDatabase();
      if (typeof db.getConversation === 'function') {
        const result = db.getConversation(conversationId);
        if (result.success && result.data) {
          conversation = result.data as TChatConversation;
        }
      }
    } catch (error) {
      mainWarn('[ConversationTurnCompletionService]', 'Failed to load conversation metadata', error);
    }

    const extra = ((conversation?.extra as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const workspace = context.workspace ?? (typeof extra.workspace === 'string' ? extra.workspace : '');
    const persistedModelId =
      context.modelId ?? (typeof extra.currentModelId === 'string' ? extra.currentModelId : undefined);
    const status = context.status ?? (conversation?.status as AgentStatus) ?? 'finished';
    const isProcessing =
      typeof cronBusyGuard.isProcessing === 'function' ? cronBusyGuard.isProcessing(conversationId) : false;

    const event: IConversationTurnCompletedEvent = {
      sessionId: conversationId,
      status,
      state: context.state ?? 'ai_waiting_input',
      detail: context.detail ?? '',
      canSendMessage: context.canSendMessage ?? true,
      runtime: {
        hasTask: Boolean(extra.cronJobId),
        taskStatus: status,
        isProcessing,
        pendingConfirmations: context.pendingConfirmations ?? 0,
        dbStatus: conversation?.status,
      },
      workspace,
      model: {
        platform: context.backend ?? conversation?.type ?? 'acp',
        name:
          context.modelLabel ??
          (conversation as { model?: { name?: string } })?.model?.name ??
          context.backend ??
          'acp',
        useModel: persistedModelId ?? (conversation as { model?: { useModel?: string } })?.model?.useModel ?? '',
      },
      lastMessage: {
        id: undefined,
        type: undefined,
        content: undefined,
        status: undefined,
        createdAt: Date.now(),
      },
    };

    ipcBridge.conversation?.turnCompleted?.emit?.(event);
  }
}
