import { CodexMcpAgent } from '@/agent/codex';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage, addOrUpdateMessage } from '../message';
import BaseAgentManager from './BaseAgentManager';
import fs from 'fs/promises';
import path from 'path';

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
  private currentContent: string = ''; // 手动累积内容
  private cmdBuffers: Map<string, { stdout: string; stderr: string; combined: string }> = new Map();
  private patchBuffers: Map<string, string> = new Map();
  private patchChanges: Map<string, Record<string, any>> = new Map();
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
        await this.agent.newSession(this.workspace);
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

    // Debug: Log all events from Codex to understand what events are actually sent

    if (type === 'agent_message_delta') {
      if (!this.currentLoadingId) {
        this.currentLoadingId = uuid();
        this.currentContent = ''; // 重置累积内容
      }

      // 累积delta内容
      const delta = evt.data?.delta || evt.data?.message || '';
      this.currentContent += delta;

      // 发送完整累积的内容，使用相同的msg_id确保替换loading
      const deltaMessage: IResponseMessage = {
        type: 'content',
        conversation_id: this.conversation_id,
        msg_id: this.currentLoadingId!,
        data: this.currentContent,
      };

      addOrUpdateMessage(this.conversation_id, transformMessage(deltaMessage));
      ipcBridge.codexConversation.responseStream.emit(deltaMessage);
      return;
    }

    if (type === 'agent_message') {
      if (!this.currentLoadingId) this.currentLoadingId = uuid();
      const messageContent = evt.data?.message || '';

      // Check if Codex is asking for file write permission
      if (this.isFileWriteRequest(messageContent)) {
        this.handleFileWriteRequest(messageContent);
        return; // Don't process as normal message
      }

      const message: IResponseMessage = {
        type: 'content',
        conversation_id: this.conversation_id,
        msg_id: this.currentLoadingId,
        data: messageContent,
      };
      addOrUpdateMessage(this.conversation_id, transformMessage(message));
      ipcBridge.codexConversation.responseStream.emit(message);
      return;
    }

    if (type === 'task_complete') {
      // 延迟重置，确保所有消息都使用同一个ID
      setTimeout(() => {
        this.currentLoadingId = null;
        this.currentContent = '';
      }, 100);

      // 不再发送finish消息，避免UI显示空对象
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

    // tool: patch approval request - convert to standard ACP permission
    if (type === 'apply_patch_approval_request') {
      const callId = evt.data?.call_id || uuid();
      const changes = evt.data?.changes || {};
      this.patchChanges.set(callId, changes);
      this.patchBuffers.set(callId, ''); // Initialize patch buffer
      this.pendingConfirmations.add(callId); // Add to pending confirmations

      const summary = this.summarizePatch(changes);
      const fileCount = Object.keys(changes).length;

      // Create ACP permission message directly like ACP does
      const permissionMessage: TMessage = {
        id: uuid(),
        conversation_id: this.conversation_id,
        type: 'acp_permission',
        position: 'center',
        createdAt: Date.now(),
        content: {
          title: 'File Write Permission',
          description: `Codex wants to write ${fileCount} file(s) to your workspace`,
          agentType: 'codex', // Add agent type to identify which confirmMessage handler to use
          options: [
            {
              optionId: 'allow_once',
              name: 'Allow',
              kind: 'allow_once',
              description: 'Allow this file operation',
            },
            {
              optionId: 'reject_once',
              name: 'Reject',
              kind: 'reject_once',
              description: 'Reject this file operation',
            },
          ],
          requestId: callId,
          toolCall: {
            title: 'Write File',
            toolCallId: callId,
            rawInput: {
              description: summary,
            },
          },
        },
      } as TMessage;

      // Send permission message directly, like ACP does
      addOrUpdateMessage(this.conversation_id, permissionMessage);
      return;
    }

    // tool: patch apply
    if (type === 'patch_apply_begin') {
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
      this.patchChanges.delete(callId);
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

    // Catch all unhandled events for debugging
    console.warn(`❌ [CodexAgentManager] Unhandled event type: "${type}"`, evt.data);
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{ success: boolean; msg?: string }> {
    await this.bootstrap;
    // User message will be added on renderer side to avoid duplication

    // 初始化新的对话轮次
    this.currentLoadingId = uuid();
    this.currentContent = '';

    // 不再发送开始信号，避免UI显示空对象

    // 简化：直接使用addOrUpdateMessage添加loading消息
    const loadingMessage: IResponseMessage = {
      type: 'content',
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId,
      data: 'loading...',
    };
    addOrUpdateMessage(this.conversation_id, transformMessage(loadingMessage));
    ipcBridge.codexConversation.responseStream.emit(loadingMessage);

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

    // If this confirmation corresponds to a pending patch, handle it properly
    if (this.patchBuffers.has(callId)) {
      try {
        // Resolve the permission in the MCP connection (like ACP does)
        this.agent.resolvePermission(callId, !isCancel);

        if (isCancel) {
          const message: IResponseMessage = {
            type: 'tool_group',
            conversation_id: this.conversation_id,
            msg_id: uuid(),
            data: [
              {
                callId,
                name: 'WriteFile',
                description: 'User canceled execution',
                status: 'Canceled',
                renderOutputAsMarkdown: true,
                resultDisplay: this.patchBuffers.get(callId) || '',
              },
            ],
          } as any;
          addOrUpdateMessage(this.conversation_id, transformMessage(message));
          ipcBridge.codexConversation.responseStream.emit(message);
        } else {
          // Update UI to show approval
          const message: IResponseMessage = {
            type: 'tool_group',
            conversation_id: this.conversation_id,
            msg_id: uuid(),
            data: [
              {
                callId,
                name: 'WriteFile',
                description: 'User approved - applying changes...',
                status: 'Executing',
                renderOutputAsMarkdown: true,
                resultDisplay: this.patchBuffers.get(callId) || '',
              },
            ],
          } as any;
          addOrUpdateMessage(this.conversation_id, transformMessage(message));
          ipcBridge.codexConversation.responseStream.emit(message);

          // Actually apply the changes
          await this.applyPatchChanges(callId);
        }
      } catch (error) {
        console.error('Failed to send approval response:', error);
      }
      return;
    }

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

  private isFileWriteRequest(message: string): boolean {
    const patterns = [/我可以.*创建文件/i, /要我现在执行吗/i, /将.*写入.*文件/i, /create.*file.*write/i, /write.*to.*file/i, /执行.*命令/i, /going to create.*\.txt/i, /going to create.*file/i, /create.*and write/i, /write.*into it/i];
    return patterns.some((pattern) => pattern.test(message));
  }

  private handleFileWriteRequest(message: string): void {
    const callId = uuid();

    // Extract file information from message
    let fileName = 'file.txt';
    let content = '';

    // Try to extract filename (e.g., "333.txt", "11.txt")
    const fileMatch = message.match(/(\w+\.\w+)/);
    if (fileMatch) {
      fileName = fileMatch[1];
    }

    // Try to extract content (e.g., echo content)
    const contentMatch = message.match(/echo.*['"]([^'"]*)['"]/);
    if (contentMatch) {
      content = contentMatch[1];
    }

    // Create permission request
    const permissionMessage: TMessage = {
      id: uuid(),
      conversation_id: this.conversation_id,
      type: 'acp_permission',
      position: 'center',
      createdAt: Date.now(),
      content: {
        title: 'File Write Permission',
        description: `Codex wants to create "${fileName}" in your workspace`,
        agentType: 'codex',
        options: [
          {
            optionId: 'allow_once',
            name: 'Allow',
            kind: 'allow_once',
            description: 'Allow this file operation',
          },
          {
            optionId: 'reject_once',
            name: 'Reject',
            kind: 'reject_once',
            description: 'Reject this file operation',
          },
        ],
        requestId: callId,
        toolCall: {
          title: 'Write File',
          toolCallId: callId,
          rawInput: {
            description: `Create ${fileName} with content: ${content}`,
          },
        },
      },
    } as TMessage;

    // Store file write info for later execution
    this.patchChanges.set(callId, {
      [fileName]: { content },
    });
    this.patchBuffers.set(callId, `Create file: ${fileName}\nContent: ${content}`);
    this.pendingConfirmations.add(callId);

    addOrUpdateMessage(this.conversation_id, permissionMessage);

    // Also emit through stream like other messages
    const streamMessage: IResponseMessage = {
      type: 'acp_permission',
      conversation_id: this.conversation_id,
      msg_id: permissionMessage.id,
      data: permissionMessage.content,
    };
    ipcBridge.codexConversation.responseStream.emit(streamMessage);
  }

  private async applyPatchChanges(callId: string): Promise<void> {
    const summary = this.patchBuffers.get(callId) || '';
    const changes = this.patchChanges.get(callId) || {};
    const baseDir = this.workspace || process.cwd();

    // Update UI to Executing
    this.emitToolGroup(callId, {
      name: 'WriteFile',
      description: 'Applying patch to workspace...',
      status: 'Executing',
      renderOutputAsMarkdown: true,
      resultDisplay: summary,
    });

    try {
      const entries = Object.entries(changes);
      for (const [relPath, change] of entries) {
        const content = change?.content;
        // Direct content write
        if (typeof content === 'string') {
          const fullPath = path.isAbsolute(relPath) ? relPath : path.join(baseDir, relPath);
          const dir = path.dirname(fullPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(fullPath, content, 'utf-8');
          continue;
        }

        // Unified diff application
        if (typeof change?.unified_diff === 'string') {
          const diffText = String(change.unified_diff);
          const fullPath = path.isAbsolute(relPath) ? relPath : path.join(baseDir, relPath);

          const { oldIsDevNull, newIsDevNull, hunks } = this.parseUnifiedDiff(diffText);

          // Deletion
          if (newIsDevNull) {
            try {
              await fs.rm(fullPath, { force: true });
            } catch {
              // Ignore deletion errors
            }
            continue;
          }

          // Read base content (empty if file not exists or oldIsDevNull)
          let base = '';
          if (!oldIsDevNull) {
            try {
              base = await fs.readFile(fullPath, 'utf-8');
            } catch {
              base = '';
            }
          }

          const next = this.applyUnifiedDiffToContent(base, hunks);
          const dir = path.dirname(fullPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(fullPath, next, 'utf-8');
          continue;
        }
      }

      // Success UI
      this.emitToolGroup(callId, {
        name: 'WriteFile',
        description: 'Patch applied successfully',
        status: 'Success',
        renderOutputAsMarkdown: true,
        resultDisplay: summary,
      });
    } catch (e: any) {
      this.emitToolGroup(callId, {
        name: 'WriteFile',
        description: `Patch apply failed: ${e?.message || String(e)}`,
        status: 'Error',
        renderOutputAsMarkdown: true,
        resultDisplay: summary,
      });
    } finally {
      this.patchBuffers.delete(callId);
      this.patchChanges.delete(callId);
    }
  }

  // --- Unified diff helpers ---
  private parseUnifiedDiff(diff: string): {
    oldIsDevNull: boolean;
    newIsDevNull: boolean;
    hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: Array<{ t: 'context' | 'add' | 'del'; s: string }>;
    }>;
  } {
    const lines = diff.replace(/\r\n?/g, '\n').split('\n');
    let idx = 0;
    let oldIsDevNull = false;
    let newIsDevNull = false;
    // Optional headers
    for (; idx < lines.length; idx++) {
      const l = lines[idx];
      if (l.startsWith('--- ')) {
        if (l.includes('/dev/null')) oldIsDevNull = true;
        continue;
      }
      if (l.startsWith('+++ ')) {
        if (l.includes('/dev/null')) newIsDevNull = true;
        idx++; // move past +++
        break;
      }
      if (l.startsWith('@@ ')) break; // directly into hunks
    }

    const hunks: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: Array<{ t: 'context' | 'add' | 'del'; s: string }> }> = [];
    while (idx < lines.length) {
      const header = lines[idx++];
      if (!header || !header.startsWith('@@')) break;
      const m = /@@\s*-([0-9]+)(?:,([0-9]+))?\s*\+([0-9]+)(?:,([0-9]+))?\s*@@/.exec(header);
      if (!m) continue;
      const oldStart = parseInt(m[1], 10);
      const oldLines = m[2] ? parseInt(m[2], 10) : 1;
      const newStart = parseInt(m[3], 10);
      const newLines = m[4] ? parseInt(m[4], 10) : 1;
      const hunkLines: Array<{ t: 'context' | 'add' | 'del'; s: string }> = [];
      while (idx < lines.length) {
        const l = lines[idx];
        if (l.startsWith('@@')) break;
        idx++;
        if (!l) continue;
        const tag = l[0];
        const text = l.slice(1);
        if (tag === ' ') hunkLines.push({ t: 'context', s: text });
        else if (tag === '+') hunkLines.push({ t: 'add', s: text });
        else if (tag === '-') hunkLines.push({ t: 'del', s: text });
        // lines starting with '\\' are metadata; ignore
      }
      hunks.push({ oldStart, oldLines, newStart, newLines, lines: hunkLines });
    }
    return { oldIsDevNull, newIsDevNull, hunks };
  }

  private applyUnifiedDiffToContent(base: string, hunks: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: Array<{ t: 'context' | 'add' | 'del'; s: string }> }>): string {
    const baseLines = base.replace(/\r\n?/g, '\n').split('\n');
    const out: string[] = [];
    let cursor = 0; // index in baseLines

    const pushRange = (from: number, toExclusive: number) => {
      for (let i = from; i < toExclusive && i < baseLines.length; i++) out.push(baseLines[i]);
    };

    for (const h of hunks) {
      const targetIdx = Math.max(0, h.oldStart - 1);
      // copy untouched part
      pushRange(cursor, targetIdx);
      cursor = targetIdx;

      for (const ln of h.lines) {
        if (ln.t === 'context') {
          // validate context
          const baseLine = baseLines[cursor] ?? '';
          if (baseLine !== ln.s) {
            throw new Error('Context mismatch while applying diff');
          }
          out.push(baseLine);
          cursor++;
        } else if (ln.t === 'del') {
          const baseLine = baseLines[cursor] ?? '';
          if (baseLine !== ln.s) {
            throw new Error('Deletion mismatch while applying diff');
          }
          cursor++; // skip (delete)
        } else if (ln.t === 'add') {
          out.push(ln.s);
        }
      }
    }
    // copy rest
    pushRange(cursor, baseLines.length);
    return out.join('\n');
  }
}

export default CodexAgentManager;
