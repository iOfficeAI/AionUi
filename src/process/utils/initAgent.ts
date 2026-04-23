/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpBackendAll } from '@/common/types/acpTypes';
import { getSkillsDirsForBackend, hasNativeSkillSupport } from '@/common/types/acpTypes';
import { uuid } from '@/common/utils';

// Re-export for backward compatibility (tests mock this path)
export { hasNativeSkillSupport };
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { getSkillsDir, getBuiltinSkillsCopyDir, getAutoSkillsDir, getSystemDir } from './initStorage';
import { computeOpenClawIdentityHash } from './openclawUtils';

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
export async function setupAssistantWorkspace(
  workspace: string,
  options: {
    agent_type?: string;
    backend?: string;
    enabled_skills?: string[];
    /** Builtin skill names to exclude from auto-injection (e.g. 'cron' for cron-spawned conversations) */
    excludeBuiltinSkills?: string[];
    /** Absolute paths to extra skill directories to symlink (e.g. cron job skill dirs) */
    extraSkillPaths?: string[];
  }
): Promise<void> {
  // Determine skills directories from ACP_BACKENDS_ALL config
  const key = options.backend || options.agent_type || '';
  const skillsDirs = getSkillsDirsForBackend(key);

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
    const excludeSet = new Set(options.excludeBuiltinSkills ?? []);
    for (const skillName of autoSkillNames) {
      if (excludeSet.has(skillName)) continue;
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
    for (const skillName of options.enabled_skills ?? []) {
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

    // Symlink extra skill directories (e.g. cron job SKILL.md dirs)
    for (const extraPath of options.extraSkillPaths ?? []) {
      const skillDirName = path.basename(extraPath);
      const targetSkillDir = path.join(targetSkillsDir, skillDirName);
      try {
        await fs.stat(extraPath);
        try {
          await fs.lstat(targetSkillDir);
        } catch {
          await fs.symlink(extraPath, targetSkillDir, 'junction');
          console.log(`[setupAssistantWorkspace] Symlinked extra skill: ${extraPath} -> ${targetSkillDir}`);
        }
      } catch {
        console.warn(`[setupAssistantWorkspace] Extra skill directory not found: ${extraPath}`);
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
  // 使用前端提供的custom_workspace标志，如果没有则根据workspace参数判断
  const custom_workspace = providedCustomWorkspace !== undefined ? providedCustomWorkspace : !!workspace;

  if (!workspace) {
    const tempPath = getSystemDir().workDir;
    workspace = path.join(tempPath, defaultWorkspaceName);
    await fs.mkdir(workspace, { recursive: true });
  } else {
    // 规范化路径：去除末尾斜杠，解析为绝对路径
    workspace = path.resolve(workspace);
  }

  return { workspace, custom_workspace };
};

export const createGeminiAgent = async (
  model: TProviderWithModel,
  workspace?: string,
  defaultFiles?: string[],
  web_search_engine?: 'google' | 'default',
  custom_workspace?: boolean,
  context_file_name?: string,
  preset_rules?: string,
  enabled_skills?: string[],
  preset_assistant_id?: string,
  session_mode?: string,
  is_health_check?: boolean,
  extraSkillPaths?: string[],
  excludeBuiltinSkills?: string[]
): Promise<TChatConversation> => {
  const { workspace: newWorkspace, custom_workspace: finalCustomWorkspace } = await buildWorkspaceWidthFiles(
    `gemini-temp-${Date.now()}`,
    workspace,
    defaultFiles,
    custom_workspace
  );

  // 对 temp workspace 设置 skill symlinks（原生 SkillManager 自动发现）
  // Set up skill symlinks for native SkillManager discovery
  if (!finalCustomWorkspace) {
    await setupAssistantWorkspace(newWorkspace, {
      agent_type: 'gemini',
      enabled_skills,
      extraSkillPaths,
      excludeBuiltinSkills,
    });
  }

  return {
    type: 'gemini',
    model,
    extra: {
      workspace: newWorkspace,
      custom_workspace: finalCustomWorkspace,
      web_search_engine,
      context_file_name,
      // 系统规则 / System rules
      preset_rules,
      // 向后兼容：contextContent 保存 rules / Backward compatible: contextContent stores rules
      contextContent: preset_rules,
      // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
      enabled_skills,
      // 预设助手 ID，用于在会话面板显示助手名称和头像
      // Preset assistant ID for displaying name and avatar in conversation panel
      preset_assistant_id,
      // Initial session mode from Guid page mode selector
      session_mode,
      // Explicit marker for temporary health-check conversations
      is_health_check,
    },
    desc: finalCustomWorkspace ? newWorkspace : '',
    created_at: Date.now(),
    modified_at: Date.now(),
    name: newWorkspace,
    id: uuid(),
  };
};

export const createAcpAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, custom_workspace } = await buildWorkspaceWidthFiles(
    `${extra.backend}-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.custom_workspace
  );

  // 对 temp workspace 设置 skill symlinks（原生发现）
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      backend: extra.backend,
      enabled_skills: extra.enabled_skills,
      extraSkillPaths: extra.extraSkillPaths,
      excludeBuiltinSkills: extra.excludeBuiltinSkills,
    });
  }

  return {
    type: 'acp',
    extra: {
      workspace: workspace,
      custom_workspace,
      backend: extra.backend as AcpBackend,
      cli_path: extra.cli_path,
      agent_name: extra.agent_name,
      custom_agent_id: extra.custom_agent_id, // 同时用于标识预设助手 / Also used to identify preset assistant
      preset_context: extra.preset_context, // 智能助手的预设规则/提示词
      // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
      enabled_skills: extra.enabled_skills,
      // 排除的内置自动注入 skills / Builtin auto-injected skills to exclude
      excludeBuiltinSkills: extra.excludeBuiltinSkills,
      // 预设助手 ID，用于在会话面板显示助手名称和头像
      // Preset assistant ID for displaying name and avatar in conversation panel
      preset_assistant_id: extra.preset_assistant_id,
      // Initial session mode selected on Guid page (from AgentModeSelector)
      session_mode: extra.session_mode,
      // Pre-selected model from Guid page (cached model list)
      current_model_id: extra.current_model_id,
      // Explicit marker for temporary health-check conversations
      is_health_check: extra.is_health_check,
      // Team ownership — used by sidebar filter to hide team-owned conversations
      ...(extra.team_id ? { team_id: extra.team_id } : {}),
    },
    created_at: Date.now(),
    modified_at: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

export const createNanobotAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, custom_workspace } = await buildWorkspaceWidthFiles(
    `nanobot-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.custom_workspace
  );

  // 对 temp workspace 设置 skill symlinks
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      agent_type: 'nanobot',
      enabled_skills: extra.enabled_skills,
      extraSkillPaths: extra.extraSkillPaths,
      excludeBuiltinSkills: extra.excludeBuiltinSkills,
    });
  }

  return {
    type: 'nanobot',
    extra: {
      workspace: workspace,
      custom_workspace,
      enabled_skills: extra.enabled_skills,
      preset_assistant_id: extra.preset_assistant_id,
    },
    created_at: Date.now(),
    modified_at: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

export const createRemoteAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, custom_workspace } = await buildWorkspaceWidthFiles(
    `remote-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.custom_workspace
  );

  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      enabled_skills: extra.enabled_skills,
      extraSkillPaths: extra.extraSkillPaths,
      excludeBuiltinSkills: extra.excludeBuiltinSkills,
    });
  }

  return {
    type: 'remote',
    extra: {
      workspace,
      custom_workspace,
      remoteAgentId: extra.remoteAgentId!,
      enabled_skills: extra.enabled_skills,
      preset_assistant_id: extra.preset_assistant_id,
    },
    created_at: Date.now(),
    modified_at: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

export const createAionrsAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, custom_workspace } = await buildWorkspaceWidthFiles(
    `aionrs-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.custom_workspace
  );

  // Set up skill symlinks for native discovery by aionrs CLI
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      agent_type: 'aionrs',
      enabled_skills: extra.enabled_skills,
      extraSkillPaths: extra.extraSkillPaths,
      excludeBuiltinSkills: extra.excludeBuiltinSkills,
    });
  }

  return {
    type: 'aionrs',
    model: options.model,
    extra: {
      workspace,
      custom_workspace,
      preset_rules: extra.preset_rules,
      enabled_skills: extra.enabled_skills,
      preset_assistant_id: extra.preset_assistant_id,
      session_mode: extra.session_mode,
    },
    desc: custom_workspace ? workspace : '',
    created_at: Date.now(),
    modified_at: Date.now(),
    name: workspace,
    id: uuid(),
  };
};

