/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/ipcBridge';
import type { TChatConversation, TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import fs from 'fs/promises';
import path from 'path';
import { getSystemDir } from './initStorage';
import { runHooks } from '@/assistant/hooks';
import { ConfigStorage } from '@/common/storage';
import { getAssistantsDir } from './migrations/assistantMigration';
import { copyDirectoryRecursively } from './utils';
import { computeOpenClawIdentityHash } from './utils/openclawUtils';
import { SwarmSessionManager } from '@/agent/swarm/SwarmSessionManager';
import WorkerManage from './WorkerManage';
import { getDatabase } from './database/export';

// Regex to match AionUI timestamp suffix pattern
const AIONUI_TIMESTAMP_REGEX = /^(.+?)_aionui_\d+(\.[^.]+)$/;

/**
 * 创建工作空间目录（不复制文件）
 * Create workspace directory (without copying files)
 *
 * 注意：文件复制统一由 sendMessage 时的 copyFilesToDirectory 处理
 * 避免文件被复制两次（一次在创建会话时，一次在发送消息时）
 * Note: File copying is handled by copyFilesToDirectory in sendMessage
 * This avoids files being copied twice
 */
const buildWorkspaceWidthFiles = async (defaultWorkspaceName: string, workspace?: string, defaultFiles?: string[], providedCustomWorkspace?: boolean, presetAssistantId?: string, assistantConfig?: import('@/assistant/types').AssistantMetadata | null) => {
  // 使用前端提供的customWorkspace标志，如果没有则根据workspace参数判断
  const customWorkspace = providedCustomWorkspace !== undefined ? providedCustomWorkspace : !!workspace;

  // Load customAgents once for both workspace path and hook initialization
  let customAgents: any = null;
  if (presetAssistantId) {
    try {
      // Reduced timeout (1 second) - this is non-critical, we can fallback
      const customAgentsPromise = ConfigStorage.get('acp.customAgents');
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('ConfigStorage.get timeout')), 1000));
      customAgents = await Promise.race([customAgentsPromise, timeoutPromise]).catch((error): null => {
        console.warn(`[AionUi] ConfigStorage.get failed or timed out (non-critical):`, error);
        return null;
      });
    } catch (error) {
      console.warn(`[AionUi] Failed to load custom agents:`, error);
    }
  }

  // If presetAssistantId is provided, check if it has a workspacePath
  if (presetAssistantId && !workspace && customAgents && Array.isArray(customAgents)) {
    const assistant = customAgents.find((a) => a.id === presetAssistantId);
    if (assistant?.workspacePath) {
      console.log(`[AionUi] Using workspace from assistant ${presetAssistantId}: ${assistant.workspacePath}`);
      workspace = assistant.workspacePath;
    }
  }

  if (!workspace) {
    const tempPath = getSystemDir().workDir;
    workspace = path.join(tempPath, defaultWorkspaceName);
    await fs.mkdir(workspace, { recursive: true });
  } else {
    // 规范化路径：去除末尾斜杠，解析为绝对路径
    workspace = path.resolve(workspace);
  }

  // Initialize workspace via on-conversation-init hook if presetAssistantId is provided
  // Skip if workspace was loaded from assistant (already has the template)
  let defaultAgent: string | undefined;
  let assistantHooksPath: string | undefined;
  if (presetAssistantId) {
    try {
      // Reuse customAgents loaded earlier (no second ConfigStorage call)
      const assistant = Array.isArray(customAgents) ? customAgents.find((a: any) => a.id === presetAssistantId) : null;
      const hasExistingWorkspace = assistant?.workspacePath;

      if (!hasExistingWorkspace) {
        console.log(`[AionUi] Initializing workspace for assistant: ${presetAssistantId}`);

        // Get assistant path (no longer strip builtin- prefix, all assistants use their ID directly)
        const assistantPath = path.join(getAssistantsDir(), presetAssistantId);

        // Check if workspace template or hooks exist (filesystem-based detection)
        const workspaceTemplatePath = path.join(assistantPath, 'workspace');
        const hooksPath = path.join(assistantPath, 'hooks');

        const hasWorkspaceTemplate = await fs
          .access(workspaceTemplatePath)
          .then(() => true)
          .catch(() => false);
        const hasHooks = await fs
          .access(hooksPath)
          .then(() => true)
          .catch(() => false);

        // Track hooks path for runtime hook execution (e.g., onQueueInit)
        if (hasHooks) {
          assistantHooksPath = hooksPath;
        }

        if (hasWorkspaceTemplate || hasHooks) {
          console.log(`[AionUi] Detected workspace features for ${presetAssistantId}: workspace=${hasWorkspaceTemplate}, hooks=${hasHooks}`);

          // Copy workspace template if it exists
          if (hasWorkspaceTemplate) {
            try {
              await copyDirectoryRecursively(workspaceTemplatePath, workspace, { overwrite: false });
              console.log(`[AionUi] Copied workspace template from ${workspaceTemplatePath} to ${workspace}`);
            } catch (error) {
              console.error(`[AionUi] Failed to copy workspace template:`, error);
            }
          }

          // Execute on-conversation-init hook from assistant directory
          // Pass assistantPath so HookRunner can find hooks there
          const conversationId = uuid();
          await runHooks('onConversationInit', {
            workspace,
            assistantPath,
            conversationId,
          });

          console.log(`[AionUi] Workspace initialized via hook: ${workspace}`);
        }

        // Get defaultAgent from pre-loaded config
        if (assistantConfig) {
          defaultAgent = assistantConfig.defaultAgent;
        }
      } else {
        console.log(`[AionUi] Using existing workspace, skipping initialization`);
      }
    } catch (error) {
      console.warn(`[AionUi] Error initializing workspace:`, error);
    }
  }

  if (defaultFiles) {
    for (const file of defaultFiles) {
      // 确保文件路径是绝对路径
      const absoluteFilePath = path.isAbsolute(file) ? file : path.resolve(file);

      // 检查源文件是否存在
      try {
        await fs.access(absoluteFilePath);
      } catch (error) {
        console.warn(`[AionUi] Source file does not exist, skipping: ${absoluteFilePath}`);
        console.warn(`[AionUi] Original path: ${file}`);
        // 跳过不存在的文件，而不是抛出错误
        continue;
      }

      let fileName = path.basename(absoluteFilePath);

      // 如果是临时文件，去掉 AionUI 时间戳后缀
      const { cacheDir } = getSystemDir();
      const tempDir = path.join(cacheDir, 'temp');
      if (absoluteFilePath.startsWith(tempDir)) {
        fileName = fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
      }

      const destPath = path.join(workspace, fileName);

      try {
        await fs.copyFile(absoluteFilePath, destPath);
      } catch (error) {
        console.error(`[AionUi] Failed to copy file from ${absoluteFilePath} to ${destPath}:`, error);
        // 继续处理其他文件，而不是完全失败
      }
    }
  }

  // Note: on-conversation-init hooks are now run earlier in this function
  // (when presetAssistantId is provided) to initialize the workspace template.
  // This legacy call is kept for backward compatibility with existing workspaces
  // that may have hooks already in place.
  await runHooks('onConversationInit', { workspace });

  // Extract preview config from assistant metadata (if available)
  const preview = assistantConfig?.preview;

  return { workspace, customWorkspace, defaultAgent, assistantHooksPath, preview };
};

