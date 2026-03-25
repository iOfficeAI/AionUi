# WeChat Channel UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WeChat (微信) channel configuration card to the Channels settings page, using a QR-code login flow to authenticate and wire into the existing channel plugin system.

**Architecture:** The backend `WeixinPlugin` is already complete. The work is UI-only plus small process-side type extensions. We add storage keys first (ordering dependency), extend the process-side `ChannelPlatform` type and helper ternaries, create a new `WeixinConfigForm` React component with QR-code login state machine, then register it in `ChannelModalContent`.

**Tech Stack:** React 18, TypeScript strict, Electron IPC, Arco Design, UnoCSS, Vitest 4 + jsdom, `bun run test`

---

## File Map

| Action | Path                                                                                       | Responsibility                                                         |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Modify | `src/common/config/storage.ts`                                                             | Add `assistant.weixin.defaultModel` and `assistant.weixin.agent` types |
| Modify | `src/process/channels/types.ts`                                                            | Extend `ChannelPlatform` and `isBuiltinChannelPlatform`                |
| Modify | `src/process/channels/core/ChannelManager.ts`                                              | Widen `builtinPlatform` type annotation at line 518                    |
| Modify | `src/process/channels/actions/SystemActions.ts`                                            | Add `weixin` branch to three ternary chains                            |
| Create | `src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx`    | QR login state machine + Agent + Model selectors                       |
| Modify | `src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx` | Register weixin channel, state, toggle handler, listener               |
| Create | `tests/unit/channels/weixinSystemActions.test.ts`                                          | Unit tests for SystemActions weixin branches                           |
| Create | `tests/unit/channels/weixinConfigForm.dom.test.tsx`                                        | DOM tests for WeixinConfigForm states                                  |

---

### Task 1: Add weixin storage keys

**Why first:** The `useChannelModelSelection` cast in `ChannelModalContent` derives `agentKey` as a template literal from the platform cast. `ConfigStorage.get(agentKey)` type-checks only after `'assistant.weixin.agent'` is declared in `IConfigStorageRefer`. This change is foundational and must land before Task 4.

**Files:**

- Modify: `src/common/config/storage.ts`

- [ ] **Step 1: Open storage.ts and locate the dingtalk agent key (around line 128)**

Look for:

```typescript
  // DingTalk assistant agent selection / DingTalk 助手所使用的 Agent
  'assistant.dingtalk.agent'?: {
    backend: AcpBackendAll;
    customAgentId?: string;
    name?: string;
  };
```

- [ ] **Step 2: Insert weixin keys immediately after**

```typescript
  // WeChat assistant default model / WeChat 助手默认模型
  'assistant.weixin.defaultModel'?: {
    id: string;
    useModel: string;
  };
  // WeChat assistant agent selection / WeChat 助手所使用的 Agent
  'assistant.weixin.agent'?: {
    backend: AcpBackendAll;
    customAgentId?: string;
    name?: string;
  };
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/common/config/storage.ts
git commit -m "feat(weixin): add assistant.weixin storage keys"
```

---

### Task 2: Extend process-side types and ChannelManager

**Files:**

- Modify: `src/process/channels/types.ts` (lines 522, 528–529)
- Modify: `src/process/channels/core/ChannelManager.ts` (line 518)

- [ ] **Step 1: Update ChannelPlatform type in types.ts**

Find:

```typescript
export type ChannelPlatform = 'telegram' | 'lark' | 'dingtalk' | (string & {});
```

Replace with:

```typescript
export type ChannelPlatform = 'telegram' | 'lark' | 'dingtalk' | 'weixin' | (string & {});
```

- [ ] **Step 2: Update isBuiltinChannelPlatform guard in types.ts**

Find:

```typescript
export function isBuiltinChannelPlatform(value: string): value is 'telegram' | 'lark' | 'dingtalk' {
  return value === 'telegram' || value === 'lark' || value === 'dingtalk';
}
```

Replace with:

```typescript
export function isBuiltinChannelPlatform(value: string): value is 'telegram' | 'lark' | 'dingtalk' | 'weixin' {
  return value === 'telegram' || value === 'lark' || value === 'dingtalk' || value === 'weixin';
}
```

- [ ] **Step 3: Widen builtinPlatform annotation in ChannelManager.ts**

Find (line ~518):

```typescript
const builtinPlatform: 'telegram' | 'lark' | 'dingtalk' = platform;
```

Replace with:

