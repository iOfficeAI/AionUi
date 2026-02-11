/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent mode option interface
 * 代理模式选项接口
 */
export interface AgentModeOption {
  /** Mode value sent to agent / 发送给代理的模式值 */
  value: string;
  /** Display label matching CLI display / 与 CLI 显示一致的标签 */
  label: string;
  /** Optional description / 可选描述 */
  description?: string;
}

/**
 * Agent modes configuration
 * Maps backend type to available modes
 * Labels match CLI display text exactly — no i18n.
 *
 * Note:
 * - Claude: supports session/set_mode via ACP
 *   - Only 2 behavioral modes: default (execute) and plan
 *   - Permission levels (acceptEdits, bypassPermissions, yolo) are controlled
 *     via SecurityModalContent settings, not mode switching
 * - Qwen: ACP session/set_mode returns success but does not enforce behavior.
 *   Disabled until upstream fix. See https://github.com/QwenLM/qwen-code/issues/1806
 * - OpenCode: plan/build modes via ACP session/set_mode
 * - iFlow: smart/yolo/default/plan modes via ACP session/set_mode (verified)
 * - Gemini: supports default/autoEdit (auto-approve at manager layer, not via ACP)
 * - Codex: supports default/autoEdit (auto-approve at manager layer, not via ACP)
 * - Goose: mode set at startup only, not during session
 */
export const AGENT_MODES: Record<string, AgentModeOption[]> = {
  claude: [
    { value: 'default', label: 'Accept Edits' },
    { value: 'plan', label: 'Plan' },
  ],
  // Qwen: ACP session/set_mode returns success but does not enforce plan mode behavior.
  // Disabled until upstream fix. See https://github.com/QwenLM/qwen-code/issues/1806
  // qwen: [
  //   { value: 'default', label: 'Default' },
  //   { value: 'plan', label: 'Plan' },
  // ],
  opencode: [
    { value: 'build', label: 'Build' },
    { value: 'plan', label: 'Plan' },
  ],
  iflow: [
    { value: 'default', label: 'Default' },
    { value: 'smart', label: 'Smart' },
    { value: 'plan', label: 'Plan' },
  ],
  gemini: [
    { value: 'default', label: 'Default' },
    { value: 'autoEdit', label: 'Auto-Accept Edits' },
  ],
  codex: [
    { value: 'default', label: 'Default' },
    { value: 'autoEdit', label: 'Auto Edit' },
  ],
};

/**
 * Get available modes for a given backend
 * Returns empty array if backend doesn't support mode switching
 *
 * @param backend - Agent backend type
 * @returns Array of available modes
 */
export function getAgentModes(backend: string | undefined): AgentModeOption[] {
  if (!backend) return [];
  return AGENT_MODES[backend] || [];
}

/**
 * Check if a backend supports mode switching during session
 *
 * @param backend - Agent backend type
 * @returns true if mode switching is supported
 */
export function supportsModeSwitch(backend: string | undefined): boolean {
  if (!backend) return false;
  return backend in AGENT_MODES && AGENT_MODES[backend].length > 0;
}
