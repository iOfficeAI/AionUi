# WeChat Channel UI Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add a WeChat (微信) channel configuration card to the Channels settings page. The backend `WeixinPlugin` is already fully implemented; this spec covers both the renderer-side UI integration and the necessary process-side type/function additions.

WeChat differs from all other channels in one key way: authentication is QR-code based (WeChat iLink Bot OAuth flow), not credential-form based. The QR login IPC bridge is already wired in `src/preload.ts`.

## Files to Modify

| File                                                                                       | Change                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/config/storage.ts`                                                             | Add `assistant.weixin.defaultModel` and `assistant.weixin.agent` storage keys                                                                                                                                                                                   |
| `src/process/channels/types.ts`                                                            | Add `'weixin'` to `ChannelPlatform` type; update `isBuiltinChannelPlatform` guard to include `'weixin'`                                                                                                                                                         |
| `src/process/channels/core/ChannelManager.ts`                                              | Widen `builtinPlatform` type annotation on line ~518 to include `'weixin'`                                                                                                                                                                                      |
| `src/process/channels/actions/SystemActions.ts`                                            | Add `'weixin'` branch to: (1) `getChannelDefaultModel` saved model ternary, (2) `handleSessionNew` source ternary, (3) `handleSessionNew` saved agent ternary                                                                                                   |
| `src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx` | Register WeChat channel; add to `BUILTIN_CHANNEL_TYPES`; add to `ChannelModelConfigKey`; add weixin branch in `pluginStatusChanged` listener; add weixin extraction in `loadPluginStatus`; wire toggle handler; update `useChannelModelSelection` platform cast |

## Files to Create

| File                                                                                    | Purpose                      |
| --------------------------------------------------------------------------------------- | ---------------------------- |
| `src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx` | WeChat config form component |

---

## Component Design: WeixinConfigForm

### Props

```typescript
interface WeixinConfigFormProps {
  pluginStatus: IChannelPluginStatus | null;
  modelSelection: GeminiModelSelection;
  onStatusChange: (status: IChannelPluginStatus | null) => void;
}
```

### Login State Machine

```
idle
  └─[click "扫码登录"]─► loading_qr
                              └─[onQR event]─► showing_qr
                                                    └─[onScanned event]─► scanned
                                                                              └─[weixinLoginStart() resolves]─► connected (auto-enable)
```

States:

- `idle`: show "扫码登录" button
- `loading_qr`: button shows loading spinner (waiting for QR URL)
- `showing_qr`: render `<img src={qrcodeUrl}>` inline; show "请用微信扫描二维码"
- `scanned`: keep QR visible; show "已扫码，等待确认..." overlay
- `connected`: hide QR; show accountId + success indicator; `channel.enablePlugin.invoke` already called

**On QR expiry:** the `weixinLoginStart()` Promise rejects with an error message. Reset to `idle` and show `t('settings.weixin.loginExpired', 'QR code expired, please try again')`.

**On abort or other error:** reset to `idle`, show `t('settings.weixin.loginError', 'WeChat login failed')`.

### Source of Credentials (botToken)

`window.electronAPI.weixinLoginStart()` returns a `Promise<{ accountId: string; botToken: string; baseUrl: string }>`. **Do NOT use the `weixinLoginOnDone` event to obtain `botToken`** — the `preload.ts` typing for that event only exposes `accountId`. Instead, `await` the `weixinLoginStart()` Promise directly to get both `accountId` and `botToken`.

```typescript
const result = await window.electronAPI.weixinLoginStart();
// result.accountId, result.botToken are both available here
```

The event listeners (`weixinLoginOnQR`, `weixinLoginOnScanned`) are used only for UI state transitions (show QR image, show scanned overlay). They do not need to supply credentials.

### Auto-enable after Login

After `weixinLoginStart()` resolves with `{ accountId, botToken }`:

1. Call `channel.enablePlugin.invoke({ pluginId: 'weixin_default', config: { accountId, botToken } })`
2. Refresh plugin status via `channel.getPluginStatus.invoke()`
3. Call `onStatusChange` with the updated weixin plugin status
4. Transition to `connected` state

After this flow completes, `weixinPluginStatus.hasToken` will be `true`. Subsequent enable/disable via the toggle does NOT require a new QR login — credentials are already persisted in the plugin store.

### IPC Bindings Used

All available via `window.electronAPI` (already in `preload.ts`):

```typescript
window.electronAPI.weixinLoginStart(); // Promise<{ accountId, botToken, baseUrl }>
window.electronAPI.weixinLoginOnQR(cb); // subscribe to QR URL; returns unsubscribe fn
window.electronAPI.weixinLoginOnScanned(cb); // subscribe to scan event; returns unsubscribe fn
window.electronAPI.weixinLoginOnDone(cb); // subscribe to done (for UI only, not credentials)
```

All subscriptions must be cleaned up in `useEffect` return callbacks.

### Layout (top to bottom)

1. **Login section** (`PreferenceRow`)
   - Label: `t('settings.weixin.accountId', '账号 ID')`
   - Description: guidance text when idle
   - Right side: login state display (button / QR image / status badge)

2. **Agent selection** (`PreferenceRow`) — identical to Telegram/Lark pattern
   - Uses `ConfigStorage.get/set('assistant.weixin.agent')`
   - Calls `channel.syncChannelSettings.invoke({ platform: 'weixin', agent })`

3. **Model selection** (`PreferenceRow`) — `GeminiModelSelector`
   - Uses `useChannelModelSelection('assistant.weixin.defaultModel')`

---

## ChannelModalContent Changes

### BUILTIN_CHANNEL_TYPES

```typescript
const BUILTIN_CHANNEL_TYPES = new Set(['telegram', 'lark', 'dingtalk', 'weixin', 'slack', 'discord']);
```

### ChannelModelConfigKey

```typescript
type ChannelModelConfigKey =
  | 'assistant.telegram.defaultModel'
  | 'assistant.lark.defaultModel'
  | 'assistant.dingtalk.defaultModel'
  | 'assistant.weixin.defaultModel';
