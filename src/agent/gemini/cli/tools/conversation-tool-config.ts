/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TModelWithConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import type { GeminiClient } from '@office-ai/aioncli-core';
import { AuthType, Config, getOauthInfoWithCache } from '@office-ai/aioncli-core';
import { WebSearchTool } from './web-search';

/**
 * 对话级别的工具配置
 * 类似工作目录机制：对话创建时确定，整个对话过程中不变
 */
export class ConversationToolConfig {
  private useGeminiWebSearch = false;
  private geminiModel: TModelWithConversation | null = null;
  private excludeTools: string[] = [];
  private dedicatedGeminiClient: GeminiClient | null = null; // 缓存专门的Gemini客户端

  /**
   * 简化版本：直接检查 Google 认证状态，不依赖主进程存储
   */
  private async getGoogleAuthStatus(): Promise<boolean> {
    try {
      // 直接检查 OAuth 信息，传入空字符串作为默认proxy
      const oauthInfo = await getOauthInfoWithCache('');
      return !!oauthInfo;
    } catch (error) {
      console.warn('[ConversationTools] Failed to check Google auth status:', error);
      return false;
    }
  }

  /**
   * 对话创建时决定工具配置（类似workspace确定机制）
   * @param authType 认证类型（平台类型）
   */
  async initializeForConversation(authType: AuthType): Promise<void> {
    if (authType === AuthType.USE_OPENAI) {
      this.useGeminiWebSearch = true;
      // 检查是否有Google认证，决定是否排除google_web_search
      const hasGoogleAuth = await this.getGoogleAuthStatus();
      if (hasGoogleAuth) {
        this.excludeTools = ['google_web_search'];
      }
    }
  }

  /**
   * 查找最佳可用的Gemini模型
   */
  private async findBestGeminiModel(): Promise<TModelWithConversation | null> {
    try {
      // 检查Google认证状态
      const hasGoogleAuth = await this.getGoogleAuthStatus();
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
  private createDedicatedGeminiConfig(geminiModel: TModelWithConversation): Config {
    // 创建一个最小化的配置，只用于Gemini WebSearch
    return new Config({
      sessionId: 'gemini-websearch-' + Date.now(),
      targetDir: process.cwd(),
      cwd: process.cwd(),
      debugMode: false,
      question: '',
      fullContext: false,
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
      geminiModel: this.geminiModel,
      excludeTools: this.excludeTools,
    };
  }

  /**
   * 设置Gemini模型的环境变量
   */
  private setEnvironmentForGeminiModel(_geminiModel: TModelWithConversation, _authType: AuthType): void {
    // LOGIN_WITH_GOOGLE 使用OAuth认证，不需要设置额外的环境变量
    // Google Cloud项目配置通过OAuth流程自动处理
  }

  /**
   * 为给定的 Config 注册自定义工具
   * 在对话初始化后调用
   */
  async registerCustomTools(config: Config, geminiClient: GeminiClient): Promise<void> {
    if (!this.useGeminiWebSearch) return;

    // 创建专门的Gemini客户端（如果还没有）
    if (!this.dedicatedGeminiClient) {
      try {
        const geminiModel = await this.findBestGeminiModel();
        if (!geminiModel) {
          return;
        }

        this.geminiModel = geminiModel;
        const dedicatedConfig = this.createDedicatedGeminiConfig(geminiModel);
        const authType = AuthType.LOGIN_WITH_GOOGLE; // 固定使用Google认证

        // 设置环境变量
        this.setEnvironmentForGeminiModel(geminiModel, authType);

        await dedicatedConfig.initialize();
        await dedicatedConfig.refreshAuth(authType);

        // 创建新的 GeminiClient
        this.dedicatedGeminiClient = dedicatedConfig.getGeminiClient();
      } catch (error) {
        return;
      }
    }

    // 注册自定义WebSearch工具
    const toolRegistry = await config.getToolRegistry();
    const customWebSearchTool = new WebSearchTool(this.dedicatedGeminiClient!);
    toolRegistry.registerTool(customWebSearchTool);

    // 同步工具到模型客户端
    await geminiClient.setTools();
  }
}
