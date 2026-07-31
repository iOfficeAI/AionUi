# 飞书 (Lark) 接入方案

> 本文档记录飞书平台接入的完整开发方案，基于现有 Telegram 插件架构进行扩展。

---

## 1. 功能概述

### 1.1 基本信息

- **功能名称**: 飞书机器人接入
- **所属模块**: Channel Plugin 层
- **涉及进程**: 主进程 (process)
- **运行环境**: GUI 模式（CSBU WorkMate 运行中）
- **依赖**: 现有 Channel 架构、PairingService、SessionManager

### 1.2 功能描述

1. 复用现有 Channel 插件架构，新增飞书平台支持
2. 用户可通过飞书机器人与 CSBU WorkMate 进行对话
3. 支持 Gemini、Claude、Codex 等多 Agent 切换
4. 与 Telegram 功能完全对齐

### 1.3 用户场景

```
触发: 用户在飞书中 @AionBot 或私聊发送消息
过程: 飞书机器人接收消息 → 转发给 Aion Agent → LLM 处理
结果: 处理完成后通过飞书消息卡片推送结果给用户
```

### 1.4 参考资源

- **飞书开放平台**: https://open.feishu.cn/
- **Node SDK**: https://github.com/larksuite/node-sdk
- **现有实现**: `src/channels/plugins/telegram/`

---

## 2. 技术选型

### 2.1 平台对比

| 项目         | Telegram                         | 飞书                       |
| ------------ | -------------------------------- | -------------------------- |
| **Bot 库**   | grammY                           | @larksuiteoapi/node-sdk    |
| **运行模式** | Polling / Webhook                | WebSocket 长连接 / Webhook |
| **认证方式** | Bot Token                        | App ID + App Secret        |
| **交互组件** | Inline Keyboard + Reply Keyboard | 消息卡片 (Message Card)    |
| **消息格式** | Markdown / HTML                  | 富文本 / 消息卡片 JSON     |
| **流式更新** | editMessageText                  | PATCH /im/v1/messages/:id  |

### 2.2 技术选择

| 项目     | 选择                    | 说明                       |
| -------- | ----------------------- | -------------------------- |
| SDK      | @larksuiteoapi/node-sdk | 官方 Node.js SDK           |
| 运行模式 | WebSocket (优先)        | 无需公网地址，适合桌面应用 |
| 消息格式 | 消息卡片                | 支持富文本和交互按钮       |

---

## 3. 配置流程

### 3.1 飞书应用创建

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: 创建应用                                            │
│   飞书开放平台 → 创建企业自建应用 → 获取 App ID/Secret      │
├─────────────────────────────────────────────────────────────┤
│ Step 2: 开启机器人能力                                      │
│   应用能力 → 机器人 → 开启                                  │
├─────────────────────────────────────────────────────────────┤
│ Step 3: 配置权限                                            │
│   权限管理 → 添加以下权限:                                  │
│   • im:message (获取与发送单聊、群组消息)                   │
│   • im:message.group_at_msg (接收群聊@机器人消息)           │
│   • im:chat (获取群组信息)                                  │
│   • contact:user.id:readonly (获取用户 ID)                  │
├─────────────────────────────────────────────────────────────┤
│ Step 4: 发布应用                                            │
│   版本管理与发布 → 创建版本 → 申请发布                      │
├─────────────────────────────────────────────────────────────┤
│ Step 5: 配置 CSBU WorkMate                                         │
│   设置 → Channels → 飞书 → 粘贴 App ID/Secret → 启动       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 配置项

| 配置项      | 类型                 | 说明                | 必填 |
| ----------- | -------------------- | ------------------- | :--: |
| App ID      | string               | 飞书应用 ID         |  ✅  |
| App Secret  | string               | 飞书应用密钥        |  ✅  |
| 运行模式    | websocket / webhook  | 事件接收模式        |  ✅  |
| Webhook URL | string               | 仅 webhook 模式需要 |  ❌  |
| 配对模式    | boolean              | 是否需要配对码授权  |  ✅  |
| 速率限制    | number               | 每分钟最大消息数    |  ❌  |
| 默认 Agent  | gemini / acp / codex | 默认使用的 Agent    |  ✅  |

---

## 4. 配对安全机制

### 4.1 流程设计（与 Telegram 一致）

