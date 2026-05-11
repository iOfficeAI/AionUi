# 设置页 → 远程连接 — Channels 渠道接入 (F-CHAN)

> 本文档覆盖「设置 → 远程连接」页面 **Channels Tab** 的全部功能，包括渠道卡片总览、各 IM 渠道配置（Telegram/Lark/DingTalk/WeChat/WeCom）、Agent/模型选择、配对授权通用流程、扩展渠道支持。
> 基于静态代码分析和动态 UI 验证综合整理。
>
> WebUI Tab 相关内容见 [webui.md](../webui/webui.md)。

---

## (F-WEBUI-12) Channels 页面总览与渠道卡片结构 [已实现]

**用户故事**：作为用户，我希望在"远程连接"设置页面中浏览所有支持的 IM 渠道，了解每个渠道的状态，并展开配置面板。

**正常流程**（用户视角）：

1. 用户进入「设置 → 远程连接」页面，切换到 "Channels" Tab（桌面端）；或直接看到 Channels 内容（非桌面端/WebUI 浏览器访问）
2. 页面顶部显示标题"Channels"、功能描述文本（"Connect Telegram, Lark, and DingTalk to interact with AionUi from IM apps."），以及 2 步引导提示
3. 下方为渠道卡片列表（Arco Design Collapse），每个渠道一张可折叠卡片
4. 卡片 header 包含：渠道图标/logo、渠道名、描述、连接状态徽标（Connected/未连接）、Switch 启用开关
5. 默认所有卡片折叠（`collapseKeys` 默认 `true`）；点击卡片 header 展开详细配置面板
6. Switch 开关可直接启用/禁用渠道，无需展开卡片

**渠道列表与排序**：

| 顺序 | 渠道          | pluginId                | 状态        |
| ---- | ------------- | ----------------------- | ----------- |
| 1    | Telegram      | `telegram_default`      | active      |
| 2    | Lark / Feishu | `lark_default`          | active      |
| 3    | DingTalk      | `dingtalk_default`      | active      |
| 4    | WeChat        | `weixin_default`        | active      |
| 5    | WeCom         | `wecom_default`         | active      |
| 6+   | 扩展渠道      | 动态（`extensionMeta`） | active      |
| 末尾 | Slack         | -                       | coming_soon |
| 末尾 | Discord       | -                       | coming_soon |

**说明**：Slack/Discord 若已被扩展渠道实现（`extensionTypeSet` 包含 `slack`/`discord`），则隐藏对应 coming_soon 占位卡片。

**异常情况**：

- `channel.getPluginStatus.invoke()` 失败：仅记录日志，渠道状态保持初始值（未启用/未连接）
- `channel.pluginStatusChanged.on()` 事件推送：实时更新对应渠道的状态（启用/连接/botUsername 等）

**验收标准**：

- [ ] 页面显示标题、描述和引导提示
- [ ] 所有渠道按指定顺序排列
- [ ] 卡片默认折叠，点击可展开/收起
- [ ] Switch 开关可在卡片 header 直接操作
- [ ] 渠道状态（Connected/未连接）实时更新
- [ ] 非桌面端直接显示 Channels 内容（无 Tab 切换）
- [ ] Slack/Discord 显示"coming soon"占位文案
- [ ] 已被扩展实现的 coming_soon 渠道自动隐藏

---

## (F-WEBUI-13) Telegram 渠道配置 [已实现]

**用户故事**：作为用户，我希望通过输入 Telegram Bot Token 连接 Telegram，并管理通过 Telegram 与 AionUi 交互的授权用户。

**前置条件**：用户已在 Telegram @BotFather 创建 Bot 并获取 Token

**正常流程**（用户视角）：

1. 展开 Telegram 卡片，显示配置面板
2. **Bot Token 输入**：Password 类型输入框（240px 宽），带可见性切换，placeholder `123456:ABC-DEF...`
3. 点击"Test"按钮测试连接
4. 测试成功：toast 提示"Connected! Bot: @xxx"，自动启用插件（`enablePlugin`），刷新状态
5. 启用成功后 header 的 Switch 变为 ON，状态徽标变为 Connected
6. 下方出现"Next Steps"引导卡片（4 步操作指引），引导用户在 Telegram 搜索 Bot 发送消息触发配对
7. 用户在 Telegram 发送消息后，"Pending Pairing Requests"区域实时出现配对请求（通过 `channel.pairingRequested.on` 事件推送）
8. 点击"Approve"批准配对，用户移入"Authorized Users"列表
9. 授权后 Token 输入框和 Test 按钮变为 disabled（`tokenLocked` tooltip："请先关闭渠道并删除所有授权用户后才能修改配置"）