```typescript
const builtinPlatform: 'telegram' | 'lark' | 'dingtalk' | 'weixin' = platform;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/process/channels/types.ts src/process/channels/core/ChannelManager.ts
git commit -m "feat(weixin): extend ChannelPlatform type and isBuiltinChannelPlatform for weixin"
```

---

### Task 3: Update SystemActions.ts ternary chains

Three ternary chains in `src/process/channels/actions/SystemActions.ts` need a `weixin` branch inserted before the final `telegram` fallback.

**Files:**

- Modify: `src/process/channels/actions/SystemActions.ts`
- Create: `tests/unit/channels/weixinSystemActions.test.ts`

- [ ] **Step 1: Write the failing tests**

**Important context before writing tests:**

- `getChannelDefaultModel(platform: PluginType): Promise<TProviderWithModel>` — takes **one** argument
- `'weixin'` is already in `BuiltinPluginType` in `types.ts` so no type change needed for `PluginType`
- `handleSessionNew` is not directly exported; test the ternary chains indirectly by calling them, or test the module's exported getChannelDefaultModel only

Create `tests/unit/channels/weixinSystemActions.test.ts`:

```typescript
/**
 * Tests that SystemActions handles 'weixin' platform in all three ternary chains.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before any imports
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

const mockGet = vi.fn();
vi.mock('@process/config/ProcessConfig', () => ({
  ProcessConfig: { get: mockGet },
}));

vi.mock('@process/channels/pairing/PairingService', () => ({
  getPairingService: vi.fn(() => ({})),
}));

vi.mock('@process/acp/connectors/acpConversationConnector', () => ({}));

// Also mock provider list (used inside getChannelDefaultModel)
vi.mock('@process/model/providerListStore', () => ({
  getProviderList: vi.fn(async () => []),
}));

describe('SystemActions weixin platform handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(undefined);
  });

  it('getChannelDefaultModel reads assistant.weixin.defaultModel for weixin platform', async () => {
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockImplementation((key: string) => {
      if (key === 'assistant.weixin.defaultModel') return Promise.resolve({ id: 'p1', useModel: 'gemini-2.0-flash' });
      return Promise.resolve(undefined);
    });

    // Function will fall through to provider fallback (providers list is empty)
    // but mockGet must have been called with the weixin key, not telegram
    try {
      await getChannelDefaultModel('weixin');
    } catch {
      // fallback throws when no provider found — that's fine, we check the key below
    }
    expect(mockGet).toHaveBeenCalledWith('assistant.weixin.defaultModel');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.telegram.defaultModel');
  });

  it('getChannelDefaultModel still reads assistant.telegram.defaultModel for telegram', async () => {
    vi.resetModules();
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockResolvedValue(undefined);
    try {
      await getChannelDefaultModel('telegram');
    } catch {
      // fallback throws — fine
    }
    expect(mockGet).toHaveBeenCalledWith('assistant.telegram.defaultModel');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.weixin.defaultModel');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
bun run test --reporter=verbose tests/unit/channels/weixinSystemActions.test.ts
```

Expected: FAIL (weixin calls telegram key before the ternary is updated)

- [ ] **Step 3: Update getChannelDefaultModel ternary in SystemActions.ts**

Find (lines ~68–73):

```typescript
const savedModel =
  platform === 'lark'
    ? await ProcessConfig.get('assistant.lark.defaultModel')
    : platform === 'dingtalk'
      ? await ProcessConfig.get('assistant.dingtalk.defaultModel')
      : await ProcessConfig.get('assistant.telegram.defaultModel');
```

Replace with:

```typescript
const savedModel =
  platform === 'lark'
    ? await ProcessConfig.get('assistant.lark.defaultModel')
    : platform === 'dingtalk'
      ? await ProcessConfig.get('assistant.dingtalk.defaultModel')
      : platform === 'weixin'
        ? await ProcessConfig.get('assistant.weixin.defaultModel')
        : await ProcessConfig.get('assistant.telegram.defaultModel');
```

- [ ] **Step 4: Update handleSessionNew source ternary (line ~171)**

Find:

```typescript
const source = platform === 'lark' ? 'lark' : platform === 'dingtalk' ? 'dingtalk' : 'telegram';
```

Replace with:

```typescript
const source =
  platform === 'lark' ? 'lark' : platform === 'dingtalk' ? 'dingtalk' : platform === 'weixin' ? 'weixin' : 'telegram';
```

