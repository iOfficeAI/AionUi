# Team MCP 勘误表与接口修正文档

**生成日期**: 2026-04-28  
**来源**: PRD 事实核查报告 + 源码审计  
**状态**: 待 team-lead 确认

---

## 执行摘要

PRD（team-mcp-prd.md）对标 main 分支源码进行了完整核查，发现 **5 个问题**。其中 2 个是 P0 优先级（参数名不符），1 个 P1（类型导入混乱），1 个 P2（API 路由缺失），1 个低优先级（文档风格）。

**建议**：采纳本文档中的修正内容，更新 PRD、协议文档和实现代码。

---

## 问题详解与修正方案

### 问题 P0-1: team_shutdown_agent 参数名不符

**现状**
- PRD §6 L174 声称参数为 `slot_id`
- 实现（TeamMcpServer.ts L510）使用 `args.agent`

**源码证据**
```typescript
// src/process/team/mcp/team/TeamMcpServer.ts L510-515
private async handleShutdownAgent(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
  const agentRef = String(args.agent ?? '');  // ← 实际参数名
  const resolvedSlotId = this.resolveSlotId(agentRef);
  ...
}
```

**影响**
- Agent 调用此工具会传递错误的参数名，导致参数解析失败
- 第三方工具集成会出错

**修正方案（二选一）**

**方案 A（推荐）：统一使用 `agent`**
- 参数名改为 `agent: string`（支持 agent name 或 slot_id 模糊匹配）
- 更新 PRD §6 L174
- 理由：实现已经支持名字模糊匹配，比只支持 slot_id 更灵活

**方案 B：改实现为 `slot_id`**
- TeamMcpServer.ts L510 改为 `const agentRef = String(args.slot_id ?? '');`
- 删除 `resolveSlotId()` 调用，直接用 slot_id
- 理由：简化接口，但失去名字匹配便利性

**建议**: 采纳方案 A

**修正文本**:

| 工具 | 参数 | 说明 | 权限 |
|------|------|------|------|
| `team_shutdown_agent` | `agent` | 请求 agent 关闭（支持 agent name 或 slot_id） | 所有 |

---

### 问题 P0-2: team_rename_agent 参数名不符

**现状**
- PRD §6 L173 声称参数为 `slot_id, new_name`
- 实现（TeamMcpServer.ts L614）使用 `args.agent, args.new_name`

**源码证据**
```typescript
// src/process/team/mcp/team/TeamMcpServer.ts L613-615
private handleRenameAgent(args: Record<string, unknown>): string {
  const agentRef = String(args.agent ?? '');        // ← 第一个参数实际名为 agent
  const new_name = String(args.new_name ?? '');
```

**影响**
同问题 P0-1

**修正方案**
采纳与 P0-1 相同的方案 A：

| 工具 | 参数 | 说明 | 权限 |
|------|------|------|------|
| `team_rename_agent` | `agent, new_name` | 重命名 agent（agent 支持 name 或 slot_id） | 所有 |

---

### 问题 P1: ipcBridge 类型导入来源混乱

**现状**

文件: `src/common/adapter/ipcBridge.ts`

```typescript
// L1440 - 错：来自 @process/team/types
create: withResponseMap(
  httpPost<import('@process/team/types').TTeam, ICreateTeamParams>(...)

// L1447 - 错：来自 @process/team/types
list: withResponseMap(
  httpGet<import('@process/team/types').TTeam[], { user_id: string }>(...)

// L1453 - 错：来自 @process/team/types
get: withResponseMap(
  httpGet<import('@process/team/types').TTeam | null, { id: string }>(...)

// L1458 - 错：来自 @process/team/types
addAgent: withResponseMap(
  httpPost<import('@process/team/types').TeamAgent, IAddTeamAgentParams>(...)

// L1493 - 错：来自 @process/team/types
agentStatusChanged: wsEmitter<import('@process/team/types').ITeamAgentStatusEvent>(...)

// L1494-1498 - 对：来自 @/common/types/teamTypes
agentSpawned: wsEmitter<import('@/common/types/teamTypes').ITeamAgentSpawnedEvent>(...)
agentRemoved: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRemovedEvent>(...)
agentRenamed: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRenamedEvent>(...)
listChanged: wsEmitter<import('@/common/types/teamTypes').ITeamListChangedEvent>(...)
mcpStatus: wsEmitter<import('@/common/types/teamTypes').ITeamMcpStatusEvent>(...)
```

