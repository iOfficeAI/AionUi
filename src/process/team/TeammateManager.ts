// src/process/team/TeammateManager.ts
import { EventEmitter } from 'events';
import { ipcBridge } from '@/common';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IResponseMessage, IConversationTurnCompletedEvent } from '@/common/adapter/ipcBridge';
import type { TeamAgent, TeammateStatus, TeamTask, ParsedAction, ITeamMessageEvent } from './types';
import type { Mailbox } from './Mailbox';
import type { TaskManager } from './TaskManager';
import type { AgentResponse } from './adapters/PlatformAdapter';
import { createPlatformAdapter } from './adapters/PlatformAdapter';

type TeammateManagerParams = {
  teamId: string;
  agents: TeamAgent[];
  mailbox: Mailbox;
  taskManager: TaskManager;
  workerTaskManager: IWorkerTaskManager;
};

/**
 * Core orchestration engine that manages teammate state machines
 * and coordinates agent communication via mailbox and task board.
 */
export class TeammateManager extends EventEmitter {
  private readonly teamId: string;
  private agents: TeamAgent[];
  private readonly mailbox: Mailbox;
  private readonly taskManager: TaskManager;
  private readonly workerTaskManager: IWorkerTaskManager;

  /** Accumulated text response per conversationId */
  private readonly responseBuffer = new Map<string, string>();
  /** Tracks which slotIds currently have an in-progress wake to avoid loops */
  private readonly activeWakes = new Set<string>();

  private readonly unsubResponseStream: () => void;
  private readonly unsubTurnCompleted: () => void;

  constructor(params: TeammateManagerParams) {
    super();
    this.teamId = params.teamId;
    this.agents = [...params.agents];
    this.mailbox = params.mailbox;
    this.taskManager = params.taskManager;
    this.workerTaskManager = params.workerTaskManager;

    this.unsubResponseStream = ipcBridge.conversation.responseStream.on((msg: IResponseMessage) => {
      this.handleResponseStream(msg);
    });

    this.unsubTurnCompleted = ipcBridge.conversation.turnCompleted.on((event: IConversationTurnCompletedEvent) => {
      void this.handleTurnCompleted(event);
    });
  }

  /** Get the current agents list */
  getAgents(): TeamAgent[] {
    return [...this.agents];
  }

  /** Add a new agent to the team */
  addAgent(agent: TeamAgent): void {
    this.agents = [...this.agents, agent];
  }

  /**
   * Wake an agent: read unread mailbox, build payload, send to agent.
   * Sets status to 'active' during API call, 'idle' when done.
   * Skips if the agent's wake is already in progress.
   */
  async wake(slotId: string): Promise<void> {
    if (this.activeWakes.has(slotId)) return;

    const agent = this.agents.find((a) => a.slotId === slotId);
    if (!agent) return;

    this.activeWakes.add(slotId);
    try {
      // Transition pending -> idle on first activation
      if (agent.status === 'pending') {
        this.setStatus(slotId, 'idle');
      }

      this.setStatus(slotId, 'active');

      const adapter = createPlatformAdapter(agent.conversationType);
      const mailboxMessages = await this.mailbox.readUnread(this.teamId, slotId);
      const tasks = await this.taskManager.list(this.teamId);
      const teammates = this.agents.filter((a) => a.slotId !== slotId);

      const payload = adapter.buildPayload({ agent, mailboxMessages, tasks, teammates });

      // Clear previous buffer for this conversation
      this.responseBuffer.set(agent.conversationId, '');

      const agentTask = await this.workerTaskManager.getOrBuildTask(agent.conversationId);
      await agentTask.sendMessage(payload.message);
    } catch (error) {
      this.setStatus(slotId, 'failed');
      this.activeWakes.delete(slotId);
      throw error;
    }
    // activeWakes entry is removed when turnCompleted fires
  }

  /** Set agent status, update the local agents array, and emit IPC event */
  setStatus(slotId: string, status: TeammateStatus, lastMessage?: string): void {
    this.agents = this.agents.map((a) => (a.slotId === slotId ? { ...a, status } : a));
    ipcBridge.team.agentStatusChanged.emit({ teamId: this.teamId, slotId, status, lastMessage });
    this.emit('agentStatusChanged', { teamId: this.teamId, slotId, status, lastMessage });
  }