export const createOpenClawAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, custom_workspace } = await buildWorkspaceWidthFiles(
    `openclaw-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.custom_workspace
  );

  // 对 temp workspace 设置 skill symlinks
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      enabled_skills: extra.enabled_skills,
      extraSkillPaths: extra.extraSkillPaths,
      excludeBuiltinSkills: extra.excludeBuiltinSkills,
    });
  }

  const expectedIdentityHash = await computeOpenClawIdentityHash(workspace);
  return {
    type: 'openclaw-gateway',
    extra: {
      workspace: workspace,
      backend: extra.backend as AcpBackendAll,
      agent_name: extra.agent_name,
      custom_workspace,
      gateway: {
        cli_path: extra.cli_path,
      },
      runtimeValidation: {
        expectedWorkspace: workspace,
        expectedBackend: extra.backend,
        expectedAgentName: extra.agent_name,
        expectedCliPath: extra.cli_path,
        // Note: model is not used by openclaw-gateway, so skip expectedModel to avoid
        // validation mismatch (conversation object doesn't store model for this type)
        expectedIdentityHash,
        switchedAt: extra.runtimeValidation?.switchedAt ?? Date.now(),
      },
      // Enabled skills list (loaded via SkillManager)
      enabled_skills: extra.enabled_skills,
      // Preset assistant ID for displaying name and avatar in conversation panel
      preset_assistant_id: extra.preset_assistant_id,
    },
    created_at: Date.now(),
    modified_at: Date.now(),
    name: workspace,
    id: uuid(),
  };
};
