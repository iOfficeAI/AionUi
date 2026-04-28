# 单聊转 Team 功能规格

> 这个文档反推自 main 分支源码，涵盖 Solo Conversation 转为 Team Mode 的完整流程。

## 1. 概述（这个功能是什么）

**单聊转 Team** 是一个 Agent 智能协调的流程，**不是用户点按钮的主动入口**。在 Solo 聊天中，当 Agent 判断任务需要多人协作时，可以通过 MCP 工具 `aion_create_team` 将当前的 Solo Conversation 转换为多 Agent Team Mode。

核心特点：
- **发起者**：Solo Conversation 中的 Agent（支持的后端：claude、codex、gemini）
- **触发方式**：Agent 在推理过程中主动调用 MCP 工具 `aion_create_team`
- **用户体验**：Agent 先向用户提议（"建议创建 Team"），用户确认后 Agent 才调用工具
- **数据保留**：原有 Solo Conversation 的上下文被"提升"为 Team 的 Leader Agent 的 Conversation
- **自动导航**：创建完成后系统自动跳转到 Team 页面，不留孤立的 Solo Conversation

---

## 2. UI 入口与交互流程

### 2.1 无明显 UI 按钮
**Main 分支上不存在"转为 Team"按钮或菜单项**。转换完全由 Agent 智能发起，遵循团队指引提示词的决策逻辑。

### 2.2 交互流程（用户视角）

```
Solo 聊天页面
  ↓
用户提出复杂任务（明确要求 Team 或超高难度）
  ↓
Agent 分析：是否需要 Team？
  ├─ 否 → 继续 Solo 聊天（默认行为）
  └─ 是 → 提议 Team 配置表
       ↓
       Agent 输出：
         1. Team 对这个任务的帮助说明（一句话）
         2. 团队成员配置表（Role、Responsibility、Type、Model）
         3. "请确认是否创建 Team" 的隐式等待
       ↓
       用户回复确认（"ok", "go ahead", "确认"）
       ↓
       Agent 调用 aion_create_team MCP 工具
         ├─ 传入：summary (任务+确认配置), name (Team 名称, 可选), workspace (工作目录, 可选)
         └─ 获得：teamId, name, route, leadAgent, status, next_step
       ↓
       系统自动跳转到 /team/{teamId}
       ↓
       Team 页面加载，Leader Agent 收到 summary，开始提议/招募队友
```

---

## 3. API 调用链路

### 3.1 前端 - 无直接 API 调用
前端代码中**不存在**主动调用"转 Team"的 API。这完全由后端 Agent 主动触发。

### 3.2 后端 - MCP 工具入口

**工具名称**：`aion_create_team`

**使用位置**：
- 文件：`src/process/team/mcp/guide/TeamGuideMcpServer.ts`
- 处理函数：`handleCreateTeam(args, backend, callerConversationId)`

**输入参数** (`args` object):
```typescript
{
  summary: string;      // 必需。任务目标 + 确认的 Team 配置。不能为空。
  name?: string;        // 可选。Team 名称。若不提供，使用 summary 的前 5 个单词。
  workspace?: string;   // 可选。工作目录路径。若为空且有 callerConversationId，继承原 Solo Conversation 的 workspace。
}
```

**返回值** (JSON string):
```typescript
{
  teamId: string;
  name: string;
  route: string;                          // "/team/{teamId}"
  leadAgent: {
    slotId: string;
    conversationId: string;               // 复用原 Solo Conversation ID
  } | null;
  status: 'team_created';
  next_step: string;                      // "The team page has been opened automatically. End your turn now..."
}
```

---

## 4. 后端处理逻辑

### 4.1 MCP 工具注册和 TCP 连接

**工具注册**：`src/process/team/mcp/guide/teamGuideMcpStdio.ts`
- 为每个 Solo Conversation 启动 `TeamGuideMcpServer` TCP 服务器
- 将 `aion_create_team` 和 `aion_list_models` 工具暴露为 MCP 标准工具

