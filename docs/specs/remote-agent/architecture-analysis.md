# Remote Agent — 现有架构分析

> 日期：2026-03-24
> 目的：梳理 AionUi 现有 Agent 架构和代码风格，为远程 Agent 实现提供设计依据

## 1. Agent 管理层

### 1.1 类型体系

```
src/process/task/
├── agentTypes.ts             AgentType 联合类型 + AgentStatus
├── IAgentManager.ts          统一管理接口
├── IAgentFactory.ts          工厂模式（register/create）
├── IAgentEventEmitter.ts     事件发射器接口
├── IpcAgentEventEmitter.ts   基于 IPC 的事件发射器

├── BaseAgentManager.ts       基类（继承 ForkTask）
├── AcpAgentManager.ts        Acp Agent 通用管理器
├── OpenClawAgentManager.ts   OpenClaw Agent 管理器
├── CodexAgentManager.ts      Codex Agent 管理器
├── GeminiAgentManager.ts     Gemini Agent 管理器
└── NanoBotAgentManager.ts    NanoBot Agent 管理器
```

**AgentType**（`agentTypes.ts:9`）：

```typescript
type AgentType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot';
```

**IAgentManager**（`IAgentManager.ts:12-26`）：

```typescript
interface IAgentManager {
  readonly type: AgentType;
  readonly status: AgentStatus | undefined; // 'pending' | 'running' | 'finished'
  readonly workspace: string;
  readonly conversation_id: string;

  sendMessage(data: unknown): Promise<void>;
  stop(): Promise<void>;
  confirm(msgId: string, callId: string, data: unknown): void;
  getConfirmations(): IConfirmation[];
  kill(): void;
}
```

**IAgentFactory**（`IAgentFactory.ts:15-21`）：

```typescript
interface IAgentFactory {
  register(type: AgentType, creator: AgentCreator): void;
  create(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager;
}
```

### 1.2 BaseAgentManager

`BaseAgentManager` 继承 `ForkTask`（通过 `child_process.fork` 派生 Worker 子进程），是所有 Manager 的基类。

关键职责：

- 确认/权限管理（`addConfirmation`, `confirm`, `getConfirmations`）
- YOLO 模式（自动审批）
- Worker 进程通信（`postMessagePromise`）

**重要发现**：`OpenClawAgentManager` 虽然继承了 `BaseAgentManager`（因此也继承了 `ForkTask`），但**实际上没有使用 ForkTask 的进程派生能力**。它在主进程中直接实例化 `OpenClawAgent`，通过 WebSocket 通信。`ForkTask` 的 `start()` / `postMessagePromise()` 等方法在 `OpenClawAgentManager` 中被完全覆盖。

这意味着 `BaseAgentManager` 中真正被 `OpenClawAgentManager` 复用的仅有：

- `confirmations` 数组管理
- `addConfirmation()` / `confirm()` / `getConfirmations()` 方法
- `yoloMode` 逻辑
- `IAgentEventEmitter` 实例

## 2. OpenClaw 实现层

### 2.1 文件结构

```
src/process/agent/openclaw/
├── index.ts                       OpenClawAgent 主类（850 行）+ 导出
├── OpenClawGatewayConnection.ts   WebSocket 连接层（514 行）
├── OpenClawGatewayManager.ts      本地 Gateway 进程管理（339 行）
├── openclawConfig.ts              本地 ~/.openclaw/ 配置读取
├── deviceIdentity.ts              设备身份（Ed25519 密钥对）
├── deviceAuthStore.ts             设备 Token 持久化
└── types.ts                       OpenClaw Gateway 协议类型定义（310 行）
```

### 2.2 三层架构

```
┌──────────────────────────────────────────────────┐
│ OpenClawAgentManager (task/OpenClawAgentManager) │  ← IAgentManager 接口
│   - 连接 IPC Bridge 和 UI                        │
│   - 消息持久化（DB）                             │
│   - 权限确认管理                                 │
└──────────────────────┬───────────────────────────┘
                       │ 持有
┌──────────────────────▼──────────────────────────┐
│ OpenClawAgent (agent/openclaw/index.ts)         │  ← 业务逻辑层
│   - 事件路由（chat/agent/approval）             │
│   - AcpAdapter 消息格式转换                     │
│   - Session 管理（resolve/reset/resume）        │
│   - 流式文本拼接和 fallback 策略                │
└──────────────────────┬──────────────────────────┘
                       │ 持有
┌──────────────────────▼──────────────────────────┐
│ OpenClawGatewayConnection (WS 传输层)           │  ← 协议层
│   - WebSocket 连接管理                          │
│   - JSON 帧解析（req/res/event）                │
│   - Challenge-Response 认证                     │
│   - 重连、心跳、Pending Request 管理            │
└──────────────────────┬──────────────────────────┘
                       │ 可选
┌──────────────────────▼──────────────────────────┐
│ OpenClawGatewayManager (本地进程管理)           │  ← 仅本地模式
│   - spawn `openclaw gateway` 子进程             │
│   - 端口管理、健康检测、优雅关闭                │
└─────────────────────────────────────────────────┘
```

