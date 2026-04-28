# Team MCP 实现检查清单

## 概述

本清单逐条对应协议文档（team-mcp-protocol.md）的各个功能模块，用于 Wave1/Wave2 的前后端联调验收。

**重要：** 每条检查项对应具体的代码路径、测试方法、预期行为。

---

## A. HTTP API 契约验收

### A1. Team CRUD

#### ✓ POST /api/teams - Create Team

- **后端实现：**
  - [ ] Handler: `POST /api/teams` 接受 ICreateTeamParams
  - [ ] Validation: 检查所有 agents 的 backend 是否 team-capable
  - [ ] Creation: 在 SQLite teams 表插入行
  - [ ] Response: 返回完整 TTeam 对象（包括 leader_agent_id）

- **前端调用：**
  - [ ] `ipcBridge.team.create.invoke(params)` 工作
  - [ ] 响应通过 `fromBackendTeam` 映射
  - [ ] UI 显示新创建的 team

- **测试方法：**
  ```bash
  # 后端
  curl -X POST http://localhost:13400/api/teams \
    -H 'Content-Type: application/json' \
    -d '{
      "name": "Test Team",
      "agents": [
        {"name": "Leader", "role": "lead", "backend": "gemini", "model": "default"}
      ]
    }'
  
  # 前端（DevTools Console）
  ipcBridge.team.create.invoke({
    name: "Test Team",
    agents: [{agent_name: "Leader", role: "leader", agent_type: "gemini", ...}]
  }).then(team => console.log(team))
  ```

- **预期行为：**
  - 返回 200，JSON body 包含 team.id、agents 数组等
  - team.leader_agent_id 指向首个 leader role agent

---

#### ✓ GET /api/teams?user_id=:user_id - List Teams

- **后端实现：**
  - [ ] Handler: `GET /api/teams?user_id=X` 
  - [ ] Query: 从 SQLite 查询该 user 的所有 teams
  - [ ] Response: 返回 TTeam[] 数组

- **前端调用：**
  - [ ] `ipcBridge.team.list.invoke({user_id: "..."})` 工作
  - [ ] 响应映射为前端类型

- **测试方法：**
  ```bash
  curl http://localhost:13400/api/teams?user_id=test-user-id
  ```

---

#### ✓ GET /api/teams/:id - Get Single Team

- **后端实现：**
  - [ ] Handler: `GET /api/teams/{id}`
  - [ ] 404 handling: team 不存在时返回 null
  - [ ] Response: 返回 TTeam | null

- **测试方法：**
  ```bash
  curl http://localhost:13400/api/teams/team-123
  ```

---

#### ✓ DELETE /api/teams/:id - Delete Team

- **后端实现：**
  - [ ] Handler: `DELETE /api/teams/{id}`
  - [ ] Cascade: 删除关联的 agents、mailbox、tasks
  - [ ] Stop session: 如果 session 运行则停止
  - [ ] Response: 204 No Content

- **测试方法：**
  ```bash
  curl -X DELETE http://localhost:13400/api/teams/team-123
  ```

---

### A2. Agent 生命周期

#### ✓ POST /api/teams/:team_id/agents - Add Agent

- **后端实现：**
  - [ ] Handler: `POST /api/teams/{team_id}/agents`
  - [ ] Validation: backend 必须 team-capable
  - [ ] Spawn: 创建新 ACP conversation
  - [ ] DB: 插入 agents 表
  - [ ] Response: 返回新 TeamAgent

- **前端调用：**
  - [ ] `ipcBridge.team.addAgent.invoke(params)` 工作

- **测试方法：**
  ```bash
  curl -X POST http://localhost:13400/api/teams/team-123/agents \
    -H 'Content-Type: application/json' \
    -d '{
      "name": "Assistant",
      "role": "teammate",
      "backend": "gemini",
      "model": "default"
    }'
  ```

---

#### ✓ DELETE /api/teams/:team_id/agents/:slot_id - Remove Agent