```
┌─────────────────────────────────────────────────────────────┐
│ ① 用户在飞书中发起                                         │
│    用户 → @AionBot: 任意消息                               │
├─────────────────────────────────────────────────────────────┤
│ ② Bot 返回配对请求（消息卡片）                              │
│    ┌────────────────────────────────────────┐              │
│    │ 👋 欢迎使用 Aion 助手！                │              │
│    │                                        │              │
│    │ 🔑 配对码: ABC123                      │              │
│    │ 请在 CSBU WorkMate 中批准此配对               │              │
│    │                                        │              │
│    │ [📖 使用指南]  [🔄 刷新状态]           │              │
│    └────────────────────────────────────────┘              │
├─────────────────────────────────────────────────────────────┤
│ ③ CSBU WorkMate 显示待批准请求                                    │
│    设置页面展示: 用户名、配对码、请求时间、[批准]/[拒绝]   │
├─────────────────────────────────────────────────────────────┤
│ ④ 用户在 CSBU WorkMate 点击 [批准]                                │
├─────────────────────────────────────────────────────────────┤
│ ⑤ Bot 推送配对成功消息                                     │
│    Bot → 用户: "✅ 配对成功！现在可以开始对话了"           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 安全措施

| 机制         | 说明                           |
| ------------ | ------------------------------ |
| 配对码认证   | 6位随机码，10分钟有效          |
| 本地批准     | 必须在 CSBU WorkMate 中批准，非飞书中 |
| 用户白名单   | 仅授权用户可使用               |
| 速率限制     | 防止滥用                       |
| 凭证加密存储 | 使用加密存储 App Secret        |

---

## 5. 消息转换规则

### 5.1 入站转换（飞书 → 统一格式）

| 飞书事件类型                    | 统一消息 content.type |
| ------------------------------- | --------------------- |
| `im.message.receive_v1` (text)  | `text`                |
| `im.message.receive_v1` (image) | `image`               |
| `im.message.receive_v1` (file)  | `file`                |
| `im.message.receive_v1` (audio) | `audio`               |
| `card.action.trigger`           | `action`              |

### 5.2 出站转换（统一格式 → 飞书）

| 统一消息 type | 飞书 API                  | content_type |
| ------------- | ------------------------- | ------------ |
| `text`        | POST /im/v1/messages      | text         |
| `image`       | POST /im/v1/messages      | image        |
| `buttons`     | POST /im/v1/messages      | interactive  |
| 流式更新      | PATCH /im/v1/messages/:id | -            |

### 5.3 消息卡片结构

```json
{
  "config": {
    "wide_screen_mode": true
  },
  "header": {
    "title": {
      "tag": "plain_text",
      "content": "Aion 助手"
    }
  },
  "elements": [
    {
      "tag": "markdown",
      "content": "消息内容..."
    },
    {
      "tag": "action",
      "actions": [
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "🆕 新对话" },
          "type": "primary",
          "value": { "action": "session.new" }
        }
      ]
    }
  ]
}
```

---

## 6. 交互设计

### 6.1 组件映射

| 场景             | Telegram             | 飞书               |
| ---------------- | -------------------- | ------------------ |
| **常驻快捷操作** | Reply Keyboard       | 消息卡片底部按钮组 |
| **消息操作按钮** | Inline Keyboard      | 消息卡片交互按钮   |
| **配对请求**     | 文本 + 按钮          | 消息卡片           |
| **AI 回复**      | Markdown + 按钮      | 富文本/卡片 + 按钮 |
| **设置菜单**     | 多级 Inline Keyboard | 消息卡片           |

### 6.2 交互场景

**场景 1: 配对成功后的主菜单**

```
┌─────────────────────────────────────────────────────────────┐
│                    消息卡片 (Message Card)                   │
├─────────────────────────────────────────────────────────────┤
│  ✅ 配对成功！现在可以开始对话了                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [🆕 新对话]  [🔄 Agent]  [📊 状态]  [❓ 帮助]       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**场景 2: AI 回复带操作按钮**

````
┌─────────────────────────────────────────────────────────────┐
│                    消息卡片 (Message Card)                   │
├─────────────────────────────────────────────────────────────┤
│  这是一个快速排序的实现：                                   │
│                                                             │
│  ```python                                                  │
│  def quicksort(arr):                                        │
│      if len(arr) <= 1:                                      │
│          return arr                                         │
│      ...                                                    │
│  ```                                                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [📋 复制]  [🔄 重新生成]  [💬 继续]                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
````

**场景 3: Agent 切换**

