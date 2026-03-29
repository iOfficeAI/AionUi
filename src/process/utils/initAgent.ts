/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { PresetAgentType } from '@/common/types/acpTypes';
import { uuid } from '@/common/utils';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getSkillsDir, getBuiltinSkillsCopyDir, getAutoSkillsDir, getSystemDir } from './initStorage';
import { computeOpenClawIdentityHash } from './openclawUtils';

/**
 * Agent 类型/backend 到原生 skills 目录的映射
 * Mapping from agent type/backend to native skills directory
 *
 * 只有在此映射中的 CLI 才支持原生 skill 发现（CLI 自动扫描目录中的 SKILL.md）
 * Only CLIs listed here support native skill discovery (CLI auto-scans directory for SKILL.md)
 *
 * 不在此映射中的 backend 将 fallback 到首条消息注入（prompt injection）方案
 * Backends NOT in this map will fallback to first-message injection (prompt injection)
 */
const AGENT_SKILLS_DIRS: Record<string, string[]> = {
  // Verified native skill discovery support:
  gemini: ['.gemini/skills'],
  claude: ['.claude/skills'],
  codebuddy: ['.codebuddy/skills'],
  codex: ['.codex/skills'],
  qwen: ['.qwen/skills'],
  iflow: ['.iflow/skills'],
  goose: ['.goose/skills'],
  droid: ['.factory/skills'],
  kimi: ['.kimi/skills'],
  vibe: ['.vibe/skills'],
  cursor: ['.cursor/skills'],
  // NOT supported (fallback to prompt injection):
  // opencode, auggie, copilot, nanobot, qoder
};

/**
 * 为 assistant 设置原生 workspace 结构（skill symlinks）
 * Set up native workspace structure for assistant (skill symlinks only)
 *
 * 将启用的 skills symlink 到 CLI 原生 skills 目录，让各 CLI 自动发现
 * Symlink enabled skills into CLI-native skills directories for auto-discovery
 *
 * 只在 temp workspace（非用户指定）时执行，避免污染用户项目目录
 * Only runs for temp workspaces (not user-specified) to avoid polluting user project dirs
 *
 * 注意：Rules/人格设定通过 system prompt 注入，不写 context file
 * Note: Rules/personality are injected via system prompt, NOT written to context files
 */
/**
 * Check if a given agent type/backend supports native skill discovery.
 * When false, callers should fallback to prompt injection for skills.
 */
export function hasNativeSkillSupport(agentTypeOrBackend: string | undefined): boolean {
  return !!agentTypeOrBackend && agentTypeOrBackend in AGENT_SKILLS_DIRS;
}

export async function setupAssistantWorkspace(
  workspace: string,
  options: {
    agentType?: PresetAgentType | string;
    backend?: string;
    enabledSkills?: string[];
  }
): Promise<void> {
  // Determine skills directories based on agent type or backend
  const key = options.backend || options.agentType || '';
  const skillsDirs = AGENT_SKILLS_DIRS[key];

  // If no native skill directory is known for this CLI, skip symlink setup.
  // The caller should use prompt injection as fallback.
  if (!skillsDirs) return;

  const autoSkillsDir = getAutoSkillsDir();
  const userSkillsDir = getSkillsDir();

  for (const skillsRelDir of skillsDirs) {
    const targetSkillsDir = path.join(workspace, skillsRelDir);
    await fs.mkdir(targetSkillsDir, { recursive: true });

    // Always symlink _builtin skills for all native-skill backends
    let autoSkillNames: string[] = [];
    try {
      autoSkillNames = await fs.readdir(autoSkillsDir);
    } catch {
      // _builtin dir not ready yet, skip
    }
    for (const skillName of autoSkillNames) {
      const sourceSkillDir = path.join(autoSkillsDir, skillName);
      const targetSkillDir = path.join(targetSkillsDir, skillName);
      try {
        await fs.stat(sourceSkillDir);
        try {
          await fs.lstat(targetSkillDir);
          // Already exists, skip
        } catch {
          await fs.symlink(sourceSkillDir, targetSkillDir, 'junction');
          console.log(`[setupAssistantWorkspace] Symlinked builtin skill: ${skillName} -> ${targetSkillDir}`);
        }
      } catch {
        console.warn(`[setupAssistantWorkspace] Builtin skill directory not found: ${sourceSkillDir}`);
      }
    }

    // Symlink optional enabled skills
    for (const skillName of options.enabledSkills ?? []) {
      // Skip if already symlinked as a builtin skill
      if (autoSkillNames.includes(skillName)) continue;

      // Try builtin-skills/ first, then user skills/
      const builtinCandidate = path.join(getBuiltinSkillsCopyDir(), skillName);
      const userCandidate = path.join(userSkillsDir, skillName);
      const sourceSkillDir = existsSync(builtinCandidate) ? builtinCandidate : userCandidate;
      const targetSkillDir = path.join(targetSkillsDir, skillName);

      try {
        await fs.stat(sourceSkillDir);
        try {
          await fs.lstat(targetSkillDir);
          // Already exists, skip
        } catch {
          await fs.symlink(sourceSkillDir, targetSkillDir, 'junction');
          console.log(`[setupAssistantWorkspace] Symlinked skill: ${skillName} -> ${targetSkillDir}`);
        }
      } catch {
        console.warn(`[setupAssistantWorkspace] Skill directory not found: ${sourceSkillDir}`);
      }
    }
  }
}