- [ ] **Step 5: Update handleSessionNew savedAgent ternary (lines ~176–180)**

Find:

```typescript
savedAgent = await (platform === 'lark'
  ? ProcessConfig.get('assistant.lark.agent')
  : platform === 'dingtalk'
    ? ProcessConfig.get('assistant.dingtalk.agent')
    : ProcessConfig.get('assistant.telegram.agent'));
```

Replace with:

```typescript
savedAgent = await (platform === 'lark'
  ? ProcessConfig.get('assistant.lark.agent')
  : platform === 'dingtalk'
    ? ProcessConfig.get('assistant.dingtalk.agent')
    : platform === 'weixin'
      ? ProcessConfig.get('assistant.weixin.agent')
      : ProcessConfig.get('assistant.telegram.agent'));
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
bun run test --reporter=verbose tests/unit/channels/weixinSystemActions.test.ts
```

Expected: PASS

- [ ] **Step 7: Run the full test suite to catch regressions**

```bash
bun run test
```

Expected: all existing tests still pass

- [ ] **Step 8: Verify TypeScript**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/process/channels/actions/SystemActions.ts tests/unit/channels/weixinSystemActions.test.ts
git commit -m "feat(weixin): add weixin branches to SystemActions ternary chains"
```

---

### Task 4: Create WeixinConfigForm component

**Files:**

- Create: `src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx`
- Create: `tests/unit/channels/weixinConfigForm.dom.test.tsx`

- [ ] **Step 1: Write the failing DOM tests**

Create `tests/unit/channels/weixinConfigForm.dom.test.tsx`:

```typescript
/**
 * DOM tests for WeixinConfigForm login state machine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback ?? key,
  }),
}));

// Mock electronAPI
const mockWeixinLoginStart = vi.fn();
const mockWeixinLoginOnQR = vi.fn(() => vi.fn());
const mockWeixinLoginOnScanned = vi.fn(() => vi.fn());
const mockWeixinLoginOnDone = vi.fn(() => vi.fn());

Object.defineProperty(window, 'electronAPI', {
  value: {
    weixinLoginStart: mockWeixinLoginStart,
    weixinLoginOnQR: mockWeixinLoginOnQR,
    weixinLoginOnScanned: mockWeixinLoginOnScanned,
    weixinLoginOnDone: mockWeixinLoginOnDone,
  },
  writable: true,
});

// Mock channel IPC bridge
vi.mock('@/common/adapter/ipcBridge', () => ({
  channel: {
    enablePlugin: { invoke: vi.fn(async () => ({ success: true })) },
    getPluginStatus: { invoke: vi.fn(async () => ({ success: true, data: [] })) },
    syncChannelSettings: { invoke: vi.fn(async () => ({ success: true })) },
  },
  acpConversation: {
    getAvailableAgents: { invoke: vi.fn(async () => ({ success: true, data: [] })) },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  default: () => <div data-testid='model-selector' />,
}));

import WeixinConfigForm from '@/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm';

const noopModelSelection = {
  currentModel: undefined,
  isLoading: false,
  onSelectModel: vi.fn(),
} as any;

describe('WeixinConfigForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWeixinLoginOnQR.mockReturnValue(vi.fn());
    mockWeixinLoginOnScanned.mockReturnValue(vi.fn());
    mockWeixinLoginOnDone.mockReturnValue(vi.fn());
  });

  it('renders login button in idle state', () => {
    render(
      <WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />
    );
    expect(screen.getByText('扫码登录')).toBeTruthy();
  });

  it('shows loading state when login starts', async () => {
    // weixinLoginStart never resolves in this test — stays in loading
    mockWeixinLoginStart.mockReturnValue(new Promise(() => {}));

    render(
      <WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    // Button should be loading/disabled
    const btn = screen.getByRole('button', { name: /扫码登录/i });
    expect(btn).toBeTruthy();
  });

  it('displays QR image when qrcodeUrl is set', async () => {
    let qrCallback: ((data: { qrcodeUrl: string }) => void) | null = null;
    mockWeixinLoginOnQR.mockImplementation((cb: any) => {
      qrCallback = cb;
      return vi.fn();
    });
    mockWeixinLoginStart.mockReturnValue(new Promise(() => {}));

    render(
      <WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    await act(async () => {
      qrCallback?.({ qrcodeUrl: 'https://example.com/qr.png' });
    });

    const img = screen.getByRole('img');
    expect((img as HTMLImageElement).src).toContain('qr.png');
    expect(screen.getByText('请用微信扫描二维码')).toBeTruthy();
  });

  it('shows scanned text when onScanned fires', async () => {
    let qrCallback: ((data: { qrcodeUrl: string }) => void) | null = null;
    let scannedCallback: (() => void) | null = null;

    mockWeixinLoginOnQR.mockImplementation((cb: any) => { qrCallback = cb; return vi.fn(); });
    mockWeixinLoginOnScanned.mockImplementation((cb: any) => { scannedCallback = cb; return vi.fn(); });
    mockWeixinLoginStart.mockReturnValue(new Promise(() => {}));

    render(
      <WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />
    );

    await act(async () => { fireEvent.click(screen.getByText('扫码登录')); });
    await act(async () => { qrCallback?.({ qrcodeUrl: 'https://example.com/qr.png' }); });
    await act(async () => { scannedCallback?.(); });

    expect(screen.getByText('已扫码，等待确认...')).toBeTruthy();
  });

  it('shows already-connected state when pluginStatus.hasToken is true', () => {
    const pluginStatus = {
      id: 'weixin_default',
      type: 'weixin',
      enabled: true,
      connected: true,
      hasToken: true,
      name: 'WeChat',
      status: 'running' as const,
    };

    render(
      <WeixinConfigForm pluginStatus={pluginStatus as any} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />
    );

    expect(screen.getByText('已连接')).toBeTruthy();
    // Login button should not be shown
    expect(screen.queryByText('扫码登录')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun run test --reporter=verbose tests/unit/channels/weixinConfigForm.dom.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Create WeixinConfigForm.tsx**

Create `src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPluginStatus } from '@process/channels/types';
import { acpConversation, channel } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import GeminiModelSelector from '@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import { Button, Dropdown, Menu, Message, Spin } from '@arco-design/web-react';
import { CheckOne, Down } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';

/**
 * Preference row component (local, mirrors other config forms)
 */
