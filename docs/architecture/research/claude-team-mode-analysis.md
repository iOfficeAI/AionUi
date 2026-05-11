# Claude Code Team 模式架构分析与 Aion 复刻决策报告

**日期：2026-03-31 | 基于真实源码：`/Users/zhuqingyu/Downloads/extracted/src/`**

---

## 一、两套多 Agent 体系的本质区别

Claude Code 有两套并行的多 Agent 体系，设计哲学根本不同：

| 维度         | Subagent 体系               | Teammate/Team 体系             |
| ------------ | --------------------------- | ------------------------------ |
| **拓扑**     | 星型（一主多从）            | 扁平（平等节点）               |
| **通信**     | 函数调用返回值              | 文件信箱 + 内存队列（双通道）  |
| **生命周期** | 一次性调用，用完销毁        | 持续运行，while 循环监听       |
| **消息触发** | 主动调用                    | 推送注入（自动出现为新对话轮） |
| **失败隔离** | 子 Agent 失败不影响主 Agent | 任意节点宕机影响整体           |
| **适合场景** | 分发→执行→汇总              | 协商→讨论→决策                 |

**一句话：Subagent 像调用函数，Team 像开了企业微信群——消息主动弹出来，不用你去刷新。**

---

## 二、功能开关：谁能用 Team 模式

```typescript
// src/utils/agentSwarmsEnabled.ts
export function isAgentSwarmsEnabled(): boolean {
  if (process.env.USER_TYPE === 'ant') return true; // Anthropic 内部：直接开

  if (!isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) && !process.argv.includes('--agent-teams')) {
    return false; // 外部用户：必须 opt-in
  }

  // 服务端 killswitch，用户无法绕过
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_flint', true)) {
    return false;
  }

  return true;
}
```

**外部用户今天可以激活：**

```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true claude --agent-teams
```

**三层权限：**

1. ✅ **用户可控**：env var + CLI flag 可直接激活
2. ❌ **服务端控制**：GrowthBook killswitch `tengu_amber_flint`，Anthropic 单方面可关闭，用户无法绕过
3. ✅ **内部特权**：`USER_TYPE=ant` 跳过一切检查

---

## 三、文件信箱：目录结构与数据格式

**真实目录结构：**

```
~/.claude/teams/{团队名}/
  config.json
  inboxes/
    {成员名}.json          # 收件箱（TeammateMessage 数组）
    {成员名}.json.lock     # 自动生成的锁文件

~/.claude/tasks/{团队名}/  # TaskList 与 Team 1:1 对应
```

**TeammateMessage 数据结构（`teammateMailbox.ts`）：**

```typescript
type TeammateMessage = {
  from: string;
  text: string;
  timestamp: number; // Unix 毫秒
  read: boolean;
  color?: string;
  summary?: string; // 用于 DM 摘要通知
};
// 文件内容是 TeammateMessage[]，追加写入
```

**完整的 13 种消息类型：**

| 消息类型                      | 说明              |
| ----------------------------- | ----------------- |
| `permission_request`          | 请求操作权限      |
| `permission_response`         | 权限响应          |
| `sandbox_permission_request`  | 沙箱权限请求      |
| `sandbox_permission_response` | 沙箱权限响应      |
| `shutdown_request`            | 请求关闭 Teammate |
| `shutdown_approved`           | 同意关闭          |
| `shutdown_rejected`           | 拒绝关闭          |
| `team_permission_update`      | 团队权限更新      |
| `mode_set_request`            | 设置模式请求      |
| `plan_approval_request`       | 方案审批请求      |
| `plan_approval_response`      | 方案审批响应      |
| `idle_notification`           | Teammate 空闲通知 |
| `task_assignment`             | 任务分配          |

---

## 四、文件写入：带完整文件锁的实现

```typescript
// src/utils/teammateMailbox.ts — writeToMailbox() 核心逻辑
async function writeToMailbox(inboxPath: string, message: TeammateMessage) {
  // 1. 加锁（10次重试，5-100ms 间隔）
  await lockfile.lock(inboxPath, {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  });

  try {
    // 2. 重新读取（防止 lock 期间被其他进程修改）
    const existing = readMailboxSync(inboxPath);
    // 3. 追加消息
    existing.push(message);
    // 4. 写入
    await fs.writeFile(inboxPath, JSON.stringify(existing));
  } finally {
    // 5. 无论成功或失败都释放锁
    await lockfile.unlock(inboxPath);
  }
}
// 锁文件路径：{inboxPath}.lock
```

