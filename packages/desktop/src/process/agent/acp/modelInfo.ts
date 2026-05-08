import type { AcpModelInfo, AcpSessionConfigOption, AcpSessionModels } from '@/common/types/acpTypes';

export function buildAcpModelInfo(
  config_options: AcpSessionConfigOption[] | null,
  models: AcpSessionModels | null,
  preferredModelInfo: AcpModelInfo | null = null
): AcpModelInfo | null {
  if (preferredModelInfo?.current_model_id) {
    return preferredModelInfo;
  }

  const modelOption = config_options?.find((opt) => opt.category === 'model');
  if (modelOption && modelOption.type === 'select' && modelOption.options) {
    const activeValue = modelOption.current_value || modelOption.selected_value || null;
    return {
      current_model_id: activeValue,
      current_model_label:
        modelOption.options.find((o) => o.value === activeValue)?.name ||
        modelOption.options.find((o) => o.value === activeValue)?.label ||
        activeValue,
      available_models: modelOption.options.map((o) => ({ id: o.value, label: o.name || o.label || o.value })),
    };
  }

  if (models) {
    const available = models.available_models || [];
    const getModelId = (model: (typeof available)[number]) => model.id || model.model_id || '';
    return {
      current_model_id: models.current_model_id || null,
      current_model_label:
        available.find((model) => getModelId(model) === models.current_model_id)?.name ||
        models.current_model_id ||
        null,
      available_models: available.map((model) => ({ id: getModelId(model), label: model.name || getModelId(model) })),
    };
  }

  return null;
}

export function summarizeAcpModelInfo(model_info: AcpModelInfo | null): {
  current_model_id: string | null;
  current_model_label: string | null;
  availableModelCount: number;
  sampleModelIds: string[];
} {
  return {
    current_model_id: model_info?.current_model_id || null,
    current_model_label: model_info?.current_model_label || null,
    availableModelCount: model_info?.available_models?.length || 0,
    sampleModelIds: (model_info?.available_models || []).slice(0, 8).map((model) => model.id),
  };
}
