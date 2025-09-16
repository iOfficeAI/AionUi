import { CodexMcpAgent } from '@/agent/codex';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage, addOrUpdateMessage } from '../message';
import BaseAgentManager from './BaseAgentManager';

interface CodexAgentManagerData {
  conversation_id: string;
  workspace?: string;
  cliPath?: string;
}

class CodexAgentManager extends BaseAgentManager<CodexAgentManagerData> {
  workspace?: string;
  agent: CodexMcpAgent;
  bootstrap: Promise<CodexMcpAgent>;
  private currentLoadingId: string | null = null;
  private cmdBuffers: Map<string, { stdout: string; stderr: string; combined: string }> = new Map();
  private patchBuffers: Map<string, string> = new Map();
  private pendingConfirmations: Set<string> = new Set();

  constructor(data: CodexAgentManagerData) {
    super('codex', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.bootstrap = this.initAgent(data);
  }

  private initAgent(data: CodexAgentManagerData) {
    this.agent = new CodexMcpAgent({
      id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
      onEvent: (evt) => this.handleAgentEvent(evt),
    });
    this.emitStatus('connecting', 'Connecting to Codex...');
    return this.agent
      .start()
      .then(async () => {
        this.emitStatus('connected', 'Connected to Codex MCP server');
        const session = await this.agent.newSession(this.workspace);
        this.emitStatus('session_active', 'Active session created with Codex');
        return this.agent;
      })
      .catch((e) => {
        this.emitStatus('error', `Failed to connect Codex: ${e?.message || e}`);
        throw e;
      });
  }

  private handleAgentEvent(evt: { type: string; data: any }) {
    const type = evt.type;

    if (type === 'agent_message_delta') {
      if (!this.currentLoadingId) this.currentLoadingId = uuid();
      const message: IResponseMessage = {
        type: 'content',
        conversation_id: this.conversation_id,
        msg_id: this.currentLoadingId,
        data: evt.data?.delta || evt.data?.message || '',
      };
      addOrUpdateMessage(this.conversation_id, transformMessage(message));
      ipcBridge.codexConversation.responseStream.emit(message);
      return;
    }

    if (type === 'agent_message') {
      if (!this.currentLoadingId) this.currentLoadingId = uuid();
      const message: IResponseMessage = {
        type: 'content',
        conversation_id: this.conversation_id,
        msg_id: this.currentLoadingId,
        data: evt.data?.message || '',
      };
      addOrUpdateMessage(this.conversation_id, transformMessage(message));
      ipcBridge.codexConversation.responseStream.emit(message);
      return;
    }

    if (type === 'task_complete') {
      // Reset loading id for next turn
      this.currentLoadingId = null;
      const finishMsg: IResponseMessage = {
        type: 'finish',
        conversation_id: this.conversation_id,
        msg_id: uuid(),
        data: {},
      };
      ipcBridge.codexConversation.responseStream.emit(finishMsg);
      return;
    }

    if (type === 'stream_error') {
      const errMsg: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: uuid(),
        data: evt.data?.message || 'Codex stream error',
      };
      addMessage(this.conversation_id, transformMessage(errMsg));
      ipcBridge.codexConversation.responseStream.emit(errMsg);
      return;
    }

    // tool: exec command
    if (type === 'exec_command_begin') {
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
      return;
    }

    if (type === 'exec_command_output_delta') {
      const callId = evt.data?.call_id;
      if (!callId) return;
      const stream = evt.data?.stream || 'stdout';
      let chunk = evt.data?.chunk;
      if (typeof chunk !== 'string') {
        try {
          chunk = Buffer.from(chunk, 'base64').toString('utf-8');
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
      return;
    }

    if (type === 'exec_command_end') {
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
      return;
    }

    // tool: patch apply
    if (type === 'patch_apply_begin') {
      const callId = evt.data?.call_id || uuid();
      const auto = evt.data?.auto_approved ? 'true' : 'false';
      const summary = this.summarizePatch(evt.data?.changes);
      this.patchBuffers.set(callId, summary);
      // 对未自动批准的变更设置确认
      if (!evt.data?.auto_approved) this.pendingConfirmations.add(callId);
      this.emitToolGroup(callId, {
        name: 'WriteFile',
        description: `apply_patch auto_approved=${auto}`,
        status: evt.data?.auto_approved ? 'Executing' : 'Confirming',
        renderOutputAsMarkdown: true,
        resultDisplay: summary,
      });
      return;
    }

    if (type === 'patch_apply_end') {
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
      return;
    }

    // tool: mcp tool
    if (type === 'mcp_tool_call_begin') {
      const callId = evt.data?.call_id || uuid();
      const inv = evt.data?.invocation || {};
      const title = this.formatMcpInvocation(inv);
      // MCP 工具默认需要确认
      this.pendingConfirmations.add(callId);
      this.emitToolGroup(callId, {
        name: 'Shell',
        description: `tool ${title}`,
        status: 'Confirming',
        renderOutputAsMarkdown: true,
      });
      return;
    }

    if (type === 'mcp_tool_call_end') {
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
      return;
    }

    // tool: web search
    if (type === 'web_search_begin') {
      const callId = evt.data?.call_id || uuid();
      this.emitToolGroup(callId, {
        name: 'GoogleSearch',
        description: 'Searching web...',
        status: 'Executing',
        renderOutputAsMarkdown: true,
      });
      return;
    }

    if (type === 'web_search_end') {
      const callId = evt.data?.call_id || uuid();
      const query = evt.data?.query || '';
      this.emitToolGroup(callId, {
        name: 'GoogleSearch',
        description: `Web search completed: ${query}`,
        status: 'Success',
        renderOutputAsMarkdown: true,
      });
      return;
    }

    // reasoning deltas are omitted from UI for now (could be mapped to a dedicated stream later)

    // Other events ignored for now
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{ success: boolean; msg?: string }> {
    await this.bootstrap;
    // User message will be added on renderer side to avoid duplication

    // Emit start + loading indicator
    this.currentLoadingId = uuid();
    const startMsg: IResponseMessage = {
      type: 'start',
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId,
      data: {},
    };
    const loadingMsg: IResponseMessage = {
      type: 'content',
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId,
      data: 'loading...',
    };
    ipcBridge.codexConversation.responseStream.emit(startMsg);
    addOrUpdateMessage(this.conversation_id, transformMessage(loadingMsg));
    ipcBridge.codexConversation.responseStream.emit(loadingMsg);

    // Send prompt
    await this.agent.sendPrompt(data.content);

    return { success: true };
  }

  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }): Promise<void> {
    // 由于 Codex MCP 目前不支持外部暂停/继续，这里仅更新前端展示状态
    const callId = data.callId;
    if (!callId) return;
    if (!this.pendingConfirmations.has(callId)) return;

    const outcome = String(data.confirmKey || 'cancel').toLowerCase();
    const isCancel = outcome.includes('cancel');
    this.pendingConfirmations.delete(callId);

    const message: IResponseMessage = {
      type: 'tool_group',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: [
        {
          callId,
          name: 'Shell',
          description: isCancel ? 'User canceled execution' : 'Proceed approved by user',
          status: isCancel ? 'Canceled' : 'Executing',
          renderOutputAsMarkdown: true,
        },
      ],
    } as any;
    addOrUpdateMessage(this.conversation_id, transformMessage(message));
    ipcBridge.codexConversation.responseStream.emit(message);
  }

  private emitStatus(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error', message: string) {
    const statusMsg: IResponseMessage = {
      type: 'acp_status',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: {
        backend: 'codex',
        status,
        message,
      },
    } as any;
    addOrUpdateMessage(this.conversation_id, transformMessage(statusMsg) as TMessage);
    ipcBridge.codexConversation.responseStream.emit(statusMsg);
  }

  private emitToolGroup(
    callId: string,
    item: {
      name: 'GoogleSearch' | 'Shell' | 'WriteFile' | 'ReadFile' | 'ImageGeneration';
      description: string;
      status: 'Executing' | 'Success' | 'Error' | 'Canceled' | 'Pending' | 'Confirming';
      renderOutputAsMarkdown: boolean;
      resultDisplay?: any;
    }
  ) {
    const message: IResponseMessage = {
      type: 'tool_group',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: [
        {
          callId,
          ...item,
        },
      ],
    } as any;
    addOrUpdateMessage(this.conversation_id, transformMessage(message));
    ipcBridge.codexConversation.responseStream.emit(message);
  }

  private summarizePatch(changes: Record<string, any> | undefined): string {
    if (!changes || typeof changes !== 'object') return '';
    const parts: string[] = [];
    for (const [path, change] of Object.entries(changes)) {
      if (change?.unified_diff) {
        parts.push(String(change.unified_diff));
        continue;
      }
      if (change?.content) {
        const content = String(change.content).split('\n').slice(0, 50).join('\n');
        parts.push(`--- ${path}\n+++ ${path}\n${content}`);
        continue;
      }
      parts.push(`# ${path}: modified`);
    }
    return parts.join('\n\n');
  }

  private formatMcpInvocation(invocation: any): string {
    if (!invocation) return 'mcp_tool()';
    const server = invocation.server || 'server';
    const tool = invocation.tool || 'tool';
    const args = invocation.arguments || {};
    let argsStr = '';
    try {
      argsStr = JSON.stringify(args);
    } catch {
      argsStr = '';
    }
    return argsStr ? `${server}.${tool}(${argsStr})` : `${server}.${tool}()`;
  }
}

export default CodexAgentManager;