**TCP 通信**：
- Stdio 脚本 (`team-guide-mcp-stdio.js`) 接收 Agent 的工具调用
- 转发给 TCP 服务器（通过 AION_MCP_PORT 和 AION_MCP_TOKEN）
- 服务器处理后返回结果

**环境变量注入** (`src/process/resources/aionMcp/aionMcpStdio.ts`):
```
AION_MCP_BACKEND   → Agent 后端类型（claude、codex、gemini）
AION_MCP_PORT      → TeamGuideMcpServer TCP 端口
AION_MCP_TOKEN     → 认证令牌
AION_MCP_CONVERSATION_ID → Solo Conversation ID（用于复用为 Leader）
```

### 4.2 createTeam 流程

**入口**：`handleCreateTeam()` in `TeamGuideMcpServer.ts:165-261`

**关键步骤**：

1. **参数验证**
   - 检查 `summary` 必需且非空

2. **Workspace 继承**
   ```typescript
   if (!workspace && callerConversationId) {
     // 从原 Solo Conversation 继承 workspace
     const callerWorkspace = db.getConversation(callerConversationId)?.extra?.workspace;
     if (callerWorkspace) workspace = callerWorkspace;
   }
   ```

3. **Agent 类型决策**
   ```typescript
   const agentType = backend && isTeamCapableBackend(backend, cachedInitResults) 
     ? backend 
     : 'claude';  // 降级到 claude
   ```
   支持的后端：claude、codex、gemini

4. **创建 Team** (`teamSessionService.createTeam()`)
   ```typescript
   const team = await teamSessionService.createTeam({
     userId: 'system_default_user',
     name: teamName,
     workspace,
     workspaceMode: 'shared',
     sessionMode: 'yolo',
     agents: [{
       slotId: '',
       conversationId: callerConversationId || '',  // 复用 Solo Conversation
       role: 'leader',
       agentType,
       agentName: 'Leader',
       conversationType: getConversationTypeForBackend(agentType),
       status: 'pending',
     }],
   });
   ```

5. **列表更新（IPC 通知）**
   ```typescript
   // 通知前端：Solo Conversation 已被转换
   ipcBridge.conversation.listChanged.emit({
     conversationId: callerConversationId,
     action: 'updated',
     source: 'aionui',
   });
   
   // 通知前端：新 Team 已创建
   ipcBridge.team.listChanged.emit({
     teamId: team.id,
     action: 'created',
   });
   ```

6. **自动导航**
   ```typescript
   ipcBridge.deepLink.received.emit({
     action: 'navigate',
     params: { route: `/team/${team.id}` },
   });
   ```

7. **异步启动 Team 会话**
   ```typescript
   // 不阻塞，后台启动
   const session = await teamSessionService.getOrStartSession(team.id);
   
   // 向 Leader 发送 summary，但不显示为 UI 气泡（silent: true）
   // 这样 Leader Agent 可以阅读完整上下文并开始提议队友
   await session.sendMessageToAgent(leadAgent.slotId, summary, { 
     silent: leaderIsReused 
   });
   ```

### 4.3 关键设计点

**Conversation 复用**：
- Solo Conversation 的 ID 被 **直接复用** 为 Team Leader 的 Conversation ID
- 这样避免了孤立的 Solo Conversation 留在侧边栏
- 原有的聊天记录保留在 Leader Conversation 中

**Workspace 继承**：
- 防止"Solo → Team 时 workspace 被覆盖为空"的 bug
- 见提交 `bb92a4d35`：`fix(team): prevent workspace overwrite when converting solo chat to team`

**Silent 模式**：
- 转换后的 summary 不显示为用户气泡（`silent: true`）
- 但仍通过 Mailbox 传递给 Leader Agent，作为上下文

---

## 5. MCP 关联

### 5.1 工具定义

**文件**：`src/process/team/prompts/teamGuidePrompt.ts`

**两个核心工具**：

