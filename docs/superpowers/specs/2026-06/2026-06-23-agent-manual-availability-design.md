# Agent 手动可用性检测设计

- 日期：2026-06-23
- 状态：方向已认可，待书面 spec 审阅
- 范围：AionCore + AionUi 当前 `feat/agent-connection-testing-phase2` 分支
- 修订对象：
  - [Agent 连接测试与可用性实施设计](/Users/zhoukai/Documents/github/AionUi/docs/superpowers/specs/2026-06/2026-06-15-agent-connection-testing-design.md)
  - [Agent 自助修复与检测状态语义设计](/Users/zhoukai/Documents/github/AionUi/docs/superpowers/specs/2026-06/2026-06-18-agent-self-repair-design.md)

## 1. 背景

当前分支的 AionCore 会启动一个后台 availability scheduler。它在启动延迟后进入循环，每 5 分钟遍历可用且支持新会话的 agent，并对每个 agent 做连接 probe。

对 ACP agent 来说，这个 probe 不是轻量检查。它会解析运行时、准备 managed tool，然后创建 ACP 子进程，执行初始化握手，再清理进程。即使用户从未使用这个 agent，后台循环也会周期性触发这些成本。

团队讨论后的结论是：这种自动循环检测太重，收益不足。Agent 的可用性应该变成用户显式触发或真实使用时更新的快照，而不是后台持续刷新的准实时状态。

本设计修订 2026-06-15 文档中的“后台低频周期 probe”方向：删除自动循环检测，不用更长 interval 或 feature flag 折中。

## 2. 现状调研结论

### 2.1 AionCore

当前重操作集中在 `aionui-ai-agent/src/services/availability/mod.rs`：

- `DEFAULT_SCHEDULED_INTERVAL = 300s`
- `start_background_scheduler()` 创建 tokio 后台任务
- `run_scheduled_probe_pass()` 遍历 agent，并对每个目标调用 `run_probe(... Scheduled)`
- `run_probe()` 对 builtin managed ACP 和 custom ACP 都会创建实际进程做初始化握手
- `persist_snapshot()` 写回 `agent_metadata.last_check_*`、`last_success_at`、`last_failure_at`

启动入口在 `aionui-app/src/router/state.rs`，当前会调用 `agent_service.start_background_scheduler()`。

手动检测已经存在：

- `POST /api/agents/{id}/health-check`
- `AgentService::health_check_agent_by_id()`
- `AgentAvailabilityService::run_manual_health_check()`

会话失败回写也已经存在：

- conversation turn orchestrator 在 ACP 会话失败时调用 availability feedback
- `record_session_failure()` 写入 `offline + session` 快照

但当前没有对称的会话成功回写。真实会话成功后，系统不会把 agent 乐观更新为可用。

### 2.2 AionUi

AionUi 已经有手动检测入口：

- `LocalAgents.tsx` 的 Test Connection 调用 `ipcBridge.acpConversation.checkManagedAgentHealthById`
- 手动检测结束后刷新 managed agents 和 assistants 缓存

业务使用侧没有强依赖循环检测：

- Guid 发送按钮没有因为 `agent_status !== online` 而禁用
- Assistant 设置页主要用状态做提示，不删除配置
- LocalAgents 中 `offline + auth_required` 会展示成 `needs_auth`，但后端状态模型仍是 `online | offline | missing`

需要注意的历史遗留：部分测试和 e2e helper 仍使用旧的 `available` 字符串。当前类型已经是 `online | offline | missing`，后续实现时应一并清理。

### 2.3 状态推导

AionCore registry 的 management status 目前按以下逻辑推导：

- 命令不可解析：`missing`
- 最近一次连接快照是 `offline`：`offline`
- 其它情况：`online`

这意味着删除 scheduler 后，系统不会因为“没有自动检测”就让所有 agent 变成不可用。只要本地命令存在，且没有最近一次失败快照，状态仍会按乐观方式显示为 online。

这符合新的产品语义：状态是“最近一次已知结果 + 命令存在性”的快照，不是后台实时在线判断。

## 3. 目标

- 不再有任何后台定时 ACP probe。
- 不再在应用启动后自动创建 ACP 进程做可用性巡检。
- 保留用户手动 Test Connection，用户点击时可以创建 ACP 进程检测。
- 保留真实会话失败回写，将失败结果写为 `offline + session`。
- 新增真实会话成功回写，将成功结果写为 `online + session`。
- 保留 `agent_metadata.last_check_*` 字段，但把它们定义为“最近一次手动检测或真实会话反馈快照”。
- 保持 assistant 目录和会话入口的乐观可用策略，不因为缺少后台检查而阻断用户使用。