```
┌─────────────────────────────────────────────────────────────┐
│                    消息卡片 (Message Card)                   │
├─────────────────────────────────────────────────────────────┤
│  🔄 切换 Agent                                              │
│                                                             │
│  选择一个 AI Agent：                                        │
│  当前: 🤖 Gemini                                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [✓ 🤖 Gemini]  [🧠 Claude]  [⚡ Codex]              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 文件结构

```
src/channels/
├── plugins/
│   ├── telegram/              # 现有 Telegram 插件
│   │   ├── TelegramPlugin.ts
│   │   ├── TelegramAdapter.ts
│   │   ├── TelegramKeyboards.ts
│   │   └── index.ts
│   │
│   └── lark/                  # 新增飞书插件
│       ├── LarkPlugin.ts      # 飞书插件主类
│       ├── LarkAdapter.ts     # 消息格式转换
│       ├── LarkCards.ts       # 消息卡片模板
│       └── index.ts
│
├── types.ts                   # 需要新增 'lark' 到 PluginType
└── ...
```

---

## 8. 接口设计

### 8.1 LarkPlugin 类

```typescript
class LarkPlugin extends BasePlugin {
  // 生命周期
  async initialize(config: LarkPluginConfig): Promise<void>;
  async start(): Promise<void>;
  async stop(): Promise<void>;

  // 消息处理
  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string>;
  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void>;

  // 事件处理
  private handleMessageEvent(event: LarkMessageEvent): void;
  private handleCardAction(action: LarkCardAction): void;

  // Token 管理
  private async refreshAccessToken(): Promise<void>;
}
```

### 8.2 配置接口

```typescript
interface LarkPluginConfig {
  appId: string;
  appSecret: string;
  mode: 'websocket' | 'webhook';
  webhookUrl?: string;
  encryptKey?: string; // 事件加密密钥
  verificationToken?: string; // 事件验证令牌
}
```

---

## 9. 飞书特有注意事项

| 项目             | 说明                                       |
| ---------------- | ------------------------------------------ |
| **应用类型**     | 建议使用企业自建应用，个人开发者有功能限制 |
| **权限审核**     | 部分权限需要管理员审批                     |
| **消息卡片限制** | 卡片 JSON 最大 30KB，需要分片处理长消息    |
| **Token 刷新**   | Access Token 有效期 2 小时，需要自动刷新   |
| **事件订阅**     | WebSocket 模式无需公网地址，更适合桌面应用 |
| **@提及**        | 群聊中需要 @机器人 才会收到消息            |

---

## 10. 开发计划

### Phase 1: 基础连接 (预计 2-3 天)

- [ ] 创建 LarkPlugin 基类
- [ ] 实现 WebSocket 事件接收
- [ ] 实现 Access Token 自动刷新
- [ ] 基础消息收发功能

### Phase 2: 安全认证 (预计 1-2 天)

- [ ] 复用 PairingService
- [ ] 配对流程消息卡片
- [ ] 设置页面 UI 适配

### Phase 3: 交互完善 (预计 2-3 天)

- [ ] 消息卡片模板系统
- [ ] 按钮回调处理
- [ ] Agent 切换功能
- [ ] 流式响应支持

### Phase 4: 优化 (预计 1-2 天)

- [ ] 长消息分片处理
- [ ] 错误处理完善
- [ ] 多语言支持
- [ ] 日志与监控

---

## 11. 功能对齐清单

| 功能          | Telegram | 飞书 | 复用组件              |
| ------------- | :------: | :--: | --------------------- |
| Bot 配置验证  |    ✅    |  🔲  | -                     |
| Bot 启动/停止 |    ✅    |  🔲  | ChannelManager        |
| 配对码认证    |    ✅    |  🔲  | PairingService        |
| 本地批准流程  |    ✅    |  🔲  | 现有 UI               |
| 用户白名单    |    ✅    |  🔲  | Database              |
| 按钮交互      |    ✅    |  🔲  | SystemActions         |
| 流式响应      |    ✅    |  🔲  | ChannelMessageService |
| Agent 切换    |    ✅    |  🔲  | SystemActions         |
| 新建会话      |    ✅    |  🔲  | SessionManager        |
| 速率限制      |    ✅    |  🔲  | RateLimiter           |

---

## 12. 验收标准

### 12.1 功能验收

- [ ] 飞书应用凭证配置和验证
- [ ] Bot 启动/停止控制
- [ ] 配对码生成和本地批准流程
- [ ] 已授权用户管理
- [ ] 消息卡片交互
- [ ] 与 Gemini/Claude Agent 对话
- [ ] Agent 切换功能
- [ ] 新建会话功能
- [ ] 流式消息响应

### 12.2 安全验收

- [ ] 配对码 10 分钟过期
- [ ] 必须在 CSBU WorkMate 本地批准
- [ ] 未授权用户无法使用
- [ ] App Secret 加密存储
- [ ] 速率限制生效

### 12.3 兼容性

- [ ] macOS 正常运行
- [ ] Windows 正常运行
- [ ] 多语言支持

---

## 模板维护

- **创建日期**: 2026-01-30
- **最后更新**: 2026-01-30
- **适用版本**: CSBU WorkMate v0.x+
- **维护者**: 项目团队
