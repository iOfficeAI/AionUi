import type { IProvider } from '@/common/storage';
import type { GeminiModeOption } from '@/renderer/hooks/agent/useModeModeList';

/**
 * Score a model name for fallback priority.
 * Lower scores are preferred (lighter models first).
 */
export const scoreModel = (modelName: string): number => {
  const lower = modelName.toLowerCase();
  let score = 0;
  if (lower.includes('lite')) score -= 2;
  if (lower.includes('flash')) score -= 1;
  if (lower.includes('pro')) score += 2;
  return score;
};

export type ResolveFallbackParams = {
  currentModel: { id: string; useModel: string } | undefined;
  providers: IProvider[];
  geminiModeLookup: Map<string, GeminiModeOption>;
  getAvailableModels: (provider: IProvider) => string[];
  exhaustedModels: Set<string>;
};

/**
 * Find a fallback model when the current model's quota is exhausted.
 * Returns the provider and model name to switch to, or null if no
 * fallback is available.
 */
export const resolveFallbackTarget = (params: ResolveFallbackParams): { provider: IProvider; model: string } | null => {
  const { currentModel, providers, geminiModeLookup, getAvailableModels, exhaustedModels } = params;

  if (!currentModel) return null;
  const provider =
    providers.find((item) => item.id === currentModel.id) ||
    providers.find((item) => item.platform?.toLowerCase().includes('gemini-with-google-auth'));
  if (!provider) return null;

  const isGoogleAuthProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
  const manualOption = isGoogleAuthProvider ? geminiModeLookup.get('manual') : undefined;
  const manualModels = manualOption?.subModels?.map((model) => model.value) || [];
  const availableModels = isGoogleAuthProvider ? manualModels : getAvailableModels(provider);
  const candidates = availableModels.filter(
    (model) => model && model !== currentModel.useModel && !exhaustedModels.has(model) && model !== 'manual'
  );

  if (!candidates.length) return null;
  const sortedCandidates = [...candidates].toSorted((a, b) => {
    const scoreA = scoreModel(a);
    const scoreB = scoreModel(b);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.localeCompare(b);
  });
  return { provider, model: sortedCandidates[0] };
};
