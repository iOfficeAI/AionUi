/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module-Based Hooks System
 *
 * Each hook module exports an object with event handlers:
 *   module.exports = {
 *     onWorkspaceInit: { handler: async (ctx) => {...}, priority: 10 },
 *     onSendMessage: (ctx) => {...}  // Shorthand
 *   };
 */

/**
 * Hook priority constants
 */
export const HOOK_PRIORITY = {
  CRITICAL: 1, // Security (runs first)
  HIGH: 10, // Core features
  NORMAL: 50, // Default
  LOW: 90, // Logging/analytics
  FINAL: 100, // Cleanup (runs last)
} as const;

/**
 * Hook events (extensible)
 */
export type HookEvent = 'onWorkspaceInit' | 'onConversationInit' | 'onSendMessage' | 'onFirstMessage' | 'onBuildSystemInstructions' | 'onError' | 'onQueueInit' | 'onAgentResponse';

/**
 * Hook context (same for all hooks)
 */
export type HookContext = {
  event: HookEvent;
  content?: string;
  workspace: string;
  backend?: string;
  assistantPath?: string;
  conversationId?: string;
  enabledSkills?: string[];
  skillsSourceDir?: string;
  presetContext?: string;
  utils: HookUtils;
};

/**
 * Hook result
 */
export type HookResult = {
  content?: string;
  blocked?: boolean;
  blockReason?: string;
  /** Messages to enqueue into the agent's message queue (used by onQueueInit) */
  queueMessages?: Array<{
    content: string;
    files?: string[];
    priority?: 'normal' | 'high';
    source?: 'hook' | 'cron' | 'system';
  }>;
};

/**
 * Hook handler function
 */
export type HookHandler = (context: HookContext) => HookResult | Promise<HookResult>;

/**
 * Hook configuration (full format)
 */
export type HookConfig = {
  handler: HookHandler;
  priority?: number;
  enabled?: boolean;
};

/**
 * Hook module (object-based exports)
 */
export type HookModule = {
  onWorkspaceInit?: HookConfig | HookHandler;
  onConversationInit?: HookConfig | HookHandler;
  onSendMessage?: HookConfig | HookHandler;
  onFirstMessage?: HookConfig | HookHandler;
  onBuildSystemInstructions?: HookConfig | HookHandler;
  onError?: HookConfig | HookHandler;
  /** Hook to populate the message queue when a conversation starts */
  onQueueInit?: HookConfig | HookHandler;
  /** Hook fired after each agent turn finishes, allowing dynamic follow-up message queuing */
  onAgentResponse?: HookConfig | HookHandler;
  [key: string]: HookConfig | HookHandler | undefined;
};

/**
 * Utility functions available to hooks
 */
export type HookUtils = {
  // File operations
  copyDirectory: (source: string, target: string, options?: { overwrite?: boolean }) => Promise<void>;
  readFile: (filePath: string, encoding?: BufferEncoding) => Promise<string>;
  writeFile: (filePath: string, content: string, encoding?: BufferEncoding) => Promise<void>;
  exists: (filePath: string) => Promise<boolean>;
  ensureDir: (dirPath: string) => Promise<void>;
  join: (...paths: string[]) => string;

  // Skill operations
  symlinkSkill: (skillName: string, targetDir: string) => Promise<void>;
  readSkillContent: (skillName: string) => Promise<string>;
  getSkillMetadata: (skillName: string) => Promise<{ name: string; description: string }>;
};

/**
 * Internal: Normalized hook (after parsing)
 */
export type NormalizedHook = {
  event: HookEvent;
  handler: HookHandler;
  priority: number;
  enabled: boolean;
  moduleName: string;
};
