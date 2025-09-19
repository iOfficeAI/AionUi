import { CodexMcpAgent } from '@/agent/codex';
import type { NetworkError } from '@/agent/codex/CodexMcpConnection';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addMessage, addOrUpdateMessage } from '../message';
import BaseAgentManager from './BaseAgentManager';
import fs from 'fs/promises';
import path from 'path';
import { t } from 'i18next';

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
  private currentRequestId: number | null = null; // 追踪当前请求ID
  private deltaTimeout: NodeJS.Timeout | null = null;
  private cmdBuffers: Map<string, { stdout: string; stderr: string; combined: string }> = new Map();
  private patchBuffers: Map<string, string> = new Map();
  private patchChanges: Map<string, Record<string, any>> = new Map();
  private pendingConfirmations: Set<string> = new Set();

  /**
   * 创建标准化的内容消息，确保data字段是有效的字符串
   */
  private createContentMessage(data: any, msgId?: string): IResponseMessage | null {
    let contentData: string;

    // 处理各种数据类型，确保得到有效的字符串内容
    if (typeof data === 'string') {
      contentData = data;
    } else if (data === null || data === undefined) {
      return null; // 过滤掉空内容
    } else if (typeof data === 'object') {
      // 如果是空对象，过滤掉整个消息
      if (Object.keys(data).length === 0) {
        return null;
      }
      // 尝试提取有意义的内容
      const extracted = data.content || data.message || data.text;
      if (extracted) {
        contentData = String(extracted);
      } else {
        return null; // 如果没有有意义的内容，过滤掉
      }
    } else {
      contentData = String(data);
    }

    // 如果最终内容为空字符串，也过滤掉
    if (!contentData || contentData.trim() === '') {
      return null;
    }

    return {
      type: 'content',
      conversation_id: this.conversation_id,
      msg_id: msgId || uuid(),
      data: contentData, // 保证这里的data是有效的字符串
    };
  }

  constructor(data: CodexAgentManagerData) {
    super('codex', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.bootstrap = this.initAgent(data).then((agent) => {
      // 恢复权限状态
      this.restorePendingPermissions();
      return agent;
    });
  }

  private initAgent(data: CodexAgentManagerData) {
    this.agent = new CodexMcpAgent({
      id: data.conversation_id,
      cliPath: data.cliPath,
      workingDir: data.workspace || process.cwd(),
      onEvent: (evt) => this.handleAgentEvent(evt),
      onNetworkError: (error) => this.handleNetworkError(error),
    });
    this.emitStatus('connecting', t('codex.status.connecting'));
    return this.agent
      .start()
      .then(async () => {
        this.emitStatus('connected', t('codex.status.connected'));
        await this.agent.newSession(this.workspace);
        this.emitStatus('session_active', t('codex.status.session_active'));
        return this.agent;
      })
      .catch((e) => {
        this.emitStatus('error', t('codex.status.error_connect', { error: e?.message || e }));
        throw e;
      });
  }

  private handleAgentEvent(evt: { type: string; data: any }) {
    const type = evt.type;

    // Handle special message types that need custom processing
    if (type === 'agent_message_delta') {
      // 提取requestId来分离不同的消息流
      const requestId = evt.data?._meta?.requestId || evt.data?.requestId;

      // 如果这是新的请求，重置累积状态
      if (requestId !== this.currentRequestId || !this.currentLoadingId) {
        // Clear any existing timeout
        if (this.deltaTimeout) {
          clearTimeout(this.deltaTimeout);
          this.deltaTimeout = null;
        }

        this.currentLoadingId = uuid();
        this.currentContent = ''; // 重置累积内容
        this.currentRequestId = requestId;
      }

      // 累积delta内容
      const delta = evt.data?.delta || evt.data?.message || '';
      this.currentContent += delta;

      // 发送完整累积的内容，使用相同的msg_id确保替换loading
      const deltaMessage = this.createContentMessage(this.currentContent, this.currentLoadingId!);
      if (deltaMessage) {
        addOrUpdateMessage(this.conversation_id, transformMessage(deltaMessage));
        ipcBridge.codexConversation.responseStream.emit(deltaMessage);
      }

      // Set/reset timeout to auto-finalize message if no completion event is received
      if (this.deltaTimeout) {
        clearTimeout(this.deltaTimeout);
      }
      this.deltaTimeout = setTimeout(() => {
        if (this.currentContent && this.currentContent.trim() && this.currentLoadingId) {
          // Send finish signal to UI
          const finishMessage: IResponseMessage = {
            type: 'finish',
            conversation_id: this.conversation_id,
            msg_id: this.currentLoadingId,
            data: {},
          };
          ipcBridge.codexConversation.responseStream.emit(finishMessage);
        }

        // Reset state
        this.currentLoadingId = null;
        this.currentContent = '';
        this.currentRequestId = null;
        this.deltaTimeout = null;
      }, 3000); // 3 second timeout

      return;
    }

    if (type === 'agent_message') {
      // Clear timeout since we're finalizing the message
      if (this.deltaTimeout) {
        clearTimeout(this.deltaTimeout);
        this.deltaTimeout = null;
      }

      // 提取requestId确保与对应的delta消息关联
      const requestId = evt.data?._meta?.requestId || evt.data?.requestId;

      // 如果没有当前loading ID或requestId不匹配，创建新的
      if (requestId !== this.currentRequestId || !this.currentLoadingId) {
        this.currentLoadingId = uuid();
        this.currentRequestId = requestId;
      }

      const messageContent = evt.data?.message || '';

      // Use accumulated content if available, otherwise use the direct message
      const finalContent = this.currentContent || messageContent;

      const message = this.createContentMessage(finalContent, this.currentLoadingId);
      if (message) {
        addOrUpdateMessage(this.conversation_id, transformMessage(message));
        ipcBridge.codexConversation.responseStream.emit(message);
      }
      return;
    }

    if (type === 'task_complete') {
      // Clear timeout since we're finalizing the task
      if (this.deltaTimeout) {
        clearTimeout(this.deltaTimeout);
        this.deltaTimeout = null;
      }

      // If we have accumulated content but no final agent_message was sent, send it now
      if (this.currentContent && this.currentContent.trim() && this.currentLoadingId) {
        const message = this.createContentMessage(this.currentContent, this.currentLoadingId);
        if (message) {
          addOrUpdateMessage(this.conversation_id, transformMessage(message));
          ipcBridge.codexConversation.responseStream.emit(message);
        }
      }

      // Send finish signal to UI
      const finishMessage: IResponseMessage = {
        type: 'finish',
        conversation_id: this.conversation_id,
        msg_id: this.currentLoadingId || uuid(),
        data: {},
      };
      ipcBridge.codexConversation.responseStream.emit(finishMessage);

      // 延迟重置，确保所有消息都使用同一个ID
      setTimeout(() => {
        this.currentLoadingId = null;
        this.currentContent = '';
      }, 100);

      return;
    }

    // Handle reasoning deltas and reasoning messages - ignore them as they're internal Codex thoughts
    if (type === 'agent_reasoning_delta' || type === 'agent_reasoning') {
      // These are Codex's internal reasoning steps, not user-facing content
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

    // Handle permission requests through unified transformMessage
    if (type === 'apply_patch_approval_request' || type === 'elicitation/create') {
      const originalCallId = evt.data?.call_id || evt.data?.codex_call_id || uuid();

      // Create unique ID combining message type and call_id to match UI expectation
      const uniqueRequestId = type === 'apply_patch_approval_request' ? `patch_${originalCallId}` : `elicitation_${originalCallId}`;

      // Check if we've already processed this call_id to avoid duplicates
      if (this.pendingConfirmations.has(uniqueRequestId)) {
        return;
      }

      // Store patch changes for later execution
      if (evt.data?.changes || evt.data?.codex_changes) {
        const changes = evt.data.changes || evt.data.codex_changes;

        // Store with unique ID for both permission handling and MCP connection
        // Keep original ID mapping for MCP resolvePermission call
        this.patchChanges.set(uniqueRequestId, changes);
        this.patchBuffers.set(uniqueRequestId, this.summarizePatch(changes));
        this.pendingConfirmations.add(uniqueRequestId);
      }

      // Use unified transformMessage to handle the message
      const responseMessage: IResponseMessage = {
        type: type,
        data: evt.data,
        msg_id: uuid(),
        conversation_id: this.conversation_id,
      };

      const transformedMessage = transformMessage(responseMessage);

      if (transformedMessage) {
        addOrUpdateMessage(this.conversation_id, transformedMessage, true); // 立即保存权限消息
        // Send the transformed message with correct type to UI
        const uiMessage: IResponseMessage = {
          type: transformedMessage.type as any,
          data: transformedMessage.content,
          msg_id: transformedMessage.msg_id || responseMessage.msg_id,
          conversation_id: this.conversation_id,
        };
        ipcBridge.codexConversation.responseStream.emit(uiMessage);
      }
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

  /**
   * 恢复权限确认状态 - 从历史消息中重建未完成的权限请求
   */
  private async restorePendingPermissions(): Promise<void> {
    try {
      const { ProcessChatMessage } = await import('../initStorage');
      const messages = await ProcessChatMessage.get(this.conversation_id);

      if (!Array.isArray(messages)) return;

      // 查找未完成的权限请求
      for (const message of messages) {
        if (message.type === 'acp_permission' && message.content) {
          const content = message.content as any;
          if (content.requestId && content.toolCall) {
            // 检查是否有对应的完成状态
            const hasCompletion = messages.some((m) => m.type === 'tool_group' && m.content && Array.isArray((m.content as any).data) && (m.content as any).data.some((tool: any) => tool.callId === content.requestId && ['Success', 'Error', 'Canceled'].includes(tool.status)));

            if (!hasCompletion) {
              // 恢复权限确认状态
              this.pendingConfirmations.add(content.requestId);

              // 如果有相关的补丁数据，也恢复它
              if (content.toolCall && content.toolCall.rawInput) {
                try {
                  const changes = content.toolCall.rawInput.changes || content.toolCall.rawInput.codex_changes;
                  if (changes) {
                    this.patchChanges.set(content.requestId, changes);
                    this.patchBuffers.set(content.requestId, this.summarizePatch(changes));
                  }
                } catch (error) {
                  console.warn(`⚠️ [CodexAgentManager] Failed to restore patch data for ${content.requestId}:`, error);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ [CodexAgentManager] Failed to restore pending permissions:', error);
    }
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{ success: boolean; msg?: string }> {
    await this.bootstrap;
    // Persist user message to chat history to avoid loss after reload
    // Note: we do NOT emit a 'user_content' event here to prevent UI duplication,
    // renderer already inserts the right-hand message immediately.
    if (data.msg_id && typeof data.content === 'string' && data.content.trim()) {
      const userMessage: TMessage = {
        id: data.msg_id,
        msg_id: data.msg_id,
        type: 'text',
        position: 'right',
        conversation_id: this.conversation_id,
        content: { content: data.content },
        createdAt: Date.now(),
      };
      addMessage(this.conversation_id, userMessage, true); // 立即保存用户消息
    }

    // Debug: allow triggering Codex-like events without contacting MCP
    // Usage: send content like "__CODEX_TEST__:type" or "__CODEX_TEST__:all"
    if (typeof data.content === 'string' && data.content.startsWith('__CODEX_TEST__:')) {
      const which = data.content.replace('__CODEX_TEST__:', '').trim();
      const emit = (msg: IResponseMessage) => {
        // Emit raw message exactly as Codex stream would
        ipcBridge.codexConversation.responseStream.emit(msg);
      };

      const make = (type: string, payload: any = {}, customMsgId?: string): IResponseMessage => ({
        type,
        conversation_id: this.conversation_id,
        msg_id: customMsgId || uuid(),
        data: payload,
      });

      const cases = {
        error: () => emit(make('error', 'Sample error from Codex')),
        content: () => emit(make('content', 'Sample content delta/final')),
        tool_call: () =>
          emit(
            make('tool_call', {
              callId: uuid(),
              name: 'Shell',
              args: { command: ['echo', 'hi'] },
              status: 'success',
            })
          ),
        tool_group: () =>
          emit(
            make('tool_group', [
              {
                callId: uuid(),
                description: 'Run echo',
                name: 'Shell',
                renderOutputAsMarkdown: true,
                status: 'Executing',
                resultDisplay: 'hi\n',
              },
            ])
          ),
        acp_status: () => emit(make('acp_status', { backend: 'codex', status: 'connected', message: 'connected' })),
        acp_permission: () =>
          emit(
            make('acp_permission', {
              title: 'Permission needed',
              description: 'Allow executing a command',
              agentType: 'codex',
              options: [
                { optionId: 'allow_once', name: 'Allow Once', kind: 'allow_once' },
                { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' },
              ],
              requestId: uuid(),
              toolCall: { title: 'Shell', toolCallId: uuid(), rawInput: { command: 'echo hi' } },
            })
          ),
        apply_patch_approval_request: () =>
          emit(
            make('apply_patch_approval_request', {
              call_id: uuid(),
              description: 'Apply changes to files',
              changes: {
                'README.md': { type: 'modify', unified_diff: '--- a/README.md\n+++ b/README.md\n+test' },
              },
            })
          ),
        'elicitation/create': () =>
          emit(
            make('elicitation/create', {
              codex_elicitation: 'patch-approval',
              message: 'Approve these file edits?',
              requestedSchema: { type: 'object', properties: { approve: { type: 'boolean' } } },
              codex_call_id: uuid(),
              codex_changes: {
                'src/index.ts': { type: 'add', content: 'export {}\n' },
              },
            })
          ),
        start: () => emit(make('start', { ts: Date.now() })),
        finish: () => emit(make('finish', { ts: Date.now() })),
        thought: () => emit(make('thought', { delta: 'thinking...' })),
      } as const;

      const allOrder: Array<keyof typeof cases> = ['start', 'acp_status', 'content', 'tool_call', 'tool_group', 'apply_patch_approval_request', 'elicitation/create', 'acp_permission', 'error', 'thought', 'finish'];

      if (which === 'all') {
        for (const k of allOrder) cases[k]();
      } else if (which in cases) {
        cases[which as keyof typeof cases]();
      } else {
        emit(make('error', `Unknown __CODEX_TEST__ type: ${which}`));
      }

      return { success: true };
    }

    // 初始化新的对话轮次
    this.currentLoadingId = uuid();
    this.currentContent = '';

    // 不再发送开始信号，避免UI显示空对象

    // 简化：直接使用addOrUpdateMessage添加loading消息
    const loadingMessage = this.createContentMessage(t('common.loading'), this.currentLoadingId);
    if (loadingMessage) {
      addOrUpdateMessage(this.conversation_id, transformMessage(loadingMessage));
      ipcBridge.codexConversation.responseStream.emit(loadingMessage);
    }

    // 构建包含文件信息的提示
    let prompt = data.content;
    if (data.files && data.files.length > 0) {
      const fileList = data.files.map((f) => path.basename(f)).join(', ');

      // 检查用户请求的类型 - 如果是解析、读取、分析类请求，使用特殊格式
      const isReadRequest = /(?:解析|读取|分析|查看|read|parse|analyze|view|check|examine)/i.test(data.content);

      if (isReadRequest) {
        // 读取文件内容并包含在提示中
        const fileContents: string[] = [];
        for (const file of data.files) {
          let filePath: string;
          if (path.isAbsolute(file)) {
            filePath = file;
          } else {
            filePath = path.join(this.workspace || process.cwd(), file);
          }

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const fileName = path.basename(filePath);
            fileContents.push(`=== ${fileName} ===\n${content}\n=== END ${fileName} ===`);
          } catch (error) {
            console.warn(`⚠️ [CodexAgentManager] Failed to read file: ${filePath}`, error);
            fileContents.push(`=== ${path.basename(filePath)} ===\n[File not readable or not found]\n=== END ${path.basename(filePath)} ===`);
          }
        }

        // 明确指示这是读取请求，包含实际文件内容
        prompt = `IMPORTANT: The user wants to READ and ANALYZE existing files, NOT create new ones.

The following files already exist in the workspace with their current contents:

${fileContents.join('\n\n')}

Please analyze the above file contents and answer the user's question. Do NOT create new files.

User request: ${data.content}`;
      } else {
        // 对于其他类型的请求，保持原有格式
        prompt = `[Context: The following files already exist in the workspace and can be read/analyzed: ${fileList}]\n\n${data.content}`;
      }
    }

    // Send prompt
    await this.agent.sendPrompt(prompt);

    return { success: true };
  }

  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }): Promise<void> {
    // 由于 Codex MCP 目前不支持外部暂停/继续，这里仅更新前端展示状态
    const callId = data.callId;
    if (!callId) {
      return;
    }

    if (!this.pendingConfirmations.has(callId)) {
      return;
    }

    const outcome = String(data.confirmKey || 'cancel').toLowerCase();
    const isCancel = outcome.includes('cancel');

    this.pendingConfirmations.delete(callId);

    // Extract original call_id from unique ID for MCP connection
    const originalCallId = callId.startsWith('patch_') ? callId.substring(6) : callId.startsWith('elicitation_') ? callId.substring(12) : callId;

    // If this confirmation corresponds to a pending patch, handle it properly

    if (this.patchBuffers.has(callId)) {
      try {
        // Resolve the permission in the MCP connection with original call_id
        this.agent.resolvePermission(originalCallId, !isCancel);

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
        // Handle new Codex data structure with { add: {...} }
        let content = change?.content;
        if (!content && change?.add) {
          // Try to extract content from add structure
          content = change.add?.content || change.add?.text || change.add?.data;
          if (Array.isArray(change.add) && change.add.length > 0) {
            content = change.add.map((item: any) => item?.content || item?.text || item).join('');
          }
        }
        // Rename / Move file (change extension) e.g. { type: 'rename', new_path: 'path/newname.ext' }
        if (change?.type === 'rename' && typeof change?.new_path === 'string') {
          const fromPath = path.isAbsolute(relPath) ? relPath : path.join(baseDir, relPath);
          const toRel = String(change.new_path);
          const toPath = path.isAbsolute(toRel) ? toRel : path.join(baseDir, toRel);
          const toDir = path.dirname(toPath);
          await fs.mkdir(toDir, { recursive: true });
          try {
            await fs.rename(fromPath, toPath);
          } catch (e) {
            // Fallback: copy + delete (handles cross-device or missing src cases)
            const buf = await fs.readFile(fromPath);
            await fs.writeFile(toPath, buf);
            await fs.rm(fromPath, { force: true });
          }
          continue;
        }

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

  private handleNetworkError(error: NetworkError): void {
    // Emit network error as status message
    this.emitStatus('error', `Network Error: ${error.suggestedAction}`);

    // Create a user-friendly error message based on error type
    let userMessage = '';
    let recoveryActions: string[] = [];

    switch (error.type) {
      case 'cloudflare_blocked':
        // For Codex, we know it's always Codex service
        userMessage = t('codex.network.cloudflare_blocked_title', { service: 'Codex' });
        recoveryActions = ['• 使用 VPN 或代理服务', '• 更换网络环境（如移动热点）', '• 等待 10-30 分钟后重试', '• 清除浏览器缓存和 Cookie', '• 切换到其他可用服务：ChatGPT、Claude、Qwen、Gemini'];
        break;

      case 'network_timeout':
        userMessage = t('codex.network.network_timeout_title');
        recoveryActions = ['• 检查网络连接是否稳定', '• 重试连接操作', '• 切换到更稳定的网络环境', '• 检查防火墙设置'];
        break;

      case 'connection_refused':
        userMessage = t('codex.network.connection_refused_title');
        recoveryActions = ['• 检查 Codex CLI 是否正确安装', '• 验证服务配置和API密钥', '• 重启应用程序', '• 检查本地端口是否被占用'];
        break;

      default:
        userMessage = t('codex.network.unknown_error_title');
        recoveryActions = ['• 检查网络连接状态', '• 重试当前操作', '• 切换网络环境', '• 联系技术支持'];
    }

    // Create detailed error message for UI
    const detailedMessage = `${userMessage}\n\n${t('codex.network.recovery_suggestions')}\n${recoveryActions.join('\n')}\n\n${t('codex.network.technical_info')}\n- ${t('codex.network.error_type')}：${error.type}\n- ${t('codex.network.retry_count')}：${error.retryCount}\n- ${t('codex.network.error_details')}：${error.originalError.substring(0, 200)}${error.originalError.length > 200 ? '...' : ''}`;

    // Emit as error message to UI
    const errorMessage: IResponseMessage = {
      type: 'error',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: detailedMessage,
    };

    addOrUpdateMessage(this.conversation_id, transformMessage(errorMessage));
    ipcBridge.codexConversation.responseStream.emit(errorMessage);

    // If it's a Cloudflare block, provide specific service switching guidance
    if (error.type === 'cloudflare_blocked') {
      const suggestionMessage = this.createContentMessage(`${t('codex.network.quick_switch_title')}\n\n${t('codex.network.quick_switch_content')}`);

      if (suggestionMessage) {
        addOrUpdateMessage(this.conversation_id, transformMessage(suggestionMessage));
        ipcBridge.codexConversation.responseStream.emit(suggestionMessage);
      }
    }
  }
}

export default CodexAgentManager;
