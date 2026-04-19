// src/process/team/TeammateManager.ts
import { EventEmitter } from 'events';
import { ipcBridge } from '@/common';
import { teamEventBus } from './teamEventBus';
import { addMessage } from '@process/utils/message';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TeamAgent, TeammateStatus } from './types';
import { isTeamCapableBackend } from '@/common/types/teamTypes';
import { ProcessConfig } from '@process/utils/initStorage';
import type { Mailbox } from './Mailbox';
import { buildRolePrompt } from './prompts/buildRolePrompt';
import { formatMessages } from './prompts/formatHelpers';
import { agentRegistry } from '@process/agent/AgentRegistry';

type TeammateManagerParams = {
  teamId: string;
  agents: TeamAgent[];
  mailbox: Mailbox;
  workerTaskManager: IWorkerTaskManager;
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
  private readonly workerTaskManager: IWorkerTaskManager;
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
    this.workerTaskManager = params.workerTaskManager;
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
      console.debug(`[TeammateManager] wake(${slotId}): SKIPPED (activeWakes)`);
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
      // Determine if this is the first activation or a crash recovery —
      // these need the full role prompt with static instructions.
      // Subsequent wakes only need a lightweight status update.
      const needsFullPrompt = agent.status === 'pending' || agent.status === 'failed';

      // Transition pending -> idle on first activation
      if (agent.status === 'pending') {
        this.setStatus(slotId, 'idle');
      }

      this.setStatus(slotId, 'active');

      const mailboxMessages = await this.mailbox.readUnread(this.teamId, slotId);
      const teammates = this.agents.filter((a) => a.slotId !== slotId);

      // Write each mailbox message into agent's conversation as user bubble
      // so the UI shows what triggered this agent's response.
      // Skip for leader: messages are included in the prompt sent to the agent.
      if (agent.conversationId && mailboxMessages.length > 0 && agent.role !== 'leader') {
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

      // Build the message to send to the agent:
      // - First wake (pending/failed): static role prompt + any mailbox messages
      // - Subsequent wakes: just the mailbox messages
      // Agents pull tasks and teammates on demand via team_task_list / team_members MCP tools.
      let message: string;
      if (needsFullPrompt) {
        // Compute availableAgentTypes only for leader's first prompt
        let availableAgentTypes: Array<{ type: string; name: string }> | undefined;
        if (agent.role === 'leader') {
          const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
          availableAgentTypes = agentRegistry
            .getDetectedAgents()
            .filter((a) => isTeamCapableBackend(a.backend, cachedInitResults))
            .map((a) => ({
              type: a.backend,
              name: a.name,
            }));
        }

        const staticPrompt = buildRolePrompt({
          agent,
          teammates,
          availableAgentTypes,
          renamedAgents: this.renamedAgents,
          teamWorkspace: this.teamWorkspace,
        });

        message =
          mailboxMessages.length > 0
            ? `${staticPrompt}\n\n## Unread Messages\n${formatMessages(mailboxMessages, this.agents)}`
            : staticPrompt;
      } else {
        // Subsequent wakes: just forward the mailbox messages
        if (mailboxMessages.length === 0) {
          // Nothing to send — restore idle status and release wake
          this.setStatus(slotId, 'idle');
          this.activeWakes.delete(slotId);
          return;
        }
        message = formatMessages(mailboxMessages, this.agents);
      }

      console.log(
        `[TeammateManager] wake(${agent.agentName}): sendPrompt type=${needsFullPrompt ? 'full' : 'messages-only'}, length=${message.length}, preview=${JSON.stringify(message.slice(0, 200))}`
      );

      const agentTask = await this.workerTaskManager.getOrBuildTask(agent.conversationId);
      const msgId = crypto.randomUUID();

      // Extract files from user messages in this batch
      const userFiles = mailboxMessages
        .filter((m) => m.fromAgentId === 'user' && m.files?.length)
        .flatMap((m) => m.files!);

      // Each AgentManager implementation expects a specific object shape.
      // Gemini uses { input, msg_id }, all others use { content, msg_id }.
      const messageData =
        agent.conversationType === 'gemini'
          ? { input: message, msg_id: msgId, silent: true, ...(userFiles.length > 0 ? { files: userFiles } : {}) }
          : { content: message, msg_id: msgId, silent: true, ...(userFiles.length > 0 ? { files: userFiles } : {}) };

      await agentTask.sendMessage(messageData);

      // Release wake lock immediately after message is sent.
      // finalizeTurn will also delete it (safe no-op). This prevents permanent
      // deadlock when finish events are lost or finalizeTurn never fires.
      this.activeWakes.delete(slotId);

      // Arm the inactivity watchdog. Any streaming output from this agent
      // resets it via handleResponseStream → resetWakeTimeout. It only fires
      // when the agent has been silent for WAKE_TIMEOUT_MS with no finish event.
      this.resetWakeTimeout(slotId);
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
      return;
    }

    // Heartbeat: any non-terminal streaming activity (text, tool calls, thoughts)
    // proves the agent is still alive. Reset the inactivity watchdog so a genuinely
    // long-running turn (e.g. Codex emitting extended reasoning before its first
    // team_send_message) isn't prematurely declared dead.
    if (agent.status === 'active' && this.wakeTimeouts.has(agent.slotId)) {
      this.resetWakeTimeout(agent.slotId);
    }
  }

  /**
   * (Re)arm the inactivity watchdog for an agent's current wake.
   * Fired from wake() after dispatching the prompt, and from handleResponseStream
   * whenever fresh streaming activity arrives. When it finally fires (agent silent
   * for WAKE_TIMEOUT_MS), escalates to handleInactivityTimeout so the leader learns
   * about the stall instead of the agent dropping silently to idle.
   */
  private resetWakeTimeout(slotId: string): void {
    const existing = this.wakeTimeouts.get(slotId);
    if (existing) clearTimeout(existing);

    const timeoutHandle = setTimeout(() => {
      this.wakeTimeouts.delete(slotId);
      const currentAgent = this.agents.find((a) => a.slotId === slotId);
      if (currentAgent?.status === 'active') {
        void this.handleInactivityTimeout(currentAgent);
      }
    }, TeammateManager.WAKE_TIMEOUT_MS);
    this.wakeTimeouts.set(slotId, timeoutHandle);
  }

  /**
   * A teammate went silent for WAKE_TIMEOUT_MS with no streaming activity and no
   * finish event. Treat it as a soft failure: mark the agent 'failed' (not 'idle',
   * which hides the problem), write an explanatory message into the leader's mailbox,
   * and wake the leader so it can decide the next move (retry, replace, escalate).
   *
   * Previously the timeout just setStatus(slotId, 'idle'), which left the leader
   * unaware — it would eventually re-wake on some other signal and guess that
   * the teammate was "空转" (idle) with no concrete evidence.
   */
  private async handleInactivityTimeout(agent: TeamAgent): Promise<void> {
    const timeoutSeconds = Math.floor(TeammateManager.WAKE_TIMEOUT_MS / 1000);
    const reason = `stopped responding after ${timeoutSeconds}s without sending any update`;

    console.warn(`[TeammateManager] ${agent.agentName} (${agent.slotId}) ${reason}`);
    this.setStatus(agent.slotId, 'failed', reason);

    // Don't escalate to leader if the stuck agent IS the leader — nobody to notify.
    if (agent.role === 'leader') return;

    const leadAgent = this.agents.find((a) => a.role === 'leader');
    if (!leadAgent) return;

    try {
      await this.mailbox.write({
        teamId: this.teamId,
        toAgentId: leadAgent.slotId,
        fromAgentId: agent.slotId,
        type: 'idle_notification',
        content:
          `Teammate ${agent.agentName} (${agent.agentType}) ${reason}. ` +
          `Their session may be stuck or the model may be generating an overlong silent turn. ` +
          `Decide whether to retry by sending them a fresh message, replace them with another agent, or continue without them.`,
      });
      await this.wake(leadAgent.slotId);
    } catch (err) {
      console.error('[TeammateManager] Failed to notify leader of inactivity timeout:', err);
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
    if (agent.role !== 'leader') {
      const leadAgent = this.agents.find((a) => a.role === 'leader');
      if (leadAgent && leadAgent.slotId !== agent.slotId) {
        await this.mailbox.write({
          teamId: this.teamId,
          toAgentId: leadAgent.slotId,
          fromAgentId: agent.slotId,
          content: 'Turn completed',
          type: 'idle_notification',
        });
        // Only wake leader when ALL non-leader teammates are idle/completed/failed/pending.
        // This prevents death loops where each idle notification triggers a new leader turn.
        this.maybeWakeLeaderWhenAllIdle(leadAgent.slotId);
      }
    }
  }

  /**
   * Wake the leader only when ALL non-leader teammates are settled (idle/completed/failed/pending).
   * Prevents death loops where each individual idle notification triggers a new leader turn
   * before other teammates have finished, causing the leader to re-dispatch work repeatedly.
   */
  private maybeWakeLeaderWhenAllIdle(leadSlotId: string): void {
    const nonLeadAgents = this.agents.filter((a) => a.role !== 'leader');
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
   * For **members**: kills the process, clears wake locks, marks as failed (tab stays),
   * writes a testament to the leader's mailbox, and wakes the leader.
   * Local data and the agent slot are preserved so the agent can be recovered.
   * For **leader**: only marks it as failed — leader must never be auto-removed.
   */
  private async handleAgentCrash(agent: TeamAgent, errorMessage: string): Promise<void> {
    // Leader crash: mark as failed so the frontend shows the error, but never auto-remove.
    if (agent.role === 'leader') {
      console.warn(
        `[TeammateManager] Leader ${agent.slotId} (${agent.agentName}) crashed: ${errorMessage}. Marked as failed (not removed).`
      );

      // Kill the crashed process (clean up residual child process)
      if (agent.conversationId) {
        this.workerTaskManager.kill(agent.conversationId);
      }

      // Clear wake locks to prevent future wake() calls from being permanently skipped
      const timeoutHandle = this.wakeTimeouts.get(agent.slotId);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.wakeTimeouts.delete(agent.slotId);
      }
      this.activeWakes.delete(agent.slotId);

      this.setStatus(agent.slotId, 'failed', errorMessage.slice(0, 200));
      return;
    }

    const leadAgent = this.agents.find((a) => a.role === 'leader');
    if (!leadAgent) {
      // No leader to notify — kill process and mark failed, keep the slot
      // 1. Kill the crashed process
      if (agent.conversationId) {
        this.workerTaskManager.kill(agent.conversationId);
      }

      // 2. Clear wake locks to prevent deadlock on next wake
      const timeoutHandle = this.wakeTimeouts.get(agent.slotId);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.wakeTimeouts.delete(agent.slotId);
      }
      this.activeWakes.delete(agent.slotId);

      // 3. Mark as failed (frontend shows error status, tab stays)
      this.setStatus(agent.slotId, 'failed', errorMessage.slice(0, 200));
      return;
    }

    const testament =
      `[System] Member "${agent.agentName}" (${agent.conversationType}) crashed. ` +
      `Error: ${errorMessage}. ` +
      `The member slot is preserved and can be recovered if needed.`;

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

    // 2. Kill the crashed process (clean up residual child process + remove from taskList cache)
    if (agent.conversationId) {
      this.workerTaskManager.kill(agent.conversationId);
    }

    // 3. Clear wake locks to prevent deadlock on next wake
    const timeoutHandle = this.wakeTimeouts.get(agent.slotId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.wakeTimeouts.delete(agent.slotId);
    }
    this.activeWakes.delete(agent.slotId);

    // 4. Mark as failed (frontend shows error status, tab stays)
    this.setStatus(agent.slotId, 'failed', errorMessage.slice(0, 200));

    // 5. Wake leader to process the testament
    void this.wake(leadAgent.slotId);
  }

  /** Remove an agent: kill process, cancel pending wake, clear buffers, remove from in-memory list.
   *  Leader cannot be removed — callers must not pass leader's slotId. */
  removeAgent(slotId: string): void {
    const agent = this.agents.find((a) => a.slotId === slotId);
    if (!agent) return;

    if (agent.role === 'leader') {
      console.warn(`[TeammateManager] Attempted to remove leader ${slotId} — blocked.`);
      return;
    }

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
