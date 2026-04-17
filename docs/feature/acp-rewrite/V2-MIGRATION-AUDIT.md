# AcpAgent V1 → AcpAgentV2 迁移审计报告

> 基于 `refactor/acp-migration-phase2` 分支审计
> 日期: 2026-04-17

## 修复进度

| 级别          | 总数 | 已修复 | 状态                       |
| ------------- | ---- | ------ | -------------------------- |
| P0 — 功能断裂 | 4    | 4      | Done                       |
| P1 — 功能缺失 | 4    | 4      | Done                       |
| P2 — 行为差异 | 4    | 4      | Done                       |
| P3 — 低优先级 | 7    | 6      | 1 deferred (won't fix #13) |

---

## P0 — 功能断裂（已全部修复）

### 1. `enableYoloMode()` 写死 `bypassPermissions`

**问题：** 非 Claude 后端的 cron job YOLO 模式发错误的 mode string。

**修复：** `AcpAgentV2.enableYoloMode()` 改为 `getFullAutoMode(this.agentConfig.agentBackend)`，复用 `src/common/types/agentModes.ts` 的映射表。

---

### 2. `start` 事件走 `onSignalEvent` 导致 `request_trace` 丢失

**问题：** `AcpAgentManager.handleStreamEvent` 检查 `message.type === 'start'` 发 `request_trace`，但 V2 的 `start` 走 signal 通道不走 stream 通道。

**修复：** `AcpAgentV2.sendMessage()` 中 `onSignalEvent` → `onStreamEvent`。V1 的 `start` 也是走 stream 的，`handleSignalEvent` 不处理 `start`。

---

### 3. Pending config options 未应用

**问题：** Guid 页面选的 reasoning effort 等配置在 V2 不生效。

**修复：**

- 新增 `InitialDesiredConfig` 类型（`types.ts`），包含 `model?`、`mode?`、`configOptions?` 三个字段
- `AgentConfig.resumeConfig` 杂物袋替换为类型化的 `AgentConfig.initialDesired`
- `typeBridge.toAgentConfig()` 从 `extra.currentModelId` / `extra.sessionMode` / `extra.pendingConfigOptions` 构建 `initialDesired`
- `ConfigTracker` 构造函数接受 `InitialDesiredConfig`，直接初始化 desired 状态
- 现有 `reassertConfig()` 在第一次 prompt 前自动下发，无需新代码路径

---

### 4. Prompt timeout 不可配

**问题：** 写死 300s，用户在设置页配置的超时无效。

**修复：** `AcpAgentV2.ensureSession()` 从 `ProcessConfig.get('acp.config')` 读 per-backend timeout，fallback 到 `ProcessConfig.get('acp.promptTimeout')`，再 fallback 到 300s。`Math.max(30, sec) * 1000` 转 ms，和 V1 一致。

---

## P1 — 功能缺失（已全部修复）

### 5. `waitForMcpReady` 未调用

**问题：** 团队模式下第一条消息可能在 team MCP 工具注册前到达 agent。V1 用 `this.id`（conversation_id）做 slotId，和 stdio 脚本发回的 `TEAM_AGENT_SLOT_ID`（`slot-xxxx`）不匹配，实际上 V1 每次都靠 30s 超时放行。

**修复：** `AcpAgentV2.ensureSession()` session 创建后，从 `teamMcpConfig.env` 提取 `TEAM_AGENT_SLOT_ID` 作为正确的 slotId，调 `waitForMcpReady(teamSlotId, 30_000)`。用 `'env' in teamMcp` 做类型 narrowing（`McpServer` 是联合类型，`env` 只在 `McpServerStdio` 上）。

---

### 6. Available commands 丢 description / hint

**问题：** `ConfigTracker` 只存 `string[]`，AcpAgentV2 用 `description: name` 补位。

**修复（方案 B）：**

- `types.ts` 新增 `AvailableCommand` 类型（`name`、`description?`、`hint?`）
- `ConfigSnapshot.availableCommands` 从 `string[]` → `AvailableCommand[]`
- `ConfigTracker` 内部存储和 `updateAvailableCommands()` 改为 `AvailableCommand[]`
- `AcpSession.handleMessage` 新增 `available_commands_update` case，解析完整 command 数据存入 ConfigTracker
- `MessageTranslator` 不再处理 `available_commands_update`（由 AcpSession 拦截）
- `AcpAgentV2.onConfigUpdate` 直接透传 `config.availableCommands`

---

### 7. Session capabilities 不持久化

**问题：** Guid 页面 / AgentModeSelector 在无 active session 时无法从缓存渲染。

**修复：**

- `AcpAgentV2` 新增 `persistSessionCapabilities()` 方法，写 `acp.cachedModels` + `acp.cachedConfigOptions` + `acp.cachedModes` 到 disk
- 保留 V1 的 "preserve original default model" 语义和 static `cacheQueue` 串行写
- `onModelUpdate`、`onModeUpdate`、`onConfigUpdate` 回调末尾各调一次

---

### 8. Context usage 缺 `cost` 和 `PromptResponse.usage` fallback

**问题：** 费用追踪断了；不发 `usage_update` 的后端没有 context 用量显示。

**修复：**

- `ContextUsage` 加 `cost?: { amount: number; currency: string }`（对齐 ACP SDK `Cost` 类型）
- `AcpSession.handleMessage` 的 `usage_update` case 透传 `u.cost`
- `PromptExecutor.execute` prompt 返回后检查 `result.usage` 作为 fallback
- `AcpAgentV2.onContextUsage` 转发 `cost` 到老格式

---

## P2 — 行为差异（已全部修复）

### 9. ApprovalCache 会缓存 `deny_always`

**问题：** `optionId.includes('always')` 命中 `deny_always`，下次同 key 请求自动拒绝。

**修复：** `PermissionResolver.resolve()` 改为 `optionId.startsWith('allow_') && optionId.includes('always')`。

---

### 10. Cancel 不立即清理

**问题：** `cancelPrompt()` 只调 `client.cancel()`，pending permissions 悬空、timer 继续跑。

**修复：** `AcpSession.cancelPrompt()` 在调 `promptExecutor.cancel()` 前先 `stopTimer()` + `permissionResolver.rejectAll()`。`turn_finished` 仍由后端驱动，Manager 的 `missingFinishFallbackDelayMs`（15s）兜底。

---

### 11. Auth CLI login 不用 `cliPath`

**问题：** `runBackendLogin()` 直接 spawn backend 名字，非 PATH 安装会找不到。

**修复：** `runBackendLogin` 加 `cliCommand?: string` 参数，调用处传 `this.agentConfig.command`。

---

### 12. Navigation tool 拦截缺失

**问题：** V2 不发 `preview_open` 事件，chrome-devtools 预览面板不工作。

**修复：** `AcpAgentV2.onMessage` 收到 `acp_tool_call` 后调 `emitPreviewIfNavigation()`，用 `NavigationInterceptor.isNavigationTool()` 检测、`extractUrl()` 提取 URL、`createPreviewMessage()` 生成 `preview_open` 消息通过 `onStreamEvent` 发出。Manager 层 `handlePreviewOpenEvent` 自然接收转发。

---

## P3 — 低优先级

### 13. Claude `pendingModelSwitchNotice` — Won't fix

**问题：** Claude 切模型后 AI 不知道自己的 identity 变了。V1 在用户消息前注入 `<system-reminder>` 告知。

**结论：** 这是 Claude CLI 的 ACP 实现缺陷——`set_model` 后应更新 system prompt。客户端用 `<system-reminder>` hack 是 workaround，V2 不再复制这个 hack。

V2 已在 `AcpAgentV2.sendMessage` 中实现了同等的补丁（`pendingModelSwitchNotice`），仅对 Claude 生效。AcpRuntime 的长期方案见 `TODO.md` 的 SessionPlugin 设计。

---

### 14. `ccSwitchModelSource` 集成 — Done

**修复：** `AcpAgentV2.getModelInfo()` 对 Claude 后端优先调 `readClaudeModelInfoFromCcSwitch()`，如果用户通过 `setModel` 切过模型则叠加到 cc-switch 数据上，fallback 到 `cachedModelInfo`。

---

### 15. `getConfigOptions()` 过滤 model/mode — Done

**修复：** `AcpAgentV2.getConfigOptions()` 加 `.filter((opt) => opt.category !== 'model' && opt.category !== 'mode')`。

---

### 16. Plan 消息 turn 内合并 — Done

**修复：** `MessageTranslator.handlePlan()` 中 `crypto.randomUUID()` → `this.resolveMsgId('plan')`，同一 turn 内 plan 更新使用稳定 ID，renderer 做 replace 合并。

---

### 17. Error 分类 — Done

**修复：**

- `sendMessage` 改为 `await session.sendMessage()`（修复了 fire-and-forget bug，Manager 的 finish fallback 不再误触发）
- `PromptExecutor.handlePromptError` 做完 signal/metrics/状态处理后 re-throw `AcpError`
- `AcpAgentV2.sendMessage` catch 中用 `mapAcpErrorCodeToType()` 映射到 `AcpErrorType`
- 新增细粒度错误码：`ACP_PARSE_ERROR`、`INVALID_ACP_REQUEST`、`ACP_METHOD_NOT_FOUND`、`ACP_INVALID_PARAMS`、`AGENT_INTERNAL_ERROR`、`ACP_SESSION_NOT_FOUND`、`AGENT_SESSION_NOT_FOUND`、`ACP_ELICITATION_REQUIRED`、`ACP_REQ_CANCELLED`

---

### 18. `turnHasThought` 诊断日志 — Deferred

**现状：** `MessageTranslator.onTurnEnd()` 只清 map，不做诊断。

**影响：** 丢失 "thought but no content" 的诊断信号，低优先级。

---

### 19. `cacheInitializeResult` 回写 — Done

**修复：**

- `SessionCallbacks` 新增 `onInitialize?: (result: unknown) => void`
- `SessionLifecycle.spawnAndInit()` 成功后调 `callbacks.onInitialize?.(initResult)`（session 层不碰 ProcessConfig）
- `AcpAgentV2.buildCallbacks().onInitialize` 调 `cacheInitializeResult()`，用 `parseInitializeResult()` 转换 SDK 类型写入 `ProcessConfig('acp.cachedInitializeResult')`
