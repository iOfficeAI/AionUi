# Team MCP 回归测试 & 验证清单

**基于 TEAM_MCP_PRD.md**

---

## 1. Team 生命周期验证

### 1.1 Team 创建

- [ ] **前端**: Team Create Modal 弹出
  - [ ] 输入 team name → 验证非空提示
  - [ ] 选择 leader agent → 过滤展示 team-capable 的 agent
  - [ ] 选择 workspace 文件夹
  - [ ] 点击 Create → 调用 `ipcBridge.team.create`

- [ ] **后端**: Team 创建成功
  - [ ] HTTP POST `/api/teams` 返回 200 + TTeam 对象
  - [ ] SQLite `teams` 表插入新记录
  - [ ] `agents` JSON 列序列化正确
  - [ ] 返回的 team 包含 `id`, `leader_agent_id`, `agents[]`, `created_at`

- [ ] **IPC 事件**: WebSocket 事件广播
  - [ ] 订阅 `team.list-changed` 收到创建事件（action='created'）
  - [ ] 前端 `useTeamList()` 自动刷新列表

### 1.2 Team 获取

- [ ] **前端**: Team 列表页加载
  - [ ] 调用 `ipcBridge.team.list({ user_id })`
  - [ ] SWR 缓存 key: `teams/{user_id}`

- [ ] **后端**: 返回列表
  - [ ] HTTP GET `/api/teams?user_id=...` 返回 TTeam[]
  - [ ] 只返回该用户的 team

- [ ] **前端**: Team 详情页加载
  - [ ] 点击某个 team 进入详情页
  - [ ] 调用 `ipcBridge.team.get({ id })`
  - [ ] 后端返回 TTeam | null

### 1.3 Team 删除

- [ ] **前端**: 删除按钮触发
  - [ ] 显示确认对话框
  - [ ] 调用 `ipcBridge.team.remove({ id })`
  - [ ] 清除 localStorage: `team-active-slot-{id}`

- [ ] **后端**: 删除成功
  - [ ] HTTP DELETE `/api/teams/{id}` 返回 200
  - [ ] SQLite `teams` 表删除对应记录
  - [ ] 关联的 mailbox 和 tasks 记录也应清理

- [ ] **IPC 事件**: 刷新前端
  - [ ] 发送 `team.list-changed` 事件
  - [ ] 前端列表自动移除

---

## 2. MCP 注入链路验证

### 2.1 TCP Server 启动

- [ ] **后端**: TeamSession 创建
  - [ ] `TeamSession.constructor()` 初始化 Mailbox, TaskManager, TeammateManager
  - [ ] `TeamMcpServer` 实例创建

- [ ] **后端**: MCP Server 启动
  - [ ] 前端调用 `ipcBridge.team.ensureSession({ team_id })`
  - [ ] 后端调用 `startMcpServer()`
  - [ ] TCP server 在 localhost:random 启动

- [ ] **IPC 事件**: TCP 就绪通知
  - [ ] 发送 `team.mcp.status` 事件 (phase='tcp_ready', port)
  - [ ] 前端订阅并显示端口信息（debug）

### 2.2 MCP 配置注入

- [ ] **后端**: 生成 stdio 配置
  - [ ] `getStdioConfig(agentSlotId)` 返回：
    ```json
    {
      "name": "aionui-team-{team_id}",
      "command": "node",
      "args": ["path/to/team-mcp-stdio.js"],
      "env": [
        {"name": "TEAM_MCP_PORT", "value": "{port}"},
        {"name": "TEAM_MCP_TOKEN", "value": "{token}"},
        {"name": "TEAM_AGENT_SLOT_ID", "value": "{slot_id}"}
      ]
    }
    ```

- [ ] **后端**: 注入到 ACP session
  - [ ] 创建 agent conversation 时，session/new 请求包含上述 mcpServers 配置
  - [ ] Token 为一次性随机 UUID

### 2.3 stdio Bridge 连接

- [ ] **Agent**: stdio 脚本启动
  - [ ] 读环境变量：TEAM_MCP_PORT, TEAM_MCP_TOKEN, TEAM_AGENT_SLOT_ID
  - [ ] 连接到 localhost:{TEAM_MCP_PORT}
  - [ ] 验证 auth token

- [ ] **TCP Server**: 接收连接
  - [ ] Socket 建立
  - [ ] 读取请求验证 auth_token
  - [ ] 拒绝无效 token 的连接

