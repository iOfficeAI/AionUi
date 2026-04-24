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
  team_id: string;
  agents: TeamAgent[];
  mailbox: Mailbox;
  workerTaskManager: IWorkerTaskManager;
  hasMcpTools?: boolean;
  teamWorkspace?: string;
  /** Called after an agent is removed from in-memory list, so the caller can persist the change (e.g. update DB) */
  onAgentRemoved?: (team_id: string, agents: TeamAgent[]) => void;
};

/**
 * Core orchestration engine that manages teammate state machines
 * and coordinates agent communication via mailbox and task board.
 */
export class TeammateManager extends EventEmitter {
  private readonly team_id: string;
  private agents: TeamAgent[];
  private readonly mailbox: Mailbox;
  private readonly workerTaskManager: IWorkerTaskManager;
  private readonly onAgentRemovedFn?: (team_id: string, agents: TeamAgent[]) => void;
  /** Shared team workspace path (leader's working directory) */
  private readonly teamWorkspace: string | undefined;

  /** Tracks which slot_ids currently have an in-progress wake to avoid loops */
  private readonly activeWakes = new Set<string>();
  /** Timeout handles for active wakes, keyed by slot_id */
  private readonly wakeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** O(1) lookup set of conversation_ids owned by this team, for fast IPC event filtering */
  private readonly ownedConversationIds = new Set<string>();
  /** Tracks conversation_ids whose turn has already been finalized, to prevent double processing */
  private readonly finalizedTurns = new Set<string>();
  /** Maps slot_id → original name before rename, for "formerly: X" hints in prompts */
  private readonly renamedAgents = new Map<string, string>();

  /** Maximum time (ms) to wait for a turnCompleted event before force-releasing a wake */
  private static readonly WAKE_TIMEOUT_MS = 60 * 1000;

  private readonly unsubResponseStream: () => void;

