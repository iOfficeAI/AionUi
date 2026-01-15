import { AcpAgent } from '@/agent/acp';
import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import type { TMessage } from '@/common/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/constants';
import { transformMessage } from '@/common/chatLib';
import type { IConfirmMessageParams, IResponseMessage } from '@/common/ipcBridge';
import { parseError, uuid } from '@/common/utils';
import { ProcessConfig, loadSkillsContent } from '../initStorage';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '../message';
import BaseAgentManager from './BaseAgentManager';
import { handlePreviewOpenEvent } from '../utils/previewUtils';

interface AcpAgentManagerData {
  workspace?: string;
  backend: AcpBackend;
  cliPath?: string;
  customWorkspace?: boolean;
  conversation_id: string;
  customAgentId?: string; // 用于标识特定自定义代理的 UUID / UUID for identifying specific custom agent
  presetContext?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
  /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
  enabledSkills?: string[];
}

class AcpAgentManager extends BaseAgentManager<AcpAgentManagerData> {
  workspace: string;
  agent: AcpAgent;
  private bootstrap: Promise<AcpAgent> | undefined;
  private isFirstMessage: boolean = true;
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

      // 处理自定义后端：从 acp.customAgents 配置数组中读取
      // Handle custom backend: read from acp.customAgents config array
      if (data.backend === 'custom' && data.customAgentId) {
        const customAgents = await ProcessConfig.get('acp.customAgents');
        // 通过 UUID 查找对应的自定义代理配置 / Find custom agent config by UUID
        const customAgentConfig = customAgents?.find((agent) => agent.id === data.customAgentId);
        if (customAgentConfig?.defaultCliPath) {
          // Parse defaultCliPath which may contain command + args (e.g., "node /path/to/file.js" or "goose acp")
          const parts = customAgentConfig.defaultCliPath.trim().split(/\s+/);
          cliPath = parts[0]; // First part is the command

          // 参数优先级：acpArgs > defaultCliPath 中解析的参数
          // Argument priority: acpArgs > args parsed from defaultCliPath
          if (customAgentConfig.acpArgs) {
            customArgs = customAgentConfig.acpArgs;
          } else if (parts.length > 1) {
            customArgs = parts.slice(1); // Fallback to parsed args
          }
          customEnv = customAgentConfig.env;
        }
      } else if (data.backend !== 'custom') {
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
      } else {
        // backend === 'custom' but no customAgentId - this is an invalid state
        // 自定义后端但缺少 customAgentId - 这是无效状态
        console.warn('[AcpAgentManager] Custom backend specified but customAgentId is missing');
      }

      this.agent = new AcpAgent({
        id: data.conversation_id,
        backend: data.backend,
        cliPath: cliPath,
        workingDir: data.workspace,
        customArgs: customArgs,
        customEnv: customEnv,
        onStreamEvent: (v) => {
          // Handle preview_open event (chrome-devtools navigation interception)
          // 处理 preview_open 事件（chrome-devtools 导航拦截）
          if (handlePreviewOpenEvent(v)) {
            return; // Don't process further / 不需要继续处理
          }

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
        let contentToSend = data.content;
        if (contentToSend.includes(AIONUI_FILES_MARKER)) {
          contentToSend = contentToSend.split(AIONUI_FILES_MARKER)[0].trimEnd();
        }

        // 首条消息时注入预设规则和 skills（来自智能助手配置）
        // Inject preset context and skills on first message (from smart assistant config)
        if (this.isFirstMessage) {
          const systemInstructions: string[] = [];

          if (this.options.presetContext) {
            systemInstructions.push(this.options.presetContext);
          }

          // 加载并注入 enabledSkills / Load and inject enabledSkills
          if (this.options.enabledSkills && this.options.enabledSkills.length > 0) {
            const skillsContent = await loadSkillsContent(this.options.enabledSkills);
            if (skillsContent) {
              systemInstructions.push(skillsContent);
            }
          }

          if (systemInstructions.length > 0) {
            contentToSend = `${contentToSend}\n\n<system_instruction>\n${systemInstructions.join('\n\n')}\n</system_instruction>`;
          }
        }

        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: {
            content: data.content, // Save original content to history
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

        const result = await this.agent.sendMessage({ ...data, content: contentToSend });
        // 首条消息发送后标记，无论是否有 presetContext
        if (this.isFirstMessage) {
          this.isFirstMessage = false;
        }
        return result;
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