```

### useChannelModelSelection platform cast

In the `onSelectModel` callback inside `useChannelModelSelection`, update the platform cast:

```typescript
const platform = configKey.replace('assistant.', '').replace('.defaultModel', '') as
  | 'telegram'
  | 'lark'
  | 'dingtalk'
  | 'weixin';
```

**Ordering dependency:** The derived `agentKey` is `` `assistant.${platform}.agent` as const ``, which TypeScript resolves to the union of all four agent keys. `ConfigStorage.get(agentKey)` will only type-check once `'assistant.weixin.agent'` exists in `IConfigStorageRefer`. The storage.ts changes (see below) **must be applied before or atomically with** this cast widening. Apply storage.ts first to avoid a transient TypeScript error.

### State variables

Add alongside the existing channel state:

```typescript
const [weixinPluginStatus, setWeixinPluginStatus] = useState<IChannelPluginStatus | null>(null);
const [weixinEnableLoading, setWeixinEnableLoading] = useState(false);
const weixinModelSelection = useChannelModelSelection('assistant.weixin.defaultModel');
```

### loadPluginStatus — extract weixin

Inside `loadPluginStatus`, after extracting `dingtalkPlugin`, add:

```typescript
const weixinPlugin = result.data.find((p) => p.type === 'weixin');
setWeixinPluginStatus(weixinPlugin || null);
```

### pluginStatusChanged listener — weixin branch

In the `pluginStatusChanged` `useEffect` listener, add a weixin branch **before** the existing `else if (!BUILTIN_CHANNEL_TYPES.has(status.type))` extension fallback:

```typescript
} else if (status.type === 'lark') {
  setLarkPluginStatus(status);
} else if (status.type === 'dingtalk') {
  setDingtalkPluginStatus(status);
} else if (status.type === 'weixin') {          // ← insert here, before extension guard
  setWeixinPluginStatus(status);
} else if (!BUILTIN_CHANNEL_TYPES.has(status.type)) {
  setExtensionStatuses(...);
}
```

The weixin branch must come before the `!BUILTIN_CHANNEL_TYPES.has(...)` guard. Since `'weixin'` is in `BUILTIN_CHANNEL_TYPES`, the extension guard would never match it — but placing the branch after means `setWeixinPluginStatus` would never be called from live events (dead code).

### Channel Config Entry

```typescript
const weixinChannel: ChannelConfig = {
  id: 'weixin',
  title: t('settings.channels.weixinTitle', 'WeChat'),
  description: t('settings.channels.weixinDesc', 'Chat with AionUi assistant via WeChat'),
  status: 'active',
  enabled: weixinPluginStatus?.enabled || false,
  disabled: weixinEnableLoading,
  isConnected: weixinPluginStatus?.connected || false,
  content: (
    <WeixinConfigForm
      pluginStatus={weixinPluginStatus}
      modelSelection={weixinModelSelection}
      onStatusChange={setWeixinPluginStatus}
    />
  ),
};
```

Inserted after dingtalk in the channels array (before extension channels).

### Toggle Handler

```typescript
const handleToggleWeixinPlugin = async (enabled: boolean) => {
  setWeixinEnableLoading(true);
  try {
    if (enabled) {
      // Credentials are already stored from prior QR login; hasToken indicates this
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

The toggle handler does NOT require a new QR login when re-enabling — credentials were persisted during the initial QR login auto-enable flow.

### getToggleHandler

Add weixin to the switch:

```typescript
if (channelId === 'weixin') return handleToggleWeixinPlugin;
```

### Collapse State

Add `weixin: true` to the default `collapseKeys`.

---

## storage.ts Changes

```typescript
// WeChat assistant default model
'assistant.weixin.defaultModel'?: { id: string; useModel: string };
// WeChat assistant agent selection
'assistant.weixin.agent'?: { backend: AcpBackendAll; customAgentId?: string; name?: string };
```

---

## Process-Side Changes

### src/process/channels/types.ts

Update `ChannelPlatform` type to include `'weixin'`:

```typescript
export type ChannelPlatform = 'telegram' | 'lark' | 'dingtalk' | 'weixin' | (string & {});
```

Update `isBuiltinChannelPlatform` guard:

```typescript
export function isBuiltinChannelPlatform(platform: string): platform is 'telegram' | 'lark' | 'dingtalk' | 'weixin' {
  return platform === 'telegram' || platform === 'lark' || platform === 'dingtalk' || platform === 'weixin';
}
```

### src/process/channels/core/ChannelManager.ts

Line 518 has a hardcoded type annotation that must be widened once `isBuiltinChannelPlatform` includes `'weixin'`:

```typescript
// Before
const builtinPlatform: 'telegram' | 'lark' | 'dingtalk' = platform;

// After
const builtinPlatform: 'telegram' | 'lark' | 'dingtalk' | 'weixin' = platform;
```

### src/process/channels/actions/SystemActions.ts

This file has two separate ternary chains that each need a `'weixin'` branch.

**1. `getChannelDefaultModel` — saved model lookup (lines ~68–73):**

```typescript
// Before
const savedModel =
  platform === 'lark'
    ? await ProcessConfig.get('assistant.lark.defaultModel')
    : platform === 'dingtalk'
      ? await ProcessConfig.get('assistant.dingtalk.defaultModel')
      : await ProcessConfig.get('assistant.telegram.defaultModel');

// After
const savedModel =
  platform === 'lark'
    ? await ProcessConfig.get('assistant.lark.defaultModel')
    : platform === 'dingtalk'
      ? await ProcessConfig.get('assistant.dingtalk.defaultModel')
      : platform === 'weixin'
        ? await ProcessConfig.get('assistant.weixin.defaultModel')
        : await ProcessConfig.get('assistant.telegram.defaultModel');
```

**2. `handleSessionNew` — conversation source (line ~171):**

```typescript
// Before
const source = platform === 'lark' ? 'lark' : platform === 'dingtalk' ? 'dingtalk' : 'telegram';

// After
const source =
  platform === 'lark' ? 'lark' : platform === 'dingtalk' ? 'dingtalk' : platform === 'weixin' ? 'weixin' : 'telegram';
```

**3. `handleSessionNew` — saved agent lookup (lines ~176–180):**

```typescript
// Before
savedAgent = await (platform === 'lark'
  ? ProcessConfig.get('assistant.lark.agent')
  : platform === 'dingtalk'
    ? ProcessConfig.get('assistant.dingtalk.agent')
    : ProcessConfig.get('assistant.telegram.agent'));

// After
savedAgent = await (platform === 'lark'
  ? ProcessConfig.get('assistant.lark.agent')
  : platform === 'dingtalk'
    ? ProcessConfig.get('assistant.dingtalk.agent')
    : platform === 'weixin'
      ? ProcessConfig.get('assistant.weixin.agent')
      : ProcessConfig.get('assistant.telegram.agent'));
```

---

## i18n Keys

All new keys follow existing `settings.channels.*` and `settings.weixin.*` namespaces. Default values are inline via `t('key', 'default')`.

| Key                                | Default value                            |
| ---------------------------------- | ---------------------------------------- |
| `settings.channels.weixinTitle`    | `WeChat`                                 |
| `settings.channels.weixinDesc`     | `Chat with AionUi assistant via WeChat`  |
| `settings.weixin.loginButton`      | `扫码登录`                               |
| `settings.weixin.scanPrompt`       | `请用微信扫描二维码`                     |
| `settings.weixin.scanned`          | `已扫码，等待确认...`                    |
| `settings.weixin.connected`        | `已连接`                                 |
| `settings.weixin.accountId`        | `账号 ID`                                |
| `settings.weixin.pluginEnabled`    | `WeChat channel enabled`                 |
| `settings.weixin.pluginDisabled`   | `WeChat channel disabled`                |
| `settings.weixin.disableFailed`    | `Failed to disable WeChat plugin`        |
| `settings.weixin.enableFailed`     | `Failed to enable WeChat plugin`         |
| `settings.weixin.loginRequired`    | `Please login with WeChat QR code first` |
| `settings.weixin.loginError`       | `WeChat login failed`                    |
| `settings.weixin.loginExpired`     | `QR code expired, please try again`      |
| `settings.weixin.agent`            | `对话Agent`                              |
| `settings.weixin.agentDesc`        | `Used for WeChat conversations`          |
| `settings.weixin.defaultModelDesc` | `用于Agent对话时调用`                    |

---

## Out of Scope

- WeChat logo/icon asset (no SVG asset added; ChannelItem will use text fallback)
- Authorized users list (WeChat does not use the pairing system)
- Pending pairing requests (not applicable to WeChat)
