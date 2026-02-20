/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HookEvent, HookContext, HookResult, NormalizedHook, QueueMessage } from './types';

/**
 * Result from executeHooks including accumulated queue messages
 */
export type ExecuteHooksResult = HookResult & {
  queueMessages: QueueMessage[];
};

/**
 * Execute all hooks for a specific event in priority order.
 *
 * Hooks call ctx.enqueue(msg) to queue messages instead of returning them.
 * All queued messages are collected and returned in the result.
 */
export async function executeHooks(event: HookEvent, context: HookContext, hooks: NormalizedHook[]): Promise<ExecuteHooksResult> {
  // Filter hooks for this event
  const applicable = hooks
    .filter((h) => h.event === event && h.enabled)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.moduleName.localeCompare(b.moduleName);
    });

  // Collector for queued messages
  const queueMessages: QueueMessage[] = [];
  const enqueue = (msg: QueueMessage) => {
    queueMessages.push(msg);
  };

  // Execute pipeline
  let result: HookResult = { content: context.content };

  for (const hook of applicable) {
    if (result.blocked) break;

    try {
      const output = await Promise.resolve(
        hook.handler({
          ...context,
          event,
          content: result.content ?? context.content,
          enqueue,
        })
      );

      if (output) {
        result = {
          content: output.content ?? result.content,
          blocked: output.blocked ?? result.blocked,
          blockReason: output.blockReason ?? result.blockReason,
        };
      }
    } catch (error) {
      console.warn(`[Hooks] ${hook.moduleName}.${hook.event} failed:`, error);
    }
  }

  return { ...result, queueMessages };
}