**异常情况**：

- Token 为空点击 Test：warning toast "Please enter a bot token"
- 测试失败（Token 无效/网络错误）：error toast 显示后端错误信息或"Connection failed"
- 启用无 Token（Switch 直接打开）：warning toast "Please enter a bot token first"
- 批准配对失败：error toast
- 拒绝配对：info toast "Pairing rejected"
- 撤销用户失败：error toast

**验收标准**：

- [ ] Bot Token 输入框支持 Password 可见性切换
- [ ] Test 按钮测试成功后自动启用插件
- [ ] 启用后显示 4 步操作引导
- [ ] 实时接收并显示配对请求
- [ ] 可批准/拒绝配对请求
- [ ] 授权用户列表显示用户名、平台、授权时间
- [ ] 可撤销已授权用户
- [ ] 有授权用户时 Token 和 Test 按钮禁用
- [ ] 配对请求和授权用户列表支持手动刷新

---

## (F-WEBUI-14) Lark / 飞书渠道配置 [已实现]

**用户故事**：作为用户，我希望通过配置飞书应用凭据连接 Lark/飞书，与 AionUi 进行 IM 对话。

**前置条件**：用户已在飞书开放平台创建应用并获取 App ID 和 App Secret

**正常流程**（用户视角）：

1. 展开 Lark 卡片，显示配置面板
2. **必填字段**：
   - App ID（Input，必填，红色 `*` 标记）
   - App Secret（Input.Password，必填，红色 `*` 标记）
3. **可选字段**（默认折叠，点击"Show optional fields"展开）：
   - Encrypt Key（Input.Password）
   - Verification Token（Input.Password）
4. 右下角有蓝色链接"飞书开放平台文档"，打开 `https://open.feishu.cn/document/develop-an-echo-bot/introduction`
5. 点击"Test & Connect"按钮测试连接
6. 测试成功：toast "Connected to Lark API!"，自动启用插件（传入 appId + appSecret + encryptKey? + verificationToken?）
7. 配对/授权用户管理流程与 Telegram 相同（见 F-WEBUI-13）

**异常情况**：

- App ID 或 App Secret 为空点击 Test：warning toast "Please enter App ID and App Secret"，空字段标红（`touched` 状态）
- 凭据无效：error toast 显示后端错误信息
- 启用无凭据（Switch 直接打开）：warning toast "Please configure Lark credentials first"
- 连接状态变化：`pluginStatusChanged` 事件实时更新（Connected/Error/Connecting 带颜色编码徽标）

**验收标准**：

- [ ] App ID 和 App Secret 为必填项，带红色 `*`
- [ ] 可选字段默认折叠，可展开
- [ ] Test & Connect 测试成功后自动启用
- [ ] 飞书文档链接可正常打开
- [ ] 空字段提交时表单标红
- [ ] 配对/授权用户管理功能正常
- [ ] 连接状态实时更新

---

## (F-WEBUI-15) DingTalk 渠道配置 [已实现]

**用户故事**：作为用户，我希望通过配置钉钉应用凭据连接 DingTalk，与 AionUi 进行 IM 对话。

**前置条件**：用户已在钉钉开放平台创建应用并获取 Client ID 和 Client Secret

**正常流程**（用户视角）：

1. 展开 DingTalk 卡片，显示配置面板
2. **必填字段**：
   - Client ID（Input，必填，红色 `*` 标记）
   - Client Secret（Input.Password，必填，红色 `*` 标记）
3. 右下角有蓝色链接"DingTalk setup guide"，打开 GitHub Wiki 配置指南
4. 点击"Test & Connect"按钮测试连接
5. 测试成功后自动启用插件
6. 配对/授权用户管理流程与 Telegram 相同（见 F-WEBUI-13）

**异常情况**：

- 凭据为空：warning toast "Please configure DingTalk credentials first"
- 测试/启用失败：error toast 显示错误信息

**验收标准**：

- [ ] Client ID 和 Client Secret 为必填项
- [ ] Test & Connect 测试成功后自动启用
- [ ] GitHub Wiki 链接可正常打开
- [ ] 配对/授权用户管理功能正常

---

## (F-WEBUI-16) WeChat 渠道配置（扫码登录） [已实现]