### 2.3 消息流

```
Gateway WS 消息
  → OpenClawGatewayConnection.handleMessage()
    → EventFrame 分发到 opts.onEvent()
      → OpenClawAgent.handleEvent()
        ├── 'chat' / 'chat.event'  → handleChatEvent()  → 流式文本
        ├── 'agent' / 'agent.event' → handleAgentEvent() → 思考块/工具调用
        └── 'exec.approval.request' → handleApprovalRequest() → 权限请求
          → AcpAdapter.convertSessionUpdate()  ← 转换为统一 ACP 格式
          → onStreamEvent / onSignalEvent 回调
            → OpenClawAgentManager
              → ipcBridge.conversation.responseStream.emit()
              → channelEventBus.emitAgentMessage()  ← Telegram/Lark
                → Renderer (UI)
```

### 2.4 认证流程

当前 OpenClaw 认证使用 **设备身份 + Challenge-Response**：

```
1. Client 连接 WS
2. Gateway 发送 EVENT connect.challenge {nonce, ts}
3. Client 用本地 Ed25519 私钥签名 {deviceId, nonce, token, ...}
4. Client 发送 REQ connect {auth, device, caps, ...}
5. Gateway 验证后返回 RES HelloOk {protocol, server, features, auth.deviceToken}
6. Client 缓存 deviceToken 用于后续重连
```

关键代码位于 `OpenClawGatewayConnection.sendConnect()`（第 237-341 行）。

### 2.5 本地绑定点

以下代码假设 OpenClaw 运行在本地：

| 位置                        | 绑定内容                                                | 远程化影响                                      |
| --------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `OpenClawAgent.start()`     | 先检测本地端口，再决定是否启动进程                      | 远程模式应跳过                                  |
| `OpenClawGatewayManager`    | `spawn('openclaw', ['gateway', ...])`                   | 远程模式不需要                                  |
| `openclawConfig.ts`         | 读取 `~/.openclaw/config.json` 获取 port/token/password | 远程模式用用户输入的 URL/Token                  |
| `OpenClawGatewayConnection` | URL 默认 `ws://127.0.0.1:18789`                         | 远程模式需支持 `wss://`                         |
| `deviceIdentity.ts`         | 本地生成/存储 Ed25519 密钥对                            | 远程模式可能不需要设备认证（Bearer Token 即可） |

### 2.6 已有的 `useExternalGateway` 路径

`OpenClawAgent.start()` 中已有分支逻辑：

```typescript
const useExternal = gatewayConfig.useExternalGateway ?? false;
if (!useExternal) {
  // 检测端口 → 启动本地进程
} else {
  // 跳过进程管理，直接连接
}
```

设 `useExternalGateway = true` 后，`OpenClawGatewayManager` 不会被创建，直接进入 `OpenClawGatewayConnection` 连接逻辑。这条路径天然适用于远程场景。

## 3. 代码风格和约定

### 3.1 Agent Manager 模式

从现有 5 个 Manager 实现中总结的通用模式：

```typescript
class XxxAgentManager extends BaseAgentManager<XxxData> {
  constructor(data: XxxData) {
    super('agent-type', data, new IpcAgentEventEmitter());
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace ?? '';
    // 初始化 Agent 实例
  }

  async sendMessage(data: { content: string; ... }) {
    // 1. 设置 cronBusyGuard
    // 2. 保存用户消息到 DB
    // 3. 调用底层 Agent 发送
    // 4. 异常处理 + 状态回退
  }

  async confirm(id, callId, data) {
    super.confirm(id, callId, data);  // 移除 confirmation
    // 转发给底层 Agent
  }

  stop() { /* 清理资源 */ }
  kill() { /* 强制清理 */ }
}
```

### 3.2 事件发射模式

所有 Agent 通过两个 IPC 通道输出消息：

```typescript
// 专用通道（历史兼容）
ipcBridge.openclawConversation.responseStream.emit(msg);

// 统一通道（通用 UI 渲染）
ipcBridge.conversation.responseStream.emit(msg);

// Channel 事件总线（Telegram/Lark 等外部渠道）
channelEventBus.emitAgentMessage(conversation_id, msg);
```

