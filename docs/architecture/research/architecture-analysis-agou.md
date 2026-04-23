# Claude Code Team 模式 -- 架构深度分析

**作者：架构-阿构 | 日期：2026-03-31**
**基于 28 个核心源码文件的逐行分析**

---

## 1. 系统本质：这到底是什么设计模式？

### 结论：Actor Model 的简化实现 + 文件系统作为消息总线

这套系统**不是**纯粹的 Actor Model，也**不是** Pub-Sub，更不是传统的消息队列。精确描述是：

> **基于文件系统的 Actor-like 消息信箱模式，配合轮询驱动的事件循环。**

证据链：

**Actor 特征（符合）：**

- 每个 Teammate 有独立的信箱（`~/.claude/teams/{team}/inboxes/{name}.json`），对应 Actor 的 mailbox
- 消息处理是单线程的（每个 Agent 内部是 `while` 循环串行处理）
- 通过消息驱动行为，不共享可变状态

**Actor 特征（不符合）：**

- 没有 Actor 地址空间/注册表 —— 用的是文件路径（`teammateMailbox.ts:56-66`）
- 没有 Supervisor 层 —— Leader 手动管理生命周期
- 消息投递不保证顺序（文件锁竞争，`LOCK_OPTIONS` 重试10次，`teammateMailbox.ts:35-41`）

**关键差异于经典 Actor Model：**

```
经典 Actor Model:
  Actor A --[message]--> Actor Runtime --[dispatch]--> Actor B mailbox

Claude Code Team:
  Agent A --[writeToMailbox]--> 文件系统 --[500ms poll]--> Agent B 读取
```

轮询间隔硬编码 `500ms`（`inProcessRunner.ts:114`, `inProcessRunner.ts:697`），这意味着消息延迟上限约 500ms，没有事件通知机制。

### 事件循环核心（inProcessRunner.ts）

```
┌──────────────────────────────────────────────────────────┐
│ runInProcessTeammate() -- 主循环                          │
│                                                          │
│  while (!aborted && !shouldExit) {                       │
│    ┌──────────────┐                                      │
│    │ runAgent()   │ <── 调用 query() API，执行工具       │
│    │ (Line 1175)  │     产出 Message 流                  │
│    └──────┬───────┘                                      │
│           │ 完成/中断                                    │
│           v                                              │
│    ┌──────────────────────┐                              │
│    │ sendIdleNotification │ <── 写入 Leader 信箱         │
│    │ (Line 1332-1347)     │                              │
│    └──────┬───────────────┘                              │
│           │                                              │
│           v                                              │
│    ┌──────────────────────────────┐                      │
│    │ waitForNextPromptOrShutdown  │ <── 500ms 轮询信箱   │
│    │ (Line 1354-1361)            │     + TaskList 检查   │
│    └──────┬───────────────────────┘                      │
│           │ 收到消息                                     │
│           v                                              │
│    ┌──────────────────────┐                              │
│    │ 格式化为 XML wrapper │ <── formatAsTeammateMessage  │
│    │ 作为新 prompt 注入   │                              │
│    └──────────────────────┘                              │
│    (回到循环顶部)                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

关键洞察：Teammate 的"持续运行"本质是 **`while` 循环 + sleep 轮询**，不是事件驱动。每轮完成后进入 idle 状态，靠轮询信箱唤醒。

---

## 2. 核心抽象层

从 28 个文件中提取出 **5 个核心抽象**：

### 抽象 1: Mailbox（消息信箱）

**职责：** Agent 间异步通信的唯一通道

**实现文件：** `teammateMailbox.ts`（1184 行），`mailbox.ts`（73 行）

**两套并存的实现：**

| 维度     | File Mailbox (`teammateMailbox.ts`) | Memory Mailbox (`mailbox.ts`)               |
| -------- | ----------------------------------- | ------------------------------------------- |
| 存储     | JSON 文件 (`~/.claude/teams/...`)   | 内存队列                                    |
| 并发控制 | `proper-lockfile` 文件锁            | 同步 JS（单线程安全）                       |
| 用途     | 跨进程（tmux）+ 进程内              | 仅 in-process 场景的候选（未实际用于 Team） |
| 消息类型 | 13 种结构化协议消息                 | 通用 Message                                |

`mailbox.ts` 是一个 73 行的精巧的内存信箱实现（`send/poll/receive` + `waiters` 模式），但**实际上 Team 模式没有使用它**。所有 Teammate 通信走的都是 File Mailbox。这是一个重要发现 —— 说明 in-process 路径虽然共享进程，但通信仍然走文件 I/O。

**协议消息类型（13 种）：**

```
普通消息 ──── 纯文本（from/text/timestamp/read）
                │