- **后端实现：**
  - [ ] Handler: `DELETE /api/teams/{team_id}/agents/{slot_id}`
  - [ ] Cleanup: 停止 agent 的 ACP conversation
  - [ ] DB: 从 agents 表删除行
  - [ ] Event: 广播 team.agent.removed WS 事件

- **测试方法：**
  ```bash
  curl -X DELETE http://localhost:13400/api/teams/team-123/agents/slot-456
  ```

---

#### ✓ PATCH /api/teams/:team_id/agents/:slot_id/name - Rename

- **后端实现：**
  - [ ] Handler: `PATCH /api/teams/{team_id}/agents/{slot_id}/name`
  - [ ] Update: 更新 agents 表的 agent_name
  - [ ] Event: 广播 team.agent.renamed WS 事件（old_name/new_name）
  - [ ] Response: 204 No Content

- **测试方法：**
  ```bash
  curl -X PATCH http://localhost:13400/api/teams/team-123/agents/slot-456/name \
    -H 'Content-Type: application/json' \
    -d '{"name": "New Name"}'
  ```

- **预期 WS 事件：**
  ```json
  {
    "name": "team.agent.renamed",
    "data": {
      "team_id": "team-123",
      "slot_id": "slot-456",
      "old_name": "Old",
      "new_name": "New Name"
    }
  }
  ```

---

### A3. Session 管理

#### ✓ POST /api/teams/:team_id/session - Ensure Session

**关键核心功能 - 详细验收步骤：**

- **后端实现：**
  - [ ] Handler: `POST /api/teams/{team_id}/session`
  - [ ] Idempotency: 已启动则直接返回
  - [ ] Validation: 所有 agents 的 backend 必须 team-capable
  - [ ] TCP Server Start:
    - [ ] 为每个 team 创建一个 TeamMcpServer 实例
    - [ ] 启动 TCP 监听（127.0.0.1:0，操作系统分配端口）
    - [ ] 广播 `team.mcp.status { phase: "tcp_ready", port }` WS 事件
  - [ ] MCP Injection:
    - [ ] 为每个 agent 构造 StdioMcpConfig（见协议文档 3.1）
    - [ ] 调用 `session/new { mcpServers: [...] }`
    - [ ] 广播 `team.mcp.status { phase: "session_injecting" }`
    - [ ] 广播 `team.mcp.status { phase: "session_ready" }`
  - [ ] Response: 204 No Content

- **前端调用：**
  - [ ] `ipcBridge.team.ensureSession.invoke({team_id})` 工作
  - [ ] 前端监听 WS 事件 `ipcBridge.team.mcpStatus.on(event => ...)`
  - [ ] UI 显示 phase 进度

- **TestAgent 集成点：**
  - [ ] Agent 启动时 stdio 脚本接收环境变量 (TEAM_MCP_PORT、TEAM_MCP_TOKEN、TEAM_AGENT_SLOT_ID)
  - [ ] stdio 脚本连接到 TCP 服务器
  - [ ] stdio 脚本发送 `mcp_ready` 消息
  - [ ] TeamMcpServer 接收 `mcp_ready`，调用 `notifyMcpReady(slot_id)`
  - [ ] MCP 工具列表加载完成
  - [ ] 广播 `team.mcp.status { phase: "mcp_tools_ready" }`

- **测试方法：**
  
  **步骤 1：启动 session**
  ```bash
  curl -X POST http://localhost:13400/api/teams/team-123/session
  # 期望：204 No Content
  ```
  
  **步骤 2：监听 WS 事件（前端 DevTools）**
  ```javascript
  ipcBridge.team.mcpStatus.on(event => {
    console.log(`MCP Phase: ${event.phase}`, event);
  });
  
  // 期望输出序列：
  // MCP Phase: tcp_ready { port: 54321, ... }
  // MCP Phase: session_injecting
  // MCP Phase: session_ready
  // MCP Phase: mcp_tools_waiting
  // MCP Phase: mcp_tools_ready
  ```
  
  **步骤 3：验证 agent 侧 stdio 连接**
  - 查看主进程日志，应包含：
    ```
    [TeamMcpServer] TCP connection received from 127.0.0.1:XXXXX
    [TeamMcpServer] MCP ready from slot slot-456
    ```