  /** Clean up all IPC listeners and EventEmitter handlers */
  dispose(): void {
    this.unsubResponseStream();
    this.unsubTurnCompleted();
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Private stream handlers
  // ---------------------------------------------------------------------------

  private handleResponseStream(msg: IResponseMessage): void {
    const agent = this.agents.find((a) => a.conversationId === msg.conversation_id);
    if (!agent) return;

    // Forward to renderer
    const teamMsg: ITeamMessageEvent = {
      teamId: this.teamId,
      slotId: agent.slotId,
      type: msg.type,
      data: msg.data,
      msg_id: msg.msg_id,
      conversation_id: msg.conversation_id,
    };
    ipcBridge.team.messageStream.emit(teamMsg);

    // Accumulate text content for later parsing
    const text = (msg.data as { text?: string }).text;
    if (typeof text === 'string') {
      const existing = this.responseBuffer.get(msg.conversation_id) ?? '';
      this.responseBuffer.set(msg.conversation_id, existing + text);
    }
  }

  private async handleTurnCompleted(event: IConversationTurnCompletedEvent): Promise<void> {
    const agent = this.agents.find((a) => a.conversationId === event.sessionId);
    if (!agent) return;

    const accumulatedText = this.responseBuffer.get(event.sessionId) ?? '';
    this.responseBuffer.delete(event.sessionId);
    this.activeWakes.delete(agent.slotId);

    const adapter = createPlatformAdapter(agent.conversationType);
    const agentResponse: AgentResponse = { text: accumulatedText };

    let actions: ParsedAction[];
    try {
      actions = adapter.parseResponse(agentResponse);
    } catch {
      this.setStatus(agent.slotId, 'failed');
      return;
    }

    for (const action of actions) {
      try {
        await this.executeAction(action, agent.slotId);
      } catch {
        // Log via structured path; continue executing remaining actions
      }
    }

    // Only set idle if executeAction did not already change status (e.g. idle_notification)
    const currentAgent = this.agents.find((a) => a.slotId === agent.slotId);
    if (currentAgent?.status === 'active') {
      this.setStatus(agent.slotId, 'idle');
    }
  }

  // ---------------------------------------------------------------------------
  // Action execution
  // ---------------------------------------------------------------------------

  private async executeAction(action: ParsedAction, fromSlotId: string): Promise<void> {
    switch (action.type) {
      case 'send_message': {
        const targetSlotId = this.resolveSlotId(action.to);
        if (!targetSlotId) break;
        await this.mailbox.write({
          teamId: this.teamId,
          toAgentId: targetSlotId,
          fromAgentId: fromSlotId,
          content: action.content,
          summary: action.summary,
        });
        await this.wake(targetSlotId);
        break;
      }

      case 'task_create': {
        await this.taskManager.create({
          teamId: this.teamId,
          subject: action.subject,
          description: action.description,
          owner: action.owner,
        });
        break;
      }

      case 'task_update': {
        await this.taskManager.update(action.taskId, {
          status: action.status as TeamTask['status'],
          owner: action.owner,
        });
        if (action.status === 'completed') {
          await this.taskManager.checkUnblocks(action.taskId);
        }
        break;
      }

      case 'idle_notification': {
        this.setStatus(fromSlotId, 'idle', action.summary);
        const leadAgent = this.agents.find((a) => a.role === 'lead');
        if (leadAgent) {
          await this.mailbox.write({
            teamId: this.teamId,
            toAgentId: leadAgent.slotId,
            fromAgentId: fromSlotId,
            content: action.summary,
            type: 'idle_notification',
          });
          await this.wake(leadAgent.slotId);
        }
        break;
      }

      case 'plain_response':
        // Already forwarded via responseStream; nothing further needed
        break;
    }
  }

  /**
   * Resolve an agent identifier (slotId or agentName) to a slotId.
   * Agent outputs may reference teammates by name rather than slotId.
   */
  private resolveSlotId(nameOrSlotId: string): string | undefined {
    const bySlot = this.agents.find((a) => a.slotId === nameOrSlotId);
    if (bySlot) return bySlot.slotId;
    const byName = this.agents.find((a) => a.agentName.toLowerCase() === nameOrSlotId.toLowerCase());
    return byName?.slotId;
  }
}