结构化消息 ──┬─ idle_notification          空闲通知
             ├─ permission_request          工具权限请求
             ├─ permission_response         权限响应
             ├─ sandbox_permission_request  沙箱网络权限
             ├─ sandbox_permission_response 沙箱响应
             ├─ shutdown_request            关闭请求
             ├─ shutdown_approved           同意关闭
             ├─ shutdown_rejected           拒绝关闭
             ├─ plan_approval_request       计划审批请求
             ├─ plan_approval_response      计划审批响应
             ├─ team_permission_update      团队权限广播
             ├─ mode_set_request            模式变更请求
             └─ task_assignment             任务分配
```

**耦合度：低。** 信箱只依赖 `fs`、`path`、`proper-lockfile` 和 JSON 序列化。这是最可移植的模块。

### 抽象 2: Runner（Agent 执行引擎）

**职责：** 驱动单个 Agent 的完整生命周期（spawn -> run -> idle -> wake -> run -> shutdown）

**实现文件：** `inProcessRunner.ts`（1553 行），`runAgent.ts`（974 行）

**调用链：**

```
startInProcessTeammate()           -- 入口，fire-and-forget
  └── runInProcessTeammate()       -- while 循环
        ├── runAgent()             -- 单次 LLM 交互循环
        │     └── query()          -- 调用 Claude API
        ├── sendIdleNotification() -- 通知 Leader
        └── waitForNextPrompt()    -- 轮询信箱
```

`runAgent()` 本身是一个 `AsyncGenerator<Message>`（`runAgent.ts:248-329`），这个设计很优雅 —— 它 yield 每条消息，调用方可以逐条处理、更新进度、检查 abort。

**关键依赖（强耦合点）：**

- `query()` —— Claude API 调用，这是最核心的运行时依赖（`runAgent.ts:748`）
- `toolUseContext` —— 工具使用上下文，包含 `getAppState`、`setAppState`（React 状态管理）
- `createSubagentContext()` —— 创建子 Agent 隔离的上下文
- `getSystemPrompt()` —— 系统提示词构建

**耦合度：高。** 这是与 Claude Code 运行时绑定最紧的模块。`query()`、`Tool`、`AppState`、`ToolUseContext` 全部是 Claude Code 私有类型。

### 抽象 3: Backend（执行后端/调度器）

**职责：** 抽象 Teammate 的物理执行方式 —— 在哪里跑、怎么跑

**实现文件：** `backends/types.ts`（312 行），`backends/registry.ts`（465 行），`backends/InProcessBackend.ts`（340 行），`backends/TmuxBackend.ts`（764 行）

**类型层次：**

```
TeammateExecutor（统一接口）
  ├── InProcessBackend      -- 同进程，AsyncLocalStorage 隔离
  │     spawn() -> spawnInProcessTeammate() -> startInProcessTeammate()
  │
  └── PaneBackendExecutor（包装 PaneBackend）
        ├── TmuxBackend     -- tmux pane，独立进程
        └── ITermBackend    -- iTerm2 pane，独立进程
