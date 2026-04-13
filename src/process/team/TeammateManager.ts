// src/process/team/TeammateManager.ts
import { EventEmitter } from 'events';
import { ipcBridge } from '@/common';
import { teamEventBus } from './teamEventBus';
import { addMessage } from '@process/utils/message';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TeamAgent, TeammateStatus } from './types';
import { TEAM_SUPPORTED_BACKENDS } from '@/common/types/teamTypes';
import type { Mailbox } from './Mailbox';
import type { TaskManager } from './TaskManager';
import { buildRolePrompt } from './adapters/buildRolePrompt';
import { acpDetector } from '@process/agent/acp/AcpDetector';

type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;

type TeammateManagerParams = {
  teamId: string;
  agents: TeamAgent[];
  mailbox: Mailbox;
  taskManager: TaskManager;
  workerTaskManager: IWorkerTaskManager;
  spawnAgent?: SpawnAgentFn;
  hasMcpTools?: boolean;
  teamWorkspace?: string;
  /** Called after an agent is removed from in-memory list, so the caller can persist the change (e.g. update DB) */
  onAgentRemoved?: (teamId: string, agents: TeamAgent[]) => void;
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
  private readonly onAgentRemovedFn?: (teamId: string, agents: TeamAgent[]) => void;
  /** Shared team workspace path (leader's working directory) */
  private readonly teamWorkspace: string | undefined;

  /** Tracks which slotIds currently have an in-progress wake to avoid loops */
  private readonly activeWakes = new Set<string>();
  /** Timeout handles for active wakes, keyed by slotId */
  private readonly wakeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** O(1) lookup set of conversationIds owned by this team, for fast IPC event filtering */
  private readonly ownedConversationIds = new Set<string>();
  /** Tracks conversationIds whose turn has already been finalized, to prevent double processing */
  private readonly finalizedTurns = new Set<string>();
  /** Maps slotId → original name before rename, for "formerly: X" hints in prompts */
  private readonly renamedAgents = new Map<string, string>();

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
    this.onAgentRemovedFn = params.onAgentRemoved;
    this.teamWorkspace = params.teamWorkspace;

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
    if (this.activeWakes.has(slotId)) {
      console.log(`[TeammateManager] wake(${slotId}): SKIPPED (activeWakes)`);
      return;
    }

    const agent = this.agents.find((a) => a.slotId === slotId);
    if (!agent) return;

    console.log(`[TeammateManager] wake(${agent.agentName}): status=${agent.status}, proceeding`);

    this.activeWakes.add(slotId);
    // Clear any stale finalizedTurns entry so a re-woken agent's finish event
    // is not silently dropped by the 5-second dedup window from a prior turn.
    if (agent.conversationId) {
      this.finalizedTurns.delete(agent.conversationId);
    }
    try {
      // Transition pending -> idle on first activation
      if (agent.status === 'pending') {
        this.setStatus(slotId, 'idle');
      }

      this.setStatus(slotId, 'active');

      const [mailboxMessages, tasks] = await Promise.all([
        this.mailbox.readUnread(this.teamId, slotId),
        this.taskManager.list(this.teamId),
      ]);
      const teammates = this.agents.filter((a) => a.slotId !== slotId);

      // Write each mailbox message into agent's conversation as user bubble
      // so the UI shows what triggered this agent's response.
      // Skip for leader: context is already in buildRolePrompt; bubbles would clutter the lead tab.
      if (agent.conversationId && mailboxMessages.length > 0 && agent.role !== 'lead') {
        for (const msg of mailboxMessages) {
          // Skip user messages — already written by TeamSession.sendMessage()
          if (msg.fromAgentId === 'user') continue;
          const sender = this.agents.find((a) => a.slotId === msg.fromAgentId);
          const senderName = msg.fromAgentId === 'user' ? 'User' : (sender?.agentName ?? msg.fromAgentId);
          const displayContent = mailboxMessages.length > 1 ? `[${senderName}] ${msg.content}` : msg.content;
          const msgId = crypto.randomUUID();
          // All messages written to target conversation are incoming from target's perspective
          const teammateMsg = {
            id: msgId,
            msg_id: msgId,
            type: 'text' as const,
            position: 'left' as const,
            conversation_id: agent.conversationId,
            content: { content: displayContent, teammateMessage: true, senderName, senderAgentType: sender?.agentType },
            createdAt: Date.now(),
          };
          addMessage(agent.conversationId, teammateMsg);
          ipcBridge.acpConversation.responseStream.emit({
            type: 'teammate_message',
            conversation_id: agent.conversationId,
            msg_id: msgId,
            data: teammateMsg,
          });
        }
      }

      // Only show team-verified backends in the leader's available agent types
      const availableAgentTypes = acpDetector
        .getDetectedAgents()
        .filter((a) => TEAM_SUPPORTED_BACKENDS.has(a.backend))
        .map((a) => ({ type: a.backend, name: a.name }));

      const message = buildRolePrompt({
        agent,
        mailboxMessages,
        tasks,
        teammates,
        availableAgentTypes,
        renamedAgents: this.renamedAgents,
        teamWorkspace: this.teamWorkspace,
      });

      const agentTask = await this.workerTaskManager.getOrBuildTask(agent.conversationId);
      const msgId = crypto.randomUUID();

      // Each AgentManager implementation expects a specific object shape.
      // Gemini uses { input, msg_id }, all others use { content, msg_id }.
      const messageData =
        agent.conversationType === 'gemini'
          ? { input: message, msg_id: msgId, silent: true }
          : { content: message, msg_id: msgId, silent: true };

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
      console.error(`[TeammateManager] wake(${slotId}) failed:`, error);
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

    // Detect agent crash:
    // 1. AcpAgent.handleDisconnect emits finish with agentCrash flag (wrapper process dies)
    // 2. Inner claude dies but wrapper lives → error string contains crash keywords
    const msgData = msg.data as { agentCrash?: boolean; error?: string } | null;
    if (msg.type === 'finish' && msgData?.agentCrash) {
      void this.handleAgentCrash(agent, msgData.error ?? 'Unknown error');
      return;
    }
    if (msg.type === 'error') {
      const errorText = typeof msg.data === 'string' ? msg.data : (msgData?.error ?? '');
      if (errorText.includes('process exited unexpectedly') || errorText.includes('Session not found')) {
        void this.handleAgentCrash(agent, errorText);
        return;
      }
      // Detect quota/rate-limit errors (429) and mark agent as failed
      if (/429|rate.?limit|quota|too many requests/i.test(errorText)) {
        this.setStatus(agent.slotId, 'failed', errorText.slice(0, 200));
        return;
      }
    }

    // Detect terminal stream messages and trigger turn completion.
    if (msg.type === 'finish' || msg.type === 'error') {
      void this.finalizeTurn(msg.conversation_id);
    }
  }

  /**
   * Turn completion handler. Triggered by responseStream 'finish'/'error' events.
   * Manages state machine transitions and sends idle notifications to the leader.
   * All agent coordination (send_message, task_create, etc.) is handled via MCP tool calls
   * in TeamMcpServer — this method only needs to manage lifecycle.
   */
  private async finalizeTurn(conversationId: string): Promise<void> {
    // Dedup: skip if this turn was already finalized
    if (this.finalizedTurns.has(conversationId)) return;
    this.finalizedTurns.add(conversationId);
    // Clean up the dedup entry after a short delay so future turns can be processed
    setTimeout(() => this.finalizedTurns.delete(conversationId), 5000);

    const agent = this.agents.find((a) => a.conversationId === conversationId);
    if (!agent) return;

    this.activeWakes.delete(agent.slotId);

    // Clear the wake timeout since the turn completed normally
    const timeoutHandle = this.wakeTimeouts.get(agent.slotId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.wakeTimeouts.delete(agent.slotId);
    }

    if (agent.status === 'active') {
      this.setStatus(agent.slotId, 'idle');
    }

    // Auto-send idle notification to leader.
    // Must run AFTER setStatus(idle) so maybeWakeLeaderWhenAllIdle sees the updated state.
    if (agent.role !== 'lead') {
      const leadAgent = this.agents.find((a) => a.role === 'lead');
      if (leadAgent && leadAgent.slotId !== agent.slotId) {
        await this.mailbox.write({
          teamId: this.teamId,
          toAgentId: leadAgent.slotId,
          fromAgentId: agent.slotId,
          content: 'Turn completed',
          type: 'idle_notification',
        });
        // Only wake leader when ALL non-lead teammates are idle/completed/failed/pending.
        // This prevents death loops where each idle notification triggers a new leader turn.
        this.maybeWakeLeaderWhenAllIdle(leadAgent.slotId);
      }
    }
  }

  /**
   * Wake the leader only when ALL non-lead teammates are settled (idle/completed/failed/pending).
   * Prevents death loops where each individual idle notification triggers a new leader turn
   * before other teammates have finished, causing the leader to re-dispatch work repeatedly.
   */
  private maybeWakeLeaderWhenAllIdle(leadSlotId: string): void {
    const nonLeadAgents = this.agents.filter((a) => a.role !== 'lead');
    if (nonLeadAgents.length === 0) return;
    const allSettled = nonLeadAgents.every(
      (a) => a.status === 'idle' || a.status === 'completed' || a.status === 'failed' || a.status === 'pending'
    );
    console.log(
      `[TeammateManager] maybeWakeLeaderWhenAllIdle: ${nonLeadAgents.map((a) => `${a.agentName}:${a.status}`).join(', ')} → ${allSettled ? 'WAKE' : 'SKIP'}`
    );
    if (allSettled) {
      void this.wake(leadSlotId);
    }
  }

  /**
   * Handle an agent whose CLI process crashed unexpectedly.
   * Writes a testament message to the leader's mailbox, removes the agent,
   * and wakes the leader so it can decide whether to respawn.
   */
  private async handleAgentCrash(agent: TeamAgent, errorMessage: string): Promise<void> {
    const leadAgent = this.agents.find((a) => a.role === 'lead');
    if (!leadAgent) return;

    const testament =
      `[System] Member "${agent.agentName}" (${agent.conversationType}) crashed and has been automatically removed. ` +
      `Error: ${errorMessage}. ` +
      `You may recreate a member to continue the task if needed.`;

    // 1. Write testament to leader's mailbox
    await this.mailbox.write({
      teamId: this.teamId,
      toAgentId: leadAgent.slotId,
      fromAgentId: agent.slotId,
      content: testament,
      type: 'message',
      summary: `${agent.agentName} crashed`,
    });

    console.warn(
      `[TeammateManager] Agent ${agent.slotId} (${agent.agentName}) crashed: ${errorMessage}. Testament sent to leader.`
    );

    // 2. Remove the crashed agent (equivalent to fire, without shutdown negotiation)
    this.removeAgent(agent.slotId);

    // 3. Wake leader to process the testament
    void this.wake(leadAgent.slotId);
  }

  /** Remove an agent: kill process, cancel pending wake, clear buffers, remove from in-memory list */
  removeAgent(slotId: string): void {
    const agent = this.agents.find((a) => a.slotId === slotId);
    if (!agent) return;

    // Kill the underlying ACP process
    if (agent.conversationId) {
      this.workerTaskManager.kill(agent.conversationId);
    }

    // Cancel any pending wake timeout
    const timeoutHandle = this.wakeTimeouts.get(slotId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.wakeTimeouts.delete(slotId);
    }
    this.activeWakes.delete(slotId);

    // Clean up owned conversation tracking
    if (agent.conversationId) {
      this.ownedConversationIds.delete(agent.conversationId);
      this.finalizedTurns.delete(agent.conversationId);
    }

    this.agents = this.agents.filter((a) => a.slotId !== slotId);
    console.log(`[TeammateManager] Agent ${slotId} (${agent.agentName}) removed`);
    ipcBridge.team.agentRemoved.emit({ teamId: this.teamId, slotId });

    // Notify upper layer to persist the removal (e.g. update DB)
    this.onAgentRemovedFn?.(this.teamId, this.agents);
  }

  /** Normalize agent name for case-insensitive comparison. */
  private static normalize(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .replace(/\u00a0|\u200b|\u200c|\u200d|\ufeff/g, ' ')
      .replace(/[\u201c\u201d\u201e\u2018\u2019"']/g, '')
      .replace(/\s+/g, ' ');
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
    // Only store the very first original name so multiple renames show the original
    if (!this.renamedAgents.has(slotId)) {
      this.renamedAgents.set(slotId, oldName);
    }
    this.agents = this.agents.map((a) => (a.slotId === slotId ? { ...a, agentName: trimmed } : a));
    console.log(`[TeammateManager] Agent ${slotId} renamed: "${oldName}" → "${trimmed}"`);
    ipcBridge.team.agentRenamed.emit({ teamId: this.teamId, slotId, oldName, newName: trimmed });
  }
}
