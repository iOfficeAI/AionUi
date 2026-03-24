/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { IAgentTeamMember } from '@/common/config/storage';
import type { AgentTeamDispatchPolicy } from '@/common/config/storage';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { CoordFileWatcher } from './CoordFileWatcher';
import type { ICoordTimelineEntry } from './types';

type MemberState = {
  member: IAgentTeamMember;
  busy: boolean;
  pendingMessages: ICoordTimelineEntry[];
  cursorLine: number;
  lastConsensusSignature?: string;
};

/**
 * Dispatches coord messages to team member agents.
 * Watches messages.jsonl, routes new messages to the correct member,
 * and enforces busy gate + per-member queue.
 */
export class CoordDispatcher {
  private watcher: CoordFileWatcher;
  private memberStates = new Map<string, MemberState>();
  private busyPollTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(
    private readonly coordDir: string,
    private readonly members: IAgentTeamMember[],
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly dispatchPolicy: AgentTeamDispatchPolicy,
    private readonly onConsensusReached?: () => void,
    private readonly onTimelineUpdate?: (entries: ICoordTimelineEntry[]) => void,
  ) {
    this.watcher = new CoordFileWatcher(coordDir);

    for (const member of members) {
      this.memberStates.set(member.conversationId, {
        member,
        busy: false,
        pendingMessages: [],
        cursorLine: 0,
      });
    }
  }

  /** Start watching and dispatching */
  start(): void {
    if (this.destroyed) return;

    this.watcher.start((newMessages) => {
      // Emit live timeline updates for all new coord lines (including agent-written)
      this.onTimelineUpdate?.(newMessages);
      this.handleNewMessages(newMessages);
    });
  }

  /** Stop dispatching and clean up */
  stop(): void {
    this.destroyed = true;
    this.watcher.stop();
    if (this.busyPollTimer) {
      clearInterval(this.busyPollTimer);
      this.busyPollTimer = null;
    }
    this.memberStates.clear();
  }

  private handleNewMessages(messages: ICoordTimelineEntry[]): void {
    for (const msg of messages) {
      // Determine target members
      const targets = this.resolveTargets(msg);

      for (const conversationId of targets) {
        const state = this.memberStates.get(conversationId);
        if (!state) continue;

        // Skip messages from this member itself
        if (msg.from === state.member.memberId || msg.from === state.member.name) {
          continue;
        }

        if (state.busy) {
          this.enqueuePendingMessage(state, msg);
        } else {
          this.dispatchToMember(state, msg);
        }
      }
    }
  }

  private resolveTargets(msg: ICoordTimelineEntry): string[] {
    // User messages always wake all members
    if (msg.role === 'user') {
      return Array.from(this.memberStates.keys());
    }

    // Respect dispatch field
    const dispatch = msg.dispatch || 'all';

    if (dispatch === 'none') {
      return [];
    }

    if (dispatch === 'targets' && msg.to && msg.to.length > 0) {
      // Resolve target identities to conversationIds
      const targets: string[] = [];
      for (const target of msg.to) {
        if (target === '*') {
          return Array.from(this.memberStates.keys());
        }
        if (target === 'user') {
          continue;
        }
        // Match by conversationId, memberId, or member name
        for (const state of this.memberStates.values()) {
          if (
            state.member.conversationId === target ||
            state.member.memberId === target ||
            state.member.name === target
          ) {
            targets.push(state.member.conversationId);
          }
        }
      }
      return targets;
    }

    // dispatch=all or unset: broadcast to all members
    return Array.from(this.memberStates.keys());
  }

  private async dispatchToMember(state: MemberState, msg: ICoordTimelineEntry): Promise<void> {
    state.busy = true;
    this.ensureBusyPolling();

    const coordText = msg.from === 'coord-dispatcher' && msg.body ? msg.body : this.buildWakeupMessage(state, [msg]);

    try {
      const task = await this.workerTaskManager.getOrBuildTask(state.member.conversationId);
      await task.sendMessage({
        input: coordText,
        content: coordText,
        msg_id: uuid(),
        files: msg.files || [],
      });
    } catch (err) {
      console.error(`[CoordDispatcher] Failed to dispatch to ${state.member.name}:`, err);
      state.busy = false;
      this.syncBusyPolling();
    }
  }

  private enqueuePendingMessage(state: MemberState, msg: ICoordTimelineEntry): void {
    const shouldPrioritize =
      this.dispatchPolicy === 'interrupt' ||
      (this.dispatchPolicy === 'user-priority' && (msg.role === 'user' || msg.type === 'consensus'));

    if (shouldPrioritize) {
      state.pendingMessages.unshift(msg);
      return;
    }

    state.pendingMessages.push(msg);
  }

  private refreshBusyStates(): void {
    let hasBusyMembers = false;

    for (const state of this.memberStates.values()) {
      if (!state.busy) {
        continue;
      }

      const task = this.workerTaskManager.getTask(state.member.conversationId);
      const isStillBusy = task && (task.status === 'pending' || task.status === 'running');
      if (isStillBusy) {
        hasBusyMembers = true;
        continue;
      }

      if (!isStillBusy) {
        state.busy = false;
        this.drainQueue(state);
        this.enforceConsensusIfNeeded(state);
      }
    }

    if (!hasBusyMembers && !this.hasBusyMembers()) {
      this.stopBusyPolling();
    }
  }

