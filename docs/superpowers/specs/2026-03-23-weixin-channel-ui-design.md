# WeChat Channel UI Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add a WeChat (微信) channel configuration card to the Channels settings page. The backend `WeixinPlugin` is already fully implemented; this spec covers only the renderer-side UI integration.

WeChat differs from all other channels in one key way: authentication is QR-code based (WeChat iLink Bot OAuth flow), not credential-form based. The QR login IPC bridge is already wired in `src/preload.ts`.

## Files to Modify

| File | Change |
|------|--------|
| `src/common/config/storage.ts` | Add `assistant.weixin.defaultModel` and `assistant.weixin.agent` storage keys |
| `src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx` | Register WeChat channel; add to `BUILTIN_CHANNEL_TYPES`; add to `ChannelModelConfigKey`; wire toggle handler |

## Files to Create

| File | Purpose |
|------|---------|
| `src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx` | WeChat config form component |

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
                                                                              └─[onDone event]─► connected (auto-enable)
```

- `idle`: show "扫码登录" button
- `loading_qr`: button shows loading spinner
- `showing_qr`: render `<img src={qrcodeUrl}>` inline; show "请用微信扫描二维码"
- `scanned`: keep QR visible; show "已扫码，等待确认..." overlay
- `connected`: hide QR; show accountId + success indicator; call `channel.enablePlugin.invoke`

On login abort or error: reset to `idle`, show error message.

### Layout (top to bottom)

1. **Login section** (`PreferenceRow`)
   - Label: "微信账号" / description: 引导文字
   - Right side: login state display (button / QR / status)

2. **Agent selection** (`PreferenceRow`) — identical to Telegram/Lark pattern
   - Uses `ConfigStorage.get/set('assistant.weixin.agent')`
   - Calls `channel.syncChannelSettings.invoke({ platform: 'weixin', agent })`

3. **Model selection** (`PreferenceRow`) — `GeminiModelSelector`
   - Uses `useChannelModelSelection('assistant.weixin.defaultModel')`

### Auto-enable after Login

After `weixinLoginOnDone` fires:
1. Call `channel.enablePlugin.invoke({ pluginId: 'weixin_default', config: { accountId, botToken } })`
2. Refresh plugin status via `channel.getPluginStatus.invoke()`
3. Call `onStatusChange` with the updated status

### IPC Bindings Used

All available via `window.electronAPI` (already in `preload.ts`):

```typescript
window.electronAPI.weixinLoginStart()             // Promise<{ accountId, botToken, baseUrl }>
window.electronAPI.weixinLoginOnQR(cb)            // returns unsubscribe fn
window.electronAPI.weixinLoginOnScanned(cb)       // returns unsubscribe fn
window.electronAPI.weixinLoginOnDone(cb)          // returns unsubscribe fn
```

Note: subscriptions must be cleaned up in `useEffect` return.

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
  content: <WeixinConfigForm pluginStatus={weixinPluginStatus} modelSelection={weixinModelSelection} onStatusChange={setWeixinPluginStatus} />,
};
```

Inserted after dingtalk in the channels array.

### Toggle Handler

```typescript
const handleToggleWeixinPlugin = async (enabled: boolean) => {
  // If enabling: require hasToken (credentials from QR login)
  // If disabling: call channel.disablePlugin.invoke({ pluginId: 'weixin_default' })
};
```

### Collapse State

Add `weixin: true` to the default `collapseKeys`.

## storage.ts Changes

```typescript
'assistant.weixin.defaultModel'?: { id: string; useModel: string };
'assistant.weixin.agent'?: { backend: AcpBackendAll; customAgentId?: string; name?: string };
```

## i18n Keys

All new keys follow existing `settings.channels.*` and `settings.weixin.*` namespaces. Default English values are inline (same as all other channels). No separate translation file changes required — the project uses inline defaults with `t('key', 'default')`.

| Key | Default value |
|-----|---------------|
| `settings.channels.weixinTitle` | `WeChat` |
| `settings.channels.weixinDesc` | `Chat with AionUi assistant via WeChat` |
| `settings.weixin.loginButton` | `扫码登录` |
| `settings.weixin.scanPrompt` | `请用微信扫描二维码` |
| `settings.weixin.scanned` | `已扫码，等待确认...` |
| `settings.weixin.connected` | `已连接` |
| `settings.weixin.accountId` | `账号 ID` |
| `settings.weixin.pluginEnabled` | `WeChat channel enabled` |
| `settings.weixin.pluginDisabled` | `WeChat channel disabled` |
| `settings.weixin.enableFailed` | `Failed to enable WeChat plugin` |
| `settings.weixin.loginRequired` | `Please login with WeChat QR code first` |
| `settings.weixin.loginError` | `WeChat login failed` |
| `settings.weixin.agent` | `对话Agent` |
| `settings.weixin.agentDesc` | `Used for WeChat conversations` |
| `settings.weixin.defaultModelDesc` | `用于Agent对话时调用` |

## Out of Scope

- WeChat logo/icon asset (no SVG asset added; the channel header will use a text fallback or the ChannelItem's existing icon handling)
- Authorized users list (WeChat does not use the pairing system)
- Pending pairing requests (not applicable to WeChat)