export const createGeminiAgent = async (model: TProviderWithModel, workspace?: string, defaultFiles?: string[], webSearchEngine?: 'google' | 'default', customWorkspace?: boolean, contextFileName?: string, presetRules?: string, enabledSkills?: string[], presetAssistantId?: string, sessionMode?: string, isHealthCheck?: boolean): Promise<TChatConversation> => {
  // Use presetAssistantId as workspace template source (resolves automatically)
  const { workspace: newWorkspace, customWorkspace: finalCustomWorkspace } = await buildWorkspaceWidthFiles(`gemini-temp-${Date.now()}`, workspace, defaultFiles, customWorkspace, presetAssistantId);

  return {
    type: 'gemini',
    model,
    extra: {
      workspace: newWorkspace,
      customWorkspace: finalCustomWorkspace,
      webSearchEngine,
      contextFileName,
      // 系统规则 / System rules
      presetRules,
      // 向后兼容：contextContent 保存 rules / Backward compatible: contextContent stores rules
      contextContent: presetRules,
      // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
      enabledSkills,
      // 预设助手 ID，用于在会话面板显示助手名称和头像，同时用于复制工作空间模板
      // Preset assistant ID for displaying name and avatar in conversation panel, also used for workspace template
      presetAssistantId,
      // Initial session mode from Guid page mode selector
      sessionMode,
      // Explicit marker for temporary health-check conversations
      isHealthCheck,
    },
    desc: finalCustomWorkspace ? newWorkspace : '',
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: newWorkspace,
    id: uuid(),
  };
};