- **错误场景：**
  - [ ] Backend 不支持 team mode → 返回 400，error: "Agent type X is not team-capable"
  - [ ] Agent 启动失败 → 广播 `phase: "session_error"`
  - [ ] TCP 端口冲突 → 广播 `phase: "tcp_error"`

---

#### ✓ DELETE /api/teams/:team_id/session - Stop Session

- **后端实现：**
  - [ ] Handler: `DELETE /api/teams/{team_id}/session`
  - [ ] Stop: 停止所有 agents 的 conversation
  - [ ] TCP Stop: 关闭 TeamMcpServer TCP 监听
  - [ ] Response: 204 No Content

- **测试方法：**
  ```bash
  curl -X DELETE http://localhost:13400/api/teams/team-123/session
  ```

---

#### ✓ POST /api/teams/:team_id/session-mode - Set Mode

- **后端实现：**
  - [ ] Handler: `POST /api/teams/{team_id}/session-mode`
  - [ ] Update: 更新 teams 表的 session_mode 字段
  - [ ] Cascade: 新启动的 agents 继承该 mode

- **测试方法：**
  ```bash
  curl -X POST http://localhost:13400/api/teams/team-123/session-mode \
    -H 'Content-Type: application/json' \
    -d '{"session_mode": "plan"}'
  ```

---

#### ✓ POST /api/teams/:team_id/workspace - Update Workspace

- **后端实现：**
  - [ ] Handler: `POST /api/teams/{team_id}/workspace`
  - [ ] Update: 更新 teams 表的 workspace 字段
  - [ ] Broadcast: 所有 agents 获知新 workspace

- **测试方法：**
  ```bash
  curl -X POST http://localhost:13400/api/teams/team-123/workspace \
    -H 'Content-Type: application/json' \
    -d '{"workspace": "/path/to/new/workspace"}'
  ```

---

### A4. Messages

#### ✓ POST /api/teams/:team_id/messages - Broadcast

- **后端实现：**
  - [ ] Handler: `POST /api/teams/{team_id}/messages`
  - [ ] Write: 向所有 agents 的 mailbox 写入消息
  - [ ] Wake: 触发 wakeAgent() 唤醒所有 agents
  - [ ] Response: 204 No Content

- **测试方法：**
  ```bash
  curl -X POST http://localhost:13400/api/teams/team-123/messages \
    -H 'Content-Type: application/json' \
    -d '{"content": "Team meeting in 5 minutes"}'
  ```

---

#### ✓ POST /api/teams/:team_id/agents/:slot_id/messages - Direct Message

- **后端实现：**
  - [ ] Handler: `POST /api/teams/{team_id}/agents/{slot_id}/messages`
  - [ ] Write: 将消息写入目标 agent 的 mailbox
  - [ ] Wake: 触发 wakeAgent(slot_id)
  - [ ] Response: 204 No Content

- **测试方法：**
  ```bash
  curl -X POST http://localhost:13400/api/teams/team-123/agents/slot-456/messages \
    -H 'Content-Type: application/json' \
    -d '{"content": "Please review the proposal"}'
  ```

---

## B. WebSocket 事件验收

### B1. Agent 生命周期事件

#### ✓ team.agent.status

- **后端发送条件：**
  - [ ] Agent 状态从 pending → idle/active/completed/failed
  - [ ] Broadcast: 每次状态变化立即发送 WS 消息

- **前端接收：**
  - [ ] `ipcBridge.team.agentStatusChanged.on(event => ...)`
  - [ ] UI 更新 agent 状态显示

