/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TelemetryTarget, GeminiCLIExtension, FallbackIntent } from '@office-ai/aioncli-core';
import { ApprovalMode, Config, DEFAULT_GEMINI_EMBEDDING_MODEL, DEFAULT_GEMINI_MODEL, DEFAULT_MEMORY_FILE_FILTERING_OPTIONS, FileDiscoveryService, getCurrentGeminiMdFilename, loadServerHierarchicalMemory, setGeminiMdFilename as setServerGeminiMdFilename, SimpleExtensionLoader } from '@office-ai/aioncli-core';
import process from 'node:process';
import type { Settings } from './settings';
import { annotateActiveExtensions } from './extension';
import { getCurrentGeminiAgent } from '../index';

// Simple console logger for now - replace with actual logger if available
const logger = {
  debug: (...args: unknown[]) => console.debug('[DEBUG]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};

export interface CliArgs {
  model: string | undefined;
  sandbox: boolean | string | undefined;
  sandboxImage: string | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  promptInteractive: string | undefined;
  allFiles: boolean | undefined;
  all_files: boolean | undefined;
  showMemoryUsage: boolean | undefined;
  show_memory_usage: boolean | undefined;
  yolo: boolean | undefined;
  telemetry: boolean | undefined;
  checkpointing: boolean | undefined;
  telemetryTarget: string | undefined;
  telemetryOtlpEndpoint: string | undefined;
  telemetryLogPrompts: boolean | undefined;
  telemetryOutfile: string | undefined;
  allowedMcpServerNames: string[] | undefined;
  experimentalAcp: boolean | undefined;
  extensions: string[] | undefined;
  listExtensions: boolean | undefined;
  ideModeFeature: boolean | undefined;
  openaiLogging: boolean | undefined;
  openaiApiKey: string | undefined;
  openaiBaseUrl: string | undefined;
  proxy: string | undefined;
  includeDirectories: string[] | undefined;
}

import type { ConversationToolConfig } from './tools/conversation-tool-config';

export async function loadCliConfig({ workspace, settings, extensions, sessionId, proxy, model, conversationToolConfig, yoloMode, mcpServers }: { workspace: string; settings: Settings; extensions: GeminiCLIExtension[]; sessionId: string; proxy?: string; model?: string; conversationToolConfig: ConversationToolConfig; yoloMode?: boolean; mcpServers?: Record<string, unknown> }): Promise<Config> {
  const argv: Partial<CliArgs> = {
    yolo: yoloMode,
  };

  const debugMode = argv.debug || [process.env.DEBUG, process.env.DEBUG_MODE].some((v) => v === 'true' || v === '1') || false;
  const memoryImportFormat = settings.memoryImportFormat || 'tree';
  const ideMode = settings.ideMode ?? false;

  const _ideModeFeature = (argv.ideModeFeature ?? settings.ideModeFeature ?? false) && !process.env.SANDBOX;

  const allExtensions = annotateActiveExtensions(extensions, argv.extensions || []);
  const activeExtensions = allExtensions.filter((ext) => ext.isActive);
  // Handle OpenAI API key from command line
  if (argv.openaiApiKey) {
    process.env.OPENAI_API_KEY = argv.openaiApiKey;
  }

  // Handle OpenAI base URL from command line
  if (argv.openaiBaseUrl) {
    process.env.OPENAI_BASE_URL = argv.openaiBaseUrl;
  }

  // Set the context filename in the server's memoryTool module BEFORE loading memory
  // TODO(b/343434939): This is a bit of a hack. The contextFileName should ideally be passed
  // directly to the Config constructor in core, and have core handle setGeminiMdFilename.
  // However, loadHierarchicalGeminiMemory is called *before* createServerConfig.
  if (settings.contextFileName) {
    setServerGeminiMdFilename(settings.contextFileName);
  } else {
    // Reset to default if not provided in settings.
    setServerGeminiMdFilename(getCurrentGeminiMdFilename());
  }

  const fileService = new FileDiscoveryService(workspace);

  const fileFiltering = {
    ...DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
    ...settings.fileFiltering,
  };

  // 直接使用 aioncli-core 的 loadServerHierarchicalMemory，传入 ExtensionLoader
  // Directly use aioncli-core's loadServerHierarchicalMemory with ExtensionLoader
  const extensionLoader = new SimpleExtensionLoader(allExtensions);
  const folderTrust = true; // 默认信任工作区 / Default to trusting the workspace
  const { memoryContent, fileCount } = await loadServerHierarchicalMemory(workspace, [], debugMode, fileService, extensionLoader, folderTrust, memoryImportFormat, fileFiltering, settings.memoryDiscoveryMaxDirs);

  let mcpServersConfig = mergeMcpServers(settings, activeExtensions, mcpServers);

  // 使用对话级别的工具配置
  const toolConfig = conversationToolConfig.getConfig();

  const excludeTools = mergeExcludeTools(settings, activeExtensions).concat(toolConfig.excludeTools);
  const blockedMcpServers: Array<{ name: string; extensionName: string }> = [];

  if (!argv.allowedMcpServerNames) {
    if (settings.allowMCPServers) {
      const allowedNames = new Set(settings.allowMCPServers.filter(Boolean));
      if (allowedNames.size > 0) {
        mcpServersConfig = Object.fromEntries(Object.entries(mcpServersConfig).filter(([key]) => allowedNames.has(key)));
      }
    }

    if (settings.excludeMCPServers) {
      const excludedNames = new Set(settings.excludeMCPServers.filter(Boolean));
      if (excludedNames.size > 0) {
        mcpServersConfig = Object.fromEntries(Object.entries(mcpServersConfig).filter(([key]) => !excludedNames.has(key)));
      }
    }
  }

  if (argv.allowedMcpServerNames) {
    const allowedNames = new Set(argv.allowedMcpServerNames.filter(Boolean));
    if (allowedNames.size > 0) {
      mcpServersConfig = Object.fromEntries(
        Object.entries(mcpServersConfig).filter(([key, server]) => {
          const isAllowed = allowedNames.has(key);
          if (!isAllowed) {
            // aioncli-core v0.18.4: 使用 server.extension?.name 替代 server.extensionName / use server.extension?.name instead of server.extensionName
            blockedMcpServers.push({
              name: key,
              extensionName: server.extension?.name || '',
            });
          }
          return isAllowed;
        })
      );
    } else {
      blockedMcpServers.push(
        ...Object.entries(mcpServersConfig).map(([key, server]) => ({
          name: key,
          // aioncli-core v0.18.4: 使用 server.extension?.name 替代 server.extensionName / use server.extension?.name instead of server.extensionName
          extensionName: server.extension?.name || '',
        }))
      );
      mcpServersConfig = {};
    }
  }

  // extensionLoader 已在上方创建，复用于 Config 初始化
  // extensionLoader was created above, reuse for Config initialization

  const config = new Config({
    sessionId,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    // sandbox: sandboxConfig,
    targetDir: workspace,
    includeDirectories: argv.includeDirectories,
    debugMode,
    question: argv.promptInteractive || argv.prompt || '',
    // fullContext 参数在 aioncli-core v0.18.4 中已移除 / parameter was removed in aioncli-core v0.18.4
    coreTools: settings.coreTools || undefined,
    excludeTools,
    toolDiscoveryCommand: settings.toolDiscoveryCommand,
    toolCallCommand: settings.toolCallCommand,
    mcpServerCommand: settings.mcpServerCommand,
    mcpServers: mcpServersConfig,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    approvalMode: argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    // AionUi 是桌面应用，支持用户交互确认，需要设置 interactive: true
    // AionUi is a desktop app with user interaction support, needs interactive: true
    interactive: true,
    showMemoryUsage: argv.showMemoryUsage || argv.show_memory_usage || settings.showMemoryUsage || false,
    accessibility: settings.accessibility,
    telemetry: {
      enabled: argv.telemetry ?? settings.telemetry?.enabled,
      target: (argv.telemetryTarget ?? settings.telemetry?.target) as TelemetryTarget,
      otlpEndpoint: argv.telemetryOtlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? settings.telemetry?.otlpEndpoint,
      logPrompts: argv.telemetryLogPrompts ?? settings.telemetry?.logPrompts,
      outfile: argv.telemetryOutfile ?? settings.telemetry?.outfile,
    },
    usageStatisticsEnabled: settings.usageStatisticsEnabled ?? true,
    // Git-aware file filtering settings
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      respectGeminiIgnore: settings.fileFiltering?.respectGeminiIgnore,
      enableRecursiveFileSearch: settings.fileFiltering?.enableRecursiveFileSearch,
    },
    checkpointing: argv.checkpointing || settings.checkpointing?.enabled,
    proxy: proxy,
    cwd: workspace,
    fileDiscoveryService: fileService,
    bugCommand: settings.bugCommand,
    model: model || DEFAULT_GEMINI_MODEL,
    // 启用模型路由以支持 auto 模式（与终端 CLI 保持一致）
    // Enable model router to support auto mode (consistent with terminal CLI)
    useModelRouter: true,
    // 使用 extensionLoader 替代已废弃的 extensionContextFilePaths 和 extensions 参数
    // Use extensionLoader instead of deprecated extensionContextFilePaths and extensions parameters
    extensionLoader,
    maxSessionTurns: settings.maxSessionTurns ?? -1,
    listExtensions: argv.listExtensions || false,
    noBrowser: !!process.env.NO_BROWSER,
    summarizeToolOutput: settings.summarizeToolOutput,
    ideMode,
    // 启用预览功能以支持 Gemini 3 等新模型
    // Enable preview features to support Gemini 3 and other new models
    previewFeatures: true,
  });

  // FallbackModelHandler 返回类型在 aioncli-core v0.18.4 中使用 FallbackIntent
  // FallbackModelHandler return type uses FallbackIntent in aioncli-core v0.18.4
  // 可用值 / Available values: 'retry_always' | 'retry_once' | 'stop' | 'retry_later' | 'upgrade' | null
  //
  // 工作流程 / Workflow:
  // 1. handler 调用 apiKeyManager.rotateKey() 更新 process.env 中的 API Key
  //    handler calls apiKeyManager.rotateKey() to update API Key in process.env
  // 2. aioncli-core 的 tryRotateApiKey 检测到 env 变化后会调用 config.refreshAuth()
  //    aioncli-core's tryRotateApiKey detects env change and calls config.refreshAuth()
  // 3. 返回 'retry_once' 表示本次重试，'stop' 表示停止
  //    Return 'retry_once' for one-time retry, 'stop' to stop retrying
  const fallbackModelHandler = async (_currentModel: string, _fallbackModel: string, _error?: unknown): Promise<FallbackIntent | null> => {
    try {
      const agent = getCurrentGeminiAgent();
      const apiKeyManager = agent?.getApiKeyManager();

      if (!apiKeyManager?.hasMultipleKeys()) {
        // 单 Key 模式，尝试一次重试（可能是临时错误）
        // Single key mode, try one retry (might be transient error)
        return 'retry_once';
      }

      // 轮换到下一个可用的 API Key，这会更新 process.env
      // Rotate to next available API Key, this updates process.env
      const hasMoreKeys = apiKeyManager.rotateKey();

      if (hasMoreKeys) {
        // 还有可用的 Key，重试一次
        // More keys available, retry once
        return 'retry_once';
      }

      // 所有 Key 都已用尽或被 blacklist，停止重试
      // All keys exhausted or blacklisted, stop retrying
      return 'stop';
    } catch (e) {
      console.error(`[FallbackHandler] Handler error:`, e);
      return 'retry_once';
    }
  };

  config.setFallbackModelHandler(fallbackModelHandler);

  return config;
}

function mergeMcpServers(settings: Settings, extensions: GeminiCLIExtension[], uiMcpServers?: Record<string, unknown>) {
  const mcpServers = { ...(settings.mcpServers || {}) };

  // 添加来自 extensions 的 MCP 服务器
  // Add MCP servers from extensions
  for (const extension of extensions) {
    Object.entries(extension.mcpServers || {}).forEach(([key, server]) => {
      if (mcpServers[key]) {
        logger.warn(`Skipping extension MCP config for server with key "${key}" as it already exists.`);
        return;
      }
      mcpServers[key] = {
        ...server,
        extension,
      };
    });
  }

  // 添加来自 UI 配置的 MCP 服务器（优先级最高）
  if (uiMcpServers) {
    Object.entries(uiMcpServers).forEach(([key, server]) => {
      if (mcpServers[key]) {
        logger.warn(`Overriding existing MCP config for server with key "${key}" with UI configuration.`);
      }
      mcpServers[key] = server;
      console.log(`[MCP] Added UI-configured server: ${key}`);
    });
  }

  return mcpServers;
}

function mergeExcludeTools(settings: Settings, extensions: GeminiCLIExtension[]): string[] {
  const allExcludeTools = new Set(settings.excludeTools || []);
  for (const extension of extensions) {
    for (const tool of extension.excludeTools || []) {
      allExcludeTools.add(tool);
    }
  }
  return [...allExcludeTools];
}
