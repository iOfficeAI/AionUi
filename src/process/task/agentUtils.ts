/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcpSkillManager, buildSkillsIndexText, type SkillIndex } from './AcpSkillManager';
import { getTeamGuidePrompt } from '@process/team/prompts/teamGuidePrompt.ts';
import { resolveLeaderAssistantLabel } from '@process/team/prompts/teamGuideAssistant.ts';

/**
 * 首次消息处理配置
 * First message processing configuration
 */
export interface FirstMessageConfig {
  /** 预设上下文/规则 / Preset context/rules */
  presetContext?: string;
  /** 启用的 skills 列表 / Enabled skills list */
  enabledSkills?: string[];
  /** 排除的内置自动注入 skills / Builtin auto-injected skills to exclude */
  excludeBuiltinSkills?: string[];
  /** Inject Team mode guidance prompt when agent has aion_create_team capability */
  enableTeamGuide?: boolean;
  /** Agent backend type (e.g. 'claude', 'codex') — used to populate team guide prompt */
  backend?: string;
  /**
   * Preset assistant id backing this conversation (e.g. 'builtin-word-creator').
   * When set, the team guide prompt shows the assistant's display name on the
   * Leader row instead of the raw backend key.
   */
  presetAssistantId?: string;
  /**
   * Absolute directory the backend materialized this conversation's skills into
   * (auto-inject + opt-in). Used to tell native agents where to read SKILL.md
   * files via the Read tool.
   */
  materializedSkillsDir?: string;
}

/**
 * 构建系统指令内容（仅 presetContext + team guide；skills 通过 materialize + 文件系统交付）
 * Build system instructions (preset context + team guide only; skills are
 * delivered via backend materialization + filesystem, not inlined).
 */
export async function buildSystemInstructions(config: FirstMessageConfig): Promise<string | undefined> {
  const instructions: string[] = [];

  if (config.presetContext) {
    instructions.push(config.presetContext);
  }

  if (config.enableTeamGuide) {
    const leaderLabel = await resolveLeaderAssistantLabel(config.presetAssistantId);
    instructions.push(getTeamGuidePrompt({ backend: config.backend, leaderLabel }));
  }

  if (instructions.length === 0) {
    return undefined;
  }

  return instructions.join('\n\n');
}

/**
 * 为首次消息注入系统指令
 * Inject system instructions for first message.
 */
export async function prepareFirstMessage(content: string, config: FirstMessageConfig): Promise<string> {
  const systemInstructions = await buildSystemInstructions(config);

  if (!systemInstructions) {
    return content;
  }

  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
}

/**
 * 为首条消息准备内容：注入规则 + skills 索引（而非完整内容）
 * Prepare first message: inject rules + skills INDEX (not full content).
 *
 * 用于 ACP agents (Claude/OpenCode) 和 Codex，Agent 通过 Read 工具按需读取 skill 文件。
 * Used for ACP agents (Claude/OpenCode) and Codex, Agent reads skill files on-demand using Read tool.
 *
 * 注意：auto-inject skills (位于 auto-inject/ 目录下) 自动注入，无需在 enabledSkills 中指定。
 * Note: Auto-inject skills (under auto-inject/ directory) are auto-injected; no need to list in enabledSkills.
 */
export async function prepareFirstMessageWithSkillsIndex(
  content: string,
  config: FirstMessageConfig
): Promise<{ content: string; loadedSkills: SkillIndex[] }> {
  const instructions: string[] = [];
  let loadedSkills: SkillIndex[] = [];

  if (config.presetContext) {
    instructions.push(config.presetContext);
  }

  const skillManager = AcpSkillManager.getInstance(config.enabledSkills);
  await skillManager.discoverSkills(config.enabledSkills, config.excludeBuiltinSkills);

  if (skillManager.hasAnySkills()) {
    const excludeSet = new Set(config.excludeBuiltinSkills ?? []);
    const skillsIndex = skillManager.getSkillsIndex().filter((s) => !excludeSet.has(s.name));
    loadedSkills = skillsIndex;
    if (skillsIndex.length > 0) {
      const indexText = buildSkillsIndexText(skillsIndex);

      // The backend materializes auto-inject + opt-in skills into a single
      // per-conversation directory (flat layout: `{dir}/{name}/SKILL.md`).
      // Point the agent at that directory so it can read files on demand.
      let skillsInstruction = indexText;
      if (config.materializedSkillsDir) {
        skillsInstruction += `

[Skills Location]
Skills are available at: ${config.materializedSkillsDir}/{skill-name}/SKILL.md

Each skill has a SKILL.md file containing detailed instructions. To use a
skill, read its SKILL.md file when needed.

Example: ${config.materializedSkillsDir}/cron/SKILL.md`;
      }

      instructions.push(skillsInstruction);
    }
  }

  if (config.enableTeamGuide) {
    const leaderLabel = await resolveLeaderAssistantLabel(config.presetAssistantId);
    instructions.push(getTeamGuidePrompt({ backend: config.backend, leaderLabel }));
  }

  if (instructions.length === 0) {
    return { content, loadedSkills };
  }

  const systemInstructions = instructions.join('\n\n');
  return {
    content: `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`,
    loadedSkills,
  };
}

/**
 * 构建系统指令（仅 skills 索引，不注入全文 - 用于 Gemini）
 * Build system instructions with skills INDEX only (no full content - for Gemini)
 *
 * Gemini 没有文件读取工具，无法自行读取 SKILL.md 文件。
 * 当 Gemini 需要某个 skill 的详细指令时，输出 [LOAD_SKILL: skill-name]，
 * 由系统截获并将 skill 全文作为 [System Response] 发回。
 *
 * Gemini has no file read tool and cannot read SKILL.md files on its own.
 * When Gemini needs detailed instructions for a skill, it outputs [LOAD_SKILL: skill-name],
 * and the system intercepts it and sends back the full skill content as [System Response].
 *
 * @param config - 首次消息配置 / First message configuration
 * @returns 系统指令字符串或 undefined / System instructions string or undefined
 */
export async function buildSystemInstructionsWithSkillsIndex(config: FirstMessageConfig): Promise<string | undefined> {
  const instructions: string[] = [];

  // 添加预设上下文 / Add preset context
  if (config.presetContext) {
    instructions.push(config.presetContext);
  }

  // 加载 skills 索引（包括内置 skills + 可选 skills）
  // Load skills INDEX (including builtin skills + optional skills)
  const skillManager = AcpSkillManager.getInstance(config.enabledSkills);
  await skillManager.discoverSkills(config.enabledSkills, config.excludeBuiltinSkills);

  if (skillManager.hasAnySkills()) {
    const excludeSet = new Set(config.excludeBuiltinSkills ?? []);
    const skillsIndex = skillManager.getSkillsIndex().filter((s) => !excludeSet.has(s.name));
    if (skillsIndex.length > 0) {
      const indexText = buildSkillsIndexText(skillsIndex);
      instructions.push(indexText);
    }
  }

  // Inject Team Guide prompt when agent has team guide capability
  if (config.enableTeamGuide) {
    const leaderLabel = await resolveLeaderAssistantLabel(config.presetAssistantId);
    instructions.push(getTeamGuidePrompt({ backend: config.backend, leaderLabel }));
  }

  if (instructions.length === 0) {
    return undefined;
  }

  return instructions.join('\n\n');
}