const PreferenceRow: React.FC<{
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <span className='text-14px text-t-primary'>{label}</span>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center'>{children}</div>
  </div>
);

interface WeixinConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GeminiModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
}

const WeixinConfigForm: React.FC<WeixinConfigFormProps> = ({ pluginStatus, modelSelection, onStatusChange }) => {
  const { t } = useTranslation();

  const [loginState, setLoginState] = useState<LoginState>(
    pluginStatus?.hasToken ? 'connected' : 'idle'
  );
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);

  // Agent selection
  const [availableAgents, setAvailableAgents] = useState<
    Array<{ backend: AcpBackendAll; name: string; customAgentId?: string }>
  >([]);
  const [selectedAgent, setSelectedAgent] = useState<{
    backend: AcpBackendAll;
    name?: string;
    customAgentId?: string;
  }>({ backend: 'gemini' });

  // Sync connected state when pluginStatus changes externally
  useEffect(() => {
    if (pluginStatus?.hasToken && loginState === 'idle') {
      setLoginState('connected');
    }
  }, [pluginStatus, loginState]);

  // Load agents + saved selection
  useEffect(() => {
    const load = async () => {
      try {
        const [agentsResp, saved] = await Promise.all([
          acpConversation.getAvailableAgents.invoke(),
          ConfigStorage.get('assistant.weixin.agent'),
        ]);
        if (agentsResp.success && agentsResp.data) {
          setAvailableAgents(agentsResp.data.filter((a) => !a.isPreset).map((a) => ({
            backend: a.backend,
            name: a.name,
            customAgentId: a.customAgentId,
          })));
        }
        if (saved && typeof saved === 'object' && 'backend' in saved && typeof (saved as any).backend === 'string') {
          setSelectedAgent({
            backend: (saved as any).backend as AcpBackendAll,
            customAgentId: (saved as any).customAgentId,
            name: (saved as any).name,
          });
        }
      } catch (error) {
        console.error('[WeixinConfig] Failed to load agents:', error);
      }
    };
    void load();
  }, []);

  const persistSelectedAgent = async (agent: { backend: AcpBackendAll; customAgentId?: string; name?: string }) => {
    try {
      await ConfigStorage.set('assistant.weixin.agent', agent);
      await channel.syncChannelSettings
        .invoke({ platform: 'weixin', agent })
        .catch((err) => console.warn('[WeixinConfig] syncChannelSettings failed:', err));
      Message.success(t('settings.assistant.agentSwitched', 'Agent switched successfully'));
    } catch (error) {
      console.error('[WeixinConfig] Failed to save agent:', error);
      Message.error(t('common.saveFailed', 'Failed to save'));
    }
  };

  const handleLogin = async () => {
    setLoginState('loading_qr');
    setQrcodeUrl(null);

    const unsubQR = window.electronAPI.weixinLoginOnQR(({ qrcodeUrl: url }) => {
      setQrcodeUrl(url);
      setLoginState('showing_qr');
    });
    const unsubScanned = window.electronAPI.weixinLoginOnScanned(() => {
      setLoginState('scanned');
    });
    const unsubDone = window.electronAPI.weixinLoginOnDone(() => {
      // credentials come from the Promise resolve — not this event
    });

    try {
      const result = await window.electronAPI.weixinLoginStart();
      const { accountId, botToken } = result as { accountId: string; botToken: string };

      // Auto-enable the plugin with obtained credentials
      const enableResult = await channel.enablePlugin.invoke({
        pluginId: 'weixin_default',
        config: { accountId, botToken },
      });

      if (enableResult.success) {
        Message.success(t('settings.weixin.pluginEnabled', 'WeChat channel enabled'));
        const statusResult = await channel.getPluginStatus.invoke();
        if (statusResult.success && statusResult.data) {
          const weixinPlugin = statusResult.data.find((p) => p.type === 'weixin');
          onStatusChange(weixinPlugin || null);
        }
        setLoginState('connected');
      } else {
        Message.error(enableResult.msg || t('settings.weixin.enableFailed', 'Failed to enable WeChat plugin'));
        setLoginState('idle');
      }
    } catch (error: any) {
      const msg: string = error?.message || '';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('too many')) {
        Message.warning(t('settings.weixin.loginExpired', 'QR code expired, please try again'));
      } else if (msg !== 'Aborted') {
        Message.error(t('settings.weixin.loginError', 'WeChat login failed'));
      }
      setLoginState('idle');
      setQrcodeUrl(null);
    } finally {
      unsubQR();
      unsubScanned();
      unsubDone();
    }
  };

  const isGeminiAgent = selectedAgent.backend === 'gemini';
  const agentOptions: Array<{ backend: AcpBackendAll; name: string; customAgentId?: string }> =
    availableAgents.length > 0 ? availableAgents : [{ backend: 'gemini', name: 'Gemini CLI' }];

  const renderLoginArea = () => {
    if (loginState === 'connected' || pluginStatus?.hasToken) {
      return (
        <div className='flex items-center gap-8px'>
          <CheckOne theme='filled' size={16} className='text-green-500' />
          <span className='text-14px text-t-primary'>{t('settings.weixin.connected', '已连接')}</span>
          {pluginStatus?.botUsername && (
            <span className='text-12px text-t-tertiary'>({pluginStatus.botUsername})</span>
          )}
        </div>
      );
    }

    if (loginState === 'showing_qr' || loginState === 'scanned') {
      return (
        <div className='flex flex-col items-center gap-8px'>
          {qrcodeUrl && (
            <img
              src={qrcodeUrl}
              alt='WeChat QR code'
              className='w-160px h-160px rd-8px'
            />
          )}
          {loginState === 'scanned' ? (
            <div className='flex items-center gap-6px text-13px text-t-secondary'>
              <Spin size={14} />
              <span>{t('settings.weixin.scanned', '已扫码，等待确认...')}</span>
            </div>
          ) : (
            <span className='text-13px text-t-secondary'>
              {t('settings.weixin.scanPrompt', '请用微信扫描二维码')}
            </span>
          )}
        </div>
      );
    }

    // idle or loading_qr
    return (
      <Button
        type='primary'
        loading={loginState === 'loading_qr'}
        onClick={() => { void handleLogin(); }}
      >
        {t('settings.weixin.loginButton', '扫码登录')}
      </Button>
    );
  };

  return (
    <div className='flex flex-col gap-24px'>
      {/* Login / connection status */}
      <PreferenceRow
        label={t('settings.weixin.accountId', '账号 ID')}
        description={
          loginState === 'idle' || loginState === 'loading_qr'
            ? t('settings.weixin.scanPrompt', '请用微信扫描二维码')
            : undefined
        }
      >
        {renderLoginArea()}
      </PreferenceRow>

      {/* Agent Selection */}
      <PreferenceRow
        label={t('settings.weixin.agent', '对话Agent')}
        description={t('settings.weixin.agentDesc', 'Used for WeChat conversations')}
      >
        <Dropdown
          trigger='click'
          position='br'
          droplist={
            <Menu
              selectedKeys={[
                selectedAgent.customAgentId
                  ? `${selectedAgent.backend}|${selectedAgent.customAgentId}`
                  : selectedAgent.backend,
              ]}
            >
              {agentOptions.map((a) => {
                const key = a.customAgentId ? `${a.backend}|${a.customAgentId}` : a.backend;
                return (
                  <Menu.Item
                    key={key}
                    onClick={() => {
                      const currentKey = selectedAgent.customAgentId
                        ? `${selectedAgent.backend}|${selectedAgent.customAgentId}`
                        : selectedAgent.backend;
                      if (key === currentKey) return;
                      const next = { backend: a.backend, customAgentId: a.customAgentId, name: a.name };
                      setSelectedAgent(next);
                      void persistSelectedAgent(next);
                    }}
                  >
                    {a.name}
                  </Menu.Item>
                );
              })}
            </Menu>
          }
        >
          <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
            <span className='truncate'>
              {selectedAgent.name ||
                availableAgents.find(
                  (a) =>
                    (a.customAgentId ? `${a.backend}|${a.customAgentId}` : a.backend) ===
                    (selectedAgent.customAgentId
                      ? `${selectedAgent.backend}|${selectedAgent.customAgentId}`
                      : selectedAgent.backend)
                )?.name ||
                selectedAgent.backend}
            </span>
            <Down theme='outline' size={14} />
          </Button>
        </Dropdown>
      </PreferenceRow>

      {/* Default Model Selection */}
      <PreferenceRow
        label={t('settings.assistant.defaultModel', '对话模型')}
        description={t('settings.weixin.defaultModelDesc', '用于Agent对话时调用')}
      >
        <GeminiModelSelector
          selection={isGeminiAgent ? modelSelection : undefined}
          disabled={!isGeminiAgent}
          label={!isGeminiAgent ? t('settings.assistant.autoFollowCliModel', '自动跟随CLI运行时的模型') : undefined}
          variant='settings'
        />
      </PreferenceRow>
    </div>
  );
};