## 4. 非目标

- 不引入实时在线状态。
- 不新增 `unknown` 主状态。
- 不清空历史 `last_check_*` 字段。
- 不新增 migration 删除字段或枚举值。
- 不把手动检测升级成真正发 prompt 的鉴权检测。
- 不用 feature flag、配置项或更长 interval 保留原循环。

## 5. 后端设计

### 5.1 删除 scheduler 启动链路

删除或改为无操作的内容：

- `AgentService::start_background_scheduler()`
- `AgentAvailabilityService::start_background_scheduler()`
- `AgentAvailabilityService::run_scheduled_probe_pass()`
- `AgentAvailabilityService` 内仅为 scheduler 服务的字段：
  - `scheduler_started`
  - `startup_delay`
  - `scheduled_interval`
- `router/state.rs` 中启动 scheduler 的调用

实现结果必须满足：应用启动、刷新 agent catalog、打开设置页都不会隐式创建 ACP 进程。

`AgentSnapshotCheckKind::Scheduled` 不删除。已有数据库行可能保存了这个 kind，API 类型也可能被前端或旧数据引用。实现只需要保证新逻辑不再写入 `scheduled`。

### 5.2 保留手动检测

手动检测继续沿用当前端点和行为：

```text
POST /api/agents/{id}/health-check
```

语义：

- 只有用户点击 Test Connection 时触发。
- 允许创建 ACP 进程做初始化握手。
- 检测结果写入 `last_check_*`。
- 一般情况下，成功写 `online + manual`，失败写 `offline + manual`。
- 如果当前快照是 session 产生的 `auth_required` / `needs_auth`，且手动检测只验证到 handshake 成功，则按 2026-06-18 状态语义保留鉴权诊断；只有真实会话成功才能证明鉴权已恢复。
- 返回最新 `AgentManagementRow`，前端刷新 managed agents 和 assistants 缓存。

### 5.3 增加会话成功反馈

当前只有失败反馈。删除 scheduler 后，成功路径也需要更新最近已知状态，否则用户手动修复后直接发起对话成功，UI 仍可能停留在旧的 offline 快照。

新增能力：

- availability feedback 增加 `record_session_success(agent_id)`
- `AgentAvailabilityService` 写入一条 `online + session` 快照
- 清理 `last_check_error_code`、`last_check_error_message`、`last_check_guidance`
- 更新 `last_check_at` 和 `last_success_at`
- 不覆盖 `last_failure_at`，保留历史诊断价值

会话成功反馈不能额外 probe，也不能额外创建进程。它只利用“真实会话已经成功”这个事实更新快照。

调用时机：

- 只在 ACP agent 的真实会话 turn 成功完成后调用。
- 使用现有 `availability_agent_id()` 提取 agent id。
- feedback 写入失败只记录日志，不影响用户会话结果。

### 5.4 保留会话失败反馈

现有 `record_session_failure()` 保留：

- ACP 会话创建或发送失败后写 `offline + session`
- 保存错误码、错误消息和 guidance
- 更新 `last_check_at` 和 `last_failure_at`

如果已有 `auth_required` 到 `needs_auth` 的映射逻辑，继续保持。删除 scheduler 后，不再有后台 handshake 把 session 级鉴权失败覆盖掉；用户可以通过真实会话成功把状态改回 online。

### 5.5 保持 registry 乐观推导

management status 推导规则保持当前方向：

- `meta.available = false`：`missing`
- `last_check_status = offline`：`offline`
- 其它情况：`online`

删除 scheduler 后不能把“没有检查过”解释为不可用。否则新安装或首次启动的 agent 会在用户还没操作前被错误压成不可用。

`refresh_availability()` 仍可以保留命令解析、路径存在性等轻量 hydrate；它不能创建 ACP 进程。

## 6. 前端设计

### 6.1 LocalAgents

LocalAgents 保留当前手动 Test Connection 入口：

- 点击按钮调用 `checkManagedAgentHealthById`
- 检测期间只禁用当前 agent 的按钮
- 检测结束刷新 managed agent catalog 和 assistant 缓存