```

**TeammateExecutor 接口（`types.ts:279-300`）：**

```typescript
type TeammateExecutor = {
  readonly type: BackendType;
  isAvailable(): Promise<boolean>;
  spawn(config: TeammateSpawnConfig): Promise<TeammateSpawnResult>;
  sendMessage(agentId: string, message: TeammateMessage): Promise<void>;
  terminate(agentId: string, reason?: string): Promise<boolean>;
  kill(agentId: string): Promise<boolean>;
  isActive(agentId: string): Promise<boolean>;
};
```

**后端选择逻辑（`registry.ts:351-388`）：**

```
isInProcessEnabled() 判定流程：
  ├── non-interactive session (-p 模式) → 强制 in-process
  ├── 配置为 'in-process' → true
  ├── 配置为 'tmux' → false
  └── 'auto' 模式：
       ├── 之前已 fallback 到 in-process → true
       ├── 在 tmux 里 → false (用 tmux pane)
       ├── 在 iTerm2 里 → false (用 iTerm2 pane)
       └── 其他 → true (默认 in-process)
```

**耦合度：中。** `TeammateExecutor` 接口定义是干净的，可复用。但 `InProcessBackend` 内部强依赖 `ToolUseContext`、`AppState`。`TmuxBackend` 只依赖 `tmux` 命令行，理论上可独立运行。

### 抽象 4: Identity（身份系统）

**职责：** 解决"我是谁"问题 —— 在多 Agent 共享进程时区分身份

**实现文件：** `teammate.ts`（293 行），`teammateContext.ts`（97 行）

**三层身份源（优先级递降）：**

```
1. AsyncLocalStorage    ← in-process teammates（同进程多 Agent）
   (teammateContext.ts:41)

2. dynamicTeamContext   ← tmux teammates（CLI 参数注入）
   (teammate.ts:44-51)

3. process.env          ← 环境变量（最后兜底）
```

`AsyncLocalStorage` 是关键设计 —— 它让同一个 Node.js 进程里的多个 Teammate 各自拥有独立身份，而不需要 fork 进程。`runWithTeammateContext()` 包裹的所有代码都能通过 `getTeammateContext()` 获取正确的身份。

**格式：** `agentId = "{name}@{teamName}"`（如 `researcher@my-team`）

**耦合度：低。** `AsyncLocalStorage` 是 Node.js 标准 API，设计模式可直接移植。

### 抽象 5: PermissionBridge（权限桥接）

**职责：** 解决 Teammate 需要用户授权时的权限代理问题

**实现文件：** `leaderPermissionBridge.ts`（55 行），`permissionSync.ts`（929 行），`inProcessRunner.ts:128-451`

**权限流（两条路径）：**

```
路径 A（优先 -- Leader UI Bridge）：
  Worker 遇到 'ask' 权限
    → getLeaderToolUseConfirmQueue() 获取 Leader 的 UI 队列
    → 直接注入到 Leader 的 ToolUseConfirm 对话框
    → 用户在 Leader 终端操作
    → 回调 resolve Promise

路径 B（降级 -- Mailbox 轮询）：
  Worker 遇到 'ask' 权限
    → createPermissionRequest() 构建请求
    → sendPermissionRequestViaMailbox() 写入 Leader 信箱
    → registerPermissionCallback() 注册回调
    → setInterval(500ms) 轮询自己信箱
    → 收到 permission_response → processMailboxPermissionResponse()
    → 回调 resolve Promise