**用户故事**：作为用户，我希望通过微信扫码登录连接 WeChat 渠道，无需手动输入复杂凭据。

**正常流程**（用户视角）：

1. 展开 WeChat 卡片，显示配置面板
2. **初始状态（idle）**：显示"Scan to Login"按钮
3. 用户点击按钮，进入二维码加载状态（`loading_qr`）
4. **Electron 桌面端**：
   - 调用 `window.electronAPI.weixinLoginStart()` 启动登录
   - 通过 `weixinLoginOnQR` 事件接收 QR 码（base64 data URL）
   - 显示 `<img>` 标签渲染 QR 码（160x160px）
5. **WebUI 浏览器端**：
   - 通过 `EventSource('/api/channel/weixin/login')` SSE 接收事件
   - 通过 `qr` 事件接收 QR 码数据（raw ticket string）
   - 使用 `QRCodeSVG` 组件渲染 QR 码（160x160px）
6. 用户用微信扫描二维码
7. 扫描后状态变为 `scanned`：显示 Spin loading + "Scanned, waiting for confirmation..."
8. 确认后自动调用 `enableWeixinPlugin(accountId, botToken)` 启用渠道
9. 状态变为 `connected`：显示绿色对钩 + "Connected" + "Disconnect"按钮
10. 配对/授权用户管理流程与 Telegram 相同（见 F-WEBUI-13）

**登录状态机**：

```
idle → loading_qr → showing_qr → scanned → connected
  ↑         ↓              ↓          ↓
  ←─── (error/expired) ←───┴──────────┘
```

**异常情况**：

- QR 码过期/too many 尝试：warning toast "QR code expired, please try again"，回到 idle
- EventSource error 事件（WebUI）：error toast "WeChat login failed"，回到 idle
- Electron IPC 错误（非 Aborted）：error toast "WeChat login failed"
- 用户取消（Aborted）：静默回到 idle，不显示错误
- enablePlugin 失败：error toast，回到 idle
- Disconnect 失败：error toast

**验收标准**：

- [ ] Electron 端通过 IPC 接收 QR 码（base64 img）
- [ ] WebUI 端通过 EventSource SSE 接收 QR 码（QRCodeSVG 渲染）
- [ ] 扫码后显示"等待确认"loading 状态
- [ ] 登录成功后显示 Connected 状态 + Disconnect 按钮
- [ ] QR 码过期有明确提示，可重新发起
- [ ] 断开连接（Disconnect）可正常禁用渠道
- [ ] 组件卸载时 EventSource 正确关闭（无连接泄漏）

---

## (F-WEBUI-17) WeCom 渠道配置（WebSocket 长连接） [已实现]

**用户故事**：作为用户，我希望通过配置企业微信机器人 ID 和密钥连接 WeCom 渠道，使用 WebSocket 长连接模式无需回调 URL。

**前置条件**：用户已在企业微信管理后台创建应用并获取 Bot ID 和 Secret

**正常流程**（用户视角）：

1. 展开 WeCom 卡片，显示配置面板
2. 顶部橙色提示横幅说明：WeCom 使用 WebSocket 长连接模式，无需配置回调 URL
3. **必填字段**：
   - Bot ID（Input，必填，红色 `*` 标记，有授权用户时 disabled）
   - Secret（Input.Password，必填，红色 `*` 标记，有授权用户时 disabled）
4. 右下角有蓝色链接"企业微信开发文档"，打开 `https://developer.work.weixin.qq.com/document/path/101463`
5. 点击"Save & Enable"按钮（区别于其他渠道的 "Test & Connect"）
6. 保存并启用成功：toast "WeCom channel enabled"，刷新状态
7. 配对/授权用户管理流程与 Telegram 相同（见 F-WEBUI-13）

**异常情况**：

- Bot ID 或 Secret 为空：warning toast "Please enter Bot ID and Secret"，字段标红
- 启用无凭据（Switch 直接打开）：warning toast "Please save Token and EncodingAESKey first"
- 保存/启用失败：error toast 显示错误信息

**验收标准**：

- [ ] 顶部显示 WebSocket 长连接模式说明横幅
- [ ] Bot ID 和 Secret 为必填项
- [ ] Save & Enable 按钮一步保存并启用
- [ ] 企业微信文档链接可正常打开
- [ ] 有授权用户时凭据输入框禁用
- [ ] 配对/授权用户管理功能正常

---

## (F-WEBUI-18) 渠道 Agent 选择 [已实现]