**根本原因**

- `src/process/team/types.ts` 有重新导出（re-export）共享类型，导致两个导入来源都能工作
- 但这违反了 clear separation of concerns：共享类型应该统一导入自 `@/common/types/teamTypes`

**影响**
- 代码能工作，但维护困难
- 新贡献者可能被混淆
- 类型依赖链不清晰

**修正方案**

将 ipcBridge.ts 的所有 `@process/team/types` 导入改为 `@/common/types/teamTypes`：

```diff
- httpPost<import('@process/team/types').TTeam, ICreateTeamParams>(...)
+ httpPost<import('@/common/types/teamTypes').TTeam, ICreateTeamParams>(...)

- httpGet<import('@process/team/types').TTeam[], { user_id: string }>(...)
+ httpGet<import('@/common/types/teamTypes').TTeam[], { user_id: string }>(...)

- httpGet<import('@process/team/types').TTeam | null, { id: string }>(...)
+ httpGet<import('@/common/types/teamTypes').TTeam | null, { id: string }>(...)

- httpPost<import('@process/team/types').TeamAgent, IAddTeamAgentParams>(...)
+ httpPost<import('@/common/types/teamTypes').TeamAgent, IAddTeamAgentParams>(...)

- agentStatusChanged: wsEmitter<import('@process/team/types').ITeamAgentStatusEvent>(...)
+ agentStatusChanged: wsEmitter<import('@/common/types/teamTypes').ITeamAgentStatusEvent>(...)
```

**任务**: 分配给 #4（Wave1-前端：类型抽取修复）

---

### 问题 P2: HTTP API 路由后端实现缺失

**现状**

PRD §3 L117-118 列出的两个路由：

```
POST /api/teams/{id}/session-mode    设置权限模式
POST /api/teams/{id}/workspace       更新 workspace
```

**分析**

- **前端已声明**（ipcBridge.ts L1485-1491）
  ```typescript
  setSessionMode: httpPost<void, { team_id: string; session_mode: string }>(...)
  updateWorkspace: httpPost<void, { team_id: string; workspace: string }>(...)
  ```
- **后端实现状态**：未在源码中找到对应的路由处理器
  - 搜索 `src/process/team/` 目录未找到这两个路由的处理代码
  - PRD 本身已将其列为 §11（已知问题）L274-275："待确认"

**影响**
- 前端调用这两个 API 会得到 404 或 500
- Wave2 联调时会阻塞

**修正方案**

确认以下之一：

**选项 1：实现这两个路由**
- 后端需要在 TeamService / TeamController 中实现对应的 handler
- 分配给 #2（Wave1-后端：确认/补齐 team MCP 路由）

**选项 2：从 PRD 和 ipcBridge 移除这两个 API**
- 如果这两个功能确实不在 MVP 范围
- 需要从 ipcBridge.ts 删除对应的声明
- 从 PRD §3 删除这两行

**建议**: 优先完成选项 1（实现这两个路由），因为：
- session_mode 对权限管理重要
- workspace 对多 agent 协作重要
- 前端已有 UI 入口（setSessionMode、updateWorkspace）

**任务**: 分配给 #2（Wave1-后端）

---

### 问题 P3（低优先级）: WebSocket 事件类型导入来源不一致

**现状**

ipcBridge.ts L1493-1498：