- [ ] **Agent**: 发送 mcp_ready 通知
  - [ ] stdio 脚本：`{ type: 'mcp_ready', from_slot_id: ... }`
  - [ ] TCP server 接收 → 调用 `notifyMcpReady(slot_id)`

### 2.4 MCP 就绪同步

- [ ] **后端**: 等待 MCP 就绪
  - [ ] `waitForMcpReady(slot_id)` 注册等待
  - [ ] 30 秒超时
  - [ ] stdio 脚本发送 mcp_ready 后解除等待

- [ ] **MCP 状态流转**:
  - [ ] `tcp_ready` → TCP server 启动
  - [ ] `mcp_tools_waiting` → 等待 stdio 连接
  - [ ] `mcp_tools_ready` → stdio 发送 mcp_ready

---

## 3. 成员通信验证

### 3.1 群聊（User → Leader）

- [ ] **前端**: 用户发送消息
  - [ ] Team 页面显示聊天框
  - [ ] 输入消息 → 点击发送
  - [ ] 调用 `ipcBridge.team.sendMessage({ team_id, content })`

- [ ] **HTTP**: 消息上传
  - [ ] POST `/api/teams/{team_id}/messages`
  - [ ] Body: `{ content: string; files?: string[] }`

- [ ] **后端**: 消息处理
  - [ ] `TeamSession.sendMessage()` 执行：
    - [ ] 确保 MCP server 已启动
    - [ ] 获取 leader slot_id
    - [ ] 写入 mailbox: `{ from_agent_id: 'user', to_agent_id: leader }`
    - [ ] 添加用户气泡到 leader 的 conversation
    - [ ] 发送 WebSocket 事件：`message.stream` (type='user_content')
    - [ ] 调用 `wake(leader_slot_id)` 唤醒 leader

- [ ] **前端**: 消息展示
  - [ ] 聊天区域显示用户气泡（右对齐）
  - [ ] 订阅 `conversation.responseStream` 事件更新

### 3.2 单聊（Agent → Agent）

- [ ] **Agent**: 调用 MCP 工具
  - [ ] 通过 stdio MCP bridge 调用 `team_send_message`
  - [ ] 参数: `{ to: 'agent_name', message: '...' }`

- [ ] **TCP Server**: 处理工具调用
  - [ ] 接收 TCP 请求（验证 auth_token）
  - [ ] 调用 `handleToolCall('team_send_message', args, fromSlotId)`
  - [ ] 调用 `resolveSlotId(to)` 模糊匹配目标 agent

- [ ] **后端**: 消息路由
  - [ ] `mailbox.write()` 写入消息
  - [ ] 调用 `safeWake(target_slot_id)` 唤醒目标
  - [ ] 返回成功响应给 agent

- [ ] **对端 Agent**: 收到消息
  - [ ] 下次 wake 时调用 `mailbox.readUnread()` 读取消息
  - [ ] 消息标记为已读

### 3.3 广播（Agent → All）

- [ ] **Agent**: 广播消息
  - [ ] 调用 `team_send_message` 参数: `{ to: '*', message: '...' }`

- [ ] **TCP Server**: 广播处理
  - [ ] 遍历所有 teammate（排除 sender）
  - [ ] 为每个 teammate 写入 mailbox
  - [ ] 并发 wake 所有 teammate

- [ ] **前端**: 多个 agent 更新
  - [ ] 如果有多个 tab 打开，各自收到更新事件
  - [ ] 聊天记录正确显示消息

### 3.4 Shutdown 流程

- [ ] **Agent**: 请求 shutdown
  - [ ] 调用 MCP 工具: `team_shutdown_agent({ slot_id })`

- [ ] **TCP Server**: 处理 shutdown 请求
  - [ ] 向 leader 发送 idle_notification
  - [ ] Leader 收到并决定是否同意

- [ ] **Leader**: 响应 shutdown
  - [ ] 调用 `team_send_message` 返回 "shutdown_approved" 或 "shutdown_rejected:reason"

- [ ] **TCP Server**: 处理 response
  - [ ] 若 "shutdown_approved"：调用 `removeAgent(slot_id)`
  - [ ] 发送 WebSocket 事件：`team.agent.removed`
  - [ ] 若 "shutdown_rejected"：记录拒绝原因

---

## 4. Agent 生命周期验证

### 4.1 Agent 添加

