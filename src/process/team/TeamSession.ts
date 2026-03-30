// src/process/team/TeamSession.ts
import { EventEmitter } from 'events';
import { ipcBridge } from '@/common';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { IResponseMessage, IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import { parseAssignTasks, buildResultInjection } from './assignTaskParser';
import type { TTeam, TeamAgent, TeamAgentRuntime, TeamAgentStatus, ITeamMessageEvent } from './types';

export class TeamSession extends EventEmitter {
  private readonly team: TTeam;
  private readonly workerTaskManager: IWorkerTaskManager;
  private readonly conversationService: IConversationService;
  private readonly runtimes: Map<string, TeamAgentRuntime>;
  private dispatchBuffer: string = '';
  private activeSubTaskSlotId: string | null = null;
  private subAgentOutputBuffer: string = '';

  constructor(
    team: TTeam,
    workerTaskManager: IWorkerTaskManager,
    conversationService: IConversationService
  ) {
    super();
    this.team = team;
    this.workerTaskManager = workerTaskManager;
    this.conversationService = conversationService;
    this.runtimes = new Map(
      team.agents.map((a) => [a.slotId, { slotId: a.slotId, status: 'idle' as TeamAgentStatus }])
    );
    this.attachStreamListeners();
  }

  getRuntimes(): Map<string, TeamAgentRuntime> {
    return new Map(this.runtimes);
  }

  async sendMessage(content: string): Promise<void> {
    const dispatchAgent = this.team.agents.find((a) => a.role === 'dispatch');
    if (!dispatchAgent) throw new Error('No dispatch agent in team');
    this.dispatchBuffer = '';
    this.setStatus(dispatchAgent.slotId, 'working');
    const task = await this.workerTaskManager.getOrBuildTask(dispatchAgent.conversationId);
    await task.sendMessage(content);
  }

  async routeTask(task: { slotId: string; prompt: string }): Promise<void> {
    const agent = this.team.agents.find((a) => a.slotId === task.slotId);
    if (!agent) {
      throw new Error(`Sub-agent slot "${task.slotId}" not found`);
    }
    this.setStatus(task.slotId, 'working', task.prompt.slice(0, 80));
    this.activeSubTaskSlotId = task.slotId;
    this.subAgentOutputBuffer = '';
    const agentTask = await this.workerTaskManager.getOrBuildTask(agent.conversationId);
    await agentTask.sendMessage(task.prompt);
  }

  addAgent(agent: TeamAgent): void {
    this.team.agents.push(agent);
    this.runtimes.set(agent.slotId, { slotId: agent.slotId, status: 'idle' });
    this.emit('agentStatusChanged', this.runtimes.get(agent.slotId)!);
  }

  dispose(): void {
    this.removeAllListeners();
  }

  private setStatus(slotId: string, status: TeamAgentStatus, lastMessage?: string): void {
    const runtime = this.runtimes.get(slotId);
    if (!runtime) return;
    const updated: TeamAgentRuntime = {
      ...runtime,
      status,
      ...(lastMessage !== undefined && { lastMessage }),
    };
    this.runtimes.set(slotId, updated);
    this.emit('agentStatusChanged', updated);
    ipcBridge.team.agentStatusChanged.emit({ teamId: this.team.id, slotId, status, lastMessage });
  }

  private slotIdForConversation(conversationId: string): string | undefined {
    return this.team.agents.find((a) => a.conversationId === conversationId)?.slotId;
  }

  private isManaged(conversationId: string): boolean {
    return this.team.agents.some((a) => a.conversationId === conversationId);
  }

  private attachStreamListeners(): void {
    ipcBridge.conversation.responseStream.on((msg: IResponseMessage) => {
      if (!this.isManaged(msg.conversation_id)) return;
      const slotId = this.slotIdForConversation(msg.conversation_id);
      if (!slotId) return;

      const teamMsg: ITeamMessageEvent = { teamId: this.team.id, slotId, ...msg };
      ipcBridge.team.messageStream.emit(teamMsg);

      const dispatchConvId = this.team.agents.find((a) => a.role === 'dispatch')?.conversationId;
      if (msg.conversation_id === dispatchConvId && typeof (msg.data as { text?: string }).text === 'string') {
        this.dispatchBuffer += (msg.data as { text: string }).text;
      }

      if (
        this.activeSubTaskSlotId &&
        this.slotIdForConversation(msg.conversation_id) === this.activeSubTaskSlotId
      ) {
        if (typeof (msg.data as { text?: string }).text === 'string') {
          this.subAgentOutputBuffer += (msg.data as { text: string }).text;
        }
      }
    });

    ipcBridge.conversation.turnCompleted.on((event: IConversationTurnCompletedEvent) => {
      if (!this.isManaged(event.sessionId)) return;
      const slotId = this.slotIdForConversation(event.sessionId);
      if (!slotId) return;

      const dispatchConvId = this.team.agents.find((a) => a.role === 'dispatch')?.conversationId;

      if (event.sessionId === dispatchConvId) {
        if (event.state === 'stopped' || event.state === 'ai_waiting_input') {
          this.setStatus(slotId, 'idle');
          void this.processDispatchOutput();
        }
      } else if (slotId === this.activeSubTaskSlotId) {
        const result = this.subAgentOutputBuffer || '(no output)';
        this.setStatus(slotId, 'done');
        this.activeSubTaskSlotId = null;
        this.subAgentOutputBuffer = '';
        void this.injectResultToDispatch(slotId, result);
      }
    });
  }

  private async processDispatchOutput(): Promise<void> {
    const tasks = parseAssignTasks(this.dispatchBuffer);
    this.dispatchBuffer = '';
    if (tasks.length === 0) return;
    for (const task of tasks) {
      try {
        await this.routeTask(task);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        await this.injectResultToDispatch(task.slotId, `Error: ${errMsg}`);
      }
    }
  }

  private async injectResultToDispatch(slotId: string, result: string): Promise<void> {
    const dispatchAgent = this.team.agents.find((a) => a.role === 'dispatch');
    if (!dispatchAgent) return;
    const injection = buildResultInjection(slotId, result);
    const dispatchTask = await this.workerTaskManager.getOrBuildTask(dispatchAgent.conversationId);
    await dispatchTask.sendMessage(injection);
  }
}