- **测试方法：**
  ```javascript
  // 前端 DevTools
  ipcBridge.team.agentStatusChanged.on(event => {
    console.log(`Agent ${event.slot_id} status: ${event.status}`);
  });
  
  // 后端：更新 agent 状态
  // (通过 team session 运行，观察日志中的 wakeAgent 调用)
  ```

- **预期 payload：**
  ```json
  {
    "team_id": "team-123",
    "slot_id": "slot-456",
    "status": "idle",
    "last_message": "Task completed"
  }
  ```

---

#### ✓ team.agent.spawned

- **后端发送条件：**
  - [ ] 通过 MCP 工具 `team_spawn_agent` 创建新 agent
  - [ ] Broadcast: 新 agent 就绪后立即发送

- **前端接收：**
  - [ ] `ipcBridge.team.agentSpawned.on(event => ...)`
  - [ ] UI 列表中添加新 agent

- **预期 payload：**
  ```json
  {
    "team_id": "team-123",
    "agent": {
      "slot_id": "slot-789",
      "conversation_id": "conv-789",
      "agent_name": "Researcher",
      "role": "teammate",
      "status": "pending"
    }
  }
  ```

---

#### ✓ team.agent.removed

- **后端发送条件：**
  - [ ] HTTP DELETE /api/teams/{team_id}/agents/{slot_id} 成功
  - [ ] Broadcast: agent 移除后立即发送

- **测试方法：**
  ```javascript
  ipcBridge.team.agentRemoved.on(event => {
    console.log(`Agent ${event.slot_id} removed from ${event.team_id}`);
  });
  ```

---

#### ✓ team.agent.renamed

- **后端发送条件：**
  - [ ] HTTP PATCH /api/teams/{team_id}/agents/{slot_id}/name 成功
  - [ ] Broadcast: agent 重命名后立即发送

- **预期 payload：**
  ```json
  {
    "team_id": "team-123",
    "slot_id": "slot-456",
    "old_name": "Assistant",
    "new_name": "Lead Researcher"
  }
  ```

---

### B2. Team 管理事件

#### ✓ team.list-changed

- **后端发送条件：**
  - [ ] Team 创建：action = "created"
  - [ ] Team 删除：action = "removed"
  - [ ] Agent 加入：action = "agent_added"
  - [ ] Agent 离开：action = "agent_removed"

- **前端用途：**
  - [ ] 更新 team 列表缓存
  - [ ] 触发 UI 重新渲染

---

### B3. MCP 管道事件

#### ✓ team.mcp.status

**最重要的诊断事件 - 完整验收：**

- **所有 phase 值必须发送：**
  - [ ] `"tcp_ready"` - TCP 服务器启动，port 字段有值
  - [ ] `"tcp_error"` - TCP 启动失败，error 字段有值
  - [ ] `"session_injecting"` - 正在调用 session/new
  - [ ] `"session_ready"` - session 建立成功
  - [ ] `"session_error"` - session 建立失败，error 字段有值
  - [ ] `"load_failed"` - MCP 工具加载失败
  - [ ] `"degraded"` - MCP 部分功能不可用
  - [ ] `"mcp_tools_waiting"` - 等待工具列表
  - [ ] `"mcp_tools_ready"` - 所有工具已加载

- **测试方法：**
  ```javascript
  // 前端 DevTools
  const phases = [];
  ipcBridge.team.mcpStatus.on(event => {
    phases.push(event.phase);
    console.log(`[${phases.length}] ${event.phase}${event.error ? ` - ERROR: ${event.error}` : ''}`);
  });
  
  ipcBridge.team.ensureSession.invoke({team_id: "team-123"});
  // 期望输出：
  // [1] tcp_ready - port: 54321
  // [2] session_injecting
  // [3] session_ready
  // [4] mcp_tools_waiting
  // [5] mcp_tools_ready
  ```

---

## C. MCP TCP 协议验收

### C1. 消息格式

#### ✓ Length-Prefixed JSON