```

路径 A 是 in-process 专有优化：直接共享 Leader 的 React 状态，worker 的权限请求在 Leader 的 UI 里弹出，带 `workerBadge`（颜色标记）。这是一个精巧的设计，让同进程的 workers 复用 Leader 的交互界面。

**耦合度：高。** 路径 A 直接依赖 React 状态（`ToolUseConfirm`）。路径 B 可移植。

---

## 3. 耦合分析

### 强耦合模块（不可移植，需要重写）

| 模块                        | 耦合对象                                                  | 原因                                                   |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `inProcessRunner.ts`        | `query()`, `AppState`, `ToolUseContext`, `Tool`           | 整个执行循环围绕 Claude Code 的 API 调用和状态管理构建 |
| `runAgent.ts`               | `query()`, `getSystemPrompt()`, `createSubagentContext()` | Agent 的 LLM 调用核心                                  |
| `leaderPermissionBridge.ts` | React `ToolUseConfirm` 组件                               | 直接操作 Leader UI 的权限对话框队列                    |
| `agentSwarmsEnabled.ts`     | `GrowthBook` (feature flag)                               | Anthropic 服务端开关                                   |

### 弱耦合模块（可移植，改造成本低）

| 模块                      | 移植改造量 | 说明                                                     |
| ------------------------- | ---------- | -------------------------------------------------------- |
| `teammateMailbox.ts`      | 极低       | 纯文件 I/O + JSON + `proper-lockfile`，几乎可以直接用    |
| `mailbox.ts`              | 极低       | 73 行的内存信箱，完全通用                                |
| `teammateContext.ts`      | 极低       | 97 行，只用了 `AsyncLocalStorage`，直接复用              |
| `teammate.ts`             | 低         | 身份查询函数集，去掉 `dynamicTeamContext` 就是纯工具函数 |
| `backends/types.ts`       | 低         | 接口定义，无运行时依赖                                   |
| `backends/TmuxBackend.ts` | 低         | 只依赖 `tmux` CLI，可独立运行                            |
| `teamHelpers.ts`          | 低         | 文件操作 + JSON，去掉 `git worktree` 部分就很干净        |
| `swarm/constants.ts`      | 极低       | 纯常量定义                                               |

### 中等耦合模块

| 模块                           | 原因                                                |
| ------------------------------ | --------------------------------------------------- |
| `backends/InProcessBackend.ts` | 接口干净，但实现依赖 `ToolUseContext`               |
| `backends/registry.ts`         | 后端选择逻辑可复用，但检测逻辑绑定终端环境          |
| `spawnInProcess.ts`            | 创建和注册逻辑清晰，但 `AppState` 绑定              |
| `permissionSync.ts`            | Mailbox 路径可复用，但和 Claude Code 的权限系统耦合 |

---

## 4. Aion 架构方案

### 4.1 推荐模块拆分

```
aion-teams/
├── core/                          # 可从 Claude Code 几乎直接搬运
│   ├── mailbox/
│   │   ├── FileMailbox.ts         # 基于 teammateMailbox.ts
│   │   ├── MemoryMailbox.ts       # 基于 mailbox.ts
│   │   └── types.ts               # TeammateMessage + 13种协议消息
│   ├── identity/
│   │   ├── TeammateContext.ts     # AsyncLocalStorage 身份管理
│   │   └── AgentId.ts             # name@team 格式
│   └── protocol/
│       ├── messages.ts            # 消息创建/解析（create*, is*）
│       └── constants.ts           # TEAM_LEAD_NAME 等
│
├── runtime/                       # 需要重写的核心
│   ├── Runner.ts                  # Agent 执行循环（替代 inProcessRunner）
│   ├── AgentLoop.ts               # LLM 调用抽象（替代 runAgent + query）
│   └── TaskManager.ts             # 任务列表管理
│
├── backends/                      # 可参考设计
│   ├── types.ts                   # TeammateExecutor 接口（直接用）
│   ├── InProcessBackend.ts        # 需适配 Aion 的状态管理
│   ├── TmuxBackend.ts             # 可直接用
│   └── registry.ts                # 后端检测和选择
│
├── permissions/                   # 需要适配
│   ├── PermissionBridge.ts        # Leader UI 桥接
│   └── PermissionSync.ts          # Mailbox 路径
│
└── tools/                         # LLM 工具定义
    ├── TeamCreate.ts
    ├── TeamDelete.ts
    └── SendMessage.ts
