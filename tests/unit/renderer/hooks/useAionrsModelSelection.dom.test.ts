import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';

const hookMocks = vi.hoisted(() => ({
  providers: [] as IProvider[],
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => ({
    providers: hookMocks.providers,
    getAvailableModels: (provider: IProvider) =>
      (provider.model ?? []).filter((modelName) => provider.modelEnabled?.[modelName] !== false),
    formatModelLabel: (_provider: IProvider | TProviderWithModel | undefined, modelName?: string) => modelName || '',
  }),
}));

describe('useAionrsModelSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.providers = [
      {
        id: 'chatgpt-provider',
        name: 'ChatGPT',
        platform: 'chatgpt',
        baseUrl: 'https://chatgpt.com',
        apiKey: '',
        model: ['gpt-5.6-sol', 'gpt-5.5'],
        enabled: true,
      },
    ];
  });

  it('keeps configured ChatGPT models selectable when runtime capabilities lag behind', () => {
    const initialModel = {
      ...hookMocks.providers[0],
      useModel: 'gpt-5.5',
    } as TProviderWithModel;

    const { result } = renderHook(() =>
      useAionrsModelSelection({
        initialModel,
        onSelectModel: vi.fn().mockResolvedValue(true),
        runtimeCapabilities: {
          tool_approval: true,
          thinking: false,
          effort: true,
          effort_levels: ['low', 'medium', 'high'],
          modes: ['default'],
          current_mode: 'default',
          mcp: false,
          current_model: 'gpt-5.5',
          available_models: [
            { id: 'gpt-5.5', display_name: 'GPT-5.5' },
            { id: 'gpt-5.4', display_name: 'GPT-5.4' },
          ],
        },
      })
    );

    expect(result.current.getAvailableModels(hookMocks.providers[0])).toEqual(['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4']);
  });
});