- **验证方法：**
  - [ ] 编写 Node.js TCP 客户端直接连接 TeamMcpServer
  - [ ] 发送手工构造的 TCP 消息
  - [ ] 验证 4 字节 big-endian 长度前缀
  - [ ] 验证响应格式

- **测试脚本：**
  ```javascript
  const net = require('net');
  
  function writeTcpMessage(socket, data) {
    const body = Buffer.from(JSON.stringify(data), 'utf-8');
    const frame = Buffer.allocUnsafe(4 + body.length);
    frame.writeUInt32BE(body.length, 0);
    body.copy(frame, 4);
    socket.write(frame);
  }
  
  const socket = net.createConnection({port: 54321, host: '127.0.0.1'}, () => {
    writeTcpMessage(socket, {
      tool: 'team_members',
      args: {},
      auth_token: 'AUTH-TOKEN-HERE'
    });
  });
  
  socket.on('data', (data) => {
    const len = data.readUInt32BE(0);
    const body = data.subarray(4).toString('utf-8');
    console.log('Response:', JSON.parse(body));
    socket.end();
  });
  ```

---

### C2. 认证

#### ✓ Token Validation

- **验证方法：**
  - [ ] 发送错误的 auth_token → 立即断开连接
  - [ ] 不发送 auth_token → 立即断开连接
  - [ ] 使用正确的 token → 正常处理

- **测试步骤：**
  ```javascript
  // 测试 1：错误的 token
  writeTcpMessage(socket, {
    tool: 'team_members',
    args: {},
    auth_token: 'WRONG-TOKEN'
  });
  // 期望：{ error: 'Unauthorized' }，然后立即断开
  
  // 测试 2：正确的 token
  writeTcpMessage(socket, {
    tool: 'team_members',
    args: {},
    auth_token: 'CORRECT-TOKEN-FROM-ENV'
  });
  // 期望：{ result: '...' }
  ```

---

## D. MCP 工具调用验收

### D1. team_send_message

#### ✓ Direct Message

- **验证方法：**
  - [ ] Agent A 通过 MCP 调用 team_send_message
  - [ ] 消息写入 Agent B 的 mailbox
  - [ ] Agent B 读取 mailbox 时收到消息

- **测试流程：**
  1. 启动 team session（两个 agents）
  2. Agent A 调用 MCP 工具：
     ```json
     {
       "tool": "team_send_message",
       "args": {
         "to": "Agent B",
         "message": "Can you review this?"
       },
       "from_slot_id": "slot-A"
     }
     ```
  3. Agent B mailbox 应包含消息
  4. Response 应包含 "Message sent to Agent B's inbox"

---

#### ✓ Broadcast

- **验证方法：**
  - [ ] Agent A 使用 to: "*" 广播消息
  - [ ] 所有其他 agents 的 mailbox 都收到消息

---

#### ✓ Shutdown Protocol

- **验证方法：**
  - [ ] Agent 收到 shutdown_approved → 被 removeAgent 移除
  - [ ] Agent 收到 shutdown_rejected → leader 被通知

---

### D2. team_spawn_agent

#### ✓ Create Agent Runtime

- **验证方法：**
  - [ ] Leader 调用 team_spawn_agent
  - [ ] 新 agent 被创建、启动、加入 team
  - [ ] 前端收到 team.agent.spawned 事件
  - [ ] 新 agent 状态从 pending → idle

- **测试流程：**
  ```json
  {
    "tool": "team_spawn_agent",
    "args": {
      "name": "Code Reviewer",
      "agent_type": "claude",
      "model": "claude-3-sonnet"
    },
    "from_slot_id": "slot-leader"
  }
  ```

---

### D3. team_task_create / team_task_update / team_task_list

#### ✓ Task Board Operations

- **验证方法：**
  - [ ] team_task_create: 新任务出现在 team_task_list 的输出中
  - [ ] team_task_update: 状态、owner 更新反映在列表中
  - [ ] 任务依赖关系（blocked_by/blocks）被正确解析

