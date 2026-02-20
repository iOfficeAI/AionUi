/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public API for Module-Based Hooks System
 */

// Main hooks runner
export { runHooks } from './HookRunner';
export { createHookUtils } from './HookRunner';
export { runAgentHooks, type AgentType } from './AgentHooks';

// Module loading and execution
export { loadHookModules } from './ModuleLoader';
export { executeHooks } from './HookExecutor';

// Type exports
export { HOOK_PRIORITY, type HookEvent, type HookContext, type HookResult, type HookHandler, type HookConfig, type HookModule, type HookUtils, type NormalizedHook, type QueueMessage } from './types';
export { type ExecuteHooksResult } from './HookExecutor';
