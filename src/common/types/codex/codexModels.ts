/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpModelInfo } from '@/common/types/acpTypes';

/**
 * Default Codex model list maintained by AionUi.
 * These are known models that Codex CLI supports.
 * Validation is done by Codex CLI itself — AionUi only passes the model name.
 *
 * The first entry is used as the default when the user hasn't made a selection.
 */
export const DEFAULT_CODEX_MODELS: Array<{ id: string; label: string; description: string }> = [
  { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol', description: 'Configured frontier Codex model' },
  { id: 'gpt-5.5', label: 'gpt-5.5', description: 'Frontier model for complex coding and research' },
  { id: 'gpt-5.4', label: 'gpt-5.4', description: 'Strong model for everyday coding' },
  { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', description: 'Agentic coding model' },
  { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', description: 'Frontier agentic coding model' },
  {
    id: 'gpt-5.1-codex-max',
    label: 'gpt-5.1-codex-max',
    description: 'Codex-optimized flagship for deep and fast reasoning',
  },
  {
    id: 'gpt-5.2',
    label: 'gpt-5.2',
    description: 'Latest frontier model with improvements across knowledge, reasoning and coding',
  },
  {
    id: 'gpt-5.1-codex-mini',
    label: 'gpt-5.1-codex-mini',
    description: 'Optimized for codex. Cheaper, faster, but less capable',
  },
];

/** The default model ID (first entry in the list) */
export const DEFAULT_CODEX_MODEL_ID = DEFAULT_CODEX_MODELS[0].id;

const DEFAULT_CODEX_MODEL_LABELS = new Map(DEFAULT_CODEX_MODELS.map((model) => [model.id, model.label]));

function readModelId(modelId: string | null | undefined): string | undefined {
  const trimmed = modelId?.trim();
  return trimmed || undefined;
}

function addModel(
  target: Array<{ id: string; label: string }>,
  seen: Set<string>,
  modelId: string | null | undefined,
  label?: string | null
): void {
  const id = readModelId(modelId);
  if (!id || seen.has(id)) {
    return;
  }

  seen.add(id);
  target.push({
    id,
    label: label || DEFAULT_CODEX_MODEL_LABELS.get(id) || id,
  });
}

export function mergeCodexModelInfoWithDefaults(
  modelInfo: AcpModelInfo | null | undefined,
  options: { preferredModelId?: string | null } = {}
): AcpModelInfo {
  const preferredModelId = readModelId(options.preferredModelId);
  const currentModelId = preferredModelId || readModelId(modelInfo?.currentModelId) || DEFAULT_CODEX_MODEL_ID;
  const mergedModels: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  const liveLabels = new Map((modelInfo?.availableModels || []).map((model) => [model.id, model.label]));
  const currentLabel =
    modelInfo?.currentModelId === currentModelId ? modelInfo.currentModelLabel || liveLabels.get(currentModelId) : null;

  addModel(mergedModels, seen, currentModelId, currentLabel);
  for (const model of DEFAULT_CODEX_MODELS) {
    addModel(mergedModels, seen, model.id, liveLabels.get(model.id) || model.label);
  }
  for (const model of modelInfo?.availableModels || []) {
    addModel(mergedModels, seen, model.id, model.label);
  }

  const currentModel = mergedModels.find((model) => model.id === currentModelId);

  return {
    currentModelId,
    currentModelLabel: currentModel?.label || currentModelId,
    availableModels: mergedModels,
    canSwitch: mergedModels.length > 1,
    source: modelInfo?.source || 'models',
    sourceDetail: modelInfo?.sourceDetail || 'codex-stream',
    configOptionId: modelInfo?.configOptionId,
  };
}
