import { AcpAgent } from '@/agent/acp';
import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/common/acpTypes';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IConfirmAcpMessageParams, IResponseMessage } from '@/common/ipcBridge';
import { parseError, uuid } from '@/common/utils';
import { ProcessConfig } from '../initStorage';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish, updateMessage } from '../message';
import BaseAgentManager from './BaseAgentManager';
import { t } from 'i18next';
import i18n from '@renderer/i18n';

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
  bootstrap: Promise<AcpAgent>;

  constructor(data: AcpAgentManagerData) {
    super('acp', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.initAgent(data);
  }

  initAgent(data: AcpAgentManagerData) {
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
        onReplaceLoadingMessage: (data) => {
          const replacementMessage: TMessage = {
            id: data.id, // Use assistant message ID
            msg_id: data.msg_id, // Set msg_id for proper composition
            type: 'text',
            position: 'left',
            conversation_id: this.conversation_id,
            content: {
              content: data.text,
            },
          };
          ipcBridge.acpConversation.responseStream.emit({
            type: 'content',
            conversation_id: this.conversation_id,
            msg_id: data.msg_id,
            data: data.text,
            isLoadingReplacement: true,
          });

          updateMessage(this.conversation_id, (messages: TMessage[]) => {
            const filteredMessages = messages.filter((msg) => msg.msg_id !== data.loadingMessageId);
            return [...filteredMessages, replacementMessage];
          });
        },
      });
      return this.agent.start().then(() => this.agent);
    });
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{
    success: boolean;
    msg?: string;
    message?: string;
  }> {
    try {
      await this.bootstrap;
      const loading_id = uuid();
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
      // 同时通知前端更新 UI
      const loadingResponseMessage: IResponseMessage = {
        type: 'content',
        conversation_id: this.conversation_id,
        msg_id: loading_id,
        data: i18n.t('common.loading'),
      };
      ipcBridge.acpConversation.responseStream.emit(loadingResponseMessage);
      return await this.agent.sendMessage({ ...data, loading_id });
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
    this.agent.confirmMessage(data);
  }
}

export default AcpAgentManager;
