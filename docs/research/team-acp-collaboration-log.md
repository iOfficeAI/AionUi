# Team ACP 覆盖调研 — 团队协作全过程记录

> 日期：2026-04-07
> 目的：调研 AionUi Team Mode 的 Agent 类型覆盖情况 + 4 个核心测试 case 方案
> 用于：晚间技术分享

---

## 一、任务来源

用户提出两个问题：
1. 当前分支（fix/team-mcp-injection-stability）解决了部分 ACP 无法接入 agent 的问题，但还有多少种 agent、多少支持 ACP、剩下的能否也通过 ACP 接入 Team Mode？
2. 4 个测试 case（创建团队、删除成员、成员私聊、成员与 Leader 通信）如何从前端到后端真实跑一次？

---

## 二、第一轮：探索调研（并行，无对抗）

### 派出角色
| 角色 | 任务 | 耗时 |
|------|------|------|
| 探索 Agent A | Agent 类型 + ACP 覆盖矩阵 | ~2.5 min |
| 探索 Agent B | 4 个测试 case 的完整链路 + 方案 | ~3.5 min |

### 探索 Agent A 的发现
- 项目定义 20+ 种 agent 后端（`src/common/types/acpTypes.ts`）
- Team Mode 白名单只放了 4 种：claude/codex/codebuddy/gemini
- 白名单位置：`TeamMcpServer.ts:366` + `TeammateManager.ts`
- 13 种 ACP 后端被白名单挡住，技术上完全可用
- 5 种非 ACP 后端（WebSocket/JSON Lines/原生）需要协议包装

### 探索 Agent B 的发现
- 完整调用链路：前端 TeamCreateModal → ipcBridge → teamBridge → TeamSessionService → DB
- 通信链路：Mailbox (SQLite) → TeammateManager.wake() → Agent CLI
- 已有测试文件：teamSessionService.test.ts、team-SqliteTeamRepository.test.ts 等
- 建议三层测试：Vitest 单元 + SQLite 内存集成 + Playwright E2E

### 郭总点评
数据充分但有两个问题：
1. "扩展白名单就够了"这个结论是否过于乐观？没有验证
2. 4 个测试 case 方案没有经过测试专家审核，可能有漏洞

**决定：进入第二轮对抗**

---

## 三、第二轮：三路对抗（并行，互不可见）

### 派出角色
| 角色 | 任务 | 定位 |
|------|------|------|
| 阿构（架构师）| 基于数据出正式调研文档 | 方案提出者 |
| 老尺（架构复核）| 独立验证"白名单扩展就够了"的结论 | 质疑者 |
| 刺猬（测试 leader）| 审核 4 个测试 case 方案的可行性 | 挑刺者 |

### 阿构的输出

正式文档已落盘：`docs/research/team-agent-acp-coverage.md`

核心结论：
- AcpBackendAll 共 21 种（含 custom），三层分类：ACP stdio 15 种 / WebSocket 2 种 / 私有协议 3 种
- 白名单是策略限制不是技术限制，注释已写明 "only verified backends that support MCP tool injection"
- 扩展建议：先放 qwen 作模板，补 MCP 注入失败可观测性后再逐步开门
- **不建议**一次性全放开，也不建议为 nanobot 开发 Team 支持（per-message spawn 不适合协作）
- gemini 分类修正：配置层在 ACP_BACKENDS_ALL 但运行层走独立 GeminiAgentManager

### 老尺的质疑

**复核结论：未通过。**

核心质疑（有代码行号证据）：

1. **白名单不是 2 处而是 4 处，且已存在维护漂移：**
   - `TeamMcpServer.ts:366` — spawn_agent 门控
   - `TeammateManager.ts:169` — leader prompt 可用类型
   - `agentSelectUtils.tsx:25` — renderer UI 过滤（**少了 gemini，与其他 3 处不一致**）
   - `TeammateManager.ts:18` — `MCP_CAPABLE_TYPES = new Set(['acp', 'gemini'])` 能力门禁

2. **MCP_CAPABLE_TYPES 是独立的第二道门禁**：nanobot/aionrs/openclaw-gateway 的 conversationType 不是 'acp'，即使过了白名单也拿不到 MCP 工具

3. **`session/new { mcpServers }` 不是 ACP 标准**：各后端是否接受该字段零测试覆盖，可能静默忽略

4. **4 处白名单没有共同常量引用**，违反 DRY，每次改必须同步 4 处

### 刺猬的审核

**4 个 Case 逐一审核：**

1. **Case 1（创建团队）**：可行，但现有 6 个 case 全没断言 `repo.create` 调用，补 3 个 case 可达合理覆盖

2. **Case 2（删除成员）**：零覆盖。**关键遗漏**：`removeAgent` 不删除 conversation（只有 deleteTeam 才删），方案如果假设 deleteConversation 被调用就是错的。必须断言 `ipcBridge.team.agentRemoved.emit` 被调用

3. **Case 3（成员私聊）**：**"mock mailbox" 方案根本性错误**。mailbox 是通信链路唯一存储层，mock 掉后 write 和 readUnread 不联动，等于空转。改法：用真实 Mailbox + SQLite 内存库，只 mock workerTaskManager，用 `teamEventBus.emit('responseStream', ...)` 驱动 finalizeTurn

4. **Case 4（成员与 Leader 通信）**：wake() 内调真实 API 无法单测，但 `maybeWakeLeaderWhenAllIdle` 是纯状态机逻辑，3 个边界 case（C 还 active 时不 wake、全 idle 才 wake、并发 idle 只 wake 一次）是重点，**现在一个都没有**

**其他发现：**
- 4 个核心 IPC 事件（agentStatusChanged/messageStream/agentSpawned/agentRemoved）全无单测
- Playwright E2E 框架存在（确认 `playwright.config.ts` + `tests/e2e/specs/`），但 Team 通信 E2E 意义有限（依赖 LLM 生成特定 XML），UI 操作适合 E2E，通信链路用集成测试更可靠

---

## 四、对抗结果汇总

### 共识点（三方一致）
1. 白名单是策略限制不是技术限制
2. 13 种 ACP stdio 后端理论上可接入
3. 不建议为 nanobot 开发 Team 支持
4. 需要逐个验证 mcpServers 是否被各后端实际接受

### 分歧与修正
| 原始结论 | 老尺质疑 | 修正后 |
|----------|---------|--------|
| "改 2 处 < 5 行" | 实际 4 处白名单，已有漂移 | **改 4 处 + 抽统一常量** |
| "扩展白名单就能工作" | MCP_CAPABLE_TYPES 是第二道门禁 | **需同时检查 conversationType 映射** |
| "mock mailbox 测 Case 3" | mailbox 是被测核心不能 mock | **用真实 Mailbox + SQLite 内存库** |
| "Case 4 测 wake()" | maybeWakeLeaderWhenAllIdle 才是重点 | **补 3 个状态机边界 case** |

### 阿构文档 vs 老尺复核的差异
- 阿构说"两处独立白名单"，老尺说"四处"——老尺多找到 `agentSelectUtils.tsx:25` 和 `MCP_CAPABLE_TYPES`
- 阿构建议"先放开 qwen 作为模板"，老尺认为需先补 MCP 注入失败可观测性——**两者不矛盾，可串行执行**

---

## 五、最终结论与行动项

（待下一轮角色互审后收敛）

---

## 六、过程反思

### 第二轮协作模式问题
三路 agent 互不可见，全靠郭总手动搬运汇总，形成 hub-and-spoke 模式而非真正团队协作。下一轮调整为：让角色之间直接互相审阅、用 SendMessage 对话，郭总只在关键节点把控。
