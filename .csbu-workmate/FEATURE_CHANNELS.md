# CSBU WorkMate 个人助手功能开发方案

> 本文档记录个人助手功能的完整开发方案，包括架构设计、插件系统、交互设计等。

---

## 1. 功能概述

### 1.1 基本信息

- **功能名称**: 个人助手功能
- **所属模块**: Agent 层、对话系统
- **涉及进程**: 主进程 (process)、Worker
- **运行环境**: GUI 模式（CSBU WorkMate 运行中）

### 1.2 功能描述

1. 与 WebUI 功能类似，用户可通过个人终端直接使用 Aion 功能
2. 主要涉及个人用户的 IM 通信工具（Telegram、Lark/Feishu 等）
3. 打造 7×24 小时个人终端助手
4. **已实现平台**: Telegram（grammY）、Lark/Feishu（官方 SDK）
5. **支持的 Agent**: Gemini、ACP、Codex

### 1.3 用户场景

```
触发: 用户通过手机 IM 工具（如 Telegram）发送消息
过程: 平台机器人接收消息 → 转发给 Aion Agent → LLM 处理
结果: 处理完成后通过相同平台推送结果给用户
```

### 1.4 参考项目

- **Clawdbot**: https://github.com/clawdbot/clawdbot
- 采纳其插件化设计、配对安全模式、Channel 抽象等设计理念

---

## 2. 整体架构

### 2.1 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                  ChannelManager (单例)                        │
│                  (统一管理所有组件)                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │PluginManager│ │SessionManager│ │PairingService│           │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│  ┌─────────────┐ ┌─────────────────────────────┐            │
│  │ActionExecutor│ │ChannelMessageService         │            │
│  └─────────────┘ └─────────────────────────────┘            │
└────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Layer 1: Plugin                          │
│                     (平台适配层)                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐                                   │
│  │ Telegram │ │  Lark    │  ... (Slack, Discord 待实现)      │
│  │  Plugin  │ │  Plugin  │                                   │
│  └────┬─────┘ └────┬─────┘                                   │
│       └────────────┴────────────┘                           │
│                    │                                         │
│  职责: 接收平台消息/回调 → 转换为统一格式 → 发送响应        │
│  不关心: Agent 类型、业务逻辑                               │
└────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Layer 2: Gateway                         │
│                     (业务逻辑层)                             │
├─────────────────────────────────────────────────────────────┤
│  ActionExecutor: 系统 Action 处理、对话路由                  │
│  SessionManager: 会话管理、用户授权                          │
│  PairingService: 配对码生成和验证                            │
│  ChannelMessageService: 消息流式处理                        │
│                                                              │
│  职责: 系统 Action 处理、对话路由、会话管理、权限控制       │
│  不关心: 平台细节、Agent 实现细节                           │
└────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Layer 3: Agent                           │
│                     (AI 处理层)                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │
│  │ Gemini  │  │   ACP   │  │  Codex  │                      │
│  │  Agent  │  │  Agent  │  │  Agent  │                      │
│  └─────────┘  └─────────┘  └─────────┘                      │
│                                                              │
│  职责: 与 AI 服务通信、管理对话上下文、返回统一响应         │
│  不关心: 消息来源平台、系统级操作                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
入站流程:
  平台消息 → Plugin(转换) → ActionExecutor(路由) → Agent(处理)

  详细流程:
  1. Plugin 接收平台消息 → toUnifiedIncomingMessage()
  2. PluginManager 调用 messageHandler → ActionExecutor.handleMessage()
  3. ActionExecutor 根据 Action 类型路由:
     - Platform Action → Plugin 自行处理
     - System Action → SystemActions 处理
     - Chat Action → ChannelMessageService → Agent

出站流程:
  Agent 响应 → ChannelEventBus → ChannelMessageService → ActionExecutor → Plugin(转换) → 平台发送

  详细流程:
  1. Agent Worker 发送消息 → ChannelEventBus.emitAgentMessage()
  2. ChannelMessageService 监听事件 → handleAgentMessage()
  3. transformMessage + composeMessage → StreamCallback
  4. ActionExecutor 调用 context.sendMessage/editMessage()
  5. Plugin 转换消息格式 → sendMessage/editMessage()
```

---

## 3. 插件系统设计

### 3.1 插件职责边界

| 插件负责                       | 插件不负责         |
| ------------------------------ | ------------------ |
| 连接平台 API                   | Agent 调度和执行   |
| 接收消息 → 转换为统一格式      | 会话管理和持久化   |
| 统一格式 → 转换为平台消息      | 用户认证和权限控制 |
| 处理平台特有命令               | 消息路由决策       |
| 流式消息更新（编辑已发送消息） |                    |

### 3.2 插件生命周期

```
created → initializing → ready → starting → running → stopping → stopped
                ↓                    ↓           ↓
              error ←←←←←←←←←←←←←←←←←←←←←←←←←←←←
