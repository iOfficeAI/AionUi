import { AcpAgent } from '@/agent/acp';
import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IConfirmMessageParams, IResponseMessage } from '@/common/ipcBridge';
import { parseError, uuid } from '@/common/utils';
import { ProcessConfig } from '../initStorage';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '../message';
import BaseAgentManager from './BaseAgentManager';

interface AcpAgentManagerData {
  workspace?: string;
  backend: AcpBackend;
  cliPath?: string;
  customWorkspace?: boolean;
  conversation_id: string;
}

class AcpAgentManager extends BaseAgentManager<AcpAgentManagerData> {
  workspace: string;
  agent: AcpAgent;
  private bootstrap: Promise<AcpAgent> | undefined;
  options: AcpAgentManagerData;

  constructor(data: AcpAgentManagerData) {
    super('acp', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data;
  }

  initAgent(data: AcpAgentManagerData = this.options) {
    if (this.bootstrap) return this.bootstrap;
    this.bootstrap = (async () => {
      let cliPath = data.cliPath;
      let customArgs: string[] | undefined;
      let customEnv: Record<string, string> | undefined;

      // Handle custom backend: read from acp.customAgent config
      if (data.backend === 'custom') {
        const customAgentConfig = await ProcessConfig.get('acp.customAgent');
        if (customAgentConfig?.defaultCliPath) {
          // Parse defaultCliPath which may contain command + args (e.g., "node /path/to/file.js" or "goose acp")
          const parts = customAgentConfig.defaultCliPath.trim().split(/\s+/);
          cliPath = parts[0]; // First part is the command
          if (parts.length > 1) {
            customArgs = parts.slice(1); // Remaining parts are args
          }
          customEnv = customAgentConfig.env;
        }
      } else {
        // Handle built-in backends: read from acp.config
        const config = await ProcessConfig.get('acp.config');
        if (!cliPath && config?.[data.backend]?.cliPath) {
          cliPath = config[data.backend].cliPath;
        }

        // Get acpArgs from backend config (for goose, auggie, etc.)
        const backendConfig = ACP_BACKENDS_ALL[data.backend];
        if (backendConfig?.acpArgs) {
          customArgs = backendConfig.acpArgs;
        }
      }

      this.agent = new AcpAgent({
        id: data.conversation_id,
        backend: data.backend,
        cliPath: cliPath,
        workingDir: data.workspace,
        customArgs: customArgs,
        customEnv: customEnv,
        onStreamEvent: (v) => {
          if (v.type !== 'thought') {
            const tMessage = transformMessage(v as IResponseMessage);
            if (tMessage) {
              addOrUpdateMessage(v.conversation_id, tMessage, data.backend);
            }
          }
          ipcBridge.acpConversation.responseStream.emit(v);
        },
        onSignalEvent: (v) => {
          // 仅发送信号到前端，不更新消息列表
          ipcBridge.acpConversation.responseStream.emit(v);
        },
      });
      return this.agent.start().then(() => this.agent);
    })();
    return this.bootstrap;
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{
    success: boolean;
    msg?: string;
    message?: string;
  }> {
    try {
      await this.initAgent(this.options);
      // Save user message to chat history ONLY after successful sending
      if (data.msg_id && data.content) {
        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: {
            content: data.content,
          },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);
        const userResponseMessage: IResponseMessage = {
          type: 'user_content',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id,
          data: userMessage.content.content,
        };
        ipcBridge.acpConversation.responseStream.emit(userResponseMessage);
      }
      return await this.agent.sendMessage(data);
    } catch (e) {
      const message: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: data.msg_id || uuid(),
        data: parseError(e),
      };

      // Backend handles persistence before emitting to frontend
      const tMessage = transformMessage(message);
      if (tMessage) {
        addOrUpdateMessage(this.conversation_id, tMessage);
      }

      // Emit to frontend for UI display only
      ipcBridge.acpConversation.responseStream.emit(message);
      return new Promise((_, reject) => {
        nextTickToLocalFinish(() => {
          reject(e);
        });
      });
    }
  }

  async confirmMessage(data: Omit<IConfirmMessageParams, 'conversation_id'>) {
    await this.bootstrap;
    await this.agent.confirmMessage(data);
  }
}

export default AcpAgentManager;
