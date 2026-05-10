# Team Mode 实现差异深度分析报告

> **日期**: 2026-03-31
> **分析对象**: 当前项目 (`/Users/zhuqingyu/project/teams`) vs Claude Code 参考源码 (`/Users/zhuqingyu/Downloads/extracted`)
> **分析方法**: 3 名开发 Agent 独立分析 + 2 名审查 Agent 交叉互搏验证
> **分析维度**: 架构设计、数据模型、消息传递、Agent 生命周期、权限系统、任务管理、Workspace 隔离

---

## 一、执行摘要

当前项目的 team mode 实现了基础的多 Agent 协作框架（约 1500 行核心代码），但与 Claude Code 的成熟实现相比，存在 **5 个关键差距** 和 **1 个已确认 Bug**。同时当前项目也有自身的架构优势。

### 关键发现

| #   | 发现                                                                  | 严重度   | 类型 |
| --- | --------------------------------------------------------------------- | -------- | ---- |
| 1   | acpAdapter 的 tool_use 解析路径是**死代码**，tools 定义从未注入 agent | Bug      | P0   |
| 2   | Agent 驱动模型差异：外部 wake() vs 内部 while 循环自驱                | 架构差距 | P1   |
| 3   | 权限系统：team 级细粒度控制完全缺失（底层有沙箱）                     | 功能缺失 | P1   |
| 4   | workspaceMode=isolated 是假功能，后端无任何分支处理                   | 功能缺失 | P2   |
| 5   | 消息协议类型仅 3 种（Claude 有 10+ 种），缺少协商式 shutdown          | 功能缺失 | P2   |
| 6   | 任务系统缺少 hooks、TaskOutput、自动 owner 分配                       | 功能缺失 | P2   |

---

## 二、架构对比

### 2.1 总体架构

| 维度     | 当前项目                                   | Claude Code                          |
| -------- | ------------------------------------------ | ------------------------------------ |
| 运行环境 | Electron 多进程 (main + renderer + worker) | CLI 单进程 + tmux/iTerm2/in-process  |
| 调度模型 | **中心化** -- TeamSession 统一调度         | **去中心化** -- 文件协议协作         |
| 通信方式 | IPC Bridge 双向通信                        | 文件系统 mailbox + AsyncLocalStorage |
| UI 层    | React 渲染进程，IPC 推送更新               | React Ink 终端 UI，AppState 驱动     |
| 持久化   | SQLite + Repository Pattern                | 文件系统 JSON                        |

**互搏结论**: 中心化 vs 去中心化是 Electron vs CLI 的合理架构选择，不算缺陷。两者各有优劣：

- 中心化：简单、一致性好，但有单点故障风险（桌面应用可接受）
- 去中心化：容错好、可扩展，但依赖文件锁、一致性更难保证

### 2.2 核心模块对比

```
当前项目 (OOP 分层)              Claude Code (功能模块化)
─────────────────────          ──────────────────────────
TeamSession.ts        ←→      无统一 session 对象
TeammateManager.ts    ←→      inProcessRunner.ts + spawnInProcess.ts
Mailbox.ts            ←→      mailbox.ts (内存) + teammateMailbox.ts (文件)
TaskManager.ts        ←→      tasks.ts + TaskCreateTool + TaskUpdateTool
adapters/             ←→      无（只支持 Claude 模型）
repository/           ←→      teamHelpers.ts (文件 CRUD)
prompts/              ←→      teammatePromptAddendum.ts
                      缺失     backends/ (tmux/iTerm2/in-process)
                      缺失     permissionSync.ts + leaderPermissionBridge.ts
                      缺失     reconnection.ts
```

---

## 三、已确认 Bug：acpAdapter 死代码 (P0)

### 问题描述

acpAdapter 设计了完整的 tool_use 解析能力，但由于上游数据流断裂，**该能力从未生效**。

### 证据链

1. **tools 定义未注入**: `acpAdapter.buildPayload()` 返回了 `tools` 字段，但 `TeammateManager.ts:97` 的 `sendMessage()` 只发送 `payload.message`，完全忽略 `payload.tools`
2. **toolCalls 未传递**: `TeammateManager.handleResponseStream()` (L140-144) 只累积 `text` 字段到 buffer
3. **parseResponse 收到空数据**: `TeammateManager.handleTurnCompleted()` (L156) 构造 `AgentResponse` 时只传 `{ text: accumulatedText }`，**toolCalls 字段永远为 undefined**
4. **走 fallback 路径**: `acpAdapter.parseResponse()` (L128) 检查 `response.toolCalls` 为空，退入 L176-179 的纯文本正则解析