```

### 4.2 技术选型建议

| 维度       | Claude Code 方案          | Aion 建议               | 理由                                                    |
| ---------- | ------------------------- | ----------------------- | ------------------------------------------------------- |
| 消息总线   | 文件 JSON + lockfile      | **直接复用文件方案**    | 已验证可靠，无需引入 Redis/MQ 增加运维负担              |
| 身份隔离   | AsyncLocalStorage         | **直接复用**            | Node.js 标准方案，0 改造成本                            |
| Agent 执行 | `runAgent()` -> `query()` | **接口抽象**            | 定义 `AgentRuntime` 接口，背后对接 Aion 自己的 LLM 调用 |
| 状态管理   | React `AppState`          | **替换为独立状态**      | Aion 如果不是 React/Ink，用 EventEmitter 或简单 Store   |
| 权限系统   | ToolUseConfirm + Mailbox  | **只实现 Mailbox 路径** | UI 桥接太耦合，先用 Mailbox 全覆盖                      |
| 进度跟踪   | AppState.tasks            | **自定义 TaskStore**    | 不需要 React 渲染所需的 immutable update                |

### 4.3 核心接口定义（建议）

```typescript
// AgentRuntime 接口 -- 替代 runAgent() + query()
interface AgentRuntime {
  run(config: {
    systemPrompt: string;
    messages: Message[];
    tools: ToolDefinition[];
    abortSignal: AbortSignal;
  }): AsyncGenerator<AgentMessage>;
}

// TeammateExecutor 接口 -- 直接从 Claude Code 搬运
interface TeammateExecutor {
  readonly type: BackendType;
  spawn(config: TeammateSpawnConfig): Promise<TeammateSpawnResult>;
  sendMessage(agentId: string, message: TeammateMessage): Promise<void>;
  terminate(agentId: string, reason?: string): Promise<boolean>;
  kill(agentId: string): Promise<boolean>;
  isActive(agentId: string): Promise<boolean>;
}

// Runner 接口 -- 替代 inProcessRunner 的 while 循环
interface TeammateRunner {
  start(config: RunnerConfig): Promise<RunnerResult>;
  // 内部: while -> runtime.run() -> idle -> poll mailbox -> wake
}
```

### 4.4 实施路径

```
Phase 1（2-3 周）: 信箱 + 身份 + 协议
  直接移植 core/ 层，验证消息收发

Phase 2（3-4 周）: Runner + AgentRuntime
  实现 while 循环 + LLM 调用抽象
  对接 Aion 的 LLM API

Phase 3（2-3 周）: Backend + 工具
  InProcessBackend + TmuxBackend
  TeamCreate / SendMessage / TeamDelete

Phase 4（2 周）: 权限 + 健壮性
  Mailbox 权限路径
  重连 / 清理 / 错误处理