1. **aion_create_team**
   - 触发条件：用户明确要求 Team 或任务超复杂且用户已确认
   - 前置条件：必须展示 Team 配置表，等待用户确认
   - 限制：不能跳过确认步骤，不能无故调用

2. **aion_list_models**
   - 在展示 Team 配置表前调用，查询每种 Agent 类型的可用模型

### 5.2 Team 指引提示词

**文件**：`src/process/team/prompts/teamGuidePrompt.ts:43-109`

**关键决策规则**：

```
### 默认行为（Solo）
处理任务时默认不提议 Team。

### 只在以下情况提议 Team
1. 用户明确要求多 Agent / Team
2. 任务超级复杂，一个 Agent 难以胜任，且用户同意

### 保持 Solo 的情况
- 普通会话、问答、单点任务
- 正常编码、写作、研究
- 任何一个 Agent 能力所及的工作
```

**Team 创建流程（严格顺序）**：
1. 调用 `aion_list_models` 查询可用模型
2. 解释 Team 的帮助（一句话）
3. 输出配置表（Role、Responsibility、Type、Model）
4. **结束该轮对话**，等用户确认
5. 用户确认后 → 调用 `aion_create_team`
6. `aion_create_team` 返回 → 阅读 `next_step`，结束对话

---

## 6. 数据流（Conversation → Team 的数据迁移）

### 6.1 Solo Conversation 的四个关键字段

```typescript
// DB Schema (src/common/types/conversationTypes.ts)
type TChatConversation = {
  id: string;                           // ← 被 Team Leader 直接复用
  type: ConversationType;               // "acp" | "gemini" | "aionrs" ...
  model?: TProviderWithModel;
  messages: TChatMessage[];             // ← 保留在 Leader Conversation 中
  extra?: {
    workspace?: string;                 // ← 继承给 Team
    agentName?: string;
    currentModelId?: string;
    ...
  };
}
```

### 6.2 Team Agent 对象

```typescript
// DB Schema (src/common/types/teamTypes.ts)
type TeamAgent = {
  slotId: string;
  conversationId: string;               // ← 复用 Solo Conversation 的 ID
  role: 'leader' | 'member';
  status: 'pending' | 'active' | 'crashed';
  agentType: 'claude' | 'codex' | 'gemini' | ...;
  agentName: string;                    // "Leader" for reused conversation
  conversationType: ConversationType;
  cliPath?: string;                     // for CLI agents
  customAgentId?: string;               // for preset assistants
}
```

### 6.3 迁移过程（简化图）

```
Solo Conversation 状态：
├─ id: "conv-123"
├─ type: "acp"
├─ messages: [ ... full chat history ... ]
└─ extra: { workspace: "/path/to/project", ... }

                    ↓ aion_create_team 调用

Team 创建后：
├─ Team ID: "team-456"
├─ Team.agents[0] (Leader):
│  ├─ conversationId: "conv-123"    ← 相同 ID
│  ├─ role: "leader"
│  └─ agentType: "claude"
│
└─ Conversation 标记：
   ├─ extra.teamId: "team-456"       ← 新加字段，表示属于某个 Team
   └─ messages: [ ... 保留 ... ]      ← 历史不删除

结果：
- 侧边栏：Conversation "conv-123" 消失（被 Team 所有）
- Team 页面：Leader 能读取完整的聊天历史（同一个 Conversation ID）
```

---

## 7. 关键文件索引

