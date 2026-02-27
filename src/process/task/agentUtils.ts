/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { runAgentHooks } from '@/assistant/hooks';
import { runHooks } from '@/assistant/hooks/HookRunner';
import type { QueueMessage } from '@/assistant/hooks/types';

/**
 * Prepare the first message by injecting preset context and skills index.
 * Delegates to the agent hooks system for consistent behavior across agents.
 */
export async function prepareFirstMessageWithSkillsIndex(
  content: string,
  options: {
    presetContext?: string;
    enabledSkills?: string[];
    workspace?: string;
    conversationId?: string;
  }
): Promise<string> {
  const result = await runAgentHooks('onFirstMessage', {
    agentType: 'acp',
    workspace: options.workspace || '',
    content,
    enabledSkills: options.enabledSkills || [],
    conversationId: options.conversationId,
    presetContext: options.presetContext,
  });

  if (result.blocked) {
    return content;
  }

  return result.content ?? content;
}

/**
 * Run onQueueInit hooks to collect messages that should be auto-queued.
 * Returns an array of messages to enqueue into the agent's message queue.
 */
export async function runQueueInitHooks(options: { workspace?: string; backend?: string; conversationId?: string; enabledSkills?: string[]; presetContext?: string; assistantHooksPath?: string }): Promise<QueueMessage[]> {
  // Run built-in agent-level hooks (src/agent/acp/hooks/)
  const agentResult = await runAgentHooks('onQueueInit', {
    agentType: 'acp',
    workspace: options.workspace || '',
    backend: options.backend,
    enabledSkills: options.enabledSkills || [],
    conversationId: options.conversationId,
    presetContext: options.presetContext,
  });

  // Run assistant-specific hooks from the installed assistant directory
  const assistantResult = options.assistantHooksPath
    ? await runHooks('onQueueInit', {
        assistantPath: options.assistantHooksPath.replace(/\/hooks$/, ''), // runHooks appends /hooks
        workspace: options.workspace || '',
        backend: options.backend,
        enabledSkills: options.enabledSkills || [],
        conversationId: options.conversationId,
        presetContext: options.presetContext,
      })
    : { queueMessages: [] as QueueMessage[] };

  return [...agentResult.queueMessages, ...assistantResult.queueMessages];
}

/**
 * Run onAgentResponse hooks to collect messages that should be queued after each agent turn.
 * Returns an array of messages to enqueue into the agent's message queue.
 */
export async function runAgentResponseHooks(options: { workspace?: string; backend?: string; conversationId?: string; enabledSkills?: string[]; presetContext?: string; assistantHooksPath?: string; content?: string }): Promise<QueueMessage[]> {
  // Run built-in agent-level hooks (src/agent/acp/hooks/)
  const agentResult = await runAgentHooks('onAgentResponse', {
    agentType: 'acp',
    workspace: options.workspace || '',
    backend: options.backend,
    enabledSkills: options.enabledSkills || [],
    conversationId: options.conversationId,
    presetContext: options.presetContext,
    content: options.content,
  });

  // Run assistant-specific hooks from the installed assistant directory
  const assistantResult = options.assistantHooksPath
    ? await runHooks('onAgentResponse', {
        assistantPath: options.assistantHooksPath.replace(/\/hooks$/, ''), // runHooks appends /hooks
        workspace: options.workspace || '',
        backend: options.backend,
        enabledSkills: options.enabledSkills || [],
        conversationId: options.conversationId,
        presetContext: options.presetContext,
        content: options.content,
      })
    : { queueMessages: [] as QueueMessage[] };

  return [...agentResult.queueMessages, ...assistantResult.queueMessages];
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

  if (instructions.length === 0) {
    return undefined;
  }

  return instructions.join('\n\n');
}
