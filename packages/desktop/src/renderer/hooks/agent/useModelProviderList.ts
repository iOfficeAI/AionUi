import { ipcBridge } from '@/common';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/config/constants';
import type { IProvider } from '@/common/config/storage';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR, { type SWRConfiguration } from 'swr';
import { useGoogleAuthModels } from './useGoogleAuthModels';
import { hasSpecificModelCapability } from '@/renderer/utils/model/modelCapabilities';

export interface ModelProviderListResult {
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  formatModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
}

export const PROVIDERS_SWR_KEY = 'providers';

// Provider config is local application state. Keep it stable after the initial
// load and refresh only through explicit mutate() calls after CRUD operations.
export const PROVIDERS_SWR_OPTIONS: SWRConfiguration<IProvider[], Error> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
};

export const fetchProviders = async (): Promise<IProvider[]> => {
  return (await ipcBridge.mode.listProviders.invoke()) ?? [];
};

export const useProvidersQuery = () => {
  return useSWR<IProvider[]>(PROVIDERS_SWR_KEY, fetchProviders, PROVIDERS_SWR_OPTIONS);
};

export const GATEWAY_PROVIDER_ID = 'aionui-native-gateway';
export const GATEWAY_SWR_KEY = 'gateway_combos_accounts';

const GATEWAY_SWR_OPTIONS: SWRConfiguration<string[], Error> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
};

export const fetchGatewayModels = async (): Promise<string[]> => {
  if (typeof window === 'undefined' || !window.electronAPI?.gatewayGetCombos) {
    return [];
  }
  try {
    const [combosRes, accountsRes] = await Promise.all([
      window.electronAPI.gatewayGetCombos(),
      window.electronAPI.gatewayGetAccounts
        ? window.electronAPI.gatewayGetAccounts()
        : Promise.resolve({ success: false, data: [] }),
    ]);

    const modelsSet = new Set<string>();
    if (combosRes?.success && Array.isArray(combosRes.data)) {
      for (const c of combosRes.data) {
        if (c.enabled) {
          modelsSet.add(c.name);
        }
      }
    }
    if (accountsRes?.success && Array.isArray(accountsRes.data)) {
      for (const a of accountsRes.data) {
        if (a.enabled) {
          for (const m of a.models) {
            modelsSet.add(m);
            modelsSet.add(`${a.name}:${m}`);
          }
        }
      }
    }
    return Array.from(modelsSet);
  } catch {
    return [];
  }
};

/**
 * Shared hook that builds the provider list (including Google Auth and Native Gateway)
 * and exposes helpers consumed by both conversation and channel settings.
 */
export const useModelProviderList = (): ModelProviderListResult => {
  const { isGoogleAuth } = useGoogleAuthModels();

  const { data: modelConfig } = useProvidersQuery();
  const { data: gatewayModels } = useSWR<string[]>(GATEWAY_SWR_KEY, fetchGatewayModels, GATEWAY_SWR_OPTIONS);

  // Mutable cache for available-model filtering
  const available_modelsCacheRef = useRef(new Map<string, string[]>());

  // 当 modelConfig 变化时清除缓存
  useEffect(() => {
    available_modelsCacheRef.current.clear();
  }, [modelConfig, gatewayModels]);

  const getAvailableModels = useCallback((provider: IProvider): string[] => {
    // 包含 model_enabled 状态到缓存 key 中
    const model_enabledKey = provider.model_enabled ? JSON.stringify(provider.model_enabled) : 'all-enabled';
    const cacheKey = `${provider.id}-${(provider.models || []).join(',')}-${model_enabledKey}`;
    const cache = available_modelsCacheRef.current;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }
    const result: string[] = [];
    for (const modelName of provider.models || []) {
      // 检查模型是否被禁用（默认为启用）
      const isModelEnabled = provider.model_enabled?.[modelName] !== false;
      if (!isModelEnabled) continue;

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
    // 过滤掉被禁用的 provider（默认为启用）
    list = list.filter((p) => p.enabled !== false);

    if (isGoogleAuth) {
      const googleProvider: IProvider = {
        id: GOOGLE_AUTH_PROVIDER_ID,
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        base_url: '',
        api_key: '',
        model: [],
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
        enabled: true, // Google Auth provider 始终启用
      } as unknown as IProvider;
      list = [googleProvider, ...list];
    }

    const hasGateway = list.some((p) => p.id === GATEWAY_PROVIDER_ID);
    if (!hasGateway && gatewayModels && gatewayModels.length > 0) {
      const gatewayProvider: IProvider = {
        id: GATEWAY_PROVIDER_ID,
        name: 'Gateway & Combos (OmniRoute)',
        platform: 'custom',
        base_url: 'http://127.0.0.1:13408/v1',
        api_key: 'sk-aionui-gateway',
        models: gatewayModels,
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
        enabled: true,
      };
      list = [gatewayProvider, ...list];
    } else if (hasGateway && gatewayModels && gatewayModels.length > 0) {
      list = list.map((p) => {
        if (p.id === GATEWAY_PROVIDER_ID) {
          const merged = Array.from(new Set([...(p.models || []), ...gatewayModels]));
          return { ...p, models: merged };
        }
        return p;
      });
    }

    // 过滤掉没有可用模型的 provider
    return list.filter((p) => getAvailableModels(p).length > 0);
  }, [gatewayModels, getAvailableModels, isGoogleAuth, modelConfig]);

  const formatModelLabel = useCallback(
    (provider: { platform?: string; id?: string } | undefined, modelName?: string) => {
      if (!modelName) return '';
      if (provider?.id === GATEWAY_PROVIDER_ID || provider?.platform === 'custom') {
        if (modelName.includes(':')) {
          const [accName, mName] = modelName.split(':');
          return `${mName} (${accName})`;
        }
      }
      return modelName;
    },
    []
  );

  return { providers, getAvailableModels, formatModelLabel };
};
