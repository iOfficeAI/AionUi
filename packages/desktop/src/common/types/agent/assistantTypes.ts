/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Mirror of aionui-api-types/src/assistant.rs.
// Any shape change on either side requires a same-PR update on the other.

export type AssistantSource = 'builtin' | 'generated' | 'user';
export type AssistantAgentStatus = 'missing' | 'online' | 'offline';
export type AssistantAgentSource = 'internal' | 'builtin' | 'extension' | 'custom';

export type AssistantAgent = {
  type: string;
  source: AssistantAgentSource;
  acp_backend?: string;
};

export function assistantRuntimeKey(assistant?: Pick<Assistant, 'agent'> | null): string {
  return assistant?.agent?.acp_backend || assistant?.agent?.type || '';
}

export function isAionrsAssistant(assistant?: Pick<Assistant, 'agent'> | null): boolean {
  return assistant?.agent?.type === 'aionrs';
}

export interface Assistant {
  id: string;
  source: AssistantSource;
  name: string;
  name_i18n: Record<string, string>;
  description?: string;
  description_i18n: Record<string, string>;
  avatar?: string;
  enabled: boolean;
  sort_order: number;
  agent_id: string;
  agent?: AssistantAgent;
  enabled_skills: string[];
  custom_skill_names: string[];
  disabled_builtin_skills: string[];
  context?: string;
  context_i18n: Record<string, string>;
  prompts: string[];
  prompts_i18n: Record<string, string[]>;
  models: string[];
  last_used_at?: number;
  agent_status: AssistantAgentStatus;
  agent_status_message?: string;
  team_selectable: boolean;
  team_block_reason?: string;
  deletable: boolean;
}

export interface AssistantProfile {
  name: string;
  name_i18n: Record<string, string>;
  description?: string;
  description_i18n: Record<string, string>;
  avatar?: string;
}

export interface AssistantState {
  enabled: boolean;
  sort_order: number;
  last_used_at?: number;
}

export interface AssistantEngine {
  agent_id: string;
  agent?: AssistantAgent;
}

export interface AssistantRules {
  content: string;
  storage_mode: string;
}

export interface AssistantPrompts {
  recommended: string[];
  recommended_i18n: Record<string, string[]>;
}

export interface AssistantDefaultScalar {
  mode: string;
  value?: string;
}

export interface AssistantDefaultList {
  mode: string;
  value: string[];
}

export interface AssistantDefaults {
  model: AssistantDefaultScalar;
  permission: AssistantDefaultScalar;
  skills: AssistantDefaultList;
  mcps: AssistantDefaultList;
}

export interface AssistantDefaultsRequest {
  model?: AssistantDefaultScalar;
  permission?: AssistantDefaultScalar;
  skills?: AssistantDefaultList;
  mcps?: AssistantDefaultList;
}

export interface AssistantCapabilities {
  default_skill_ids: string[];
  custom_skill_names: string[];
  default_disabled_builtin_skill_ids: string[];
}

export interface AssistantPreferences {
  last_model_id?: string;
  last_permission_value?: string;
  last_skill_ids: string[];
  last_disabled_builtin_skill_ids: string[];
  last_mcp_ids: string[];
}

export interface AssistantDetail {
  id: string;
  source: AssistantSource;
  agent_status: AssistantAgentStatus;
  agent_status_message?: string;
  team_selectable: boolean;
  team_block_reason?: string;
  deletable: boolean;
  profile: AssistantProfile;
  state: AssistantState;
  engine: AssistantEngine;
  rules: AssistantRules;
  prompts: AssistantPrompts;
  defaults: AssistantDefaults;
  capabilities: AssistantCapabilities;
  preferences: AssistantPreferences;
}

export interface CreateAssistantRequest {
  id?: string;
  name: string;
  description?: string;
  avatar?: string;
  agent_id?: string;
  enabled_skills?: string[];
  custom_skill_names?: string[];
  disabled_builtin_skills?: string[];
  prompts?: string[];
  models?: string[];
  name_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  prompts_i18n?: Record<string, string[]>;
  recommended_prompts?: string[];
  recommended_prompts_i18n?: Record<string, string[]>;
  defaults?: AssistantDefaultsRequest;
}

export type UpdateAssistantRequest = Partial<Omit<CreateAssistantRequest, 'id'>> & {
  id: string;
};

export interface SetAssistantStateRequest {
  id: string;
  enabled?: boolean;
  sort_order?: number;
  last_used_at?: number;
}

export interface ImportAssistantsRequest {
  assistants: CreateAssistantRequest[];
}

export interface ImportError {
  id: string;
  error: string;
}

export interface ImportAssistantsResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: ImportError[];
}
