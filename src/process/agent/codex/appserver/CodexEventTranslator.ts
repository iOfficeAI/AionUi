/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { uuid } from '@/common/utils';
import { readCodexContextUsageMetrics } from './tokenUsageMetrics';
import type { CodexJsonRpcNotification, CodexTranslatedEvent } from './types';

type NativeToolCallStatus = 'pending' | 'executing' | 'success' | 'error' | 'canceled';

type NativeToolCallKind = 'execute' | 'patch' | 'mcp' | 'web_search';

type NativeToolCallContent = {
  type: 'text' | 'diff' | 'output';
  text?: string;
  output?: string;
  filePath?: string;
};

type NativeToolCallData = {
  toolCallId: string;
  agentCallId?: string;
  threadId?: string;
  status: NativeToolCallStatus;
  kind: NativeToolCallKind;
  subtype: string;
  title?: string;
  description: string;
  content?: NativeToolCallContent[];
  data?: unknown;
};

type CodexContextEventData = {
  event: 'compaction_started' | 'compaction_completed' | 'compaction_failed';
  status: 'running' | 'completed' | 'failed';
  threadId?: string;
  itemId: string;
};

type CodexAgentEventData = {
  callId: string;
  action: string;
  status: string;
  senderThreadId?: string;
  receiverThreadIds: string[];
  prompt?: string;
  model?: string;
  reasoningEffort?: string;
  agents: Array<{
    threadId: string;
    status?: string;
    message?: string;
    nickname?: string;
    role?: string;
  }>;
};

export class CodexEventTranslator {
  private currentTurnId: string | undefined;
  private readonly agentCallByThreadId = new Map<string, string>();
  private readonly agentToolByToolCallId = new Map<string, { callId: string; threadId: string }>();

  constructor(private readonly conversationId: string) {}

  translate(notification: CodexJsonRpcNotification): CodexTranslatedEvent[] {
    switch (notification.method) {
      case 'turn/started': {
        const params = asRecord(notification.params);
        this.currentTurnId = readString(params?.turnId) || readString(params?.threadId) || uuid();
        return [this.message('start', notification.params, false)];
      }
      case 'item/agentMessage/delta': {
        const params = asRecord(notification.params);
        const contentMessageId =
          readString(params?.itemId) || readString(params?.turnId) || this.currentTurnId || 'codex_content';
        const threadId = readString(params?.threadId);
        const callId = threadId ? this.agentCallByThreadId.get(threadId) : undefined;
        const content = readString(params?.delta) || '';

        if (callId && threadId) {
          return [
            this.message(
              'codex_agent_transcript',
              {
                callId,
                threadId,
                itemId: contentMessageId,
                content,
              },
              true,
              contentMessageId
            ),
          ];
        }

        return [this.message('content', { content }, true, contentMessageId)];
      }
      case 'item/reasoning/summaryTextDelta':
      case 'item/reasoning/textDelta': {
        const params = asRecord(notification.params);
        return [
          this.message(
            'thinking',
            { content: readString(params?.delta) || '', status: 'thinking' },
            true,
            readString(params?.itemId) || 'codex_reasoning'
          ),
        ];
      }
      case 'turn/plan/updated':
      case 'item/plan/delta': {
        const planMessage = normalizePlanMessage(notification.params);
        return [this.message('plan', planMessage.data, true, planMessage.msgId)];
      }
      case 'turn/diff/updated':
        return [
          this.message(
            'codex_tool_call',
            {
              toolCallId: 'turn_diff',
              status: 'success',
              kind: 'execute',
              subtype: 'turn_diff',
              description: 'Turn diff',
              data: normalizeTurnDiff(notification.params),
            },
            true,
            'turn_diff'
          ),
        ];
      case 'thread/tokenUsage/updated': {
        const tokenUsage = readCodexContextUsageMetrics(notification.params);
        return [this.message('acp_context_usage', { used: tokenUsage.used, size: tokenUsage.size }, false)];
      }
      case 'error':
        // Retry notifications are progress, not terminal failures. The final
        // turn/completed event is the single source of truth for turn errors.
        return [];
      case 'thread/status/changed':
      case 'mcpServer/startupStatus/updated':
        return [];
      case 'item/started':
      case 'item/completed': {
        const itemEvent = this.translateItemLifecycle(notification);
        if (itemEvent) return [itemEvent];
        return [];
      }
      case 'item/commandExecution/outputDelta': {
        const params = asRecord(notification.params);
        const toolCallId = readToolCallId(params, 'command');
        const agentTool = this.readAgentToolCall(params, toolCallId);
        const stream = readString(params?.stream) === 'stderr' ? 'stderr' : 'stdout';
        const delta = readString(params?.delta) || '';
        return [
          this.nativeToolCall({
            toolCallId,
            ...agentTool,
            status: 'executing',
            kind: 'execute',
            subtype: 'exec_command_output_delta',
            description: formatCommand(params?.command) || 'command',
            content: [{ type: 'output', output: delta }],
            data: {
              ...params,
              call_id: toolCallId,
              stream,
              chunk: delta,
            },
          }),
        ];
      }
      case 'item/fileChange/patchUpdated': {
        const params = asRecord(notification.params);
        const toolCallId = readToolCallId(params, 'file');
        const agentTool = this.readAgentToolCall(params, toolCallId);
        const patch = readString(params?.patch) || formatChanges(params?.changes);
        const filePath = readString(params?.filePath) || readString(params?.path);
        return [
          this.nativeToolCall({
            toolCallId,
            ...agentTool,
            status: 'executing',
            kind: 'patch',
            subtype: 'patch_apply_begin',
            description: filePath || 'File changes',
            content: patch ? [{ type: 'output', output: patch }] : undefined,
            data: {
              ...params,
              call_id: toolCallId,
              changes: normalizeFileChanges(params?.changes, filePath, patch),
            },
          }),
        ];
      }
      case 'turn/completed':
        this.currentTurnId = undefined;
        return [this.message('finish', notification.params, false)];
      case 'warning':
        return [
          this.message('agent_status', { backend: 'codex', status: 'error', warning: notification.params }, true),
        ];
      default:
        if (isCollaborationEvent(notification.method)) {
          return [this.collaborationEvent(notification)];
        }

        if (isMcpEvent(notification.method)) {
          return [this.genericNativeToolCall(notification, mcpSubtypeFromMethod(notification.method), 'mcp')];
        }

        if (isWebEvent(notification.method)) {
          return [this.genericNativeToolCall(notification, webSubtypeFromMethod(notification.method), 'web_search')];
        }

        return [];
    }
  }

