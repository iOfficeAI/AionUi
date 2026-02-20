/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSkillsDir } from '@/process/initStorage';
import { loadHookModules } from '@/assistant/hooks/ModuleLoader';
import { executeHooks } from '@/assistant/hooks/HookExecutor';
import type { ExecuteHooksResult } from '@/assistant/hooks/HookExecutor';
import { createHookUtils } from '@/assistant/hooks/HookRunner';
import type { HookEvent, HookContext } from '@/assistant/hooks/types';

/**
 * Supported agent types for hook loading
 */
export type AgentType = 'acp' | 'codex' | 'gemini' | 'openclaw';

/**
 * Run agent-level hooks for a specific agent type
 *
 * Hook modules are loaded from: src/agent/{agentType}/hooks/*.js
 *
 * Each module exports an object with event handlers:
 *   module.exports = {
 *     onWorkspaceInit: { handler: async (ctx) => {...}, priority: 10 },
 *     onFirstMessage: (ctx) => {...}  // Shorthand
 *   };
 *
 * @param event - The hook event (e.g., 'onWorkspaceInit', 'onFirstMessage')
 * @param context - Hook context object
 * @returns ExecuteHooksResult with transformed content and accumulated queueMessages
 */
export async function runAgentHooks(
  event: HookEvent,
  context: {
    agentType?: AgentType;
    workspace: string;
    backend?: string;
    content?: string;
    enabledSkills?: string[];
    conversationId?: string;
    presetContext?: string;
  }
): Promise<ExecuteHooksResult> {
  const agentType = context.agentType || 'acp';
  const hooksDir = path.join(__dirname, 'agent', agentType, 'hooks');

  if (!fs.existsSync(hooksDir)) {
    return { content: context.content, queueMessages: [] };
  }

  const hookModules = loadHookModules(hooksDir);
  if (hookModules.length === 0) {
    return { content: context.content, queueMessages: [] };
  }

  const fullContext: HookContext = {
    event,
    workspace: context.workspace,
    backend: context.backend,
    content: context.content,
    enabledSkills: context.enabledSkills || [],
    conversationId: context.conversationId,
    skillsSourceDir: getSkillsDir(),
    presetContext: context.presetContext,
    utils: createHookUtils(),
    enqueue: () => {},
  };

  return await executeHooks(event, fullContext, hookModules);
}
