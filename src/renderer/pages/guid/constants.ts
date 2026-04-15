/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import coworkSvg from '@/renderer/assets/icons/cowork.svg';

/**
 * Map custom avatar identifiers to their resolved image URLs.
 */
export const CUSTOM_AVATAR_IMAGE_MAP: Record<string, string> = {
  'cowork.svg': coworkSvg,
  '\u{1F6E0}\u{FE0F}': coworkSvg,
};

/**
 * Builtin agent options for agent switcher dropdowns.
 * Shared by GuidPage and AssistantEditDrawer.
 */
export const BUILTIN_AGENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'aionrs', label: 'Aion CLI' },
  { value: 'gemini', label: 'Gemini CLI' },
  { value: 'claude', label: 'Claude Code' },
  { value: 'qwen', label: 'Qwen Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'codebuddy', label: 'CodeBuddy' },
  { value: 'opencode', label: 'OpenCode' },
];