  private translateItemLifecycle(notification: CodexJsonRpcNotification): CodexTranslatedEvent | undefined {
    const params = asRecord(notification.params);
    const item = asRecord(params?.item);
    const itemType = readString(item?.type);
    if (!itemType) return undefined;

    switch (itemType) {
      case 'contextCompaction':
        return this.contextCompactionItem(notification.method, params, item);
      case 'collabAgentToolCall':
        return this.collabAgentToolCallItem(item);
      case 'commandExecution':
        return this.commandExecutionItem(notification.method, params, item);
      case 'fileChange':
        return this.fileChangeItem(notification.method, params, item);
      case 'mcpToolCall':
        return this.mcpToolCallItem(notification.method, params, item);
      case 'webSearch':
        return this.webSearchItem(notification.method, params, item);
      default:
        return undefined;
    }
  }

  private contextCompactionItem(
    method: string,
    params: Record<string, unknown> | undefined,
    item: Record<string, unknown>
  ): CodexTranslatedEvent {
    const itemId = readString(item.id) || readString(params?.itemId) || 'codex_context_compaction';
    const status = statusFromCompactionLifecycle(method, item.status);
    const data: CodexContextEventData = {
      event:
        status === 'failed'
          ? 'compaction_failed'
          : status === 'completed'
            ? 'compaction_completed'
            : 'compaction_started',
      status,
      threadId: readString(params?.threadId),
      itemId,
    };

    return this.message('codex_context_event', data, true, itemId);
  }

  private collabAgentToolCallItem(item: Record<string, unknown>): CodexTranslatedEvent {
    const callId = readToolCallId(item, 'agent');
    const receiverThreadIds = readStringArray(item.receiverThreadIds || item.receiver_thread_ids);
    for (const threadId of receiverThreadIds) {
      this.agentCallByThreadId.set(threadId, callId);
    }
    const data: CodexAgentEventData = {
      callId,
      action: readString(item.tool) || 'unknown',
      status: normalizeAgentEventStatus(item.status),
      senderThreadId: readString(item.senderThreadId) || readString(item.sender_thread_id),
      receiverThreadIds,
      prompt: readString(item.prompt),
      model: readString(item.model),
      reasoningEffort: readString(item.reasoningEffort) || readString(item.reasoning_effort),
      agents: normalizeAgentStates(item.agentsStates || item.agents_states),
    };

    return this.message('codex_agent_event', data, true, callId);
  }

