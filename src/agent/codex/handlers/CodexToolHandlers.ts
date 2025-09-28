/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolGroup } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import { CodexAgentEventType, type CodexAgentEvent, type FileChange, type McpInvocation } from '@/common/codex/types';
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
  private shellCommandsMsgId: string | null = null; // 所有shell命令共享的msg_id

  constructor(
    private conversation_id: string,
    private messageEmitter: ICodexMessageEmitter
  ) {
    this.toolRegistry = new ToolRegistry();
  }

  // Command execution handlers
  handleExecCommandBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    const cmd = Array.isArray(evt.data?.command) ? evt.data.command.join(' ') : String(evt.data?.command || 'command');
    this.cmdBuffers.set(callId, { stdout: '', stderr: '', combined: '' });
    // 试点启用确认流：先置为 Confirming
    this.pendingConfirmations.add(callId);
    this.emitToolGroup(
      callId,
      CodexAgentEventType.EXEC_COMMAND_BEGIN,
      {
        description: `Running: ${cmd}`,
        status: 'Confirming',
      },
      evt.data
    );
  }

  handleExecCommandOutputDelta(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA }>) {
    const callId = evt.data?.call_id;
    if (!callId) return;
    const stream = evt.data?.stream || 'stdout';
    let chunk = evt.data?.chunk;

    // Handle base64-encoded chunks from Codex
    if (typeof chunk === 'string') {
      // Check if it's a valid base64 string before attempting to decode
      if (this.isValidBase64(chunk)) {
        try {
          // Decode base64 - Codex sends base64-encoded strings
          chunk = Buffer.from(chunk, 'base64').toString('utf-8');
        } catch {
          // If base64 decoding fails, use the original string
        }
      }
      // If not base64, use the string as-is
    } else if (Buffer.isBuffer(chunk)) {
      chunk = chunk.toString('utf-8');
    } else {
      chunk = String(chunk);
    }
    const buf = this.cmdBuffers.get(callId) || { stdout: '', stderr: '', combined: '' };
    if (stream === 'stderr') buf.stderr += chunk;
    else buf.stdout += chunk;
    buf.combined += chunk;
    this.cmdBuffers.set(callId, buf);
    this.emitToolGroup(
      callId,
      CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA,
      {
        description: `Streaming output (${stream})...`,
        status: 'Executing',
        resultDisplay: buf.combined,
      },
      evt.data
    );
  }

  // Patch handlers
  handlePatchApplyBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.PATCH_APPLY_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    const auto = evt.data?.auto_approved ? 'true' : 'false';
    const summary = this.summarizePatch(evt.data?.changes);
    // Cache both summary and raw changes for later application
    this.patchBuffers.set(callId, summary);
    if (evt.data?.changes && typeof evt.data.changes === 'object') {
      this.patchChanges.set(callId, evt.data.changes as Record<string, FileChange>);
    }
    // 对未自动批准的变更设置确认
    if (!evt.data?.auto_approved) this.pendingConfirmations.add(callId);
    this.emitToolGroup(
      callId,
      CodexAgentEventType.PATCH_APPLY_BEGIN,
      {
        description: `apply_patch auto_approved=${auto}`,
        status: evt.data?.auto_approved ? 'Executing' : 'Confirming',
        resultDisplay: summary,
      },
      evt.data
    );
    // If auto-approved, immediately attempt to apply changes
    if (evt.data?.auto_approved) {
      this.applyPatchChanges(callId).catch((): void => void 0);
    }
  }

  handlePatchApplyEnd(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.PATCH_APPLY_END }>) {
    const callId = evt.data?.call_id;
    if (!callId) return;
    const ok = !!evt.data?.success;
    const summary = this.patchBuffers.get(callId) || '';
    this.emitToolGroup(
      callId,
      CodexAgentEventType.PATCH_APPLY_END,
      {
        description: ok ? 'Patch applied successfully' : 'Patch apply failed',
        status: ok ? 'Success' : 'Error',
        resultDisplay: summary,
      },
      evt.data
    );
    this.patchBuffers.delete(callId);
    this.patchChanges.delete(callId);
  }

  // MCP tool handlers
  handleMcpToolCallBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    const inv = evt.data?.invocation || {};
    const title = this.formatMcpInvocation(inv);
    this.emitToolGroup(
      callId,
      CodexAgentEventType.MCP_TOOL_CALL_BEGIN,
      {
        description: `${title} (beginning)`,
        status: 'Executing',
      },
      evt.data
    );
  }

  handleMcpToolCallEnd(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_END }>) {
    const callId = evt.data?.call_id || uuid();
    const inv = evt.data?.invocation || {};
    const title = this.formatMcpInvocation(inv);
    const result = evt.data?.result as unknown;
    const resultObj: Record<string, unknown> | undefined = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : undefined;
    const isError = !!resultObj && ('Err' in resultObj || resultObj['is_error'] === true);
    this.emitToolGroup(
      callId,
      CodexAgentEventType.MCP_TOOL_CALL_END,
      {
        description: `${title} ${isError ? 'failed' : 'success'}`,
        status: isError ? 'Error' : 'Success',
        resultDisplay: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      },
      evt.data
    );
  }

  // Web search handlers
  handleWebSearchBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    this.emitToolGroup(
      callId,
      CodexAgentEventType.WEB_SEARCH_BEGIN,
      {
        description: 'Searching web...',
        status: 'Executing',
      },
      evt.data
    );
  }

  handleWebSearchEnd(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_END }>) {
    const callId = evt.data?.call_id || uuid();
    const query = evt.data?.query || '';
    this.emitToolGroup(
      callId,
      CodexAgentEventType.WEB_SEARCH_END,
      {
        description: `Web search completed: ${query}`,
        status: 'Success',
      },
      evt.data
    );
  }

  // Utility methods
  private emitToolGroup(callId: string, eventType: CodexAgentEventType, tool: Partial<IMessageToolGroup['content'][number]>, eventData?: EventDataMap[keyof EventDataMap]) {
    const toolDef = this.toolRegistry.resolveToolForEvent(eventType, eventData);
    const i18nParams = toolDef ? this.toolRegistry.getMcpToolI18nParams(toolDef) : {};

    const toolContent: IMessageToolGroup['content'][number] = {
      callId,
      name: toolDef ? this.toolRegistry.getToolDisplayName(toolDef, i18nParams) : 'Unknown Tool',
      description: toolDef ? this.toolRegistry.getToolDescription(toolDef, i18nParams) : '',
      status: 'Executing',
      renderOutputAsMarkdown: toolDef?.capabilities.supportsMarkdown || false,
      resultDisplay: '',
      ...tool,
    };

    // 检查是否为shell命令执行事件
    const isShellCommand = eventType === CodexAgentEventType.EXEC_COMMAND_BEGIN || eventType === CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA || eventType === CodexAgentEventType.EXEC_COMMAND_END;

    let msgId: string;

    if (isShellCommand) {
      // 所有shell命令使用同一个msg_id，实现消息合并
      if (!this.shellCommandsMsgId) {
        this.shellCommandsMsgId = uuid();
      }
      msgId = this.shellCommandsMsgId;
    } else {
      // 非shell命令使用原有的callId映射逻辑
      msgId = this.activeToolGroups.get(callId);
      if (!msgId) {
        msgId = uuid();
        this.activeToolGroups.set(callId, msgId);
      }
    }

    const toolGroupMessage: IResponseMessage = {
      type: 'tool_group',
      conversation_id: this.conversation_id,
      msg_id: msgId, // 使用相同的msg_id确保消息合并
      data: [toolContent], // IResponseMessage expects data field, which will be used as content
    };

    this.messageEmitter.emitAndPersistMessage(toolGroupMessage);

    // 如果是非shell命令的最终状态，清理映射
    if (!isShellCommand && ['Success', 'Error', 'Canceled'].includes(toolContent.status)) {
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
          if ('type' in (change as any) && (change as any).type) action = String((change as any).type);
          else if ('action' in (change as any) && (change as any).action) action = String((change as any).action);
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
    this.shellCommandsMsgId = null;
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