export default WeixinConfigForm;
```

- [ ] **Step 4: Run the DOM tests to confirm they pass**

```bash
bun run test --reporter=verbose tests/unit/channels/weixinConfigForm.dom.test.tsx
```

Expected: PASS

- [ ] **Step 5: Run the full test suite**

```bash
bun run test
```

Expected: all tests pass

- [ ] **Step 6: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx \
        tests/unit/channels/weixinConfigForm.dom.test.tsx
git commit -m "feat(weixin): add WeixinConfigForm with QR login state machine"
```

---

### Task 5: Register WeChat channel in ChannelModalContent

**Files:**

- Modify: `src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx`

This task has 8 separate surgical edits. Make them in the order listed to avoid conflicts.

- [ ] **Step 1: Add WeixinConfigForm import**

Find the existing import block near the top:

```typescript
import DingTalkConfigForm from './DingTalkConfigForm';
import LarkConfigForm from './LarkConfigForm';
import TelegramConfigForm from './TelegramConfigForm';
```

Add after:

```typescript
import WeixinConfigForm from './WeixinConfigForm';
```

- [ ] **Step 2: Add 'weixin' to BUILTIN_CHANNEL_TYPES**

Find:

```typescript
const BUILTIN_CHANNEL_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'slack', 'discord']);
```