- **测试流程：**
  ```json
  // 创建任务
  {
    "tool": "team_task_create",
    "args": {
      "subject": "Write documentation",
      "description": "API docs for team mode",
      "owner": "slot-456"
    }
  }
  
  // 列出任务
  {
    "tool": "team_task_list",
    "args": {}
  }
  
  // 更新任务
  {
    "tool": "team_task_update",
    "args": {
      "task_id": "task-123",
      "status": "in_progress"
    }
  }
  ```

---

### D4. team_members

#### ✓ Team Roster

- **验证方法：**
  - [ ] 返回所有 agents 的列表
  - [ ] 包含 name、role、status 信息

---

## E. stdio Bridge 验收

### E1. Environment Variables

#### ✓ Injection

- **验证方法：**
  - [ ] Agent 启动时 stdio 脚本接收正确的 env vars
  - [ ] TEAM_MCP_PORT 指向正确的 port
  - [ ] TEAM_MCP_TOKEN 是有效的 UUID
  - [ ] TEAM_AGENT_SLOT_ID 正确标识调用者

- **测试方法：**
  ```bash
  # 在 stdio 脚本中打印 env vars（调试用）
  console.error(`TEAM_MCP_PORT=${process.env.TEAM_MCP_PORT}`);
  console.error(`TEAM_MCP_TOKEN=${process.env.TEAM_MCP_TOKEN}`);
  console.error(`TEAM_AGENT_SLOT_ID=${process.env.TEAM_AGENT_SLOT_ID}`);
  ```

---

### E2. mcp_ready Signal

#### ✓ Readiness Notification

- **验证方法：**
  - [ ] stdio 脚本在启动时发送 mcp_ready TCP 消息
  - [ ] TeamMcpServer 接收到 mcp_ready 并调用 notifyMcpReady(slot_id)
  - [ ] 后续 MCP 工具列表加载完成

- **日志检查：**
  ```
  [TeamMcpServer] MCP ready from slot slot-456
  ```

---

## F. 字段映射验收

### F1. Agent Role Mapping

#### ✓ leader ↔ lead

- **验证方法：**
  - [ ] 前端发送 role: "leader"
  - [ ] 后端存储为 role: "lead"
  - [ ] 响应映射回 role: "leader"

- **测试代码位置：** `src/common/adapter/teamMapper.ts`
  ```typescript
  toBackendAgent({ role: 'leader' }) → { role: 'lead' }
  fromBackendAgent({ role: 'lead' }) → { role: 'leader' }
  ```

---

### F2. Backend Type Mapping

#### ✓ conversation_type ↔ backend

- **验证方法：**
  - [ ] 前端使用 conversation_type 字段（UI）
  - [ ] 后端使用 backend 字段（调用）
  - [ ] codex/acp 映射正确

---

## G. 错误处理验收

### G1. HTTP Error Responses

#### ✓ Error Code Mapping

- **验证方法：**
  - [ ] `BACKEND_NOT_TEAM_CAPABLE` - 创建 team 时使用不支持的 backend
  - [ ] `TEAM_NOT_FOUND` - GET/DELETE 不存在的 team
  - [ ] `AGENT_NOT_FOUND` - 操作不存在的 agent

- **测试方法：**
  ```bash
  # 测试不支持的 backend
  curl -X POST http://localhost:13400/api/teams \
    -d '{"agents": [{"backend": "unsupported"}]}'
  # 期望：400，code: "BACKEND_NOT_TEAM_CAPABLE"
  ```

---

### G2. MCP Tool Call Errors

#### ✓ Error Propagation

- **验证方法：**
  - [ ] team_send_message 目标不存在 → error message
  - [ ] team_spawn_agent 非 leader 调用 → permission error
  - [ ] 工具参数无效 → validation error

---

## H. 前后端分离验收

### H1. IPC → HTTP 迁移

#### ✓ Zero-Change Renderer

