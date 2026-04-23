/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Mirror of aionui-api-types/src/assistant.rs.
// Any shape change on either side requires a same-PR update on the other.

export type AssistantSource = 'builtin' | 'user' | 'extension';

export interface Assistant {
  id: string;
  source: AssistantSource;
  name: string;
  nameI18n: Record<string, string>;
  description?: string;
  descriptionI18n: Record<string, string>;
  avatar?: string;
  enabled: boolean;
  sortOrder: number;
  presetAgentType: string;
  enabledSkills: string[];
  customSkillNames: string[];
  disabledBuiltinSkills: string[];
  context?: string;
  contextI18n: Record<string, string>;
  prompts: string[];
  promptsI18n: Record<string, string[]>;
  models: string[];
  lastUsedAt?: number;
}

export interface CreateAssistantRequest {
  id?: string;
  name: string;
  description?: string;
  avatar?: string;
  presetAgentType?: string;
  enabledSkills?: string[];
  customSkillNames?: string[];
  disabledBuiltinSkills?: string[];
  prompts?: string[];
  models?: string[];
  nameI18n?: Record<string, string>;
  descriptionI18n?: Record<string, string>;
  promptsI18n?: Record<string, string[]>;
}

export type UpdateAssistantRequest = Partial<Omit<CreateAssistantRequest, 'id'>> & {
  id: string;
};

export interface SetAssistantStateRequest {
  id: string;
  enabled?: boolean;
  sortOrder?: number;
  lastUsedAt?: number;
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
