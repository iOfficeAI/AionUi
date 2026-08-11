/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type GeminiModeOption = {
  label: string;
  value: string;
  description: string;
  modelHint?: string;
  /** Manual sub-models list */
  subModels?: Array<{ label: string; value: string }>;
};

type GeminiModeDescriptions = {
  autoGemini3: string;
  autoGemini25: string;
  manual: string;
};

type GeminiModeListOptions = {
  descriptions?: GeminiModeDescriptions;
};

const defaultGeminiModeDescriptions: GeminiModeDescriptions = {
  autoGemini3: 'Let Gemini CLI decide the best model for the task: gemini-3.1-pro-preview, gemini-3-flash',
  autoGemini25: 'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
  manual: 'Manually select a model',
};

// Build Gemini model list matching terminal CLI
// Values align with aioncli-core@0.30.0 model aliases:
// - 'auto' -> PREVIEW_GEMINI_MODEL_AUTO ('auto-gemini-3') -> resolves to gemini-3.1-pro-preview
// - 'auto-gemini-2.5' -> DEFAULT_GEMINI_MODEL_AUTO (auto-routes gemini-2.5-pro/flash)
export const getGeminiModeList = (options?: GeminiModeListOptions): GeminiModeOption[] => {
  const descriptions = options?.descriptions || defaultGeminiModeDescriptions;

  return [
    {
      label: 'Auto (Gemini 3)',
      value: 'auto', // Maps to PREVIEW_GEMINI_MODEL_AUTO in config.ts
      description: descriptions.autoGemini3,
      modelHint: 'gemini-3.1-pro-preview, gemini-3-flash',
    },
    {
      label: 'Auto (Gemini 2.5)',
      value: 'auto-gemini-2.5', // Maps to DEFAULT_GEMINI_MODEL_AUTO in aioncli-core
      description: descriptions.autoGemini25,
      modelHint: 'gemini-2.5-pro, gemini-2.5-flash',
    },
    {
      label: 'Manual',
      value: 'manual', // Expand submenu to select specific model
      description: descriptions.manual,
      // Match model names defined in aioncli-core/src/config/models.ts
      subModels: [
        { label: 'gemini-3.1-pro-preview', value: 'gemini-3.1-pro-preview' },
        { label: 'gemini-3-flash-preview', value: 'gemini-3-flash-preview' },
        { label: 'gemini-2.5-pro', value: 'gemini-2.5-pro' },
        { label: 'gemini-2.5-flash', value: 'gemini-2.5-flash' },
        { label: 'gemini-2.5-flash-lite', value: 'gemini-2.5-flash-lite' },
      ],
    },
  ];
};

/**
 * Flatten getGeminiModeList() into a flat array of all usable model IDs.
 * Includes top-level values (except 'manual' which is a submenu placeholder)
 * plus all subModels from the Manual entry.
 */
export const flattenGeminiModeIds = (): string[] => {
  const modes = getGeminiModeList();
  const ids: string[] = [];
  for (const mode of modes) {
    if (mode.value !== 'manual') {
      ids.push(mode.value);
    }
    if (mode.subModels) {
      for (const sub of mode.subModels) {
        ids.push(sub.value);
      }
    }
  }
  return ids;
};
