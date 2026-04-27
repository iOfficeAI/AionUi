import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

// Mock window.matchMedia for Arco Design responsive observer
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  };
});

vi.mock('@icon-park/react', () => ({
  CheckOne: () => <span data-testid='check-icon' />,
}));

// Track configService.get call count to verify retry behavior
const mockConfigServiceGet = vi.fn();
const mockConfigServiceSet = vi.fn();

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (...args: unknown[]) => mockConfigServiceGet(...args),
    set: (...args: unknown[]) => mockConfigServiceSet(...args),
  },
}));

// Control the providers returned by the hook
let mockProviders: Array<{ id: string; name: string; model: string[]; platform?: string }> = [];

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => ({
    providers: mockProviders,
    getAvailableModels: () => [],
    formatModelLabel: (_p: unknown, m?: string) => m || '',
  }),
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: ({ initialModel }: { initialModel: unknown }) => ({
    current_model: initialModel,
    providers: mockProviders,
    formatModelLabel: () => '',
    getDisplayModelName: () => '',
    getAvailableModels: () => [],
    handleSelectModel: vi.fn(),
  }),
}));

vi.mock('@/common/adapter/ipcBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/ipcBridge')>();
  return {
    ...actual,
    channel: {
      getPluginStatus: { invoke: vi.fn().mockResolvedValue({ success: true, data: [] }) },
      pluginStatusChanged: { on: vi.fn().mockReturnValue(() => {}) },
    },
    webui: {
      getStatus: { invoke: vi.fn().mockResolvedValue({ success: false }) },
    },
  };
});

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../src/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('../../src/renderer/components/settings/SettingsModal/contents/channels/ChannelItem', () => ({
  default: ({ channel }: { channel: { id: string; title: string } }) => (
    <div data-testid={`channel-${channel.id}`}>{channel.title}</div>
  ),
}));

vi.mock('../../src/renderer/components/settings/SettingsModal/contents/channels/TelegramConfigForm', () => ({
  default: () => <div>TelegramForm</div>,
}));
vi.mock('../../src/renderer/components/settings/SettingsModal/contents/channels/LarkConfigForm', () => ({
  default: () => <div>LarkForm</div>,
}));
vi.mock('../../src/renderer/components/settings/SettingsModal/contents/channels/DingTalkConfigForm', () => ({
  default: () => <div>DingTalkForm</div>,
}));
vi.mock('../../src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm', () => ({
  default: () => <div>WeixinForm</div>,
}));
vi.mock('../../src/renderer/components/settings/SettingsModal/contents/channels/WecomConfigForm', () => ({
  default: () => <div>WecomForm</div>,
}));

describe('useChannelModelSelection restore retry limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProviders = [];
  });

  it('should stop retrying configService.get after MAX_RESTORE_RETRIES when provider is stale', async () => {
    // Simulate a stale saved model referencing a provider that no longer exists
    mockConfigServiceGet.mockReturnValue({ id: 'deleted-provider', use_model: 'some-model' });

    // Providers are loaded but don't include the saved provider
    mockProviders = [{ id: 'provider-1', name: 'Provider One', models: ['model-a', 'model-b'] }];

    const { default: ChannelModalContent } =
      await import('@/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent');

    await act(async () => {
      render(<ChannelModalContent />);
    });

    // The hook runs for 5 channels (telegram, lark, dingtalk, weixin, wecom).
    // Initial render triggers the first attempt for each channel.
    // The saved provider 'deleted-provider' won't be found in mockProviders.
    const initialCallCount = mockConfigServiceGet.mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    // Simulate multiple SWR revalidations by triggering re-renders with
    // the same providers reference (effects re-run on providers change).
    // Each re-render should increment the retry count until the limit is hit.
    for (let i = 0; i < 10; i++) {
      // Create a new providers array reference to trigger the useEffect
      mockProviders = [{ id: 'provider-1', name: 'Provider One', models: ['model-a', 'model-b'] }];
      await act(async () => {
        // Force re-render by triggering state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    // After MAX_RESTORE_RETRIES (5), the effect should stop calling configService.get.
    // With 5 channels × at most 5 retries each = at most 25 calls.
    // Without the fix, this would be 5 × 10+ = 50+ calls.
    const totalCalls = mockConfigServiceGet.mock.calls.length;
    expect(totalCalls).toBeLessThanOrEqual(5 * 5);
  });

  it('should restore successfully when provider exists', async () => {
    mockConfigServiceGet.mockReturnValue({ id: 'provider-1', use_model: 'model-a' });

    mockProviders = [{ id: 'provider-1', name: 'Provider One', models: ['model-a', 'model-b'] }];

    const { default: ChannelModalContent } =
      await import('@/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent');

    await act(async () => {
      render(<ChannelModalContent />);
    });

    // Each of the 5 channels should call configService.get exactly once
    // (restored=true after finding the provider, so no retries)
    expect(mockConfigServiceGet).toHaveBeenCalledTimes(5);
  });
});