> **细节**：`clearMailbox()` 不使用锁，直接写入空数组——是代码里的小缺陷，极低概率影响并发场景。

---

## 五、SendMessage 路由：双通道选择

```typescript
// src/tools/SendMessageTool/SendMessageTool.ts — 发送路由逻辑
async function sendMessage(to: string, message: TeammateMessage) {
  // 检查目标 Agent 是否在内存注册表（in-process 且正在运行）
  const agent = agentNameRegistry.get(to);

  if (agent) {
    // 路径 A：内存队列，0ms 延迟
    queuePendingMessage(agent, message);
    // 如果 Agent 已停止，唤醒它
    resumeAgentBackground(agent);
  } else {
    // 路径 B：文件信箱，0-500ms 延迟
    await writeToMailbox(getInboxPath(to), message);
  }
}
// 注意：即使是 in-process 模式，Teammate→Leader 方向仍走文件信箱
// 源码注释："for consistency with tmux teammates"
```

---

## 六、消息接收：推送模型（不是轮询）

**官方提示词原文（`SendMessageTool/prompt.ts`）：**

```
Your plain text output is NOT visible to other agents —
to communicate, you MUST call this tool.
Messages from teammates are delivered automatically;
you don't check an inbox.
```

**官方提示词原文（`TeamCreateTool/prompt.ts`）：**

```
Messages from teammates are automatically delivered to you.
You do NOT need to manually check your inbox.
These messages appear automatically as new conversation turns
(like user messages)
```

**实现机制：** 系统将收到的消息直接注入 Agent 对话历史中作为新的 `user turn`，模型感知这条消息如同用户说了一句话，自然触发响应。接收方不需要任何主动动作。

---

## 七、持续运行的事件循环

```typescript
// src/utils/swarm/inProcessRunner.ts — 核心循环
const POLL_INTERVAL_MS = 500;
const PERMISSION_POLL_INTERVAL_MS = 500;

// Teammate 生命周期（fire-and-forget 启动）
void runInProcessTeammate(config).catch(handleError);

async function runInProcessTeammate(config) {
  while (!abort) {
    await runAgent(); // 执行一个 Agent 轮次

    setIsIdle(true);
    sendIdleNotification(); // 告知 Team Lead "我空闲了"

    // 等待下一条消息（优先级：shutdown > team-lead > peers > task）
    await waitForNextPromptOrShutdown();
  }
}

async function waitForNextPromptOrShutdown() {
  let firstIteration = true;
  while (true) {
    if (!firstIteration) await sleep(POLL_INTERVAL_MS); // 第一轮不等
    firstIteration = false;

    // 优先级检查（高→低）：
    if (hasShutdownRequest()) return handleShutdown(); // 最高优先级
    if (hasTeamLeadMessage()) return processMessage();
    if (hasPeerMessage()) return processMessage(); // FIFO
    if (hasTaskUpdate()) return processTask();
  }
}
```

**In-Process 并发模型：** 基于 AsyncLocalStorage 做上下文隔离，是**协作式并发**（Cooperative Concurrency），不是操作系统级抢占式多线程。多个 Teammate 共享 Bun 进程，协作让出 CPU。

---

## 八、Shutdown 是 3-way Handshake

```
Team Lead  →  shutdown_request  →  Teammate
                                      ↓
                                  模型自主决定
                                  能否安全关闭
                                      ↓
Teammate   →  shutdown_approved / shutdown_rejected  →  Team Lead
```

模型决定能否关闭，不是强制终止。Teammate 可以拒绝（如"我还有未完成任务"）。

---

## 九、两种执行后端

```typescript
// src/utils/swarm/backends/registry.ts — 后端探测优先级
async function detectAndGetBackend() {
  if (await isInsideTmux()) return TmuxBackend; // 优先1：在 tmux session 内
  if (isInITerm2()) {
    if (await isIt2CliAvailable()) return ITermBackend; // 优先2：iTerm2 + it2 CLI
    if (await isTmuxAvailable()) return TmuxBackend; // 优先3：iTerm2 无 it2，tmux 回退
    throw new Error('需要安装 it2 或 tmux');
  }
  if (await isTmuxAvailable()) return TmuxBackend; // 优先4：外部 tmux session
  throw getTmuxInstallInstructions(); // 无法启动
}

// 强制 In-Process 的条件：
function isInProcessEnabled() {
  if (getIsNonInteractiveSession()) return true; // -p 非交互模式，强制 in-process
  if (mode === 'in-process') return true;
  if (mode === 'tmux') return false;
  // auto 模式：不在 tmux 且不在 iTerm2 时，才使用 in-process
  return !isInsideTmuxSync() && !isInITerm2();
}
```