**用户故事**：作为用户，我希望为每个 IM 渠道独立选择使用的 Agent，以便不同渠道使用不同的 AI 后端。

**正常流程**（用户视角）：

1. 每个渠道配置面板内有"Agent"选择行
2. 点击 Dropdown 按钮展开 Agent 列表（来自 `acpConversation.getAvailableAgents.invoke()`，过滤掉 preset Agent）
3. 默认选中"Gemini CLI"（`{ backend: 'gemini' }`）
4. 选择新 Agent 后：
   - 本地状态更新
   - `ConfigStorage.set('assistant.{platform}.agent', agent)` 持久化
   - `channel.syncChannelSettings.invoke({ platform, agent })` 同步到后端
   - toast "Agent switched successfully"
5. 页面重新打开时从 ConfigStorage 恢复之前的选择

**异常情况**：

- Agent 列表加载失败：默认显示 "Gemini CLI" 作为唯一选项
- 持久化失败：error toast "Failed to save"
- syncChannelSettings 失败：仅 console.warn，不影响本地选择

**验收标准**：

- [ ] 每个渠道有独立的 Agent Dropdown
- [ ] Agent 列表从后端加载，过滤 preset
- [ ] 切换 Agent 有成功 toast
- [ ] 选择持久化，重新打开页面恢复
- [ ] Agent 列表为空时显示 "Gemini CLI" 兜底

---

## (F-WEBUI-19) 渠道默认模型选择 [已实现]

**用户故事**：作为用户，我希望为每个 IM 渠道独立设置默认使用的 AI 模型，以便控制不同渠道的回复质量和速度。

**前置条件**：当前 Agent 为 Gemini 兼容类型（`backend === 'gemini'` 或 `'aionrs'`）

**正常流程**（用户视角）：

1. 每个渠道配置面板内有"Default Model"选择行
2. 使用 `GeminiModelSelector` 组件渲染模型下拉选择
3. 选择模型后：
   - `ConfigStorage.set('assistant.{platform}.defaultModel', { id, useModel })` 持久化
   - `channel.syncChannelSettings.invoke({ platform, agent, model })` 同步到后端
   - toast "Model switched successfully"
4. 页面重新打开时自动恢复保存的模型（`useChannelModelSelection` hook，最多重试 5 次匹配 provider）

**条件渲染**：

- Agent 为 Gemini/aionrs 类型：正常显示模型选择器
- Agent 为其他类型（如 Custom Agent）：显示灰色文案"Automatically follow the model when CLI is running"，选择器禁用

**异常情况**：

- 保存的 Provider ID 已失效（provider 被删除）：重试最多 5 次后放弃，使用默认模型
- 模型保存失败：error toast "Failed to save model"

**验收标准**：

- [ ] 每个渠道有独立的模型选择
- [ ] 仅 Gemini 兼容 Agent 显示模型选择器
- [ ] 非 Gemini Agent 显示禁用状态 + 提示文案
- [ ] 模型选择持久化，重新打开页面恢复
- [ ] Provider 失效时有重试机制（最多 5 次）

---

## (F-WEBUI-20) 渠道配对与用户授权（通用流程） [已实现]

**用户故事**：作为用户，我希望通过配对码机制控制哪些 IM 用户可以与我的 AionUi 交互，保证安全性。

**适用渠道**：Telegram、Lark、DingTalk、WeChat、WeCom（全部 5 个已实现渠道共享此流程）

**正常流程**（用户视角）：

1. 渠道启用且已连接后，IM 用户向 Bot 发送消息
2. 首次消息触发配对请求，AionUi 通过 `channel.pairingRequested.on()` 实时推送到设置页面
3. "Pending Pairing Requests"区域显示配对卡片：
   - 用户显示名（`displayName`，未知则显示"Unknown User"）
   - 配对码（`code`）+ 复制按钮
   - 剩余时间（`expiresAt`，单位 min）
   - "Approve"按钮（主色调）+ "Reject"按钮（红色危险态）
4. 点击 Approve：`channel.approvePairing.invoke({ code })` → 成功 toast → 用户移入"Authorized Users"
5. `channel.userAuthorized.on()` 实时推送，自动从 pending 列表移除并添加到 authorized 列表
6. "Authorized Users"区域显示：
   - 用户显示名
   - 平台类型 + 授权时间
   - "Revoke access"删除按钮（红色危险态）
7. 点击 Revoke：`channel.revokeUser.invoke({ userId })` → 成功 toast → 用户从列表移除