```

---

## 5. 对研究报告"复刻度 60-65%"的批判

### 这个数字偏保守，但方向正确

报告说"60-65% 可直接复用"，我从架构角度逐条评估：

**过于悲观的点：**

1. **Mailbox 系统的复用度被低估了。** `teammateMailbox.ts` 的 1184 行代码，除了 `import` 路径需要改，核心逻辑几乎不需要动。13 种消息协议也是纯数据定义，100% 可搬运。报告把这部分算作"需适配"不准确。

2. **`mailbox.ts` 的内存信箱被忽略了。** 73 行的精巧实现，带 `waiters` 模式的 Promise-based 信箱，如果 Aion 走纯 in-process 路线，这个比文件信箱更高效。报告完全没提。

3. **身份系统的改造量被高估了。** `TeammateContext` + `AsyncLocalStorage` 只有 97 行，是标准 Node.js 模式，不需要"适配"，直接抄。

4. **Backend 接口的抽象质量被低估了。** `TeammateExecutor` 接口定义得很干净（`types.ts:279-300`），5 个方法全部是 Promise-based，无 Claude Code 特有类型泄漏。`TmuxBackend` 完全独立可运行。

**过于乐观的点：**

1. **`inProcessRunner.ts` 的改造难度被低估了。** 这个 1553 行的文件是整个系统最复杂的部分。它不是简单的"while 循环 + 调用 LLM"，而是包含：auto-compaction（`Line 1074-1126`）、per-turn abort（`Line 1056-1063`）、permission wait time tracking（`Line 1183-1189`）、content replacement state 管理（`Line 1039-1045`）等大量精细逻辑。这些逻辑和 Claude Code 的 `ToolUseContext` 深度交织，不是"改改接口"就能搞定的。

2. **权限系统的复杂度被低估了。** `createInProcessCanUseTool()`（`inProcessRunner.ts:128-451`）是一个 323 行的函数，实现了两条权限路径（UI Bridge + Mailbox Fallback），处理 abort、classifier auto-approval、permission updates 回写等边缘情况。Aion 如果要做到同等健壮，这部分的工作量相当大。

3. **prompt 注入和格式化的隐含约束。** `TEAMMATE_SYSTEM_PROMPT_ADDENDUM`、`formatAsTeammateMessage()`（XML 包装）、idle notification 的 JSON 结构等，都是让 LLM "理解" Team 协作的关键。这些不是代码量问题，而是需要针对 Aion 使用的模型重新调优 prompt 工程。

### 修正评估

| 层                 | 报告估计 | 我的评估 | 理由                                 |
| ------------------ | -------- | -------- | ------------------------------------ |
| Mailbox + Protocol | 70%      | **90%**  | 几乎可以 copy-paste                  |
| Identity           | 65%      | **95%**  | 标准 AsyncLocalStorage，直接用       |
| Backend 接口       | 60%      | **85%**  | 接口定义100%可用，实现需适配         |
| Runner 核心        | 50%      | **30%**  | 和 Claude Code 运行时深度耦合        |
| Permission         | 55%      | **40%**  | UI Bridge 不可移植，Mailbox 路径可用 |
| Prompt 工程        | 不适用   | **20%**  | 需要针对 Aion 的模型全部重写         |

**综合复刻度：按代码行加权约 55%，按功能完整度约 50%。**

报告的 60-65% 如果只看"协议层 + 基础设施"是合理的。但如果包含 Runner 和 Permission 的完整功能（让系统真正能跑），我认为实际可直接复用的比例更低。核心难点不在基础设施，而在 **Runner 与 LLM API 的集成** —— 这部分代码量最大、耦合最深、也最难复用。

---

## 附录 A: 完整架构图

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    User                             │
                    └──────────────────────┬──────────────────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────────────┐
                    │              Leader Agent (team-lead)               │
                    │  ┌──────────┐ ┌───────────┐ ┌────────────────────┐ │
                    │  │TeamCreate│ │SendMessage│ │   TeamDelete       │ │
                    │  │Tool      │ │Tool       │ │   Tool             │ │
                    │  └────┬─────┘ └─────┬─────┘ └──────┬─────────────┘ │
                    │       │             │              │               │
                    │  ┌────┴─────────────┴──────────────┴────────────┐  │
                    │  │            AppState (React)                   │  │
                    │  │  teamContext / tasks / toolPermissionContext  │  │
                    │  └────┬─────────────┬──────────────┬────────────┘  │
                    │       │             │              │               │
                    │  ┌────┴────┐  ┌─────┴─────┐  ┌────┴──────────┐   │
                    │  │Registry │  │Permission │  │ LeaderPerm    │   │
                    │  │(backend │  │Bridge     │  │ Bridge        │   │
                    │  │ select) │  │(mailbox)  │  │ (UI queue)    │   │
                    │  └────┬────┘  └───────────┘  └───────────────┘   │
                    └───────┼──────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────────┐
              │             │                 │
    ┌─────────┴────┐ ┌─────┴──────┐ ┌────────┴───────┐
    │ InProcess    │ │  Tmux      │ │  iTerm2        │
    │ Backend      │ │  Backend   │ │  Backend       │
    │              │ │            │ │                │
    │ spawn() ───────────────────── spawn()          │
    │ AsyncLocal   │ │  tmux pane │ │  it2 pane      │
    │ Storage      │ │  + claude  │ │  + claude      │
    │ isolation    │ │  binary    │ │  binary        │
    └──────┬───────┘ └─────┬──────┘ └────────┬───────┘
           │               │                 │
    ┌──────┴───────────────┴─────────────────┴───────┐
    │           File-Based Mailbox System             │
    │  ~/.claude/teams/{team}/inboxes/{name}.json     │
    │                                                 │
    │  writeToMailbox() ──── [lockfile] ──── readMailbox()
    │                                                 │
    │  13 message types:                              │
    │    text / idle / permission / shutdown / plan /  │
    │    sandbox / task / mode / team_update           │
    └─────────────────────────────────────────────────┘
           │                │                │
    ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
    │ Teammate A  │  │ Teammate B  │  │ Teammate C  │
    │             │  │             │  │             │
    │ while loop: │  │ while loop: │  │ while loop: │
    │  runAgent() │  │  runAgent() │  │  runAgent() │
    │  idle/poll  │  │  idle/poll  │  │  idle/poll  │
    │  wake/run   │  │  wake/run   │  │  wake/run   │
    └─────────────┘  └─────────────┘  └─────────────┘
```