---

## 十、内存成本（生产事故数据）

```typescript
// src/tasks/InProcessTeammateTask/types.ts
export const TEAMMATE_MESSAGES_UI_CAP = 50;

// 源码注释原文：
// ~20MB RSS per agent at 500+ turn sessions
// and ~125MB per concurrent agent in swarm bursts.
// Whale session 9a990de8 launched 292 agents in 2 minutes
// and reached 36.8GB
```

**结论：** 并发 Agent 内存成本约 125MB/个，UI 层限制展示 50 条消息。失控的 Agent 创建是灾难级故障。

---

## 十一、禁止嵌套的代码级强制约束

```typescript
// Subagent 不能嵌套（代码抛异常，提示词无法绕过）
throw Error('Fork is not available inside a forked worker. Complete your task directly using your tools.');

// Teammate 不能生成 Teammate（代码抛异常）
throw Error(
  'Teammates cannot spawn other teammates — the team roster is flat. To spawn a subagent instead, omit the `name` parameter.'
);
```

---

## 十二、Aion 复刻可行性

### 复刻度分项评估

| 模块                     | 复刻度 | 说明                                                               |
| ------------------------ | ------ | ------------------------------------------------------------------ |
| **文件信箱 + 文件锁**    | 92%    | `proper-lockfile` 是标准 npm 库，lock→read→write→unlock 可精确复制 |
| **消息格式 + 13 种类型** | 85%    | 结构已知，可完整实现子集                                           |
| **消息发送路由**         | 88%    | 文件写入逻辑清楚，内存队列可用 Map 近似                            |
| **消息接收（推送模型）** | 35%    | 底层需注入"新对话轮"，是 Claude Code 运行时内置，外部无法复制      |
| **持续运行事件循环**     | 25%    | 500ms 轮询可近似，但 Bun 事件循环驱动机制不可复制                  |
| **Team Lead 权限结构**   | 50%    | 3-way shutdown 可提示词近似，Plan 审批无系统级强制                 |
| **提示词/身份注入**      | 75%    | 原文已知可直接使用，SendMessage 内置训练语义层无法复制             |
| **功能开关**             | 30%    | env var 可激活，但 killswitch 服务端控制                           |

**综合复刻度：60-65%**

### 做不到的部分（无法工程绕过）

**推送模型** — 系统将消息注入为 `user turn` 是 Claude Code 运行时的内置能力，外部只能做"提示词约定轮询"，无法真正推送。

**持续运行（Actor 模型）** — `while(!abort){ runAgent() }` 需要 Bun 进程持续存在。Claude Code 的 Agent 是 request-response 模型，完成任务即退出，与之根本冲突。

**GrowthBook Killswitch** — `tengu_amber_flint` 服务端单方面可关闭，功能稳定性不可依赖。

**SendMessage 内置语义层** — 官方模型训练时已内化 SendMessage 语义，自制版本只是文件写入指令。

---

## 十三、决策：做什么，不做什么

### 做

**P0 — 文件信箱 + 文件锁（精确参照官方实现）**

参照 `writeToMailbox()` 的 lock→read→push→write→unlock 模式，用 `proper-lockfile`，消息格式完全对齐官方 `TeammateMessage`。这是今天可以做到 90% 还原度的部分。

**P1 — 郭总主动轮询检查（替代推送）**

每次任务开始，郭总检查所有信箱中 `read: false` 的消息，按优先级处理。用"有意识的主动检查"替代推送——效果可接受，实现成本低。

**P2 — Plan 审批流（提示词层 3-way）**

将 `plan_approval_request → plan_approval_response` 移植为 Aion 约定：郭总发方案前必须经技术角色审批响应，消息类型字段区分。无系统级强制，提示词工程保障。

**P3 — 角色身份 + 信箱地址注入**

各角色 CLAUDE.md 明确：`My inbox: ~/.claude/memory/inboxes/{name}.json`，团队成员列表，职责边界。

### 不做

