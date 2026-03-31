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
import { extractToolCallInfo, isTeamToolCall, parseToolCallAction } from './adapters/toolCallAdapter';
import type { ToolCallUpdate } from '@/common/types/acpTypes';

type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;

type TeammateManagerParams = {
  teamId: string;
  agents: TeamAgent[];
  mailbox: Mailbox;
  taskManager: TaskManager;
  workerTaskManager: IWorkerTaskManager;
  spawnAgent?: SpawnAgentFn;
  hasMcpTools?: boolean;
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
  private readonly spawnAgentFn?: SpawnAgentFn;
  private hasMcpTools: boolean;

  /** Accumulated text response per conversationId */
  private readonly responseBuffer = new Map<string, string>();
  /** Tracks which slotIds currently have an in-progress wake to avoid loops */
  private readonly activeWakes = new Set<string>();
  /** Timeout handles for active wakes, keyed by slotId */
  private readonly wakeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** O(1) lookup set of conversationIds owned by this team, for fast IPC event filtering */
  private readonly ownedConversationIds = new Set<string>();
  /** Tracks conversationIds whose turn has already been finalized, to prevent double processing */
  private readonly finalizedTurns = new Set<string>();

  /** Maximum time (ms) to wait for a turnCompleted event before force-releasing a wake */
  private static readonly WAKE_TIMEOUT_MS = 5 * 60 * 1000;

  private readonly unsubResponseStream: () => void;
  private readonly unsubTurnCompleted: () => void;

  constructor(params: TeammateManagerParams) {
    super();
    this.teamId = params.teamId;
    this.agents = [...params.agents];
    this.mailbox = params.mailbox;
    this.taskManager = params.taskManager;
    this.workerTaskManager = params.workerTaskManager;
    this.spawnAgentFn = params.spawnAgent;
    this.hasMcpTools = params.hasMcpTools ?? false;

    for (const agent of this.agents) {
      this.ownedConversationIds.add(agent.conversationId);
    }

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

  setHasMcpTools(value: boolean): void {
    this.hasMcpTools = value;
  }

  /** Add a new agent to the team and notify renderer */
  addAgent(agent: TeamAgent): void {
    this.agents = [...this.agents, agent];
    this.ownedConversationIds.add(agent.conversationId);
    // Notify renderer so it can refresh team data (tabs, status, etc.)
    ipcBridge.team.agentSpawned.emit({ teamId: this.teamId, agent });
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

      const adapter = createPlatformAdapter(agent.conversationType, this.hasMcpTools);
      const [mailboxMessages, tasks] = await Promise.all([
        this.mailbox.readUnread(this.teamId, slotId),
        this.taskManager.list(this.teamId),
      ]);
      const teammates = this.agents.filter((a) => a.slotId !== slotId);

      const payload = adapter.buildPayload({ agent, mailboxMessages, tasks, teammates });

      // Clear previous buffer for this conversation
      this.responseBuffer.set(agent.conversationId, '');

      const agentTask = await this.workerTaskManager.getOrBuildTask(agent.conversationId, { skipCache: true });
      const msgId = crypto.randomUUID();

      // Each AgentManager implementation expects a specific object shape.
      // Gemini uses { input, msg_id }, all others use { content, msg_id }.
      const messageData =
        agent.conversationType === 'gemini'
          ? { input: payload.message, msg_id: msgId }
          : { content: payload.message, msg_id: msgId };

      await agentTask.sendMessage(messageData);

      // Set a timeout to force-release the wake if turnCompleted never fires
      const timeoutHandle = setTimeout(() => {
        if (this.activeWakes.has(slotId)) {
          this.activeWakes.delete(slotId);
          this.wakeTimeouts.delete(slotId);
          this.setStatus(slotId, 'failed', 'Wake timed out waiting for turnCompleted');
        }
      }, TeammateManager.WAKE_TIMEOUT_MS);
      this.wakeTimeouts.set(slotId, timeoutHandle);
    } catch (error) {
      this.setStatus(slotId, 'failed');
      this.activeWakes.delete(slotId);
      throw error;
    }
    // activeWakes entry is removed when turnCompleted fires (or by timeout)
  }

  /** Set agent status, update the local agents array, and emit IPC event */
  setStatus(slotId: string, status: TeammateStatus, lastMessage?: string): void {
    this.agents = this.agents.map((a) => (a.slotId === slotId ? { ...a, status } : a));
    ipcBridge.team.agentStatusChanged.emit({ teamId: this.teamId, slotId, status, lastMessage });
    this.emit('agentStatusChanged', { teamId: this.teamId, slotId, status, lastMessage });
  }

  /** Clean up all IPC listeners, timers, and EventEmitter handlers */
  dispose(): void {
    this.unsubResponseStream();
    this.unsubTurnCompleted();
    for (const handle of this.wakeTimeouts.values()) {
      clearTimeout(handle);
    }
    this.wakeTimeouts.clear();
    this.activeWakes.clear();
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Private stream handlers
  // ---------------------------------------------------------------------------

  private handleResponseStream(msg: IResponseMessage): void {
    // Fast O(1) check: skip events for conversations not owned by this team
    if (!this.ownedConversationIds.has(msg.conversation_id)) return;

    const agent = this.agents.find((a) => a.conversationId === msg.conversation_id);
    if (!agent) return;

    // Auto-activate agent on first response from a direct user message
    if (agent.status !== 'active') {
      this.setStatus(agent.slotId, 'active');
    }

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

    // Detect terminal stream messages and trigger turn completion.
    // The turnCompleted IPC event is never emitted by agent managers, so we
    // derive turn completion from the responseStream 'finish' message instead.
    if (msg.type === 'finish' || msg.type === 'error') {
      void this.finalizeTurn(msg.conversation_id);
    }
  }

  private async handleTurnCompleted(event: IConversationTurnCompletedEvent): Promise<void> {
    // Fast O(1) check: skip events for conversations not owned by this team
    if (!this.ownedConversationIds.has(event.sessionId)) return;
    // Delegate to shared finalizeTurn (deduplication handled there)
    void this.finalizeTurn(event.sessionId);
  }

  /**
   * Shared turn completion handler. Called from both responseStream 'finish'
   * detection and the turnCompleted IPC event (if it ever fires).
   * Uses finalizedTurns set to prevent double processing.
   */
  private async finalizeTurn(conversationId: string): Promise<void> {
    // Dedup: skip if this turn was already finalized
    if (this.finalizedTurns.has(conversationId)) return;
    this.finalizedTurns.add(conversationId);
    // Clean up the dedup entry after a short delay so future turns can be processed
    setTimeout(() => this.finalizedTurns.delete(conversationId), 5000);

    const agent = this.agents.find((a) => a.conversationId === conversationId);
    if (!agent) return;

    const accumulatedText = this.responseBuffer.get(conversationId) ?? '';
    this.responseBuffer.delete(conversationId);
    this.activeWakes.delete(agent.slotId);

    // Clear the wake timeout since the turn completed normally
    const timeoutHandle = this.wakeTimeouts.get(agent.slotId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.wakeTimeouts.delete(agent.slotId);
    }

    const adapter = createPlatformAdapter(agent.conversationType, this.hasMcpTools);
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

      case 'spawn_agent': {
        if (!this.spawnAgentFn) {
          console.warn('[TeammateManager] spawnAgent not available');
          break;
        }
        const newAgent = await this.spawnAgentFn(action.agentName, action.agentType);
        // Notify the lead that the agent was created
        // Note: spawnAgentFn already calls TeammateManager.addAgent internally via session.addAgent
        await this.mailbox.write({
          teamId: this.teamId,
          toAgentId: fromSlotId,
          fromAgentId: newAgent.slotId,
          content: `Teammate "${action.agentName}" (${newAgent.slotId}) has been created and is ready.`,
        });
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