- **验证方法：**
  - [ ] renderer 代码无需修改，仍调用 ipcBridge.team.*
  - [ ] httpBridge 适配层自动处理 HTTP/WS 转换
  - [ ] 字段映射完全由 teamMapper 处理

---

### H2. Type Safety

#### ✓ TypeScript Strict Mode

- **验证方法：**
  - [ ] 编译不产生 any 类型错误
  - [ ] ipcBridge 类型定义与协议一致
  - [ ] 前端组件类型推导正确

- **命令：**
  ```bash
  bunx tsc --noEmit
  ```

---

## I. 集成测试场景

### I1. Complete Team Workflow

**端到端测试：创建 team → 启动 session → agents 通信 → 删除 team**

- **步骤 1：创建 team**
  ```javascript
  const team = await ipcBridge.team.create.invoke({
    name: "Integration Test Team",
    agents: [
      {agent_name: "Leader", role: "leader", agent_type: "gemini", conversation_type: "acp", status: "pending", model: "default"},
      {agent_name: "Teammate", role: "teammate", agent_type: "gemini", conversation_type: "acp", status: "pending", model: "default"}
    ]
  });
  console.log("Team created:", team.id);
  ```

- **步骤 2：启动 session**
  ```javascript
  let phases = [];
  ipcBridge.team.mcpStatus.on(event => phases.push(event.phase));
  await ipcBridge.team.ensureSession.invoke({team_id: team.id});
  console.log("Phases:", phases);
  // 期望：["tcp_ready", "session_injecting", "session_ready", "mcp_tools_waiting", "mcp_tools_ready"]
  ```

- **步骤 3：测试通信**
  - Leader 通过 MCP 发送消息给 Teammate
  - Teammate 读取 mailbox，收到消息
  - Teammate 回复消息

- **步骤 4：删除 team**
  ```javascript
  await ipcBridge.team.remove.invoke({id: team.id});
  console.log("Team deleted");
  ```

---

## J. 性能验收

### J1. Scalability

#### ✓ Large Message Handling

- **验证方法：**
  - [ ] 发送 10 MB 消息 → 正确处理
  - [ ] 发送 > 64 MB 消息 → 拒绝（错误）

- **测试脚本：**
  ```javascript
  const largeMessage = 'x'.repeat(10 * 1024 * 1024);
  await ipcBridge.team.sendMessageToAgent.invoke({
    team_id: team.id,
    slot_id: 'slot-456',
    content: largeMessage
  });
  ```

---

### J2. Connection Pool

#### ✓ TCP Reuse

- **验证方法：**
  - [ ] 连续发送 100 个 tool calls
  - [ ] 性能无明显退化
  - [ ] 内存占用稳定

---

## K. 检查清单汇总

| 类别 | 项目 | 状态 | 注释 |
|------|------|------|------|
| HTTP API | POST /api/teams | [ ] | |
| HTTP API | GET /api/teams | [ ] | |
| HTTP API | POST /teams/:id/agents | [ ] | |
| HTTP API | DELETE /teams/:id/agents/:sid | [ ] | |
| HTTP API | POST /teams/:id/session | [ ] | Core |
| HTTP API | DELETE /teams/:id/session | [ ] | |
| WS Events | team.agent.status | [ ] | |
| WS Events | team.agent.spawned | [ ] | |
| WS Events | team.agent.removed | [ ] | |
| WS Events | team.mcp.status | [ ] | Core |
| TCP | Auth Token | [ ] | |
| TCP | Message Format | [ ] | |
| MCP Tools | team_send_message | [ ] | |
| MCP Tools | team_spawn_agent | [ ] | |
| MCP Tools | team_task_* | [ ] | |
| Mapping | role: leader ↔ lead | [ ] | |
| Errors | HTTP error codes | [ ] | |
| Errors | MCP tool errors | [ ] | |
| Integration | End-to-end flow | [ ] | |
| Performance | Large messages | [ ] | |

---

**检查清单版本：** 1.0  
**最后更新：** 2026-04-28