**凭据锁定机制**：当 `authorizedUsers.length > 0` 时，凭据输入框和测试按钮变为 disabled，tooltip 提示"请先关闭渠道并删除所有授权用户后才能修改配置"。此规则适用于 Telegram（Token）、Lark（AppID/Secret）、DingTalk（ClientID/Secret）、WeCom（BotID/Secret）。

**异常情况**：

- 加载配对/授权列表失败：仅日志，空列表
- 批准配对失败：error toast 显示后端错误
- 拒绝配对失败：error toast
- 撤销用户失败：error toast
- 实时事件去重：已存在相同 code/id 的不重复添加

**验收标准**：

- [ ] 配对请求实时显示（无需手动刷新）
- [ ] 可批准/拒绝配对请求
- [ ] 批准后用户实时出现在授权列表
- [ ] 可撤销已授权用户
- [ ] 有授权用户时凭据/测试按钮禁用 + tooltip 提示
- [ ] 配对请求显示剩余时间
- [ ] 配对请求/授权列表均有手动刷新按钮
- [ ] 空列表显示 Empty 占位组件

---

## (F-WEBUI-21) 扩展渠道支持 [已实现]

**用户故事**：作为扩展开发者，我希望通过扩展 manifest 注册自定义 IM 渠道，使用动态表单配置凭据。

**正常流程**（用户视角/开发者视角）：

1. 扩展通过 `extensionMeta` 声明 `credentialFields` 和 `configFields`，定义表单字段
2. 页面加载时，扩展渠道从 `getPluginStatus` 返回的非内置类型中识别
3. 扩展渠道卡片在 5 个内置渠道之后、coming_soon 渠道之前显示
4. 卡片 header 显示蓝色 "ext" 徽标（`isExtension: true`）
5. 展开后根据 `extensionMeta` 的字段 schema 动态渲染表单

**支持的字段类型**：

| 类型       | 渲染组件               | 说明                          |
| ---------- | ---------------------- | ----------------------------- |
| `text`     | `Input`                | 普通文本输入                  |
| `password` | `Input[type=password]` | 密码输入                      |
| `select`   | `Select`               | 下拉选择，options 来自 schema |
| `number`   | `InputNumber`          | 数值输入                      |
| `boolean`  | `Switch`               | 开关切换                      |

**启用前校验**：遍历 `credentialFields` 中 `required: true` 的字段，若有未填写的（空字符串或 undefined），warning toast 提示"Please fill required field: {fieldLabel}"

**特殊处理 — `ext-wecom-bot` 扩展**：当扩展类型为 `ext-wecom-bot` 时，显示橙色提示横幅说明回调 URL（本机/局域网/公网），包含 WebUI 状态（`localUrl`/`networkUrl`）。

**异常情况**：

- 扩展无配置字段：显示 `extensionMeta.description` 或 "No extra configuration required."
- 启用缺少必填字段：warning toast，不提交
- 启用/禁用失败：error toast

**验收标准**：

- [ ] 扩展渠道在内置渠道之后显示
- [ ] 卡片显示蓝色 "ext" 徽标
- [ ] 5 种字段类型正确渲染
- [ ] 必填字段校验生效
- [ ] 字段默认值从 `field.default` 初始化
- [ ] ext-wecom-bot 显示回调 URL 信息横幅

---

## 附录 A：IPC 通信链路（Channels Tab）

