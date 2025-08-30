/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/core/ConfigManager.ts
import { GeminiKeyManager, KeyStatus } from '@/common/keyManager';
import type { TModelWithConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import type { CompletedToolCall, Config, GeminiClient, ServerGeminiStreamEvent, ToolCall, ToolCallRequestInfo } from '@office-ai/aioncli-core';
import { AuthType, CoreToolScheduler, sessionId } from '@office-ai/aioncli-core';
import { execSync } from 'child_process';
import { handleAtCommand } from './cli/atCommandProcessor';
import { loadCliConfig, loadHierarchicalGeminiMemory } from './cli/config';
import type { Extension } from './cli/extension';
import { loadExtensions } from './cli/extension';
import type { Settings } from './cli/settings';
import { loadSettings } from './cli/settings';
import { ConversationToolConfig } from './cli/tools/conversation-tool-config';
import { mapToDisplay } from './cli/useReactToolScheduler';
import { getPromptCount, handleCompletedTools, processGeminiStreamEvents, startNewPrompt } from './utils';

function mergeMcpServers(settings: ReturnType<typeof loadSettings>['merged'], extensions: Extension[]) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  for (const extension of extensions) {
    Object.entries(extension.config.mcpServers || {}).forEach(([key, server]) => {
      if (mcpServers[key]) {
        console.warn(`Skipping extension MCP config for server with key "${key}" as it already exists.`);
        return;
      }
      mcpServers[key] = server;
    });
  }
  return mcpServers;
}

interface GeminiAgent2Options {
  workspace: string;
  proxy?: string;
  model: TModelWithConversation;
  imageGenerationModel?: TModelWithConversation;
  onStreamEvent: (event: { type: string; data: any; msg_id: string }) => void;
}

export class GeminiAgent {
  config: Config | null = null;
  private workspace: string | null = null;
  private proxy: string | null = null;
  private activeModel: TModelWithConversation | null = null;
  private keyManager: GeminiKeyManager;
  private imageGenerationModel: TModelWithConversation | null = null;
  private geminiClient: GeminiClient | null = null;
  private authType: AuthType | null = null;
  private scheduler: CoreToolScheduler | null = null;
  private trackedCalls: ToolCall[] = [];
  private abortController: AbortController | null = null;
  private onStreamEvent: (event: { type: string; data: any; msg_id: string }) => void;
  private toolConfig: ConversationToolConfig; // 对话级别的工具配置
  bootstrap: Promise<void>;
  constructor(options: GeminiAgent2Options) {
    this.workspace = options.workspace;
    this.proxy = options.proxy;
    this.imageGenerationModel = options.imageGenerationModel;
    this.keyManager = GeminiKeyManager.getInstance();
    this.keyManager.setInitialKey(options.model.apiKey);
    this.onStreamEvent = options.onStreamEvent;
    this.toolConfig = new ConversationToolConfig({
      proxy: this.proxy,
      imageGenerationModel: this.imageGenerationModel,
    });
    this.bootstrap = this.initialize();
  }

  private initClientEnv() {
    const env = this.getEnv();
    const fallbackValue = (key: string, value1: string, value2?: string) => {
      if (value1 && value1 !== 'undefined') {
        process.env[key] = value1;
      }
      if (value2 && value2 !== 'undefined') {
        process.env[key] = value2;
      }
    };

    if (this.authType === AuthType.USE_GEMINI) {
      fallbackValue('GEMINI_API_KEY', this.activeModel.apiKey);
      fallbackValue('GOOGLE_GEMINI_BASE_URL', this.activeModel.baseUrl);
      return;
    }
    if (this.authType === AuthType.USE_VERTEX_AI) {
      fallbackValue('GOOGLE_API_KEY', this.activeModel.apiKey);
      process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
      return;
    }
    if (this.authType === AuthType.LOGIN_WITH_GOOGLE) {
      fallbackValue('GOOGLE_CLOUD_PROJECT', '', env.GOOGLE_CLOUD_PROJECT); //@todo接入配置
      return;
    }
    if (this.authType === AuthType.USE_OPENAI) {
      fallbackValue('OPENAI_BASE_URL', this.activeModel.baseUrl);
      fallbackValue('OPENAI_API_KEY', this.activeModel.apiKey);
    }
  }

