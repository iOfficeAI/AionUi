/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HookEvent, HookContext, HookResult, NormalizedHook } from './types';

/**
 * Execute all hooks for a specific event in priority order
 */
export async function executeHooks(event: HookEvent, context: HookContext, hooks: NormalizedHook[]): Promise<HookResult> {
  // Filter hooks for this event
  const applicable = hooks
    .filter((h) => h.event === event && h.enabled)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.moduleName.localeCompare(b.moduleName);
    });

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
        })
      );

      if (output) {
        // Merge queueMessages from all hooks (accumulate, don't replace)
        const mergedQueueMessages = [...(result.queueMessages || []), ...(output.queueMessages || [])];
        result = {
          content: output.content ?? result.content,
          blocked: output.blocked ?? result.blocked,
          blockReason: output.blockReason ?? result.blockReason,
          queueMessages: mergedQueueMessages.length > 0 ? mergedQueueMessages : undefined,
        };
      }
    } catch (error) {
      console.warn(`[Hooks] ${hook.moduleName}.${hook.event} failed:`, error);
    }
  }

  return result;
}