### 影响

- 所有 ACP agent 的响应实际走的是纯文本 fallback，和 xmlFallbackAdapter 无本质区别
- "多 LLM 适配器"在当前状态下是**设计意图而非已实现优势**

### 涉及文件

| 文件                                      | 行号     | 问题                                        |
| ----------------------------------------- | -------- | ------------------------------------------- |
| `src/process/team/TeammateManager.ts`     | L97      | `sendMessage(payload.message)` 丢弃了 tools |
| `src/process/team/TeammateManager.ts`     | L140-144 | stream handler 只累积 text                  |
| `src/process/team/TeammateManager.ts`     | L156     | AgentResponse 不含 toolCalls                |
| `src/process/team/adapters/acpAdapter.ts` | L128     | toolCalls 检查永远为 falsy                  |

---

## 四、Agent 驱动模型差异 (P1)

### 当前项目：外部 wake() 驱动

```
用户消息 → lead wake → lead 响应 → executeAction(send_message) → teammate wake → ...
```

- `TeammateManager.wake(slotId)`: 外部调用触发，读 mailbox → 构建 payload → 发给 agent → 等 turnCompleted
- Agent idle 后**完全停止**，必须等外部再次 wake
- 有 `activeWakes` Set 防重入（单线程安全）

### Claude：内部 while 循环自驱

```
Agent spawn → while(true) { 轮询 mailbox → 处理消息 → 执行任务 → idle 等待 → ... }
```

- `inProcessRunner.ts` L689-868: `waitForNextPromptOrShutdown()` 持续 500ms 轮询
- Idle 状态只是"等待中"，不是"停止"
- 有**消息优先级**: shutdown > lead 消息 > peer 消息 > 可认领任务
- Idle 时**自主认领任务**（L854-861）

### 影响分析

| 能力                 | 当前项目                | Claude         |
| -------------------- | ----------------------- | -------------- |
| Agent 自主发现新消息 | 不能，依赖 wake         | 能，自轮询     |
| Agent 主动认领任务   | 不能                    | 能             |
| 消息优先级           | 无（FIFO）              | 有（4 级）     |
| idle 通知            | 依赖 model 发 tool call | 系统级自动发送 |
| 并行工作             | 需 lead 逐个指派        | 自驱动并行     |

### 互搏结论

这是**最根本的行为差异**，但也是改动成本最高的。当前的 wake 模式在 lead 主动调度场景下够用，但限制了 teammate 的自治能力。

---

## 五、权限系统差距 (P1)

### Claude 的权限体系（完整实现）

```
Worker 遇需权限操作
  → 构建 SwarmPermissionRequest
  → 发送到 leader mailbox
  → Leader UI 审核
  → 发送 response 到 worker mailbox
  → Worker 继续或中止
```

核心文件:

- `permissionSync.ts`: 文件系统 pending/resolved 二级目录 + 文件锁
- `leaderPermissionBridge.ts`: in-process teammate 复用 leader UI
- `teammateInit.ts`: `teamAllowedPaths` 团队级白名单

### 当前项目的权限状态

- Team 层: **零权限代码**，搜索 permission/sandbox/allow 全无命中
- 底层: `CodexAgentManager.ts` L128-132 有 `sandboxMode` 配置（workspace-write 等）
- 结论: 有底层沙箱约束，但 **team 级细粒度控制完全缺失**

### 互搏修正

初始评估为 P0（0/10），经审查发现底层有沙箱机制，修正为 **P1（2/10 vs 8/10）**。Agent 不是完全裸奔，但 lead 无法审批 teammate 的具体操作。

---

## 六、消息传递差异 (P2)

### 6.1 消息结构

| 维度     | 当前项目 MailboxMessage | Claude TeammateMessage     |
| -------- | ----------------------- | -------------------------- |
| ID       | UUID                    | 无（数组索引）             |
| 类型标识 | `type` 枚举（3 种）     | `text` 内嵌 JSON（10+ 种） |
| 持久化   | SQLite                  | JSON 文件                  |
| 并发控制 | SQLite 内置写锁         | proper-lockfile 文件锁     |