```

| 状态           | 说明                 |
| -------------- | -------------------- |
| `created`      | 插件实例已创建       |
| `initializing` | 正在验证配置和初始化 |
| `ready`        | 初始化完成，等待启动 |
| `starting`     | 正在连接平台         |
| `running`      | 正常运行中           |
| `stopping`     | 正在断开连接         |
| `stopped`      | 已停止               |
| `error`        | 发生错误             |

### 3.3 插件接口（BasePlugin 抽象类）

| 接口方法               | 方向                    | 说明                       |
| ---------------------- | ----------------------- | -------------------------- |
| `initialize(config)`   | PluginManager → Plugin  | 初始化插件配置             |
| `start()`              | PluginManager → Plugin  | 启动平台连接               |
| `stop()`               | PluginManager → Plugin  | 停止平台连接               |
| `sendMessage(...)`     | ActionExecutor → Plugin | 发送消息到平台             |
| `editMessage(...)`     | ActionExecutor → Plugin | 编辑已发送消息（流式更新） |
| `getStatus()`          | PluginManager → Plugin  | 获取插件状态               |
| `getActiveUserCount()` | PluginManager → Plugin  | 获取活跃用户数             |
| `getBotInfo()`         | PluginManager → Plugin  | 获取 Bot 信息              |
| `onInitialize()`       | 子类实现                | 平台特定的初始化逻辑       |
| `onStart()`            | 子类实现                | 平台特定的启动逻辑         |
| `onStop()`             | 子类实现                | 平台特定的停止逻辑         |

### 3.4 统一消息格式

**入站消息（平台 → 系统）** - `IUnifiedIncomingMessage`

| 字段               | 说明                                    |
| ------------------ | --------------------------------------- |
| `id`               | 系统生成的唯一 ID                       |
| `platform`         | 来源平台（telegram/lark/slack/discord） |
| `chatId`           | 聊天 ID                                 |
| `user`             | 用户信息（id、username、displayName）   |
| `content`          | 消息内容（type、text、attachments）     |
| `timestamp`        | 时间戳                                  |
| `replyToMessageId` | 回复的消息 ID（可选）                   |
| `action`           | Action 信息（按钮回调时）               |
| `raw`              | 平台原始消息（可选）                    |

**出站消息（系统 → 平台）** - `IUnifiedOutgoingMessage`

| 字段               | 说明                                  |
| ------------------ | ------------------------------------- |
| `type`             | 消息类型（text/image/file/buttons）   |
| `text`             | 文本内容                              |
| `parseMode`        | 解析模式（HTML/Markdown/MarkdownV2）  |
| `buttons`          | Inline 按钮组（可选）                 |
| `keyboard`         | Reply Keyboard（可选）                |
| `replyMarkup`      | 平台特定 Markup（可选，如 Lark Card） |
| `replyToMessageId` | 回复的消息 ID（可选）                 |
| `imageUrl`         | 图片 URL（image 类型）                |
| `fileUrl`          | 文件 URL（file 类型）                 |
| `fileName`         | 文件名（file 类型）                   |
| `silent`           | 静默发送（可选）                      |

### 3.5 扩展新平台步骤

1. 创建 `src/channels/plugins/[platform]/` 目录
2. 实现 `[Platform]Plugin` 继承 `BasePlugin`
3. 实现 `[Platform]Adapter` 处理消息转换（toUnifiedIncomingMessage, to[Platform]SendParams）
4. 在 `ChannelManager` 构造函数中注册插件：`registerPlugin('platform', PlatformPlugin)`
5. 在 `types.ts` 中添加平台类型到 `PluginType`
6. 添加设置页面 UI
7. 添加 i18n 翻译
8. 实现平台特定的交互组件（如 Keyboard、Card 等）

---

## 4. 已实现平台

### 4.1 Telegram 接入

#### 技术选型

| 项目     | 选择              | 说明                    |
| -------- | ----------------- | ----------------------- |
| Bot 库   | grammY            | Clawdbot 使用，API 优雅 |
| 运行模式 | Polling（长轮询） | 自动重连机制            |

### 4.1 技术选型

| 项目     | 选择                             | 说明                    |
| -------- | -------------------------------- | ----------------------- |
| Bot 库   | grammY                           | Clawdbot 使用，API 优雅 |
| 运行模式 | Polling（开发）/ Webhook（生产） | 可配置                  |

#### Bot 配置流程

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: 创建 Bot                                            │
│   用户在 Telegram 中 @BotFather → /newbot → 获取 Token      │
├─────────────────────────────────────────────────────────────┤
│ Step 2: 配置 Token                                          │
│   CSBU WorkMate 设置页面 → 粘贴 Token → 验证 → 保存               │
├─────────────────────────────────────────────────────────────┤
│ Step 3: 启动 Bot                                            │
│   开启开关 → Bot 开始监听                                   │
├─────────────────────────────────────────────────────────────┤
│ Step 4: 用户配对（见下方安全机制）                          │
└─────────────────────────────────────────────────────────────┘
```