- [ ] **前端**: 添加按钮
  - [ ] Team 页面显示 "+ Add Agent" 按钮
  - [ ] 弹出选择器（过滤 team-capable）
  - [ ] 选择后调用 `ipcBridge.team.addAgent({ team_id, agent })`

- [ ] **HTTP**: 添加请求
  - [ ] POST `/api/teams/{team_id}/agents`
  - [ ] Body: `{ agent: Omit<TeamAgent, 'slot_id'> }`

- [ ] **后端**: Agent 添加
  - [ ] `TeammateManager.addAgent(agent)`
  - [ ] 新 agent 加入内存列表
  - [ ] 发送 WebSocket 事件：`team.agent.spawned`

- [ ] **前端**: UI 更新
  - [ ] 订阅 `team.agent.spawned`
  - [ ] Team tab 列表新增一个 tab
  - [ ] 显示新 agent 的 name 和 status badge

### 4.2 Agent 重命名

- [ ] **前端**: 重命名按钮
  - [ ] 右键点击 agent tab → "Rename"
  - [ ] 输入框获焦，输入新名字
  - [ ] 调用 `ipcBridge.team.renameAgent({ team_id, slot_id, new_name })`

- [ ] **HTTP**: 重命名请求
  - [ ] PATCH `/api/teams/{team_id}/agents/{slot_id}/name`
  - [ ] Body: `{ name: string }`

- [ ] **后端**: 重命名处理
  - [ ] `TeammateManager.renameAgent(slot_id, new_name)`
  - [ ] 持久化到数据库
  - [ ] 发送 WebSocket 事件：`team.agent.renamed`

- [ ] **前端**: UI 更新
  - [ ] 订阅 `team.agent.renamed`
  - [ ] Tab 标题实时更新
  - [ ] 聊天区域显示新名字

### 4.3 Agent 移除

- [ ] **前端**: 移除按钮
  - [ ] 右键点击 agent tab → "Remove"
  - [ ] 显示确认对话框
  - [ ] 调用 `ipcBridge.team.removeAgent({ team_id, slot_id })`

- [ ] **HTTP**: 删除请求
  - [ ] DELETE `/api/teams/{team_id}/agents/{slot_id}`

- [ ] **后端**: Agent 移除
  - [ ] `TeammateManager.removeAgent(slot_id)`
  - [ ] 从内存列表移除
  - [ ] 持久化到数据库
  - [ ] 发送 WebSocket 事件：`team.agent.removed`

- [ ] **前端**: UI 更新
  - [ ] 订阅 `team.agent.removed`
  - [ ] 对应 tab 消失
  - [ ] 自动切换到其他 tab

### 4.4 Agent 状态转换

- [ ] **后端**: 状态流转
  - [ ] 初始状态：pending
  - [ ] 第一次 wake：pending → idle
  - [ ] 接收消息开始处理：idle → active
  - [ ] 处理完成：active → idle
  - [ ] 异常：任意 → failed

- [ ] **IPC 事件**: 状态通知
  - [ ] 每次状态变化发送 `team.agent.status` 事件
  - [ ] 包含 `status` 和可选的 `last_message`

- [ ] **前端**: Status Badge 显示
  - [ ] idle → 灰色
  - [ ] active → 蓝色动画（加载中）
  - [ ] failed → 红色
  - [ ] completed → 绿色

- [ ] **前端**: Status Map 维护
  - [ ] `useTeamSession()` 维护 statusMap
  - [ ] 订阅 `team.agent.status` 更新
  - [ ] UI 组件读取 statusMap 展示

---

## 5. 前端 UI 流程验证

### 5.1 Team 列表页

- [ ] **初始加载**
  - [ ] 页面显示 "Teams" 列表
  - [ ] 调用 `useTeamList()` 加载数据
  - [ ] SWR 缓存正常工作

- [ ] **创建按钮**
  - [ ] 点击 "+ New Team" 弹出 Modal
  - [ ] Modal 关闭后刷新列表

- [ ] **Team 卡片**
  - [ ] 显示 team name, agent 数量, 创建时间
  - [ ] 点击卡片进入详情页
  - [ ] 右键菜单：Rename / Delete

### 5.2 Team 详情页

- [ ] **顶部信息栏**
  - [ ] 显示 team name
  - [ ] 显示 MCP status badge（如果可用）
  - [ ] 显示 agent 总数

- [ ] **左侧 Agent Tabs**
  - [ ] 每个 agent 一个 tab
  - [ ] Tab 标题：agent name + status badge
  - [ ] 点击 tab 切换活跃 agent
  - [ ] 右键菜单：Rename / Remove