| 不做的事                       | 原因                                              |
| ------------------------------ | ------------------------------------------------- |
| 完整事件循环复刻               | request-response → actor 是换系统，投入产出比极差 |
| 把官方 Team 模式当生产基础设施 | killswitch 随时可关，功能稳定性不可依赖           |
| 从 Subagent 全面切换到纯 Team  | 破坏现有稳定系统，失去主 Agent 全局视野           |
| 超过 10 个并发 Agent           | 生产数据：125MB/个，292 个 = 36.8GB，设上限       |
| Peer DM 摘要系统               | 每条 DM 额外 LLM 调用，成本高，调试功能非产品功能 |

### MVP（1-2 天）

1. 建信箱目录：`~/.claude/memory/inboxes/{角色名}.json`
2. 实现带锁写入（`proper-lockfile`）
3. 郭总加信箱检查约定（每次任务开始）
4. 各角色注入信箱地址
5. 验证场景：老锤完成任务 → 写入郭聪明信箱 → 郭聪明下次任务时读到并使用

---

## 十四、总结

Team 模式的核心是两件事：**持久运行 + 消息推送**。

- **持久运行**：复刻不了，这是 Bun 进程层面的能力
- **消息推送**：复刻不了，这是 Claude Code 运行时注入机制

但 Team 模式最有价值的东西——**结构化的 Agent 间通信基础设施**（文件信箱、文件锁、消息类型、发送路由）——这些全部可以精确复刻，而且官方实现就在源码里，照着做即可。

**Aion 的路径：** 不要复刻 Team 模式的"进程模型"，复刻它的"通信协议"。通信协议做好了，60-65% 的价值就到手了，剩下 35-40% 是运行时层面的能力，做不到也不需要做。

> 做 Team 机制是叠加，不是替换。文件信箱是增强，不是重构。

---

_基于真实源码分析：`src/utils/agentSwarmsEnabled.ts`、`src/utils/teammateMailbox.ts`、`src/utils/swarm/inProcessRunner.ts`（1553行）、`src/tools/SendMessageTool/`、`src/utils/swarm/backends/registry.ts`、`src/utils/swarm/constants.ts`_

_初版分析成员：阿构 · 老尺 · 老锤 · 小快 · 郭聪明 · 老乔 · 郭总（仲裁）_

---

## 十五、辩论修正（2026-03-31 第二轮）

**参与者：** 老锤（主力开发）、小快（快速开发）、阿构（架构师），三人各自独立阅读全部 23+ 核心源码文件后交叉辩论。

### 原报告的核心错误

**原报告说"持续运行复刻不了"——错了。**

三人一致确认：`inProcessRunner.ts` 的事件循环就是标准的 `while(true) + sleep(500ms) + fs.readFile()`，没有任何 Bun 专有 API。所谓"Bun 事件循环驱动机制不可复制"是误判。

- 源码证据：`inProcessRunner.ts` L697-868，全部是 `fs/promises`、`setTimeout` 的 Promise 包装、`AbortController`
- 任何能跑 Node.js 的环境都能实现这个循环

**原报告说"消息推送复刻不了"——也错了。**

"推送"的实现就是：轮询信箱文件 → 找到未读消息 → 拼成 XML 字符串 → 作为 user message 传给下一轮 API 调用。

- 源码证据：`inProcessRunner.ts` L756-845 读文件，L1371-1407 拼 prompt，L1067-1069 创建 userMessage
- `formatAsTeammateMessage()` 就是拼一个 `<teammate-message>` XML tag
- 外部 orchestrator 构造 messages 数组时加一条 user message 就行

**原报告遗漏了 `mailbox.ts`（73行纯内存信箱）。**

三人一致指出这个文件被忽略了。它提供 `send/poll/receive` + `waiters` 模式的 Promise-based 信箱，比 500ms 文件轮询更高效。Aion 如果走 in-process 路线，应优先使用。

### 复刻度修正

| 维度                 | 原报告     | 辩论后共识                                                                                        |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| **综合复刻度**       | 60-65%     | **65-75%**（使用 Claude 模型）/ **50-60%**（使用其他模型）                                        |
| 文件信箱 + 协议层    | 92%        | **90-95%**（几乎可 copy-paste）                                                                   |
| 消息接收（推送模型） | 35%        | **75-85%**（轮询 + 消息注入完全可做）                                                             |
| 持续运行事件循环     | 25%        | **70-80%**（骨架可复用，精细逻辑需重写）                                                          |
| Runner 核心          | 未单独评估 | **30-50%**（骨架简单，但 auto-compaction/权限/abort 深度耦合 Claude Code）                        |
| 权限系统             | 50%        | **40%**（UI Bridge 不可移植，Mailbox 路径可用；`createInProcessCanUseTool()` 323 行是核心硬骨头） |
| Prompt 工程          | 75%        | **55-70%**（用 Claude 模型 XML 天然兼容）/ **20-30%**（用其他模型需全部重写）                     |
| SendMessage 语义层   | 30%        | **争议未解**（老锤：无训练绑定；小快：有间接证据但确信度 60%；阿构：有差距可通过 prompt 缩小）    |