#### 配置项

| 配置项      | 类型              | 说明                       |
| ----------- | ----------------- | -------------------------- |
| Bot Token   | string            | 从 @BotFather 获取         |
| 运行模式    | polling / webhook | Polling 适合开发           |
| Webhook URL | string            | 仅 webhook 模式需要        |
| 配对模式    | boolean           | 是否需要配对码授权         |
| 速率限制    | number            | 每分钟最大消息数           |
| 群组 @提及  | boolean           | 群组中是否需要 @bot 才响应 |
| 默认 Agent  | gemini            | MVP 阶段固定 Gemini        |

#### 配对安全机制（采用 Clawdbot 模式）

**核心原则**: 批准操作在用户本地设备完成，而非在 Telegram 中完成

```
┌─────────────────────────────────────────────────────────────┐
│ ① 用户在 Telegram 中发起                                   │
│    用户 → @YourBot: /start 或任意消息                      │
├─────────────────────────────────────────────────────────────┤
│ ② Bot 返回配对请求                                         │
│    Bot → 用户:                                             │
│    "👋 欢迎使用 Aion 助手！                                │
│     您的配对码: ABC123                                     │
│     请在 CSBU WorkMate 中批准此配对:                              │
│     设置 → Telegram → 待批准请求 → [批准]"                │
├─────────────────────────────────────────────────────────────┤
│ ③ CSBU WorkMate 显示待批准请求                                    │
│    设置页面展示: 用户名、配对码、请求时间、[批准]/[拒绝]   │
├─────────────────────────────────────────────────────────────┤
│ ④ 用户在 CSBU WorkMate 点击 [批准]                                │
├─────────────────────────────────────────────────────────────┤
│ ⑤ Bot 通知配对成功                                         │
│    Bot → 用户: "✅ 配对成功！现在可以开始对话了"           │
└─────────────────────────────────────────────────────────────┘
```

**安全措施**

| 机制           | 说明                                 |
| -------------- | ------------------------------------ |
| 配对码认证     | 6位随机码，10分钟有效                |
| 本地批准       | 必须在 CSBU WorkMate 中批准，非 Telegram 中 |
| 用户白名单     | 仅授权用户可使用                     |
| 速率限制       | 防止滥用                             |
| Token 加密存储 | 使用 bcrypt 加密                     |

#### 消息转换规则

**入站转换（Telegram → 统一格式）**

| Telegram 消息类型  | 统一消息 content.type            |
| ------------------ | -------------------------------- |
| `message:text`     | `text` 或 `command`（以 / 开头） |
| `message:photo`    | `image`                          |
| `message:document` | `file`                           |
| `message:voice`    | `audio`                          |

**出站转换（统一格式 → Telegram）**

| 统一消息 type | Telegram API                      |
| ------------- | --------------------------------- |
| `text`        | `sendMessage`                     |
| `image`       | `sendPhoto`                       |
| `file`        | `sendDocument`                    |
| `buttons`     | `sendMessage` + `inline_keyboard` |

**特殊处理**

| 场景      | 处理方式                                     |
| --------- | -------------------------------------------- |
| 流式响应  | 使用 `editMessageText` 更新消息，添加 ▌ 光标 |
| Markdown  | 转义特殊字符，使用 `parse_mode: Markdown`    |
| @提及移除 | 清理消息中的 `@bot_username`                 |
| 群组过滤  | 检查是否包含 @提及（可配置）                 |

### 4.2 Lark/Feishu 接入

#### 技术选型

| 项目     | 选择                           | 说明           |
| -------- | ------------------------------ | -------------- |
| SDK      | @larksuiteoapi/node-sdk        | 官方 SDK       |
| 运行模式 | WebSocket 长连接               | 无需公网 URL   |
| 域       | Feishu（可配置为 Lark 国际版） | 默认使用飞书域 |