### 6.2 消息类型对比

当前项目仅支持 3 种：

- `message` / `idle_notification` / `shutdown_request`

Claude 支持 10+ 种协议消息：

- 基础: message, idle_notification
- 权限: permission_request/response, sandbox_permission_request/response
- 生命周期: shutdown_request/approved/rejected
- 协作: plan_approval_request/response, task_assignment, team_permission_update, mode_set_request

### 6.3 Mailbox 架构

Claude 有**双层设计**:

1. 内存 Mailbox (`mailbox.ts`): 进程内快速通信，支持 waiter 模式（阻塞等待消息）
2. 文件 Mailbox (`teammateMailbox.ts`): 跨进程持久化通信

当前项目只有**单层** SQLite Mailbox。

### 6.4 readUnread 原子性

初始评估为"高风险"，经互搏验证：`activeWakes` + 单线程事件循环可防止同一 agent 并发 readUnread，实际风险**低**。

### 6.5 协商式 Shutdown

| 流程     | 当前项目                 | Claude                     |
| -------- | ------------------------ | -------------------------- |
| 请求关闭 | 有 type 定义，无处理逻辑 | leader 发 shutdown_request |
| 协商     | 无                       | model 决定接受/拒绝        |
| 确认     | 无                       | shutdown_approved/rejected |
| 安全停止 | 无                       | AbortController.abort()    |

---

## 七、任务管理差异 (P2)

### 功能对比

| 功能                        | 当前项目                              | Claude                                     | 差距     |
| --------------------------- | ------------------------------------- | ------------------------------------------ | -------- |
| CRUD                        | TaskManager 4 方法                    | 5 个独立 Tool                              | 基本对齐 |
| 状态流转                    | pending/in_progress/completed/deleted | 相同                                       | 对齐     |
| 依赖图 blockedBy/blocks     | 有（checkUnblocks 自动解锁）          | 有（addBlocks/addBlockedBy）               | **对齐** |
| TaskOutput（结果获取）      | 无                                    | 有（blocking/non-blocking，已 deprecated） | 缺失     |
| TaskCreated/Completed hooks | 无                                    | 有（可阻断创建/完成）                      | 缺失     |
| 自动 owner 分配             | 无                                    | in_progress 时自动设 owner                 | 缺失     |
| 邮箱通知 ownership 变更     | 无                                    | 有                                         | 缺失     |
| verification nudge          | 无                                    | 3+ 任务全完成无验证时提醒                  | 缺失     |
| 工具暴露方式                | ParsedAction 文本解析                 | 原生 Tool 协议                             | 架构差异 |

### 互搏修正

- 初始声称"task 依赖图是当前项目独有优势" -- **错误**，Claude 也有同等实现
- 评分: 当前项目 **4/10**，Claude **8/10**（TaskOutput deprecated 扣 1 分）

---

## 八、Workspace 隔离差异 (P2)

### Claude 的 Worktree 系统

完整的 git worktree 生命周期管理（`worktree.ts` 1520 行）:

- `createAgentWorktree()`: 每个 teammate 独立 worktree
- `teamAllowedPaths`: 团队级路径白名单
- `cleanupStaleAgentWorktrees()`: 自动清理过期 worktree
- hook 扩展点: WorktreeCreate/Remove

### 当前项目：假功能确认

- `types.ts:10` 定义了 `WorkspaceMode = 'shared' | 'isolated'`
- `TeamCreateModal.tsx:124` 硬编码默认值 `'shared'`
- `SqliteTeamRepository.ts` 正常读写该字段
- **但没有任何代码路径基于 workspaceMode 做分支判断**
- `TeammateManager.ts` 和 `TeamSession.ts` 中选 isolated 和 shared 执行路径完全一样

**结论**: workspaceMode=isolated 是 UI 可选但后端不处理的假功能。

---

## 九、数据模型差异

### TeamAgent vs Claude member

