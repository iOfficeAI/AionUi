/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpBackendAll } from '@/common/types/acpTypes';
import { getSkillsDirsForBackend, hasNativeSkillSupport } from '@/common/types/acpTypes';
import { uuid } from '@/common/utils';

// Re-export for backward compatibility (tests mock this path)
export { hasNativeSkillSupport };
import fs from 'fs/promises';
import path from 'path';
import { getSystemDir } from './initStorage';
import { computeOpenClawIdentityHash } from './openclawUtils';

/**
 * Ask the backend to materialize auto-inject + opt-in skills for the given
 * conversation and return the absolute directory path that holds
 * `{skillName}/SKILL.md` subdirs. On HTTP failure the empty-string fallback
 * keeps caller code simple — the conversation then starts without any
 * skills (degraded capability, not a hard failure).
 */
async function materializeAgentSkillsDir(conversationId: string, enabledSkills: string[]): Promise<string> {
  try {
    const { dir_path: dirPath } = await ipcBridge.fs.materializeSkillsForAgent.invoke({
      conversation_id: conversationId,
      enabled_skills: enabledSkills,
    });
    return dirPath;
  } catch (error) {
    console.warn('[setupAssistantWorkspace] Failed to materialize skills via backend:', error);
    return '';
  }
}

/**
 * 为 assistant 设置原生 workspace 结构（skill symlinks）
 * Set up native workspace structure for assistant (skill symlinks only)
 *
 * 后端物化 auto-inject + opt-in skills 到 {dataDir}/agent-skills/{convId}/，
 * 前端将其下每个 {skillName} 子目录 symlink 到 CLI 的原生 skills 目录。
 *
 * Backend materializes auto-inject + opt-in skills into
 * {dataDir}/agent-skills/{convId}/; we symlink each {skillName} subdir into
 * the CLI's native skills dir for auto-discovery.
 *
 * 只在 temp workspace（非用户指定）时执行，避免污染用户项目目录。
 * Only runs for temp workspaces (not user-specified) to avoid polluting user project dirs.
 */
export async function setupAssistantWorkspace(
  workspace: string,
  options: {
    conversationId: string;
    agent_type?: string;
    backend?: string;
    enabled_skills?: string[];
    /** Builtin skill names to exclude from auto-injection (e.g. 'cron' for cron-spawned conversations) */
    excludeBuiltinSkills?: string[];
    /** Absolute paths to extra skill directories to symlink (e.g. cron job skill dirs) */
    extraSkillPaths?: string[];
  }
): Promise<void> {
  const key = options.backend || options.agent_type || '';
  const skillsDirs = getSkillsDirsForBackend(key);
  if (!skillsDirs) return;

  const materializedDir = await materializeAgentSkillsDir(options.conversationId, options.enabled_skills ?? []);

  let materializedSkillNames: string[] = [];
  if (materializedDir) {
    try {
      const entries = await fs.readdir(materializedDir, { withFileTypes: true });
      materializedSkillNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      console.warn(`[setupAssistantWorkspace] Failed to enumerate materialized skills dir ${materializedDir}:`, error);
    }
  }

  const excludeSet = new Set(options.excludeBuiltinSkills ?? []);

  for (const skillsRelDir of skillsDirs) {
    const targetSkillsDir = path.join(workspace, skillsRelDir);
    await fs.mkdir(targetSkillsDir, { recursive: true });

    for (const skillName of materializedSkillNames) {
      if (excludeSet.has(skillName)) continue;
      const sourceSkillDir = path.join(materializedDir, skillName);
      const targetSkillDir = path.join(targetSkillsDir, skillName);
      try {
        await fs.lstat(targetSkillDir);
        // Already exists (from a previous materialize on this workspace), skip.
      } catch {
        try {
          await fs.symlink(sourceSkillDir, targetSkillDir, 'junction');
          console.log(`[setupAssistantWorkspace] Symlinked skill: ${skillName} -> ${targetSkillDir}`);
        } catch (error) {
          console.warn(`[setupAssistantWorkspace] Failed to symlink skill ${skillName}:`, error);
        }
      }
    }

    // Symlink extra skill directories (e.g. cron job SKILL.md dirs) — these
    // live outside the backend-managed corpus so we wire them up directly.
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

export const createAcpAgent = async (options: ICreateConversationParams): Promise<TChatConversation> => {
  const { extra } = options;
  const { workspace, custom_workspace } = await buildWorkspaceWidthFiles(
    `${extra.backend}-temp-${Date.now()}`,
    extra.workspace,
    extra.defaultFiles,
    extra.custom_workspace
  );

  const conversationId = uuid();

  // 对 temp workspace 设置 skill symlinks（原生发现）
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      conversationId,
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
    id: conversationId,
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

  const conversationId = uuid();

  // 对 temp workspace 设置 skill symlinks
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      conversationId,
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
    id: conversationId,
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

  const conversationId = uuid();

  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      conversationId,
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
    id: conversationId,
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

  const conversationId = uuid();

  // Set up skill symlinks for native discovery by aionrs CLI
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      conversationId,
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
    id: conversationId,
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

  const conversationId = uuid();

  // 对 temp workspace 设置 skill symlinks
  if (!custom_workspace) {
    await setupAssistantWorkspace(workspace, {
      conversationId,
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
    id: conversationId,
  };
};