Replace with:

```typescript
const BUILTIN_CHANNEL_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'weixin', 'slack', 'discord']);
```

- [ ] **Step 3: Add 'assistant.weixin.defaultModel' to ChannelModelConfigKey**

Find:

```typescript
type ChannelModelConfigKey =
  | 'assistant.telegram.defaultModel'
  | 'assistant.lark.defaultModel'
  | 'assistant.dingtalk.defaultModel';
```

Replace with:

```typescript
type ChannelModelConfigKey =
  | 'assistant.telegram.defaultModel'
  | 'assistant.lark.defaultModel'
  | 'assistant.dingtalk.defaultModel'
  | 'assistant.weixin.defaultModel';
```

- [ ] **Step 4: Widen platform cast in useChannelModelSelection.onSelectModel**

Find:

```typescript
const platform = configKey.replace('assistant.', '').replace('.defaultModel', '') as 'telegram' | 'lark' | 'dingtalk';
```

Replace with:

```typescript
const platform = configKey.replace('assistant.', '').replace('.defaultModel', '') as
  | 'telegram'
  | 'lark'
  | 'dingtalk'
  | 'weixin';
```

- [ ] **Step 5: Add weixin plugin state variables**

Find:

```typescript
const [dingtalkPluginStatus, setDingtalkPluginStatus] = useState<IChannelPluginStatus | null>(null);
const [enableLoading, setEnableLoading] = useState(false);
const [larkEnableLoading, setLarkEnableLoading] = useState(false);
const [dingtalkEnableLoading, setDingtalkEnableLoading] = useState(false);
```