  constructor(params: TeammateManagerParams) {
    super();
    this.team_id = params.team_id;
    this.agents = [...params.agents];
    this.mailbox = params.mailbox;
    this.workerTaskManager = params.workerTaskManager;
    this.onAgentRemovedFn = params.onAgentRemoved;
    this.teamWorkspace = params.teamWorkspace;

    for (const agent of this.agents) {
      this.ownedConversationIds.add(agent.conversation_id);
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
    this.ownedConversationIds.add(agent.conversation_id);
    // Notify renderer so it can refresh team data (tabs, status, etc.)
    ipcBridge.team.agentSpawned.emit({ team_id: this.team_id, agent });
  }

  /**
   * Wake an agent: read unread mailbox, build payload, send to agent.
   * Sets status to 'active' during API call, 'idle' when done.
   * Skips if the agent's wake is already in progress.
   */
  async wake(slot_id: string): Promise<void> {
    if (this.activeWakes.has(slot_id)) {
      console.debug(`[TeammateManager] wake(${slot_id}): SKIPPED (activeWakes)`);
      return;
    }

    const agent = this.agents.find((a) => a.slot_id === slot_id);
    if (!agent) return;

    console.log(`[TeammateManager] wake(${agent.agent_name}): status=${agent.status}, proceeding`);

    this.activeWakes.add(slot_id);
    // Clear any stale finalizedTurns entry so a re-woken agent's finish event
    // is not silently dropped by the 5-second dedup window from a prior turn.
    if (agent.conversation_id) {
      this.finalizedTurns.delete(agent.conversation_id);
    }
    try {
      // Determine if this is the first activation or a crash recovery —
      // these need the full role prompt with static instructions.
      // Subsequent wakes only need a lightweight status update.
      const needsFullPrompt = agent.status === 'pending' || agent.status === 'failed';

      // Transition pending -> idle on first activation
      if (agent.status === 'pending') {
        this.setStatus(slot_id, 'idle');
      }

      this.setStatus(slot_id, 'active');

      const mailboxMessages = await this.mailbox.readUnread(this.team_id, slot_id);
      const teammates = this.agents.filter((a) => a.slot_id !== slot_id);

      // Write each mailbox message into agent's conversation as user bubble
      // so the UI shows what triggered this agent's response.
      // Skip for leader: messages are included in the prompt sent to the agent.
      if (agent.conversation_id && mailboxMessages.length > 0 && agent.role !== 'leader') {
        for (const msg of mailboxMessages) {
          // Skip user messages — already written by TeamSession.sendMessage()
          if (msg.fromAgentId === 'user') continue;
          const sender = this.agents.find((a) => a.slot_id === msg.fromAgentId);
          const senderName = msg.fromAgentId === 'user' ? 'User' : (sender?.agent_name ?? msg.fromAgentId);
          const displayContent = mailboxMessages.length > 1 ? `[${senderName}] ${msg.content}` : msg.content;
          const msgId = crypto.randomUUID();
          // All messages written to target conversation are incoming from target's perspective
          const teammateMsg = {
            id: msgId,
            msg_id: msgId,
            type: 'text' as const,
            position: 'left' as const,
            conversation_id: agent.conversation_id,
            content: {
              content: displayContent,
              teammateMessage: true,
              senderName,
              senderAgentType: sender?.agent_type,
              senderConversationId: sender?.conversation_id,
            },
            created_at: Date.now(),
          };
          addMessage(agent.conversation_id, teammateMsg);
          ipcBridge.acpConversation.responseStream.emit({
            type: 'teammate_message',
            conversation_id: agent.conversation_id,
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
        // Compute availableAgentTypes + availableAssistants only for leader's first prompt
        let availableAgentTypes: Array<{ type: string; name: string }> | undefined;
        let availableAssistants:
          | Array<{ custom_agent_id: string; name: string; backend: string; description?: string; skills?: string[] }>
          | undefined;
        if (agent.role === 'leader') {
          const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
          availableAgentTypes = agentRegistry
            .getDetectedAgents()
            .filter((a) => isTeamCapableBackend(a.backend, cachedInitResults))
            .map((a) => ({
              type: a.backend,
              name: a.name,
            }));

          const assistants = await ipcBridge.assistants.list
            .invoke()
            .catch((): import('@/common/types/assistantTypes').Assistant[] => []);
          availableAssistants = assistants
            .filter((a) => a.enabled !== false)
            .map((a) => ({
              custom_agent_id: a.id,
              name: a.name,
              backend: a.presetAgentType || 'gemini',
              description: a.description,
              skills: a.enabledSkills,
            }))
            .filter((a) => isTeamCapableBackend(a.backend, cachedInitResults));
        }

        const staticPrompt = buildRolePrompt({
          agent,
          teammates,
          availableAgentTypes,
          availableAssistants,
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
          this.setStatus(slot_id, 'idle');
          this.activeWakes.delete(slot_id);
          return;
        }
        message = formatMessages(mailboxMessages, this.agents);
      }

      console.log(
        `[TeammateManager] wake(${agent.agent_name}): sendPrompt type=${needsFullPrompt ? 'full' : 'messages-only'}, length=${message.length}, preview=${JSON.stringify(message.slice(0, 200))}`
      );

      const agentTask = await this.workerTaskManager.getOrBuildTask(agent.conversation_id);
      const msgId = crypto.randomUUID();

      // Extract files from user messages in this batch
      const userFiles = mailboxMessages
        .filter((m) => m.fromAgentId === 'user' && m.files?.length)
        .flatMap((m) => m.files!);

      // Each AgentManager implementation expects a specific object shape.
      // Gemini uses { input, msg_id }, all others use { content, msg_id }.
      const messageData =
        agent.conversation_type === 'gemini'
          ? { input: message, msg_id: msgId, silent: true, ...(userFiles.length > 0 ? { files: userFiles } : {}) }
          : { content: message, msg_id: msgId, silent: true, ...(userFiles.length > 0 ? { files: userFiles } : {}) };

      await agentTask.sendMessage(messageData);

      // Release wake lock immediately after message is sent.
      // finalizeTurn will also delete it (safe no-op). This prevents permanent
      // deadlock when finish events are lost or finalizeTurn never fires.
      this.activeWakes.delete(slot_id);

      // Arm the inactivity watchdog. Any streaming output from this agent
      // resets it via handleResponseStream → resetWakeTimeout. It only fires
      // when the agent has been silent for WAKE_TIMEOUT_MS with no finish event.
      this.resetWakeTimeout(slot_id);
    } catch (error) {
      console.error(`[TeammateManager] wake(${slot_id}) failed:`, error);
      this.setStatus(slot_id, 'failed');
      this.activeWakes.delete(slot_id);
      throw error;
    }
    // activeWakes entry is removed when turnCompleted fires (or by timeout)
  }

  /** Set agent status, update the local agents array, and emit IPC event */
  setStatus(slot_id: string, status: TeammateStatus, last_message?: string): void {
    this.agents = this.agents.map((a) => (a.slot_id === slot_id ? { ...a, status } : a));
    ipcBridge.team.agentStatusChanged.emit({ team_id: this.team_id, slot_id, status, last_message });
    this.emit('agentStatusChanged', { team_id: this.team_id, slot_id, status, last_message });
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

    const agent = this.agents.find((a) => a.conversation_id === msg.conversation_id);
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
        this.setStatus(agent.slot_id, 'failed', errorText.slice(0, 200));
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
    if (agent.status === 'active' && this.wakeTimeouts.has(agent.slot_id)) {
      this.resetWakeTimeout(agent.slot_id);
    }
  }

  /**
   * (Re)arm the inactivity watchdog for an agent's current wake.
   * Fired from wake() after dispatching the prompt, and from handleResponseStream
   * whenever fresh streaming activity arrives. When it finally fires (agent silent
   * for WAKE_TIMEOUT_MS), escalates to handleInactivityTimeout so the leader learns
   * about the stall instead of the agent dropping silently to idle.
   */
  private resetWakeTimeout(slot_id: string): void {
    const existing = this.wakeTimeouts.get(slot_id);
    if (existing) clearTimeout(existing);

    const timeoutHandle = setTimeout(() => {
      this.wakeTimeouts.delete(slot_id);
      const currentAgent = this.agents.find((a) => a.slot_id === slot_id);
      if (currentAgent?.status === 'active') {
        void this.handleInactivityTimeout(currentAgent);
      }
    }, TeammateManager.WAKE_TIMEOUT_MS);
    this.wakeTimeouts.set(slot_id, timeoutHandle);
  }

  /**
   * A teammate went silent for WAKE_TIMEOUT_MS with no streaming activity and no
   * finish event. Treat it as a soft failure: mark the agent 'failed' (not 'idle',
   * which hides the problem), write an explanatory message into the leader's mailbox,
   * and wake the leader so it can decide the next move (retry, replace, escalate).
   *
   * Previously the timeout just setStatus(slot_id, 'idle'), which left the leader
   * unaware — it would eventually re-wake on some other signal and guess that
   * the teammate was "空转" (idle) with no concrete evidence.
   */
  private async handleInactivityTimeout(agent: TeamAgent): Promise<void> {
    const timeoutSeconds = Math.floor(TeammateManager.WAKE_TIMEOUT_MS / 1000);
    const reason = `stopped responding after ${timeoutSeconds}s without sending any update`;

    console.warn(`[TeammateManager] ${agent.agent_name} (${agent.slot_id}) ${reason}`);
    this.setStatus(agent.slot_id, 'failed', reason);

    // Don't escalate to leader if the stuck agent IS the leader — nobody to notify.
    if (agent.role === 'leader') return;

    const leadAgent = this.agents.find((a) => a.role === 'leader');
    if (!leadAgent) return;

    try {
      await this.mailbox.write({
        team_id: this.team_id,
        toAgentId: leadAgent.slot_id,
        fromAgentId: agent.slot_id,
        type: 'idle_notification',
        content:
          `Teammate ${agent.agent_name} (${agent.agent_type}) ${reason}. ` +
          `Their session may be stuck or the model may be generating an overlong silent turn. ` +
          `Decide whether to retry by sending them a fresh message, replace them with another agent, or continue without them.`,
      });
      await this.wake(leadAgent.slot_id);
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
  private async finalizeTurn(conversation_id: string): Promise<void> {
    // Dedup: skip if this turn was already finalized
    if (this.finalizedTurns.has(conversation_id)) return;
    this.finalizedTurns.add(conversation_id);
    // Clean up the dedup entry after a short delay so future turns can be processed
    setTimeout(() => this.finalizedTurns.delete(conversation_id), 5000);

    const agent = this.agents.find((a) => a.conversation_id === conversation_id);
    if (!agent) return;

    this.activeWakes.delete(agent.slot_id);

    // Clear the wake timeout since the turn completed normally
    const timeoutHandle = this.wakeTimeouts.get(agent.slot_id);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.wakeTimeouts.delete(agent.slot_id);
    }

    if (agent.status === 'active') {
      this.setStatus(agent.slot_id, 'idle');
    }

    // Auto-send idle notification to leader.
    // Must run AFTER setStatus(idle) so maybeWakeLeaderWhenAllIdle sees the updated state.
    if (agent.role !== 'leader') {
      const leadAgent = this.agents.find((a) => a.role === 'leader');
      if (leadAgent && leadAgent.slot_id !== agent.slot_id) {
        await this.mailbox.write({
          team_id: this.team_id,
          toAgentId: leadAgent.slot_id,
          fromAgentId: agent.slot_id,
          content: 'Turn completed',
          type: 'idle_notification',
        });
        // Only wake leader when ALL non-leader teammates are idle/completed/failed/pending.
        // This prevents death loops where each idle notification triggers a new leader turn.
        this.maybeWakeLeaderWhenAllIdle(leadAgent.slot_id);
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
      `[TeammateManager] maybeWakeLeaderWhenAllIdle: ${nonLeadAgents.map((a) => `${a.agent_name}:${a.status}`).join(', ')} → ${allSettled ? 'WAKE' : 'SKIP'}`
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
        `[TeammateManager] Leader ${agent.slot_id} (${agent.agent_name}) crashed: ${errorMessage}. Marked as failed (not removed).`
      );

      // Kill the crashed process (clean up residual child process)
      if (agent.conversation_id) {
        this.workerTaskManager.kill(agent.conversation_id);
      }

      // Clear wake locks to prevent future wake() calls from being permanently skipped
      const timeoutHandle = this.wakeTimeouts.get(agent.slot_id);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.wakeTimeouts.delete(agent.slot_id);
      }
      this.activeWakes.delete(agent.slot_id);

      this.setStatus(agent.slot_id, 'failed', errorMessage.slice(0, 200));
      return;
    }

    const leadAgent = this.agents.find((a) => a.role === 'leader');
    if (!leadAgent) {
      // No leader to notify — kill process and mark failed, keep the slot
      // 1. Kill the crashed process
      if (agent.conversation_id) {
        this.workerTaskManager.kill(agent.conversation_id);
      }

      // 2. Clear wake locks to prevent deadlock on next wake
      const timeoutHandle = this.wakeTimeouts.get(agent.slot_id);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.wakeTimeouts.delete(agent.slot_id);
      }
      this.activeWakes.delete(agent.slot_id);

      // 3. Mark as failed (frontend shows error status, tab stays)
      this.setStatus(agent.slot_id, 'failed', errorMessage.slice(0, 200));
      return;
    }

    const testament =
      `[System] Member "${agent.agent_name}" (${agent.conversation_type}) crashed. ` +
      `Error: ${errorMessage}. ` +
      `The member slot is preserved and can be recovered if needed.`;

    // 1. Write testament to leader's mailbox
    await this.mailbox.write({
      team_id: this.team_id,
      toAgentId: leadAgent.slot_id,
      fromAgentId: agent.slot_id,
      content: testament,
      type: 'message',
      summary: `${agent.agent_name} crashed`,
    });

    console.warn(
      `[TeammateManager] Agent ${agent.slot_id} (${agent.agent_name}) crashed: ${errorMessage}. Testament sent to leader.`
    );

    // 2. Kill the crashed process (clean up residual child process + remove from taskList cache)
    if (agent.conversation_id) {
      this.workerTaskManager.kill(agent.conversation_id);
    }

    // 3. Clear wake locks to prevent deadlock on next wake
    const timeoutHandle = this.wakeTimeouts.get(agent.slot_id);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.wakeTimeouts.delete(agent.slot_id);
    }
    this.activeWakes.delete(agent.slot_id);

    // 4. Mark as failed (frontend shows error status, tab stays)
    this.setStatus(agent.slot_id, 'failed', errorMessage.slice(0, 200));

    // 5. Wake leader to process the testament
    void this.wake(leadAgent.slot_id);
  }

  /** Remove an agent: kill process, cancel pending wake, clear buffers, remove from in-memory list.
   *  Leader cannot be removed — callers must not pass leader's slot_id. */
  removeAgent(slot_id: string): void {
    const agent = this.agents.find((a) => a.slot_id === slot_id);
    if (!agent) return;

    if (agent.role === 'leader') {
      console.warn(`[TeammateManager] Attempted to remove leader ${slot_id} — blocked.`);
      return;
    }

    // Kill the underlying ACP process
    if (agent.conversation_id) {
      this.workerTaskManager.kill(agent.conversation_id);
    }

    // Cancel any pending wake timeout
    const timeoutHandle = this.wakeTimeouts.get(slot_id);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.wakeTimeouts.delete(slot_id);
    }
    this.activeWakes.delete(slot_id);

    // Clean up owned conversation tracking
    if (agent.conversation_id) {
      this.ownedConversationIds.delete(agent.conversation_id);
      this.finalizedTurns.delete(agent.conversation_id);
    }

    this.agents = this.agents.filter((a) => a.slot_id !== slot_id);
    console.log(`[TeammateManager] Agent ${slot_id} (${agent.agent_name}) removed`);
    ipcBridge.team.agentRemoved.emit({ team_id: this.team_id, slot_id });

    // Notify upper layer to persist the removal (e.g. update DB)
    this.onAgentRemovedFn?.(this.team_id, this.agents);
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
  renameAgent(slot_id: string, new_name: string): void {
    const trimmed = new_name.trim();
    if (!trimmed) throw new Error('Agent name cannot be empty');

    const agent = this.agents.find((a) => a.slot_id === slot_id);
    if (!agent) throw new Error(`Agent "${slot_id}" not found`);

    const needle = TeammateManager.normalize(trimmed);
    const duplicate = this.agents.find(
      (a) => a.slot_id !== slot_id && TeammateManager.normalize(a.agent_name) === needle
    );
    if (duplicate) throw new Error(`Agent name "${trimmed}" is already taken by ${duplicate.slot_id}`);

    const old_name = agent.agent_name;
    // Only store the very first original name so multiple renames show the original
    if (!this.renamedAgents.has(slot_id)) {
      this.renamedAgents.set(slot_id, old_name);
    }
    this.agents = this.agents.map((a) => (a.slot_id === slot_id ? { ...a, agent_name: trimmed } : a));
    console.log(`[TeammateManager] Agent ${slot_id} renamed: "${old_name}" → "${trimmed}"`);
    ipcBridge.team.agentRenamed.emit({ team_id: this.team_id, slot_id, old_name, new_name: trimmed });
  }
}
