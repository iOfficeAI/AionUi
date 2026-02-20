/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Assistant Workspace Integration Types
 *
 * Minimal types for assistant workspace template copying
 */

/**
 * Assistant metadata (assistant.json)
 * Defines an assistant with an associated workspace template
 */
export interface AssistantMetadata {
  /** Assistant unique identifier */
  id: string;
  /** Assistant display name */
  name: string;
  /** Assistant version */
  version: string;
  /** Assistant description */
  description: string;
  /** Assistant author */
  author?: string;
  /** Path to workspace directory relative to assistant root */
  workspacePath?: string;
  /** Assistant tags for categorization */
  tags?: string[];
  /** Preset agent type (claude, gemini, codex) */
  presetAgentType?: 'claude' | 'gemini' | 'codex';
  /** Default agent name (metadata only, injection handled by hooks JS files) */
  defaultAgent?: string;
  /** Assistant mode — "swarm" enables multi-agent coordination */
  mode?: 'swarm';
  /** Swarm configuration (only when mode is "swarm") */
  swarm?: {
    feedPath: string;
    agents: string[];
    maxTurns: number;
    turnStrategy: 'round-robin' | 'on-demand';
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;

  // --- Optional preset fields for auto-discovery ---
  // When present in assistant.json, these override convention-based defaults

  /** Avatar emoji or svg filename */
  avatar?: string;
  /** Rule files per locale (e.g. { "en-US": "my-assistant.md" }) */
  ruleFiles?: Record<string, string>;
  /** Skill files per locale */
  skillFiles?: Record<string, string>;
  /** Default enabled skill names */
  defaultEnabledSkills?: string[];
  /** Localized display names */
  nameI18n?: Record<string, string>;
  /** Localized descriptions */
  descriptionI18n?: Record<string, string>;
  /** Localized prompt suggestions */
  promptsI18n?: Record<string, string[]>;
}
