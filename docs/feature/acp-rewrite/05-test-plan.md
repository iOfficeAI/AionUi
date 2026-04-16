# 测试计划

> **版本**: v1.2 | **最后更新**: 2026-04-16 | **状态**: Draft
> **摘要**: ACP 重构项目 4 层测试方案，覆盖 T1-T4 全部测试层级，映射 23 条不变量
> **受众**: ACP 重构实现开发者、新加入团队的开发者

---

## 目录

- [1. 测试策略总览](#1-测试策略总览)
- [2. T1 纯逻辑单测](#2-t1-纯逻辑单测)
- [3. T2 契约测试](#3-t2-契约测试)
- [4. T3 编排集成测试](#4-t3-编排集成测试)
- [5. T4 Runtime 集成测试](#5-t4-runtime-集成测试)
- [6. 覆盖率目标](#6-覆盖率目标)
- [7. 回归测试策略](#7-回归测试策略)
- [8. 持续集成方案](#8-持续集成方案)
- [9. 已知风险和测试盲区](#9-已知风险和测试盲区)
- [参考文档](#参考文档)

---

## 1. 测试策略总览

### 1.1 4 层测试模型

基于 D13 共识决议，测试按**失效边界**组织为 4 层。每层关注不同粒度的正确性。

```
┌────────────────────────────────────────────────────────────────────┐
│ T4 Runtime 集成测试                                                │
│ AcpRuntime + Fake Session + Fake DB                                │
│ 验证: 持久化时机, IPC 路由, 空闲回收, lazy rebuild                 │
│ 不变量: INV-A-01, INV-A-02                                         │
├────────────────────────────────────────────────────────────────────┤
│ T3 编排集成测试                                                    │
│ AcpSession + Fake AcpClient                                        │
│ 验证: 状态机转换, drain loop, crash recovery, 权限流程, 认证流程   │
│ 不变量: INV-S-01~S-10, INV-S-15, INV-X-02~X-04                     │
├────────────────────────────────────────────────────────────────────┤
│ T2 契约测试                                                        │
│ 真实实现 vs 接口契约                                               │
│ 验证: AcpClient 实现满足接口契约, FakeAcpClient 与真实行为一致     │
│ 不变量: INV-I-01, INV-I-02, INV-X-01                               │
├────────────────────────────────────────────────────────────────────┤
│ T1 纯逻辑单测                                                      │
│ 独立组件, 无 mock, 表驱动                                          │
│ 验证: 组件级纯逻辑正确性                                           │
│ 不变量: INV-S-11~S-14                                              │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 层级特征对比

| 维度             | T1 纯逻辑  | T2 契约          | T3 编排集成     | T4 Runtime             |
| ---------------- | ---------- | ---------------- | --------------- | ---------------------- |
| **范围**         | 单组件     | 接口实现         | AcpSession 整体 | AcpRuntime 整体        |
| **Mock 边界**    | 无 mock    | 真实实现 vs 规格 | Fake AcpClient  | Fake Session + Fake DB |
| **运行速度**     | < 1ms/case | 10-50ms/case     | 50-200ms/case   | 50-200ms/case          |
| **预估 case 数** | 80-120     | 10-15            | 20-30           | 10-15                  |
| **测试工具**     | Vitest     | Vitest           | Vitest          | Vitest                 |
| **CI 频率**      | 每次 push  | 每次 push        | 每次 push       | 每次 push              |

### 1.3 不变量到测试层级的映射

> 各不变量的形式化定义、违反后果和验证方式详见 [类型目录与不变量](04-type-catalog.md) Part 2。

| 不变量   | 简述                       | 测试层级    | 对应测试文件                                             |
| -------- | -------------------------- | ----------- | -------------------------------------------------------- |
| INV-I-01 | 进程不残留                 | T2          | `ProcessAcpClient.spec.ts`, `WebSocketAcpClient.spec.ts` |
| INV-I-02 | 三阶段关闭                 | T2          | `ProcessAcpClient.spec.ts`                               |
| INV-S-01 | 单 prompt 执行             | T3          | `AcpSession.spec.ts`                                     |
| INV-S-02 | 单队列不变                 | T3          | `AcpSession.spec.ts`                                     |
| INV-S-03 | 状态收敛                   | T3          | `AcpSession.spec.ts`                                     |
| INV-S-04 | Timer 与 prompt 一致       | T3          | `AcpSession.spec.ts`                                     |
| INV-S-05 | 有队列不挂起               | T3          | `AcpSession.spec.ts`                                     |
| INV-S-06 | Crash 后队列暂停           | T3          | `AcpSession.spec.ts`                                     |
| INV-S-07 | Error 清空队列             | T3          | `AcpSession.spec.ts`                                     |
| INV-S-08 | Resume 有限重试            | T3          | `AcpSession.spec.ts`                                     |
| INV-S-09 | 回调状态合法               | T3          | `AcpSession.spec.ts`                                     |
| INV-S-10 | 权限不泄漏                 | T3          | `AcpSession.spec.ts`                                     |
| INV-S-11 | Model/Mode 一致            | T1 + T3     | `ConfigTracker.spec.ts`, `AcpSession.spec.ts`            |
| INV-S-12 | MessageTranslator 内存有界 | T1          | `MessageTranslator.spec.ts`                              |
| INV-S-13 | ApprovalCache 内存有界     | T1          | `ApprovalCache.spec.ts` (从 PermissionResolver 导入)     |
| INV-S-14 | PromptQueue 有界           | ~~已移除~~  | ~~`PromptQueue.spec.ts`~~ (PromptQueue 已删除)           |
| INV-S-15 | 认证信号必达               | T3          | `AcpSession.spec.ts`                                     |
| INV-A-01 | 持久化一致                 | T4          | `AcpRuntime.spec.ts`                                     |
| INV-A-02 | 空闲回收安全               | T4          | `IdleReclaimer.spec.ts`                                  |
| INV-X-01 | 类型边界                   | T2 + 编译期 | `SessionCallbacks.contract.spec.ts`                      |
| INV-X-02 | 队列快照完整               | T3          | `AcpSession.spec.ts`                                     |
| INV-X-03 | 背压架构预留               | T3          | `AcpSession.spec.ts`                                     |
| INV-X-04 | Pending 不泄漏             | T3          | `AcpSession.spec.ts`                                     |

---

## 2. T1 纯逻辑单测

### 2.1 范围与原则

T1 测试覆盖 AcpSession 的 8 个组合组件 + errors 模块。这些组件的共同特征：**纯逻辑、无 IO、无 mock**。测试风格为表驱动 (table-driven)，每组输入对应一个明确的输出。

### 2.2 PromptQueue

**测试文件**: `PromptQueue.spec.ts`
**不变量**: INV-S-14 (队列有界)

| #   | 测试用例        | 输入                                               | 期望输出                                                                           |
| --- | --------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | 入队成功        | `enqueue({ id: '1', text: 'hello' })` 到空队列     | 返回 `true`，`length === 1`                                                        |
| 2   | 入队满拒绝      | 队列已有 5 条 (maxSize=5)，`enqueue(item)`         | 返回 `false`，`length === 5`，不丢弃旧消息                                         |
| 3   | FIFO 出队       | 入队 A → B → C，连续 `dequeue()` 3 次              | 依次返回 A, B, C                                                                   |
| 4   | 空队列出队      | 空队列调用 `dequeue()`                             | 返回 `null`                                                                        |
| 5   | clear 返回全部  | 队列有 3 条，调用 `clear()`                        | 返回包含 3 条的数组，`length === 0`                                                |
| 6   | snapshot 浅拷贝 | 入队 2 条，获取 snapshot                           | `snapshot.items.length === 2`，`snapshot.length === 2`，修改 snapshot 不影响原队列 |
| 7   | isEmpty/isFull  | 空队列: `isEmpty=true, isFull=false`；满队列: 反之 | 布尔值正确                                                                         |
| 8   | 自定义 maxSize  | `new PromptQueue(3)`，入队 4 条                    | 第 4 条返回 `false`                                                                |

### 2.3 ApprovalCache

**测试文件**: `ApprovalCache.spec.ts` (从 `PermissionResolver.ts` 导入 `ApprovalCache` class)
**不变量**: INV-S-13 (内存有界, LRU 500)

> 注: ApprovalCache 已合并到 PermissionResolver.ts 同文件，作为 named export 保留，测试独立性不变。

| #   | 测试用例          | 输入                                            | 期望输出                                |
| --- | ----------------- | ----------------------------------------------- | --------------------------------------- |
| 1   | 存入和查找        | `store(request, response)` 后 `lookup(request)` | 返回存入的 response                     |
| 2   | 未缓存返回 null   | `lookup(unknownRequest)`                        | 返回 `null`                             |
| 3   | LRU 淘汰          | maxSize=3，依次存入 A, B, C, D                  | lookup(A) 返回 null，lookup(B/C/D) 正常 |
| 4   | LRU 访问刷新      | 存入 A, B, C，lookup(A)，存入 D                 | A 被刷新不被淘汰，B 被淘汰              |
| 5   | 容量上限 500      | 存入 501 条                                     | cache.size === 500，最旧的被淘汰        |
| 6   | 相同 request 覆盖 | 两次 store 同一 request 不同 response           | lookup 返回后一次的 response            |

### 2.4 ConfigTracker

**测试文件**: `ConfigTracker.spec.ts`
**不变量**: INV-S-11 (Model/Mode 一致)

| #   | 测试用例                             | 输入                                                  | 期望输出                                             |
| --- | ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| 1   | syncFromSessionResult                | result 含 models, currentModel, modes                 | 各字段正确填充                                       |
| 2   | setDesiredModel                      | `setDesiredModel('opus')`                             | desiredModelId = 'opus'，snapshot 中 desired 可见    |
| 3   | setCurrentModel 清除 desired         | `setDesiredModel('opus')` → `setCurrentModel('opus')` | desiredModelId = null (INV-S-11)                     |
| 4   | getPendingChanges — 有变更           | desired='opus', current='sonnet'                      | 返回 `{ model: 'opus' }`                             |
| 5   | getPendingChanges — 无变更           | desired=null 或 desired===current                     | 返回 `{}`                                            |
| 6   | getPendingChanges — desired==current | `setDesiredModel('sonnet')`, current='sonnet'         | 返回 `{}` (不重复 set)                               |
| 7   | applyConfigOptionUpdate              | 更新已有 configOption 的 value                        | snapshot 中该 option 已更新                          |
| 8   | applyModeUpdate                      | `applyModeUpdate({ modeId: 'code' })`                 | currentModeId = 'code', desiredModeId = null         |
| 9   | mode 同理                            | setDesiredMode → setCurrentMode                       | desiredModeId = null (INV-S-11)                      |
| 10  | modelSnapshot 格式                   | 调用 `modelSnapshot()`                                | 包含 currentModelId, desiredModelId, availableModels |

### 2.5 PromptTimer

**测试文件**: `PromptTimer.spec.ts`

| #   | 测试用例            | 输入                                                                   | 期望输出                            |
| --- | ------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| 1   | 超时触发回调        | `start(50)` 后等待 60ms                                                | onTimeout 被调用，state = `idle`    |
| 2   | stop 取消           | `start(100)` → `stop()` 后等待 150ms                                   | onTimeout 未被调用                  |
| 3   | reset 重置          | `start(100)` → 等 80ms → `reset()` → 等 80ms                           | onTimeout 未触发 (还剩 100ms)       |
| 4   | pause/resume        | `start(200)` → 等 100ms → `pause()` → 等 500ms → `resume()` → 等 150ms | onTimeout 在 resume 后约 100ms 触发 |
| 5   | pause 时 state      | `start(100)` → `pause()`                                               | state = `paused`                    |
| 6   | idle 时 reset no-op | 不 start，直接 `reset()`                                               | 无异常，state 仍为 `idle`           |
| 7   | 连续 start 覆盖     | `start(100)` → `start(200)`                                            | 只有后一个计时器有效                |

### 2.6 PermissionResolver

**测试文件**: `PermissionResolver.spec.ts`

| #   | 测试用例                  | 输入                                   | 期望输出                             |
| --- | ------------------------- | -------------------------------------- | ------------------------------------ |
| 1   | YOLO 自动批准             | autoApproveAll=true, evaluate(request) | 立即返回 allow 选项                  |
| 2   | 缓存命中                  | cache 中有匹配条目                     | 不调用 uiCallback，直接返回          |
| 3   | UI 委托                   | cache 未命中, autoApprove=false        | uiCallback 被调用，Promise 挂起      |
| 4   | resolve 解决 pending      | evaluate 后 resolve(callId, optionId)  | Promise resolve 为 { optionId }      |
| 5   | resolve always 类型写缓存 | 选项 kind 含 'always'，传入 request    | approvalCache.store 被调用           |
| 6   | cancelAll reject          | evaluate 后 cancelAll()                | Promise reject(AcpError)             |
| 7   | cancelAll 清空            | 3 个 pending，cancelAll()              | hasPending = false，pendingCount = 0 |
| 8   | resolve 不存在的 callId   | resolve('nonexistent', optionId)       | 无异常，no-op                        |

### 2.7 MessageTranslator

**测试文件**: `MessageTranslator.spec.ts`
**不变量**: INV-S-12 (内存有界)

| #   | 测试用例                      | 输入                                                      | 期望输出                                         |
| --- | ----------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| 1   | translate agent_message_chunk | notification.update.sessionUpdate = 'agent_message_chunk' | 返回 TMessage[]                                  |
| 2   | translate tool_call           | notification.update.sessionUpdate = 'tool_call'           | 返回 TMessage[]                                  |
| 3   | translate 未知类型            | 未知的 sessionUpdate 类型                                 | 返回空数组                                       |
| 4   | onTurnEnd 清理                | 模拟多个 turn 的 translate 后调用 onTurnEnd               | messageMap 只保留活跃 turn 的条目                |
| 5   | reset 全量清理                | 调用 reset()                                              | messageMap.size === 0，activeTurnKeys.size === 0 |
| 6   | 长对话内存稳定                | 100 个 turn，每次 onTurnEnd                               | messageMap.size 不持续增长                       |

### 2.8 InputPreprocessor

**测试文件**: `InputPreprocessor.spec.ts`

| #   | 测试用例      | 输入                                  | 期望输出                                   |
| --- | ------------- | ------------------------------------- | ------------------------------------------ |
| 1   | 无 @file 透传 | `process("hello", undefined)`         | PromptContent 中 text = "hello"，无附件    |
| 2   | @file 解析    | `process("看看 @file:main.ts")`       | text 中 @file 被替换，附件列表包含文件内容 |
| 3   | 外部文件附加  | `process("test", ["a.txt", "b.txt"])` | 附件列表含 2 个文件                        |
| 4   | 不存在的文件  | `process("@file:nonexistent.ts")`     | 优雅处理，不抛异常                         |

### 2.9 McpConfig

**测试文件**: `McpConfig.spec.ts`

| #   | 测试用例              | 输入                                 | 期望输出    |
| --- | --------------------- | ------------------------------------ | ----------- |
| 1   | 合并 mcpServers       | config.mcpServers = [A, B]           | 返回 [A, B] |
| 2   | 合并 presetMcpServers | mcpServers=[A], presetMcpServers=[B] | 返回 [A, B] |
| 3   | 包含 teamMcpConfig    | mcpServers=[A], teamMcpConfig=C      | 返回 [A, C] |
| 4   | 全部为空              | 所有字段为空/undefined               | 返回 []     |

### 2.10 Error 模块

**测试文件**: `errors/*.spec.ts`

| #   | 测试用例                       | 输入                                       | 期望输出                      |
| --- | ------------------------------ | ------------------------------------------ | ----------------------------- |
| 1   | AcpError 构造                  | `new AcpError('CONNECTION_FAILED', 'msg')` | code, message, retryable 正确 |
| 2   | normalizeError — AcpError 透传 | 传入 AcpError                              | 原样返回                      |
| 3   | normalizeError — JSON-RPC 错误 | 传入含 error.code 的对象                   | 提取并映射为 AcpError         |
| 4   | normalizeError — 未知错误      | 传入 `new Error('boom')`                   | 包装为 `PROTOCOL_ERROR`       |
| 5   | retryable 判断                 | CONNECTION_FAILED, SESSION_EXPIRED         | retryable = true              |
| 6   | 不可重试判断                   | AUTH_FAILED, INVALID_STATE                 | retryable = false             |

### 2.11 AuthNegotiator

**测试文件**: `AuthNegotiator.spec.ts`

| #   | 测试用例                           | 输入                                               | 期望输出                                                           |
| --- | ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | buildAuthRequiredData 透传方法列表 | SDK `AuthMethod[]` 输入                            | 返回 `AuthRequiredData`，`methods` 字段直接透传 SDK `AuthMethod[]` |
| 2   | buildAuthRequiredData 空列表       | `buildAuthRequiredData([])`                        | 返回 `{ agentBackend, methods: [] }`                               |
| 3   | buildAuthRequiredData undefined    | `buildAuthRequiredData(undefined)`                 | 返回 `{ agentBackend, methods: [] }`                               |
| 4   | selectAuthMethod 匹配 env_var      | credentials 包含所有 vars 的 env_var 方法          | 返回该方法                                                         |
| 5   | selectAuthMethod 不匹配            | credentials 缺少必要 vars                          | 返回 null，跳过认证                                                |
| 6   | selectAuthMethod 跳过非 env_var    | 只有 terminal 类型方法                             | 返回 null（当前只匹配 env_var）                                    |
| 7   | 空 authMethods 不触发认证          | `authenticate(protocol, [])`                       | 不调用 protocol.authenticate()（跳过认证）                         |
| 8   | mergeCredentials 合并逻辑          | 初始 `{ A: '1' }` → `mergeCredentials({ B: '2' })` | 合并后 credentials = `{ A: '1', B: '2' }`                          |
| 9   | mergeCredentials 覆盖              | 初始 `{ A: '1' }` → `mergeCredentials({ A: '2' })` | credentials = `{ A: '2' }` (后者覆盖)                              |
| 10  | authenticate 成功                  | protocol.authenticate(methodId) 成功               | 无异常返回                                                         |
| 11  | authenticate 失败抛 AUTH_REQUIRED  | protocol.authenticate(methodId) 抛异常             | 抛出 `AcpError { code: 'AUTH_REQUIRED', retryable: true }`         |

---

## 3. T2 契约测试

### 3.1 范围与原则

T2 验证**接口实现是否满足接口契约**。在 ACP 架构中有两类契约需要验证：

1. **AcpClient 契约**: ProcessAcpClient 和 WebSocketAcpClient 是否满足 AcpClient 接口的行为规格
2. **FakeAcpClient 契约**: T3 中使用的 FakeAcpClient 是否与真实实现行为一致
3. **类型边界契约**: SessionCallbacks 参数是否不含 SDK 类型 (INV-X-01)

### 3.2 ProcessAcpClient 契约

**测试文件**: `ProcessAcpClient.spec.ts`
**Mock 边界**: 使用真实的 `spawn` 启动一个简单的 echo 进程（Node.js 脚本），验证真实的 stdio 通信。

| #   | 测试用例                           | 方法                                             | 验证要点                                               |
| --- | ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| 1   | start 成功                         | `start()`                                        | 返回 InitializeResponse                                |
| 2   | start 后 lifecycleSnapshot.running | `start()` → `lifecycleSnapshot`                  | `running === true`                                     |
| 3   | close 后 lifecycleSnapshot.running | `start()` → `close()` → `lifecycleSnapshot`      | `running === false` **(INV-I-01)**                     |
| 4   | 三阶段关闭顺序                     | `start()` → 启动不响应 stdin 的进程 → `close()`  | 验证 stdin.end → SIGTERM → SIGKILL 顺序 **(INV-I-02)** |
| 5   | spawn 失败                         | 配置不存在的 command                             | 抛出 `AgentSpawnError`                                 |
| 6   | start 时进程提前退出               | 进程在 init 前 crash                             | 抛出 `AgentStartupError`，包含 stderr                  |
| 7   | lifecycleSnapshot 含退出信息       | 进程退出后读取 `lifecycleSnapshot`               | `lastExit` 含 exitCode + stderr                        |
| 8   | 4-signal 生命周期检测              | 验证 exit/close/pipe_close 事件触发 onDisconnect | onDisconnect handler 被调用，含 DisconnectInfo         |
| 9   | unref 确保不阻塞退出               | close 后检查 child.unref 被调用                  | 主进程不被子进程阻塞                                   |

**辅助测试进程**: 需要创建一组测试用的 Node.js 脚本：

- `test-echo-agent.js`: 读 stdin，回显到 stdout (NDJSON 格式)
- `test-hang-agent.js`: 不响应 stdin.end 和 SIGTERM，只响应 SIGKILL
- `test-crash-agent.js`: 启动后延迟 crash

### 3.3 WebSocketAcpClient 契约

**测试文件**: `WebSocketAcpClient.spec.ts`
**Mock 边界**: 使用 `ws` 库在本地启动 WebSocket 服务器，验证真实的 WebSocket 通信。

| #   | 测试用例                           | 方法                                        | 验证要点                                  |
| --- | ---------------------------------- | ------------------------------------------- | ----------------------------------------- |
| 1   | start 成功                         | `start()`                                   | 返回 InitializeResponse                   |
| 2   | start 后 lifecycleSnapshot.running | `start()` → `lifecycleSnapshot`             | `running === true`                        |
| 3   | close 后 lifecycleSnapshot.running | `start()` → `close()` → `lifecycleSnapshot` | `running === false` **(INV-I-01)**        |
| 4   | 连接失败                           | 配置不可达的 URL                            | 抛出 `AgentSpawnError`                    |
| 5   | 服务端关闭                         | 连接后服务端主动关闭                        | onDisconnect 触发，`running` 变为 `false` |
| 6   | prompt 可通信                      | 通过 `prompt()` 发送/接收消息               | 正确传输 JSON-RPC 消息                    |

### 3.4 SessionCallbacks 类型边界

**测试文件**: `SessionCallbacks.contract.spec.ts`
**不变量**: INV-X-01

| #   | 测试用例                                    | 验证方式            | 验证要点                                     |
| --- | ------------------------------------------- | ------------------- | -------------------------------------------- |
| 1   | callback 参数无 SDK 类型                    | TypeScript 编译检查 | `session/types.ts` 不从 SDK 重新导出原始类型 |
| 2   | onMessage 参数是 TMessage                   | 类型断言            | 不含 SessionNotification 等 SDK 类型         |
| 3   | onPermissionRequest 参数是 PermissionUIData | 类型断言            | 不含 RequestPermissionRequest 等 SDK 类型    |

> 注: 此项也可通过 TSConfig 的 `paths` + `no-restricted-imports` lint 规则在编译期保障。

### 3.5 FakeAcpClient 契约 (T3 支持)

**测试文件**: `FakeAcpClient.contract.spec.ts`

| #   | 测试用例                   | 验证要点                                                |
| --- | -------------------------- | ------------------------------------------------------- |
| 1   | start 返回格式             | 与真实 SDK InitializeResponse 结构一致                  |
| 2   | prompt 返回 PromptResponse | stopReason 字段存在且有效                               |
| 3   | onDisconnect 回调行为      | simulateDisconnect 时 handler 被调用，含 DisconnectInfo |
| 4   | lifecycleSnapshot 行为     | start 后 running=true, close 后 running=false           |
| 5   | onSessionUpdate 回调格式   | notification.update 结构与 SDK 一致                     |

---

## 4. T3 编排集成测试

### 4.1 范围与原则

T3 是 ACP 重构测试的核心层。测试 AcpSession 作为 aggregate root 的完整编排逻辑：

- **状态机转换**: 验证 7 态之间的合法/非法转换
- **drain loop**: 串行执行、FIFO 顺序
- **crash recovery**: 自动 resume + 队列暂停
- **权限流程**: 与 PermissionResolver 的协作
- **认证流程**: 条件认证、AUTH_REQUIRED 信号、retryAuth 重启

**Mock 边界**:

- `AcpClient`: 使用 FakeAcpClient（可控的 start/close/prompt 成功/失败/超时，可触发 sessionUpdate/permissionRequest/disconnect）
- `SessionCallbacks`: 使用 spy 记录所有回调调用

### 4.2 测试基础设施

```typescript
// FakeAcpClient — 可控的 AcpClient 实现（替代原 FakeConnector + FakeProtocol）
class FakeAcpClient implements AcpClient {
  private _running = false;
  private _disconnectHandler: ((info: DisconnectInfo) => void) | null = null;
  private _lifecycleSnapshot: AgentLifecycleSnapshot = {
    pid: null,
    running: false,
    lastExit: null,
  };

  // 可配置: start 成功/失败
  startResult: InitializeResponse | Error = { protocolVersion: '1' };

  // 可配置: prompt 成功/失败/超时
  promptResult: PromptResponse | Error | 'timeout' = { stopReason: 'end_turn' };

  async start(): Promise<InitializeResponse> {
    if (this.startResult instanceof Error) throw this.startResult;
    this._running = true;
    this._lifecycleSnapshot = { pid: 12345, running: true, lastExit: null };
    return this.startResult;
  }

  async createSession(p: any): Promise<any> { return { sessionId: 'sid-1' }; }
  async loadSession(p: any): Promise<any> { return { sessionId: p.sessionId }; }
  async prompt(sid: string, content: any): Promise<any> {
    if (this.promptResult instanceof Error) throw this.promptResult;
    return this.promptResult;
  }
  async cancel(): Promise<void> {}
  async setModel(): Promise<void> {}
  async setMode(): Promise<void> {}
  async setConfigOption(): Promise<void> {}
  async closeSession(): Promise<void> {}
  async extMethod(): Promise<unknown> { return {}; }

  get lifecycleSnapshot(): AgentLifecycleSnapshot { return this._lifecycleSnapshot; }

  onDisconnect(handler: (info: DisconnectInfo) => void): void {
    this._disconnectHandler = handler;
  }

  async close(): Promise<void> {
    this._running = false;
    this._lifecycleSnapshot = { ...this._lifecycleSnapshot, running: false };
  }

  // 测试辅助: 模拟断连
  simulateDisconnect(info?: Partial<DisconnectInfo>): void {
    this._running = false;
    const disconnectInfo: DisconnectInfo = {
      reason: 'process_exit',
      exitCode: 1,
      signal: null,
      stderr: '',
      ...info,
    };
    this._lifecycleSnapshot = {
      ...this._lifecycleSnapshot,
      running: false,
      lastExit: { ...disconnectInfo, unexpectedDuringPrompt: true },
    };
    this._disconnectHandler?.(disconnectInfo);
  }

  // 测试辅助: 推送 sessionUpdate (通过内部 handler)
  pushUpdate(update: any): void { /* 触发注册的 session update handler */ }
}

// CallbackSpy — 记录所有回调
function createCallbackSpy(): SessionCallbacks & { calls: Record<string, any[]> } { ... }
```

### 4.3 状态机测试

| #   | 测试用例        | 初始状态        | 操作                                                                              | 期望状态                      | 不变量   |
| --- | --------------- | --------------- | --------------------------------------------------------------------------------- | ----------------------------- | -------- |
| 1   | start 正常流程  | idle            | `start()`                                                                         | starting → active             | INV-S-09 |
| 2   | start 失败重试  | idle            | `start()` + connect 失败 x2 + 成功                                                | starting → starting → active  | INV-S-09 |
| 3   | start 全部失败  | idle            | `start()` + connect 失败 x4 (maxStartRetries=3, 共 4 次尝试: 1 次初始 + 3 次重试) | starting → error              | INV-S-03 |
| 4   | prompt 正常完成 | active          | `sendMessage()`                                                                   | active → prompting → active   | INV-S-09 |
| 5   | suspend 正常    | active (队列空) | `suspend()`                                                                       | active → suspended            | INV-S-05 |
| 6   | resume 正常     | suspended       | `sendMessage()`                                                                   | suspended → resuming → active | INV-S-09 |
| 7   | resume 失败超限 | suspended       | `sendMessage()` + resume 失败 x3                                                  | resuming → error              | INV-S-08 |
| 8   | 错误态手动重试  | error           | `start()`                                                                         | error → starting → active     | INV-S-09 |
| 9   | stop 从任意状态 | prompting       | `stop()`                                                                          | prompting → idle              | INV-S-09 |
| 10  | 非法转换被拒绝  | idle            | `sendMessage()`                                                                   | 抛 INVALID_STATE              | INV-S-09 |

### 4.4 drain loop + 队列测试

| #   | 测试用例               | 操作                                 | 期望结果                           | 不变量   |
| --- | ---------------------- | ------------------------------------ | ---------------------------------- | -------- |
| 1   | 单消息执行             | active 下 sendMessage x1             | prompt 被执行，状态回到 active     | INV-S-01 |
| 2   | 多消息 FIFO            | prompting 下 sendMessage x3          | 3 条按入队顺序执行                 | INV-S-02 |
| 3   | 串行不并发             | sendMessage x3, 验证执行时间线       | 第 2 条在第 1 条完成后才开始       | INV-S-01 |
| 4   | 队列满拒绝             | sendMessage x6 (maxSize=5)           | 第 6 条抛 QUEUE_FULL               | INV-S-14 |
| 5   | 每次 dequeue 推快照    | sendMessage x2, 监控 onQueueUpdate   | 每次入队/出队都推送完整 snapshot   | INV-X-02 |
| 6   | cancelAll 清空         | prompting 下有 3 条排队, cancelAll() | 队列清空, cancel 当前 prompt       | —        |
| 7   | queuePaused 阻止 drain | queuePaused=true, resume 完成        | 不自动 drain，发 queue_paused 信号 | INV-S-06 |
| 8   | resumeQueue 恢复       | queuePaused=true → resumeQueue()     | drain 开始，队列被处理             | INV-S-06 |

### 4.5 crash recovery 测试

| #   | 测试用例                  | 操作                               | 期望结果                               | 不变量             |
| --- | ------------------------- | ---------------------------------- | -------------------------------------- | ------------------ |
| 1   | prompt 期间 crash         | prompting 下 simulateDisconnect    | queuePaused=true, 自动 resume          | INV-S-06           |
| 2   | 非 prompt 期间 crash      | active 下 simulateDisconnect       | setStatus('suspended')，不 resume      | —                  |
| 3   | crash 后 pending 清空     | prompting 下有 pending 权限, crash | permissionResolver.hasPending = false  | INV-S-10, INV-X-04 |
| 4   | crash 后 timer 停止       | prompting 下 timer running, crash  | timer.state = idle                     | INV-S-04           |
| 5   | resume 成功后不自动 drain | crash → resume 成功                | queuePaused=true, 发 queue_paused      | INV-S-06           |
| 6   | resume 失败降级           | crash → resume → loadSession 失败  | 降级 createSession, 发 session_expired | INV-S-03           |
| 7   | resume 重试超限           | crash → resume 连续失败 3 次       | status = error, 队列清空               | INV-S-08, INV-S-07 |

### 4.6 权限流程测试

| #   | 测试用例                | 操作                               | 期望结果                              | 不变量   |
| --- | ----------------------- | ---------------------------------- | ------------------------------------- | -------- |
| 1   | 权限等待暂停 timer      | prompting 下收到 permissionRequest | timer.state = paused                  | INV-S-04 |
| 2   | 权限 resolve 恢复 timer | confirmPermission()                | timer.state = running                 | INV-S-04 |
| 3   | prompt 结束后无 pending | prompt 完成（含权限请求）          | permissionResolver.hasPending = false | INV-S-10 |
| 4   | disconnect 期间取消权限 | 有 pending 权限时 disconnect       | 所有 pending reject                   | INV-X-04 |

### 4.7 背压架构预留测试

| #   | 测试用例                   | 操作                         | 期望结果                                | 不变量   |
| --- | -------------------------- | ---------------------------- | --------------------------------------- | -------- |
| 1   | onMessage 抛异常不影响后续 | 让 onMessage callback 抛异常 | handleSessionUpdate 继续处理后续 update | INV-X-03 |

### 4.8 认证流程测试

| #   | 测试用例                       | 操作                                       | 期望结果                                                                          | 不变量             |
| --- | ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------- | ------------------ |
| 1   | 条件认证: authMethods 为空跳过 | start() + initResult.authMethods = []      | 不调用 authenticate()，直接进入 createSession                                     | —                  |
| 2   | AUTH_REQUIRED 信号             | start() + authenticate 失败                | 发 `onSignal({ type: 'auth_required', auth })` 而非进入 error，停留在 starting    | INV-S-15           |
| 3   | AUTH_REQUIRED 释放资源         | start() + authenticate 失败                | `client === null`                                                                 | INV-S-15           |
| 4   | retryAuth 完整重启             | 认证失败后调用 retryAuth()                 | teardown + setStatus('idle') + start() 完整重新走 connect→init→auth→createSession | INV-S-15           |
| 5   | retryAuth 后仍失败             | retryAuth() 后 authenticate 再次失败       | 再次发 `auth_required` 信号，可无限重试                                           | INV-S-15           |
| 6   | retryAuth 带凭据               | retryAuth({ ANTHROPIC_API_KEY: 'sk-...' }) | mergeCredentials 被调用，重启后使用新凭据                                         | —                  |
| 7   | stop() 在 auth 等待期间        | 认证失败停留在 starting 时调用 stop()      | 正常关闭，status → idle                                                           | INV-S-03, INV-S-15 |
| 8   | resuming 状态下认证失败        | resume() → authenticate 失败               | 发 auth_required 信号，停留在 resuming，不进入 error                              | INV-S-15           |

### 4.9 Property-based 测试 (推荐)

使用 fast-check 库对 AcpSession 状态机进行 property-based 测试。

```typescript
// 伪代码: 随机命令序列后验证不变量
fc.assert(
  fc.property(
    fc.array(
      fc.oneof(
        fc.constant('sendMessage'),
        fc.constant('cancelPrompt'),
        fc.constant('cancelAll'),
        fc.constant('suspend'),
        fc.constant('simulateCrash'),
        fc.constant('setModel')
      )
    ),
    (commands) => {
      const { session, spy } = setup();
      for (const cmd of commands) applyCommand(session, cmd);

      // 不变量检查
      if (session.status === 'prompting') {
        assert(spy.statusTransitions.every(isValidTransition)); // INV-S-09
      }
      if (session.status !== 'prompting') {
        assert(!session.permissionResolver.hasPending); // INV-S-10
      }
      // ... 其他不变量
    }
  )
);
```

---

## 5. T4 Runtime 集成测试

### 5.1 范围与原则

T4 验证 AcpRuntime 作为应用层入口的正确性：

- **持久化时机**: 状态变更是否正确写入 DB
- **IPC 路由**: 方法调用是否正确转发到对应 session
- **空闲回收**: IdleReclaimer 是否按条件回收
- **Lazy rebuild**: 应用重启后是否正确从 DB 重建

**Mock 边界**:

- `SessionFactory`: 注入返回 FakeSession 的工厂函数
- `IConversationRepository`: 内存实现 (FakeConversationRepo)
- `IAcpSessionStateRepository`: 内存实现 (FakeAcpSessionRepo)
- `StreamingMessageBuffer`: spy 记录 append 调用

### 5.2 持久化测试

**测试文件**: `AcpRuntime.spec.ts`
**不变量**: INV-A-01

| #   | 测试用例                                  | 操作                                        | 验证要点                                                                    |
| --- | ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | 创建会话写双表                            | `createConversation(config)`                | conversations + acp_session 同时写入                                        |
| 2   | onStatusChange(suspended) 写 suspended_at | 触发 session 的 onStatusChange('suspended') | `acp_session.suspended_at !== null` **(INV-A-01)**                          |
| 3   | onStatusChange(active) 清 suspended_at    | 触发 onStatusChange('active')               | `acp_session.suspended_at === null` **(INV-A-01)**                          |
| 4   | 瞬态不写 acp_session                      | 触发 onStatusChange('starting')             | `acp_session.session_status` 保持上一值                                     |
| 5   | 瞬态写 conversations                      | 触发 onStatusChange('starting')             | `conversations.status = 'running'`                                          |
| 6   | onSessionId 写 session_id                 | 触发 onSessionId('sid-1')                   | `acp_session.session_id = 'sid-1'`                                          |
| 7   | onConfigUpdate 写 session_config          | 触发 onConfigUpdate(config)                 | `acp_session.session_config` 更新                                           |
| 8   | onMessage 写 messageBuffer                | 触发 onMessage(msg)                         | messageBuffer.append 被调用                                                 |
| 9   | error 状态持久化                          | 触发 onStatusChange('error')                | `acp_session.session_status = 'error'`, `conversations.status = 'finished'` |

### 5.3 IPC 路由测试

| #   | 测试用例              | 操作                                   | 验证要点                        |
| --- | --------------------- | -------------------------------------- | ------------------------------- |
| 1   | sendMessage 路由      | `runtime.sendMessage(convId, text)`    | FakeSession.sendMessage 被调用  |
| 2   | cancelPrompt 路由     | `runtime.cancelPrompt(convId)`         | FakeSession.cancelPrompt 被调用 |
| 3   | setModel 路由         | `runtime.setModel(convId, modelId)`    | FakeSession.setModel 被调用     |
| 4   | 不存在的 convId       | `runtime.sendMessage('unknown', text)` | ensureSession 从 DB rebuild     |
| 5   | lastActiveAt 更新     | `runtime.sendMessage(convId, text)`    | entry.lastActiveAt 更新         |
| 6   | shutdown 全部 suspend | `runtime.shutdown()`                   | 所有 session.suspend() 被调用   |

### 5.4 空闲回收测试

**测试文件**: `IdleReclaimer.spec.ts`
**不变量**: INV-A-02

| #   | 测试用例               | 操作                                        | 验证要点                          |
| --- | ---------------------- | ------------------------------------------- | --------------------------------- |
| 1   | 超时 active 被回收     | session.status=active, lastActiveAt 超时    | suspend() 被调用 **(INV-A-02)**   |
| 2   | prompting 不被回收     | session.status=prompting, lastActiveAt 超时 | suspend() 未被调用 **(INV-A-02)** |
| 3   | 未超时不被回收         | session.status=active, lastActiveAt 未超时  | suspend() 未被调用                |
| 4   | suspended 不被重复回收 | session.status=suspended                    | suspend() 未被调用                |
| 5   | start/stop 正常        | `start()` → `stop()`                        | 定时器被清理                      |

### 5.5 Lazy rebuild 测试

| #   | 测试用例             | 操作                                   | 验证要点                                   |
| --- | -------------------- | -------------------------------------- | ------------------------------------------ |
| 1   | 首次操作触发 rebuild | sessions Map 为空，sendMessage(convId) | 从 DB 读取 config，创建新 session，start() |
| 2   | DB 无记录报错        | sendMessage('nonexistent')             | 抛出 Error                                 |
| 3   | rebuild 后缓存       | 连续两次 sendMessage 同一 convId       | 只 rebuild 一次                            |

---

## 6. 覆盖率目标

### 6.1 总体目标

| 指标                      | 目标值 | 说明                     |
| ------------------------- | ------ | ------------------------ |
| **行覆盖率 (Line)**       | >= 85% | 整个 `process/acp/` 目录 |
| **分支覆盖率 (Branch)**   | >= 80% | 重点关注状态机分支       |
| **函数覆盖率 (Function)** | >= 90% | 所有公共方法             |

### 6.2 分模块目标

| 模块                            | 行覆盖率目标 | 说明                               |
| ------------------------------- | ------------ | ---------------------------------- |
| `session/AcpSession.ts`         | >= 90%       | 薄编排层，T3 覆盖                  |
| `session/SessionLifecycle.ts`   | >= 90%       | 连接生命周期/重试，T3 覆盖         |
| `session/PromptExecutor.ts`     | >= 90%       | prompt 执行/超时，T3 覆盖          |
| `session/PermissionResolver.ts` | >= 95%       | 纯逻辑，T1 覆盖 (含 ApprovalCache) |
| `session/ConfigTracker.ts`      | >= 95%       | 纯逻辑                             |
| `session/PromptTimer.ts`        | >= 90%       | 时间相关测试有精度限制             |
| `session/MessageTranslator.ts`  | >= 80%       | 翻译逻辑依赖 SDK 类型细节          |
| `session/AuthNegotiator.ts`     | >= 90%       | 纯逻辑，T1 覆盖 + T3 认证流程      |
| `infra/ProcessAcpClient.ts`     | >= 85%       | T2 真实进程测试                    |
| `infra/WebSocketAcpClient.ts`   | >= 85%       | T2 真实 WebSocket 测试             |
| `runtime/AcpRuntime.ts`         | >= 85%       | T4 覆盖                            |
| `runtime/IdleReclaimer.ts`      | >= 90%       | 逻辑简单                           |
| `errors/*`                      | >= 90%       | T1 覆盖                            |

### 6.3 不变量覆盖率

**硬指标: 23 条不变量中 23 条必须有对应测试用例。**

验证方式: 每个测试用例的注释中标注验证的不变量编号（如 `// 验证 INV-S-01: 单 prompt 执行`），CI 中扫描确保 23 个编号全部出现。

---

## 7. 回归测试策略

### 7.1 触发条件

| 变更类型                                  | 运行的测试层级    | 说明                                                                    |
| ----------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `session/` 下纯逻辑组件                   | T1                | PermissionResolver (含 ApprovalCache), ConfigTracker, AuthNegotiator 等 |
| `session/AcpSession.ts`                   | T1 + T3           | 编排 + 组件                                                             |
| `session/SessionLifecycle.ts`             | T3                | 连接生命周期/重试编排                                                   |
| `session/PromptExecutor.ts`               | T3                | prompt 执行编排                                                         |
| `session/AuthNegotiator.ts`               | T1 + T3           | T1 AuthNegotiator 单测 + T3 认证流程编排                                |
| `infra/` 下 AcpClient 实现                | T2                | 契约测试                                                                |
| `infra/ProcessAcpClient.ts`               | T2 + T3           | AcpClient 实现变更影响编排                                              |
| `runtime/` 下任何文件                     | T4                | Runtime 逻辑                                                            |
| `errors/` 下任何文件                      | T1                | 错误处理                                                                |
| `types.ts` 或 `session/types.ts`          | T1 + T2 + T3      | 类型变更影响全部                                                        |
| SDK 版本升级 (`@agentclientprotocol/sdk`) | T2                | 契约测试首先报警                                                        |
| 全部                                      | T1 + T2 + T3 + T4 | PR 合并前完整运行                                                       |

### 7.2 判断标准

- **通过标准**: 所有测试 PASS，覆盖率不低于目标值
- **回归判定**: 任何之前 PASS 的测试变为 FAIL，即为回归
- **不变量回归**: 如果某个 INV-\* 标注的测试 FAIL，优先级提升为 P0

### 7.3 SDK 升级回归流程

```
SDK 版本升级
  ↓
运行 T2 契约测试
  ↓ PASS
运行 T3 编排集成测试 (FakeAcpClient 行为可能需要更新)
  ↓ PASS
运行 T1 + T4
  ↓ 全部 PASS
可以合并
```

如果 T2 FAIL，说明 SDK 行为变更，需要：

1. 更新 FakeAcpClient 以匹配新行为
2. 检查 AcpSession 中是否有依赖旧行为的代码
3. 更新相关测试

---

## 8. 持续集成方案

### 8.1 CI Pipeline

```
┌─────────────────────────────────────────────────────────┐
│ PR Push / Main Push                                     │
│                                                         │
│  Stage 1: Lint + Type Check (并行)                      │
│  ├── eslint                                             │
│  ├── tsc --noEmit                                       │
│  └── INV-X-01 类型边界检查 (no-restricted-imports)       │
│                                                         │
│  Stage 2: Tests (并行)                                  │
│  ├── T1 纯逻辑 (~120 cases, < 5s)                      │
│  ├── T2 契约 (~15 cases, < 10s)                         │
│  ├── T3 编排集成 (~30 cases, < 30s)                     │
│  └── T4 Runtime 集成 (~15 cases, < 15s)                │
│                                                         │
│  Stage 3: Coverage Report                               │
│  ├── vitest --coverage                                  │
│  ├── 检查覆盖率阈值                                      │
│  └── 不变量编号覆盖扫描                                   │
│                                                         │
│  总耗时预估: < 60s                                       │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Vitest 配置

```typescript
// vitest.config.ts (ACP 模块)
export default defineConfig({
  test: {
    include: ['src/process/acp/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/process/acp/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/types.ts'],
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 90,
      },
    },
    // T2 契约测试需要真实 IO，单独超时
    testTimeout: 10000,
  },
});
```

### 8.3 测试命名规范

```
{Component}.spec.ts
  describe('{Component}')
    describe('{method}')
      it('should {expected behavior} [INV-{XX}]')
```

示例：

```typescript
describe('AcpSession', () => {
  describe('sendMessage', () => {
    it('should enqueue and drain when active [INV-S-02]', ...);
    it('should throw QUEUE_FULL when queue is full [INV-S-14]', ...);
    it('should trigger resume when suspended', ...);
  });
});
```

---

## 9. 已知风险和测试盲区

### 9.1 风险

| #   | 风险                                                         | 影响                                     | 缓解措施                                      |
| --- | ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- |
| 1   | **SDK 类型占位** — 当前所有 SDK 类型用 `any` 或 placeholder  | T2 契约测试在 SDK 集成前无法验证真实行为 | SDK 集成后第一时间补全 T2 测试                |
| 2   | **MessageTranslator 大量 TODO** — 翻译逻辑未实现             | T1 测试只能验证空壳                      | 实现填充时同步补全测试用例                    |
| 3   | **Electron IPC 层** — 本测试计划不覆盖 IPC 序列化            | IPC 层的序列化/反序列化错误不会被发现    | 需要额外的 E2E 测试覆盖 (不在本计划范围)      |
| 4   | **时间依赖测试** — PromptTimer 和 IdleReclaimer 依赖真实时间 | Flaky test 风险                          | 使用 `vi.useFakeTimers()` 控制时间            |
| 5   | **背压测试** — Phase 1 不实现 BoundedBuffer                  | 高频消息场景下的内存行为未测试           | Phase 2 补充，Phase 1 只测架构预留 (INV-X-03) |

### 9.2 测试盲区

| #   | 盲区                             | 原因                                     | 影响                                        |
| --- | -------------------------------- | ---------------------------------------- | ------------------------------------------- |
| 1   | **真实 Agent 通信**              | T3 使用 FakeAcpClient，不测真实 JSON-RPC | 协议编解码错误需 T2 和手动测试覆盖          |
| 2   | **多会话并发**                   | T4 中只测基本的 Map 路由                 | 不验证 25+ 会话同时运行时的资源竞争         |
| 3   | **AcpDetector (Agent 发现层)**   | 不在本次重构范围                         | AcpClient 收到的 command/args 假设正确      |
| 4   | **DB 迁移 (v23→v24)**            | 迁移脚本需要独立测试                     | 需要单独的迁移测试                          |
| 5   | **InputPreprocessor @file 解析** | Phase 1 可能不完整实现                   | 文件系统相关的 edge case                    |
| 6   | **长时间运行**                   | 测试无法模拟"开着几天"的场景             | 依赖 onTurnEnd 的增量清理逻辑的 T1 测试覆盖 |

### 9.3 建议的补充测试 (Phase 2)

| 测试类型       | 覆盖内容                               | 时机           |
| -------------- | -------------------------------------- | -------------- |
| E2E 冒烟测试   | Electron IPC → AcpRuntime → 真实 Agent | SDK 集成完成后 |
| 压力测试       | 25+ 并发会话 + 高频消息                | Phase 1 上线后 |
| 内存 profiling | 长时间运行内存泄漏检测                 | Phase 1 上线后 |
| DB 迁移测试    | v23→v24 迁移脚本正确性                 | 迁移脚本编写时 |

---

## 参考文档

- [场景走查](./06-scenario-walkthrough.md) — 本测试计划基于的场景分析
- [完整架构设计](../round-02/arch-a/final-architecture.md) — 组件定义和行为描述
- [23 条不变量](../round-02/arch-b/invariants.md) — 测试需要验证的不变量清单
- [共识决议 D13](../round-01/inspector/consensus-decisions.md) — 测试策略原始决议
- [代码骨架验证](../round-03/inspector/validation-report.md) — 已知问题清单
- [数据库持久化](../round-05/inspector/consensus-decisions.md) — DB 相关测试依据
