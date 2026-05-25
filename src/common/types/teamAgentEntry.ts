/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified descriptor for a team-spawnable agent.
 *
 * This is the single source of truth consumed by every site that asks
 * "what agents can join a team?" or "how do I spawn this backend?".
 *
 * Sources feeding the descriptor (merged by TeamAgentCatalog):
 *   - `builtin`   — ACP CLI present on PATH (ACP_BACKENDS_ALL)
 *   - `extension` — extension-contributed ACP adapter (ExtensionRegistry)
 *   - `preset`    — prompt-only preset assistant (ConfigStorage 'assistants')
 *   - `custom`    — user-defined ACP CLI (ConfigStorage 'acp.customAgents')
 *
 * Invariants:
 *   - `cliPath` is present for any entry that can actually be spawned
 *     (builtin / extension / custom). For `preset` entries, `cliPath`
 *     reflects the underlying `presetAgentType`'s binding.
 *   - `customAgentId` shape: 'ext:<extName>:<id>' for extensions,
 *     assistant UUID for presets/custom, absent for builtin.
 *   - `key` is stable and globally unique; it is the handle renderer /
 *     spawn code uses to reference this entry.
 */
export type TeamAgentSource = 'builtin' | 'extension' | 'preset' | 'custom';

export type TeamAgentEntry = {
  /** Stable unique handle. Format depends on source:
   *    builtin   → 'builtin:<backend>'
   *    extension → 'ext:<extName>:<adapterId>' (same as customAgentId)
   *    preset    → 'preset:<uuid>'
   *    custom    → 'custom:<uuid>'
   */
  key: string;

  /** Runtime backend used by spawn layer (e.g. 'claude', 'kaiwu', 'codex'). */
  backend: string;

  /** Canonical customAgentId used by AcpAgentManager / DB persistence. */
  customAgentId?: string;

  /** UI-facing name. */
  displayName: string;

  /** Command used to launch the CLI. Empty string only for preset w/o underlying CLI. */
  cliPath: string;

  /** Extra args appended when entering ACP mode. */
  acpArgs?: string[];

  /** Env vars injected into child process. */
  env?: Record<string, string>;

  /** Data source that produced this entry. */
  source: TeamAgentSource;

  /** Whether team mode can use this entry (from cached initialize + known list). */
  isTeamCapable: boolean;

  /** MCP transports the agent supports (from MCP service). */
  supportedTransports?: string[];

  /** Preset's underlying ACP backend (only for source='preset'). */
  presetAgentType?: string;

  /** True iff this entry is a preset assistant. */
  isPreset: boolean;

  /** True iff contributed by an extension. */
  isExtension: boolean;

  /** Name of the contributing extension, if any. */
  extensionName?: string;

  /** Preset context (rules). Only for source='preset'. */
  context?: string;

  /** Preset description for UI / prompts. Only for source='preset'. */
  description?: string;

  /** Enabled skills for a preset, if it restricts the skill set. */
  enabledSkills?: string[];

  /** Avatar string (emoji or asset). */
  avatar?: string;
};

/**
 * Minimal spec used by MCP team_spawn_agent and other "I only know the backend"
 * callers. Catalog.resolveByBackend() inflates this into a full TeamAgentEntry.
 */
export type TeamAgentSpawnSpec = {
  backend?: string;
  customAgentId?: string;
};