/**
 * 创建工作空间目录（不复制文件）
 * Create workspace directory (without copying files)
 *
 * 注意：文件复制统一由 sendMessage 时的 copyFilesToDirectory 处理
 * 避免文件被复制两次（一次在创建会话时，一次在发送消息时）
 * Note: File copying is handled by copyFilesToDirectory in sendMessage
 * This avoids files being copied twice
 */
const buildWorkspaceWidthFiles = async (
  defaultWorkspaceName: string,
  workspace?: string,
  _defaultFiles?: string[],
  providedCustomWorkspace?: boolean
) => {
  // 使用前端提供的customWorkspace标志，如果没有则根据workspace参数判断
  const customWorkspace = providedCustomWorkspace !== undefined ? providedCustomWorkspace : !!workspace;

  if (!workspace) {
    const tempPath = getSystemDir().workDir;
    workspace = path.join(tempPath, defaultWorkspaceName);
    await fs.mkdir(workspace, { recursive: true });
  } else {
    // 规范化路径：去除末尾斜杠，解析为绝对路径
    workspace = path.resolve(workspace);
  }

  return { workspace, customWorkspace };
};

export const createGeminiAgent = async (
  model: TProviderWithModel,
  workspace?: string,
  defaultFiles?: string[],
  webSearchEngine?: 'google' | 'default',
  customWorkspace?: boolean,
  contextFileName?: string,
  presetRules?: string,
  enabledSkills?: string[],
  presetAssistantId?: string,
  sessionMode?: string,
  isHealthCheck?: boolean
): Promise<TChatConversation> => {
  const { workspace: newWorkspace, customWorkspace: finalCustomWorkspace } = await buildWorkspaceWidthFiles(
    `gemini-temp-${Date.now()}`,
    workspace,
    defaultFiles,
    customWorkspace
  );

  // 对 temp workspace 设置 skill symlinks（原生 SkillManager 自动发现）
  // Set up skill symlinks for native SkillManager discovery
  if (!finalCustomWorkspace) {
    await setupAssistantWorkspace(newWorkspace, {
      agentType: 'gemini',
      enabledSkills,
    });
  }

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
      // 预设助手 ID，用于在会话面板显示助手名称和头像
      // Preset assistant ID for displaying name and avatar in conversation panel
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

export const createAcpAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(
    `${extra.backend}-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.customWorkspace
  );

  // 对 temp workspace 设置 skill symlinks（原生发现）
  if (!customWorkspace) {
    await setupAssistantWorkspace(workspace, {
      backend: extra.backend,
      enabledSkills: extra.enabledSkills,
    });
  }

  return {
    type: 'acp',
    extra: {
      workspace: workspace,
      customWorkspace,
      backend: extra.backend,
      cliPath: extra.cliPath,
      agentName: extra.agentName,
      customAgentId: extra.customAgentId, // 同时用于标识预设助手 / Also used to identify preset assistant
      presetContext: extra.presetContext, // 智能助手的预设规则/提示词
      // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
      enabledSkills: extra.enabledSkills,
      // 预设助手 ID，用于在会话面板显示助手名称和头像
      // Preset assistant ID for displaying name and avatar in conversation panel
      presetAssistantId: extra.presetAssistantId,
      // Initial session mode selected on Guid page (from AgentModeSelector)
      sessionMode: extra.sessionMode,
      // Pre-selected model from Guid page (cached model list)
      currentModelId: extra.currentModelId,
      // Explicit marker for temporary health-check conversations
      isHealthCheck: extra.isHealthCheck,
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

/** @deprecated Legacy Codex creation. New Codex conversations use ACP protocol via createAcpAgent. */
export const createCodexAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(
    `codex-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.customWorkspace
  );

  // 对 temp workspace 设置 skill symlinks
  if (!customWorkspace) {
    await setupAssistantWorkspace(workspace, {
      agentType: 'codex',
      enabledSkills: extra.enabledSkills,
    });
  }

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
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(
    `nanobot-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.customWorkspace
  );

  // 对 temp workspace 设置 skill symlinks
  if (!customWorkspace) {
    await setupAssistantWorkspace(workspace, {
      agentType: 'nanobot',
      enabledSkills: extra.enabledSkills,
    });
  }

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

export const createRemoteAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(
    `remote-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.customWorkspace
  );

  if (!customWorkspace) {
    await setupAssistantWorkspace(workspace, {
      enabledSkills: extra.enabledSkills,
    });
  }

  return {
    type: 'remote',
    extra: {
      workspace,
      customWorkspace,
      remoteAgentId: extra.remoteAgentId!,
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
  const { workspace, customWorkspace } = await buildWorkspaceWidthFiles(
    `openclaw-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.customWorkspace
  );

  // 对 temp workspace 设置 skill symlinks
  if (!customWorkspace) {
    await setupAssistantWorkspace(workspace, {
      enabledSkills: extra.enabledSkills,
    });
  }

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
