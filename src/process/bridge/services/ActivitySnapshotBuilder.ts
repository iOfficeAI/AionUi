/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentActivityState,
  IExtensionAgentActivityEvent,
  IExtensionAgentActivityItem,
  IExtensionAgentActivitySnapshot,
} from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

const STATUS_TO_SYNCING = new Set(['connecting', 'connected', 'authenticated']);

const normalizeRuntimeStatus = (status?: string): 'pending' | 'running' | 'finished' | 'unknown' => {
  if (status === 'pending' || status === 'running' || status === 'finished') return status;
  return 'unknown';
};

const mapStatusToState = (
  runtimeStatus: 'pending' | 'running' | 'finished' | 'unknown',
  lastStatus?: string,
  recentEvents: IExtensionAgentActivityEvent[] = []
): AgentActivityState => {
  if (lastStatus === 'error' || recentEvents.some((e) => /error|失败|异常/i.test(e.text))) return 'error';

  const hasWriteEvent = recentEvents.some((e) => /write|patch|edit|写入|修改|生成文件/i.test(e.text));
  const hasResearchEvent = recentEvents.some((e) => /search|web|fetch|crawl|调研|检索|搜索/i.test(e.text));
  const hasToolEvent = recentEvents.some((e) => e.kind === 'tool');

  if (runtimeStatus === 'pending' || (lastStatus && STATUS_TO_SYNCING.has(lastStatus))) return 'syncing';
  if (runtimeStatus === 'running' && hasWriteEvent) return 'writing';
  if (runtimeStatus === 'running' && hasResearchEvent) return 'researching';
  if (runtimeStatus === 'running' && hasToolEvent) return 'executing';
  return 'idle';
};

const resolveAgentIdentity = (conversation: TChatConversation): { backend: string; agentName: string } => {
  if (conversation.type === 'acp') {
    const backend = String(conversation.extra?.backend || 'acp');
    const agentName = String(conversation.extra?.agentName || backend);
    return { backend, agentName };
  }
  if (conversation.type === 'codex') {
    return { backend: 'codex', agentName: 'Codex' };
  }
  if (conversation.type === 'gemini') {
    return { backend: 'gemini', agentName: 'Gemini' };
  }
  if (conversation.type === 'openclaw-gateway') {
    const backend = String(conversation.extra?.backend || 'openclaw');
    const agentName = String(conversation.extra?.agentName || 'OpenClaw');
    return { backend, agentName };
  }
  return { backend: 'nanobot', agentName: 'NanoBot' };
};

const toEventText = (message: TMessage): { kind: 'status' | 'tool' | 'message'; text: string; at: number } | null => {
  const at = Number(message.createdAt || Date.now());
  if (message.type === 'agent_status') {
    const content = (message.content || {}) as { status?: string };
    return { kind: 'status', text: `状态: ${String(content.status || 'unknown')}`, at };
  }

  if (
    message.type === 'tool_call' ||
    message.type === 'acp_tool_call' ||
    message.type === 'codex_tool_call' ||
    message.type === 'tool_group'
  ) {
    return { kind: 'tool', text: '工具执行中', at };
  }

  if (message.type === 'text' && message.position === 'left') {
    const content = message.content as { content?: string };
    const text = String(content?.content || '').trim();
    if (!text) return null;
    return { kind: 'message', text: text.slice(0, 80), at };
  }

  return null;
};

const rankedState: Record<AgentActivityState, number> = {
  error: 5,
  writing: 4,
  researching: 3,
  executing: 2,
  syncing: 1,
  idle: 0,
};

export class ActivitySnapshotBuilder {
  constructor(
    private readonly repo: IConversationRepository,
    private readonly taskManager: IWorkerTaskManager
  ) {}

  build(): IExtensionAgentActivitySnapshot {
    const conversations = this.repo
      .getUserConversations(undefined, 0, 10000)
      .data.filter((conv) => !conv.extra?.isHealthCheck);

    const byAgent = new Map<string, IExtensionAgentActivityItem>();
    let runningConversations = 0;

    for (const conversation of conversations) {
      const { backend, agentName } = resolveAgentIdentity(conversation);
      const task = this.taskManager.getTask(conversation.id);
      const runtimeStatus = normalizeRuntimeStatus(task?.status || conversation.status);
      if (runtimeStatus === 'running' || runtimeStatus === 'pending') {
        runningConversations += 1;
      }

      const recentMessages = this.repo.getMessages(conversation.id, 0, 20, 'DESC').data;
      const events = recentMessages
        .map((m) => toEventText(m))
        .filter((e): e is { kind: 'status' | 'tool' | 'message'; text: string; at: number } => Boolean(e))
        .slice(0, 6)
        .map(
          (e): IExtensionAgentActivityEvent => ({
            conversationId: conversation.id,
            kind: e.kind,
            text: e.text,
            at: e.at,
          })
        );

      const lastStatus = recentMessages.find((m) => m.type === 'agent_status')?.content as
        | { status?: string }
        | undefined;
      const state = mapStatusToState(runtimeStatus, lastStatus?.status, events);

      const key = `${backend}::${agentName}`;
      const existing = byAgent.get(key);
      const latestEventAt = events[0]?.at || conversation.modifyTime || Date.now();

      if (!existing) {
        byAgent.set(key, {
          id: key,
          backend,
          agentName,
          state,
          runtimeStatus,
          conversations: 1,
          activeConversations: runtimeStatus === 'running' || runtimeStatus === 'pending' ? 1 : 0,
          lastActiveAt: latestEventAt,
          lastStatus: lastStatus?.status,
          currentTask: events[0]?.text || (runtimeStatus === 'running' ? '执行中' : '空闲'),
          recentEvents: events,
        });
        continue;
      }

      existing.conversations += 1;
      if (runtimeStatus === 'running' || runtimeStatus === 'pending') {
        existing.activeConversations += 1;
      }
      if (latestEventAt > existing.lastActiveAt) {
        existing.lastActiveAt = latestEventAt;
        existing.currentTask = events[0]?.text || existing.currentTask;
        existing.lastStatus = lastStatus?.status || existing.lastStatus;
      }

      if (runtimeStatus === 'running') {
        existing.runtimeStatus = 'running';
      } else if (runtimeStatus === 'pending' && existing.runtimeStatus !== 'running') {
        existing.runtimeStatus = 'pending';
      } else if (runtimeStatus === 'finished' && existing.runtimeStatus === 'unknown') {
        existing.runtimeStatus = 'finished';
      }

      if (rankedState[state] > rankedState[existing.state]) {
        existing.state = state;
      }

      existing.recentEvents = [...existing.recentEvents, ...events].toSorted((a, b) => b.at - a.at).slice(0, 6);
    }

    return {
      generatedAt: Date.now(),
      totalConversations: conversations.length,
      runningConversations,
      agents: Array.from(byAgent.values()).toSorted((a, b) => b.lastActiveAt - a.lastActiveAt),
    };
  }
}