  // 加载环境变量
  private getEnv() {
    let command = '';
    if (process.platform === 'win32') {
      command = 'cmd /c set';
    }
    if (process.platform === 'darwin') {
      command = "zsh -ic 'env'";
    }
    if (!command) return {};

    const envOutput = execSync(command, { encoding: 'utf8' });

    return envOutput.split('\n').reduce<Record<string, string>>((acc, line) => {
      const [key, ...value] = line.split('=');
      acc[key] = value.join('=').replace(/\r$/, '');
      return acc;
    }, {});
  }
  private createAbortController() {
    this.abortController = new AbortController();
    return this.abortController;
  }

  private async initialize(): Promise<void> {
    this.activeModel = await this.keyManager.getKey();
    if (!this.activeModel) {
      throw new Error('No available Gemini API key.');
    }

    const platform = this.activeModel.platform;
    if (platform === 'gemini-with-google-auth') {
      this.authType = AuthType.LOGIN_WITH_GOOGLE;
    } else if (platform === 'gemini') {
      this.authType = AuthType.USE_GEMINI;
    } else if (platform === 'gemini-vertex-ai') {
      this.authType = AuthType.USE_VERTEX_AI;
    } else {
      this.authType = AuthType.USE_OPENAI;
    }
    this.initClientEnv();

    const path = this.workspace;

    const settings = loadSettings(path).merged;

    // 初始化对话级别的工具配置
    await this.toolConfig.initializeForConversation(this.authType!);

    const extensions = loadExtensions(path);
    this.config = await loadCliConfig({
      workspace: path,
      settings,
      extensions,
      sessionId,
      proxy: this.proxy,
      model: this.activeModel.useModel,
      conversationToolConfig: this.toolConfig,
    });
    await this.config.initialize();

    await this.config.refreshAuth(this.authType || AuthType.USE_GEMINI);

    this.geminiClient = this.config.getGeminiClient();

    // 注册对话级别的自定义工具
    await this.toolConfig.registerCustomTools(this.config, this.geminiClient);

    this.initToolScheduler(settings);
  }

  // 初始化调度工具
  private initToolScheduler(settings: Settings) {
    this.scheduler = new CoreToolScheduler({
      toolRegistry: this.config.getToolRegistry(),
      onAllToolCallsComplete: async (completedToolCalls: CompletedToolCall[]) => {
        try {
          if (completedToolCalls.length > 0) {
            const refreshMemory = async () => {
              const config = this.config;
              const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(this.workspace, [], config.getDebugMode(), config.getFileService(), settings, config.getExtensionContextFilePaths());
              config.setUserMemory(memoryContent);
              config.setGeminiMdFileCount(fileCount);
            };
            const response = await handleCompletedTools(completedToolCalls, this.geminiClient, refreshMemory);
            if (response.length > 0) {
              const geminiTools = completedToolCalls.filter((tc) => {
                const isTerminalState = tc.status === 'success' || tc.status === 'error' || tc.status === 'cancelled';

                if (isTerminalState) {
                  const completedOrCancelledCall = tc;
                  return completedOrCancelledCall.response?.responseParts !== undefined && !tc.request.isClientInitiated;
                }
                return false;
              });

              console.log('geminiTools.done.request>>>>>>>>>>>>>>>>>>>', geminiTools[0].request.prompt_id);

              this.submitQuery(response, uuid(), this.createAbortController(), {
                isContinuation: true,
                prompt_id: geminiTools[0].request.prompt_id,
              });
            }
          }
        } catch (e) {
          this.onStreamEvent({
            type: 'error',
            data: 'handleCompletedTools error: ' + (e.message || JSON.stringify(e)),
            msg_id: uuid(),
          });
        }
      },
      onToolCallsUpdate: (updatedCoreToolCalls: ToolCall[]) => {
        try {
          const prevTrackedCalls = this.trackedCalls || [];
          const toolCalls = updatedCoreToolCalls.map((coreTc) => {
            const existingTrackedCall = prevTrackedCalls.find((ptc) => ptc.request.callId === coreTc.request.callId);
            const newTrackedCall = {
              ...coreTc,
              responseSubmittedToGemini: (existingTrackedCall as any)?.responseSubmittedToGemini ?? false,
            };
            return newTrackedCall;
          });
          const display = mapToDisplay(toolCalls);
          this.onStreamEvent({
            type: 'tool_group',
            data: display.tools,
            msg_id: uuid(),
          });
        } catch (e) {
          this.onStreamEvent({
            type: 'error',
            data: 'tool_calls_update error: ' + (e.message || JSON.stringify(e)),
            msg_id: uuid(),
          });
        }
      },
      onEditorClose() {
        console.log('onEditorClose');
      },
      // approvalMode: this.config.getApprovalMode(),
      getPreferredEditor() {
        return 'vscode';
      },
      config: this.config,
    });
  }