### 关键分歧（未完全对齐）

**1. SendMessage 是否有模型训练级语义绑定**

- 老锤（坚持没有）：SendMessage 100% 由代码控制，模型只需知道调用这个 tool 发消息
- 小快（认为有，确信度 60%）：prompt 的简短提醒式写法暗示模型已接触过类似协作场景
- 阿构（认为有差距）：可通过精细 system prompt 缩小但无法消除
- **结论：不影响工程决策，充分的 prompt 工程可以弥补**

**2. 生产级时间估计**

- 老锤：9-12 周
- 阿构：6-8 周（从原来 10 周下调）
- **结论：6-12 周区间，取决于权限系统做多深**

### 修正后的实施方案

#### MVP（3-5 天，~500-860 行）

三人一致同意的最小闭环：

| 组件                                           | 行数        | 来源                             |
| ---------------------------------------------- | ----------- | -------------------------------- |
| FileMailbox (lock/read/write/unlock)           | ~150 行     | 搬运 `teammateMailbox.ts` 精简版 |
| MemoryMailbox (in-process)                     | 73 行       | **直接搬运** `mailbox.ts`        |
| 消息类型定义 (text + idle + task_assignment)   | ~60-80 行   | 搬运                             |
| TeammateContext (AsyncLocalStorage)            | ~50 行      | 直接搬运                         |
| Runner 主循环 (while + run + idle + poll)      | ~200-400 行 | 重写                             |
| LLM 调用封装 (AgentRuntime adapter)            | ~100-150 行 | 重写（依赖现有 API）             |
| Prompt 注入 (system prompt + XML format)       | ~50-80 行   | 搬运+调整                        |
| Leader 端 (spawn + send task + receive result) | ~100-150 行 | 重写                             |

**前提条件：** 有可调用的 LLM API（如 Anthropic SDK）。如果需要从头搭建，加 2 天。

**MVP 不包含（留给后续 Phase）：**

- 完整权限系统（`createInProcessCanUseTool()` 323 行）
- auto-compaction（长会话压缩）
- per-turn abort（单轮中断）
- 多后端支持（Tmux/iTerm）
- 生产级错误处理和清理

#### 生产级路径（6-12 周）

| Phase   | 时间   | 内容                                        |
| ------- | ------ | ------------------------------------------- |
| Phase 1 | 2-3 周 | Mailbox + Identity + Protocol 完整移植      |
| Phase 2 | 3-4 周 | Runner 抽象层 + AgentRuntime 对接 LLM API   |
| Phase 3 | 2-3 周 | Backend + TeamCreate/SendMessage/TeamDelete |
| Phase 4 | 2 周   | 权限系统（Mailbox 路径）+ 健壮性            |

### 替代原报告第十二节的最终结论

原报告说"综合复刻度 60-65%"，建议"不做完整事件循环复刻"。

**辩论后的修正结论：**

1. **复刻度 65-75%**（使用 Claude 模型），原报告低估了 15 个百分点
2. **必须做事件循环**——这是 Team 模式的灵魂，没有它就只有信箱没有活的 Agent
3. **MVP 3-5 天可跑通**，不是原报告说的"投入产出比极差"
4. 原报告说对的部分保持不变：文件信箱精确复刻、不依赖官方 killswitch、并发 Agent 内存限制
5. 新发现：`mailbox.ts` 内存信箱是 Aion 的最佳选择，比文件轮询更高效

**一句话：不是"复刻通信协议就够了"，而是"事件循环 + 通信协议 + 消息注入"三件套全部可以做，而且不难。**

---

_辩论参与者：老锤（主力开发）· 小快（快速开发）· 阿构（架构师）_
_辩论方式：三人各自独立阅读 23+ 源码文件 → 独立出分析报告 → 交叉阅读 → 逐条回应分歧_
_未参与辩论的角色：老尺（待架构复核）、刺猬/镜子（待源码行号验证）_
