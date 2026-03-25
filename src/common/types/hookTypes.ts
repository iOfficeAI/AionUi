/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const HOOK_EVENT_TYPES = [
  'session_start',
  'before_user_prompt',
  'after_user_prompt',
  'before_tool_use',
  'after_tool_use',
  'before_response',
  'after_response',
  'session_end',
  'notification',
] as const;

export type HookEventType = (typeof HOOK_EVENT_TYPES)[number];

export const HOOK_EXECUTION_TYPES = ['native-projection', 'shell', 'js', 'prompt-transform', 'notify'] as const;

export type HookExecutionType = (typeof HOOK_EXECUTION_TYPES)[number];

export type HookManifest = {
  name: string;
  description?: string;
  version?: string;
  executionType?: HookExecutionType;
  events?: HookEventType[];
  supportedBackends?: string[];
};

export type HookInfo = HookManifest & {
  location: string;
  isCustom: boolean;
};
