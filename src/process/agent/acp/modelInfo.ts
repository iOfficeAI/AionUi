import type { AcpModelInfo, AcpSessionConfigOption, AcpSessionModels } from '@/common/types/acpTypes';

export function buildAcpModelInfo(
  configOptions: AcpSessionConfigOption[] | null,
  models: AcpSessionModels | null,
  preferredModelInfo: AcpModelInfo | null = null
): AcpModelInfo | null {
  if (preferredModelInfo?.currentModelId) {
    return preferredModelInfo;
  }

  const modelOption = configOptions?.find((opt) => opt.category === 'model');
  if (modelOption && modelOption.type === 'select' && modelOption.options) {
    const activeValue = modelOption.currentValue || modelOption.selectedValue || null;
    return {
      currentModelId: activeValue,
      currentModelLabel:
        modelOption.options.find((o) => o.value === activeValue)?.name ||
        modelOption.options.find((o) => o.value === activeValue)?.label ||
        activeValue,
      availableModels: modelOption.options.map((o) => ({ id: o.value, label: o.name || o.label || o.value })),
      canSwitch: modelOption.options.length > 1,
      source: 'configOption',
      sourceDetail: 'acp-config-option',
      configOptionId: modelOption.id,
    };
  }

  if (models) {
    const available = models.availableModels || [];
    const getModelId = (model: (typeof available)[number]) => model.id || model.modelId || '';
    return {
      currentModelId: models.currentModelId || null,
      currentModelLabel:
        available.find((model) => getModelId(model) === models.currentModelId)?.name || models.currentModelId || null,
      availableModels: available.map((model) => ({ id: getModelId(model), label: model.name || getModelId(model) })),
      canSwitch: available.length > 1,
      source: 'models',
      sourceDetail: 'acp-models',
    };
  }

  return null;
}

export function summarizeAcpModelInfo(modelInfo: AcpModelInfo | null): {
  source: AcpModelInfo['source'] | null;
  sourceDetail: AcpModelInfo['sourceDetail'] | null;
  currentModelId: string | null;
  currentModelLabel: string | null;
  availableModelCount: number;
  canSwitch: boolean;
  sampleModelIds: string[];
} {
  return {
    source: modelInfo?.source || null,
    sourceDetail: modelInfo?.sourceDetail || null,
    currentModelId: modelInfo?.currentModelId || null,
    currentModelLabel: modelInfo?.currentModelLabel || null,
    availableModelCount: modelInfo?.availableModels?.length || 0,
    canSwitch: modelInfo?.canSwitch || false,
    sampleModelIds: (modelInfo?.availableModels || []).slice(0, 8).map((model) => model.id),
  };
}