Replace with:

```typescript
const [dingtalkPluginStatus, setDingtalkPluginStatus] = useState<IChannelPluginStatus | null>(null);
const [weixinPluginStatus, setWeixinPluginStatus] = useState<IChannelPluginStatus | null>(null);
const [enableLoading, setEnableLoading] = useState(false);
const [larkEnableLoading, setLarkEnableLoading] = useState(false);
const [dingtalkEnableLoading, setDingtalkEnableLoading] = useState(false);
const [weixinEnableLoading, setWeixinEnableLoading] = useState(false);
```

- [ ] **Step 6: Add weixin model selection**

Find:

```typescript
const telegramModelSelection = useChannelModelSelection('assistant.telegram.defaultModel');
const larkModelSelection = useChannelModelSelection('assistant.lark.defaultModel');
const dingtalkModelSelection = useChannelModelSelection('assistant.dingtalk.defaultModel');
```

Replace with:

```typescript
const telegramModelSelection = useChannelModelSelection('assistant.telegram.defaultModel');
const larkModelSelection = useChannelModelSelection('assistant.lark.defaultModel');
const dingtalkModelSelection = useChannelModelSelection('assistant.dingtalk.defaultModel');
const weixinModelSelection = useChannelModelSelection('assistant.weixin.defaultModel');
```

- [ ] **Step 7: Extract weixin plugin in loadPluginStatus**

Find:

```typescript
const dingtalkPlugin = result.data.find((p) => p.type === 'dingtalk');
const extensionPlugins = result.data.filter((p) => !BUILTIN_CHANNEL_TYPES.has(p.type));

setPluginStatus(telegramPlugin || null);
setLarkPluginStatus(larkPlugin || null);
setDingtalkPluginStatus(dingtalkPlugin || null);
```

Replace with:

```typescript
const dingtalkPlugin = result.data.find((p) => p.type === 'dingtalk');
const weixinPlugin = result.data.find((p) => p.type === 'weixin');
const extensionPlugins = result.data.filter((p) => !BUILTIN_CHANNEL_TYPES.has(p.type));

setPluginStatus(telegramPlugin || null);
setLarkPluginStatus(larkPlugin || null);
setDingtalkPluginStatus(dingtalkPlugin || null);
setWeixinPluginStatus(weixinPlugin || null);
```

- [ ] **Step 8: Add weixin branch in pluginStatusChanged listener**

Find this exact block (the dingtalk + extension sequence):

```typescript
      } else if (status.type === 'dingtalk') {
        setDingtalkPluginStatus(status);
      } else if (!BUILTIN_CHANNEL_TYPES.has(status.type)) {
```

Replace with:

```typescript
      } else if (status.type === 'dingtalk') {
        setDingtalkPluginStatus(status);
      } else if (status.type === 'weixin') {
        setWeixinPluginStatus(status);
      } else if (!BUILTIN_CHANNEL_TYPES.has(status.type)) {
```

- [ ] **Step 9: Add weixin to collapseKeys default**

Find:

```typescript
const [collapseKeys, setCollapseKeys] = useState<Record<string, boolean>>({
  telegram: true, // Default to collapsed
  slack: true,
  discord: true,
  lark: true,
  dingtalk: true,
});
```

Replace with:

```typescript
const [collapseKeys, setCollapseKeys] = useState<Record<string, boolean>>({
  telegram: true, // Default to collapsed
  slack: true,
  discord: true,
  lark: true,
  dingtalk: true,
  weixin: true,
});
```

- [ ] **Step 10: Add handleToggleWeixinPlugin function**

Find the end of `handleToggleDingtalkPlugin` (the closing `};` after the `finally` block), then insert immediately after:

```typescript
// Enable/Disable WeChat plugin
const handleToggleWeixinPlugin = async (enabled: boolean) => {
  setWeixinEnableLoading(true);
  try {
    if (enabled) {
      if (!weixinPluginStatus?.hasToken) {
        Message.warning(t('settings.weixin.loginRequired', 'Please login with WeChat QR code first'));
        return;
      }
      const result = await channel.enablePlugin.invoke({ pluginId: 'weixin_default', config: {} });
      if (result.success) {
        Message.success(t('settings.weixin.pluginEnabled', 'WeChat channel enabled'));
        await loadPluginStatus();
      } else {
        Message.error(result.msg || t('settings.weixin.enableFailed', 'Failed to enable WeChat plugin'));
      }
    } else {
      const result = await channel.disablePlugin.invoke({ pluginId: 'weixin_default' });
      if (result.success) {
        Message.success(t('settings.weixin.pluginDisabled', 'WeChat channel disabled'));
        await loadPluginStatus();
      } else {
        Message.error(result.msg || t('settings.weixin.disableFailed', 'Failed to disable WeChat plugin'));
      }
    }
  } catch (error: any) {
    Message.error(error.message);
  } finally {
    setWeixinEnableLoading(false);
  }
};
```

- [ ] **Step 11: Add weixinChannel config in the channels useMemo**

Find:

```typescript
    const dingtalkChannel: ChannelConfig = {
```

Insert this block **after** the closing `};` of `dingtalkChannel` (before `const extensionChannels`):

```typescript
    const weixinChannel: ChannelConfig = {
      id: 'weixin',
      title: t('settings.channels.weixinTitle', 'WeChat'),
      description: t('settings.channels.weixinDesc', 'Chat with AionUi assistant via WeChat'),
      status: 'active',
      enabled: weixinPluginStatus?.enabled || false,
      disabled: weixinEnableLoading,
      isConnected: weixinPluginStatus?.connected || false,
      defaultModel: weixinModelSelection.currentModel?.useModel,
      content: (
        <WeixinConfigForm
          pluginStatus={weixinPluginStatus}
          modelSelection={weixinModelSelection}
          onStatusChange={setWeixinPluginStatus}
        />
      ),
    };
```

- [ ] **Step 12: Add weixinChannel to the return array**

Find:

```typescript
return [telegramChannel, larkChannel, dingtalkChannel, ...extensionChannels, ...comingSoonChannels];
```

Replace with:

```typescript
return [telegramChannel, larkChannel, dingtalkChannel, weixinChannel, ...extensionChannels, ...comingSoonChannels];
```

- [ ] **Step 13: Add weixinChannel to useMemo deps**

Find the deps array of the channels useMemo. It currently ends with:

```typescript
    dingtalkEnableLoading,
    renderExtensionConfigForm,
    t,
```

Add `weixinPluginStatus`, `weixinEnableLoading`, `weixinModelSelection` to it:

```typescript
    dingtalkEnableLoading,
    weixinPluginStatus,
    weixinEnableLoading,
    weixinModelSelection,
    renderExtensionConfigForm,
    t,
```

- [ ] **Step 14: Register weixin in getToggleHandler**

Find:

```typescript
if (channelId === 'dingtalk') return handleToggleDingtalkPlugin;
```

Add immediately after:

```typescript
if (channelId === 'weixin') return handleToggleWeixinPlugin;
```

- [ ] **Step 15: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Step 16: Run full test suite**

```bash
bun run test
```

Expected: all tests pass

- [ ] **Step 17: Lint and format**

```bash
bun run lint:fix && bun run format
```

- [ ] **Step 18: Commit**

```bash
git add src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx
git commit -m "feat(weixin): register WeChat channel in ChannelModalContent"
```

---

## Final Verification

- [ ] **Run full test suite one last time**

```bash
bun run test
```

Expected: all tests pass

- [ ] **Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors

- [ ] **Manual smoke test**

Launch the app and open Settings → Channels. Verify:

1. WeChat card appears after DingTalk with no "即将上线" badge
2. Expanding the card shows "扫码登录" button
3. Toggle is disabled when `hasToken` is false (no credentials)
4. Clicking "扫码登录" initiates the login flow

---

## Quick Reference

| Command                                  | Purpose              |
| ---------------------------------------- | -------------------- |
| `bun run test`                           | Run all tests        |
| `bun run test --reporter=verbose <file>` | Run single test file |
| `bunx tsc --noEmit`                      | Type check only      |
| `bun run lint:fix`                       | Auto-fix lint issues |
| `bun run format`                         | Auto-format code     |