  private commandExecutionItem(
    method: string,
    params: Record<string, unknown> | undefined,
    item: Record<string, unknown>
  ): CodexTranslatedEvent {
    const toolCallId = readToolCallId(item, 'command');
    const agentTool = this.readAgentToolCall(params, toolCallId, item);
    const command = readStringArray(item.command);
    const cwd = readString(item.cwd) || '';
    const aggregatedOutput = readString(item.aggregatedOutput) || readString(item.aggregated_output) || '';
    const exitCode = readNumber(item.exitCode) ?? readNumber(item.exit_code);
    const isCompleted = method === 'item/completed';

    return this.nativeToolCall({
      toolCallId,
      ...agentTool,
      status: isCompleted ? statusFromItem(item.status) : 'executing',
      kind: 'execute',
      subtype: isCompleted ? 'exec_command_end' : 'exec_command_begin',
      description: formatCommand(command) || 'command',
      content: aggregatedOutput ? [{ type: 'output', output: aggregatedOutput }] : undefined,
      data: {
        ...item,
        call_id: toolCallId,
        command,
        cwd,
        aggregated_output: aggregatedOutput,
        ...(exitCode !== undefined ? { exit_code: exitCode } : {}),
        ...(readNumber(item.durationMs) !== undefined
          ? { duration: durationFromMs(readNumber(item.durationMs) || 0) }
          : {}),
      },
    });
  }

  private fileChangeItem(
    method: string,
    params: Record<string, unknown> | undefined,
    item: Record<string, unknown>
  ): CodexTranslatedEvent {
    const toolCallId = readToolCallId(item, 'file');
    const agentTool = this.readAgentToolCall(params, toolCallId, item);
    const isCompleted = method === 'item/completed';
    const changes = normalizeFileChanges(item.changes);
    return this.nativeToolCall({
      toolCallId,
      ...agentTool,
      status: isCompleted ? statusFromItem(item.status) : 'executing',
      kind: 'patch',
      subtype: isCompleted ? 'patch_apply_end' : 'patch_apply_begin',
      description: summarizeFileChange(changes) || 'File changes',
      content: formatChanges(item.changes) ? [{ type: 'output', output: formatChanges(item.changes) }] : undefined,
      data: {
        ...item,
        call_id: toolCallId,
        changes,
        success: statusFromItem(item.status) === 'success',
      },
    });
  }

  private mcpToolCallItem(
    method: string,
    params: Record<string, unknown> | undefined,
    item: Record<string, unknown>
  ): CodexTranslatedEvent {
    const toolCallId = readToolCallId(item, 'mcp');
    const agentTool = this.readAgentToolCall(params, toolCallId, item);
    const isCompleted = method === 'item/completed';
    const invocation = {
      server: readString(item.server),
      tool: readString(item.tool),
      arguments: asRecord(item.arguments),
    };
    const description = [invocation.server, invocation.tool].filter(Boolean).join(':') || 'MCP tool';

    return this.nativeToolCall({
      toolCallId,
      ...agentTool,
      status: isCompleted ? statusFromItem(item.status) : 'executing',
      kind: 'mcp',
      subtype: isCompleted ? 'mcp_tool_call_end' : 'mcp_tool_call_begin',
      description,
      data: {
        ...item,
        invocation,
        result: item.result,
        error: readString(item.error),
      },
    });
  }

  private webSearchItem(
    method: string,
    params: Record<string, unknown> | undefined,
    item: Record<string, unknown>
  ): CodexTranslatedEvent {
    const toolCallId = readToolCallId(item, 'web');
    const agentTool = this.readAgentToolCall(params, toolCallId, item);
    const isCompleted = method === 'item/completed';
    const query = readString(item.query) || 'web search';
    return this.nativeToolCall({
      toolCallId,
      ...agentTool,
      status: isCompleted ? statusFromItem(item.status) : 'executing',
      kind: 'web_search',
      subtype: isCompleted ? 'web_search_end' : 'web_search_begin',
      description: query,
      data: {
        ...item,
        call_id: toolCallId,
        query,
      },
    });
  }