```
┌──────────────────────────────────────────────────────────────────────┐
│ ChannelModalContent.tsx (Channels Tab):                              │
│  渠道状态:                                                            │
│    ├─ channel.getPluginStatus.invoke() [加载全部渠道状态]             │
│    └─ channel.pluginStatusChanged.on() [实时监听状态变更]            │
│  渠道启停:                                                            │
│    ├─ channel.enablePlugin.invoke({ pluginId, config }) [启用]       │
│    ├─ channel.disablePlugin.invoke({ pluginId }) [禁用]              │
│    └─ channel.testPlugin.invoke({ pluginId, token, extraConfig? })   │
│  配对授权:                                                            │
│    ├─ channel.getPendingPairings.invoke() [加载待配对]                │
│    ├─ channel.getAuthorizedUsers.invoke() [加载已授权]                │
│    ├─ channel.approvePairing.invoke({ code }) [批准]                 │
│    ├─ channel.rejectPairing.invoke({ code }) [拒绝]                  │
│    ├─ channel.revokeUser.invoke({ userId }) [撤销]                   │
│    ├─ channel.pairingRequested.on() [实时配对请求]                    │
│    └─ channel.userAuthorized.on() [实时授权通知]                      │
│  Agent/模型:                                                          │
│    ├─ acpConversation.getAvailableAgents.invoke() [加载 Agent 列表]  │
│    ├─ channel.syncChannelSettings.invoke({ platform, agent, model }) │
│    └─ ConfigStorage.get/set('assistant.{platform}.agent/defaultModel')│
│  WeChat 登录:                                                         │
│    ├─ electronAPI.weixinLoginStart() [Electron IPC]                  │
│    ├─ electronAPI.weixinLoginOnQR/OnScanned/OnDone [IPC 事件]        │
│    └─ EventSource('/api/channel/weixin/login') [WebUI SSE]           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 附录 B：Toast 通知汇总

| 触发操作                        | Toast 类型 | i18n Key                                                                   |
| ------------------------------- | ---------- | -------------------------------------------------------------------------- |
| 渠道插件启用成功                | success    | `settings.assistant.pluginEnabled` / `settings.{platform}.pluginEnabled`   |
| 渠道插件禁用成功                | success    | `settings.assistant.pluginDisabled` / `settings.{platform}.pluginDisabled` |
| 渠道插件启用/禁用失败           | error      | `settings.assistant.enableFailed` / `settings.{platform}.enableFailed`     |
| 连接测试成功                    | success    | `settings.assistant.connectionSuccess` / `settings.lark.connectionSuccess` |
| 连接测试失败                    | error      | `settings.assistant.connectionFailed` / 后端错误信息                       |
| Token 为空测试                  | warning    | `settings.assistant.tokenRequired`                                         |
| 凭据为空（Lark/DingTalk/WeCom） | warning    | `settings.{platform}.credentialsRequired`                                  |
| 配对批准成功                    | success    | `settings.assistant.pairingApproved`                                       |
| 配对拒绝                        | info       | `settings.assistant.pairingRejected`                                       |
| 用户撤销成功                    | success    | `settings.assistant.userRevoked`                                           |
| Agent 切换成功                  | success    | `settings.assistant.agentSwitched`                                         |
| 模型切换成功                    | success    | `settings.assistant.modelSwitched`                                         |
| 模型保存失败                    | error      | `settings.assistant.modelSaveFailed`                                       |
| WeChat 登录过期                 | warning    | `settings.weixin.loginExpired`                                             |
| WeChat 登录失败                 | error      | `settings.weixin.loginError`                                               |
| WeCom 保存启用成功              | success    | `settings.wecom.pluginEnabled`                                             |

---

## 附录 C：已知局限汇总

| #   | 功能点     | 局限描述                                                                                                                                            | 来源    |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | F-WEBUI-13 | Telegram Token 锁定机制依赖 `authorizedUsers.length > 0`，如果后端授权数据丢失但 Token 实际在用中，用户可能误修改 Token 导致断连                    | R2 初稿 |
| 2   | F-WEBUI-16 | WeChat 扫码登录的 EventSource（WebUI 模式）在组件卸载时关闭，但 Electron IPC 模式中 `weixinLoginStart` 是 await Promise，组件卸载不会取消该 Promise | R2 初稿 |
| 3   | F-WEBUI-18 | Agent 列表通过 `acpConversation.getAvailableAgents.invoke()` 加载，每个渠道独立调用，无缓存共享（5 个渠道 = 5 次相同 IPC 调用）                     | R2 初稿 |
| 4   | F-WEBUI-19 | `useChannelModelSelection` 恢复保存的 provider 时最多重试 5 次，provider 被删除后静默降级为默认模型，无用户提示                                     | R2 初稿 |
| 5   | F-WEBUI-20 | 配对请求的 `expiresAt` 由后端生成，UI 显示剩余时间为 `Math.ceil((expiresAt - Date.now()) / 60000)`，无自动倒计时刷新（显示值仅在组件渲染时计算）    | R2 初稿 |
| 6   | F-WEBUI-17 | WeCom "Save & Enable" 按钮 warning 提示 "Please save Token and EncodingAESKey first" 与实际字段名 (Bot ID / Secret) 不一致                          | R2 初稿 |
| 7   | F-WEBUI-21 | 扩展渠道字段值存储在组件 state（`extensionFieldValues`），页面离开后丢失；已启用的扩展字段值不从后端恢复显示                                        | R2 初稿 |