## 附录 B: 关键源码行号索引

| 关注点                | 文件                  | 行号      |
| --------------------- | --------------------- | --------- |
| 轮询间隔              | inProcessRunner.ts    | 114, 697  |
| 主循环入口            | inProcessRunner.ts    | 883-1534  |
| Agent 执行            | inProcessRunner.ts    | 1175-1203 |
| 权限函数              | inProcessRunner.ts    | 128-451   |
| 信箱写入              | teammateMailbox.ts    | 134-192   |
| 信箱读取              | teammateMailbox.ts    | 84-108    |
| 文件锁配置            | teammateMailbox.ts    | 35-41     |
| 消息类型判定          | teammateMailbox.ts    | 1073-1095 |
| AsyncLocalStorage     | teammateContext.ts    | 41        |
| TeammateExecutor 接口 | backends/types.ts     | 279-300   |
| 后端选择              | backends/registry.ts  | 351-388   |
| InProcess spawn       | spawnInProcess.ts     | 104-216   |
| InProcess kill        | spawnInProcess.ts     | 227-328   |
| runAgent AsyncGen     | runAgent.ts           | 248-329   |
| query() 调用          | runAgent.ts           | 748-806   |
| Team 创建             | TeamCreateTool.ts     | 128-237   |
| 发送消息路由          | SendMessageTool.ts    | 741-913   |
| 功能开关              | agentSwarmsEnabled.ts | 24-44     |
| 权限请求构造          | permissionSync.ts     | 167-207   |

---

**【架构-阿构】**
**方案：** Actor-like 信箱模式，文件系统作消息总线，轮询驱动事件循环
**模块边界：** 5 层（Mailbox / Runner / Backend / Identity / PermissionBridge），底层 3 层可直接搬运，Runner 层必须重写
**接口定义：** `TeammateExecutor`（已有，可直接用），`AgentRuntime`（需新建，对接 Aion LLM）
**风险点：** Runner 与 Claude Code 运行时深度耦合是最大风险；prompt 工程需要全部重新调优；权限 UI Bridge 路径不可移植
**建议：** Phase 1 先移植 Mailbox + Identity（1-2 周即可验证），Phase 2 实现 Runner 抽象层，不要试图直接移植 inProcessRunner.ts
**与老尺的分歧：** 暂无（等老尺 review 本方案后补充）
