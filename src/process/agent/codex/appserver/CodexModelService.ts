/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { CodexAppServerClient } from './CodexAppServerClient';

type CodexModelClient = Pick<CodexAppServerClient, 'request'>;

type CodexModelRecord = {
  id?: unknown;
  model?: unknown;
  modelId?: unknown;
  name?: unknown;
  label?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  isDefault?: unknown;
  is_default?: unknown;
  supportedReasoningEfforts?: unknown;
  supported_reasoning_efforts?: unknown;
  defaultReasoningEffort?: unknown;
  default_reasoning_effort?: unknown;
};

type NormalizedModel = {
  id: string;
  label: string;
  isDefault: boolean;
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
};

function createFallbackModelInfo(modelId?: string): AcpModelInfo {
  return {
    currentModelId: modelId || null,
    currentModelLabel: modelId || null,
    availableModels: modelId ? [{ id: modelId, label: modelId }] : [],
    canSwitch: false,
    source: 'models',
    sourceDetail: 'codex-stream',
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readReasoningEfforts(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const efforts = value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item] : [];
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    const effort = readString(record.reasoningEffort) || readString(record.reasoning_effort);
    return effort ? [effort] : [];
  });
  const uniqueEfforts = Array.from(new Set(efforts));
  return uniqueEfforts.length > 0 ? uniqueEfforts : undefined;
}

function readModelArray(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== 'object') return [];

  const record = result as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.models)) return record.models;
  if (Array.isArray(record.items)) return record.items;
  return [];
}

function normalizeModel(record: unknown): NormalizedModel | null {
  if (!record || typeof record !== 'object') return null;

  const model = record as CodexModelRecord;
  const id = readString(model.id) || readString(model.model) || readString(model.modelId);
  if (!id) return null;

  const label =
    readString(model.name) ||
    readString(model.label) ||
    readString(model.displayName) ||
    readString(model.display_name) ||
    id;

  return {
    id,
    label,
    isDefault: readBoolean(model.isDefault) || readBoolean(model.is_default),
    supportedReasoningEfforts: readReasoningEfforts(
      model.supportedReasoningEfforts ?? model.supported_reasoning_efforts
    ),
    defaultReasoningEffort: readString(model.defaultReasoningEffort) || readString(model.default_reasoning_effort),
  };
}

export class CodexModelService {
  private modelInfo: AcpModelInfo;
  private selectedModelId: string | undefined;

  constructor(
    private readonly client: CodexModelClient,
    currentModelId?: string
  ) {
    this.selectedModelId = currentModelId;
    this.modelInfo = createFallbackModelInfo(currentModelId);
  }

  async refresh(): Promise<AcpModelInfo> {
    const result = await this.client.request('model/list', {});
    const availableModels = readModelArray(result)
      .map(normalizeModel)
      .filter((model): model is NormalizedModel => !!model);
    if (availableModels.length === 0) {
      this.modelInfo = createFallbackModelInfo(this.selectedModelId);
      return this.modelInfo;
    }

    const requestedModelId = this.selectedModelId;
    const selectedModel =
      (requestedModelId && availableModels.find((model) => model.id === requestedModelId)) ||
      availableModels.find((model) => model.isDefault) ||
      availableModels[0];

    this.modelInfo = {
      currentModelId: selectedModel?.id || null,
      currentModelLabel: selectedModel?.label || null,
      availableModels: availableModels.map((model) => ({
        id: model.id,
        label: model.label,
        ...(model.supportedReasoningEfforts && { supportedReasoningEfforts: model.supportedReasoningEfforts }),
        ...(model.defaultReasoningEffort && { defaultReasoningEffort: model.defaultReasoningEffort }),
      })),
      canSwitch: availableModels.length > 1,
      source: 'models',
      sourceDetail: 'codex-stream',
    };
    this.selectedModelId = this.modelInfo.currentModelId || undefined;
    return this.modelInfo;
  }

  getModelInfo(): AcpModelInfo {
    return this.modelInfo;
  }

  selectModel(modelId: string): AcpModelInfo {
    this.selectedModelId = modelId;
    const selectedModel = this.modelInfo.availableModels.find((model) => model.id === modelId);
    this.modelInfo = {
      ...this.modelInfo,
      currentModelId: modelId,
      currentModelLabel: selectedModel?.label || modelId,
    };
    return this.modelInfo;
  }
}
