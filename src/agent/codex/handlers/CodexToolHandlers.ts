/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import type { FileChange, McpInvocation, CodexEventMsg } from '@/common/codex/types';
import { ToolRegistry } from '@/common/codex/utils';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import type { IResponseMessage } from '@/common/ipcBridge';
import { NavigationInterceptor } from '@/common/navigation';

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
    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: msg.auto_approved ? 'executing' : 'pending',
      kind: 'execute',
      subtype: 'patch_apply_begin',
      data: msg,
      description: `apply_patch auto_approved=${auto}`,
      startTime: Date.now(),
      content: [
        {
          type: 'output',
          output: summary,
        },
      ],
    });
    // If auto-approved, immediately attempt to apply changes
    if (msg.auto_approved) {
      this.applyPatchChanges(callId);
    }
  }

  handlePatchApplyEnd(msg: Extract<CodexEventMsg, { type: 'patch_apply_end' }>) {
    const callId = msg.call_id;
    if (!callId) return;
    const ok = !!msg.success;
    const summary = this.patchBuffers.get(callId) || '';
    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: ok ? 'success' : 'error',
      kind: 'execute',
      subtype: 'patch_apply_end',
      data: msg,
      description: ok ? 'Patch applied successfully' : 'Patch apply failed',
      endTime: Date.now(),
      content: [
        {
          type: 'output',
          output: summary,
        },
      ],
    });

    // Clean up resources
    this.pendingConfirmations.delete(callId);
    this.patchBuffers.delete(callId);
    this.patchChanges.delete(callId);
  }

  // MCP tool handlers
  handleMcpToolCallBegin(msg: Extract<CodexEventMsg, { type: 'mcp_tool_call_begin' }>) {
    // MCP events may or may not have call_id, generate one based on tool name if missing
    // MCP 事件可能有也可能没有 call_id，如果缺失则根据工具名称生成
    const inv = msg.invocation || {};
    const toolName = String(inv.tool || inv.name || inv.method || 'unknown');
    // Use type assertion since call_id may exist in runtime data but not in type definition
    // 使用类型断言，因为 call_id 可能在运行时数据中存在但不在类型定义中
    const callId = (msg as any).call_id || `mcp_${toolName}_${uuid()}`;
    const title = this.formatMcpInvocation(inv);

    // Intercept chrome-devtools navigation tools using unified NavigationInterceptor
    // 使用统一的 NavigationInterceptor 拦截 chrome-devtools 导航工具
    const interceptionResult = NavigationInterceptor.intercept(
      {
        toolName,
        server: String(inv.server || ''),
        arguments: inv.arguments as Record<string, unknown>,
      },
      this.conversation_id
    );

    if (interceptionResult.intercepted && interceptionResult.previewMessage) {
      // Use emitAndPersistMessage with persist=false since preview_open is a signal
      this.messageEmitter.emitAndPersistMessage(interceptionResult.previewMessage, false);
    }

    // Add to pending confirmations
    this.pendingConfirmations.add(callId);

    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: 'executing',
      kind: 'execute',
      subtype: 'mcp_tool_call_begin',
      data: msg,
      description: `${title} (beginning)`,
      startTime: Date.now(),
    });
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

    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: isError ? 'error' : 'success',
      kind: 'execute',
      subtype: 'mcp_tool_call_end',
      data: msg,
      description: `${title} ${isError ? 'failed' : 'success'}`,
      endTime: Date.now(),
      content: [
        {
          type: 'output',
          output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    });

    // Clean up resources
    this.pendingConfirmations.delete(callId);
  }

  // Web search handlers
  handleWebSearchBegin(msg: Extract<CodexEventMsg, { type: 'web_search_begin' }>) {
    const callId = msg.call_id;
    this.cmdBuffers.set(callId, { stdout: '', stderr: '', combined: '' });
    // 试点启用确认流：先置为 Confirming
    this.pendingConfirmations.add(callId);
    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: 'pending',
      kind: 'execute',
      subtype: 'web_search_begin',
      data: msg,
      description: callId,
      startTime: Date.now(),
    });
  }

  handleWebSearchEnd(msg: Extract<CodexEventMsg, { type: 'web_search_end' }>) {
    const callId = msg.call_id || uuid();
    const query = msg.query || '';
    // Use new CodexToolCall approach with subtype and original data
    this.emitCodexToolCall(callId, {
      status: 'success',
      kind: 'execute',
      subtype: 'web_search_end',
      data: msg,
      description: `Web search completed: ${query}`,
      endTime: Date.now(),
    });

    // Clean up buffers
    this.pendingConfirmations.delete(callId);
    this.cmdBuffers.delete(callId);
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

  // Turn diff handler
  handleTurnDiff(msg: Extract<CodexEventMsg, { type: 'turn_diff' }>) {
    // Generate a unique call ID for turn_diff since it doesn't have one
    const callId = `turn_diff_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    this.emitCodexToolCall(callId, {
      status: 'success',
      kind: 'patch', // Turn diff shows file changes, so use patch kind
      subtype: 'turn_diff',
      data: msg,
      description: 'File changes summary',
      startTime: Date.now(),
      endTime: Date.now(),
    });
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

  private applyPatchChanges(callId: string): void {
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
