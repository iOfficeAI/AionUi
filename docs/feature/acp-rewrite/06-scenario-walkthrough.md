# 场景走查

> **版本**: v1.2 | **最后更新**: 2026-04-16 | **状态**: Draft
> **摘要**: 端到端追踪 10 个关键使用场景的数据流，覆盖 ACP 新架构全部三层组件交互
> **受众**: ACP 重构实现开发者、新加入团队的开发者

---

## 目录

- [1. 总览](#1-总览)
- [2. 场景 1: 创建新会话并发送第一条消息](#2-场景-1-创建新会话并发送第一条消息)
- [3. 场景 2: 消息排队与 drain loop 处理](#3-场景-2-消息排队与-drain-loop-处理)
- [4. 场景 3: 权限审批流程](#4-场景-3-权限审批流程)
- [5. 场景 4: 会话挂起与恢复](#5-场景-4-会话挂起与恢复)
- [6. 场景 5: Agent 进程崩溃与错误恢复](#6-场景-5-agent-进程崩溃与错误恢复)
- [7. 场景 6: 空闲回收](#7-场景-6-空闲回收)
- [8. 场景 7: 运行中切换模型/模式](#8-场景-7-运行中切换模型模式)
- [9. 场景 8: WebSocket 远程连接](#9-场景-8-websocket-远程连接)
- [10. 场景 9: 从错误状态手动恢复](#10-场景-9-从错误状态手动恢复)
- [11. 场景 10: 未认证用户条件认证流程](#11-场景-10-未认证用户条件认证流程)
- [参考文档](#参考文档)

---

## 1. 总览

本文档选取 10 个关键场景，对每个场景进行端到端的组件交互追踪。每个场景包含：

- **前置条件 / 触发动作 / 期望结果**
- **逐步分解**：经过的组件、调用的方法、数据变化
- **Mermaid 时序图**：核心交互可视化
- **异常路径**：中间某步失败时的行为

场景覆盖的架构层级：

| 场景            |        Application        |                             Session                              |   Infrastructure   | 涉及的关键不变量                       |
| --------------- | :-----------------------: | :--------------------------------------------------------------: | :----------------: | -------------------------------------- |
| 1. 冷启动全流程 | AcpRuntime, ClientFactory |      AcpSession, SessionLifecycle, ConfigTracker, McpConfig      |  ProcessAcpClient  | INV-I-01, INV-S-09                     |
| 2. 多消息排队   |        AcpRuntime         |          AcpSession, PromptExecutor, MessageTranslator           |     AcpClient      | INV-S-01, INV-S-02                     |
| 3. 权限审批     |        AcpRuntime         |   AcpSession, PromptExecutor, PermissionResolver, PromptTimer    |     AcpClient      | INV-S-04, INV-S-10, INV-S-13           |
| 4. 挂起与恢复   |        AcpRuntime         |           AcpSession, SessionLifecycle, ConfigTracker            |  ProcessAcpClient  | INV-S-05, INV-A-01                     |
| 5. Crash 恢复   |        AcpRuntime         | AcpSession, SessionLifecycle, PromptExecutor, PermissionResolver |  ProcessAcpClient  | INV-S-03, INV-S-06, INV-S-08, INV-X-04 |
| 6. 空闲回收     | IdleReclaimer, AcpRuntime |                            AcpSession                            |  ProcessAcpClient  | INV-A-02, INV-I-01                     |
| 7. 配置变更     |        AcpRuntime         |           AcpSession, SessionLifecycle, ConfigTracker            |     AcpClient      | INV-S-11                               |
| 8. WebSocket    | AcpRuntime, ClientFactory |                   AcpSession, SessionLifecycle                   | WebSocketAcpClient | INV-I-01                               |
| 9. 错误恢复     |        AcpRuntime         |           AcpSession, SessionLifecycle, ConfigTracker            |  ProcessAcpClient  | INV-S-03, INV-S-09                     |
| 10. 条件认证    |        AcpRuntime         |           AcpSession, SessionLifecycle, AuthNegotiator           |  ProcessAcpClient  | INV-S-15, INV-S-03                     |

---

## 2. 场景 1: 创建新会话并发送第一条消息

### 2.1 场景描述

| 项目         | 内容                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| **前置条件** | 用户已打开 AionUi，Agent 配置 (AgentConfig) 已就绪，无已存在的 session                |
| **触发动作** | 用户点击"新建对话"，选择 Claude agent，输入"帮我重构这个函数"并发送                   |
| **期望结果** | Agent 子进程启动，ACP 协议握手完成，消息入队后执行 prompt，流式响应逐 chunk 推送到 UI |

### 2.2 时序图

```mermaid
sequenceDiagram
    participant UI as Renderer (UI)
    participant RT as AcpRuntime
    participant CF as ClientFactory
    participant S as AcpSession
    participant SL as SessionLifecycle
    participant PE as PromptExecutor
    participant CS as ConfigTracker
    participant IP as InputPreprocessor
    participant MA as MessageTranslator
    participant PT as PromptTimer
    participant CL as AcpClient
    participant A as Agent Process

    Note over UI,A: ═══ 阶段 1: 创建会话 ═══

    UI->>RT: createConversation(agentConfig)
    RT->>CF: create(agentConfig)
    CF-->>RT: ProcessAcpClient 实例
    RT->>S: new AcpSession(config, client, callbacks)
    RT->>S: start()
    S->>S: setStatus('starting')
    S-->>RT: onStatusChange('starting')
    RT-->>UI: signalEvent(status_change)

    S->>CL: start()
    Note over CL: 内部: spawn(command, args) → 建立 stdio 管道 → JSON-RPC initialize
    CL->>A: spawn + initialize
    A-->>CL: InitializeResponse { authMethods }

    Note over S: 条件认证: 检查 authMethods
    alt authMethods 非空
        S->>CL: extMethod('authenticate', credentials)
        CL->>A: JSON-RPC authenticate
        A-->>CL: AuthenticateResponse
    else authMethods 为空
        Note over S: 跳过认证
    end

    S->>CL: createSession({ cwd, mcpServers })
    CL->>A: JSON-RPC newSession
    A-->>CL: SessionResult { sessionId, models, modes }
    S->>CS: syncFromSessionResult(result)
    S-->>RT: onSessionId(sessionId)
    S-->>RT: onConfigUpdate / onModelUpdate / onModeUpdate
    S->>S: reassertConfig()
    S->>S: setStatus('active')
    S-->>RT: onStatusChange('active')
    RT-->>UI: signalEvent(status_change)
    S->>S: scheduleDrain() — 队列为空, 不执行

    RT->>RT: store.create(convId) + sessions.set()
    RT-->>UI: return convId

    Note over UI,A: ═══ 阶段 2: 发送消息 ═══

    UI->>RT: sendMessage(convId, "帮我重构这个函数")
    RT->>S: sendMessage("帮我重构这个函数")
    S->>PQ: enqueue({ id, text, enqueuedAt })
    S-->>RT: onQueueUpdate(snapshot)
    S->>S: scheduleDrain()
    S->>S: drainLoop()
    S->>PQ: dequeue()
    S-->>RT: onQueueUpdate(snapshot) — 队列变空
    S->>S: setStatus('prompting')
    S-->>RT: onStatusChange('prompting')
    S->>IP: process(text, files)
    IP-->>S: PromptContent
    S->>S: reassertConfig() — 无 pending 变更
    S->>PT: start(300_000)
    S->>CL: prompt(sessionId, content)
    CL->>A: JSON-RPC prompt

    loop 流式响应 chunks
        A-->>CL: agent_message_chunk
        CL-->>S: SessionNotification
        S->>PT: reset() — 心跳重置超时
        S->>MA: translate(notification)
        MA-->>S: TMessage[]
        S-->>RT: onMessage(TMessage)
        RT-->>UI: streamEvent → 逐 chunk 渲染
    end

    A-->>CL: prompt_finished
    CL-->>S: PromptResponse
    S->>PT: stop()
    S->>MA: onTurnEnd() — 增量清理已完成条目
    S->>S: setStatus('active')
    S-->>RT: onStatusChange('active')
    RT-->>UI: 恢复输入态
```

### 2.3 步骤分解

| #   | 组件              | 方法                                 | 数据变化                                                                                             |
| --- | ----------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | AcpRuntime        | `createConversation(agentConfig)`    | 生成 convId (UUID)                                                                                   |
| 2   | ClientFactory     | `create(agentConfig)`                | 判断 `remoteUrl` 不存在，创建 ProcessAcpClient                                                       |
| 3   | AcpSession        | `constructor(...)`                   | 初始化所有 7 个组件，status = `'idle'`                                                               |
| 4   | AcpSession        | `start()`                            | status: `idle` → `starting`                                                                          |
| 5   | AcpClient         | `start()`                            | 内部: `spawn(command, args)` 启动子进程 + JSON-RPC initialize                                        |
| 6   | AcpSession        | 条件认证检查                         | 检查 `initResult.authMethods`；非空则调用 `authNegotiator.authenticate()`，为空则跳过（详见场景 10） |
| 7   | AcpClient         | `createSession({ cwd, mcpServers })` | 获得 SessionResult                                                                                   |
| 8   | ConfigTracker     | `syncFromSessionResult(result)`      | 填充 currentModelId, availableModels 等                                                              |
| 9   | AcpSession        | `reassertConfig()`                   | 检查 desiredModelId — 此时为 null，跳过                                                              |
| 10  | AcpSession        | `setStatus('active')`                | status: `starting` → `active`                                                                        |
| 11  | AcpSession        | `sendMessage(text)`                  | 构造 QueuedPrompt，入队 PromptQueue                                                                  |
| 12  | AcpSession        | `scheduleDrain()` → `drainLoop()`    | dequeue，status: `active` → `prompting`                                                              |
| 13  | InputPreprocessor | `process(text, files)`               | 解析 @file 引用（此处无），构建 PromptContent                                                        |
| 14  | AcpClient         | `prompt(sessionId, content)`         | 发送 JSON-RPC prompt 请求                                                                            |
| 15  | MessageTranslator | `translate(notification)`            | 将 SessionNotification 翻译为 TMessage                                                               |
| 16  | PromptTimer       | `reset()`                            | 每收到 chunk 重置超时计时                                                                            |
| 17  | MessageTranslator | `onTurnEnd()`                        | 增量清理 messageMap 中已完成条目                                                                     |
| 18  | AcpSession        | `setStatus('active')`                | status: `prompting` → `active`                                                                       |

### 2.4 异常路径

**E1: spawn 失败**

- client.start() 抛出 `AgentSpawnError { code: 'CONNECTION_FAILED', retryable: true }`
- AcpSession.handleStartError() 进入指数退避重试 (1s → 2s → 4s)
- maxStartRetries=3，共 4 次尝试（1 次初始 + 3 次重试），全部失败 → `setStatus('error')` + `onSignal({ type: 'error', recoverable: false })`
- 验证 INV-S-03: 最终收敛到 error 状态

**E2: 认证失败**

- AuthNegotiator.authenticate() 抛出 `AcpError { code: 'AUTH_REQUIRED', retryable: true }`
- 不进入 error 状态，发 `onSignal({ type: 'auth_required', auth })` 通知 UI
- 停留在 `starting` 状态，等待用户登录后调用 `retryAuth()`
- 验证 INV-S-15: 认证信号必达
- 完整认证流程详见场景 10

**E3: 队列已满**

- PromptQueue.enqueue() 返回 false（已有 5 条）
- AcpSession 抛出 `AcpError { code: 'QUEUE_FULL' }`
- 验证 INV-S-14: 队列长度不超过 maxSize

---

## 3. 场景 2: 消息排队与 drain loop 处理

### 3.1 场景描述

| 项目         | 内容                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| **前置条件** | 会话已处于 `active` 状态，一个 prompt 正在执行中 (status = `prompting`) |
| **触发动作** | 用户连续快速发送 3 条消息："消息A"、"消息B"、"消息C"                    |
| **期望结果** | 3 条消息全部入队，当前 prompt 完成后 drain loop 按 FIFO 顺序逐条执行    |

### 3.2 时序图

```mermaid
sequenceDiagram
    participant UI as User (UI)
    participant RT as AcpRuntime
    participant S as AcpSession
    participant PQ as PromptQueue
    participant CL as AcpClient
    participant A as Agent Process

    Note over S: status = 'prompting'<br/>prompt-0 执行中

    UI->>RT: sendMessage(convId, "消息A")
    RT->>S: sendMessage("消息A")
    S->>PQ: enqueue(promptA)
    Note over PQ: [promptA] — length=1
    S-->>RT: onQueueUpdate({ items: [A], length: 1 })

    UI->>RT: sendMessage(convId, "消息B")
    RT->>S: sendMessage("消息B")
    S->>PQ: enqueue(promptB)
    Note over PQ: [promptA, promptB] — length=2
    S-->>RT: onQueueUpdate({ items: [A,B], length: 2 })

    UI->>RT: sendMessage(convId, "消息C")
    RT->>S: sendMessage("消息C")
    S->>PQ: enqueue(promptC)
    Note over PQ: [promptA, promptB, promptC] — length=3
    S-->>RT: onQueueUpdate({ items: [A,B,C], length: 3 })

    Note over S,A: prompt-0 完成

    A-->>CL: prompt_finished
    CL-->>S: PromptResponse
    S->>S: setStatus('active')

    Note over S: drainLoop 继续

    S->>PQ: dequeue() → promptA
    S-->>RT: onQueueUpdate({ items: [B,C], length: 2 })
    S->>S: setStatus('prompting')
    S->>CL: prompt(sessionId, contentA)
    A-->>CL: prompt_finished
    S->>S: setStatus('active')

    S->>PQ: dequeue() → promptB
    S-->>RT: onQueueUpdate({ items: [C], length: 1 })
    S->>S: setStatus('prompting')
    S->>CL: prompt(sessionId, contentB)
    A-->>CL: prompt_finished
    S->>S: setStatus('active')

    S->>PQ: dequeue() → promptC
    S-->>RT: onQueueUpdate({ items: [], length: 0 })
    S->>S: setStatus('prompting')
    S->>CL: prompt(sessionId, contentC)
    A-->>CL: prompt_finished
    S->>S: setStatus('active')

    Note over S: 队列为空, drainLoop 结束
```

### 3.3 步骤分解

| #    | 组件        | 方法                                   | 数据变化                                           |
| ---- | ----------- | -------------------------------------- | -------------------------------------------------- |
| 1    | AcpSession  | `sendMessage("消息A")`                 | status = `prompting`，进入 case `'prompting'` 分支 |
| 2    | PromptQueue | `enqueue(promptA)`                     | items: [] → [promptA]，返回 true                   |
| 3    | AcpSession  | —                                      | status 非 `active`，**不触发** scheduleDrain       |
| 4-5  | 同上        | `enqueue(promptB)`, `enqueue(promptC)` | items: [A] → [A,B] → [A,B,C]                       |
| 6    | AcpSession  | prompt-0 完成 → `setStatus('active')`  | drainLoop 的 while 循环回到顶部                    |
| 7    | PromptQueue | `dequeue()` → promptA                  | items: [A,B,C] → [B,C]                             |
| 8    | AcpSession  | `executePrompt(promptA)`               | status: `active` → `prompting` → `active`          |
| 9-10 | 同上        | `dequeue()` → promptB → promptC        | 逐条执行，严格 FIFO                                |
| 11   | AcpSession  | drainLoop while 条件不满足             | `draining = false`，循环结束                       |

**关键不变量验证**：

- **INV-S-01**: 任意时刻只有一个 prompt 在执行。drainLoop 中 `await executePrompt(item)` 确保串行。
- **INV-S-02**: 所有消息统一通过 PromptQueue.enqueue() 入队，drainLoop 串行出队。
- **INV-S-14**: 如果队列已有 5 条（maxSize=5），第 6 条 enqueue 返回 false，抛 QUEUE_FULL。
- **INV-X-02**: 每次入队/出队后都推送完整 QueueSnapshot（包含 items 数组 + length），不依赖增量。

> **与 Doc 3 状态转换表的关系**: 上方时序图展示的是细粒度路径——每条 prompt 完成后先经过 T9 (prompting→active) 再经过 T5 (active→prompting) 进入下一条。Doc 3 的转换表中 T10 (prompting→prompting) 是对这一连续 drain 过程的逻辑等价简化，两者语义一致。

### 3.4 异常路径

**E1: 中间某条 prompt 执行失败（非 crash）**

- executePrompt 的 catch 块调用 handlePromptError()
- 如果不是 PROCESS_CRASHED → 发 onSignal + setStatus('active')
- drainLoop 继续处理队列中的下一条消息
- 队列中后续消息不受影响

**E2: cancelAll() 在排队期间被调用**

- PromptQueue.clear() 清空所有待处理项，返回被清空的 QueuedPrompt[]
- 当前执行的 prompt 被 client.cancel() 取消
- queuePaused = false
- onQueueUpdate 推送空快照

---

## 4. 场景 3: 权限审批流程

### 4.1 场景描述

| 项目         | 内容                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| **前置条件** | 会话处于 `prompting` 状态，Agent 正在执行 prompt                            |
| **触发动作** | Agent 请求执行一个 bash 命令，需要用户批准                                  |
| **期望结果** | PermissionResolver 按 YOLO → Cache → UI 三级决策，用户审批后 Agent 继续执行 |

### 4.2 时序图 — YOLO 模式

```mermaid
sequenceDiagram
    participant A as Agent Process
    participant CL as AcpClient
    participant S as AcpSession
    participant PP as PermissionResolver
    participant PT as PromptTimer

    A->>CL: requestPermission({ toolCall: { name: "bash" }, options: [...] })
    CL->>S: handlePermissionRequest(request)
    S->>PT: pause() — 暂停超时计时
    S->>PP: evaluate(request, uiCallback)
    Note over PP: autoApproveAll = true
    PP->>PP: 找到 kind.startsWith('allow') 的选项
    PP-->>S: { optionId: "allow_once" }
    S->>PT: resume() — 恢复超时计时
    S-->>CL: RequestPermissionResponse
    CL-->>A: 继续执行 bash 命令
```

### 4.3 时序图 — Cache 命中

```mermaid
sequenceDiagram
    participant A as Agent Process
    participant CL as AcpClient
    participant S as AcpSession
    participant PP as PermissionResolver
    participant AC as ApprovalCache (内嵌)
    participant PT as PromptTimer

    A->>CL: requestPermission({ toolCall: { name: "bash" }, options: [...] })
    CL->>S: handlePermissionRequest(request)
    S->>S: promptExecutor.pauseTimer()
    S->>PP: evaluate(request, uiCallback)
    Note over PP: autoApproveAll = false
    PP->>AC: lookup(request)
    Note over AC: 匹配到之前 "allow_always" 的缓存
    AC-->>PP: { optionId: "allow_always" }
    PP-->>S: { optionId: "allow_always" }
    S->>S: promptExecutor.resumeTimer()
    S-->>CL: RequestPermissionResponse
    CL-->>A: 继续执行
```

### 4.4 时序图 — UI 审批

```mermaid
sequenceDiagram
    participant A as Agent Process
    participant CL as AcpClient
    participant S as AcpSession
    participant PP as PermissionResolver
    participant AC as ApprovalCache (内嵌)
    participant PT as PromptTimer
    participant UI as User (UI)

    A->>CL: requestPermission(request)
    CL->>S: handlePermissionRequest(request)
    S->>S: promptExecutor.pauseTimer() — INV-S-04: 权限等待期间暂停计时
    S->>PP: evaluate(request, uiCallback)
    PP->>AC: lookup(request) → null
    Note over PP: 创建 pending Promise<br/>pending.set(callId, { resolve, reject })
    PP->>UI: uiCallback(PermissionUIData)
    Note over UI: 弹窗: "允许 Agent 执行 bash -c 'rm -rf ...'?"

    Note over PP: 等待用户操作...<br/>INV-S-04: timer 处于 paused 状态

    UI->>S: confirmPermission(callId, "allow_always")
    S->>PP: resolve(callId, "allow_always")
    PP->>AC: store(request, response) — always 类型写入缓存
    PP->>PP: pending.delete(callId)
    PP-->>S: { optionId: "allow_always" } — Promise resolves

    S->>S: promptExecutor.resumeTimer() — INV-S-04: 恢复计时
    S-->>CL: RequestPermissionResponse
    CL-->>A: 继续执行
```

### 4.5 步骤分解 (UI 审批路径)

| #   | 组件               | 方法                                  | 数据变化                                        |
| --- | ------------------ | ------------------------------------- | ----------------------------------------------- |
| 1   | AcpClient          | SDK 回调 `onRequestPermission`        | 收到 Agent 的权限请求                           |
| 2   | AcpSession         | `handlePermissionRequest(request)`    | 进入权限处理流程                                |
| 3   | PromptTimer        | `pause()`                             | state: `running` → `paused`，记录剩余时间       |
| 4   | PermissionResolver | `evaluate(request, uiCallback)`       | 检查 YOLO → 检查 Cache                          |
| 5   | ApprovalCache      | `lookup(request)`                     | 缓存未命中，返回 null                           |
| 6   | PermissionResolver | 创建 pending Promise                  | pending Map 新增 `callId → { resolve, reject }` |
| 7   | PermissionResolver | `uiCallback(PermissionUIData)`        | 通过 callbacks.onPermissionRequest 推送到 UI    |
| 8   | UI                 | 用户点击"允许"                        | —                                               |
| 9   | AcpSession         | `confirmPermission(callId, optionId)` | 路由到 PermissionResolver                       |
| 10  | PermissionResolver | `resolve(callId, optionId)`           | pending Map 删除该条目                          |
| 11  | ApprovalCache      | `store(request, response)`            | 如果选项是 `always` 类型，写入 LRU 缓存         |
| 12  | PromptTimer        | `resume()`                            | state: `paused` → `running`，剩余时间继续倒计时 |

### 4.6 异常路径

**E1: 权限等待期间进程 crash**

- handleDisconnect() 被触发
- `permissionResolver.cancelAll()` → 所有 pending Promise 被 reject(`PERMISSION_CANCELLED`)
- handlePermissionRequest 的 try-catch 捕获异常
- promptTimer.resume() 在 finally 块中执行（随后被 handleDisconnect 中的 stop() 覆盖）
- 验证 INV-S-10: 非 prompting 状态下 pending 为空
- 验证 INV-X-04: 无泄漏的 pending Promise

**E2: ApprovalCache 达到上限 (500 条)**

- LRU 淘汰最旧条目，然后写入新条目
- 验证 INV-S-13: 缓存大小始终 <= maxSize

---

## 5. 场景 4: 会话挂起与恢复

### 5.1 场景描述

| 项目         | 内容                                                             |
| ------------ | ---------------------------------------------------------------- |
| **前置条件** | 会话处于 `active` 状态，队列为空，Agent 进程在运行               |
| **触发动作** | (1) 系统调用 suspend() 挂起；(2) 用户发送新消息触发恢复          |
| **期望结果** | 进程被优雅关闭，sessionId 保留；恢复时重新启动进程并 loadSession |

### 5.2 时序图

```mermaid
sequenceDiagram
    participant UI as User (UI)
    participant RT as AcpRuntime
    participant S as AcpSession
    participant CS as ConfigTracker
    participant PQ as PromptQueue
    participant CL as AcpClient
    participant A as Agent Process
    participant DB as Database

    Note over UI,DB: ═══ 阶段 1: 挂起 (Suspend) ═══

    RT->>S: suspend()
    Note over S: 前置检查: status=='active' && queue.isEmpty

    S->>CL: closeSession(sessionId)
    CL->>A: JSON-RPC closeSession
    S->>CL: close()
    Note over CL: 内部: stdin.end() → 等100ms<br/>→ SIGTERM → 等1500ms<br/>→ SIGKILL (if needed)
    CL-->>S: close complete
    S->>S: client = null
    S->>S: _sessionId 保留 (savedSessionId)
    S->>S: setStatus('suspended')
    S-->>RT: onStatusChange('suspended')
    RT->>DB: acp_session.updateStatus('suspended', suspended_at=now)
    RT->>DB: conversations.update(status='running')

    Note over UI,DB: ═══ 阶段 2: 恢复 (Resume) ═══

    UI->>RT: sendMessage(convId, "继续上次的工作")
    RT->>S: sendMessage("继续上次的工作")
    Note over S: status=='suspended' 分支

    S->>PQ: enqueue(prompt)
    S-->>RT: onQueueUpdate(snapshot)
    S->>S: resume()
    S->>S: setStatus('resuming')
    S-->>RT: onStatusChange('resuming')

    S->>CL: start() — 创建新的子进程 + 初始化
    CL->>A: spawn + initialize
    A-->>CL: InitializeResponse

    S->>S: tryResumeOrCreate()
    S->>CL: loadSession(savedSessionId)
    CL->>A: JSON-RPC loadSession
    A-->>CL: SessionResult (上下文已恢复)

    S->>CS: syncFromSessionResult(result)
    S->>S: reassertConfig()
    S->>S: resumeRetryCount = 0
    S->>S: setStatus('active')
    S-->>RT: onStatusChange('active')
    RT->>DB: acp_session.updateStatus('active', suspended_at=null)

    S->>S: scheduleDrain() → drainLoop() → executePrompt
```

### 5.3 步骤分解

**挂起阶段**:

| #   | 组件       | 方法                     | 数据变化                                      |
| --- | ---------- | ------------------------ | --------------------------------------------- |
| 1   | AcpSession | `suspend()`              | 前置检查: status == `active` && queue.isEmpty |
| 2   | AcpSession | `teardownConnection()`   | 调用 client.closeSession + client.close       |
| 3   | AcpClient  | `close()` → 三阶段关闭   | 三阶段关闭 (INV-I-02)                         |
| 4   | AcpSession | 清理引用                 | client = null                                 |
| 5   | AcpSession | `setStatus('suspended')` | 保留 \_sessionId 用于后续 resume              |
| 6   | AcpRuntime | onStatusChange callback  | 写入 DB: suspended_at = Date.now() (INV-A-01) |

**恢复阶段**:

| #   | 组件          | 方法                            | 数据变化                                    |
| --- | ------------- | ------------------------------- | ------------------------------------------- |
| 7   | AcpSession    | `sendMessage(text)`             | status = `suspended` → 入队 + 调用 resume() |
| 8   | AcpSession    | `resume()`                      | status: `suspended` → `resuming`            |
| 9   | AcpClient     | `start()`                       | 启动新的 Agent 子进程 + 初始化              |
| 10  | AcpClient     | `loadSession(savedSessionId)`   | 尝试恢复之前的上下文                        |
| 11  | ConfigTracker | `syncFromSessionResult(result)` | 同步恢复后的配置                            |
| 12  | AcpSession    | `reassertConfig()`              | 如果 resume 前用户切换了 model，此时 apply  |
| 13  | AcpSession    | `setStatus('active')`           | 恢复完成，开始 drain 队列                   |

### 5.4 异常路径

**E1: loadSession 失败 (session 过期)**

- loadSession 抛异常
- tryResumeOrCreate 的 catch 块发送 `onSignal({ type: 'session_expired' })`
- 降级调用 `client.createSession()` 创建新 session
- 用户看到"会话已过期，已创建新会话"提示，但操作不中断

**E2: resume 过程中连接失败**

- handleResumeError 检查 retryable 和 resumeRetryCount
- 最多重试 2 次 (INV-S-08: maxResumeRetries = 2)
- 指数退避: 1s → 2s
- 超限后 → enterErrorState() → status = `error`, 清空队列 (INV-S-07)

**E3: suspend() 被调用时队列非空**

- suspend() 检测到 `!this.promptQueue.isEmpty`，直接 return
- 不执行任何操作
- 验证 INV-S-05: 有队列不挂起

---

## 6. 场景 5: Agent 进程崩溃与错误恢复

### 6.1 场景描述

| 项目         | 内容                                                                  |
| ------------ | --------------------------------------------------------------------- |
| **前置条件** | 会话处于 `prompting` 状态，Agent 正在执行 prompt，队列中还有 2 条消息 |
| **触发动作** | Agent 进程意外崩溃 (SIGSEGV / OOM)                                    |
| **期望结果** | 自动 resume，队列暂停 (queuePaused = true)，等待用户决定是否继续      |

### 6.2 时序图

```mermaid
sequenceDiagram
    participant UI as User (UI)
    participant RT as AcpRuntime
    participant S as AcpSession
    participant PP as PermissionResolver
    participant PQ as PromptQueue
    participant PT as PromptTimer
    participant CL as AcpClient
    participant A as Agent Process
    participant A2 as New Agent Process

    Note over S: status='prompting'<br/>queue=[msg1, msg2]

    A-xCL: 进程崩溃 (连接断开)
    CL-->>S: onDisconnect({ reason: 'process_exit', exitCode: 1, signal: null, stderr: '...' })
    S->>S: handleDisconnect(info)
    Note over S: wasDuringPrompt = true

    S->>S: client = null
    S->>PP: cancelAll() — reject 所有 pending 权限
    S->>PT: stop() — 停止超时计时

    Note over S: 进入 crash recovery

    S->>S: queuePaused = true — INV-S-06
    S->>S: resume()
    S->>S: setStatus('resuming')
    S-->>RT: onStatusChange('resuming')

    S->>CL: start() — 启动新进程 + 初始化
    CL->>A2: spawn + initialize
    A2-->>CL: InitializeResponse

    S->>S: tryResumeOrCreate()
    S->>CL: loadSession(savedSessionId)
    CL->>A2: JSON-RPC loadSession
    A2-->>CL: SessionResult

    S->>S: setStatus('active')
    S-->>RT: onStatusChange('active')

    Note over S: queuePaused = true,<br/>不自动 drain

    S-->>RT: onSignal({ type: 'queue_paused', reason: 'crash_recovery' })
    RT-->>UI: "Agent 已恢复，队列已暂停，是否继续?"

    Note over UI: 用户选择继续

    UI->>RT: resumeQueue(convId)
    RT->>S: resumeQueue()
    S->>S: queuePaused = false
    S->>S: scheduleDrain()
    S->>S: drainLoop() — 继续处理 msg1, msg2
```

### 6.3 步骤分解

| #   | 组件               | 方法                     | 数据变化                                            |
| --- | ------------------ | ------------------------ | --------------------------------------------------- |
| 1   | AcpClient          | `onDisconnect` 触发      | 进程崩溃导致连接断开，回调带 DisconnectInfo         |
| 2   | AcpSession         | `handleDisconnect(info)` | 检测 wasDuringPrompt = true (status 是 `prompting`) |
| 3   | AcpSession         | 清理引用                 | client = null                                       |
| 4   | PermissionResolver | `cancelAll()`            | 所有 pending Promise 被 reject (INV-S-10, INV-X-04) |
| 5   | PromptTimer        | `stop()`                 | state: 任意 → `idle`                                |
| 6   | AcpSession         | `queuePaused = true`     | INV-S-06: crash 后队列暂停                          |
| 7   | AcpSession         | `resume()`               | 开始恢复流程，status → `resuming`                   |
| 8   | AcpClient          | `start()`                | 启动新的 Agent 子进程 + 初始化                      |
| 9   | AcpClient          | `loadSession`            | 恢复协议 session                                    |
| 10  | AcpSession         | `setStatus('active')`    | 恢复成功                                            |
| 11  | AcpSession         | 检测 queuePaused         | 不调用 scheduleDrain，发送 queue_paused 信号        |
| 12  | UI                 | 用户点击"继续"           | AcpRuntime.resumeQueue(convId)                      |
| 13  | AcpSession         | `resumeQueue()`          | queuePaused = false, scheduleDrain() 开始处理       |

### 6.4 异常路径

**E1: 非 prompt 期间的进程退出**

- handleDisconnect 中 wasDuringPrompt = false
- 不设 queuePaused，直接 `setStatus('suspended')`
- 静默挂起，下次用户操作时 resume
- 与场景 4 (正常 suspend/resume) 的恢复流程相同

**E2: 恢复重试超限**

- resume() 中 connect 或 loadSession 失败
- handleResumeError 检查 resumeRetryCount < 2 (INV-S-08)
- 首次重试: 延迟 1s；第二次重试: 延迟 2s
- 超限后: `enterErrorState(err)` → 清空队列 (INV-S-07)，status → `error`
- 验证 INV-S-03: 异常路径最终收敛到 error 态

**E3: 用户选择不继续，执行 cancelAll()**

- `cancelAll()`: cancel 当前 prompt + promptQueue.clear() + queuePaused = false
- 队列清空，msg1 和 msg2 被丢弃

---

## 7. 场景 6: 空闲回收

### 7.1 场景描述

| 项目         | 内容                                                 |
| ------------ | ---------------------------------------------------- |
| **前置条件** | 用户 30 分钟未操作，会话处于 `active` 状态，队列为空 |
| **触发动作** | IdleReclaimer 定时扫描发现超时 session               |
| **期望结果** | 自动 suspend，释放 Agent 进程资源                    |

### 7.2 时序图

```mermaid
sequenceDiagram
    participant IR as IdleReclaimer
    participant SE as SessionEntry
    participant S as AcpSession
    participant CL as AcpClient
    participant A as Agent Process
    participant DB as Database

    Note over IR: setInterval 每 60s 扫描

    IR->>IR: scan()
    IR->>SE: 检查 lastActiveAt

    Note over IR: now - lastActiveAt > 30min<br/>session.status === 'active'<br/>→ 满足回收条件

    IR->>S: suspend()
    S->>S: 前置检查通过 (active + 队列空)
    S->>CL: closeSession(sessionId)
    CL->>A: JSON-RPC closeSession
    S->>CL: close()
    Note over CL: 三阶段关闭
    CL->>A: stdin.end → SIGTERM → SIGKILL
    S->>S: client = null
    S->>S: setStatus('suspended')
    S-->>DB: suspended_at = now

    Note over S: 进程已释放<br/>sessionId 保留<br/>等待下次用户操作时 resume
```

### 7.3 步骤分解

| #   | 组件          | 方法                     | 数据变化                                                      |
| --- | ------------- | ------------------------ | ------------------------------------------------------------- |
| 1   | IdleReclaimer | `scan()` (定时器触发)    | 遍历 sessions Map                                             |
| 2   | IdleReclaimer | 条件检查                 | `now - lastActiveAt > idleTimeoutMs` && `status === 'active'` |
| 3   | AcpSession    | `suspend()`              | 前置检查: status=active, queue.isEmpty                        |
| 4   | AcpSession    | `teardownConnection()`   | closeSession + close                                          |
| 5   | AcpClient     | `close()`                | 三阶段关闭 (INV-I-02)                                         |
| 6   | AcpSession    | `setStatus('suspended')` | sessionId 保留                                                |
| 7   | AcpRuntime    | onStatusChange           | DB 写入 suspended_at (INV-A-01)                               |

### 7.4 异常路径

**E1: session 处于 prompting 状态**

- IdleReclaimer.scan() 检查 `session.status === 'active'`
- prompting 不等于 active，跳过
- 验证 INV-A-02: 不回收正在执行 prompt 的 session

**E2: 队列非空**

- suspend() 内部检查 `!this.promptQueue.isEmpty`，直接 return
- IdleReclaimer 不知道 suspend 被跳过，下次扫描再检查
- 验证 INV-A-02: 不回收有待处理消息的 session

**E3: shutdown 过程中进程不响应**

- gracefulShutdown 按三阶段执行: stdin.end → SIGTERM → SIGKILL
- 最终 child.unref() 确保 Electron 主进程可正常退出
- 验证 INV-I-01: shutdown 后 isAlive() = false

---

## 8. 场景 7: 运行中切换模型/模式

### 8.1 场景描述

| 项目         | 内容                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| **前置条件** | 会话处于 `prompting` 状态，用户在 UI 切换了 model                              |
| **触发动作** | 用户将 model 从 "claude-sonnet" 切换为 "claude-opus"                           |
| **期望结果** | model 意图被缓存，当前 prompt 完成后在下一次 prompt 前通过 reassertConfig 生效 |

### 8.2 时序图

```mermaid
sequenceDiagram
    participant UI as User (UI)
    participant RT as AcpRuntime
    participant S as AcpSession
    participant CS as ConfigTracker
    participant CL as AcpClient
    participant A as Agent Process

    Note over S: status = 'prompting'<br/>prompt 正在执行

    UI->>RT: setModel(convId, "claude-opus")
    RT->>S: setModel("claude-opus")
    S->>S: applyConfigChange('model', 'claude-opus')
    Note over S: status='prompting',<br/>进入 canDefer 分支

    S->>CS: setDesiredModel("claude-opus")
    Note over CS: desiredModelId = "claude-opus"<br/>currentModelId = "claude-sonnet"
    S-->>RT: onModelUpdate({ current: "sonnet", desired: "opus", ... })
    RT-->>UI: 乐观更新 — UI 显示 "claude-opus (切换中)"

    Note over S,A: 当前 prompt 完成

    A-->>CL: prompt_finished
    S->>S: setStatus('active')
    S->>S: drainLoop → 下一条 prompt

    S->>S: executePrompt(nextPrompt)
    S->>S: setStatus('prompting')
    S->>S: reassertConfig()
    S->>CS: getPendingChanges()
    CS-->>S: { model: "claude-opus" }
    S->>CL: setModel(sessionId, "claude-opus")
    CL->>A: JSON-RPC setModel
    A-->>CL: success
    S->>CS: setCurrentModel("claude-opus")
    Note over CS: desiredModelId = null<br/>currentModelId = "claude-opus"
    S-->>RT: onModelUpdate({ current: "opus", desired: null, ... })

    S->>CL: prompt(sessionId, content)
    Note over S,A: 新 prompt 使用 claude-opus
```

### 8.3 步骤分解

| #   | 组件          | 方法                                                          | 数据变化                                           |
| --- | ------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| 1   | AcpSession    | `setModel("claude-opus")` → `applyConfigChange('model', ...)` | status = prompting → canDefer 分支                 |
| 2   | ConfigTracker | `setDesiredModel("claude-opus")`                              | desiredModelId = "claude-opus"                     |
| 3   | AcpSession    | 通过 callback 推送                                            | onModelUpdate 包含 desired 和 current，UI 乐观更新 |
| 4   | AcpSession    | 当前 prompt 完成                                              | status → active                                    |
| 5   | AcpSession    | `executePrompt(nextPrompt)`                                   | drainLoop 出队下一条                               |
| 6   | AcpSession    | `reassertConfig()`                                            | 在发送 prompt 前检查 pending changes               |
| 7   | ConfigTracker | `getPendingChanges()`                                         | 返回 `{ model: "claude-opus" }`                    |
| 8   | AcpClient     | `setModel(sessionId, "claude-opus")`                          | 通知 Agent 切换模型                                |
| 9   | ConfigTracker | `setCurrentModel("claude-opus")`                              | currentModelId 更新，desiredModelId = null         |

**关键不变量验证**：

- **INV-S-11**: reassertConfig 完成后 `desiredModelId === null || desiredModelId === currentModelId`

### 8.4 异常路径

**E1: setModel 在 active 状态下调用**

- canDirect 分支: 直接调用 `client.setModel()`
- 不经过 desired/reassert 流程，立即生效

**E2: setModel 在 idle 或 error 状态下调用**

- 抛出 `AcpError { code: 'INVALID_STATE' }`

**E3: reassertConfig 中 client.setModel 失败**

- reassertConfig 中的 await 抛异常
- 如果发生在 start() 流程中，被 handleStartError 捕获
- 如果发生在 executePrompt 流程中，被 executePrompt 的 catch 块捕获
- desiredModelId 保持不变，下次 reassertConfig 会再次尝试

---

## 9. 场景 8: WebSocket 远程连接

### 9.1 场景描述

| 项目         | 内容                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| **前置条件** | AgentConfig 中 remoteUrl 不为空 (如 `wss://remote-agent.example.com/acp`) |
| **触发动作** | 创建新会话                                                                |
| **期望结果** | ClientFactory 创建 WebSocketAcpClient，通过 WebSocket 建立连接            |

### 9.2 时序图

```mermaid
sequenceDiagram
    participant RT as AcpRuntime
    participant CF as ClientFactory
    participant S as AcpSession
    participant CL as WebSocketAcpClient
    participant RA as Remote Agent

    RT->>CF: create(agentConfig)
    Note over CF: agentConfig.remoteUrl 存在<br/>→ 创建 WebSocketAcpClient

    CF-->>RT: WebSocketAcpClient

    RT->>S: new AcpSession(config, client, callbacks)
    RT->>S: start()
    S->>S: setStatus('starting')

    S->>CL: start()
    Note over CL: 内部: new WebSocket(url, { headers }) → 握手 → JSON-RPC initialize
    CL->>RA: WebSocket 连接 + initialize
    RA-->>CL: InitializeResponse

    S->>CL: createSession(...)
    CL->>RA: JSON-RPC newSession
    RA-->>CL: SessionResult

    S->>S: setStatus('active')

    Note over S,RA: 后续 prompt/消息流程<br/>与 ProcessAcpClient 场景完全相同
```

### 9.3 与 IPC 的差异对比

| 维度                  | ProcessAcpClient                                 | WebSocketAcpClient                                                 |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| **连接建立**          | `spawn(command, args)` 启动本地子进程            | `new WebSocket(url, headers)` 建立远程连接                         |
| **Stream 来源**       | `NdjsonTransport.fromChildProcess(child)`        | SDK 内置 WebSocket transport（由 `@agentclientprotocol/sdk` 提供） |
| **关闭方式**          | 三阶段: stdin.end → SIGTERM → SIGKILL            | `ws.close()`                                                       |
| **lifecycleSnapshot** | `pid` 有值, `lastExit` 含 exitCode/signal/stderr | `pid` 为 null, `lastExit.reason` = 'connection_close'              |
| **错误特征**          | 进程 crash (SIGSEGV/OOM/exit)                    | 网络断开 / 服务端关闭                                              |
| **resume 成功率**     | 较高 (本地进程重启快)                            | 依赖网络和服务端状态                                               |

**关键一致性**: 一旦 `start()` 成功返回 InitializeResponse，后续的 AcpClient 方法调用、状态机转换、PromptQueue 行为完全相同。AcpClient 接口隔离了连接建立方式的差异。

### 9.4 异常路径

**E1: WebSocket 连接失败**

- client.start() 内部 waitForOpen(ws) 超时或被拒绝
- 抛出 `AgentSpawnError { code: 'CONNECTION_FAILED', retryable: true }`
- AcpSession 进入与 ProcessAcpClient 相同的重试逻辑

**E2: 远程连接意外断开**

- WebSocket onclose 事件触发
- client.onDisconnect handler 被调用，含 DisconnectInfo { reason: 'connection_close' }
- AcpSession.handleDisconnect(info) — 与 ProcessAcpClient 进程 crash 处理流程完全相同

**E3: resume 时远程服务不可用**

- client.start() 失败 → handleResumeError → 指数退避重试
- 网络恢复后 resume 可能成功
- 如果服务端没有保留 session，loadSession 失败 → 降级 createSession

---

## 10. 场景 9: 从错误状态手动恢复

### 10.1 场景描述

| 项目         | 内容                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| **前置条件** | 会话处于 `error` 状态（例如场景 5 E2 中 resume 重试超限后的终态），队列已被清空 |
| **触发动作** | 用户点击"重试"按钮                                                              |
| **期望结果** | 重新启动 Agent 进程，完成 ACP 协议握手，session 回到 `active` 状态              |

### 10.2 时序图

```mermaid
sequenceDiagram
    participant UI as User (UI)
    participant RT as AcpRuntime
    participant S as AcpSession
    participant CS as ConfigTracker
    participant CF as ClientFactory
    participant CL as AcpClient
    participant A as Agent Process

    Note over S: status = 'error'<br/>queue 已清空<br/>client = null

    UI->>RT: retrySession(convId)
    RT->>S: start()
    S->>S: startRetryCount = 0 — 重置重试计数 (T21)
    S->>S: setStatus('starting')
    S-->>RT: onStatusChange('starting')
    RT-->>UI: signalEvent(status_change)

    S->>CL: start()
    Note over CL: 内部: spawn(command, args) → 建立管道 → JSON-RPC initialize
    CL->>A: spawn + initialize
    A-->>CL: InitializeResponse

    S->>CL: createSession({ cwd, mcpServers })
    CL->>A: JSON-RPC newSession
    A-->>CL: SessionResult { sessionId, models, modes }

    S->>CS: syncFromSessionResult(result)
    S-->>RT: onSessionId(sessionId)
    S-->>RT: onConfigUpdate / onModelUpdate / onModeUpdate
    S->>S: reassertConfig()
    S->>S: setStatus('active')
    S-->>RT: onStatusChange('active')
    RT-->>UI: signalEvent(status_change) — UI 恢复可用

    S->>S: scheduleDrain() — 队列为空, 不执行
```

### 10.3 步骤分解

| #   | 组件          | 方法                            | 数据变化                                                     |
| --- | ------------- | ------------------------------- | ------------------------------------------------------------ |
| 1   | UI            | 用户点击"重试"                  | 触发 retrySession(convId)                                    |
| 2   | AcpRuntime    | `retrySession(convId)`          | 路由到对应 AcpSession                                        |
| 3   | AcpSession    | `start()`                       | 重置 startRetryCount = 0，status: `error` → `starting` (T21) |
| 4   | AcpClient     | `start()`                       | 启动新的 Agent 子进程 + 初始化                               |
| 5   | AcpClient     | `createSession(...)`            | 获得新的 SessionResult（旧 session 已失效，创建新会话）      |
| 6   | ConfigTracker | `syncFromSessionResult(result)` | 填充 model/mode 配置                                         |
| 7   | AcpSession    | `reassertConfig()`              | 如果 error 前用户切换过 model，此时 apply                    |
| 8   | AcpSession    | `setStatus('active')`           | status: `starting` → `active`，恢复完成                      |

**关键不变量验证**：

- **INV-S-09**: error → starting → active 是合法转换路径 (T21 + T2)
- **INV-S-03**: 从 error 状态成功恢复，验证状态收敛的可逆性

### 10.4 异常路径

**E1: 重试时 spawn 再次失败**

- 与场景 1 E1 相同的重试逻辑：指数退避 (1s → 2s → 4s)
- maxStartRetries=3，共 4 次尝试（1 次初始 + 3 次重试）
- 全部失败 → 再次 `setStatus('error')`
- 用户可再次点击"重试"

**E2: 重试时认证失败**

- 不可重试错误，直接 `setStatus('error')`
- 用户需检查 API Key 配置后再重试

---

## 11. 场景 10: 未认证用户条件认证流程

### 11.1 场景描述

| 项目         | 内容                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **前置条件** | 用户未登录（无有效 token / API Key），选择了需要认证的 Agent（如 Claude）                                           |
| **触发动作** | 创建新会话并发送消息                                                                                                |
| **期望结果** | 系统检测到需要认证 → 发 `auth_required` 信号给 UI → 用户通过某种方式登录 → `retryAuth()` → 完整重启 → 进入 `active` |

### 11.2 时序图

```mermaid
sequenceDiagram
    participant UI as Renderer (UI)
    participant RT as AcpRuntime
    participant S as AcpSession
    participant AH as AuthNegotiator
    participant CL as AcpClient
    participant A as Agent Process
    participant A2 as New Agent Process

    Note over UI,A: ═══ 阶段 1: 启动 + 认证失败 ═══

    UI->>RT: createConversation(agentConfig)
    RT->>S: start()
    S->>S: setStatus('starting')
    S-->>RT: onStatusChange('starting')

    S->>CL: start()
    Note over CL: 内部: spawn + initialize
    CL->>A: spawn + JSON-RPC initialize
    A-->>CL: { authMethods: [{ type: 'agent', id: 'oauth' }, { type: 'env_var', ... }] }

    Note over S,AH: authMethods 非空，需要认证
    S->>AH: authenticate(client, authMethods)
    AH->>CL: extMethod('authenticate', credentials)
    CL->>A: JSON-RPC authenticate
    A-->>CL: AUTH_FAILED (无有效 token)
    CL-->>AH: reject
    AH-->>S: throw AcpError('AUTH_REQUIRED', { authOptions })

    Note over S: handleStartError(AUTH_REQUIRED)
    S->>S: authPending = true
    S->>S: teardownConnection()
    Note over S: client = null<br/>停留在 starting 状态
    S-->>RT: onSignal({ type: 'auth_required', auth: { agentBackend, methods } })
    RT-->>UI: auth_required 信号 + AuthMethod[]

    Note over UI,A: ═══ 阶段 2: 用户登录 ═══

    Note over UI: UI 展示登录选项:
    alt 浏览器 OAuth
        UI->>UI: shell.openExternal(oauthUrl)
        Note over UI: 用户在浏览器完成 OAuth 授权
        UI->>RT: retryAuth(convId)
        RT->>S: retryAuth()
    else 终端登录
        UI->>UI: 打开系统终端执行 "claude /login"
        Note over UI: 用户在终端完成 CLI 登录
        UI->>RT: retryAuth(convId)
        RT->>S: retryAuth()
    else 环境变量 (API Key)
        UI->>UI: 弹出输入框，用户输入 API Key
        UI->>RT: retryAuth(convId, { ANTHROPIC_API_KEY: "sk-..." })
        RT->>S: retryAuth({ ANTHROPIC_API_KEY: "sk-..." })
    end

    Note over UI,A2: ═══ 阶段 3: retryAuth 完整重启 ═══

    S->>AH: mergeCredentials(credentials)
    Note over AH: 合并新凭据到内存缓存
    S->>S: authPending = false
    S->>S: setStatus('idle')
    S->>S: start()

    S->>S: setStatus('starting')
    S->>CL: start()
    Note over CL: 内部: spawn 新进程 + initialize
    CL->>A2: spawn + JSON-RPC initialize
    A2-->>CL: { authMethods: [...] }

    S->>AH: authenticate(client, authMethods)
    AH->>CL: extMethod('authenticate', mergedCredentials)
    CL->>A2: JSON-RPC authenticate
    A2-->>CL: AuthenticateResponse (成功)
    AH-->>S: 认证通过

    S->>CL: createSession({ cwd, mcpServers })
    CL->>A2: JSON-RPC newSession
    A2-->>CL: SessionResult { sessionId, models, modes }

    S->>S: setStatus('active')
    S-->>RT: onStatusChange('active')
    RT-->>UI: 会话就绪，可以发送消息
    S->>S: scheduleDrain()
```

### 11.3 步骤分解

**阶段 1: 启动 + 认证失败**

| #   | 组件           | 方法                                | 数据变化                                                        |
| --- | -------------- | ----------------------------------- | --------------------------------------------------------------- |
| 1   | AcpSession     | `start()`                           | status: `idle` → `starting`                                     |
| 2   | AcpClient      | `start()`                           | 内部: spawn Agent 子进程 + initialize                           |
| 3   | AcpSession     | 条件认证检查                        | `initResult.authMethods` 非空                                   |
| 4   | AuthNegotiator | `authenticate(client, authMethods)` | 调用 `client.extMethod('authenticate', credentials)`            |
| 5   | AcpClient      | `extMethod('authenticate', ...)`    | Agent 返回 AUTH_FAILED (无有效 token)                           |
| 6   | AuthNegotiator | 抛出 `AcpError('AUTH_REQUIRED')`    | 附带 `AuthRequiredData { agentBackend, methods: AuthMethod[] }` |
| 7   | AcpSession     | `handleStartError(AUTH_REQUIRED)`   | 设置 `authPending = true`                                       |
| 8   | AcpSession     | `teardownConnection()`              | 关闭连接，`client = null`                                       |
| 9   | AcpSession     | `callbacks.onSignal(auth_required)` | 通知 Application 层，附带 AuthMethod[] 供 UI 展示               |

**三种登录方式 (UI 职责)**

| 方式           | UI 行为                                                | retryAuth 参数                                            |
| -------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| OAuth (浏览器) | `shell.openExternal(url)` 打开授权页面，用户完成后回调 | `retryAuth()` — 无需传凭据，Agent CLI 已自动获取 token    |
| 终端登录       | 打开系统终端执行 `claude /login`，用户完成 CLI 登录    | `retryAuth()` — 无需传凭据，Agent CLI 已自动获取 token    |
| 环境变量       | 弹出输入框，用户输入 API Key                           | `retryAuth({ ANTHROPIC_API_KEY: "sk-..." })` — 传入键值对 |

**阶段 3: retryAuth 重启**

| #   | 组件           | 方法                                | 数据变化                                      |
| --- | -------------- | ----------------------------------- | --------------------------------------------- |
| 10  | AuthNegotiator | `mergeCredentials(credentials)`     | 合并新凭据到内存缓存（仅 env_var 方式有凭据） |
| 11  | AcpSession     | `authPending = false`               | 清除认证等待标志                              |
| 12  | AcpSession     | `setStatus('idle')` + `start()`     | 完整重启: client.start → createSession        |
| 13  | AcpClient      | `start()`                           | spawn 新的 Agent 子进程 + initialize          |
| 14  | AuthNegotiator | `authenticate(client, authMethods)` | 使用合并后的凭据认证                          |
| 15  | AcpClient      | `extMethod('authenticate', ...)`    | 认证成功                                      |
| 16  | AcpClient      | `createSession(...)`                | 创建新 session                                |
| 17  | AcpSession     | `setStatus('active')`               | status: `starting` → `active`，会话就绪       |

**关键不变量验证**:

- **INV-S-15**: 认证失败时必须通过 `callbacks.onSignal({ type: 'auth_required' })` 通知 UI，不进入 error 状态
- **INV-S-03**: 认证等待期间保持 `starting` 状态且资源已释放 (`client === null`)，由 `retryAuth()` 或 `stop()` 推进到下一状态

### 11.4 异常路径

**E1: retryAuth 后仍然失败**

- `retryAuth()` 触发完整 `start()` 流程
- `authenticate()` 再次失败 → 再次抛 `AUTH_REQUIRED`
- `handleStartError(AUTH_REQUIRED)` 再次发 `auth_required` 信号
- 用户可无限重试，不存在重试次数限制（与连接失败的有限重试不同）
- 每次 retryAuth 都是 reset 模式: teardown → idle → 完整 start()

**E2: 用户不登录直接关闭**

- 用户在认证等待期间调用 `stop()`
- `stop()` 检测到 `authPending = true`，清理状态
- status → `idle`，正常关闭
- 验证 INV-S-03: 认证等待可通过 `stop()` 安全退出

**E3: 不需要认证的 Agent**

- `initResult.authMethods` 为空数组或字段缺失
- AcpSession 跳过 `authNegotiator.authenticate()` 调用
- 直接进入 `createSession()` → `active`
- 整个认证分支不被执行

**E4: resuming 状态下的认证失败**

- `resume()` 流程中 `authenticate()` 也可能失败
- 行为与 starting 状态一致: 发 `auth_required` 信号，停留在 `resuming` 状态
- `retryAuth()` 同样走 reset 模式 (teardown + start)

---

## 参考文档

- [完整架构设计](../round-02/arch-a/final-architecture.md) — 核心组件定义和状态机详情
- [23 条不变量](../round-02/arch-b/invariants.md) — 测试需要验证的系统不变量
- [共识决议](../round-01/inspector/consensus-decisions.md) — D1-D13 设计决策
- [Connector 简化](../round-04/inspector/consensus-update.md) — ProcessAcpClient + WebSocketAcpClient
- [数据库持久化](../round-05/inspector/consensus-decisions.md) — D14-D20 DB 方案
- [测试计划](./05-test-plan.md) — 基于本文档场景设计的测试策略，各场景的测试验证方案详见该文档