export const createAcpAgent = async (options: ICreateConversationParams, assistantConfig?: import('@/assistant/types').AssistantMetadata | null): Promise<TChatConversation> => {
  const { extra } = options;
  // Use presetAssistantId as workspace template source (resolves automatically)
  const { workspace, customWorkspace, defaultAgent, assistantHooksPath, preview } = await buildWorkspaceWidthFiles(`${extra.backend}-temp-${Date.now()}`, extra.workspace, extra.defaultFiles, extra.customWorkspace, extra.presetAssistantId, assistantConfig);

  // Build extra object, only including defined fields to prevent undefined values from being JSON.stringify'd
  const conversationExtra: any = {
    workspace: workspace,
    customWorkspace,
    backend: extra.backend,
    cliPath: extra.cliPath,
    agentName: extra.agentName,
  };

  // Only add optional fields if they have values (undefined values get stripped during JSON serialization)
  if (extra.customAgentId !== undefined) conversationExtra.customAgentId = extra.customAgentId;
  if (extra.presetContext !== undefined) conversationExtra.presetContext = extra.presetContext;
  if (extra.enabledSkills !== undefined) conversationExtra.enabledSkills = extra.enabledSkills;
  if (extra.presetAssistantId !== undefined) conversationExtra.presetAssistantId = extra.presetAssistantId;
  if (extra.botId !== undefined) conversationExtra.botId = extra.botId;
  if (extra.externalChannelId !== undefined) conversationExtra.externalChannelId = extra.externalChannelId;
  if (extra.sessionMode !== undefined) conversationExtra.sessionMode = extra.sessionMode;
  if (extra.currentModelId !== undefined) conversationExtra.currentModelId = extra.currentModelId;
  if (defaultAgent !== undefined) conversationExtra.defaultAgent = defaultAgent;
  if (assistantHooksPath !== undefined) conversationExtra.assistantHooksPath = assistantHooksPath;
  if (preview) conversationExtra.preview = preview;
  if (extra.isHealthCheck !== undefined) conversationExtra.isHealthCheck = extra.isHealthCheck;

  return {
    type: 'acp' as const,
    extra: conversationExtra,
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

/** @deprecated Legacy Codex creation. New Codex conversations use ACP protocol via createAcpAgent. */
export const createCodexAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  // Use presetAssistantId as workspace template source (resolves automatically)
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(`codex-temp-${Date.now()}`, extra.workspace, extra.defaultFiles, extra.customWorkspace, extra.presetAssistantId);
  return {
    type: 'codex',
    extra: {
      workspace: workspace,
      customWorkspace,
      cliPath: extra.cliPath,
      sandboxMode: 'workspace-write', // 默认为读写权限 / Default to read-write permission
      presetContext: extra.presetContext, // 智能助手的预设规则/提示词
      // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
      enabledSkills: extra.enabledSkills,
      // 预设助手 ID，用于在会话面板显示助手名称和头像
      // Preset assistant ID for displaying name and avatar in conversation panel
      presetAssistantId: extra.presetAssistantId,
      // Initial session mode selected on Guid page (from AgentModeSelector)
      sessionMode: extra.sessionMode,
      // User-selected Codex model from Guid page
      codexModel: extra.codexModel,
      // Explicit marker for temporary health-check conversations
      isHealthCheck: extra.isHealthCheck,
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

export const createNanobotAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(`nanobot-temp-${Date.now()}`, extra.workspace, extra.defaultFiles, extra.customWorkspace);
  return {
    type: 'nanobot',
    extra: {
      workspace: workspace,
      customWorkspace,
      enabledSkills: extra.enabledSkills,
      presetAssistantId: extra.presetAssistantId,
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

export const createOpenClawAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(`openclaw-temp-${Date.now()}`, extra.workspace, extra.defaultFiles, extra.customWorkspace);
  const expectedIdentityHash = await computeOpenClawIdentityHash(workspace);
  return {
    type: 'openclaw-gateway',
    extra: {
      workspace: workspace,
      backend: extra.backend,
      agentName: extra.agentName,
      customWorkspace,
      gateway: {
        cliPath: extra.cliPath,
      },
      runtimeValidation: {
        expectedWorkspace: workspace,
        expectedBackend: extra.backend,
        expectedAgentName: extra.agentName,
        expectedCliPath: extra.cliPath,
        // Note: model is not used by openclaw-gateway, so skip expectedModel to avoid
        // validation mismatch (conversation object doesn't store model for this type)
        expectedIdentityHash,
        switchedAt: extra.runtimeValidation?.switchedAt ?? Date.now(),
      },
      // Enabled skills list (loaded via SkillManager)
      enabledSkills: extra.enabledSkills,
      // Preset assistant ID for displaying name and avatar in conversation panel
      presetAssistantId: extra.presetAssistantId,
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

/**
 * Create a swarm conversation (mode: "swarm").
 * Creates a parent group conversation, then spawns child agent conversations
 * linked to it via parent_id. The SwarmSessionManager orchestrates the agents
 * and forwards their responses to the group chat.
 */
export const createSwarmConversation = async (options: ICreateConversationParams, assistantConfig: import('@/assistant/types').AssistantMetadata): Promise<TChatConversation> => {
  const { extra } = options;

  // Validate swarm config
  if (assistantConfig.mode !== 'swarm' || !assistantConfig.swarm) {
    throw new Error(`Assistant ${assistantConfig.id} is not configured as a swarm`);
  }

  // Build workspace (reusing existing infrastructure)
  const { workspace, customWorkspace, defaultAgent, assistantHooksPath, preview } = await buildWorkspaceWidthFiles(
    `swarm-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.customWorkspace,
    extra.presetAssistantId,
    assistantConfig // Pass pre-loaded config
  );

  const { getAssistantDir } = await import('@/assistant/loadAssistantConfig');
  const assistantDir = getAssistantDir(assistantConfig.id);

  // Create parent swarm conversation with type='swarm' and group mode
  const parentConversation: TChatConversation = {
    type: 'swarm',
    conversationMode: 'group',
    extra: {
      workspace,
      customWorkspace,
      presetAssistantId: assistantConfig.id,
      assistantDir,
      defaultAgent,
      assistantHooksPath,
      swarmConfig: assistantConfig.swarm,
      ...(preview && { preview }),
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };

  // Create SwarmSessionManager
  const swarmManager = new SwarmSessionManager(assistantConfig.swarm, parentConversation.id, workspace, assistantConfig.presetAgentType || 'claude', assistantConfig.id, assistantDir);

  // Register swarm manager
  WorkerManage.registerSwarm(parentConversation.id, swarmManager);

  console.log(`[AionUi] Created swarm conversation ${parentConversation.id} for assistant ${assistantConfig.id}`);

  return parentConversation;
};