#### Bot 配置流程

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: 创建应用                                            │
│   在飞书开放平台创建企业自建应用 → 获取 App ID 和 App Secret │
├─────────────────────────────────────────────────────────────┤
│ Step 2: 配置权限                                            │
│   应用权限管理 → 开通"获取与发送单聊、群组消息"权限          │
├─────────────────────────────────────────────────────────────┤
│ Step 3: 配置事件订阅                                        │
│   事件订阅 → 订阅"接收消息"事件 → 配置加密密钥（可选）      │
├─────────────────────────────────────────────────────────────┤
│ Step 4: 配置凭证                                            │
│   CSBU WorkMate 设置页面 → 粘贴 App ID、App Secret → 验证 → 保存   │
├─────────────────────────────────────────────────────────────┤
│ Step 5: 启动 Bot                                            │
│   开启开关 → Bot 通过 WebSocket 连接开始监听               │
├─────────────────────────────────────────────────────────────┤
│ Step 6: 用户配对（见下方安全机制）                          │
└─────────────────────────────────────────────────────────────┘
```

#### 配置项

| 配置项             | 类型    | 说明                   |
| ------------------ | ------- | ---------------------- |
| App ID             | string  | 从飞书开放平台获取     |
| App Secret         | string  | 从飞书开放平台获取     |
| Encrypt Key        | string  | 事件加密密钥（可选）   |
| Verification Token | string  | 事件验证 Token（可选） |
| 配对模式           | boolean | 是否需要配对码授权     |
| 速率限制           | number  | 每分钟最大消息数       |
| 默认 Agent         | gemini  | MVP 阶段固定 Gemini    |

#### 配对安全机制

与 Telegram 相同，采用本地批准模式。配对码通过 Lark 消息发送给用户，用户在 CSBU WorkMate 中批准。

#### 消息转换规则

**入站转换（Lark → 统一格式）**

| Lark 消息类型   | 统一消息 content.type              |
| --------------- | ---------------------------------- |
| `message:text`  | `text` 或 `command`（以 / 开头）   |
| `message:image` | `photo`                            |
| `message:file`  | `document`                         |
| `message:audio` | `audio`                            |
| Card Action     | `action`（通过 extractCardAction） |

**出站转换（统一格式 → Lark）**

| 统一消息 type    | Lark API                   |
| ---------------- | -------------------------- |
| `text`           | `im.message.create`        |
| `buttons`        | `im.message.create` + Card |
| Interactive Card | 使用 Lark Card 格式        |

**特殊处理**

| 场景             | 处理方式                                               |
| ---------------- | ------------------------------------------------------ |
| 流式响应         | 使用 `im.message.update` 更新消息                      |
| HTML 转 Markdown | convertHtmlToLarkMarkdown() 转换 HTML 为 Lark Markdown |
| Card 交互        | 使用 Lark Card 格式，支持按钮、确认等                  |
| 事件去重         | 5 分钟事件缓存，防止重复处理                           |

---

## 5. 交互设计

### 5.1 设计原则

**按钮优先，命令保留**：普通用户通过按钮操作，高级用户可使用命令

### 5.2 Telegram 交互组件

| 类型                | 说明           | 适用场景           |
| ------------------- | -------------- | ------------------ |
| **Inline Keyboard** | 消息下方的按钮 | 操作确认、选项选择 |
| **Reply Keyboard**  | 替换输入法键盘 | 常用操作快捷入口   |
| **Menu Button**     | 聊天输入框左侧 | 固定功能入口       |

### 5.3 交互场景设计

**场景 1: 首次使用/配对**

```
Bot 消息:
┌─────────────────────────────────────────┐
│ 👋 欢迎使用 Aion 助手！                 │
│                                          │
│ 🔑 配对码: ABC123                       │
│ 请在 CSBU WorkMate 设置中批准此配对            │
│                                          │
│ [📖 使用指南]  [❓ 获取帮助]            │
└─────────────────────────────────────────┘
```

**场景 2: 配对成功后（Reply Keyboard 常驻）**

```
┌─────────────────────────────────────────┐
│ ... 对话内容 ...                        │
├─────────────────────────────────────────┤
│ Reply Keyboard (常驻快捷操作)           │
│ [🆕 新对话] [📊 状态] [❓ 帮助]         │
├─────────────────────────────────────────┤
│ [输入消息...]                   [发送]  │
└─────────────────────────────────────────┘
```

**场景 3: AI 回复带操作按钮**

````
Bot 消息:
┌─────────────────────────────────────────┐
│ 这是一个快速排序的实现：               │
│                                          │
│ ```python                                │
│ def quicksort(arr):                      │
│     ...                                  │
│ ```                                      │
│                                          │
│ [📋 复制] [🔄 重新生成] [💬 继续]       │
└─────────────────────────────────────────┘
````

**场景 4: 设置页面（卡片式选择）**

```
Bot 消息:
┌─────────────────────────────────────────┐
│ ⚙️ 设置                                 │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ 🤖 AI 模型                          │ │
│ │ 当前: Gemini 1.5 Pro                │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ 💬 对话风格                         │ │
│ │ 当前: 专业                          │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ [← 返回]                                │
└─────────────────────────────────────────┘
```

### 5.4 按钮与命令对照

| 命令（隐藏保留） | 按钮（用户可见） |
| ---------------- | ---------------- |
| `/start`         | 自动触发         |
| `/new`           | 🆕 新对话        |
| `/status`        | 📊 状态          |
| `/help`          | ❓ 帮助          |

---

## 6. Action 统一处理机制

### 6.1 设计目标

命令和按钮回调采用统一处理，避免重复逻辑，便于多平台扩展

### 6.2 Action 分类

| 类型            | 说明                         | 处理方                |
| --------------- | ---------------------------- | --------------------- |
| **平台 Action** | 平台特有操作（认证、配对等） | Plugin 内部处理       |
| **系统 Action** | 平台无关的系统级操作         | Gateway ActionHandler |
| **对话 Action** | 需要 Agent 处理的消息        | AgentRouter → Agent   |

```
用户输入
    │
    ├─→ 平台 Action → Plugin 自行处理（不进入 Gateway）
    │       例: Telegram 配对、Slack OAuth、Discord 邀请
    │
    ├─→ 系统 Action → Gateway ActionHandler → 统一处理
    │       例: 会话管理、设置、帮助
    │
    └─→ 对话 Action → AgentRouter → Gemini/ACP/Codex
