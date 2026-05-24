import type {
  AcpConfigSelectOption,
  AcpModelInfo,
  AcpSessionConfigOption,
  AcpSessionModels,
} from '@/common/types/acpTypes';

/**
 * Normalize config options from various ACP backends into the standard format.
 * Handles Devin-style options that use `id`/`title` instead of `value`/`name`/`label`
 * and omit the `type` field.
 */
export function normalizeConfigOptions(options: unknown[]): AcpSessionConfigOption[] {
  const normalized = options.map((opt) => {
    const raw = opt as Record<string, unknown>;
    const normalized: AcpSessionConfigOption = {
      id: String(raw.id ?? ''),
      name: raw.name !== undefined ? String(raw.name) : raw.title !== undefined ? String(raw.title) : undefined,
      label: raw.label !== undefined ? String(raw.label) : raw.title !== undefined ? String(raw.title) : undefined,
      description: raw.description !== undefined ? String(raw.description) : undefined,
      category: raw.category !== undefined ? String(raw.category) : undefined,
      type: (raw.type as 'select' | 'boolean' | 'string') || 'select',
      currentValue: raw.currentValue !== undefined ? String(raw.currentValue) : undefined,
      selectedValue: raw.selectedValue !== undefined ? String(raw.selectedValue) : undefined,
    };

    // Normalize options array
    if (Array.isArray(raw.options)) {
      normalized.options = raw.options.map((o: unknown) => {
        const rawOpt = o as Record<string, unknown>;
        // Devin uses { id, title }; standard is { value, name, label }
        const value =
          rawOpt.value !== undefined ? String(rawOpt.value) : rawOpt.id !== undefined ? String(rawOpt.id) : '';
        const name =
          rawOpt.name !== undefined
            ? String(rawOpt.name)
            : rawOpt.title !== undefined
              ? String(rawOpt.title)
              : undefined;
        const label =
          rawOpt.label !== undefined
            ? String(rawOpt.label)
            : rawOpt.title !== undefined
              ? String(rawOpt.title)
              : undefined;
        return { value, name, label } as AcpConfigSelectOption;
      });
    }

    return normalized;
  });

  return normalized;
}

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
    const result: AcpModelInfo = {
      currentModelId: activeValue,
      currentModelLabel:
        modelOption.options.find((o) => o.value === activeValue)?.name ||
        modelOption.options.find((o) => o.value === activeValue)?.label ||
        activeValue,
      availableModels: modelOption.options.map((o) => ({
        id: o.value,
        label: o.name || o.label || o.value,
      })),
      canSwitch: modelOption.options.length > 1,
      source: 'configOption',
      sourceDetail: 'acp-config-option',
      configOptionId: modelOption.id,
    };
    return result;
  }

  if (models) {
    const available = models.availableModels || [];
    const getModelId = (model: (typeof available)[number]) => model.id || model.modelId || '';
    return {
      currentModelId: models.currentModelId || null,
      currentModelLabel:
        available.find((model) => getModelId(model) === models.currentModelId)?.name || models.currentModelId || null,
      availableModels: available.map((model) => ({
        id: getModelId(model),
        label: model.name || getModelId(model),
      })),
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