  private message(type: string, data: unknown, persist: boolean, msgId = uuid()): CodexTranslatedEvent {
    const message: IResponseMessage = {
      type,
      msg_id: msgId,
      conversation_id: this.conversationId,
      data,
    };
    return { kind: 'message', message, persist };
  }

  private genericNativeToolCall(
    notification: CodexJsonRpcNotification,
    subtype: string,
    kind: NativeToolCallKind
  ): CodexTranslatedEvent {
    const params = asRecord(notification.params);
    const toolCallId = readToolCallId(params, kind);
    const agentTool = this.readAgentToolCall(params, toolCallId);
    return this.nativeToolCall({
      toolCallId,
      ...agentTool,
      status: statusFromMethod(notification.method),
      kind,
      subtype,
      description: describeNativeTool(params, notification.method),
      data: notification.params,
    });
  }

  private collaborationEvent(notification: CodexJsonRpcNotification): CodexTranslatedEvent {
    const params = asRecord(notification.params);
    const toolCallId = readToolCallId(params, 'collab');
    const label = readString(params?.label) || readString(params?.name) || notification.method;
    return this.nativeToolCall({
      toolCallId,
      status: statusFromMethod(notification.method),
      kind: 'execute',
      subtype: 'generic',
      title: label,
      description: label,
      data: { method: notification.method, params: notification.params },
    });
  }

  private nativeToolCall(data: NativeToolCallData): CodexTranslatedEvent {
    return this.message('codex_tool_call', data, true, data.toolCallId);
  }

  private readAgentToolCall(
    params: Record<string, unknown> | undefined,
    toolCallId: string,
    item?: Record<string, unknown>
  ): { agentCallId?: string; threadId?: string } {
    const threadId = readString(params?.threadId) || readString(item?.threadId) || readString(item?.thread_id);
    const callId = threadId ? this.agentCallByThreadId.get(threadId) : undefined;

    if (callId && threadId) {
      this.agentToolByToolCallId.set(toolCallId, { callId, threadId });
      return { agentCallId: callId, threadId };
    }

    const existing = this.agentToolByToolCallId.get(toolCallId);
    return existing ? { agentCallId: existing.callId, threadId: existing.threadId } : {};
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isCollaborationEvent(method: string): boolean {
  return method.toLowerCase().includes('collab') || method.toLowerCase().includes('agentspawn');
}

type NormalizedPlanStatus = 'pending' | 'in_progress' | 'completed';

function normalizePlanMessage(params: unknown): {
  msgId: string;
  data: { sessionId: string; entries: Array<{ content: string; status: NormalizedPlanStatus }> };
} {
  const record = asRecord(params);
  const msgId = readString(record?.turnId) || readString(record?.itemId) || 'codex_plan';
  const plan = record?.plan;
  if (Array.isArray(plan)) {
    return {
      msgId,
      data: {
        sessionId: msgId,
        entries: plan
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
          .map((entry) => ({
            content: readString(entry.step) || readString(entry.content) || readString(entry.text) || '',
            status: normalizePlanStatus(entry.status),
          })),
      },
    };
  }

  const delta = readString(record?.delta);
  return {
    msgId,
    data: {
      sessionId: msgId,
      entries: delta ? [{ content: delta, status: 'pending' }] : [],
    },
  };
}

function normalizePlanStatus(value: unknown): NormalizedPlanStatus {
  switch (readString(value)) {
    case 'completed':
      return 'completed';
    case 'inProgress':
    case 'in_progress':
      return 'in_progress';
    case 'pending':
    default:
      return 'pending';
  }
}

function normalizeTurnDiff(params: unknown): { unified_diff: string } {
  const record = asRecord(params);
  return {
    unified_diff: readString(record?.diff) || readString(record?.unifiedDiff) || readString(record?.unified_diff) || '',
  };
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((part): part is string => typeof part === 'string');
  }
  const command = readString(value);
  return command ? [command] : [];
}

function statusFromCompactionLifecycle(method: string, value: unknown): CodexContextEventData['status'] {
  const normalized = readString(value);
  if (normalized === 'failed') return 'failed';
  if (method === 'item/completed') return 'completed';
  return 'running';
}

function normalizeAgentEventStatus(value: unknown): string {
  switch (readString(value)) {
    case 'inProgress':
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    default:
      return readString(value) || 'unknown';
  }
}

function normalizeAgentStates(value: unknown): CodexAgentEventData['agents'] {
  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(record).map(([threadId, state]) => {
    const stateRecord = asRecord(state);
    return {
      threadId,
      status: normalizeOptionalAgentStatus(stateRecord?.status),
      message: readString(stateRecord?.message),
      nickname: readString(stateRecord?.nickname),
      role: readString(stateRecord?.role),
    };
  });
}

function normalizeOptionalAgentStatus(value: unknown): string | undefined {
  const status = normalizeAgentEventStatus(value);
  return status === 'unknown' ? undefined : status;
}

function readToolCallId(params: Record<string, unknown> | undefined, prefix: string): string {
  return readString(params?.itemId) || readString(params?.callId) || readString(params?.id) || `${prefix}_${uuid()}`;
}

function formatCommand(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const command = value.filter((part): part is string => typeof part === 'string').join(' ');
    return command.length > 0 ? command : undefined;
  }
  return readString(value);
}