```

### 6.3 系统 Action 列表（平台无关）

| 分类         | Action                  | 说明               |
| ------------ | ----------------------- | ------------------ |
| **会话管理** | `session.new`           | 创建新会话         |
|              | `session.status`        | 查看当前状态       |
|              | `session.list`          | 会话列表（扩展）   |
|              | `session.switch`        | 切换会话（扩展）   |
| **设置操作** | `settings.show`         | 显示设置菜单       |
|              | `settings.model.list`   | 显示模型列表       |
|              | `settings.model.select` | 选择模型           |
|              | `settings.agent.select` | 切换 Agent（扩展） |
| **帮助信息** | `help.show`             | 显示帮助           |
| **导航**     | `nav.back`              | 返回上一级         |
|              | `nav.cancel`            | 取消当前操作       |

### 6.4 平台 Action 示例（各 Plugin 自行实现）

| 平台         | Action            | 说明            |
| ------------ | ----------------- | --------------- |
| **Telegram** | `pairing.show`    | 显示配对码      |
|              | `pairing.refresh` | 刷新配对码      |
| **Slack**    | `oauth.start`     | 发起 OAuth 授权 |
|              | `oauth.callback`  | OAuth 回调处理  |
| **Discord**  | `invite.generate` | 生成邀请链接    |

> **注意**: 平台 Action 由各 Plugin 内部处理，不经过 Gateway ActionHandler

### 6.5 对话 Action 列表

| 分类         | Action            | 说明           | 路由到         |
| ------------ | ----------------- | -------------- | -------------- |
| **发送消息** | `chat.send`       | 用户发送新消息 | 当前会话 Agent |
| **消息操作** | `chat.regenerate` | 重新生成回答   | 当前会话 Agent |
|              | `chat.continue`   | 继续生成       | 当前会话 Agent |
|              | `chat.stop`       | 停止生成       | 当前会话 Agent |

### 6.6 Action 数据结构

```
UnifiedAction {
  action: string          // Action 类型
  params?: object         // 可选参数
  context: {
    platform: string      // 来源平台
    userId: string        // 用户 ID
    chatId: string        // 聊天 ID
    messageId?: string    // 触发消息 ID
    sessionId?: string    // 当前会话 ID
  }
}
```

### 6.7 按钮回调数据格式

```
格式: action:param1=value1,param2=value2

