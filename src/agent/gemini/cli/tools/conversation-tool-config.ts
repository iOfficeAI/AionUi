/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import type { GeminiClient } from '@office-ai/aioncli-core';
import { AuthType, Config } from '@office-ai/aioncli-core';
import { ImageGenerationTool } from './img-gen';
import { WebFetchTool } from './web-fetch';
import { WebSearchTool } from './web-search';

interface ConversationToolConfigOptions {
  proxy: string;
  imageGenerationModel?: TProviderWithModel;
  webSearchEngine?: 'google' | 'default';
}

/**
 * 对话级别的工具配置
 * 类似工作目录机制：对话创建时确定，整个对话过程中不变
 */
export class ConversationToolConfig {
  private useGeminiWebSearch = false;
  private useAionuiWebFetch = false;
  private geminiModel: TProviderWithModel | null = null;
  private excludeTools: string[] = [];
  private dedicatedGeminiClient: GeminiClient | null = null; // 缓存专门的Gemini客户端
  private dedicatedConfig: Config | null = null; // 缓存专门的Config（用于OAuth认证）
  private imageGenerationModel: TProviderWithModel | undefined;
  private webSearchEngine: 'google' | 'default' = 'default';
  private proxy: string = '';
  constructor(options: ConversationToolConfigOptions) {
    this.proxy = options.proxy;
    this.webSearchEngine = options.webSearchEngine ?? 'default';
    this.imageGenerationModel = options.imageGenerationModel;
  }

  /**
   * 对话创建时决定工具配置（类似workspace确定机制）
   * @param authType 认证类型（平台类型）
   */
  async initializeForConversation(authType: AuthType): Promise<void> {
    // 所有模型都使用 aionui_web_fetch 替换内置的 web_fetch
    this.useAionuiWebFetch = true;
    this.excludeTools.push('web_fetch');

    // 根据 webSearchEngine 配置决定启用哪个搜索工具
    if (this.webSearchEngine === 'google' && authType === AuthType.USE_OPENAI) {
      // 启用 Google 搜索（仅OpenAI模型需要，需要认证）
      this.useGeminiWebSearch = true;
      this.excludeTools.push('google_web_search'); // 排除内置的 Google 搜索
    }
    // webSearchEngine === 'default' 时不启用 Google 搜索工具
  }

  /**
   * 查找最佳可用的Gemini模型
   */
  private async findBestGeminiModel(): Promise<TProviderWithModel | null> {
    try {
      // 前端已通过 webSearchEngine 参数确认认证状态
      const hasGoogleAuth = this.webSearchEngine === 'google';
      if (hasGoogleAuth) {
        return {
          id: uuid(),
          name: 'Gemini Google Auth',
          platform: 'gemini-with-google-auth',
          baseUrl: '',
          apiKey: '',
          useModel: 'gemini-2.5-flash',
        };
      }

      return null;
    } catch (error) {
      console.error('[ConversationTools] Error finding Gemini model:', error);
      return null;
    }
  }

  /**
   * 创建专门的Gemini配置
   */
  private createDedicatedGeminiConfig(geminiModel: TProviderWithModel): Config {
    // 创建一个最小化的配置，只用于Gemini WebSearch
    return new Config({
      sessionId: 'gemini-websearch-' + Date.now(),
      targetDir: process.cwd(),
      cwd: process.cwd(),
      debugMode: false,
      question: '',
      // fullContext 参数在 aioncli-core v0.18.4 中已移除
      userMemory: '',
      geminiMdFileCount: 0,
      model: geminiModel.useModel,
    });
  }

  /**
   * 获取当前对话的工具配置
   */
  getConfig() {
    return {
      useGeminiWebSearch: this.useGeminiWebSearch,
      useAionuiWebFetch: this.useAionuiWebFetch,
      geminiModel: this.geminiModel,
      excludeTools: this.excludeTools,
    };
  }

  /**
   * 为给定的 Config 注册自定义工具
   * 在对话初始化后调用
   */
  async registerCustomTools(config: Config, geminiClient: GeminiClient): Promise<void> {
    const toolRegistry = await config.getToolRegistry();

    // 注册 aionui_web_fetch 工具（所有模型）
    if (this.useAionuiWebFetch) {
      const customWebFetchTool = new WebFetchTool(geminiClient, config.getMessageBus());
      toolRegistry.registerTool(customWebFetchTool);
    }

    if (this.imageGenerationModel) {
      // 注册 aionui_image_generation 工具（所有模型）
      const imageGenTool = new ImageGenerationTool(config, this.imageGenerationModel, this.proxy);
      toolRegistry.registerTool(imageGenTool);
    }

    // 注册 gemini_web_search 工具（仅OpenAI模型）
    if (this.useGeminiWebSearch) {
      try {
        // 前端已通过 webSearchEngine 参数确认认证状态，直接创建客户端
        // 创建专门的Config（如果还没有）
        if (!this.dedicatedConfig) {
          const geminiModel = await this.findBestGeminiModel();
          if (geminiModel) {
            this.geminiModel = geminiModel;
            this.dedicatedConfig = this.createDedicatedGeminiConfig(geminiModel);
            const authType = AuthType.LOGIN_WITH_GOOGLE; // 固定使用Google认证

            await this.dedicatedConfig.initialize();
            await this.dedicatedConfig.refreshAuth(authType);

            // 创建新的 GeminiClient（用于检查认证状态）
            this.dedicatedGeminiClient = this.dedicatedConfig.getGeminiClient();
          }
        }

        // 只有成功创建 Config 时才注册工具
        if (this.dedicatedConfig && this.dedicatedGeminiClient) {
          const customWebSearchTool = new WebSearchTool(this.dedicatedConfig, this.dedicatedConfig.getMessageBus());
          toolRegistry.registerTool(customWebSearchTool);
        }
        // Google未登录时静默跳过，不影响其他工具
      } catch (error) {
        console.warn('Failed to register gemini_web_search tool:', error);
        // 异常时也不影响其他工具的注册
      }
    }

    // 同步工具到模型客户端
    await geminiClient.setTools();
  }
}
