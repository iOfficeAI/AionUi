// src/process/team/TeammateManager.ts
import { EventEmitter } from 'events';
import { ipcBridge } from '@/common';
import { teamEventBus } from './teamEventBus';
import { addMessage } from '@process/utils/message';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TeamAgent, TeammateStatus, TeamTask, ParsedAction, ITeamMessageEvent } from './types';
import type { Mailbox } from './Mailbox';
import type { TaskManager } from './TaskManager';
import type { AgentResponse } from './adapters/PlatformAdapter';
import { createPlatformAdapter } from './adapters/PlatformAdapter';
import { acpDetector } from '@process/agent/acp/AcpDetector';

type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;

/** Conversation types whose AgentManager supports MCP server injection via session/new */
const MCP_CAPABLE_TYPES = new Set(['acp']);

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
  /** Whether the team MCP server has been started (global flag) */
  private mcpServerStarted: boolean;

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
  private static readonly WAKE_TIMEOUT_MS = 60 * 1000;

  private readonly unsubResponseStream: () => void;

  constructor(params: TeammateManagerParams) {
    super();
    this.teamId = params.teamId;
    this.agents = [...params.agents];
    this.mailbox = params.mailbox;
    this.taskManager = params.taskManager;
    this.workerTaskManager = params.workerTaskManager;
    this.spawnAgentFn = params.spawnAgent;
    this.mcpServerStarted = params.hasMcpTools ?? false;

    for (const agent of this.agents) {
      this.ownedConversationIds.add(agent.conversationId);
    }

    // Listen on teamEventBus instead of ipcBridge: ipcBridge.emit() routes through
    // webContents.send() and never triggers same-process .on() listeners.
    const boundHandler = (msg: IResponseMessage) => this.handleResponseStream(msg);
    teamEventBus.on('responseStream', boundHandler);
    this.unsubResponseStream = () => teamEventBus.removeListener('responseStream', boundHandler);
  }

  /** Get the current agents list */
  getAgents(): TeamAgent[] {
    return [...this.agents];
  }

  setHasMcpTools(value: boolean): void {
    this.mcpServerStarted = value;
  }

  /** Check if a specific agent actually has MCP tools available */
  private agentHasMcpTools(agent: TeamAgent): boolean {
    return this.mcpServerStarted && MCP_CAPABLE_TYPES.has(agent.conversationType);
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

    // Skip if agent is already processing a turn
    if (agent.status === 'active') return;

    this.activeWakes.add(slotId);
    try {
      // Transition pending -> idle on first activation
      if (agent.status === 'pending') {
        this.setStatus(slotId, 'idle');
      }

      this.setStatus(slotId, 'active');

      const adapter = createPlatformAdapter(agent.conversationType, this.agentHasMcpTools(agent));
      const [mailboxMessages, tasks] = await Promise.all([
        this.mailbox.readUnread(this.teamId, slotId),
        this.taskManager.list(this.teamId),
      ]);
      const teammates = this.agents.filter((a) => a.slotId !== slotId);

      // Write each mailbox message into agent's conversation as user bubble
      // so the UI shows what triggered this agent's response
      if (agent.conversationId && mailboxMessages.length > 0) {
        for (const msg of mailboxMessages) {
          // Skip user messages — already written by TeamSession.sendMessage()
          if (msg.fromAgentId === 'user') continue;
          const sender = this.agents.find((a) => a.slotId === msg.fromAgentId);
          const senderName = msg.fromAgentId === 'user' ? 'User' : (sender?.agentName ?? msg.fromAgentId);
          const displayContent =
            mailboxMessages.length > 1 ? `[${senderName}] ${msg.content}` : msg.content;
          const msgId = crypto.randomUUID();
          // Leader receives member messages on the left (incoming); members receive leader instructions on the right (input)
          const isLeaderReceiving = agent.role === 'lead';
          addMessage(agent.conversationId, {
            id: msgId,
            msg_id: msgId,
            type: 'text',
            position: isLeaderReceiving ? 'left' : 'right',
            conversation_id: agent.conversationId,
            content: { content: displayContent },
            createdAt: Date.now(),
          });
          if (!isLeaderReceiving) {
            ipcBridge.conversation.responseStream.emit({
              type: 'user_content',
              conversation_id: agent.conversationId,
              msg_id: msgId,
              data: displayContent,
            });
          }
        }
      }

      const availableAgentTypes = acpDetector.getDetectedAgents().map((a) => ({
        type: a.backend,
        name: a.name,
      }));

      const payload = adapter.buildPayload({ agent, mailboxMessages, tasks, teammates, availableAgentTypes });

      // Clear previous buffer for this conversation
      this.responseBuffer.set(agent.conversationId, '');

      const agentTask = await this.workerTaskManager.getOrBuildTask(agent.conversationId);
      const msgId = crypto.randomUUID();

      // Each AgentManager implementation expects a specific object shape.
      // Gemini uses { input, msg_id }, all others use { content, msg_id }.
      const messageData =
        agent.conversationType === 'gemini'
          ? { input: payload.message, msg_id: msgId, silent: true }
          : { content: payload.message, msg_id: msgId, silent: true };

      await agentTask.sendMessage(messageData);

      // Release wake lock immediately after message is sent.
      // finalizeTurn will also delete it (safe no-op). This prevents permanent
      // deadlock when finish events are lost or finalizeTurn never fires.
      this.activeWakes.delete(slotId);

      // Fallback timeout: if turnCompleted never fires, set idle so the agent
      // can be woken again. 60s is enough for any reasonable response time.
      const timeoutHandle = setTimeout(() => {
        this.wakeTimeouts.delete(slotId);
        const currentAgent = this.agents.find((a) => a.slotId === slotId);
        if (currentAgent?.status === 'active') {
          this.setStatus(slotId, 'idle', 'Wake timed out');
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

    // Forward content events to renderer (skip finish/error/null-data — renderer
    // already receives those directly via ipcBridge.acpConversation.responseStream)
    if (msg.data != null && msg.type !== 'finish' && msg.type !== 'error') {
      const teamMsg: ITeamMessageEvent = {
        teamId: this.teamId,
        slotId: agent.slotId,
        type: msg.type,
        data: msg.data,
        msg_id: msg.msg_id,
        conversation_id: msg.conversation_id,
      };
      ipcBridge.team.messageStream.emit(teamMsg);
    }

    // Accumulate text content for later parsing
    const text = (msg.data as { text?: string } | null)?.text;
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

    const adapter = createPlatformAdapter(agent.conversationType, this.agentHasMcpTools(agent));
    const agentResponse: AgentResponse = { text: accumulatedText };

    let actions: ParsedAction[];
    try {
      actions = adapter.parseResponse(agentResponse);
    } catch {
      this.setStatus(agent.slotId, 'failed');
      return;
    }

    // Separate send_message from actions that must run serially
    const serialActions = actions.filter((a) => a.type !== 'send_message');
    const sendMessageActions = actions.filter((a) => a.type === 'send_message');

    for (const action of serialActions) {
      try {
        await this.executeAction(action, agent.slotId);
      } catch {
        // continue executing remaining actions
      }
    }

    // send_message: write in order (preserve message ordering), then wake all targets in parallel
    if (sendMessageActions.length > 0) {
      const wakeTargets = new Set<string>();
      for (const action of sendMessageActions) {
        if (action.type !== 'send_message') continue;
        const targetSlotId = this.resolveSlotId(action.to);
        if (!targetSlotId) continue;
        try {
          await this.mailbox.write({
            teamId: this.teamId,
            toAgentId: targetSlotId,
            fromAgentId: agent.slotId,
            content: action.content,
            summary: action.summary,
          });
          // Write dispatched message into target agent's conversation
          const targetAgent = this.agents.find((a) => a.slotId === targetSlotId);
          if (targetAgent?.conversationId) {
            const msgId = crypto.randomUUID();
            const isLeaderReceiving = targetAgent.role === 'lead';
            addMessage(targetAgent.conversationId, {
              id: msgId,
              msg_id: msgId,
              type: 'text',
              position: isLeaderReceiving ? 'left' : 'right',
              conversation_id: targetAgent.conversationId,
              content: { content: action.content },
              createdAt: Date.now(),
            });
            if (!isLeaderReceiving) {
              ipcBridge.conversation.responseStream.emit({
                type: 'user_content',
                conversation_id: targetAgent.conversationId,
                msg_id: msgId,
                data: action.content,
              });
            }
          }
          wakeTargets.add(targetSlotId);
        } catch {
          // continue
        }
      }
      if (wakeTargets.size > 0) {
        await Promise.allSettled([...wakeTargets].map((slotId) => this.wake(slotId)));
      }
    }

    // Auto-send idle notification to leader if agent didn't explicitly output one
    const hasExplicitIdle = actions.some((a) => a.type === 'idle_notification');
    if (!hasExplicitIdle && agent.role !== 'lead') {
      const leadAgent = this.agents.find((a) => a.role === 'lead');
      if (leadAgent && leadAgent.slotId !== agent.slotId) {
        const summary = accumulatedText.slice(0, 200).trim() || 'Turn completed';
        await this.mailbox.write({
          teamId: this.teamId,
          toAgentId: leadAgent.slotId,
          fromAgentId: agent.slotId,
          content: summary,
          type: 'idle_notification',
        });
        void this.wake(leadAgent.slotId);
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
        // Write dispatched message into target agent's conversation
        const targetAgent = this.agents.find((a) => a.slotId === targetSlotId);
        if (targetAgent?.conversationId) {
          const msgId = crypto.randomUUID();
          const isLeaderReceiving = targetAgent.role === 'lead';
          addMessage(targetAgent.conversationId, {
            id: msgId,
            msg_id: msgId,
            type: 'text',
            position: isLeaderReceiving ? 'left' : 'right',
            conversation_id: targetAgent.conversationId,
            content: { content: action.content },
            createdAt: Date.now(),
          });
          if (!isLeaderReceiving) {
            ipcBridge.conversation.responseStream.emit({
              type: 'user_content',
              conversation_id: targetAgent.conversationId,
              msg_id: msgId,
              data: action.content,
            });
          }
        }
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

  /** Rename an agent. Updates in-memory state; caller is responsible for persistence. */
  renameAgent(slotId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Agent name cannot be empty');

    const agent = this.agents.find((a) => a.slotId === slotId);
    if (!agent) throw new Error(`Agent "${slotId}" not found`);

    const needle = TeammateManager.normalize(trimmed);
    const duplicate = this.agents.find((a) => a.slotId !== slotId && TeammateManager.normalize(a.agentName) === needle);
    if (duplicate) throw new Error(`Agent name "${trimmed}" is already taken by ${duplicate.slotId}`);

    const oldName = agent.agentName;
    this.agents = this.agents.map((a) => (a.slotId === slotId ? { ...a, agentName: trimmed } : a));
    console.log(`[TeammateManager] Agent ${slotId} renamed: "${oldName}" → "${trimmed}"`);
  }

  /**
   * Resolve an agent identifier (slotId or agentName) to a slotId.
   * Agent outputs may reference teammates by name rather than slotId.
   */
  /** Normalize a string for fuzzy matching: trim, collapse whitespace, strip quotes */
  private static normalize(s: string): string {
    return s
      .trim()
      .replace(/\u00a0|\u200b|\u200c|\u200d|\ufeff/g, ' ')
      .replace(/[\u201c\u201d\u201e\u2018\u2019"']/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private resolveSlotId(nameOrSlotId: string): string | undefined {
    const bySlot = this.agents.find((a) => a.slotId === nameOrSlotId);
    if (bySlot) return bySlot.slotId;
    const needle = TeammateManager.normalize(nameOrSlotId);
    const byName = this.agents.find((a) => TeammateManager.normalize(a.agentName) === needle);
    return byName?.slotId;
  }
}