| 文件 | 作用 |
|------|------|
| `src/process/team/mcp/guide/TeamGuideMcpServer.ts` | MCP 工具处理 + createTeam 核心逻辑 |
| `src/process/team/mcp/guide/teamGuideMcpStdio.ts` | Stdio MCP 脚本入口 |
| `src/process/team/prompts/teamGuidePrompt.ts` | Team 指引提示词（包含决策规则和工具定义） |
| `src/process/team/TeamSessionService.ts` | Team 会话生命周期管理（createTeam 实现） |
| `src/process/team/TeammateManager.ts` | Team 内 Agent 通信和消息路由 |
| `src/common/types/teamTypes.ts` | Team 和 TeamAgent 类型定义 |
| `src/common/types/conversationTypes.ts` | Conversation 类型定义 |
| `src/process/resources/aionMcp/aionMcpStdio.ts` | 环境变量注入（AION_MCP_CONVERSATION_ID） |
| `src/process/agent/acp/index.ts` | ACP Agent 端注入 Team 指引提示词和工具 |
| `src/process/task/GeminiAgentManager.ts` | Gemini Agent 端注入 Team 指引提示词和工具 |
| `src/process/task/AionrsManager.ts` | Aionrs Agent 端注入 Team 指引提示词和工具 |
| `tests/unit/team-workspace-sync.test.ts` | Solo→Team 转换的测试（workspace 继承验证） |

---

## 8. 反向流程：Team 回到 Solo

**Main 分支上不存在此功能**。Team 转换后无法回到 Solo Conversation。

---

## 9. 边界情况和错误处理

### 9.1 不支持的后端

如果 Agent 后端不在支持列表（claude、codex、gemini），`createTeam` 会**降级到 claude**：

```typescript
const agentType = backend && isTeamCapableBackend(backend, cachedInitResults) 
  ? backend 
  : 'claude';
```

### 9.2 Workspace 覆盖防护

曾经的 bug：Solo → Team 时如果不传 workspace，会将原 Conversation 的 workspace 覆盖为空字符串，导致 `mkdir('')` 失败。

**修复**（提交 `bb92a4d35`）：
```typescript
// 若无 workspace 但有 callerConversationId，继承原值
if (!workspace && callerConversationId) {
  const callerWorkspace = db.getConversation(callerConversationId)?.extra?.workspace;
  if (callerWorkspace) workspace = callerWorkspace;
}
```

### 9.3 Summary 必需

若 summary 为空或未提供，`createTeam` 抛出错误：
```typescript
if (!summary) throw new Error('summary is required');
```

---

## 10. 性能和扩展性

### 10.1 异步启动
Team 会话启动不阻塞 API 返回，避免创建延迟：
```typescript
void (async () => {
  const session = await teamSessionService.getOrStartSession(team.id);
  await session.sendMessageToAgent(leadAgent.slotId, summary, { silent: leaderIsReused });
})();
```

### 10.2 MCP 工具就绪竞态
为防止 Leader 发送消息前 MCP 工具未注册，使用等待机制（`mcpReadiness.ts`）：
- Team 启动时 MCP Server 就绪后发出通知
- Message dispatch 等待通知再发送第一条消息

见提交 `f042f8073`。

---

## 11. 测试覆盖

**单元测试**：`tests/unit/team-workspace-sync.test.ts`
- 验证 Solo → Team 时 workspace 正确继承
- 验证空 workspace 不覆盖原值

**E2E 测试**：`tests/e2e/team.e2e.ts`（若存在）
- 完整流程验证（从 Solo 聊天到 Team 创建和导航）

---

## 附录 A：提交历史（相关 PR）

| 提交 | 标题 | 描述 |
|-----|------|------|
| `f042f8073` | refactor(team): reuse caller conversation as team leader (#2352) | 核心功能：复用 Solo Conversation 为 Team Leader |
| `bb92a4d35` | fix(team): prevent workspace overwrite when converting solo chat to team (#2377) | Bug 修复：workspace 继承 |
| `03c9b519d` | feat(team-guide): add solo-to-team guidance via MCP tools (#2278) | Team 指引提示词实现 |
| `cb7b62db7` | feat(team-guide): add solo-to-team guidance via MCP tools | 早期迭代 |

---

**文档版本**：基于 main 分支 HEAD（2026-04-27）

**关键特性**：
- ✅ Conversation 复用，无孤立残留
- ✅ Workspace 自动继承
- ✅ 自动导航到 Team 页面
- ✅ Agent 智能判断，用户流程清晰
- ✅ MCP 工具隔离，支持多后端