- [ ] **中央聊天区**
  - [ ] 显示活跃 agent 的聊天历史
  - [ ] 发送框支持文本 + 文件
  - [ ] 消息发送时路由到 `team.sendMessage`

- [ ] **平台兼容性**
  - [ ] ACP agent → 使用 AcpChat 组件
  - [ ] Aionrs agent → 使用 AionrsTeamChat 组件
  - [ ] 其他类型 → 使用对应平台组件

### 5.3 消息流展示

- [ ] **用户气泡**
  - [ ] 右对齐，浅蓝色背景
  - [ ] 显示消息内容

- [ ] **Agent 气泡**
  - [ ] 左对齐，浅灰色背景
  - [ ] 显示 agent name（可能来自 payload）
  - [ ] 支持流式接收（逐字显示）

- [ ] **系统消息**
  - [ ] 如 "Agent A 加入"、"Agent B 移除"
  - [ ] 居中灰色显示

### 5.4 Model Selector

- [ ] **ACP Agent**
  - [ ] Header 显示 model dropdown
  - [ ] 选择后调用 `conversation.update()`
  - [ ] 变更下一条消息生效

- [ ] **Aionrs Agent**
  - [ ] Compact model selector 组件
  - [ ] 选择后调用 `conversation.update()`

---

## 6. WebSocket 事件验证

### 6.1 事件订阅

- [ ] **前端连接**
  - [ ] WebSocket 连接建立（后端转发）
  - [ ] 订阅 `team.*` 事件

- [ ] **事件监听**
  - [ ] `team.agent.status` 实时收到状态更新
  - [ ] `team.agent.spawned` 收到新 agent 通知
  - [ ] `team.agent.removed` 收到移除通知
  - [ ] `team.agent.renamed` 收到重命名通知
  - [ ] `team.list-changed` 收到列表变更
  - [ ] `team.mcp.status` 收到 MCP 状态更新

### 6.2 事件处理

- [ ] **useTeamSession**
  - [ ] 订阅 4 个 agent 事件
  - [ ] 更新内存 statusMap
  - [ ] 调用 `mutateTeam()` 刷新 server 数据

- [ ] **useTeamList**
  - [ ] 订阅 `team.list-changed`
  - [ ] 调用 `mutate()` 刷新列表

---

## 7. 数据持久化验证

### 7.1 SQLite 表操作

- [ ] **teams 表**
  - [ ] 创建、读取、更新、删除 team 记录
  - [ ] agents 列正确序列化/反序列化 JSON
  - [ ] session_mode 字段可选

- [ ] **mailbox 表**
  - [ ] 消息正确写入
  - [ ] from/to 字段映射正确
  - [ ] read 标志原子更新
  - [ ] 历史查询正确排序

- [ ] **tasks 表**
  - [ ] 任务正确创建
  - [ ] blocked_by / blocks JSON 数组序列化
  - [ ] status 转换正确

### 7.2 数据一致性

- [ ] **主键唯一性**
  - [ ] team id 唯一
  - [ ] message id 唯一
  - [ ] task id 唯一

- [ ] **外键引用**
  - [ ] team_id 引用 teams.id
  - [ ] to_agent_id / from_agent_id 引用有效 slot_id

- [ ] **并发写入**
  - [ ] 多个 agent 并发发消息不冲突
  - [ ] Task 更新不丢失

---

## 8. MCP 工具验证

### 8.1 工具调用格式

- [ ] **team_send_message**
  - [ ] 参数: `{ to: string, message: string, summary?: string }`
  - [ ] 单播、广播、错误处理

- [ ] **team_spawn_agent**
  - [ ] 参数: `{ agent_type, agent_name, ... }`
  - [ ] 返回完整 TeamAgent 对象
  - [ ] 权限检查（仅 leader）

- [ ] **team_task_create**
  - [ ] 参数: `{ subject, description?, metadata? }`
  - [ ] 返回 TeamTask 对象

- [ ] **team_task_update**
  - [ ] 参数: `{ id, status?, owner?, blocked_by?, blocks?, metadata? }`
  - [ ] 支持部分更新

- [ ] **team_task_list**
  - [ ] 无参数
  - [ ] 返回当前 team 所有 task

- [ ] **team_members**
  - [ ] 无参数
  - [ ] 返回当前 team 所有 agent

- [ ] **team_rename_agent**
  - [ ] 参数: `{ slot_id, new_name }`
  - [ ] 返回确认消息

