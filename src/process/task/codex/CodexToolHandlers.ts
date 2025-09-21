/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolGroup } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { addOrUpdateMessage } from '../../message';
import type { CodexAgentEventType, CodexAgentEvent } from '@/common/codexTypes';

export class CodexToolHandlers {
  private cmdBuffers: Map<string, { stdout: string; stderr: string; combined: string }> = new Map();
  private patchBuffers: Map<string, string> = new Map();
  private patchChanges: Map<string, Record<string, any>> = new Map();
  private pendingConfirmations: Set<string> = new Set();

  constructor(private conversation_id: string) {}

  // Command execution handlers
  handleExecCommandBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    const cmd = Array.isArray(evt.data?.command) ? evt.data.command.join(' ') : String(evt.data?.command || 'command');
    this.cmdBuffers.set(callId, { stdout: '', stderr: '', combined: '' });
    // 试点启用确认流：先置为 Confirming
    this.pendingConfirmations.add(callId);
    this.emitToolGroup(callId, {
      name: 'Shell',
      description: `Running: ${cmd}`,
      status: 'Confirming',
      renderOutputAsMarkdown: true,
    });
  }

  handleExecCommandOutputDelta(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA }>) {
    const callId = evt.data?.call_id;
    if (!callId) return;
    const stream = evt.data?.stream || 'stdout';
    let chunk = evt.data?.chunk;
    if (typeof chunk !== 'string') {
      try {
        if (Buffer.isBuffer(chunk)) {
          chunk = chunk.toString('utf-8');
        } else {
          chunk = Buffer.from(chunk as any, 'base64').toString('utf-8');
        }
      } catch {
        chunk = String(chunk);
      }
    }
    const buf = this.cmdBuffers.get(callId) || { stdout: '', stderr: '', combined: '' };
    if (stream === 'stderr') buf.stderr += chunk;
    else buf.stdout += chunk;
    buf.combined += chunk;
    this.cmdBuffers.set(callId, buf);
    this.emitToolGroup(callId, {
      name: 'Shell',
      description: `Streaming output (${stream})...`,
      status: 'Executing',
      renderOutputAsMarkdown: true,
      resultDisplay: buf.combined,
    });
  }

  handleExecCommandEnd(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_END }>) {
    const callId = evt.data?.call_id;
    if (!callId) return;
    const code = typeof evt.data?.exit_code === 'number' ? evt.data.exit_code : -1;
    const buf = this.cmdBuffers.get(callId) || { stdout: '', stderr: '', combined: '' };
    const status = code === 0 ? 'Success' : 'Error';
    this.emitToolGroup(callId, {
      name: 'Shell',
      description: `Command finished with exit code ${code}`,
      status,
      renderOutputAsMarkdown: true,
      resultDisplay: buf.combined,
    });
    this.cmdBuffers.delete(callId);
  }

  // Patch handlers
  handlePatchApplyBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.PATCH_APPLY_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    const auto = evt.data?.auto_approved ? 'true' : 'false';
    const summary = this.summarizePatch(evt.data?.changes);
    // Cache both summary and raw changes for later application
    this.patchBuffers.set(callId, summary);
    if (evt.data?.changes && typeof evt.data.changes === 'object') {
      this.patchChanges.set(callId, evt.data.changes as Record<string, any>);
    }
    // 对未自动批准的变更设置确认
    if (!evt.data?.auto_approved) this.pendingConfirmations.add(callId);
    this.emitToolGroup(callId, {
      name: 'WriteFile',
      description: `apply_patch auto_approved=${auto}`,
      status: evt.data?.auto_approved ? 'Executing' : 'Confirming',
      renderOutputAsMarkdown: true,
      resultDisplay: summary,
    });
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
    this.emitToolGroup(callId, {
      name: 'WriteFile',
      description: ok ? 'Patch applied successfully' : 'Patch apply failed',
      status: ok ? 'Success' : 'Error',
      renderOutputAsMarkdown: true,
      resultDisplay: summary,
    });
    this.patchBuffers.delete(callId);
    this.patchChanges.delete(callId);
  }

  // MCP tool handlers
  handleMcpToolCallBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    const inv = evt.data?.invocation || {};
    const title = this.formatMcpInvocation(inv);
    this.emitToolGroup(callId, {
      name: 'Shell',
      description: `${title} (beginning)`,
      status: 'Executing',
      renderOutputAsMarkdown: true,
    });
  }

  handleMcpToolCallEnd(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_END }>) {
    const callId = evt.data?.call_id || uuid();
    const inv = evt.data?.invocation || {};
    const title = this.formatMcpInvocation(inv);
    const result = evt.data?.result;
    const isError = typeof result === 'object' && result && (result.Err !== undefined || result.is_error === true);
    this.emitToolGroup(callId, {
      name: 'Shell',
      description: `${title} ${isError ? 'failed' : 'success'}`,
      status: isError ? 'Error' : 'Success',
      renderOutputAsMarkdown: true,
      resultDisplay: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    });
  }

  // Web search handlers
  handleWebSearchBegin(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_BEGIN }>) {
    const callId = evt.data?.call_id || uuid();
    this.emitToolGroup(callId, {
      name: 'GoogleSearch',
      description: 'Searching web...',
      status: 'Executing',
      renderOutputAsMarkdown: true,
    });
  }

  handleWebSearchEnd(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_END }>) {
    const callId = evt.data?.call_id || uuid();
    const query = evt.data?.query || '';
    this.emitToolGroup(callId, {
      name: 'GoogleSearch',
      description: `Web search completed: ${query}`,
      status: 'Success',
      renderOutputAsMarkdown: true,
    });
  }

  // Utility methods
  private emitToolGroup(callId: string, tool: Partial<IMessageToolGroup['content'][number]>) {
    const toolGroupMessage: IResponseMessage = {
      type: 'tool_group',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        callId,
        tool: {
          callId,
          name: 'Unknown',
          description: '',
          status: 'Executing',
          renderOutputAsMarkdown: false,
          resultDisplay: '',
          ...tool,
        },
      },
    };

    const transformedMessage = transformMessage(toolGroupMessage);
    if (transformedMessage) {
      addOrUpdateMessage(this.conversation_id, transformedMessage);
      ipcBridge.codexConversation.responseStream.emit(toolGroupMessage);
    }
  }

  private formatMcpInvocation(inv: Record<string, any>): string {
    const name = inv.method || inv.name || 'unknown';
    return `MCP Tool: ${name}`;
  }

  private summarizePatch(changes: Record<string, any> | undefined): string {
    if (!changes || typeof changes !== 'object') return 'No changes';

    const entries = Object.entries(changes);
    if (entries.length === 0) return 'No changes';

    return entries
      .map(([file, change]) => {
        if (typeof change === 'object' && change !== null) {
          const action = (change as any).type || (change as any).action || 'modify';
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

  getPatchChanges(callId: string): Record<string, any> | undefined {
    return this.patchChanges.get(callId);
  }

  storePatchChanges(callId: string, changes: Record<string, any>): void {
    this.patchChanges.set(callId, changes);
  }

  cleanup() {
    this.cmdBuffers.clear();
    this.patchBuffers.clear();
    this.patchChanges.clear();
    this.pendingConfirmations.clear();
  }
}