### 3.3 消息类型 (`IResponseMessage`)

所有 Agent 输出统一为 `IResponseMessage`：

```typescript
interface IResponseMessage {
  type: string; // 'content' | 'error' | 'agent_status' | 'acp_tool_call' | 'acp_permission' | 'finish' | ...
  conversation_id: string;
  msg_id: string;
  data: unknown;
}
```

### 3.4 数据库约束

`conversations` 表的 `type` 字段有 CHECK 约束（`schema.ts`），限定为现有 5 种类型。新增 Agent 类型需要 DB 迁移。

### 3.5 命名约定

- Manager 文件：PascalCase（`OpenClawAgentManager.ts`）
- Agent 实现目录：kebab-case 或 camelCase（`src/process/agent/openclaw/`）
- 类型文件：`types.ts`
- 接口前缀 `I`（`IAgentManager`, `IAgentFactory`）
- 回调字段：`onXxx`（`onStreamEvent`, `onSignalEvent`）
- 私有方法：无前缀（TypeScript `private` 关键字）

## 4. 远程化的关键设计决策

### 4.1 继承 vs 组合

**现状**：`BaseAgentManager` 继承 `ForkTask`，但 `OpenClawAgentManager` 并不真正使用 `ForkTask` 的能力。

**选项 A — 继续继承 BaseAgentManager**：

- 复用确认管理和 yoloMode 逻辑
- `ForkTask` 的构造函数会执行但不会真正 fork（与 OpenClaw 现有做法一致）
- 改动最小，与现有代码风格一致

**选项 B — 直接实现 IAgentManager**：

- 不继承 `ForkTask`，更干净
- 需要自行管理确认逻辑（可提取为 mixin 或 helper）
- 打破现有"所有 Manager 都继承 BaseAgentManager"的模式

**建议**：选项 A。与 `OpenClawAgentManager` 保持一致的处理方式，避免引入新模式。

### 4.2 复用 OpenClawAgent vs 新建 RemoteAgent

**现状**：`OpenClawAgent`（`index.ts`，850 行）中 OpenClaw 特有逻辑占比：

| 逻辑           | 行数 | 通用性                                |
| -------------- | ---- | ------------------------------------- |
| WS 连接 + 重连 | ~50  | 通用（通过 Connection 类）            |
| Session 管理   | ~40  | OpenClaw 特有（resolve/reset）        |
| 事件路由       | ~30  | OpenClaw 特有（event 名称）           |
| Chat 事件处理  | ~100 | OpenClaw 特有（delta/final/fallback） |
| Agent 事件处理 | ~120 | OpenClaw 特有（stream 名称）          |
| 工具调用转换   | ~80  | OpenClaw 特有（phase→status 映射）    |
| 权限处理       | ~60  | 部分通用                              |
| 消息发射       | ~80  | 通用                                  |
| 状态管理       | ~30  | 通用                                  |

**结论**：OpenClaw 特有逻辑占比约 60%。直接复用 `OpenClawAgent` 用于远程 OpenClaw 是合理的（差异仅在连接参数），但不适合作为通用远程 Agent 基类。

### 4.3 传输层抽象

`OpenClawGatewayConnection` 本身已经是一个比较好的 WebSocket 传输封装，但与 OpenClaw 协议耦合（connect 握手、challenge-response、event 格式）。

如果未来要支持 ZeroClaw / Nanobot 等不同协议的远程 Agent，需要将传输层和协议层分离。

### 4.4 远程 OpenClaw 的最小改动路径

基于以上分析，支持远程 OpenClaw 的最小改动路径为：

```
1. AgentType 新增 'remote'（或更细分为 'remote-openclaw'）
2. ConfigStorage 新增 remote.agents 配置
3. DB migration: conversations.type CHECK 新增
4. 新建 RemoteOpenClawAgentManager
   - 继承 BaseAgentManager
   - 复用 OpenClawAgent（useExternalGateway=true, url=远程地址）
5. AgentFactory 注册新类型
6. UI: 设置页 + Guid 页 + 连接状态
```

### 4.5 未来扩展路径

当需要支持 ZeroClaw / Nanobot / 自定义 Agent 时：

```
1. 抽象 IRemoteTransport 接口（WebSocket / SSE 实现）
2. 抽象 IProtocolAdapter 接口（OpenClaw / ZeroClaw / ACP 实现）
3. RemoteAgentManager 变为通用，内部组合 Transport + Adapter
4. 每种远程 Agent 只需实现 ProtocolAdapter
```

但这属于**第二期**。第一期只需要支持远程 OpenClaw，无需过度抽象。