| 字段                  | 当前项目 | Claude                      | 说明                      |
| --------------------- | -------- | --------------------------- | ------------------------- |
| role (lead/teammate)  | 有       | 无（通过 leadAgentId 判断） | 当前更显式                |
| conversationId        | 有       | 无                          | 当前独有（Electron 需要） |
| conversationType      | 有       | 无                          | 当前独有（多 LLM）        |
| status (5 种)         | 有       | isActive boolean            | 当前更精细                |
| model                 | **缺失** | 有                          | 需补                      |
| prompt                | **缺失** | 有                          | 需补                      |
| color                 | **缺失** | 有                          | 需补                      |
| cwd                   | **缺失** | 有                          | 需补                      |
| worktreePath          | **缺失** | 有                          | 需补                      |
| mode (PermissionMode) | **缺失** | 有                          | 需补                      |
| subscriptions         | **缺失** | 有                          | 需补                      |
| backendType           | **缺失** | 有                          | 架构差异                  |

---

## 十、当前项目的真实优势

经互搏验证后保留的优势：

| #   | 优势                              | 说明                                                                              |
| --- | --------------------------------- | --------------------------------------------------------------------------------- |
| 1   | **SQLite + Repository Pattern**   | 比文件系统更可靠、可查询、可测试                                                  |
| 2   | **多 LLM 适配器架构**（设计层面） | 虽然 tool_use 路径有 bug，但架构支持 Claude/Gemini/Codex 混合团队，修复后即可生效 |
| 3   | **IPC 双向实时通信**              | 渲染器可实时接收 agent 状态和消息流                                               |
| 4   | **精细的 5 状态生命周期**         | pending/idle/active/completed/failed 比 Claude 的 boolean 更丰富                  |
| 5   | **Electron 原生窗口管理**         | 不需要 tmux/iTerm2 等终端方案                                                     |

---

## 十一、修复优先级建议

### P0 -- 立即修复

| 问题                  | 工作量 | 建议方案                                                |
| --------------------- | ------ | ------------------------------------------------------- |
| acpAdapter 死代码 bug | 小     | 修复 TeammateManager 传递 tools 和 toolCalls 到 adapter |

### P1 -- 短期补齐

| 问题                     | 工作量 | 建议方案                                                          |
| ------------------------ | ------ | ----------------------------------------------------------------- |
| Agent 驱动模型           | 大     | 评估是否引入 teammate 自轮询机制，或在 lead prompt 中强化调度策略 |
| Team 级权限控制          | 中     | 基于已有 SQLite + Mailbox 自研，不必复刻 Claude 文件方案          |
| TeamAgent 数据模型补字段 | 小     | 添加 model/prompt/color/cwd 等缺失字段                            |

### P2 -- 中期完善

| 问题               | 工作量 | 建议方案                                               |
| ------------------ | ------ | ------------------------------------------------------ |
| workspaceMode 实现 | 中     | 基于 git worktree 实现真正的 isolated 模式             |
| 协商式 shutdown    | 小     | 扩展 Mailbox 消息类型，添加 shutdown_approved/rejected |
| 任务系统 hooks     | 小     | 在 TaskManager 添加 create/complete 钩子               |
| 消息优先级         | 小     | readUnread 支持按 type 优先级排序                      |
| 自动 idle 通知     | 小     | turn 完成后系统级发送，不依赖 model                    |

---

## 十二、分析过程记录

| 阶段     | 参与 Agent                                     | 耗时    | 产出                   |
| -------- | ---------------------------------------------- | ------- | ---------------------- |
| 探索     | 探索 A（当前项目）+ 探索 B（Claude 源码）      | ~2.5min | 两边完整文件清单和结构 |
| 独立分析 | 开发 A（架构）+ 开发 B（消息）+ 开发 C（权限） | ~3min   | 三份独立深度报告       |
| 交叉互搏 | 审查 1（挑战 A+B）+ 审查 2（挑战 C+整体）      | ~1min   | 修正 4 个错误结论      |

### 互搏修正记录

| 原始结论                        | 提出者 | 修正结果                                                     | 修正者 |
| ------------------------------- | ------ | ------------------------------------------------------------ | ------ |
| 多 LLM 适配器是"独有优势"       | 开发 A | **错误** -- tool_use 路径是死代码，是设计意图非已实现优势    | 审查 1 |
| readUnread 重复消费风险"高"     | 开发 B | **偏高** -- activeWakes + 单线程保护，实际风险低             | 审查 1 |
| task 依赖图是当前项目"独有优势" | 开发 A | **错误** -- Claude 也有同等的 blockedBy/blocks 实现          | 审查 1 |
| 权限系统 0/10，P0               | 开发 C | **偏严** -- 底层有沙箱（CodexAgentManager），修正为 2/10，P1 | 审查 2 |