  private async handleMessage(stream: AsyncGenerator<ServerGeminiStreamEvent, any, any>, msg_id: string, abortController: AbortController): Promise<any> {
    const toolCallRequests: ToolCallRequestInfo[] = [];

    return processGeminiStreamEvents(stream, this.config, (data) => {
      if (data.type === 'tool_call_request') {
        toolCallRequests.push(data.data);
        return;
      }
      this.onStreamEvent({
        ...data,
        msg_id,
      });
    })
      .then(() => {
        if (toolCallRequests.length > 0) {
          this.scheduler.schedule(toolCallRequests, abortController.signal);
        }
      })
      .catch((e) => {
        this.onStreamEvent({
          type: 'error',
          data: e.message,
          msg_id,
        });
      });
  }

  async submitQuery(
    query: any,
    msg_id: string,
    abortController: AbortController,
    options?: {
      prompt_id?: string;
      isContinuation?: boolean;
    }
  ) {
    const maxRetries = this.keyManager.getKeysStatus().length > 0 ? this.keyManager.getKeysStatus().length : 1;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        let prompt_id = options?.prompt_id;
        if (!prompt_id) {
          prompt_id = this.config.getSessionId() + '########' + getPromptCount();
        }
        if (!options?.isContinuation) {
          startNewPrompt();
        }
        const stream = await this.geminiClient.sendMessageStream(query, abortController.signal, prompt_id);
        this.onStreamEvent({
          type: 'start',
          data: '',
          msg_id,
        });
        this.handleMessage(stream, msg_id, abortController)
          .catch((e: any) => {
            this.onStreamEvent({
              type: 'error',
              data: e?.message || JSON.stringify(e),
              msg_id,
            });
          })
          .finally(() => {
            this.onStreamEvent({
              type: 'finish',
              data: '',
              msg_id,
            });
          });
        return '';
      } catch (e) {
        if (this.isInvalidAuthError(e)) {
          this.keyManager.setKeyStatus(this.activeModel.apiKey, KeyStatus.Invalid);
        } else if (this.isRateLimitError(e)) {
          this.keyManager.setKeyStatus(this.activeModel.apiKey, KeyStatus.RateLimited, Date.now() + 60 * 1000); // 1 minute cooldown
        }

        const newModel = await this.keyManager.getKey();
        if (newModel) {
          this.activeModel = newModel;
          await this.reInitializeClient();
          ipcBridge.gemini.keyRotated.emit({ newApiKey: newModel.apiKey });
          retries++;
          continue;
        }

        this.onStreamEvent({
          type: 'error',
          data: e.message,
          msg_id,
        });
        return;
      }
    }
    this.onStreamEvent({
      type: 'error',
      data: 'All API keys are rate-limited. Please try again later.',
      msg_id,
    });
  }

  async send(message: string | Array<{ text: string }>, msg_id = '') {
    await this.bootstrap;
    const abortController = this.createAbortController();
    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: Array.isArray(message) ? message[0].text : message,
      config: this.config,
      addItem: () => {
        console.log('addItem');
      },
      onDebugMessage(log: any) {
        console.log('onDebugMessage', log);
      },
      messageId: Date.now(),
      signal: abortController.signal,
    });
    if (!shouldProceed || processedQuery === null || abortController.signal.aborted) {
      return;
    }
    return this.submitQuery(processedQuery, msg_id, abortController);
  }
  async stop() {
    this.abortController?.abort();
  }

  private isRateLimitError(e: any): boolean {
    const message = e.message || '';
    return message.includes('429') || message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('quota exceeded');
  }

  private isInvalidAuthError(e: any): boolean {
    const message = e.message || '';
    return message.includes('401') || message.includes('403');
  }

  private async reInitializeClient(): Promise<void> {
    const platform = this.activeModel.platform;
    if (platform === 'gemini-with-google-auth') {
      this.authType = AuthType.LOGIN_WITH_GOOGLE;
    } else if (platform === 'gemini') {
      this.authType = AuthType.USE_GEMINI;
    } else if (platform === 'gemini-vertex-ai') {
      this.authType = AuthType.USE_VERTEX_AI;
    } else {
      this.authType = AuthType.USE_OPENAI;
    }
    this.initClientEnv();
    await this.config.refreshAuth(this.authType || AuthType.USE_GEMINI);
    this.geminiClient = this.config.getGeminiClient();
  }
}
