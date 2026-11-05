/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent-side permission policy normed by the AionCore backend, surfaced to the
 * Agent settings UI. Pilot: OpenCode. `agent` matches the backend's adapter id.
 */

/** Normalized permission level exposed by the backend (`/api/agents/permission-policy`). */
export type AgentPermissionLevel = 'ask' | 'auto_edit' | 'full_auto';

/** Read-model for one agent's permission policy (backend `PermissionPolicyView`). */
export interface AgentPermissionPolicy {
  /** Agent id, e.g. `"opencode"`. */
  agent: string;
  /** Whether an adapter exists for this agent (true for OpenCode). */
  supported: boolean;
  /** Whether the agent is present on this machine. */
  installed: boolean;
  /** Effective level, or null when the agent has no recognizable policy. */
  current_level: AgentPermissionLevel | null;
  /** Absolute path of the policy config file (for display). */
  config_path: string | null;
}

/** Ordered levels for the selector, with i18n label keys. */
export const AGENT_PERMISSION_LEVEL_OPTIONS: ReadonlyArray<{
  value: AgentPermissionLevel;
  labelKey: string;
}> = [
  { value: 'ask', labelKey: 'settings.agentManagement.permissionAsk' },
  { value: 'auto_edit', labelKey: 'settings.agentManagement.permissionAutoEdit' },
  { value: 'full_auto', labelKey: 'settings.agentManagement.permissionFullAuto' },
];

/** Whether a policy is actionable (adapter exists and agent is installed). */
export const isPermissionPolicyActionable = (policy: AgentPermissionPolicy | undefined): boolean =>
  Boolean(policy && policy.supported && policy.installed);
