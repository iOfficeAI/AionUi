/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSkillsDir, loadSkillsContent } from '@process/initStorage';
import { AcpSkillManager, buildSkillsIndexText } from './AcpSkillManager';

/**
 * 首次消息处理配置
 * First message processing configuration
 */
export interface FirstMessageConfig {
  /** 预设上下文/规则 / Preset context/rules */
  presetContext?: string;
  /** 启用的 skills 列表 / Enabled skills list */
  enabledSkills?: string[];
}

/**
 * 构建系统指令内容（完整 skills 内容注入 - 用于 Gemini）
 * Build system instructions content (full skills content injection - for Gemini)
 *
 * @param config - 首次消息配置 / First message configuration
 * @returns 系统指令字符串或 undefined / System instructions string or undefined
 */
export async function buildSystemInstructions(config: FirstMessageConfig): Promise<string | undefined> {
  const instructions: string[] = [];

  // 添加预设上下文 / Add preset context
  if (config.presetContext) {
    instructions.push(config.presetContext);
  }

  // 加载并添加 skills 内容 / Load and add skills content
  if (config.enabledSkills && config.enabledSkills.length > 0) {
    const skillsContent = await loadSkillsContent(config.enabledSkills);
    if (skillsContent) {
      instructions.push(skillsContent);
    }
  }

  if (instructions.length === 0) {
    return undefined;
  }

  return instructions.join('\n\n');
}

/**
 * 为首次消息注入系统指令（完整 skills 内容 - 用于 Gemini）
 * Inject system instructions for first message (full skills content - for Gemini)
 *
 * 注意：使用直接前缀方式而非 XML 标签，以确保 Claude Code CLI 等外部 agent 能正确识别
 * Note: Use direct prefix instead of XML tags to ensure external agents like Claude Code CLI can recognize it
 *
 * @param content - 原始消息内容 / Original message content
 * @param config - 首次消息配置 / First message configuration
 * @returns 注入系统指令后的消息内容 / Message content with system instructions injected
 */
export async function prepareFirstMessage(content: string, config: FirstMessageConfig): Promise<string> {
  const systemInstructions = await buildSystemInstructions(config);

  if (!systemInstructions) {
    return content;
  }

  // 使用与 Gemini Agent 类似的直接前缀格式，确保 Claude/Codex 等外部 agent 能正确识别
  // Use direct prefix format similar to Gemini Agent to ensure Claude/Codex can recognize it
  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
}

/**
 * 为首条消息准备内容：注入规则 + skills 索引（而非完整内容）
 * Prepare first message: inject rules + skills INDEX (not full content)
 *
 * 用于 ACP agents (Claude/OpenCode) 和 Codex，Agent 通过 Read 工具按需读取 skill 文件
 * Used for ACP agents (Claude/OpenCode) and Codex, Agent reads skill files on-demand using Read tool
 *
 * 注意：内置 skills（_builtin/ 目录下）会自动注入，不需要在 enabledSkills 中指定
 * Note: Builtin skills (in _builtin/ directory) are auto-injected, no need to specify in enabledSkills
 *
 * @param content - 原始消息内容 / Original message content
 * @param config - 首次消息配置 / First message configuration
 * @returns 注入系统指令后的消息内容 / Message content with system instructions injected
 */
export async function prepareFirstMessageWithSkillsIndex(content: string, config: FirstMessageConfig): Promise<string> {
  const instructions: string[] = [];

  // 1. 添加预设规则 / Add preset rules
  if (config.presetContext) {
    instructions.push(config.presetContext);
  }

  // 2. 加载 skills 索引（包括内置 skills + 可选 skills）
  // Load skills INDEX (including builtin skills + optional skills)
  // 使用单例模式避免重复文件系统扫描 / Use singleton to avoid repeated filesystem scans
  const skillManager = AcpSkillManager.getInstance(config.enabledSkills);
  // discoverSkills 会自动先加载内置 skills / discoverSkills auto-loads builtin skills first
  await skillManager.discoverSkills(config.enabledSkills);

  // 只有当有任何 skills 时才注入 / Only inject if there are any skills
  if (skillManager.hasAnySkills()) {
    const skillsIndex = skillManager.getSkillsIndex();
    if (skillsIndex.length > 0) {
      // getSkillsDir() already returns CLI-safe path (symlink on macOS)
      // getSkillsDir() 已返回 CLI 安全路径（macOS 上使用符号链接）
      const skillsDir = getSkillsDir();
      const builtinSkillsDir = skillsDir + '/_builtin';
      const indexText = buildSkillsIndexText(skillsIndex);

      // 告诉 Agent skills 文件的位置，让它按需读取
      // Tell Agent where skills files are located for on-demand reading
      const skillsInstruction = `${indexText}

[Skills Location]
Skills are stored in two locations:
- Builtin skills (auto-enabled): ${builtinSkillsDir}/{skill-name}/SKILL.md
- Optional skills: ${skillsDir}/{skill-name}/SKILL.md

Each skill has a SKILL.md file containing detailed instructions.
To use a skill, read its SKILL.md file when needed.

For example:
- Builtin "cron" skill: ${builtinSkillsDir}/cron/SKILL.md
- Optional "pptx" skill: ${skillsDir}/pptx/SKILL.md`;

      instructions.push(skillsInstruction);
    }
  }

  if (instructions.length === 0) {
    return content;
  }

  const systemInstructions = instructions.join('\n\n');
  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
}