  private drainQueue(state: MemberState): void {
    if (state.pendingMessages.length === 0) return;

    // Batch pending messages into a single dispatch
    const pending = state.pendingMessages.splice(0);
    const batchText = this.buildWakeupMessage(state, pending);

    const batchMsg: ICoordTimelineEntry = {
      id: `batch-${uuid()}`,
      ts: new Date().toISOString(),
      from: 'coord-dispatcher',
      role: 'system',
      type: 'update',
      summary: `${pending.length} queued coord messages`,
      body: batchText,
    };

    this.dispatchToMember(state, batchMsg);
  }

  private enforceConsensusIfNeeded(state: MemberState): void {
    if (state.pendingMessages.length > 0) return;

    const timeline = this.watcher.readAll();
    const consensusIndex = [...timeline]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => entry.type === 'consensus')?.index;

    if (consensusIndex === undefined) {
      state.lastConsensusSignature = undefined;
      return;
    }

    const consensusWindow = timeline.slice(consensusIndex);
    const decisionIndexInWindow = [...consensusWindow]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => entry.type === 'decision' || entry.type === 'conclusion')?.index;

    const decisionWindow = decisionIndexInWindow === undefined ? [] : consensusWindow.slice(decisionIndexInWindow);
    const finalDecisionId = decisionWindow[0]?.id;
    // Only count ACKs whose reply_to matches the final decision (strict protocol requirement)
    const ackFroms = new Set(
      decisionWindow
        .filter((entry) => entry.type === 'ack' && finalDecisionId && entry.reply_to === finalDecisionId)
        .map((entry) => entry.from),
    );

    const missingMembers = Array.from(this.memberStates.values()).filter(({ member }) => {
      return ![member.memberId, member.name, member.conversationId].some((identity) => ackFroms.has(identity));
    });

    if (missingMembers.length === 0) {
      state.lastConsensusSignature = undefined;
      this.onConsensusReached?.();
      return;
    }

    const signature = `${decisionWindow[0]?.id || 'no-decision'}:${missingMembers.map((member) => member.member.memberId).sort().join(',')}`;
    if (state.lastConsensusSignature === signature) {
      return;
    }

    const isTargetMissing = missingMembers.some((memberState) => memberState.member.conversationId === state.member.conversationId);
    if (!isTargetMissing) {
      state.lastConsensusSignature = signature;
      return;
    }

    state.lastConsensusSignature = signature;
    const reminder: ICoordTimelineEntry = {
      id: `consensus-reminder-${uuid()}`,
      ts: new Date().toISOString(),
      from: 'coord-dispatcher',
      role: 'system',
      type: 'consensus-reminder',
      summary: `Consensus still pending. Missing ACK from ${missingMembers.map((member) => member.member.name).join(', ')}`,
      body:
        'Consensus has not been reached yet. Emit an explicit ack with --reply-to <final-decision-id> before ending.',
    };
    void this.dispatchToMember(state, reminder);
  }

  private hasBusyMembers(): boolean {
    return Array.from(this.memberStates.values()).some((state) => state.busy);
  }

  private ensureBusyPolling(): void {
    if (this.busyPollTimer) {
      return;
    }

    this.busyPollTimer = setInterval(() => {
      this.refreshBusyStates();
    }, 500);
  }

  private stopBusyPolling(): void {
    if (!this.busyPollTimer) {
      return;
    }

    clearInterval(this.busyPollTimer);
    this.busyPollTimer = null;
  }

  private syncBusyPolling(): void {
    if (this.hasBusyMembers()) {
      this.ensureBusyPolling();
      return;
    }

    this.stopBusyPolling();
  }

  private buildWakeupMessage(state: MemberState, messages: ICoordTimelineEntry[]): string {
    const topics = Array.from(
      new Set(
        messages
          .map((msg) => msg.topic)
          .filter((topic): topic is string => Boolean(topic)),
      ),
    );

    const summaryLines = messages
      .slice(-3)
      .map((msg) => `- ${msg.type} from=${msg.from}${msg.summary ? ` | ${msg.summary}` : ''}`);

    return [
      '[Internal Agent Team Wakeup]',
      'This is an internal scheduler notice, not a user-facing request.',
      'Do not echo or quote this wakeup text back into chat or coord.',
      `You have ${messages.length} unread coordination message(s).`,
      `Run now: python3 ${this.getRelCoordDir()}/scripts/coord_read.py --messages ${this.getRelCoordDir()}/messages.jsonl --state-dir ${this.getRelCoordDir()}/state --agent-id ${state.member.memberId}`,
      `Use ${this.getRelCoordDir()}/TEAM.md and ${this.getRelCoordDir()}/protocol.md as the source of truth.`,
      'After reading unread coord messages, continue work and write back only through coord_write.py.',
      'If you call coord_write.py, --summary is mandatory on every write, including when using --body or --body-file.',
      'If /consensus is active, do not end until you ACK the final decision with --reply-to <decision-id>.',
      topics.length > 0 ? `Recent topics: ${topics.join(', ')}` : '',
      summaryLines.length > 0 ? 'Recent unread summaries:' : '',
      ...summaryLines,
      ...this.getFileHints(messages),
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Get the relative coord directory path (e.g. .agents/teams/<teamId>/coord) */
  private getRelCoordDir(): string {
    // coordDir is absolute like /path/to/workspace/.agents/teams/<teamId>/coord
    // Extract from .agents onwards
    const idx = this.coordDir.indexOf('.agents');
    return idx >= 0 ? this.coordDir.slice(idx) : this.coordDir;
  }

  private getFileHints(messages: ICoordTimelineEntry[]): string[] {
    const allFiles = messages.flatMap((m) => m.files || []);
    if (allFiles.length === 0) return [];
    return [
      `Attached files (${allFiles.length}):`,
      ...allFiles.map((f) => `- ${f}`),
    ];
  }
}
