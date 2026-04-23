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
  model_id?: string;
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

  async notifyPotentialCompletion(conversation_id: string, context: TurnCompletionContext = {}): Promise<void> {
    if (!conversation_id || this.pendingEmits.has(conversation_id)) {
      return;
    }

    const timeout = setTimeout(() => {
      this.pendingEmits.delete(conversation_id);
    }, this.dedupeWindowMs);
    timeout.unref?.();
    this.pendingEmits.set(conversation_id, timeout);

    let conversation: TChatConversation | undefined;
    try {
      const db = await getDatabase();
      if (typeof db.getConversation === 'function') {
        const result = db.getConversation(conversation_id);
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
      context.model_id ?? (typeof extra.current_model_id === 'string' ? extra.current_model_id : undefined);
    const status = context.status ?? (conversation?.status as AgentStatus) ?? 'finished';
    const isProcessing =
      typeof cronBusyGuard.isProcessing === 'function' ? cronBusyGuard.isProcessing(conversation_id) : false;

    const event: IConversationTurnCompletedEvent = {
      session_id: conversation_id,
      status,
      state: context.state ?? 'ai_waiting_input',
      detail: context.detail ?? '',
      canSendMessage: context.canSendMessage ?? true,
      runtime: {
        hasTask: Boolean(extra.cron_job_id),
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
      last_message: {
        id: undefined,
        type: undefined,
        content: undefined,
        status: undefined,
        created_at: Date.now(),
      },
    };

    ipcBridge.conversation?.turnCompleted?.emit?.(event);
  }
}
