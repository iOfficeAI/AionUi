/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { runHooks } from '@/assistant/hooks/HookRunner';
import type { QueueMessage } from '@/assistant/hooks/types';
import type { SwarmAgentConfig, SwarmFeedEntry, SwarmHookContext, SwarmHookResult, TurnStrategy } from './types';
import type { SwarmFeedManager } from './SwarmFeedManager';

/**
 * Run swarm-specific hooks for a given agent role.
 * Injects SwarmHookContext (with enqueue) into the standard HookContext.
 *
 * Hooks call ctx.swarm.enqueue(msg) or ctx.enqueue(msg) to queue messages.
 * Both write to the same collector, returned in result.queueMessages.
 */
export async function runSwarmHooks(
  event: 'onSwarmInit' | 'onSwarmTurnStart' | 'onSwarmTurnEnd' | 'onSwarmFeedMessage',
  options: {
    role: string;
    agentConfig: SwarmAgentConfig;
    feedManager: SwarmFeedManager;
    turnNumber: number;
    maxTurns: number;
    turnStrategy: TurnStrategy;
    peers: string[];
    workspace: string;
    assistantHooksPath: string;
    content?: string;
    agentOutput?: string;
    feedEntries?: SwarmFeedEntry[];
  }
): Promise<SwarmHookResult> {
  // Shared collector — both ctx.enqueue and ctx.swarm.enqueue write here
  const queueMessages: QueueMessage[] = [];
  const enqueue = (msg: QueueMessage) => {
    queueMessages.push(msg);
  };

  const swarmContext: SwarmHookContext = {
    role: options.role,
    name: options.agentConfig.name,
    agentBackend: options.agentConfig.presetAgentType || 'claude',
    peers: options.peers,
    turnNumber: options.turnNumber,
    maxTurns: options.maxTurns,
    turnStrategy: options.turnStrategy,
    feed: {
      append: (entry) =>
        options.feedManager.append({
          from: options.role,
          backend: options.agentConfig.presetAgentType,
          ...entry,
        } as any),
      readNew: () => options.feedManager.readNewFor(options.role),
      readAll: () => options.feedManager.readAll(),
      isDone: () => options.feedManager.isDone(),
    },
    enqueue,
  };

  const result = (await runHooks(event, {
    assistantPath: options.assistantHooksPath.replace(/\/hooks$/, ''),
    workspace: options.workspace,
    backend: options.agentConfig.presetAgentType,
    content: options.content,
    enqueue,
    swarm: swarmContext,
    agentOutput: options.agentOutput,
    feedEntries: options.feedEntries,
  } as any)) as SwarmHookResult;

  // Merge: messages from ctx.enqueue (collected by executeHooks) + our shared collector
  // Since we pass the same enqueue function, executeHooks' collector and ours are the same.
  // But executeHooks also creates its own enqueue — so merge both.
  const allMessages = [...(result.queueMessages || [])];
  for (const msg of queueMessages) {
    if (!allMessages.includes(msg)) {
      allMessages.push(msg);
    }
  }
  result.queueMessages = allMessages;

  return result;
}
