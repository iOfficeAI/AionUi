import { ipcBridge } from '@/common';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/constants';
import type { IProvider } from '@/common/storage';
import { useCallback, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { useGeminiGoogleAuthModels } from './useGeminiGoogleAuthModels';
import type { GeminiModeOption } from './useModeModeList';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';

export interface ModelProviderListResult {
  providers: IProvider[];
  geminiModeLookup: Map<string, GeminiModeOption>;
  getAvailableModels: (provider: IProvider) => string[];
  formatModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
}

/**
 * Shared hook that builds the provider list (including Google Auth)
 * and exposes helpers consumed by both conversation and channel settings.
 */
export const useModelProviderList = (): ModelProviderListResult => {
  const { geminiModeOptions, isGoogleAuth } = useGeminiGoogleAuthModels();

  const geminiModeLookup = useMemo(() => {
    const lookup = new Map<string, GeminiModeOption>();
    geminiModeOptions.forEach((option) => lookup.set(option.value, option));
    return lookup;
  }, [geminiModeOptions]);

  const { data: modelConfig } = useSWR('model.config.shared', () => ipcBridge.mode.getModelConfig.invoke());

  // Mutable cache for available-model filtering
  const availableModelsCacheRef = useRef(new Map<string, string[]>());

  const getAvailableModels = useCallback((provider: IProvider): string[] => {
    const cacheKey = `${provider.id}-${(provider.model || []).join(',')}`;
    const cache = availableModelsCacheRef.current;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }
    const result: string[] = [];
    for (const modelName of provider.model || []) {
      const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
      const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');
      if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
        result.push(modelName);
      }
    }
    cache.set(cacheKey, result);
    return result;
  }, []);

  const providers = useMemo(() => {
    let list: IProvider[] = Array.isArray(modelConfig) ? modelConfig : [];
    if (isGoogleAuth) {
      const googleProvider: IProvider = {
        id: GOOGLE_AUTH_PROVIDER_ID,
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
        model: geminiModeOptions.map((v) => v.value),
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
      } as unknown as IProvider;
      list = [googleProvider, ...list];
    }
    return list.filter((p) => getAvailableModels(p).length > 0);
  }, [geminiModeOptions, getAvailableModels, isGoogleAuth, modelConfig]);

  const formatModelLabel = useCallback(
    (provider: { platform?: string } | undefined, modelName?: string) => {
      if (!modelName) return '';
      const isGoogleAuthProvider = provider?.platform?.toLowerCase().includes('gemini-with-google-auth');
      if (isGoogleAuthProvider) {
        return geminiModeLookup.get(modelName)?.label || modelName;
      }
      return modelName;
    },
    [geminiModeLookup]
  );

  return { providers, geminiModeLookup, getAvailableModels, formatModelLabel };
};