示例:
• "session.new"
• "settings.model.select:id=gemini-pro"
• "chat.regenerate:msg=abc123"
```

### 6.8 统一响应格式

```
ActionResponse {
  text?: string                    // 文本内容
  parseMode?: 'plain' | 'markdown' // 解析模式
  buttons?: ActionButton[][]       // Inline 按钮
  keyboard?: ActionButton[][]      // Reply Keyboard
  behavior: 'send' | 'edit' | 'answer'  // 响应行为
  toast?: string                   // Toast 提示
}
```

---

## 7. 会话管理

### 7.1 会话与 Agent 关系

```
Session {
  id: string              // 会话 ID
  platform: string        // 来源平台
  userId: string          // 用户 ID
  chatId: string          // 聊天 ID

  // Agent 配置
  agentType: string       // gemini / acp / codex
  agentConfig: {
    modelId?: string      // 模型 ID
  }

  // 会话状态
  status: string          // active / idle / error
  context: object         // Agent 会话上下文

  // 元数据
  createdAt: number
  lastActiveAt: number
}
```

### 7.2 MVP 阶段会话策略

| 项目     | MVP 实现               |
| -------- | ---------------------- |
| 会话模式 | 单活跃会话             |
| 新建会话 | 点击 🆕 按钮清空上下文 |
| 会话存储 | 独立于 CSBU WorkMate GUI 会话 |
| Agent    | 固定 Gemini            |
| Model    | 使用 CSBU WorkMate 默认配置   |

### 7.3 后期扩展

| 项目       | 扩展内容                               |
| ---------- | -------------------------------------- |
| 多会话     | 支持 `session.list` / `session.switch` |
| Agent 切换 | 支持 `settings.agent.select`           |
| Model 切换 | 支持动态选择模型                       |
| 会话同步   | Telegram 会话与 CSBU WorkMate 会话关联        |

---

## 8. 消息流式处理架构

### 8.1 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Worker (Gemini/ACP/Codex)              │
│                    (Agent Worker 进程)                          │
├─────────────────────────────────────────────────────────────────┤
│  发送消息事件到 IPC Bridge                                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ChannelEventBus                               │
│                    (全局事件总线 - 单例)                         │
├─────────────────────────────────────────────────────────────────┤
│  emitAgentMessage(conversationId, data)                          │
│  onAgentMessage(handler) → () => void (cleanup)                  │
│                                                                  │
│  事件类型: 'channel.agent.message'                               │
│  数据结构: IAgentMessageEvent { ...IResponseMessage, conv_id }   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ChannelMessageService                         │
│                    (消息服务 - 单例)                             │
├─────────────────────────────────────────────────────────────────┤
│  initialize() {                                                  │
│    // 服务初始化时注册全局事件监听                               │
│    channelEventBus.onAgentMessage(this.handleAgentMessage);    │
│  }                                                               │
│                                                                  │
│  handleAgentMessage(event) {                                     │
│    // 处理特殊事件: start, finish, error                         │
│    // 使用 transformMessage + composeMessage 合并消息            │
│    // 回调通知: callback(TMessage, isInsert)                     │
│  }                                                               │
│                                                                  │
│  sendMessage(sessionId, conversationId, text, callback) {        │
│    // 仅发送消息，不处理监听                                     │
│    // 通过 WorkerManage 调用 Agent Task                          │
│  }                                                               │
│                                                                  │
│  内部状态:                                                       │
│    activeStreams: Map<conversationId, IStreamState>              │
│    messageListMap: Map<conversationId, TMessage[]>               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ActionExecutor                                │
│                    (业务执行器)                                  │
├─────────────────────────────────────────────────────────────────┤
│  handleChatMessage(context, text) {                              │
│    messageService.sendMessage(                                   │
│      sessionId, conversationId, text,                             │
│      (message: TMessage, isInsert: boolean) => {                 │
│        const outgoing = convertTMessageToOutgoing(message, platform); │
│        if (isInsert) context.sendMessage(outgoing);              │
│        else context.editMessage(msgId, outgoing);                │
│      }                                                           │
│    );                                                            │
│  }                                                               │
│                                                                  │
│  convertTMessageToOutgoing(message, platform) {                  │
│    // TMessage → IUnifiedOutgoingMessage                         │
│    // 根据平台格式化文本（HTML/Markdown）                        │
│    // text → 显示内容                                            │
│    // tips → 带图标提示                                          │
│    // tool_group → 工具状态列表                                  │
│  }                                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Plugin (Telegram/Lark)                       │
│                    (平台插件)                                    │
├─────────────────────────────────────────────────────────────────┤
│  sendMessage(chatId, message: IUnifiedOutgoingMessage)           │
│  editMessage(chatId, messageId, message: IUnifiedOutgoingMessage)│
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 事件类型处理

| 事件类型            | 来源           | 处理方式                                     |
| ------------------- | -------------- | -------------------------------------------- |
| `start`             | Agent 开始响应 | 重置消息列表                                 |
| `content`           | 流式文本块     | transformMessage → composeMessage → callback |
| `tool_group`        | 工具调用状态   | 合并到现有 tool_group 或新增                 |
| `finish`/`finished` | 响应完成       | resolve promise，清理状态                    |
| `error`             | 发生错误       | reject promise，清理状态                     |
| `thought`           | 思考过程       | 忽略（transformMessage 返回 undefined）      |

### 8.3 消息合并策略 (composeMessage)

| 消息类型     | 合并规则                             |
| ------------ | ------------------------------------ |
| `text`       | 同 msg_id 累加内容，不同 msg_id 新增 |
| `tool_group` | 按 callId 合并工具状态更新           |
| `tool_call`  | 按 callId 合并                       |
| `tips`       | 直接新增                             |

### 8.4 消息回调参数

```typescript
type StreamCallback = (chunk: TMessage, isInsert: boolean) => void;

