/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CODEX_MODE_NATIVE_DEFAULT,
  CODEX_MODE_NATIVE_FULL_ACCESS,
  CODEX_MODE_READ_ONLY,
} from '@/common/types/codex/codexModes';
import type { AcpSessionConfigOption, AcpSessionModes } from '@/common/types/platform/acpTypes';
import type { AgentMetadata } from './agentTypes';

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

function extractModesFromConfigOptions(config_options: AcpSessionConfigOption[]): AgentModeOption[] {
  const modeOption = config_options.find((opt) => opt.category === 'mode' && opt.type === 'select' && opt.options);
  if (!modeOption?.options || modeOption.options.length === 0) return [];
  return modeOption.options.map((opt) => ({
    value: opt.value,
    label: opt.name || opt.label || opt.value,
  }));
}

/**
 * Agent modes configuration
 * Maps backend type to available modes
 * Labels match CLI display text exactly — no i18n.
 *
 * Note:
 * - Claude: supports session/set_mode via ACP
 *   - Modes: default, acceptEdits, plan, auto, bypassPermissions (YOLO), dontAsk
 * - Qwen: ACP session/set_mode returns success but does not enforce plan mode behavior.
 *   Plan mode disabled until upstream fix. See https://github.com/QwenLM/qwen-code/issues/1806
 * - OpenCode: plan/build modes via ACP session/set_mode (no yolo support)
 * - Gemini: supports default/autoEdit/yolo (auto-approve at manager layer, not via ACP)
 * - Codex: ACP currently advertises `read-only` / `auto` / `full-access`
 * - Goose: mode set at startup only, not during session
 * - Cursor: agent/plan/ask modes via ACP session/set_mode (verified via `agent acp` session/new response)
 */
export const AGENT_MODES: Record<string, AgentModeOption[]> = {
  claude: [
    { value: 'default', label: 'Default' },
    { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-approve file edits, prompt for commands' },
    { value: 'plan', label: 'Plan' },
    { value: 'bypassPermissions', label: 'YOLO' },
    { value: 'dontAsk', label: "Don't Ask", description: 'Block all actions except pre-approved rules' },
  ],
  // Qwen: ACP session/set_mode returns success but does not enforce plan mode behavior.
  // Plan mode disabled until upstream fix. See https://github.com/QwenLM/qwen-code/issues/1806
  qwen: [
    { value: 'default', label: 'Default' },
    { value: 'yolo', label: 'YOLO' },
  ],
  opencode: [
    { value: 'build', label: 'Build' },
    { value: 'plan', label: 'Plan' },
  ],
  gemini: [
    { value: 'default', label: 'Default' },
    { value: 'autoEdit', label: 'Auto-Accept Edits' },
    { value: 'yolo', label: 'YOLO' },
  ],
  aionrs: [
    { value: 'default', label: 'Default' },
    { value: 'auto_edit', label: 'Auto-Accept Edits' },
    { value: 'yolo', label: 'YOLO' },
  ],
  codex: [
    { value: CODEX_MODE_READ_ONLY, label: 'Read Only' },
    { value: CODEX_MODE_NATIVE_DEFAULT, label: 'Default' },
    { value: CODEX_MODE_NATIVE_FULL_ACCESS, label: 'Full Access' },
  ],
  cursor: [
    { value: 'agent', label: 'Agent', description: 'Full agent capabilities with tool access' },
    { value: 'plan', label: 'Plan', description: 'Read-only mode for planning and designing before implementation' },
    { value: 'ask', label: 'Ask', description: 'Q&A mode - no edits or command execution' },
  ],
  snow: [
    { value: 'default', label: 'Agent', description: 'Full agent mode with tool access' },
    { value: 'yolo', label: 'YOLO', description: 'Auto-approve all operations without prompting' },
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

export function getAgentModesFromHandshake(agent?: Pick<AgentMetadata, 'handshake'>): AgentModeOption[] {
  const sessionModes = agent?.handshake?.available_modes as AcpSessionModes | undefined;
  if (sessionModes?.available_modes && sessionModes.available_modes.length > 0) {
    return sessionModes.available_modes.map((mode) => ({
      value: mode.id,
      label: mode.name ?? mode.id,
      description: mode.description ?? undefined,
    }));
  }

  const configOptions = agent?.handshake?.config_options as AcpSessionConfigOption[] | undefined;
  if (Array.isArray(configOptions)) {
    const modes = extractModesFromConfigOptions(configOptions);
    if (modes.length > 0) {
      return modes;
    }
  }

  return [];
}

/**
 * Convert a snake_case mode value to a title-cased label.
 * e.g. 'auto_edit' -> 'Auto Edit', 'plan' -> 'Plan'
 */
function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Merge static mode definitions with dynamic capabilities from the agent.
 * - If capabilityModes is null/empty, return static modes (fallback).
 * - Otherwise, return only modes reported by capabilities, preserving
 *   static labels when available and title-casing unknown modes.
 *
 * @param backend - Agent backend type
 * @param capabilityModes - Dynamic modes from capabilities.modes (null = not available)
 */
export function mergeWithCapabilities(
  backend: string | undefined,
  capabilityModes: string[] | null
): AgentModeOption[] {
  const staticModes = getAgentModes(backend);
  if (!capabilityModes || capabilityModes.length === 0) {
    return staticModes;
  }

  const staticMap = new Map(staticModes.map((m) => [m.value, m]));
  return capabilityModes.map((value) => staticMap.get(value) ?? { value, label: toTitleCase(value) });
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

/**
 * Full-auto mode value per backend.
 * Re-exported from common for backward compatibility.
 */
export { getFullAutoMode } from '@/common/types/agent/agentModes';