如果页面文案暗示“实时在线”或“自动检测”，需要改为“最近一次检测结果”或“最近一次使用结果”。所有新增或修改的用户可见文本必须走 i18n。

### 6.2 Assistant 与 Guid

Assistant 列表和 Guid 会话入口保持乐观策略：

- 状态不是 online 时可以给提示。
- 不因为最近一次 offline 快照永久阻断用户选择或发送。
- 真正的错误仍由创建会话或发送消息时返回。

这样用户在修复外部环境后，可以直接尝试对话；如果成功，会话成功反馈会把状态更新为 online。

### 6.3 测试数据清理

实现时同步修正旧测试数据：

- `agent_status: 'available'` 改为 `agent_status: 'online'`
- e2e helper 的 `requireAvailable` 过滤条件改为 `online`

这属于状态枚举统一，不改变产品行为。

## 7. 数据与兼容性

不需要数据库 migration。

`agent_metadata.last_check_*` 字段继续保留，语义调整为：

- 最近一次手动检测结果
- 或最近一次真实会话反馈结果
- 或历史版本留下的旧 scheduled 结果

旧的 `last_check_kind = scheduled` 行继续可读。用户点击 Test Connection 或真实会话成功/失败后，会被新的 `manual` 或 `session` 快照自然覆盖。

不在启动时批量清空旧状态。清空会丢失用户最近一次失败诊断，而且会把数据迁移复杂度转嫁给一个不必要的问题。

## 8. 测试策略

### 8.1 AionCore

需要覆盖：

- 应用状态构建不再调用 scheduler。
- AgentService 不再暴露或不再实际启动 background scheduler。
- 手动 health check 仍会写 `online/offline + manual` 快照。
- 不存在 scheduled probe pass 写入新快照的路径。
- 会话成功调用 `record_session_success()` 后写 `online + session`，并清理错误字段。
- 会话失败仍写 `offline + session`。
- registry 在没有 last_check 快照但命令存在时仍推导为 online。
- `last_check_kind = scheduled` 的历史行仍能正常投影。

### 8.2 AionUi

需要覆盖：

- LocalAgents 点击 Test Connection 仍调用 health-check endpoint。
- health check 完成后刷新 managed agents 和 assistants 缓存。
- AgentCard 展示的是最近一次检测/使用结果，不表达实时巡检。
- stale 的 `available` 测试数据被统一为 `online`。
- Guid/Assistant 不因为非 online 状态产生新的硬阻断。

## 9. 风险与取舍

### 9.1 旧 offline 快照可能停留更久

删除 scheduler 后，旧的 offline 状态不会被后台自动翻回 online。

接受这个取舍。用户可以点击 Test Connection 手动重测，也可以直接发起真实会话；如果会话成功，新增的 session success feedback 会更新状态。

### 9.2 online 仍是乐观状态

没有后台 probe 后，online 可能只代表“命令存在，且没有最近失败快照”。它不保证 agent 此刻一定能完成任务。

这是设计目标，不是缺陷。系统不再消耗后台资源追求准实时判断，而是在用户显式检测或真实使用时更新状态。

### 9.3 手动检测仍然可能很重

Test Connection 仍会创建 ACP 进程。

这符合用户预期：检测是显式操作，成本由用户动作触发，不再由后台循环隐式触发。

## 10. 被拒绝的替代方案

### 10.1 拉长 interval

例如从 5 分钟改成 30 分钟或 1 小时。

拒绝原因：它仍然会在用户没有使用 agent 时创建进程，只是降低频率，没有解决设计问题。

### 10.2 Feature flag 保留 scheduler

拒绝原因：会让同一套状态语义在不同配置下产生两种行为，增加测试和用户理解成本。

### 10.3 新增 unknown 状态

拒绝原因：当前系统已有乐观推导，新增 unknown 会扩散到 assistant、team、guid 等消费面，并不能减少后台成本。

### 10.4 启动时清空 last_check 字段

拒绝原因：历史诊断信息有价值，而且旧 scheduled 快照可以被下一次 manual/session 自然覆盖。

## 11. 实施顺序建议

1. 先改 AionCore：删除 scheduler 启动链路，保留 manual check。
2. 增加 session success feedback，并补后端测试。
3. 再改 AionUi：校正文案和 stale 测试数据。
4. 最后做端到端验证：启动应用不创建 ACP probe，手动检测会创建，真实会话成功/失败会更新状态。
