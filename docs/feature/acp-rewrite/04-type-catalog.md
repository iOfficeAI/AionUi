# ACP 类型目录与不变量清单

> **版本**: v1.2 | **最后更新**: 2026-04-16 | **状态**: Draft
> **摘要**: ACP 重构的类型定义（按架构层分组）与 23 条系统不变量的完整规格
> **受众**: ACP 重构实现开发者、新加入团队的开发者

---

## 目录

- [Part 1: 类型目录](#part-1-类型目录)
  - [1. 跨层共享类型](#1-跨层共享类型)
  - [2. 基础设施层类型 (Infrastructure)](#2-基础设施层类型-infrastructure)
  - [3. 会话层类型 (Session)](#3-会话层类型-session)
  - [4. 应用层类型 (Application)](#4-应用层类型-application)
  - [5. 类型关系图](#5-类型关系图)
  - [6. 类型一致性问题与统一建议](#6-类型一致性问题与统一建议)
  - [7. 类型来源总结表](#7-类型来源总结表)
- [Part 2: 不变量清单](#part-2-不变量清单)
  - [8. 编号规则](#8-编号规则)
  - [9. Infrastructure 层不变量](#9-infrastructure-层不变量)
  - [10. Session 层不变量](#10-session-层不变量)
  - [11. Application 层不变量](#11-application-层不变量)
  - [12. 跨层不变量](#12-跨层不变量)
  - [13. 不变量总结表](#13-不变量总结表)

---

# Part 1: 类型目录

类型按架构层分组：跨层 → 基础设施层 → 会话层 → 应用层。每个类型标注 TypeScript 定义、用途说明、所属边界。

类型定义文件：

- 跨层共享类型：[`src/process/acp/types.ts`](../round-03/src/process/acp/types.ts)
- 会话层类型：[`src/process/acp/session/types.ts`](../round-03/src/process/acp/session/types.ts)

---

## 1. 跨层共享类型

不归属于特定边界，被多个层引用的类型。

### 1.1 AgentConfig

```typescript
// 定义位置: types.ts
// 使用方: AcpRuntime.createConversation 参数 -> AcpSession 构造函数 -> ClientFactory
// 边界: 跨层（Application 创建, Session 使用, Infrastructure 读取连接信息）

type AgentConfig = {
  // Agent 身份
  agentBackend: string;
  agentSource: 'builtin' | 'extension' | 'custom' | 'remote';
  agentId: string;

  // 连接信息（决定使用哪种 Connector）
  command?: string; // 由 AcpDetector 解析后的完整命令
  args?: string[]; // 由 AcpDetector 解析后的完整参数
  env?: Record<string, string>;
  remoteUrl?: string;
  remoteHeaders?: Record<string, string>;

  // 进程选项
  processOptions?: {
    gracePeriodMs?: number; // 三阶段关闭 Phase 1 等待时间，默认 100ms
  };

  // 会话配置
  cwd: string;
  mcpServers?: McpServer[];
  additionalDirectories?: string[];

  // 可选预设（来自 relate_type = 'assistant'）
  presetPrompts?: string[];
  presetSkills?: string[];
  presetMcpServers?: McpServer[];

  // Team MCP（D9 团队模式预留）
  teamMcpConfig?: McpServer;

  // 认证
  authCredentials?: Record<string, string>;

  // 恢复信息（从 DB 重建时使用）
  resumeSessionId?: string;
  resumeConfig?: Record<string, unknown>;
};
```

贯穿全部 3 层的配置载体（configuration carrier）。Application 层从 IPC 构建，Session 层消费会话级字段，Infrastructure 层读取连接信息。

> **Round 04 修订**: 删除 `npxPackage`、`npxVersion`、`managedInstall` 字段。`command` 和 `args` 在非 remote 场景下为必选——路径解析由 AcpDetector 在构建 AgentConfig 时完成，不是 Connector 的职责。

### 1.2 McpServer（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk（直接使用，不再本地定义）
// 使用方: AgentConfig.mcpServers, createSession 参数
// 边界: 跨层（Application 配置, Session 构建, Infrastructure 传给 SDK）

type McpServer = {
  name: string;
  command: string;
  args: Array<string>; // 必选，SDK 定义
  env: Array<EnvVariable>; // Array<{name, value}>，不是 Record
  _meta?: Record<string, unknown>;
};
```

SDK 定义的 MCP 服务器配置。在 Application 层由用户配置产生，在 Session 层通过 McpConfig 组装，在 Infrastructure 层传给 SDK 的 `createSession`。直接使用 SDK 类型，无本地包装。

### 1.3 AcpError

```typescript
// 定义位置: errors/AcpError.ts
// 使用方: 各层产出错误时使用
// 边界: 跨层

class AcpError extends Error {
  constructor(
    public readonly code: AcpErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      retryable?: boolean;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AcpError';
    this.retryable = options?.retryable ?? false;
  }

  readonly retryable: boolean;
}
```

统一错误类型。`code` 字段用于错误分类，`retryable` 标记是否可重试。`cause` 支持错误链追溯。

#### AcpError 子类

```typescript
// 定义位置: errors/AcpError.ts
// 边界: 跨层

class AgentSpawnError extends AcpError {
  // code: 'CONNECTION_FAILED'
  // spawn() 失败时抛出，包含 command 信息
}

class AgentStartupError extends AcpError {
  // code: 'PROCESS_CRASHED'
  // 进程在 initialize() 完成前退出，包含 stderr + exit code
}

class AgentDisconnectedError extends AcpError {
  // code: 'PROCESS_CRASHED'
  // 进程在请求执行期间断开，包含 exit info
}
```

三个 AcpError 子类分别对应连接阶段的三种失败模式：spawn 失败、启动期崩溃、运行期断开。`AgentStartupError` 和 `AgentDisconnectedError` 均包含 stderr 信息用于诊断。

### 1.4 AcpErrorCode

```typescript
// 定义位置: errors/AcpError.ts
// 使用方: AcpError.code, 错误分类和重试判断
// 边界: 跨层

type AcpErrorCode =
  | 'CONNECTION_FAILED' // 连接失败（spawn 失败、网络不通）
  | 'AUTH_FAILED' // 认证失败（凭据提交后被 agent 拒绝）
  | 'AUTH_REQUIRED' // Agent 要求认证（INV-S-15，触发 auth_required 信号而非进入 error 状态）
  | 'SESSION_EXPIRED' // session 过期（loadSession 失败）
  | 'PROMPT_TIMEOUT' // prompt 超时
  | 'PROCESS_CRASHED' // 进程意外退出
  | 'PROTOCOL_ERROR' // JSON-RPC 协议错误
  | 'AGENT_ERROR' // agent 返回的业务错误
  | 'QUEUE_FULL' // 队列满
  | 'INVALID_STATE' // 无效状态下的操作
  | 'PERMISSION_CANCELLED' // 权限请求被取消（进程退出或主动取消）
  | 'INTERNAL_ERROR'; // 内部逻辑错误
```

> **AUTH_REQUIRED vs AUTH_FAILED**: `AUTH_REQUIRED` 表示 agent 声明需要认证但当前没有可用凭据，是预期路径（触发 `auth_required` 信号 + reset 模式）；`AUTH_FAILED` 表示凭据提交后被 agent 拒绝（也触发 `auth_required` 信号，允许用户重试），不进入 error 状态。

### 1.5 AcpMetrics（接口）

```typescript
// 定义位置: types.ts
// 使用方: AcpSession 构造函数可选注入
// 边界: 跨层（可选注入，默认 no-op）
// 依据: D8 决议

interface AcpMetrics {
  recordSpawnLatency(backend: string, ms: number): void;
  recordInitLatency(backend: string, ms: number): void;
  recordFirstTokenLatency(backend: string, ms: number): void;
  recordError(backend: string, code: AcpErrorCode): void;
  recordResumeResult(backend: string, success: boolean): void;
  snapshot(): MetricsSnapshot;
}

const noopMetrics: AcpMetrics = {
  recordSpawnLatency() {},
  recordInitLatency() {},
  recordFirstTokenLatency() {},
  recordError() {},
  recordResumeResult() {},
  snapshot() {
    return { entries: [] };
  },
};
```

遥测接口（telemetry interface）。Phase 1 只有 `noopMetrics` 实现。通过 AcpSession 构造函数注入，默认值为 `noopMetrics`，调用点不需要空检查。

### 1.6 MetricsSnapshot

```typescript
// 定义位置: types.ts
// 使用方: AcpMetrics.snapshot() 返回值
// 边界: 跨层

type MetricsSnapshot = {
  entries: Array<{
    backend: string;
    metric: string;
    value: number;
    timestamp: number;
  }>;
};
```

---

## 2. 基础设施层类型 (Infrastructure)

基础设施层（Infrastructure Layer）负责连接管理和协议通信。包含 SDK 原样类型和新定义的连接抽象。

### 2.1 Stream（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk
// 使用方: AcpClient 内部使用（ProcessAcpClient 通过 NdjsonTransport 创建）
// 边界: Infrastructure 内部（不暴露给 Session 层）

type Stream = {
  readable: ReadableStream<AnyMessage>;
  writable: WritableStream<AnyMessage>;
};
```

SDK 定义的双向消息流（bidirectional message stream）。`AnyMessage` 是 JSON-RPC 2.0 消息的联合类型（request / response / notification）。Session 层不直接操作 Stream——它是 AcpClient 的内部实现细节。

### 2.2 AcpClient（接口）

```typescript
// 定义位置: 新定义
// 使用方: AcpSession 持有（单一 client 字段），ClientFactory.create() 返回
// 边界: Infrastructure -> Session
// 实现: ProcessAcpClient (本地子进程), WebSocketAcpClient (远程 WebSocket)

interface AcpClient {
  start(): Promise<InitializeResponse>;
  createSession(params: CreateSessionParams): Promise<NewSessionResponse>;
  loadSession(params: LoadSessionParams): Promise<LoadSessionResponse>;
  prompt(sessionId: string, content: PromptContent): Promise<PromptResponse>;
  cancel(sessionId: string): Promise<void>;
  setModel(sessionId: string, modelId: string): Promise<void>;
  setMode(sessionId: string, modeId: string): Promise<void>;
  setConfigOption(sessionId: string, id: string, value: string | boolean): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  extMethod(method: string, params: Record<string, unknown>): Promise<unknown>;
  readonly lifecycleSnapshot: AgentLifecycleSnapshot;
  onDisconnect(handler: (info: DisconnectInfo) => void): void;
  close(): Promise<void>;
}
```

统一的 ACP 客户端接口（unified ACP client interface）。替代原有的 `ConnectorHandle` + `AgentConnector` + `AcpProtocol` + `ProtocolFactory` 四个抽象。AcpSession 持有单一 `client: AcpClient | null` 字段，通过此接口完成所有 agent 交互。`start()` 内部封装了 spawn/connect + 协议初始化。`close()` 内部封装了资源清理（进程关闭或 WebSocket 断开）。

> **v1.2 修订**: 合并 ConnectorHandle、AgentConnector、AcpProtocol、ProtocolFactory 为统一的 AcpClient 接口。Session 层不再直接接触 Stream、ProtocolHandlers 等底层概念。

### 2.3 ClientFactory

```typescript
// 定义位置: 新定义
// 使用方: AcpRuntime 构造函数注入, AcpSession 通过 SessionOptions 注入
// 边界: Application -> Session（工厂模式，根据 AgentConfig 创建对应实现）

type ClientFactory = {
  create(config: AgentConfig): AcpClient;
};
```

根据 `AgentConfig.remoteUrl` 是否存在决定创建 `ProcessAcpClient`（本地子进程）或 `WebSocketAcpClient`（远程 WebSocket）。替代原有的 `ConnectorFactory`。

> **v1.2 修订**: 原 `ConnectorFactory` + `ProtocolFactory` 合并为 `ClientFactory`。

### 2.4 ProcessAcpClient（具体类，内部实现）

`ProcessAcpClient` 是 `AcpClient` 的本地子进程实现。内部封装了 `spawn()` + `NdjsonTransport` + SDK `ClientSideConnection`。不作为类型暴露给 Session 层——Session 层只通过 `AcpClient` 接口交互。

- `start()`: spawn 子进程 → 建立 stdio 管道 → JSON-RPC initialize
- `close()`: 三阶段关闭（stdin.end → SIGTERM → SIGKILL）
- `lifecycleSnapshot`: 反映子进程的 pid、运行状态、最后退出信息
- `onDisconnect()`: 监听进程退出事件（exit、close、pipe_close）

> **v1.2 修订**: 原 `AcpProtocol` 类的职责（协议透传 + SDK 方法包装）被合并到 `ProcessAcpClient` 内部实现中。`AcpProtocol` 不再作为独立类型暴露。

### 2.5 AgentLifecycleSnapshot

```typescript
// 定义位置: 新定义
// 使用方: AcpClient.lifecycleSnapshot 属性返回值
// 边界: Infrastructure -> Session（AcpSession 读取以判断进程状态）

type AgentLifecycleSnapshot = {
  pid: number | null;
  running: boolean;
  lastExit: {
    exitCode: number | null;
    signal: string | null;
    reason: 'process_exit' | 'pipe_close' | 'connection_close';
    stderr: string;
    unexpectedDuringPrompt: boolean;
  } | null;
};
```

AcpClient 的进程/连接生命周期快照。`running` 反映当前连接是否存活（替代原有 `connector.isAlive()`）。`lastExit` 记录最后一次退出的完整信息，包含 stderr 用于诊断。`unexpectedDuringPrompt` 标记是否在 prompt 执行期间意外断开。

> **v1.2 新增**: 替代原 `ProtocolFactory` 位置。提供结构化的生命周期信息，比原有的 `isAlive()` boolean 更丰富。

### 2.X DisconnectInfo

```typescript
// 定义位置: 新定义
// 使用方: AcpClient.onDisconnect() 回调参数
// 边界: Infrastructure -> Session

type DisconnectInfo = {
  reason: 'process_exit' | 'pipe_close' | 'connection_close';
  exitCode: number | null;
  signal: string | null;
  stderr: string;
};
```

断开连接事件的上下文信息。`reason` 区分三种断开原因：进程退出、管道关闭、连接关闭（WebSocket）。AcpSession 的 `handleDisconnect(info)` 使用此信息决定恢复策略。

> **v1.2 新增**: 替代原有的 `protocol.closed` Promise（无上下文信息）为结构化的断开事件。

### 2.6 ProtocolHandlers（AcpClient 内部）

```typescript
// 定义位置: types.ts
// 使用方: ProcessAcpClient / WebSocketAcpClient 内部使用
// 边界: Infrastructure 内部（不再暴露给 Session 层）

type ProtocolHandlers = {
  onSessionUpdate: (notification: SessionNotification) => void;
  onRequestPermission: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  onReadTextFile: (request: ReadTextFileRequest) => Promise<ReadTextFileResponse>;
  onWriteTextFile: (request: WriteTextFileRequest) => Promise<WriteTextFileResponse>;
};
```

AcpClient 内部注册到 SDK `ClientSideConnection` 上的 client-side 回调。所有参数类型直接使用 SDK 导出的类型（`SessionNotification`、`RequestPermissionRequest`/`Response`、`ReadTextFileRequest`/`Response`、`WriteTextFileRequest`/`Response`）。

> **v1.2 修订**: ProtocolHandlers 现在是 AcpClient 的内部实现细节，不再暴露给 Session 层。Session 层通过 AcpClient 接口间接提供 handler 实现。

### 2.7 SessionNotification（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk（直接 import，不再本地定义）
// 使用方: ProtocolHandlers.onSessionUpdate 参数
// 边界: Infrastructure -> Session（AcpSession.handleSessionUpdate 消费）
```

`SessionNotification` 直接从 SDK 导入使用，不再在本地重新定义。其内部结构由 SDK 维护，包含 `sessionId` 和各种 `sessionUpdate` 变体。

SDK 类型穿透范围（SDK type penetration boundary）：SDK 原始类型最远到达 AcpSession 内部的 `handleSessionUpdate()` 方法。之后由 MessageTranslator 翻译为 `TMessage`（应用类型），ConfigTracker 提取配置更新。

### 2.8 RequestPermissionRequest / RequestPermissionResponse（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk（直接 import，不再本地定义）
// 使用方: ProtocolHandlers.onRequestPermission 参数和返回值
// 边界: Infrastructure -> Session（AcpSession.handlePermissionRequest 消费）
```

`RequestPermissionRequest` 和 `RequestPermissionResponse` 直接从 SDK 导入使用，不再在本地重新定义。ProtocolHandlers 直接引用 SDK 类型。

AcpSession 内部的 PermissionResolver 将 `RequestPermissionRequest` 转换为 `PermissionUIData`（应用类型）后通过 callback 传给 Application 层。SDK 类型不跨越此边界（INV-X-01）。

### 2.9 PromptResponse（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk（原样透传）
// 使用方: AcpClient.prompt() 返回值
// 边界: Infrastructure -> Session（AcpSession.executePrompt 消费）

type PromptResponse = {
  stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};
```

AcpSession 在 prompt 完成后检查 `stopReason` 决定下一步行为（出队下一个 prompt 或进入 active）。

### 2.10 InitializeResponse（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk（直接 import）
// 使用方: AcpClient.start() 返回值, AcpSession.doStart 消费
// 边界: Infrastructure -> Session
```

`client.start()` 的返回类型，直接从 SDK 导入。`authMethods` 字段（SDK `AuthMethod[]`）可选——缺失时表示 agent 不需要认证，AcpSession 跳过认证步骤直接进入 createSession。存在时 AuthNegotiator 直接透传 SDK `AuthMethod[]` 到 `AuthRequiredData`。

> SDK `AuthMethod` 是 discriminated union：`(AuthMethodEnvVar & {type:"env_var"}) | (AuthMethodTerminal & {type:"terminal"}) | AuthMethodAgent`，不需要本地转换。

### 2.12 ~~LocalProcessConfig~~（已移除）

> **v1.2 修订**: `LocalProcessConfig` 的内容（command、args、cwd、env、gracePeriodMs）现在是 `ProcessAcpClient` 的内部实现细节，从 `AgentConfig` 中直接读取。不再作为独立类型暴露。

### 2.13 CreateSessionParams / LoadSessionParams

```typescript
// 定义位置: types.ts
// 使用方: AcpClient.createSession / loadSession 参数
// 边界: Infrastructure 内部

type CreateSessionParams = {
  cwd: string;
  mcpServers?: McpServer[];
  additionalDirectories?: string[];
};

type LoadSessionParams = {
  sessionId: string;
  cwd: string;
  mcpServers?: McpServer[];
  additionalDirectories?: string[];
};
```

### 2.14 PromptContent（基于 SDK ContentBlock）

```typescript
// 定义位置: types.ts
// 使用方: InputPreprocessor.process 返回, AcpClient.prompt 参数
// 边界: Session -> Infrastructure（AcpSession 内部流转）

type PromptContent = ContentBlock[];
```

`PromptContent` 是 SDK `ContentBlock[]` 的类型别名。`ContentBlock` 由 SDK 定义，包含 text、file 等变体。不再有本地定义的 `PromptContentItem` 类型。

---

## 3. 会话层类型 (Session)

会话层（Session Layer）负责状态机管理、prompt 队列、权限策略等核心编排逻辑。对外通过 `SessionCallbacks` 向 Application 层推送事件。

### 3.1 SessionCallbacks（接口）

```typescript
// 定义位置: types.ts + session/types.ts（两处定义，见 §6 一致性问题）
// 使用方: AcpSession 构造函数注入, AcpRuntime 实现
// 边界: Session -> Application（AcpSession 的唯一输出通道）

interface SessionCallbacks {
  /** 高频: 流式消息（TMessage 是 AionUi 应用类型） */
  onMessage(message: TMessage): void;
  /** Session ID 更新（创建/恢复 session 时） */
  onSessionId(sessionId: string): void;
  /** 状态机转换 */
  onStatusChange(status: SessionStatus): void;
  /** 配置快照更新 */
  onConfigUpdate(config: ConfigSnapshot): void;
  /** 模型信息更新 */
  onModelUpdate(model: ModelSnapshot): void;
  /** 模式信息更新 */
  onModeUpdate(mode: ModeSnapshot): void;
  /** 上下文使用量 */
  onContextUsage(usage: ContextUsage): void;
  /** 队列状态更新（完整快照，非增量） */
  onQueueUpdate(queue: QueueSnapshot): void;
  /** 权限请求（需要 UI 展示） */
  onPermissionRequest(data: PermissionUIData): void;
  /** 信号事件（session 过期、队列暂停、错误等） */
  onSignal(event: SessionSignal): void;
}
```

两通道分离设计：`onMessage` 是高频流式数据，其余是低频状态事件。避免互相阻塞（INV-X-03 背压架构预留）。

### 3.2 SessionStatus

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: AcpSession.status 属性, SessionCallbacks.onStatusChange 参数
// 边界: Session -> Application
// 依据: D1 决议（7 态）

type SessionStatus =
  | 'idle' // 已创建，未启动
  | 'starting' // connect -> init -> auth -> createSession
  | 'active' // session 就绪，等待用户输入
  | 'prompting' // prompt 执行中
  | 'suspended' // 进程已杀，sessionId 保留
  | 'resuming' // 正在恢复（与 starting 区分：UI 显示"重新连接中"）
  | 'error'; // 不可恢复错误
```

D1 决议保留 `resuming` 状态。外部观察者（UI）在首次连接和恢复连接时需要展示不同文案。

### 3.3 QueueSnapshot

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: PromptQueue.snapshot() 返回, SessionCallbacks.onQueueUpdate 参数
// 边界: Session -> Application

type QueueSnapshot = {
  items: ReadonlyArray<{
    id: string;
    text: string; // 可截断，用于 UI 缩略展示
    enqueuedAt: number;
  }>;
  maxSize: number;
  length: number;
};
```

每次 `onQueueUpdate` 推送完整快照（INV-X-02），不依赖增量。Application 层直接替换 UI 状态，无需 diff。

### 3.4 PermissionUIData

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: PermissionResolver -> SessionCallbacks.onPermissionRequest -> AcpRuntime -> IPC -> 渲染层
// 边界: Session -> Application

type PermissionUIData = {
  callId: string;
  title: string;
  description: string;
  kind?: ToolKind;
  options: Array<{
    optionId: string;
    label: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }>;
  locations?: Array<{
    path: string;
    range?: { startLine: number; endLine?: number };
  }>;
  rawInput?: unknown;
};
```

PermissionResolver 从 SDK 的 `RequestPermissionRequest` 转换出的 UI 友好结构。SDK 类型不跨越此边界（INV-X-01）。

### 3.5 ToolKind（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk（直接 import，不再本地定义）
// 使用方: PermissionUIData.kind 字段
// 边界: Session -> Application
```

`ToolKind` 直接从 SDK 导入使用。SDK 定义了 `read`、`edit`、`delete`、`execute` 等工具类型的 string union。

### 3.6 ConfigSnapshot

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: ConfigTracker.snapshot() 返回, SessionCallbacks.onConfigUpdate 参数
// 边界: Session -> Application

type ConfigSnapshot = {
  configOptions: ConfigOption[];
  availableCommands: string[];
  cwd: string;
  additionalDirectories?: string[];
};
```

ConfigTracker 的全量快照。suspend 时序列化写入 DB `session_config` JSON，resume 时反序列化恢复。

### 3.7 ModelSnapshot

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: ConfigTracker.modelSnapshot() 返回, SessionCallbacks.onModelUpdate 参数
// 边界: Session -> Application

type ModelSnapshot = {
  currentModelId: string | null;
  availableModels: Array<{
    modelId: string;
    name: string;
    description?: string;
  }>;
};
```

### 3.8 ModeSnapshot

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: ConfigTracker.modeSnapshot() 返回, SessionCallbacks.onModeUpdate 参数
// 边界: Session -> Application

type ModeSnapshot = {
  currentModeId: string | null;
  availableModes: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
};
```

### 3.9 ContextUsage

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: AcpSession.handleSessionUpdate 提取, SessionCallbacks.onContextUsage 参数
// 边界: Session -> Application

type ContextUsage = {
  used: number; // 已使用 token 数
  total: number; // 上下文窗口总大小
  percentage: number; // used / total * 100
};
```

### 3.10 SessionSignal

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: SessionCallbacks.onSignal 参数
// 边界: Session -> Application

type SessionSignal =
  | { type: 'session_expired' }
  | { type: 'queue_paused'; reason: 'crash_recovery' }
  | { type: 'auth_required'; auth: AuthRequiredData }
  | { type: 'error'; message: string; recoverable: boolean };
```

低频信号事件（low-frequency signal event）。与 `onStatusChange` 分离——`SessionSignal` 传递附加语义（如"为什么队列暂停了"、"需要认证"），`onStatusChange` 只传递状态枚举值。

`auth_required` 信号由 AuthNegotiator 在以下场景触发（INV-S-15）：

- `InitializeResponse` 含 `authMethods` 且 `AuthNegotiator.hasCredentials` 为 false
- `authenticate()` 调用抛出 `AUTH_FAILED`

### 3.11 AuthRequiredData

```typescript
// 定义位置: types.ts + session/types.ts
// 使用方: SessionSignal.auth_required.auth, SignalEvent.auth_required.auth
// 边界: Session -> Application

type AuthRequiredData = {
  /** Agent 后端标识（用于 UI 展示"请登录 XXX"） */
  agentBackend: string;
  /** Agent 支持的认证方式列表 */
  methods: AuthMethod[];
};
```

AuthNegotiator 直接透传 `InitializeResponse.authMethods`（SDK 类型 `AuthMethod[]`）到 `AuthRequiredData` 中，无需转换。`agentBackend` 来自 `AgentConfig.agentBackend`。

### 3.12 AuthMethod（SDK 原样）

```typescript
// 来源: @agentclientprotocol/sdk（直接 import，不再本地定义）
// 使用方: AuthRequiredData.methods, AuthNegotiator
// 边界: Session -> Application
```

`AuthMethod` 直接从 SDK 导入使用，是 SDK 定义的 discriminated union：

- `AuthMethodEnvVar & {type:"env_var"}`: 用户手动输入凭据（API key 等）。`vars: Array<AuthEnvVar>` 描述需要输入的字段（`AuthEnvVar = { name, label?, secret?, optional? }`）。UI 根据 `vars` 渲染表单。
- `AuthMethodTerminal & {type:"terminal"}`: 启动命令行认证流程（如 OAuth device flow）。`args?: Array<string>`, `env?: Record<string,string>`。
- `AuthMethodAgent`: Agent 自行处理认证（如浏览器跳转）。无显式 `type` 字段（catch-all 变体）。

不再有本地定义的 `AuthInputField` 类型。SDK `AuthEnvVar` 替代了原来的 `AuthInputField`。

### 3.14 ConfigOption（SDK 简化）

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: ConfigTracker 内部, ConfigSnapshot 字段
// 边界: Session <-> Application

type ConfigOption = {
  id: string;
  name: string;
  type: 'select' | 'boolean';
  category?: 'mode' | 'model' | 'thought_level' | string;
  description?: string;
  currentValue: string | boolean;
  options?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
};
```

从 SDK `SessionConfigOption` 简化而来，去掉 `_meta` 等协议噪声。

### 3.15 TMessage（外部类型占位）

```typescript
// 定义位置: types.ts（占位，实际类型来自 @/common/chat/chatLib）
// 使用方: SessionCallbacks.onMessage 参数, MessageTranslator 输出
// 边界: Session -> Application -> IPC

type TMessage = Record<string, unknown>; // TODO: import from chatLib
```

渲染层（renderer）消息类型。不在 ACP 模块中定义，通过占位类型保持编译通过。MessageTranslator 负责将 SDK 的 `SessionUpdate` 翻译为 `TMessage`。

### 3.16 QueuedPrompt（Session 内部）

```typescript
// 定义位置: types.ts + session/types.ts（定义一致）
// 使用方: PromptQueue 内部条目, AcpSession.executePrompt 参数
// 边界: Session 内部

type QueuedPrompt = {
  id: string; // UUID
  text: string;
  files?: string[];
  enqueuedAt: number; // 入队时间戳
};
```

### 3.17 PendingPermission（Session 内部）

```typescript
// 定义位置: types.ts vs session/types.ts（存在不一致，见 §6.2）
// 使用方: PermissionResolver 内部追踪 pending 权限请求
// 边界: Session 内部

// === 统一后的目标定义（采用 session/types.ts 版本）===
type PendingPermission = {
  callId: string;
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
  createdAt: number;
};
```

### 3.18 SessionOptions（Session 内部）

```typescript
// 定义位置: types.ts vs session/types.ts（存在不一致，见 §6.3）
// 使用方: AcpSession 构造函数可选参数
// 边界: Session 内部

// === 统一后的目标定义（采用 session/types.ts 版本）===
type SessionOptions = {
  promptTimeoutMs?: number; // 默认 300_000 (5 分钟)
  maxStartRetries?: number; // 默认 3 (3 次重试 = 4 次总尝试)
  maxResumeRetries?: number; // 默认 2
  clientFactory?: ClientFactory; // 默认 defaultClientFactory (v1.2: 替代原 protocolFactory)
  metrics?: AcpMetrics; // 默认 noopMetrics
  promptQueueMaxSize?: number; // 默认 5
  approvalCacheMaxSize?: number; // 默认 500
};
```

---

## 4. 应用层类型 (Application)

应用层（Application Layer）负责 session 生命周期管理、IPC 桥接、空闲回收等运行时功能。

### 4.1 SignalEvent

```typescript
// 定义位置: types.ts
// 使用方: AcpRuntime 通过 IPC 推给渲染层的非流式事件
// 边界: Application -> IPC -> 渲染层

type SignalEvent =
  | { type: 'status_change'; status: SessionStatus }
  | { type: 'session_id_update'; sessionId: string }
  | { type: 'model_update'; model: ModelSnapshot }
  | { type: 'mode_update'; mode: ModeSnapshot }
  | { type: 'config_update'; config: ConfigSnapshot }
  | { type: 'context_usage'; usage: ContextUsage }
  | { type: 'queue_update'; queue: QueueSnapshot }
  | { type: 'queue_paused'; reason: 'crash_recovery' }
  | { type: 'permission_request'; data: PermissionUIData }
  | { type: 'auth_required'; auth: AuthRequiredData }
  | { type: 'error'; message: string; recoverable: boolean };
```

AcpRuntime 将 SessionCallbacks 的各种回调统一为 `SignalEvent` 可辨识联合类型（discriminated union），通过 IPC 推给渲染层。`TMessage` 走 `onStreamEvent` 通道（高频），`SignalEvent` 走 `onSignalEvent` 通道（低频）。

### 4.2 SessionEntry（Application 内部）

```typescript
// 定义位置: 新定义
// 使用方: AcpRuntime 内部 Map 值类型
// 边界: Application 内部

type SessionEntry = {
  session: AcpSession;
  lastActiveAt: number;
};
```

### 4.3 ClientFactory（Application 内部）

```typescript
// 定义位置: 新定义
// 使用方: AcpRuntime 构造函数注入
// 边界: Application 内部

type ClientFactory = {
  create(config: AgentConfig): AcpClient;
};
```

根据 `AgentConfig.remoteUrl` 是否存在决定创建 `ProcessAcpClient` 或 `WebSocketAcpClient`。

> **v1.2 修订**: 原 `ConnectorFactory` 更名为 `ClientFactory`，返回 `AcpClient` 而非 `AgentConnector`。

### 4.4 RuntimeOptions（Application 内部）

```typescript
// 定义位置: types.ts
// 使用方: AcpRuntime 构造函数
// 边界: Application 内部

type RuntimeOptions = {
  idleTimeoutMs?: number; // 空闲回收阈值，默认 5 分钟
  checkIntervalMs?: number; // 空闲检查间隔，默认 60 秒
};
```

---

## 5. 类型关系图

下图展示核心类型之间的组合与依赖关系，按架构层分区。

```mermaid
classDiagram
    direction TB

    namespace CrossLayer {
        class AgentConfig {
            +agentBackend: string
            +agentSource: string
            +cwd: string
            +mcpServers: McpServer[]
        }
        class McpServer {
            +name: string
            +command: string
        }
        class AcpError {
            +code: AcpErrorCode
            +retryable: boolean
        }
        class AcpMetrics {
            <<interface>>
            +recordSpawnLatency()
            +recordError()
            +snapshot(): MetricsSnapshot
        }
    }

    namespace Infrastructure {
        class AcpClient {
            <<interface>>
            +start(): Promise~InitializeResponse~
            +createSession()
            +prompt()
            +cancel()
            +close(): Promise~void~
            +lifecycleSnapshot: AgentLifecycleSnapshot
            +onDisconnect(handler)
        }
        class AgentLifecycleSnapshot {
            +pid: number | null
            +running: boolean
            +lastExit: object | null
        }
        class DisconnectInfo {
            +reason: string
            +exitCode: number | null
            +stderr: string
        }
    }

    namespace Session {
        class SessionCallbacks {
            <<interface>>
            +onMessage(TMessage)
            +onStatusChange(SessionStatus)
            +onQueueUpdate(QueueSnapshot)
            +onPermissionRequest(PermissionUIData)
            +onSignal(SessionSignal)
        }
        class SessionStatus {
            <<enum>>
            idle | starting | active
            prompting | suspended
            resuming | error
        }
        class PromptQueue {
            +enqueue(): boolean
            +dequeue(): QueuedPrompt
            +snapshot(): QueueSnapshot
        }
        class PermissionResolver {
            +pendingRequests: Map
            +resolve(callId)
        }
    }

    namespace Application {
        class AcpRuntime {
            +createConversation()
            +sendMessage()
        }
        class ClientFactory {
            +create(AgentConfig): AcpClient
        }
        class SignalEvent {
            <<discriminated union>>
            type: string
        }
    }

    AcpClient --> AgentLifecycleSnapshot : exposes
    AcpClient --> DisconnectInfo : emits via onDisconnect
    AcpRuntime --> ClientFactory : uses
    ClientFactory --> AcpClient : creates
    AcpRuntime --> SessionCallbacks : implements
    SessionCallbacks --> SessionStatus : references
    SessionCallbacks --> QueueSnapshot : references
    SessionCallbacks --> PermissionUIData : references
    SessionCallbacks --> SignalEvent : maps to
    AgentConfig --> McpServer : contains
```

---

## 6. 类型一致性问题与统一建议

`types.ts`（跨层共享）和 `session/types.ts`（会话层）之间存在 15+ 个重复定义的类型，其中 3 处定义不一致。

### 6.1 SessionCallbacks.onMessage 签名

| 文件                    | 定义                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `types.ts` L226         | `onMessage(message: TMessage): void` — 使用 `TMessage`（定义为 `Record<string, unknown>` 占位） |
| `session/types.ts` L149 | `onMessage(message: unknown): void` — 使用 `unknown` 占位                                       |

**建议**: 统一为 `types.ts` 的 `TMessage` 方式，保留类型语义。`TMessage` 虽然当前是占位，但明确表达了"这里应该是应用层消息类型"的意图。

### 6.2 PendingPermission 字段

| 文件                        | 定义差异                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `types.ts` L288-292         | 缺少 `callId` 字段；`resolve` 参数为 `{ optionId: string }`；`reject` 参数为 `Error`    |
| `session/types.ts` L337-342 | 有 `callId` 字段；`resolve` 参数为 `RequestPermissionResponse`；`reject` 参数为 `Error` |

**建议**: 统一为 `session/types.ts` 版本。`callId` 是 PermissionResolver 追踪 pending 请求的必要字段；`resolve` 使用 `RequestPermissionResponse` 而非内联对象字面量，保持与 SDK 类型的对应关系。

### 6.3 SessionOptions 字段

| 文件                        | 定义差异                                                       |
| --------------------------- | -------------------------------------------------------------- |
| `types.ts` L274-279         | 缺少 `clientFactory` 和 `metrics` 字段                         |
| `session/types.ts` L348-355 | 包含 `clientFactory?: ClientFactory` 和 `metrics?: AcpMetrics` |

**建议**: 统一为 `session/types.ts` 版本。`clientFactory` 是测试注入点（替代原 D9 决议的 `protocolFactory`），`metrics` 是 D8 决议的遥测注入点，二者均为 AcpSession 构造参数的必要可选字段。

### 统一方案

建立单一来源（single source of truth）：

1. **跨层类型**留在 `types.ts`：`AgentConfig`、`AcpMetrics`、`SessionStatus`、`QueueSnapshot` 等（`McpServer` 直接从 SDK import）
2. **会话层专用类型**留在 `session/types.ts`：`PendingPermission`、`SessionOptions`、SDK placeholder 类型
3. `session/types.ts` 通过 re-export 引用 `types.ts`，**不重复定义**
4. 3 处不一致均以包含更多信息的版本为准

---

## 7. 类型来源总结表

| #   | 类型                        | 来源         | 边界             | 定义文件                                  |
| --- | --------------------------- | ------------ | ---------------- | ----------------------------------------- |
| 1   | `AgentConfig`               | 新定义       | 跨层             | types.ts                                  |
| 2   | `McpServer`                 | SDK 原样     | 跨层             | SDK import                                |
| 3   | `AcpError`                  | 新定义       | 跨层             | errors/AcpError.ts                        |
| 4   | `AcpErrorCode`              | 新定义       | 跨层             | errors/AcpError.ts                        |
| 5   | `AcpMetrics`                | 新定义       | 跨层             | types.ts                                  |
| 6   | `MetricsSnapshot`           | 新定义       | 跨层             | types.ts                                  |
| 7   | `Stream`                    | SDK 原样     | Infra 内部       | session/types.ts                          |
| 8   | `AcpClient`                 | 新定义       | Infra -> Session | (待创建)                                  |
| 9   | `ClientFactory`             | 新定义       | App 内部         | (待创建)                                  |
| 10  | `AgentLifecycleSnapshot`    | 新定义       | Infra -> Session | (待创建)                                  |
| 11  | `DisconnectInfo`            | 新定义       | Infra -> Session | (待创建)                                  |
| 12  | `ProtocolHandlers`          | 新定义       | Infra 内部       | session/types.ts                          |
| 13  | `SessionNotification`       | SDK 原样     | Infra -> Session | SDK import                                |
| 14  | ~~`SessionUpdate`~~         | ~~SDK 原样~~ | -                | (SDK 内部，通过 SessionNotification 访问) |
| 15  | `RequestPermissionRequest`  | SDK 原样     | Infra -> Session | SDK import                                |
| 16  | `RequestPermissionResponse` | SDK 原样     | Session -> Infra | SDK import                                |
| 17  | `PromptResponse`            | SDK 原样     | Infra -> Session | SDK import                                |
| 18  | `InitializeResponse`        | SDK 原样     | Infra -> Session | SDK import                                |
| 19  | ~~`RawAuthMethod`~~         | -            | -                | (已移除，SDK `AuthMethod` 直接使用)       |
| 20  | ~~`LocalProcessConfig`~~    | ~~新定义~~   | ~~Infra 内部~~   | (v1.2 移除，内部化到 ProcessAcpClient)    |
| 21  | `CreateSessionParams`       | 新定义       | Infra 内部       | types.ts                                  |
| 22  | `LoadSessionParams`         | 新定义       | Infra 内部       | types.ts                                  |
| 23  | `PromptContent`             | 新定义       | Session -> Infra | types.ts                                  |
| 24  | ~~`PromptContentItem`~~     | -            | -                | (已移除，SDK `ContentBlock` 直接使用)     |
| 25  | `SessionCallbacks`          | 新定义       | Session -> App   | types.ts                                  |
| 26  | `SessionStatus`             | 新定义       | Session -> App   | types.ts                                  |
| 27  | `QueueSnapshot`             | 新定义       | Session -> App   | types.ts                                  |
| 28  | `PermissionUIData`          | 新定义       | Session -> App   | types.ts                                  |
| 29  | `ToolKind`                  | SDK 原样     | Session -> App   | SDK import                                |
| 30  | `ConfigSnapshot`            | 新定义       | Session -> App   | types.ts                                  |
| 31  | `ModelSnapshot`             | 新定义       | Session -> App   | types.ts                                  |
| 32  | `ModeSnapshot`              | 新定义       | Session -> App   | types.ts                                  |
| 33  | `ContextUsage`              | 新定义       | Session -> App   | types.ts                                  |
| 34  | `SessionSignal`             | 新定义       | Session -> App   | types.ts                                  |
| 35  | `AuthRequiredData`          | 新定义       | Session -> App   | types.ts                                  |
| 36  | `AuthMethod`                | SDK 原样     | Session -> App   | SDK import                                |
| 37  | ~~`AuthInputField`~~        | -            | -                | (已移除，SDK `AuthEnvVar` 替代)           |
| 38  | `ConfigOption`              | SDK 简化     | Session <-> App  | types.ts                                  |
| 39  | `TMessage`                  | 现有(AionUi) | Session -> App   | types.ts (占位)                           |
| 40  | `QueuedPrompt`              | 新定义       | Session 内部     | types.ts                                  |
| 41  | `PendingPermission`         | 新定义       | Session 内部     | session/types.ts                          |
| 42  | `SessionOptions`            | 新定义       | Session 内部     | session/types.ts                          |
| 43  | `SignalEvent`               | 新定义       | App -> IPC       | types.ts                                  |
| 44  | `SessionEntry`              | 新定义       | App 内部         | (待创建)                                  |
| 45  | `ClientFactory`             | 新定义       | App 内部         | (待创建)                                  |
| 46  | `RuntimeOptions`            | 新定义       | App 内部         | types.ts                                  |
| 47  | `AgentSpawnError`           | 新定义       | 跨层             | errors/AcpError.ts                        |
| 48  | `AgentStartupError`         | 新定义       | 跨层             | errors/AcpError.ts                        |
| 49  | `AgentDisconnectedError`    | 新定义       | 跨层             | errors/AcpError.ts                        |

> **SDK 类型穿透范围**: SDK 原始类型（`SessionNotification`、`RequestPermissionRequest` 等）最远到达 AcpSession 内部。`handleSessionUpdate()` 和 `handlePermissionRequest()` 是翻译边界，之后全部是应用类型。

---

# Part 2: 不变量清单

来源：合并 7 层方案的 17 条不变量 + 评审补充的 5 条，适配到 3 层单状态机架构。Round 04 删除 INV-I-03（NpxBridgeConnector 不再存在），新增 INV-S-15（认证信号必达），最终 **23 条**。

每条不变量包含：编号、描述、形式化表达（formal expression）、验证方式、违反后果。

---

## 8. 编号规则

`INV-{层缩写}-{序号}`

| 前缀  | 层             | 范围                                                                  |
| ----- | -------------- | --------------------------------------------------------------------- |
| INV-I | Infrastructure | AcpClient 实现（ProcessAcpClient, WebSocketAcpClient）                |
| INV-S | Session        | AcpSession、组件（PermissionResolver, ConfigTracker, PromptQueue 等） |
| INV-A | Application    | AcpRuntime、IdleReclaimer、ClientFactory                              |
| INV-X | 跨层           | 跨越多个层的不变量                                                    |

---

## 9. Infrastructure 层不变量

### INV-I-01: 进程不残留

- **描述**: `close()` / `suspend` 完成后，`client.lifecycleSnapshot.running === false`；`child.unref()` 确保主进程（Electron）可正常退出。
- **形式化**: `client.close() resolved => client.lifecycleSnapshot.running === false`
- **验证方式**: T2 契约测试——验证每种 AcpClient 实现在 close 后 lifecycleSnapshot.running 返回 false。
- **违反后果**: 僵尸进程（zombie process）残留，消耗系统资源；主进程无法正常退出。
- **关联测试**: `ProcessAcpClient.spec.ts`, `WebSocketAcpClient.spec.ts`
- **场景走查**: [Doc 6 场景 1](./06-scenario-walkthrough.md#2-场景-1-创建新会话并发送第一条消息), [场景 6](./06-scenario-walkthrough.md#7-场景-6-空闲回收), [场景 8](./06-scenario-walkthrough.md#9-场景-8-websocket-远程连接)

### INV-I-02: 三阶段关闭完整性

- **描述**: ProcessAcpClient 的 `close()` 必须按顺序尝试 `stdin.end()` -> `SIGTERM` -> `SIGKILL`，不跳步。某一阶段成功退出进程后，后续阶段不执行（但不跳过顺序）。
- **形式化**: `close() 执行路径 = Phase1 -> (exit? done : Phase2 -> (exit? done : Phase3))`
- **验证方式**: T2 契约测试——mock ChildProcess，验证信号发送顺序。
- **违反后果**: 进程无法优雅关闭，数据丢失风险；或跳过 stdin.end() 直接发 SIGKILL 导致 agent 无法保存状态。
- **关联测试**: `ProcessAcpClient.spec.ts - should follow three-phase shutdown sequence`
- **场景走查**: [Doc 6 场景 4](./06-scenario-walkthrough.md#5-场景-4-会话挂起与恢复), [场景 6](./06-scenario-walkthrough.md#7-场景-6-空闲回收)

### ~~INV-I-03: NPX fallback 链有序~~（已删除）

> **Round 04 删除**: NpxBridgeConnector 因 bun 内置替代 npx 而不再存在。此不变量的约束对象已不存在，整体删除。编号不复用。

---

## 10. Session 层不变量

### INV-S-01: 单 prompt 执行

- **描述**: 任意时刻最多一个 prompt 在执行。`currentPromptId !== null` 当且仅当 `status === 'prompting'`。
- **形式化**: `(currentPromptId !== null) <=> (status === 'prompting')`
- **验证方式**: T3 编排集成测试 + property-based test（随机命令序列后检查不变量）。
- **违反后果**: 并发 prompt 导致 agent 行为不可预测，消息交错，状态机混乱。
- **关联测试**: `AcpSession.spec.ts - should never have two concurrent prompts`
- **场景走查**: [Doc 6 场景 2](./06-scenario-walkthrough.md#3-场景-2-消息排队与-drain-loop-处理)

### INV-S-02: 单队列不变（D12/评审 #22）

- **描述**: prompt 路由只有一条路径——统一入队到 PromptQueue，由 drain loop 串行出队。不存在旁路。
- **形式化**: 所有 `sendMessage()` 调用通过 `PromptQueue.enqueue()` 入队，出队只通过 `drainLoop()`。
- **验证方式**: T3 编排集成测试——连续发送 N 条消息，验证执行顺序严格 FIFO。
- **违反后果**: 消息乱序执行，用户意图被打乱。
- **关联测试**: `AcpSession.spec.ts - should execute queued prompts in FIFO order`
- **场景走查**: [Doc 6 场景 2](./06-scenario-walkthrough.md#3-场景-2-消息排队与-drain-loop-处理)

### INV-S-03: 状态收敛

- **描述**: AcpSession 任何异常路径最终归于 `active` / `suspended` / `error` 三态之一，**或**在认证等待期间保持 `starting` / `resuming` 状态（此时连接资源已释放）。不存在卡在 `starting` / `resuming` / `prompting` 的死状态（dead state）——认证等待是显式的有界等待（用户调用 `retryAuth()` 或 `stop()` 结束等待）。
- **形式化**: 对于任意异常 e，`handleError(e)` 最终将 status 转换为 `active | suspended | error` 之一。特例：`AUTH_REQUIRED` / `AUTH_FAILED` 路径保持 `starting` / `resuming` 且 `client === null`，由 `retryAuth()` 或 `stop()` 推进到下一状态。
- **验证方式**: T3 编排集成测试——注入各种故障（connect 失败、prompt 超时、进程 crash、resume 失败、认证失败），验证最终状态。
- **违反后果**: UI 永远显示"连接中"或"执行中"，用户无法操作，只能强制关闭。
- **关联测试**: `AcpSession.spec.ts - should converge to terminal state after any error`, `AcpSession.spec.ts - should stay in starting state during auth wait with resources released`
- **场景走查**: [Doc 6 场景 5](./06-scenario-walkthrough.md#6-场景-5-agent-进程崩溃与错误恢复)

### INV-S-04: Timer 与 prompt 生命周期一致

- **描述**: `prompting` 状态下 PromptTimer（由 PromptExecutor 内部管理）必须处于 `running` 或 `paused`（权限等待期间）状态；非 `prompting` 状态下 Timer 必须处于 `idle` 状态。
- **形式化**: `(status === 'prompting') => (timer.state in ['running', 'paused'])` 且 `(status !== 'prompting') => (timer.state === 'idle')`
- **验证方式**: T3 编排集成测试——在状态转换后检查 timer 状态。
- **违反后果**: 非 prompting 期间触发超时回调，导致错误地取消不存在的 prompt。
- **关联测试**: `AcpSession.spec.ts - timer should be running/paused during prompting`
- **场景走查**: [Doc 6 场景 3](./06-scenario-walkthrough.md#4-场景-3-权限审批流程)

### INV-S-05: 有队列不挂起

- **描述**: `queue.length > 0 || status === 'prompting'` 时，`suspend()` 被拒绝。
- **形式化**: `suspend()` 的前置条件是 `status === 'active' && queue.isEmpty`
- **验证方式**: T3 编排集成测试。
- **违反后果**: 队列中的 prompt 丢失，用户消息被吞。
- **关联测试**: `AcpSession.spec.ts - should reject suspend when queue is not empty`
- **场景走查**: [Doc 6 场景 4](./06-scenario-walkthrough.md#5-场景-4-会话挂起与恢复)

### INV-S-06: Crash 后队列暂停

- **描述**: agent 进程 crash -> 自动 resume 成功后，`queuePaused === true`，drain loop 不自动出队。用户必须通过 `resumeQueue()` 或 `cancelAll()` 显式决定。
- **形式化**: `handleDisconnect(wasDuringPrompt=true)` -> `resume() success` -> `queuePaused === true`
- **验证方式**: T3 编排集成测试。
- **违反后果**: crash 恢复后自动执行队列中的 prompt，但 agent 上下文可能已丢失，产生不连贯的响应。
- **关联测试**: `AcpSession.spec.ts - should pause queue after crash recovery`
- **场景走查**: [Doc 6 场景 5](./06-scenario-walkthrough.md#6-场景-5-agent-进程崩溃与错误恢复)

### INV-S-07: Error 清空队列

- **描述**: status 转入 `error` 时，队列被清空，所有 pending 状态（权限请求、进行中的 prompt）被取消。
- **形式化**: `status transition -> 'error'` => `queue.length === 0 && permissionResolver.hasPending === false && currentPromptId === null`
- **验证方式**: T3 编排集成测试。
- **违反后果**: 进入 error 状态后队列中仍有条目，若后续误恢复会执行已过时的 prompt。
- **关联测试**: `AcpSession.spec.ts - should clear queue on error state`
- **场景走查**: [Doc 6 场景 5](./06-scenario-walkthrough.md#6-场景-5-agent-进程崩溃与错误恢复)

### INV-S-08: Resume 有限重试

- **描述**: `resumeRetryCount <= maxResumeRetries`（默认 2），不存在无限重连循环。
- **形式化**: `resumeRetryCount` 单调递增，达到上限后 status -> `error`。`start()` 重置计数。
- **验证方式**: T3 编排集成测试。
- **违反后果**: 无限重连导致资源耗尽，用户看到永远的"重新连接中"。
- **关联测试**: `AcpSession.spec.ts - should not retry resume more than maxResumeRetries`
- **场景走查**: [Doc 6 场景 5](./06-scenario-walkthrough.md#6-场景-5-agent-进程崩溃与错误恢复)

### INV-S-09: 回调状态合法

- **描述**: `onStatusChange` 的状态转换序列符合状态机定义，不出现非法转换（如 `idle -> prompting`）。
- **形式化**: 每次 `setStatus(newStatus)` 调用，`(currentStatus, newStatus)` 必须在允许的转换表中。
- **验证方式**: T3 编排集成测试——记录所有状态转换，验证每一步合法。
- **违反后果**: UI 状态显示错误，用户操作与实际状态不匹配。
- **关联测试**: `AcpSession.spec.ts - should only emit valid state transitions`
- **场景走查**: [Doc 6 场景 1](./06-scenario-walkthrough.md#2-场景-1-创建新会话并发送第一条消息)

### INV-S-10: 权限不泄漏

- **描述**: `status !== 'prompting'` 时，`PermissionResolver.pendingRequests.size === 0`。
- **形式化**: `(status !== 'prompting') => (permissionResolver.hasPending === false)`
- **验证方式**: T3 编排集成测试——prompt 结束后检查 pending 为空。
- **违反后果**: 泄漏的 pending promise 在后续 prompt 中被误触发，或永远不 resolve 导致内存泄漏。
- **关联测试**: `AcpSession.spec.ts - should have no pending permissions outside prompting`
- **场景走查**: [Doc 6 场景 3](./06-scenario-walkthrough.md#4-场景-3-权限审批流程)

### INV-S-11: Model/Mode 一致

- **描述**: `SessionLifecycle.reassertConfig()` 完成后，`desiredModelId === null || desiredModelId === currentModelId`，mode 同理。
- **形式化**: `reassertConfig() resolved` => `configTracker.desiredModelId === null || configTracker.desiredModelId === configTracker.currentModelId`
- **验证方式**: T1 纯逻辑单测（ConfigTracker）+ T3 编排集成测试。
- **违反后果**: resume 后 model/mode 与用户预期不一致，agent 使用错误的模型响应。
- **关联测试**: `ConfigTracker.spec.ts - should clear desired after reassert`
- **场景走查**: [Doc 6 场景 7](./06-scenario-walkthrough.md#8-场景-7-运行中切换模型模式)

### INV-S-12: MessageTranslator 内存有界（D10 决议）

- **描述**: `MessageTranslator.messageMap` 通过 `onTurnEnd()` 增量清理已完成条目 + `reset()`（新 session 时全量清理），大小与活跃 turn 数成正比，而非总 turn 数。
- **形式化**: `messageMap.size <= activeTurnEntryCount`
- **验证方式**: T1 纯逻辑单测。
- **违反后果**: 长会话中 messageMap 无限增长，导致内存泄漏。
- **关联测试**: `MessageTranslator.spec.ts - should clean up completed entries on turn end`

### INV-S-13: ApprovalCache 内存有界（评审 #19）

- **描述**: ApprovalCache 条目数 <= 500（LRU 淘汰）。ApprovalCache 已合并到 PermissionResolver.ts 同文件中。
- **形式化**: `approvalCache.size <= maxSize`（默认 500）
- **验证方式**: T1 纯逻辑单测。
- **违反后果**: 权限缓存无限增长，内存泄漏。
- **关联测试**: `ApprovalCache.spec.ts - should evict oldest entries when exceeding max size`（从 PermissionResolver 导入）
- **场景走查**: [Doc 6 场景 3](./06-scenario-walkthrough.md#4-场景-3-权限审批流程)

### INV-S-14: PromptQueue 有界（D10 决议）

- **描述**: `PromptQueue.items.length <= maxSize`（默认 5）。满时 `enqueue()` 返回 `false`，不丢弃旧消息。
- **形式化**: `queue.length <= queue.maxSize`，`enqueue() when full => return false`
- **验证方式**: T1 纯逻辑单测。
- **违反后果**: 队列无限增长，或满时静默丢弃旧消息导致用户消息丢失。
- **关联测试**: `PromptQueue.spec.ts - should reject enqueue when full`
- **场景走查**: [Doc 6 场景 2](./06-scenario-walkthrough.md#3-场景-2-消息排队与-drain-loop-处理)

### INV-S-15: 认证信号必达

- **描述**: 若 agent 要求认证（`InitializeResponse` 含 `authMethods`）且当前没有可用凭据（`AuthNegotiator.hasCredentials` 为 `false`），或认证调用失败（`AUTH_FAILED`），AcpSession 必须通过 `callbacks.onSignal({ type: 'auth_required', auth })` 通知 Application 层。认证等待期间连接资源已释放（`SessionLifecycle.teardown()` 完成）。`retryAuth()` 调用后走 reset 模式：`SessionLifecycle.retryAuth()` 重新执行 `doStart()` 完整流程（client.start -> createSession），不继续之前中断的握手。
- **形式化**:
  ```
  (requiresAuth(initResult) && !authNegotiator.hasCredentials)
  || (authenticate() throws AUTH_FAILED)
  => callbacks.onSignal({ type: 'auth_required', auth }) 被调用
  && status 保持 'starting' 或 'resuming'
  && client === null
  ```
- **验证方式**: T3 编排集成测试。
- **违反后果**: Application 层无法得知认证需求，UI 无法展示登录界面，用户无法完成认证流程，session 启动永远无法完成。
- **关联测试**: `AcpSession.spec.ts - should emit auth_required and release resources when no credentials`, `AcpSession.spec.ts - should emit auth_required on AUTH_FAILED instead of entering error state`, `AcpSession.spec.ts - should restart full handshake on retryAuth`, `AcpSession.spec.ts - should settle auth state on stop()`

---

## 11. Application 层不变量

### INV-A-01: 持久化一致

- **描述**: DB 中 `suspended_at IS NOT NULL` 当且仅当 AcpSession `status === 'suspended'`。
- **形式化**: `db.suspended_at !== null` <=> `session.status === 'suspended'`
- **验证方式**: T4 Runtime 集成测试。
- **违反后果**: DB 记录与运行时状态不一致——resume 时从 DB 恢复出错误状态，或 UI 显示已挂起但实际仍在运行。
- **关联测试**: `AcpRuntime.spec.ts - should persist suspended_at in sync with session status`
- **场景走查**: [Doc 6 场景 4](./06-scenario-walkthrough.md#5-场景-4-会话挂起与恢复)

### INV-A-02: 空闲回收安全

- **描述**: IdleReclaimer 只回收满足以下全部条件的 session：`status === 'active'` 且 `queue.isEmpty` 且 `now - lastActiveAt > idleTimeoutMs`。不回收 prompting、starting、resuming 状态的 session。
- **形式化**: `reclaimIdle()` 仅在上述三个条件同时满足时调用 `session.suspend()`。
- **验证方式**: T4 Runtime 集成测试。
- **违反后果**: 回收正在执行 prompt 的 session，导致用户正在进行的对话被中断。
- **关联测试**: `IdleReclaimer.spec.ts - should not reclaim active prompting sessions`
- **场景走查**: [Doc 6 场景 6](./06-scenario-walkthrough.md#7-场景-6-空闲回收)

---

## 12. 跨层不变量

### INV-X-01: 类型边界

- **描述**: AcpRuntime 收到的所有数据均为应用类型（`TMessage` / `SignalEvent`），不含 SDK 协议类型（如 `SessionNotification`、`RequestPermissionRequest`）。
- **形式化**: `SessionCallbacks` 的所有参数类型中不出现 `@agentclientprotocol/sdk` 的导入。
- **验证方式**: 编译期检查（确保 `session/types.ts` 不从 SDK 重新导出原始类型到 callback 参数）+ T2 契约测试。
- **违反后果**: SDK 类型泄漏到 Application 层，导致紧耦合，SDK 升级时变更波及全栈。
- **关联测试**: `SessionCallbacks.contract.spec.ts - callback parameters should not contain SDK types`

### INV-X-02: 队列快照完整

- **描述**: `onQueueUpdate` 每次推送完整快照（`QueueSnapshot`），不依赖增量。Application 层直接替换 UI 状态。
- **形式化**: `onQueueUpdate(snapshot)` 中 `snapshot.items` 包含队列的全部条目，`snapshot.length === snapshot.items.length`。
- **验证方式**: T3 编排集成测试。
- **违反后果**: 增量更新丢失导致 UI 队列显示与实际不一致，用户看到幽灵条目或缺失条目。
- **关联测试**: `AcpSession.spec.ts - should push complete queue snapshot on every update`
- **场景走查**: [Doc 6 场景 2](./06-scenario-walkthrough.md#3-场景-2-消息排队与-drain-loop-处理)

### INV-X-03: 背压架构预留（D6 决议）

- **描述**: `handleSessionUpdate -> callbacks.onMessage` 路径设计为可插入缓冲的管道结构（不使用硬编码的同步调用链），确保 Phase 2 可以无侵入地在 AcpRuntime 层的 `onMessage` callback 中加入 `BoundedBuffer`。
- **形式化**: `onMessage` callback 是独立的函数调用，不与 `handleSessionUpdate` 的同步逻辑耦合（即不在同一个 try-catch 块中）。
- **验证方式**: Code review + T3 编排集成测试（验证 onMessage 抛异常不影响 handleSessionUpdate 的后续处理）。
- **违反后果**: Phase 2 需要背压控制时，必须重构消息路径，侵入 AcpSession 内部逻辑。
- **关联测试**: `AcpSession.spec.ts - should continue processing updates even if onMessage callback throws`

### INV-X-04: Pending 不泄漏

- **描述**: 进程退出后，不存在未 resolve/reject 的 pending promise（包括 prompt promise、permission promise）。
- **形式化**: `handleDisconnect()` 执行后，`permissionResolver.hasPending === false`，所有与 protocol 相关的 promise 已 settle。
- **验证方式**: T3 编排集成测试。
- **违反后果**: 泄漏的 promise 永远不 settle，导致内存泄漏和潜在的状态不一致（如 timer 不清理）。
- **关联测试**: `AcpSession.spec.ts - should settle all pending promises after disconnect`
- **场景走查**: [Doc 6 场景 5](./06-scenario-walkthrough.md#6-场景-5-agent-进程崩溃与错误恢复)

---

## 13. 不变量总结表

| 编号         | 简述                         | 层             | 测试层级    | 原始编号                           |
| ------------ | ---------------------------- | -------------- | ----------- | ---------------------------------- |
| INV-I-01     | 进程不残留                   | Infrastructure | T2          | 原 #12                             |
| INV-I-02     | 三阶段关闭完整性             | Infrastructure | T2          | 新增                               |
| ~~INV-I-03~~ | ~~NPX fallback 链有序~~      | -              | -           | **Round 04 删除**                  |
| INV-S-01     | 单 prompt 执行               | Session        | T3          | 原 #9                              |
| INV-S-02     | 单队列不变                   | Session        | T3          | 评审 #22                           |
| INV-S-03     | 状态收敛                     | Session        | T3          | 原 #4 (合并 #2)                    |
| INV-S-04     | Timer 与 prompt 生命周期一致 | Session        | T3          | 替代原 #3                          |
| INV-S-05     | 有队列不挂起                 | Session        | T3          | 原 #5                              |
| INV-S-06     | Crash 后队列暂停             | Session        | T3          | 原 #6                              |
| INV-S-07     | Error 清空队列               | Session        | T3          | 原 #7                              |
| INV-S-08     | Resume 有限重试              | Session        | T3          | 原 #8                              |
| INV-S-09     | 回调状态合法                 | Session        | T3          | 原 #10                             |
| INV-S-10     | 权限不泄漏                   | Session        | T3          | 原 #16                             |
| INV-S-11     | Model/Mode 一致              | Session        | T1 + T3     | 原 #17                             |
| INV-S-12     | MessageTranslator 内存有界   | Session        | T1          | D10 决议                           |
| INV-S-13     | ApprovalCache 内存有界       | Session        | T1          | 评审 #19 (合入 PermissionResolver) |
| ~~INV-S-14~~ | ~~PromptQueue 有界~~         | -              | -           | **已删除** (PromptQueue 已移除)    |
| INV-S-15     | 认证信号必达                 | Session        | T3          | 新（认证架构设计）                 |
| INV-A-01     | 持久化一致                   | Application    | T4          | 原 #13                             |
| INV-A-02     | 空闲回收安全                 | Application    | T4          | 原 #5 扩展                         |
| INV-X-01     | 类型边界                     | 跨层           | T2 + 编译期 | 原 #11                             |
| INV-X-02     | 队列快照完整                 | 跨层           | T3          | 原 #15                             |
| INV-X-03     | 背压架构预留                 | 跨层           | T3 + Review | D6 决议 / 评审 #18                 |
| INV-X-04     | Pending 不泄漏               | 跨层           | T3          | 原 #1                              |

### 测试层级分布

| 测试层级        | 不变量数 | 编号                                              |
| --------------- | -------- | ------------------------------------------------- |
| T1 纯逻辑单测   | 3        | INV-S-12, INV-S-13, INV-S-14                      |
| T1 + T3         | 1        | INV-S-11                                          |
| T2 契约测试     | 2        | INV-I-01, INV-I-02                                |
| T2 + 编译期     | 1        | INV-X-01                                          |
| T3 编排集成     | 12       | INV-S-01 ~ INV-S-10, INV-S-15, INV-X-02, INV-X-04 |
| T3 + Review     | 1        | INV-X-03                                          |
| T4 Runtime 集成 | 2        | INV-A-01, INV-A-02                                |

---

> **参考文档**:
>
> - 类型定义源: [type-catalog.md](../round-02/arch-b/type-catalog.md)
> - 不变量定义源: [invariants.md](../round-02/arch-b/invariants.md)
> - 跨层共享类型实现: [types.ts](../round-03/src/process/acp/types.ts)
> - 会话层类型实现: [session/types.ts](../round-03/src/process/acp/session/types.ts)
