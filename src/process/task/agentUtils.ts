/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSkillsDir, loadSkillsContent } from '@process/initStorage';
import { AcpSkillManager, buildSkillsIndexText } from './AcpSkillManager';

/**
 * HTML Preview 交互协议说明（注入到所有 Agent 的 System Prompt）
 * HTML Preview interaction protocol (injected into all agents' system prompts)
 */
const HTML_INTERACTION_PROTOCOL = `[HTML Preview Interaction Protocol]
When generating HTML pages for preview, you can make them interactive using two protocols:

## 1. __AGENT_ACTION__ — Send natural language instructions to the Agent
Usage: console.log('__AGENT_ACTION__' + instruction)
The agent receives the instruction as a new user message and decides how to execute it.

Rules:
- The instruction MUST be natural language describing the user's intent and data
- Include full context in the instruction (file paths, data content, operation type)

Examples:
- Button: <button onclick="console.log('__AGENT_ACTION__User clicked refresh, please regenerate the report')">Refresh</button>
- Form: <form onsubmit="event.preventDefault();var d=Object.fromEntries(new FormData(this));console.log('__AGENT_ACTION__User submitted: '+JSON.stringify(d)+', please append to data.json')"><input name="name"><button type="submit">Submit</button></form>

## 2. __EXEC__ — Execute Node.js code directly (no agent round-trip)
Usage: const result = await window.__exec(code_string)
The code runs in Node.js with access to: fs, path, workspace, readJSON, writeJSON, readFile, writeFile.
Returns: { success: boolean, result?: any, error?: string }

Built-in helpers:
- readJSON(relativePath) — read and parse a JSON file
- writeJSON(relativePath, data) — write data as JSON (auto-creates directories)
- readFile(relativePath) — read a text file
- writeFile(relativePath, content) — write a text file (auto-creates directories)
- fs, path — Node.js built-in modules
- workspace — current workspace directory path

Examples:
- Read: const r = await window.__exec("return readJSON('data.json')"); if(r.success) console.log(r.result);
- Write: await window.__exec("const d=readJSON('data.json');d.items.push({name:'New'});writeJSON('data.json',d)");
- List files: const r = await window.__exec("return fs.readdirSync(workspace)");

Choose __AGENT_ACTION__ for complex/ambiguous tasks needing AI reasoning. Choose __EXEC__ for direct data operations (CRUD, file I/O) where the logic is straightforward.`;

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

  // 注入 HTML 交互协议 / Inject HTML interaction protocol
  instructions.push(HTML_INTERACTION_PROTOCOL);

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

  // 3. 注入 HTML 交互协议 / Inject HTML interaction protocol
  instructions.push(HTML_INTERACTION_PROTOCOL);

  if (instructions.length === 0) {
    return content;
  }

  const systemInstructions = instructions.join('\n\n');
  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
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
  await skillManager.discoverSkills(config.enabledSkills);

  if (skillManager.hasAnySkills()) {
    const skillsIndex = skillManager.getSkillsIndex();
    if (skillsIndex.length > 0) {
      const indexText = buildSkillsIndexText(skillsIndex);
      instructions.push(indexText);
    }
  }

  // 注入 HTML 交互协议 / Inject HTML interaction protocol
  instructions.push(HTML_INTERACTION_PROTOCOL);

  if (instructions.length === 0) {
    return undefined;
  }

  return instructions.join('\n\n');
}
