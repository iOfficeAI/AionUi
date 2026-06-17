/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type OfficeSceneKind = 'assistant' | 'navigate';

export type OfficeSceneDefinition = {
  id: string;
  assistantId?: string;
  kind: OfficeSceneKind;
  path?: string;
  promptKeys: [string, string, string];
};

/** Builtin assistants hidden from the office-mode "more assistants" grid. */
export const OFFICE_HIDDEN_ASSISTANT_IDS = new Set([
  'game-3d',
  'story-roleplay',
  'moltbook',
  'ui-ux-pro-max',
  'openclaw-setup',
  'academic-paper',
  'morph-ppt-3d',
  'pitch-deck-creator',
  'dashboard-creator',
  'human-3-coach',
  'social-job-publisher',
  'beautiful-mermaid',
  'morph-ppt',
]);

export const OFFICE_SCENES: OfficeSceneDefinition[] = [
  {
    id: 'spreadsheet',
    assistantId: 'excel-creator',
    kind: 'assistant',
    promptKeys: [
      'guid.office.scenes.spreadsheet.prompt0',
      'guid.office.scenes.spreadsheet.prompt1',
      'guid.office.scenes.spreadsheet.prompt2',
    ],
  },
  {
    id: 'document',
    assistantId: 'word-creator',
    kind: 'assistant',
    promptKeys: [
      'guid.office.scenes.document.prompt0',
      'guid.office.scenes.document.prompt1',
      'guid.office.scenes.document.prompt2',
    ],
  },
  {
    id: 'presentation',
    assistantId: 'ppt-creator',
    kind: 'assistant',
    promptKeys: [
      'guid.office.scenes.presentation.prompt0',
      'guid.office.scenes.presentation.prompt1',
      'guid.office.scenes.presentation.prompt2',
    ],
  },
  {
    id: 'organize',
    assistantId: 'cowork',
    kind: 'assistant',
    promptKeys: [
      'guid.office.scenes.organize.prompt0',
      'guid.office.scenes.organize.prompt1',
      'guid.office.scenes.organize.prompt2',
    ],
  },
  {
    id: 'scheduled',
    kind: 'navigate',
    path: '/scheduled',
    promptKeys: [
      'guid.office.scenes.scheduled.prompt0',
      'guid.office.scenes.scheduled.prompt1',
      'guid.office.scenes.scheduled.prompt2',
    ],
  },
  {
    id: 'general',
    assistantId: 'cowork',
    kind: 'assistant',
    promptKeys: [
      'guid.office.scenes.general.prompt0',
      'guid.office.scenes.general.prompt1',
      'guid.office.scenes.general.prompt2',
    ],
  },
];

export type OfficeSceneId = (typeof OFFICE_SCENES)[number]['id'];

export function normalizeAssistantId(id: string): string {
  return id.replace(/^builtin-/, '');
}

export function isOfficeHiddenAssistant(assistantId: string): boolean {
  const normalized = normalizeAssistantId(assistantId);
  return OFFICE_HIDDEN_ASSISTANT_IDS.has(normalized);
}

export function filterOfficeAssistants<T extends { id: string; enabled?: boolean }>(assistants: T[]): T[] {
  return assistants.filter((assistant) => assistant.enabled !== false && !isOfficeHiddenAssistant(assistant.id));
}