// isInsert = true:  新消息，调用 sendMessage 发送新消息
// isInsert = false: 更新消息，调用 editMessage 编辑现有消息
```

### 8.5 节流控制

| 参数               | 值     | 说明                      |
| ------------------ | ------ | ------------------------- |
| UPDATE_THROTTLE_MS | 500ms  | 消息编辑最小间隔          |
| 发送新消息         | 无限制 | isInsert=true 时立即发送  |
| 编辑消息           | 节流   | isInsert=false 时应用节流 |

- [ ] 使用现有 Context: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] 需要新增 Context: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] 仅组件内部状态 (useState/useReducer)
- [ ] 需要持久化存储

### 8.6 关键设计原则

1. **事件监听与消息发送分离**
   - 事件监听在服务初始化时完成（`initialize()`）
   - `sendMessage()` 仅负责发送消息，不处理监听

2. **全局事件总线解耦**
   - `ChannelMessageService` 不直接与 Agent Task 交互
   - 通过 `ChannelEventBus` 全局事件总线解耦

3. **统一消息格式**
   - 内部使用 `TMessage` 统一消息格式
   - 输出时转换为 `IUnifiedOutgoingMessage`

---

## 9. Agent 接口规范

### 8.1 每个 Agent 需实现的能力

| 能力            | 说明               |
| --------------- | ------------------ |
| `sendMessage`   | 发送消息并获取响应 |
| `streamMessage` | 流式发送消息       |
| `regenerate`    | 重新生成上一条回复 |
| `continue`      | 继续生成           |
| `stop`          | 停止当前生成       |
| `getContext`    | 获取会话上下文     |
| `clearContext`  | 清空会话上下文     |

### 8.2 Agent 响应格式

```
AgentResponse {
  type: 'text' | 'stream_start' | 'stream_chunk' | 'stream_end' | 'error'
  text?: string
  chunk?: string
  error?: { code: string, message: string }
  metadata?: {
    model?: string
    tokensUsed?: number
    duration?: number
  }
  suggestedActions?: ActionButton[]
}
```

---

## 9. 文件结构（实际实现）

```
src/channels/
├── core/                          # 核心模块
│   ├── ChannelManager.ts          # 统一管理器（单例）
│   └── SessionManager.ts          # 会话管理
│
├── gateway/                       # 网关层
│   ├── PluginManager.ts           # 插件生命周期管理
│   └── ActionExecutor.ts          # Action 执行器（路由、消息处理）
│
├── actions/                       # Action 处理（平台无关）
│   ├── types.ts                   # Action/Response 类型定义
│   ├── SystemActions.ts          # 系统 Action（会话、设置、帮助）
│   ├── ChatActions.ts            # 对话 Action（发送、重新生成等）
│   └── PlatformActions.ts        # 平台 Action（配对等）
│
├── agent/                         # Agent 集成
│   ├── ChannelEventBus.ts        # 全局事件总线
│   └── ChannelMessageService.ts  # 消息流式处理服务
│
├── pairing/                       # 配对服务
│   └── PairingService.ts         # 配对码生成和验证（平台无关）
│
├── plugins/                       # 插件目录
│   ├── BasePlugin.ts              # 插件抽象基类
│   ├── telegram/
│   │   ├── TelegramPlugin.ts      # Telegram 插件
│   │   ├── TelegramAdapter.ts     # 消息适配器
│   │   └── TelegramKeyboards.ts   # 键盘组件
│   └── lark/
│       ├── LarkPlugin.ts          # Lark 插件
│       ├── LarkAdapter.ts         # 消息适配器
│       └── LarkCards.ts           # Card 组件
│
├── utils/                         # 工具函数
│   └── credentialCrypto.ts        # 凭证加密
│
└── types.ts                       # 类型定义
```

---

## 10. 数据库设计

| 表名                      | 用途                      |
| ------------------------- | ------------------------- |
| `assistant_plugins`       | 插件配置（Token、模式等） |
| `assistant_users`         | 已授权用户列表            |
| `assistant_sessions`      | 用户会话关联              |
| `assistant_pairing_codes` | 待批准的配对请求          |

---

## 11. 外部依赖

| 依赖包                    | 用途                  | 说明                    |
| ------------------------- | --------------------- | ----------------------- |
| `grammy`                  | Telegram Bot          | Clawdbot 使用，API 优雅 |
| `@larksuiteoapi/node-sdk` | Lark/Feishu Bot       | 官方 SDK                |
| `@slack/bolt`             | Slack Bot（待实现）   | 官方 SDK                |
| `discord.js`              | Discord Bot（待实现） | 官方 SDK                |

---

## 12. 实现状态

### 12.1 已实现功能

#### Telegram

- [x] Bot Token 配置和验证
- [x] Bot 启动/停止控制（Polling 模式，自动重连）
- [x] 配对码生成和本地批准流程
- [x] 已授权用户管理
- [x] 按钮交互（Reply Keyboard + Inline Keyboard）
- [x] 与 Gemini/ACP/Codex Agent 对话
- [x] 新建会话功能
- [x] 流式消息响应（editMessage 更新）
- [x] 工具确认交互
- [x] 错误恢复机制

#### Lark/Feishu

- [x] App ID/Secret 配置和验证
- [x] Bot 启动/停止控制（WebSocket 长连接）
- [x] 配对码生成和本地批准流程
- [x] 已授权用户管理
- [x] Card 交互（按钮、确认等）
- [x] 与 Gemini/ACP/Codex Agent 对话
- [x] 新建会话功能
- [x] 流式消息响应（updateMessage 更新）
- [x] 工具确认交互（Card 格式）
- [x] 事件去重机制（5 分钟缓存）
- [x] HTML 转 Lark Markdown

#### 核心功能

- [x] ChannelManager 统一管理
- [x] PluginManager 插件生命周期管理
- [x] SessionManager 会话管理
- [x] PairingService 配对服务
- [x] ActionExecutor Action 路由和执行
- [x] ChannelMessageService 消息流式处理
- [x] ChannelEventBus 全局事件总线
- [x] 凭证加密存储
- [x] 多平台统一消息格式

### 12.2 安全验收

- [x] 配对码 10 分钟过期
- [x] 必须在 CSBU WorkMate 本地批准
- [x] 未授权用户无法使用
- [x] Token/凭证加密存储
- [ ] 速率限制（待实现）

### 12.3 兼容性

- [x] macOS 正常运行
- [x] Windows 正常运行
- [x] 多语言支持（i18n）

---

## 13. 后期扩展路线

| 阶段        | 内容                        | 状态        |
| ----------- | --------------------------- | ----------- |
| **Phase 1** | Telegram + Lark 接入        | ✅ 已完成   |
| **Phase 2** | 多会话管理、会话切换        | 🔄 待实现   |
| **Phase 3** | Agent 切换（已支持，需 UI） | 🔄 部分完成 |
| **Phase 4** | Model 动态切换              | 🔄 待实现   |
| **Phase 5** | Slack 平台接入              | 🔄 待实现   |
| **Phase 6** | Discord 平台接入            | 🔄 待实现   |
| **Phase 7** | 速率限制                    | 🔄 待实现   |
| **Phase 8** | 会话与 CSBU WorkMate 同步          | 🔄 待实现   |
| **Phase 9** | Headless 独立服务模式       | 🔄 待实现   |

---

## 模板维护

- **创建日期**: 2025-01-27
- **最后更新**: 2026-02-03
- **适用版本**: CSBU WorkMate v1.7.8+
- **维护者**: 项目团队

---

## 附录：关键实现细节

### A.1 ChannelManager 初始化流程

```typescript
1. ChannelManager.getInstance().initialize()
   ├─ 初始化 PluginManager
   ├─ 初始化 SessionManager
   ├─ 初始化 PairingService
   ├─ 初始化 ActionExecutor
   └─ 初始化 ChannelMessageService

2. 加载数据库中的插件配置
3. 为每个启用的插件调用 initialize() 和 start()
```

### A.2 消息处理流程

```typescript
1. Plugin 接收平台消息
   └─ toUnifiedIncomingMessage() 转换

2. PluginManager 调用 messageHandler
   └─ ActionExecutor.handleMessage()

3. ActionExecutor 路由 Action
   ├─ Platform Action → PlatformActions
   ├─ System Action → SystemActions
   └─ Chat Action → ChannelMessageService

4. ChannelMessageService.sendMessage()
   └─ 通过 WorkerManage 调用 Agent Task

5. Agent 响应 → ChannelEventBus
   └─ ChannelMessageService.handleAgentMessage()
      └─ StreamCallback → ActionExecutor
         └─ Plugin.sendMessage/editMessage()
```

### A.3 平台特定实现

**Telegram**

- 使用 grammY 库
- Polling 模式，支持自动重连
- Inline Keyboard + Reply Keyboard
- HTML 格式消息

**Lark/Feishu**

- 使用官方 Node SDK
- WebSocket 长连接模式
- Card 格式交互
- Lark Markdown 格式消息
- 事件去重机制（5 分钟缓存）