function isMcpEvent(method: string): boolean {
  return method.toLowerCase().includes('mcp');
}

function isWebEvent(method: string): boolean {
  const lowerMethod = method.toLowerCase();
  return lowerMethod.includes('websearch') || lowerMethod.includes('web_search') || lowerMethod.includes('/web/');
}

function mcpSubtypeFromMethod(method: string): string {
  return method.toLowerCase().includes('complete') || method.toLowerCase().includes('end')
    ? 'mcp_tool_call_end'
    : 'mcp_tool_call_begin';
}

function webSubtypeFromMethod(method: string): string {
  return method.toLowerCase().includes('complete') || method.toLowerCase().includes('end')
    ? 'web_search_end'
    : 'web_search_begin';
}

function statusFromMethod(method: string): NativeToolCallStatus {
  const lowerMethod = method.toLowerCase();
  if (lowerMethod.includes('cancel')) return 'canceled';
  if (lowerMethod.includes('decline')) return 'canceled';
  if (lowerMethod.includes('fail') || lowerMethod.includes('error')) return 'error';
  if (lowerMethod.includes('complete') || lowerMethod.includes('end') || lowerMethod.includes('success')) {
    return 'success';
  }
  return 'executing';
}

function statusFromItem(value: unknown): NativeToolCallStatus {
  switch (readString(value)) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'declined':
      return 'canceled';
    default:
      return 'executing';
  }
}

function describeNativeTool(params: Record<string, unknown> | undefined, fallback: string): string {
  return (
    readString(params?.name) ||
    readString(params?.toolName) ||
    readString(params?.serverName) ||
    readString(params?.query) ||
    fallback
  );
}

function durationFromMs(durationMs: number): { secs: number; nanos: number } {
  const secs = Math.floor(durationMs / 1000);
  return { secs, nanos: Math.round((durationMs - secs * 1000) * 1_000_000) };
}

function normalizeFileChanges(
  value: unknown,
  filePath?: string,
  patch?: string
): Record<string, { type: string; unified_diff?: string }> {
  const record = asRecord(value);
  if (record) {
    return Object.fromEntries(
      Object.entries(record).map(([path, change]) => [
        path,
        typeof change === 'object' && change !== null
          ? ({ type: readString((change as { type?: unknown }).type) || 'modify' } as { type: string })
          : { type: 'modify' },
      ])
    );
  }

  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => [
          readString(entry.path) || 'unknown',
          {
            type: readString(entry.kind) || 'modify',
            unified_diff: readString(entry.diff),
          },
        ])
    );
  }

  if (filePath) {
    return { [filePath]: { type: 'modify', unified_diff: patch } };
  }

  return {};
}

function formatChanges(value: unknown): string {
  const record = asRecord(value);
  if (record) {
    return Object.entries(record)
      .map(([path, change]) => `${path}\n${JSON.stringify(change, null, 2)}`)
      .join('\n\n');
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => readString(entry.diff) || readString(entry.path) || '')
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function summarizeFileChange(changes: Record<string, { type: string }>): string | undefined {
  const paths = Object.keys(changes);
  if (paths.length === 0) return undefined;
  if (paths.length === 1) return paths[0];
  return `${paths.length} files changed`;
}
