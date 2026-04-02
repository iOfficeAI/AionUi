import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export type ExecuteQueuedConversationCommandParams = {
  conversationId: string;
  input: string;
  files: string[];
};

export type ExecuteQueuedConversationCommandResult = {
  started: boolean;
  reason: 'started' | 'busy' | 'locked';
};

type DispatchQueuedConversationCommand = (params: ExecuteQueuedConversationCommandParams) => Promise<void>;

const isRuntimeBusy = (status?: string): boolean => status === 'pending' || status === 'running';

export class ConversationCommandExecutionService {
  private readonly inFlightConversationIds = new Set<string>();

  constructor(
    private readonly conversationService: IConversationService,
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly dispatchQueuedConversationCommand: DispatchQueuedConversationCommand
  ) {}

  async execute(params: ExecuteQueuedConversationCommandParams): Promise<ExecuteQueuedConversationCommandResult> {
    if (this.inFlightConversationIds.has(params.conversationId)) {
      return {
        started: false,
        reason: 'locked',
      };
    }

    const task = this.workerTaskManager.getTask(params.conversationId);
    if (task) {
      if (isRuntimeBusy(task.status)) {
        return {
          started: false,
          reason: 'busy',
        };
      }
    } else {
      const conversation = await this.conversationService.getConversation(params.conversationId);
      if (isRuntimeBusy(conversation?.status)) {
        return {
          started: false,
          reason: 'busy',
        };
      }
    }

    this.inFlightConversationIds.add(params.conversationId);

    try {
      await this.dispatchQueuedConversationCommand(params);
      return {
        started: true,
        reason: 'started',
      };
    } finally {
      this.inFlightConversationIds.delete(params.conversationId);
    }
  }
}
