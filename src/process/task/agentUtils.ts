/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { runAgentHooks } from '@/assistant/hooks';
import { runHooks } from '@/assistant/hooks/HookRunner';

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
export async function runQueueInitHooks(options: { workspace?: string; backend?: string; conversationId?: string; enabledSkills?: string[]; presetContext?: string; assistantHooksPath?: string }): Promise<Array<{ content: string; files?: string[]; priority?: 'normal' | 'high'; source?: 'hook' | 'cron' | 'system' }>> {
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
    : { queueMessages: [] };

  return [...(agentResult.queueMessages || []), ...(assistantResult.queueMessages || [])];
}
