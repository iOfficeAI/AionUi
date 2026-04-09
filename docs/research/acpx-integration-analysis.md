# acpx 集成分析：AionUI 评估报告

> 调研日期：2026-04-08
> 仓库地址：https://github.com/openclaw/acpx (v0.5.3)

## 目录

- [1. 概要结论](#1-概要结论)
- [2. acpx 项目概览](#2-acpx-项目概览)
- [3. AionUI ACPAgentManager 概览](#3-aionui-acpagentmanager-概览)
- [4. 两者对比](#4-两者对比)
- [5. 痛点分析](#5-痛点分析)
  - [5.1 资源浪费（每会话一个进程）](#51-资源浪费每会话一个进程)
  - [5.2 连接复杂度（逐 Agent 适配）](#52-连接复杂度逐-agent-适配)
- [6. ACP 协议深入分析](#6-acp-协议深入分析)
  - [6.1 Agent 能力协商机制](#61-agent-能力协商机制)
  - [6.2 Claude vs Codex 能力矩阵](#62-claude-vs-codex-能力矩阵)
  - [6.3 多会话可行性分析](#63-多会话可行性分析)
- [7. 历史会话进入慢的根因分析](#7-历史会话进入慢的根因分析)
- [8. 方案设计](#8-方案设计)
  - [8.1 待命进程池](#81-待命进程池)
  - [8.2 基于能力的恢复策略](#82-基于能力的恢复策略)
  - [8.3 Agent 注册表简化](#83-agent-注册表简化)
- [9. acpx 数据后置处理分析](#9-acpx-数据后置处理分析)
  - [9.1 会话更新转换层](#91-会话更新转换层)
  - [9.2 运行时事件转换层](#92-运行时事件转换层)
  - [9.3 错误归一化层](#93-错误归一化层)
  - [9.4 内存裁剪机制](#94-内存裁剪机制)
  - [9.5 持久化序列化/反序列化](#95-持久化序列化反序列化)
  - [9.6 与 AionUI 对比及建议](#96-与-aionui-对比及建议)
- [10. 迁移成本评估](#10-迁移成本评估)
- [11. 建议与行动项](#11-建议与行动项)

---

## 1. 概要结论

本文档记录了对 [acpx](https://github.com/openclaw/acpx) 项目的全面分析，以及将其与 AionUI 的 ACP Agent 管理层进行整合的可行性评估。分析围绕 AionUI 的两个核心痛点展开：

1. **资源浪费**：每个会话都会启动一个独立的子进程（每个 ~80-200 MB）
2. **连接复杂度**：每种 Agent 后端都需要分散在多个文件中的定制适配代码

**核心发现：**

| 痛点       | acpx 帮助程度  | 原因                                                                                                     |
| ---------- | :------------: | -------------------------------------------------------------------------------------------------------- |
| 资源浪费   |    **<5%**     | PR #2260 已实现空闲超时 + 可靠清理。acpx 的 Queue Owner 模型功能上等价。                                 |
| 连接复杂度 |   **70-80%**   | acpx 的扁平注册表 + 统一 Runtime API 显著减少了逐后端的分支逻辑。                                        |
| 数据处理   | **高价值借鉴** | acpx 对 ACP 数据做了 5 层后置处理（转换、归一化、裁剪、错误分类、持久化），AionUI 几乎直接透传原始数据。 |

**关键发现：acpx 实际上并不支持单进程多会话复用** —— 它为每个会话创建一个独立的 `AcpClient`，和 AionUI 的做法一样。但是，ACP **协议本身**通过 `session/load` 支持多会话（Claude 和 Codex 都声明 `loadSession: true`），AionUI 可以独立实现进程池。

**推荐方案：** 不建议整体迁移到 acpx，而是选择性地采用以下模式：

- 待命进程池 —— 消除历史会话进入时的慢启动
- 基于能力的恢复逻辑 —— 替换硬编码的后端类型判断
- 扁平注册表模式 —— 简化新 Agent 的接入流程
- 数据归一化层 —— 在主进程侧对 ACP 数据做转换、裁剪和错误分类，解耦 UI 与协议细节

---

## 2. acpx 项目概览

**acpx** 是一个无头 CLI 客户端，基于 Agent Client Protocol (ACP) 协议，为多种 ACP 兼容 Agent 提供统一的命令行操作界面。

### 架构

```
CLI 层 (commander.js)
    ↓
ACP 通信层 (AcpClient — 基于 stdio 的 JSON-RPC)
    ↓
会话管理层 (会话模型 + 持久化)
    ↓
运行时执行层 (AcpxRuntime)
    ↓
Flow 系统 (多步骤工作流编排)
```

### 关键指标

| 指标              | 数值                                             |
| ----------------- | ------------------------------------------------ |
| 支持的 Agent 数量 | 16 个（claude、codex、gemini、copilot、qwen 等） |
| 测试文件          | 89 个                                            |
| 覆盖率            | 行覆盖 83%，分支覆盖 76%，函数覆盖 86%           |
| Node.js 要求      | ≥ 22.12.0                                        |
| ACP SDK 版本      | @agentclientprotocol/sdk ^0.18.0                 |

### 核心功能

- **Agent 注册表**：扁平的 `Record<string, string>` 映射表，Agent 名 → Shell 命令
- **会话管理**：支持持久化会话、崩溃恢复和优雅关闭
- **Queue Owner**：每个会话作用域一个进程，通过 Unix Domain Socket 实现 IPC prompt 排队
- **权限系统**：三级模型（全拒绝 / 允许读 / 全允许）
- **Flow 系统**：基于 TypeScript 定义的多节点工作流编排
- **错误处理**：50+ 个类型化错误类，统一归一化处理

### Runtime API（库消费者接口）

```typescript
interface AcpRuntime {
  ensureSession(input): Promise<AcpRuntimeHandle>;
  runTurn(input): AsyncIterable<AcpRuntimeEvent>;
  cancel(input): Promise<void>;
  close(input): Promise<void>;
  getCapabilities?(input): Promise<AcpRuntimeCapabilities>;
  getStatus?(input): Promise<AcpRuntimeStatus>;
  setMode?(input): Promise<void>;
  setConfigOption?(input): Promise<void>;
}
```

### Node 版本兼容性问题

| 组件                          | Node 版本     |
| ----------------------------- | ------------- |
| Electron 37.3.1 (AionUI) 内置 | **22.7.7**    |
| acpx 最低要求                 | **≥ 22.12.0** |

acpx 无法直接在 Electron 主进程中引入。可选方案：作为子进程 CLI 调用、使用系统 Node 的 Worker 进程、或提取兼容的模块。

---

## 3. AionUI ACPAgentManager 概览

### 架构

```
渲染进程 (AcpChat, AcpSendBox)
    ↓ ipcBridge.acpConversation
主进程
    ↓
AcpAgentManager (extends BaseAgentManager) — 1,366 行
    ↓
AcpAgent (协议处理器) — 1,720 行
    ↓
AcpConnection (JSON-RPC 实现) — 1,190 行
    ↓
子进程 (claude CLI, qwen CLI 等)
```

### 关键文件

| 文件                                     |  行数  | 职责                    |
| ---------------------------------------- | :----: | ----------------------- |
| `src/process/task/AcpAgentManager.ts`    | 1,366  | 主编排器                |
| `src/process/agent/acp/index.ts`         | 1,720  | AcpAgent 协议处理器     |
| `src/process/agent/acp/AcpConnection.ts` | 1,190  | JSON-RPC + 子进程管理   |
| `src/process/agent/acp/AcpDetector.ts`   |  346   | 三源 Agent 发现         |
| `src/process/agent/acp/acpConnectors.ts` |  ~600  | 逐后端的 spawn 逻辑     |
| `src/common/types/acpTypes.ts`           | ~1,027 | 后端注册表（21 个后端） |

### 测试覆盖

**零** ACP 专用单元测试。仅通过手动 UI 测试进行集成验证。

---

## 4. 两者对比

| 维度       | acpx                       | AionUI ACPAgentManager                             |
| ---------- | -------------------------- | -------------------------------------------------- |
| 定位       | 无头 CLI ACP 客户端        | Electron GUI ACP 编排器                            |
| 协议层     | `@agentclientprotocol/sdk` | 自定义 JSON-RPC (AcpConnection)                    |
| 会话管理   | 统一的 Runtime API         | 逐后端的恢复策略                                   |
| 权限系统   | 三级模型                   | ApprovalStore + yoloMode + sessionMode（3 个来源） |
| Agent 发现 | 扁平注册表 + 配置文件      | 三源检测（内置 + 扩展 + 自定义）                   |
| 错误处理   | 50+ 类型化错误类           | 临时性分类                                         |
| 测试覆盖   | 89 个文件，行覆盖 83%      | **零** ACP 专用测试                                |
| 进程模型   | 每个会话记录一个 AcpClient | 每个会话一个子进程                                 |
| 新增 Agent | 注册表加一行               | 修改 3+ 个文件，可能需要专用 connector             |

---

## 5. 痛点分析

### 5.1 资源浪费（每会话一个进程）

**AionUI 当前模型：**

```
会话 1 (claude) → 进程 1 (80-200 MB)
会话 2 (claude) → 进程 2 (80-200 MB)
会话 3 (claude) → 进程 3 (80-200 MB)
───────────────────────────────────────
3 个 claude 会话 = 3 个进程 ≈ 240-600 MB
```

- 每次 `AcpAgentManager.initAgent()` 都会启动一个独立子进程
- 会话之间零复用（session ID 按会话隔离）
- 后台会话一直存活，直到空闲超时或用户关闭

**PR #2260 已有改进：**

- SIGTERM→SIGKILL 升级，3 秒宽限期
- 通过 `ps -eo pid=,ppid=` 收集后代 PID，防止孤儿进程
- 终止前尽力发送 `session/close`
- 可配置空闲超时（默认 5 分钟，原来是 30 分钟）
- 基于 stream/signal 事件的活动追踪

**acpx 的 Queue Owner 模型：**

- 每个会话作用域（agent + 目录 + 会话名）一个进程
- 基于心跳的租约机制（15 秒过期检测）
- 通过 Unix Domain Socket 的 prompt 排队

**评估：** PR #2260 实现的空闲超时 + 可靠清理，在功能上已经和 acpx 的 Queue Owner 模型等价。**acpx 在资源浪费问题上的额外价值 <5%。**

### 5.2 连接复杂度（逐 Agent 适配）

**AionUI 现状 —— 3+ 个文件中分布着 20+ 个条件分支：**

```typescript
// acpConnectors.ts — 逐后端的 spawn 逻辑
connectClaude()     → npx + Phase1/2 重试 + detached
connectCodex()      → 缓存二进制 → 平台包 → meta 包（3 层降级）
connectCodebuddy()  → npx + mcp.json 注入
spawnGenericBackend() → 其他所有

// index.ts — 逐后端的恢复策略
if (backend === 'codex')  → session/load
if (backend === 'claude') → session/new + _meta.claudeCode.options.resume
else                      → session/new + resumeSessionId

// AcpAgentManager.ts — 逐后端的 yolo 模式
if (claude)  → 'bypassPermissions'
if (qwen)    → 'yolo'
```

**acpx 的方案 —— 扁平注册表 + 集中的特殊处理：**

```typescript
// agent-registry.ts — 每个 Agent 一行
const AGENT_REGISTRY = {
  claude: 'npx -y @agentclientprotocol/claude-agent-acp@^0.25.0',
  codex: 'npx @zed-industries/codex-acp@^0.11.1',
  qwen: 'qwen --acp',
  // ... 16 个 Agent，纯命令字符串
};

// agent-command.ts — 所有特殊处理集中在一个文件
// 只有 4 个 Agent 有特殊逻辑，其余 12 个零特殊代码
```

**对比：**

| 维度              | AionUI                   | acpx                    |
| ----------------- | ------------------------ | ----------------------- |
| Agent 差异分布    | 分散在 3+ 个文件         | 集中在 agent-command.ts |
| 恢复策略          | 3 种不同策略，逐后端判断 | 统一的 `ensureSession`  |
| 新增 Agent        | 修改 3+ 个文件           | 注册表加一行            |
| 能力协商          | 无                       | 无                      |
| 非 ACP Agent 支持 | 不支持                   | 不支持                  |

**评估：acpx 提供 70-80% 的改善**，通过集中逐 Agent 逻辑和提供统一接口来实现。

---

## 6. ACP 协议深入分析

### 6.1 Agent 能力协商机制

在 `initialize` 握手过程中，Agent 会声明其支持的能力：

```
客户端 → Agent: initialize({ clientCapabilities: { fs, terminal, ... } })
Agent → 客户端: { agentCapabilities: { loadSession, sessionCapabilities, ... } }
```

```typescript
// ACP SDK v0.18 — AgentCapabilities 类型定义
type AgentCapabilities = {
  loadSession?: boolean; // 是否支持 session/load
  sessionCapabilities?: {
    close?: {}; // session/close（不稳定）
    fork?: {}; // session/fork（不稳定）
    list?: {}; // session/list
    resume?: {}; // session/resume — 轻量恢复，无重放（不稳定）
  };
  promptCapabilities?: { image?; audio?; embeddedContext? };
  mcpCapabilities?: { http?; sse? };
};

// 默认值（来自 SDK Zod schema）：
// loadSession: false
// sessionCapabilities: {}
```

**acpx 使用能力做运行时决策：**

```typescript
// client.ts — 能力检查
supportsLoadSession(): boolean {
  return Boolean(this.initResult?.agentCapabilities?.loadSession);
}

// reconnect.ts — 三路决策
if (reusingLoadedSession)              → 复用（同一会话仍然加载中）
else if (client.supportsLoadSession()) → session/load（带降级到 session/new）
else                                   → session/new（全新会话）
```

**AionUI 当前并未解析 `agentCapabilities`** —— 而是硬编码后端类型判断。

### 6.2 Claude vs Codex 能力矩阵

从实际运行的 Agent 中捕获的 `initialize` 响应：

| 能力                                 | Claude (`claude-agent-acp@0.21.0`) | Codex (`codex-acp@0.10.0`) |
| ------------------------------------ | :--------------------------------: | :------------------------: |
| **`loadSession`**                    |              **true**              |          **true**          |
| `sessionCapabilities.list`           |                支持                |            支持            |
| `sessionCapabilities.close`          |               不支持               |          **支持**          |
| `sessionCapabilities.fork`           |              **支持**              |           不支持           |
| `sessionCapabilities.resume`         |              **支持**              |           不支持           |
| `promptCapabilities.image`           |                支持                |            支持            |
| `promptCapabilities.embeddedContext` |                支持                |            支持            |
| `mcpCapabilities.http`               |                支持                |            支持            |
| `mcpCapabilities.sse`                |                支持                |           不支持           |
| `_meta.claudeCode.promptQueueing`    |                支持                |             —              |

**多会话场景下的关键差异：**

| 场景             | Claude                        | Codex                                    |
| ---------------- | ----------------------------- | ---------------------------------------- |
| 切换到另一个会话 | `loadSession(B)`              | `loadSession(B)`                         |
| 关闭不用的会话   | 不支持（无 `close`）          | `session/close` — 主动释放               |
| 从现有会话分叉   | `session/fork` — 保留上下文   | 不支持                                   |
| 轻量恢复         | `session/resume` — 无历史重放 | 不支持，必须用 `loadSession`（完整重放） |

### 6.3 多会话可行性分析

**关键发现：`loadSession: true` 并不自动意味着"一个进程，多个并发会话"。**

`loadSession` 的含义是 Agent 支持 `session/load` RPC 方法 —— 通过 session ID 加载之前创建的会话。协议并未规定是否可以同时"激活"多个会话。

**协议设计信号：**

- `session/prompt` 需要 `sessionId` 参数 → 暗示按会话路由
- `session/update` 通知携带 `sessionId` → 暗示多会话感知
- `session/cancel` 可以指定 `sessionId` → 暗示可能支持并发会话

**但协议并未强制要求支持并发会话。** 两种可能的 Agent 实现模式：

| 模式         | 行为                         | `loadSession(B)` 后发 `session/prompt(A)` |
| ------------ | ---------------------------- | ----------------------------------------- |
| **独占模式** | 同时只有一个会话处于激活状态 | 未定义 — 可能报错                         |
| **共存模式** | 多个会话同时驻留内存         | 正常工作 — 按 sessionId 路由              |

**acpx 的实际行为（来自代码分析）：**

```typescript
// manager.ts:221 — 每个会话记录一个 AcpClient
private readonly pendingPersistentClients = new Map<string, AcpClient>();

// manager.ts:531 — 每轮结束后进程被关闭
await client.close().catch(() => {});
```

**acpx 为每个会话创建一个 client（一个进程），并不做多会话复用。** Queue Owner 的"复用"仅限于避免同一会话在不同 turn 之间重复 spawn。

**需要验证：** 要确定 Claude/Codex 是否支持共存模式，需要执行以下测试：

```
1. initialize
2. session/new → sessionId = A
3. session/prompt(A, "记住 42")
4. session/new → sessionId = B
5. session/prompt(B, "记住 99")
6. session/prompt(A, "之前的数字是什么？")  ← 关键测试
   如果回答 42 → 共存模式（无需 loadSession 即可切换）
   如果报错    → 独占模式（每次 prompt 前必须 loadSession）
```

---

## 7. 历史会话进入慢的根因分析

用户进入历史会话并发送消息时，完整的启动链路会执行：

```
用户进入历史会话 → 发送消息
    │
    ├── sendMessage() → initAgent() → AcpAgent.start()
    │
    │   ① spawn 子进程                ← 1-5 秒（npx 下载/缓存）
    │   ② initialize 握手            ← ~1 秒
    │   ③ authenticate               ← ~0.5 秒
    │   ④ createOrResumeSession      ← 0.5-10 秒（取决于历史长度）
    │   ⑤ setMode / setModel / config ← ~0.5-1 秒
    │
    └── agent.sendMessage(prompt)    ← 实际消息发出
```

**总延迟：3-18 秒**（用户感知的从进入会话到收到响应的时间）。

AionUI 已有 `ACP_PERF=1` 日志来测量每一步：

```
[ACP-PERF] start: connection.connect() completed XXXms    // ① + ②
[ACP-PERF] start: authentication completed XXXms          // ③
[ACP-PERF] start: session created XXXms                   // ④
[ACP-PERF] start: model set XXXms                         // ⑤
[ACP-PERF] start: total XXXms
```

**瓶颈不仅仅是 `loadSession`** —— 步骤 ①②③（spawn + init + auth）贡献了 2-7 秒的**固定开销**，这些开销完全可以被消除。

### loadSession vs resume：重放开销对比

| 方法                       | 行为                                                       | 开销             |
| -------------------------- | ---------------------------------------------------------- | ---------------- |
| `session/load`             | Agent 从磁盘加载会话，通过 session/update 重放完整对话历史 | 与对话长度成正比 |
| `session/resume`（不稳定） | Agent 恢复会话但不重放历史                                 | 接近零           |

- **Claude** 同时支持 `loadSession` 和 `resume` → 可以使用轻量恢复
- **Codex** 只支持 `loadSession` → 每次都必须承受重放开销

---

## 8. 方案设计

### 8.1 待命进程池

**问题：** 每次进入历史会话都要承受完整的 ①-⑤ 启动开销。

**核心洞察：** 步骤 ①②③（spawn + init + auth）是**后端级别**的，不是会话级别的。它们可以每个后端只做一次，然后在该后端的所有会话间复用。

**设计：**

```
应用启动
  │
  ├── 检测用户有 claude 历史 → 后台：spawn 1 个 claude 进程
  │   spawn + initialize + authenticate → READY（不做 loadSession）
  │
  ├── 用户浏览会话 A → 没发消息 → 零开销
  ├── 用户浏览会话 B → 没发消息 → 零开销
  │
  └── 用户在会话 B 发消息 → 取待命进程 → loadSession(B) → prompt
                            只需步骤 ④    ← 节省 2-7 秒
```

**触发策略：**

| 事件              |         启动进程？         | 执行 loadSession？ |
| ----------------- | :------------------------: | :----------------: |
| 应用打开          | 是（后台，按已使用的后端） |         否         |
| 用户切换/浏览会话 |             否             |         否         |
| 用户发送消息      |        否（已就绪）        |  是（绑定到会话）  |
| 进程空闲超时      |  杀掉 → 补充新的待命进程   |         —          |

**实现草案：**

```typescript
class WorkerTaskManager {
  private items: Map<string, TaskItem>;  // 现有
  private standby: Map<AcpBackend, AcpConnection> = new Map();  // 新增

  async warmup() {
    const backends = getUsedBackends();  // 查询 DB 中有历史的后端
    for (const backend of backends) {
      this.prepareStandby(backend);  // 异步，非阻塞
    }
  }

  private async prepareStandby(backend: AcpBackend) {
    const conn = new AcpConnection();
    await conn.connect(backend, cliPath, workspace);
    // 到这里为止 —— 不做 loadSession
    this.standby.set(backend, conn);
  }

  async getReadyConnection(backend: AcpBackend): Promise<AcpConnection> {
    const conn = this.standby.get(backend);
    if (conn?.isConnected) {
      this.standby.delete(backend);
      this.prepareStandby(backend);  // 异步：补充
      return conn;
    }
    // 降级：没有可用的待命进程
    const fresh = new AcpConnection();
    await fresh.connect(backend, ...);
    return fresh;
  }
}
```

**资源开销：**

| 场景                  | 当前               | 有待命进程池                |
| --------------------- | ------------------ | --------------------------- |
| 用户有 claude + codex | 0 个进程（等消息） | 2 个待命（~200-400 MB）     |
| 用户浏览 10 个会话    | 0 个进程           | 仍然 2 个（不增长）         |
| 用户发送消息          | spawn 等待 3-18 秒 | **仅 loadSession 0.5-数秒** |

### 8.2 基于能力的恢复策略

**问题：** AionUI 用硬编码的 `if (backend === 'codex')` 来选择恢复策略。

**当前代码**（`index.ts:1525-1537`）：

```typescript
if (this.extra.backend === 'codex') {
  await this.connection.loadSession(resumeSessionId, ...);
} else {
  await this.connection.newSession(..., { resumeSessionId });
}
```

**改进方案：**

```typescript
const caps = this.connection.getInitializeResponse()?.agentCapabilities;

if (caps?.sessionCapabilities?.resume) {
  // 轻量恢复 — 无历史重放（Claude 支持）
  await this.connection.resumeSession(resumeSessionId, ...);
} else if (caps?.loadSession) {
  // 完整加载并重放历史（Claude、Codex 都支持）
  await this.connection.loadSession(resumeSessionId, ...);
} else {
  // 不支持恢复 — 创建全新会话
  await this.connection.newSession(...);
}
```

**收益：**

- 新增 Agent 零代码改动
- Claude 可以使用轻量的 `session/resume` 而非完整的 `session/load`
- 自动适应 Agent 能力升级

### 8.3 Agent 注册表简化

**问题：** AionUI 的 `ACP_BACKENDS_ALL` 要求每个后端提供完整的配置对象（10+ 字段），而 spawn 逻辑分散在专用的 connector 函数中。

**借鉴 acpx 的模式 —— 将命令注册表与 UI 元数据分离：**

```typescript
// 第一层：扁平命令注册表（模仿 acpx）
const AGENT_COMMANDS: Record<string, string> = {
  claude: 'npx -y @zed-industries/claude-agent-acp@0.21.0',
  codex: 'npx @zed-industries/codex-acp@0.9.5',
  qwen: 'qwen --acp',
  gemini: 'gemini --acp',
  // 新增 Agent = 加一行
};

// 第二层：UI 元数据（AionUI 特有，acpx 不需要）
const AGENT_UI_META: Record<string, AgentUIMeta> = {
  claude: { name: 'Claude', icon: '...', authRequired: false },
  codex: { name: 'Codex', icon: '...', authRequired: true },
};

// 统一 spawn — 替代 connectClaude/connectCodex/connectCodebuddy
function spawnAgent(agentId: string): ChildProcess {
  const command = AGENT_COMMANDS[agentId];
  return spawn(parseCommand(command), parseArgs(command), {
    env: prepareCleanEnv(),
    detached: process.platform !== 'win32',
  });
}
```

**此模式无法替代的 AionUI 特有需求：**

- 扩展 Agent 热加载（ExtensionRegistry）
- `which` 检测用于 UI 展示可用 Agent
- Codex 平台特定包降级
- npm 缓存自动修复
- Electron 环境隔离（NODE_OPTIONS 清理）
- 预置 Agent 模板

---

## 9. acpx 数据后置处理分析

acpx 对 ACP 协议返回的原始数据做了**大量的后置解析和处理**，而非简单透传。主要体现在五个层面。

### 9.1 会话更新转换层

**核心文件：** `src/session/conversation-model.ts`

这是最核心的一层。acpx 将 ACP 协议原始的 `SessionNotification` 转换为自己定义的 `SessionConversation` 模型：

```typescript
// recordSessionUpdate() — 接收 ACP 原始通知，转为 acpx 自有模型
switch (update.sessionUpdate) {
  case "agent_message_chunk":
    // ACP ContentBlock → acpx SessionAgentContent { Text: string }
    extractText(content) → appendAgentText(agent, text)

  case "agent_thought_chunk":
    // ACP ContentBlock → acpx { Thinking: { text, signature } }
    extractText(content) → appendAgentThinking(agent, text)

  case "tool_call" / "tool_call_update":
    // ACP ToolCall → acpx SessionToolUse { id, name, raw_input, input, is_input_complete }
    applyToolCallUpdate(agent, update)

  case "usage_update":
    // ACP UsageUpdate → acpx SessionTokenUsage
    // 做了字段名归一化：inputTokens → input_tokens, cachedWriteTokens → cache_creation_input_tokens
    usageToTokenUsage(update)

  case "user_message_chunk":
    // ACP ContentBlock → acpx SessionUserContent { Text | Mention | Image }
    contentToUserContent(content)
}
```

**关键转换细节：**

| ACP 原始数据                                       | acpx 处理                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ContentBlock` (text/resource/resource_link/image) | → `SessionUserContent` (Text/Mention/Image) 或纯文本提取                                                            |
| `ToolCall.rawInput` (任意类型)                     | → `toRawInput()` 序列化为字符串，截断到 4,000 字符                                                                  |
| `ToolCall.rawOutput`                               | → `toToolResultContent()` 序列化为 Text 或 `[Unserializable value]`                                                 |
| `ToolCall.status`                                  | → `statusIndicatesComplete()` 字符串匹配（complete/done/success/failed/error/cancel）                               |
| `UsageUpdate` 各种命名风格                         | → 统一为 snake_case，兼容 `inputTokens`/`input_tokens`/`cachedWriteTokens`/`cache_creation_input_tokens` 等多种命名 |

### 9.2 运行时事件转换层

**核心文件：** `src/runtime/public/events.ts`

将 ACP 的 JSON-RPC 消息转换为 acpx 自己的 `AcpRuntimeEvent` 联合类型，把 ACP 协议的 12+ 种 `sessionUpdate` 类型归一化为 5 种事件：

```typescript
// parsePromptEventLine() — ACP 原始 JSON → AcpRuntimeEvent
ACP session/update notification → 解析 sessionUpdate tag → 分发到:
  "agent_message_chunk" → { type: "text_delta", stream: "output" }
  "agent_thought_chunk" → { type: "text_delta", stream: "thought" }
  "tool_call"           → { type: "tool_call", title, status, toolCallId }
  "usage_update"        → { type: "status", used, size }
  "current_mode_update" → { type: "status", text: "mode updated: xxx" }
  "config_option_update"→ { type: "status", text: "config updated: key=value" }
  "session_info_update" → { type: "status", text: summary/message }
```

最终的 `AcpRuntimeEvent` 只有 5 种类型：

| 事件类型     | 用途                           |
| ------------ | ------------------------------ |
| `text_delta` | Agent 输出文本 / 思考文本      |
| `status`     | 状态更新（模式、配置、用量等） |
| `tool_call`  | 工具调用及其状态更新           |
| `done`       | 一轮结束                       |
| `error`      | 错误                           |

### 9.3 错误归一化层

**核心文件：** `src/acp/error-normalization.ts`

acpx 对所有错误（ACP 协议错误、超时、权限、进程崩溃等）进行统一归一化：

```typescript
// normalizeOutputError() — 任意错误 → NormalizedOutputError { code, message, retryable }
// 识别 6 种错误码：NO_SESSION, TIMEOUT, PERMISSION_DENIED,
//   PERMISSION_PROMPT_UNAVAILABLE, USAGE, RUNTIME

// ACP 错误码映射：
//   -32000 → AUTH_REQUIRED（通过消息内容匹配 "auth required" 等关键词）
//   -32001/-32002 → NO_SESSION
//   -32601 → method not found（不可重试）
//   -32603 → internal error（可重试 — 通常是模型 API 失败）
//   -32700 → parse error（可重试）
```

**可重试性判断** (`isRetryablePromptError()`)：

| 错误类型            | 可重试？ | 原因                      |
| ------------------- | :------: | ------------------------- |
| 权限拒绝            |    否    | 用户主动拒绝              |
| 超时                |    否    | 需要调整超时配置          |
| 会话不存在          |    否    | 需要重新创建会话          |
| 认证失败            |    否    | 需要用户重新登录          |
| ACP -32603 内部错误 |  **是**  | 通常是模型 API 暂时性失败 |
| ACP -32700 解析错误 |  **是**  | 可能是网络抖动            |

### 9.4 内存裁剪机制

**核心函数：** `trimConversationForRuntime()`

acpx 在每次会话更新后都会主动裁剪数据，防止运行时内存膨胀：

| 限制项                   | 阈值                           |
| ------------------------ | ------------------------------ |
| 最大消息数               | 200 条（超出则丢弃最早的消息） |
| Agent 文本最大字符数     | 8,000（截断 + `...`）          |
| Thinking 最大字符数      | 4,000                          |
| Tool 输入/输出最大字符数 | 4,000                          |
| Token 使用记录最大条数   | 100                            |

裁剪在两个时机触发：

1. **接收 `session/update` 通知时** — `recordSessionUpdate()` 末尾调用
2. **记录用户消息时** — `recordPromptSubmission()` 末尾调用

### 9.5 持久化序列化/反序列化

**核心文件：** `src/session/persistence/parse.ts` + `serialize.ts`

将 `SessionRecord` 持久化为 JSON 文件时，做了完整的字段验证和归一化：

- camelCase (运行时) ↔ snake_case (存储) 字段名转换
- 严格的类型验证（数字必须为有限正整数、字符串不可为空等）
- 嵌套结构的逐层校验（消息、工具调用、工具结果、token 使用量）
- 无效数据返回 `null` 而非抛异常 —— 优雅降级

### 9.6 与 AionUI 对比及建议

**AionUI 当前基本不做后置处理** —— `AcpConnection` 的 `onSessionUpdate` 回调直接将 ACP 原始的 `SessionNotification` 透传给渲染进程，由前端 React 组件自行解析和渲染。

| 维度               | acpx                                     | AionUI                           |
| ------------------ | ---------------------------------------- | -------------------------------- |
| 协议数据转换       | 主进程侧统一转换为自有模型               | 直接透传 ACP 原始数据到渲染进程  |
| 内存裁剪           | 每次更新自动裁剪，硬限制 200 条消息      | **无** —— 长对话可能导致内存膨胀 |
| Token 使用量归一化 | 兼容多种命名风格（camelCase/snake_case） | 无归一化                         |
| 错误分类           | 6 种错误码 + 可重试性判断                | 临时性分类，无统一归一化         |
| 工具调用状态       | 通过字符串匹配统一判定完成状态           | 由 UI 组件各自判断               |

**这是 acpx 非常值得借鉴的模式。** 在主进程侧增加一层数据归一化后再推送给 UI，可以带来以下收益：

1. **解耦 UI 与协议细节** —— 渲染进程不再需要理解 `ContentBlock` 的 6 种子类型、`ToolCall` 的字段含义等协议细节，只需处理简洁的 acpx 风格事件
2. **统一内存控制** —— 在主进程侧裁剪长对话，防止渲染进程因消息堆积导致卡顿或 OOM
3. **集中错误处理** —— 统一的错误码 + 可重试性判断，UI 层只需关心"是否显示重试按钮"
4. **跨 Agent 一致性** —— 不同 Agent 返回的数据格式差异（如 token 使用量的字段命名）在主进程侧就被抹平，UI 层不感知

**建议行动项：**

- 在 `AcpAgent` 或 `AcpConnection` 中新增数据转换层，将 `SessionNotification` 转为 AionUI 自有的事件模型
- 参考 acpx 的裁剪阈值，为长对话增加运行时消息数量限制
- 对错误进行统一归一化，提供 `isRetryable` 标记供 UI 使用

---

## 10. 迁移成本评估

### 方案一：全量迁移 acpx（不推荐）

| 阶段             | 周期       | 内容                         |
| ---------------- | ---------- | ---------------------------- |
| 阶段 1：核心替换 | 1-2 周     | AcpConnection → acpx Runtime |
| 阶段 2：适配层   | 1 周       | Bridge + UI 适配器           |
| 阶段 3：测试     | 1-2 周     | 集成 + 回归测试              |
| 阶段 4：清理     | 1 周       | 移除旧代码，配置迁移         |
| **合计**         | **4-6 周** |                              |

**风险：** Node 22.12 版本要求、CLI 优先的设计假设、丧失 AionUI 特有功能。

### 方案二：选择性采用模式（推荐）

| 改动             | 周期           | 影响                |
| ---------------- | -------------- | ------------------- |
| 待命进程池       | 3-5 天         | 消除 2-7 秒的慢启动 |
| 基于能力的恢复   | 1-2 天         | 移除硬编码后端判断  |
| Agent 注册表简化 | 3-5 天         | 简化新 Agent 接入   |
| **合计**         | **1.5-2.5 周** |                     |

### 测试覆盖计划

| 层级               | 测试点                                                    | 预估用例数 |
| ------------------ | --------------------------------------------------------- | :--------: |
| **P0：协议适配层** | Runtime 初始化、会话生命周期、prompt 流、权限、错误、超时 |    ~45     |
| **P0：Bridge 层**  | 事件转换、流缓冲、模型切换、MCP 注入、配置迁移            |    ~31     |
| **P1：集成回归**   | 多后端会话、会话恢复、定时任务执行、团队会话              |    ~25     |
| **合计**           |                                                           |  **~101**  |

---

## 11. 建议与行动项

### 立即行动

1. **在测试构建中启用 `ACP_PERF=1` 日志**，采集各后端的实际启动时间拆分
2. **执行多会话验证测试**（第 6.3 节），确认 Claude/Codex 是否支持共存模式
3. **在 AcpConnection 中新增 `supportsLoadSession()` 方法** —— 解析 initialize 响应中的 `agentCapabilities`

### 短期（1-2 周）

4. **实现待命进程池**（第 8.1 节）—— 对用户体验改善最大
5. **将恢复逻辑重构为基于能力的方式**（第 8.2 节）—— 消除逐后端硬编码
6. **新增数据归一化层**（第 9 节）—— 在 AcpAgent/AcpConnection 中将 `SessionNotification` 转为自有事件模型，增加内存裁剪和错误归一化

### 中期（2-4 周）

7. **简化 Agent 注册表**（第 8.3 节）—— 降低新增 Agent 的成本
8. **补充 ACP 单元测试** —— 当前最关键的子系统零覆盖
9. **如果多会话验证通过，实现 N:M 进程池** —— 在同后端的会话间共享进程

### 不应该做的事

- 不要整体迁移到 acpx —— Node 版本不兼容和 AionUI 特有需求使全量迁移的成本远高于选择性采用
- 不要在未验证的情况下实现 N:1（单进程承载所有会话） —— 会话切换开销和错误爆炸半径可能抵消资源节省
- 不要在浏览会话时预热进程 —— 仅在应用启动时按后端预热，在首条消息时绑定到会话

---

## 附录 A：acpx 进程模型（纠正错误假设）

初始分析曾认为 acpx 在单进程上复用多个会话。代码审查证实这是**不正确的**：

```typescript
// manager.ts:221 — 每个会话记录一个 client
private readonly pendingPersistentClients = new Map<string, AcpClient>();

// manager.ts:294 — client 按 acpxRecordId 存储
this.pendingPersistentClients.set(record.acpxRecordId, client);

// manager.ts:531 — 每轮结束后 client 被关闭
await client.close().catch(() => {});
```

3 个会话 = 3 个 AcpClient = 3 个子进程。`pendingPersistentClients` 的"复用"仅限于避免**同一个会话**在 `ensureSession()` 和 `runTurn()` 之间重复 spawn。

## 附录 B：AionUI 恢复策略

```typescript
// index.ts:1502-1558 — createOrResumeSession()

// 策略 1：Codex — session/load
if (backend === 'codex') {
  // 内部调用 resume_thread_from_rollout，重放完整历史
  await connection.loadSession(resumeSessionId, workspace, mcpServers);
}

// 策略 2：Claude/CodeBuddy — session/new + 私有 _meta
else if (backend === 'claude' || backend === 'codebuddy') {
  // _meta: { claudeCode: { options: { resume: sessionId } } }
  await connection.newSession(workspace, { resumeSessionId });
}

// 策略 3：其他 — session/new + 通用参数
else {
  // resumeSessionId 作为标准参数
  await connection.newSession(workspace, { resumeSessionId });
}

// 降级：所有策略 — 失败时创建全新会话
```

## 附录 C：API 映射表（AionUI → acpx）

| AionUI 当前 API                  | acpx Runtime 对应                                      |
| -------------------------------- | ------------------------------------------------------ |
| `connection.connect()`           | `createAcpRuntime()` + `probeAvailability()`           |
| `connection.newSession()`        | `runtime.ensureSession()`                              |
| `connection.loadSession()`       | `runtime.ensureSession()`（自动恢复）                  |
| `connection.sendPrompt()`        | `runtime.runTurn()` → `AsyncIterable<AcpRuntimeEvent>` |
| `connection.cancelPrompt()`      | `runtime.cancel()`                                     |
| `connection.disconnect()`        | `runtime.close()`                                      |
| `connection.setModel()`          | `runtime.setConfigOption()`                            |
| `connection.setSessionMode()`    | `runtime.setMode()`                                    |
| `connection.onSessionUpdate`     | `runTurn()` 的 text_delta/tool_call/status 事件        |
| `connection.onPermissionRequest` | acpx 内置权限系统                                      |
| `connection.onEndTurn`           | `runTurn()` 的 done 事件                               |
| `connection.onDisconnect`        | `AcpRuntimeError` 异常处理                             |