```typescript
agentStatusChanged: wsEmitter<import('@process/team/types').ITeamAgentStatusEvent>(...),    // ← 异
agentSpawned: wsEmitter<import('@/common/types/teamTypes').ITeamAgentSpawnedEvent>(...),   // ← 一致
agentRemoved: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRemovedEvent>(...),
agentRenamed: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRenamedEvent>(...),
listChanged: wsEmitter<import('@/common/types/teamTypes').ITeamListChangedEvent>(...),
mcpStatus: wsEmitter<import('@/common/types/teamTypes').ITeamMcpStatusEvent>(...),
```

**修正方案**

将 L1493 改为：
```typescript
agentStatusChanged: wsEmitter<import('@/common/types/teamTypes').ITeamAgentStatusEvent>(...),
```

这同时解决了问题 P1，两个修正可一起进行。

---

## 汇总修正表

| 问题 | 位置 | 修正内容 | 优先级 | 分配任务 |
|------|------|--------|--------|--------|
| P0-1 | PRD §6 L174 | 参数 `slot_id` → `agent`（支持名字匹配） | 高 | #2 后端 review |
| P0-2 | PRD §6 L173 | 参数 `slot_id` → `agent`（支持名字匹配） | 高 | #2 后端 review |
| P1 | ipcBridge.ts L1440, 1447, 1453, 1458, 1493 | 改为 `@/common/types/teamTypes` 导入 | 中 | #4 前端修复 |
| P2 | 后端缺失 | 实现 `POST /api/teams/{id}/session-mode` 和 `workspace` 路由 | 中 | #2 后端 |
| P3 | ipcBridge.ts L1493 | 改为 `@/common/types/teamTypes` 导入（同 P1） | 低 | #4 前端修复 |

---

## 对 PRD 的建议改动

### §6 MCP 工具定义表（L165-176）

**当前**:
```
| `team_shutdown_agent` | `slot_id` | 请求 agent 关闭 | 所有 |
| `team_rename_agent` | `slot_id, new_name` | 重命名 agent | 所有 |
```

**修改为**:
```
| `team_shutdown_agent` | `agent` | 请求 agent 关闭（支持 agent name 或 slot_id） | 所有 |
| `team_rename_agent` | `agent, new_name` | 重命名 agent（agent 支持 name 或 slot_id） | 所有 |
```

### §11 前后端分离注意事项（L268-276）

**当前**:
```
- `ipcBridge.ts` 有 5 处 `import('@process/team/types')` → 应改为 `import('@/common/types/teamTypes')`
- `ipcBridge.ts` L18 `import type { McpSource }` 从 `@process/` → 需抽到 `@/common/types/mcpTypes.ts`
- L1484 `ITeamAgentStatusEvent` 从 `@process/team/types` 导入...
```

**修改为**:
```
✓ **已修正** (#4 Wave1-前端中修复):
- ipcBridge.ts 所有 team 相关的类型导入已改为 `@/common/types/teamTypes`
```

### §11 已知问题（L280-290）

**添加新行**:
```
| 8 | MCP 工具参数名与文档不符 | 代码 | ✓ 已修正 | team_shutdown_agent 和 team_rename_agent 参数实际为 agent，非 slot_id |
```

---

## 验收检查清单

- [ ] P0 问题修正：MCP 参数名确认（方案 A）
- [ ] P1 问题修正：ipcBridge 类型导入统一为 `@/common/types/teamTypes`
- [ ] P2 问题修正或确认：后端实现或明确删除 session-mode/workspace 路由
- [ ] PRD 更新：采纳本文档的修正文本
- [ ] 协议文档（team-mcp-protocol.md）更新：参数名修正反映到工具 schema
- [ ] 单元测试：验证 MCP 工具参数解析

---

## 后续流程

1. **team-lead review** 本勘误表
2. **#2 Wave1-后端** 确认参数名方案并实现/确认 session-mode 和 workspace 路由
3. **#4 Wave1-前端** 统一类型导入
4. **#3** 基于确认后的内容生成最终接口契约文档
5. **#6 Wave2** 联调时依照最终接口契约

---

**文档版本**: v1.0  
**最后更新**: 2026-04-28  
**作者**: checker-source (事实核查 agent)
