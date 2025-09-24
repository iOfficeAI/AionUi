import { AcpAgent } from '@/agent/acp';
import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/common/acpTypes';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IConfirmAcpMessageParams, IResponseMessage } from '@/common/ipcBridge';
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
    // this.initAgent(data);
  }

  private initAgent(data: AcpAgentManagerData) {
    if (this.bootstrap) return this.bootstrap;
    this.bootstrap = ProcessConfig.get('acp.config').then((config) => {
      let cliPath = data.cliPath;
      if (!cliPath && config[data.backend].cliPath) {
        cliPath = config[data.backend].cliPath;
      }
      this.agent = new AcpAgent({
        id: data.conversation_id,
        backend: data.backend,
        cliPath: cliPath,
        workingDir: data.workspace,
        onStreamEvent: (data) => {
          ipcBridge.acpConversation.responseStream.emit(data);
          data.conversation_id = this.conversation_id;
          const message = transformMessage(data);
          addOrUpdateMessage(this.conversation_id, message);
        },
        onSignalEvent: (data) => {
          // 仅发送信号到前端，不更新消息列表
          ipcBridge.acpConversation.responseStream.emit(data);
        },
      });
      return this.agent.start().then(() => this.agent);
    });
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
      addMessage(this.conversation_id, transformMessage(message));
      ipcBridge.acpConversation.responseStream.emit(message);
      return new Promise((_, reject) => {
        nextTickToLocalFinish(() => {
          reject(e);
        });
      });
    }
  }

  async confirmMessage(data: Omit<IConfirmAcpMessageParams, 'conversation_id'>) {
    await this.bootstrap;
    await this.agent.confirmMessage(data);
  }
}

export default AcpAgentManager;
