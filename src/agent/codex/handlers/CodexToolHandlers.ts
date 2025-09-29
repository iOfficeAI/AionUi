/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolGroup, CodexToolCallUpdate } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import { CodexAgentEventType, type FileChange, type McpInvocation, type CodexEventMsg } from '@/common/codex/types';
import { ToolRegistry, type EventDataMap } from '@/common/codex/utils';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import type { IResponseMessage } from '@/common/ipcBridge';

export class CodexToolHandlers {
  private cmdBuffers: Map<string, { stdout: string; stderr: string; combined: string }> = new Map();
  private patchBuffers: Map<string, string> = new Map();
  private patchChanges: Map<string, Record<string, FileChange>> = new Map();
  private pendingConfirmations: Set<string> = new Set();
  private toolRegistry: ToolRegistry;
  private activeToolGroups: Map<string, string> = new Map(); // callId -> msg_id mapping
  private activeToolCalls: Map<string, string> = new Map(); // callId -> msg_id mapping for tool calls

  constructor(
    private conversation_id: string,
    private messageEmitter: ICodexMessageEmitter
  ) {
    this.toolRegistry = new ToolRegistry();
  }

  // Command execution handlers
  handleExecCommandBegin(msg: Extract<CodexEventMsg, { type: 'exec_command_begin' }>) {
    const callId = msg.call_id;
    const cmd = Array.isArray(msg.command) ? msg.command.join(' ') : String(msg.command);
    this.cmdBuffers.set(callId, { stdout: '', stderr: '', combined: '' });
    // 试点启用确认流：先置为 Confirming
    this.pendingConfirmations.add(callId);

    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: 'pending',
      kind: 'execute',
      subtype: 'exec_command_begin',
      data: msg,
      description: cmd,
      startTime: Date.now(),
    });
  }

  handleExecCommandOutputDelta(msg: Extract<CodexEventMsg, { type: 'exec_command_output_delta' }>) {
    const callId = msg.call_id;
    const stream = msg.stream;
    let chunk = msg.chunk;
    // Handle base64-encoded chunks from Codex
    // Check if it's a valid base64 string before attempting to decode
    if (this.isValidBase64(chunk)) {
      try {
        // Decode base64 - Codex sends base64-encoded strings
        chunk = Buffer.from(chunk, 'base64').toString('utf-8');
      } catch {
        // If base64 decoding fails, use the original string
      }
    }
    const buf = this.cmdBuffers.get(callId) || { stdout: '', stderr: '', combined: '' };
    if (stream === 'stderr') buf.stderr += chunk;
    else buf.stdout += chunk;
    buf.combined += chunk;
    this.cmdBuffers.set(callId, buf);

    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: 'executing',
      kind: 'execute',
      subtype: 'exec_command_output_delta',
      data: msg,
      content: [
        {
          type: 'output',
          output: buf.combined,
        },
      ],
    });
  }

  handleExecCommandEnd(msg: Extract<CodexEventMsg, { type: 'exec_command_end' }>) {
    const callId = msg.call_id;
    const exitCode = msg.exit_code;

    // 获取累积的输出，优先使用缓存的数据，回退到消息中的数据
    const buf = this.cmdBuffers.get(callId);
    const finalOutput = buf?.combined || msg.aggregated_output || '';

    // 确定最终状态：exit_code 0 为成功，其他为错误
    const isSuccess = exitCode === 0;
    const status = isSuccess ? 'success' : 'error';

    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status,
      kind: 'execute',
      subtype: 'exec_command_end',
      data: msg,
      endTime: Date.now(),
      content: [
        {
          type: 'output',
          output: finalOutput,
        },
      ],
    });

    // 清理资源
    this.pendingConfirmations.delete(callId);
    this.cmdBuffers.delete(callId);
  }

  // Patch handlers
  handlePatchApplyBegin(msg: Extract<CodexEventMsg, { type: 'patch_apply_begin' }>) {
    const callId = msg.call_id || uuid();
    const auto = msg.auto_approved ? 'true' : 'false';
    const summary = this.summarizePatch(msg.changes);
    // Cache both summary and raw changes for later application
    this.patchBuffers.set(callId, summary);
    if (msg.changes && typeof msg.changes === 'object') {
      // msg.changes 已经有正确的类型定义，无需类型断言
      this.patchChanges.set(callId, msg.changes);
    }
    // 对未自动批准的变更设置确认
    if (!msg.auto_approved) this.pendingConfirmations.add(callId);
    this.emitToolGroup(
      callId,
      CodexAgentEventType.PATCH_APPLY_BEGIN,
      {
        description: `apply_patch auto_approved=${auto}`,
        status: msg.auto_approved ? 'Executing' : 'Confirming',
        resultDisplay: summary,
      },
      msg
    );
    // If auto-approved, immediately attempt to apply changes
    if (msg.auto_approved) {
      this.applyPatchChanges(callId).catch((): void => void 0);
    }
  }

  handlePatchApplyEnd(msg: Extract<CodexEventMsg, { type: 'patch_apply_end' }>) {
    const callId = msg.call_id;
    if (!callId) return;
    const ok = !!msg.success;
    const summary = this.patchBuffers.get(callId) || '';
    this.emitToolGroup(
      callId,
      CodexAgentEventType.PATCH_APPLY_END,
      {
        description: ok ? 'Patch applied successfully' : 'Patch apply failed',
        status: ok ? 'Success' : 'Error',
        resultDisplay: summary,
      },
      msg
    );
    this.patchBuffers.delete(callId);
    this.patchChanges.delete(callId);
  }

  // MCP tool handlers
  handleMcpToolCallBegin(msg: Extract<CodexEventMsg, { type: 'mcp_tool_call_begin' }>) {
    // MCP events don't have call_id, generate one based on tool name
    const inv = msg.invocation || {};
    const toolName = inv.tool || inv.name || inv.method || 'unknown';
    const callId = `mcp_${toolName}_${uuid()}`;
    const title = this.formatMcpInvocation(inv);
    this.emitToolGroup(
      callId,
      CodexAgentEventType.MCP_TOOL_CALL_BEGIN,
      {
        description: `${title} (beginning)`,
        status: 'Executing',
      },
      msg
    );
  }

  handleMcpToolCallEnd(msg: Extract<CodexEventMsg, { type: 'mcp_tool_call_end' }>) {
    // MCP events don't have call_id, generate one based on tool name
    const inv = msg.invocation || {};
    const toolName = inv.tool || inv.name || inv.method || 'unknown';
    const callId = `mcp_${toolName}_${uuid()}`;
    const title = this.formatMcpInvocation(inv);
    const result = msg.result;

    // 类型安全的错误检查，使用 in 操作符进行类型保护
    const isError = (() => {
      if (typeof result === 'object' && result !== null) {
        return 'Err' in result || ('is_error' in result && result.is_error === true);
      }
      return false;
    })();

    this.emitToolGroup(
      callId,
      CodexAgentEventType.MCP_TOOL_CALL_END,
      {
        description: `${title} ${isError ? 'failed' : 'success'}`,
        status: isError ? 'Error' : 'Success',
        resultDisplay: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      },
      msg
    );
  }

  // Web search handlers
  handleWebSearchBegin(msg: Extract<CodexEventMsg, { type: 'web_search_begin' }>) {
    const callId = msg.call_id || uuid();
    this.emitToolGroup(
      callId,
      CodexAgentEventType.WEB_SEARCH_BEGIN,
      {
        description: 'Searching web...',
        status: 'Executing',
      },
      msg
    );
  }

  handleWebSearchEnd(msg: Extract<CodexEventMsg, { type: 'web_search_end' }>) {
    const callId = msg.call_id || uuid();
    const query = msg.query || '';
    this.emitToolGroup(
      callId,
      CodexAgentEventType.WEB_SEARCH_END,
      {
        description: `Web search completed: ${query}`,
        status: 'Success',
      },
      msg
    );
  }

  // New emit function for CodexToolCall
  private emitCodexToolCall(callId: string, update: Partial<CodexToolCallUpdate>) {
    let msgId: string;

    // Use callId mapping to ensure all phases of the same tool call use the same msg_id
    msgId = this.activeToolCalls.get(callId);
    if (!msgId) {
      msgId = uuid();
      this.activeToolCalls.set(callId, msgId);
    }

    const toolCallMessage: IResponseMessage = {
      type: 'codex_tool_call',
      conversation_id: this.conversation_id,
      msg_id: msgId,
      data: {
        toolCallId: callId,
        status: 'pending',
        title: 'Tool Call',
        kind: 'execute',
        ...update,
      } as CodexToolCallUpdate,
    };

    this.messageEmitter.emitAndPersistMessage(toolCallMessage);

    // Clean up mapping if tool call is completed
    if (['success', 'error', 'canceled'].includes(update.status || '')) {
      this.activeToolCalls.delete(callId);
    }
  }

  // Utility methods
  private emitToolGroup(callId: string, eventType: CodexAgentEventType, tool: Partial<IMessageToolGroup['content'][number]>, eventData?: EventDataMap[keyof EventDataMap]) {
    const toolDef = this.toolRegistry.resolveToolForEvent(eventType, eventData);
    const i18nParams = toolDef ? this.toolRegistry.getMcpToolI18nParams(toolDef) : {};
    const toolContent: IMessageToolGroup['content'][number] = {
      callId,
      name: toolDef ? this.toolRegistry.getToolDisplayName(toolDef, i18nParams) : 'Unknown Tool',
      description: toolDef ? this.toolRegistry.getToolDescription(toolDef, i18nParams) : '',
      status: 'Success',
      renderOutputAsMarkdown: toolDef?.capabilities.supportsMarkdown || false,
      resultDisplay: '',
      ...tool,
    };

    let msgId: string;

    // 使用 callId 映射来确保同一个命令的所有阶段使用相同的 msg_id
    msgId = this.activeToolGroups.get(callId);
    if (!msgId) {
      msgId = uuid();
      this.activeToolGroups.set(callId, msgId);
    }

    const toolGroupMessage: IResponseMessage = {
      type: 'tool_group',
      conversation_id: this.conversation_id,
      msg_id: msgId, // 使用相同的msg_id确保消息合并
      data: [toolContent], // IResponseMessage expects data field, which will be used as content
    };

    this.messageEmitter.emitAndPersistMessage(toolGroupMessage);

    // 如果是最终状态，清理映射
    if (['Success', 'Error', 'Canceled'].includes(toolContent.status)) {
      this.activeToolGroups.delete(callId);
    }
  }

  private formatMcpInvocation(inv: McpInvocation | Record<string, unknown>): string {
    const name = inv.method || inv.name || 'unknown';
    return `MCP Tool: ${name}`;
  }

  private summarizePatch(changes: Record<string, FileChange> | undefined): string {
    if (!changes || typeof changes !== 'object') return 'No changes';

    const entries = Object.entries(changes);
    if (entries.length === 0) return 'No changes';

    return entries
      .map(([file, change]) => {
        if (typeof change === 'object' && change !== null) {
          let action: string = 'modify';
          // FileChange 有明确的 type 结构，直接使用类型安全的访问
          if ('type' in change && typeof change.type === 'string') {
            action = change.type;
          } else if ('action' in change && typeof change.action === 'string') {
            action = change.action;
          }
          return `${action}: ${file}`;
        }
        return `modify: ${file}`;
      })
      .join('\n');
  }

  private async applyPatchChanges(callId: string): Promise<void> {
    // This would contain the actual patch application logic
    // For now, we'll just mark it as successful
    const changes = this.patchChanges.get(callId);
    if (changes) {
      // Apply changes logic would go here
    }
  }

  // Public methods for external access
  getPendingConfirmations(): Set<string> {
    return this.pendingConfirmations;
  }

  removePendingConfirmation(callId: string) {
    this.pendingConfirmations.delete(callId);
  }

  getPatchChanges(callId: string): Record<string, FileChange> | undefined {
    return this.patchChanges.get(callId);
  }

  storePatchChanges(callId: string, changes: Record<string, FileChange>): void {
    this.patchChanges.set(callId, changes);
  }

  cleanup() {
    this.cmdBuffers.clear();
    this.patchBuffers.clear();
    this.patchChanges.clear();
    this.pendingConfirmations.clear();
    this.activeToolGroups.clear();
    this.activeToolCalls.clear();
  }

  private isValidBase64(str: string): boolean {
    if (!str || str.length === 0) return false;

    // Base64 strings should have length divisible by 4 (with padding)
    if (str.length % 4 !== 0) return false;

    // Check if it contains only valid base64 characters
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str);
  }
}