- [ ] **team_shutdown_agent**
  - [ ] 参数: `{ slot_id }`
  - [ ] 向 leader 发送 shutdown request

- [ ] **team_describe_assistant**
  - [ ] 参数: `{ assistant_id }`
  - [ ] 返回 assistant 描述

- [ ] **team_list_models**
  - [ ] 参数: `{ backend }`
  - [ ] 返回模型列表

---

## 9. 错误处理 & 边界条件

### 9.1 网络错误

- [ ] HTTP 超时
  - [ ] 显示错误提示
  - [ ] 支持重试

- [ ] WebSocket 断连
  - [ ] 自动重连
  - [ ] 消息缓冲

### 9.2 业务错误

- [ ] Agent 不存在
  - [ ] team_send_message 返回错误

- [ ] 权限不足
  - [ ] 非 leader 调用 team_spawn_agent 被拒

- [ ] Mailbox 满
  - [ ] 可能需要 garbage collection

### 9.3 并发场景

- [ ] 多个 agent 同时发送消息
  - [ ] 消息顺序正确

- [ ] Agent 加入同时发送消息
  - [ ] 新 agent 收到之后的消息

- [ ] Team 删除中接收消息
  - [ ] 优雅降级或拒绝

---

## 10. 性能 & 可观测性

### 10.1 性能基准

- [ ] **Message 延迟**: 用户 → leader 感知延迟 < 1s
- [ ] **Team 列表加载**: 50 个 team < 500ms
- [ ] **MCP TCP 连接建立**: < 500ms
- [ ] **Agent 唤醒**: < 2s（含 IPC + API）

### 10.2 监控指标

- [ ] **日志**: Team 操作日志清晰
- [ ] **MCP 状态**: TCP server 状态可观测
- [ ] **Mailbox 大小**: 监控表行数增长

### 10.3 调试工具

- [ ] Chrome DevTools 中可查看 WebSocket 消息
- [ ] Electron DevTools 可查看 IPC 调用
- [ ] 后端日志可追踪 MCP 连接

---

## 11. 文档 & 示例

### 11.1 代码文档

- [ ] 所有公共 API 有 JSDoc
- [ ] TeamSession / TeammateManager 有流程注释
- [ ] MCP 工具定义清晰

### 11.2 示例代码

- [ ] React hook 使用示例
- [ ] MCP 工具调用示例
- [ ] 消息发送示例

---

## 12. 回归测试检查表

### 完成标记

| 类别 | 检查项数 | 完成数 | 备注 |
|------|---------|--------|------|
| Team 生命周期 | 12 | __ / 12 | |
| MCP 注入链路 | 11 | __ / 11 | |
| 成员通信 | 13 | __ / 13 | |
| Agent 生命周期 | 13 | __ / 13 | |
| 前端 UI | 15 | __ / 15 | |
| WebSocket 事件 | 8 | __ / 8 | |
| 数据持久化 | 10 | __ / 10 | |
| MCP 工具 | 10 | __ / 10 | |
| 错误处理 | 9 | __ / 9 | |
| 性能 & 可观测性 | 8 | __ / 8 | |
| **总计** | **109** | **__ / 109** | **达成率: _%** |

---

## 已知问题 & 注意事项

1. **MCP Readiness 30 秒超时** — 如果 agent 启动慢，可能超时退化。监控超时情况。

2. **Mailbox 表无索引** — 大量消息时查询性能下降，建议在 `team_id + to_agent_id` 建立索引。

3. **并发唤醒** — `activeWakes` Set 用于防重，但在极端场景下可能漏唤醒。

4. **Workspace 隔离** — 当前 `isolated` 模式为未来预留，实际实现可能需要反序列化或 chroot。

5. **Agent 过多** — 目前无分页，UI 可能变慢。200+ agent 时考虑虚拟滚动。

---

## 测试优先级

### P0 (关键)
- [ ] Team 创建 + 删除
- [ ] 用户群聊 (user → leader)
- [ ] MCP TCP 连接建立
- [ ] Agent 加入 + 移除

### P1 (重要)
- [ ] Agent 间单聊
- [ ] Agent 广播
- [ ] WebSocket 事件流
- [ ] 状态转换

### P2 (普通)
- [ ] 错误恢复
- [ ] 性能指标
- [ ] 并发场景

---

**清单创建日期**: 2026-04-28  
**预计完成**: 2 周  
**所有权**: Team Lead + QA
