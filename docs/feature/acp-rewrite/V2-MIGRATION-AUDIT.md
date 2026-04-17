# AcpAgent V1 → AcpAgentV2 迁移审计报告

> 基于 `refactor/acp-migration-phase2` 分支审计
> 日期: 2026-04-17

## 修复进度

| 级别          | 总数 | 已修复 | 状态     |
| ------------- | ---- | ------ | -------- |
| P0 — 功能断裂 | 4    | 4      | Done     |
| P1 — 功能缺失 | 4    | 4      | Done     |
| P2 — 行为差异 | 4    | 4      | Done     |
| P3 — 低优先级 | 7    | 0      | Deferred |

---

## P0 — 功能断裂（已全部修复）

### 1. `enableYoloMode()` 写死 `bypassPermissions`

**现状代码：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:582-584
async enableYoloMode(): Promise<void> {
    await this.setMode('bypassPermissions');
}
```

**V1 行为：**

```typescript
// src/process/agent/acp/index.ts:484-498
async enableYoloMode(): Promise<void> {
    if (this.extra.yoloMode) return; // guard: 已 yolo 就 no-op
    this.extra.yoloMode = true;
    if (this.connection.isConnected && this.connection.hasActiveSession) {
      const yoloModeMap: Partial<Record<AcpBackend, string>> = {
        claude: CLAUDE_YOLO_SESSION_MODE,  // 'bypassPermissions'
        qwen: QWEN_YOLO_SESSION_MODE,     // 'yolo'
      };
      const sessionMode = yoloModeMap[this.extra.backend];
      if (sessionMode) {
        await this.connection.setSessionMode(sessionMode);
      }
    }
}
```

**调用方：** `AcpAgentManager.ensureYoloMode()` (`:1218`) ← `WorkerTaskManagerJobExecutor` (`:87`) 在 cron job 启动时调用。

**影响：** 非 Claude 后端的 cron job YOLO 模式发错误的 mode string。

**修复方案：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:582-584
// 改为：
async enableYoloMode(): Promise<void> {
    await this.setMode(getFullAutoMode(this.agentConfig.agentBackend));
}
```

需要在文件顶部添加 import：

```typescript
import { getFullAutoMode } from '@/common/types/agentModes';
```

注意：V1 有 `if (this.extra.yoloMode) return` guard 防止重复调用。V2 不需要这个 guard，因为 `setMode` 底层的 `ConfigTracker.setDesiredMode` 在 `current === desired` 时就是 no-op。

---

### 2. `start` 事件走 `onSignalEvent` 导致 `request_trace` 丢失

**现状代码：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:496-504
async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    try {
      // Emit start signal (matches old AcpAgent behavior)
      if (this.onSignalEvent) {           // ← 走 signal 通道
        this.onSignalEvent({
          type: 'start',
          ...
        });
      }
```

**Manager 端依赖：**

```typescript
// src/process/task/AcpAgentManager.ts:634-650
// handleStreamEvent 中：
if (message.type === 'start') {           // ← 只监听 stream 通道
    const modelInfo = this.agent?.getModelInfo();
    ipcBridge.acpConversation.responseStream.emit({
      type: 'request_trace',
      ...
    });
}
```

`start` 走 `onSignalEvent` → `handleSignalEvent`，而 `request_trace` 在 `handleStreamEvent` 里检查 `message.type === 'start'`。两条通道不交叉，`request_trace` 永远不会触发。

**影响：** renderer 的 `useAcpMessage` (`:259`) 依赖 `request_trace` 显示模型/后端/session mode 信息。

**修复方案：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:496-504
// 改为走 stream 通道：
if (this.onStreamEvent) {
  this.onStreamEvent({
    type: 'start',
    data: null,
    msg_id: data.msg_id ?? `start_${Date.now()}`,
    conversation_id: this.conversationId,
  });
}
```

---

### 3. Pending config options 未应用

**现状代码：**

`typeBridge` 正确地把 `pendingConfigOptions` 存进了 `resumeConfig`：

```typescript
// src/process/acp/compat/typeBridge.ts:81-87
let resumeConfig: Record<string, unknown> | undefined;
if (old.extra?.pendingConfigOptions && Object.keys(old.extra.pendingConfigOptions).length > 0) {
  resumeConfig = { pendingConfigOptions: old.extra.pendingConfigOptions };
}
```

但 `SessionLifecycle` 从未读取它。`applySessionResult` 里没有对 `pendingConfigOptions` 的处理：

```typescript
// src/process/acp/session/SessionLifecycle.ts:252-261 (applySessionResult 结尾)
this.host.messageTranslator.reset();
this.host.setStatus('active');

if (this.host.agentConfig.yoloMode) {
  this.applyYoloMode();
}
// ← 这里缺少 pendingConfigOptions 的处理
```

**V1 行为：**

```typescript
// src/process/agent/acp/index.ts (start 方法内)
// 遍历 pendingConfigOptions 调 setConfigOption
await Promise.all(
  Object.entries(this.extra.pendingConfigOptions).map(([id, value]) => this.connection.setConfigOption(id, value))
);
```

**影响：** 用户在 Guid 页面选择的 reasoning effort、thinking level 等配置在 V2 不生效。

**修复方案：**

在 `SessionLifecycle.applySessionResult()` 末尾添加：

```typescript
// src/process/acp/session/SessionLifecycle.ts — applySessionResult 末尾
    // Apply pending config options from Guid page selections
    this.applyPendingConfigOptions();
  }

  /**
   * Apply pending config options that were selected before session creation
   * (e.g., reasoning effort from the Guid page).
   */
  private applyPendingConfigOptions(): void {
    const pending = this.host.agentConfig.resumeConfig?.pendingConfigOptions;
    if (!pending || typeof pending !== 'object') return;

    const entries = Object.entries(pending as Record<string, string | boolean>);
    if (entries.length === 0) return;

    for (const [id, value] of entries) {
      this.host.configTracker.setDesiredConfigOption(id, value);
    }

    // reassertConfig will apply them on the next prompt.
    // For immediate application, fire them now if client is ready.
    if (this._client && this._sessionId) {
      for (const [id, value] of entries) {
        this._client
          .setConfigOption(this._sessionId, id, value)
          .then(() => this.host.configTracker.setCurrentConfigOption(id, value))
          .catch((err) => console.warn(`[SessionLifecycle] setConfigOption(${id}) failed:`, err));
      }
    }
  }
```

---

### 4. Prompt timeout 不可配

**现状代码：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:181
    promptTimeoutMs: 300_000,  // 写死 5 分钟
```

```typescript
// src/process/acp/session/AcpSession.ts:135
options?.promptTimeoutMs ?? 300_000;
```

**V1 行为：**

```typescript
// src/process/agent/acp/index.ts:458-470
private async applyPromptTimeoutFromConfig(): Promise<void> {
    const acpConfig = await ProcessConfig.get('acp.config');
    // Per-backend promptTimeout takes priority
    const backendTimeout = acpConfig?.[this.extra.backend]?.promptTimeout;
    if (typeof backendTimeout === 'number' && backendTimeout > 0) {
      this.connection.setPromptTimeout(backendTimeout);
      return;
    }
    // Fallback to global acp.promptTimeout
    const globalTimeout = await ProcessConfig.get('acp.promptTimeout');
    if (typeof globalTimeout === 'number' && globalTimeout > 0) {
      this.connection.setPromptTimeout(globalTimeout);
    }
}
```

**影响：** 用户在设置页配置的超时对 V2 无效。某些慢后端（如大模型）会意外超时。

**修复方案：**

在 `AcpAgentV2.ensureSession()` 中读取配置：

```typescript
// src/process/acp/compat/AcpAgentV2.ts:178-182
// 改为：
const acpConfig = await ProcessConfig.get('acp.config');
const backendTimeout = (acpConfig as Record<string, { promptTimeout?: number }> | undefined)?.[
  this.agentConfig.agentBackend
]?.promptTimeout;
const globalTimeout = await ProcessConfig.get('acp.promptTimeout');
const timeoutSec = backendTimeout ?? (typeof globalTimeout === 'number' ? globalTimeout : 300);
const promptTimeoutMs = Math.max(30, timeoutSec) * 1000;

const sessionOptions: SessionOptions = {
  promptTimeoutMs,
  maxResumeRetries: 2,
};
```

---

## P1 — 功能缺失（特定场景触发）

### 5. `waitForMcpReady` 未调用

**现状代码：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:125-157
// ensureSession() 注入 team MCP 后直接创建 session，没有等待 MCP 握手
```

**V1 行为：**

```typescript
// src/process/agent/acp/index.ts:1598-1608
if (this.extra.teamMcpStdioConfig && teamId) {
  emitMcpStatus?.('mcp_tools_waiting');
  await waitForMcpReady(slotId, 30_000);
  emitMcpStatus?.('mcp_tools_ready');
}
```

**影响：** 团队模式下第一条消息可能在 team MCP 工具注册前到达 agent。

**修复方案：**

在 `AcpAgentV2.ensureSession()` 的 session 创建后、`start()` 调用前，添加 `waitForMcpReady`。需要从 `teamMcpConfig` 提取 slotId：

```typescript
// src/process/acp/compat/AcpAgentV2.ts — ensureSession() 末尾，session 创建后
// Wait for team MCP tools to complete handshake before allowing messages
if (this.agentConfig.teamMcpConfig) {
  const { waitForMcpReady } = await import('@process/team/mcpReadiness');
  const slotId = `team-mcp-${this.conversationId}`;
  try {
    await waitForMcpReady(slotId, 30_000);
  } catch {
    console.warn('[AcpAgentV2] Team MCP readiness timeout, proceeding anyway');
  }
}
```

注意：slotId 的生成方式需要和 `teamMcpStdio.ts` 侧一致，需确认。V1 用的是 `teamId` 维度的 slotId。

---

### 6. Available commands 丢 description / hint

**现状代码：**

`MessageTranslator` 正确解析了完整的 commands：

```typescript
// src/process/acp/session/MessageTranslator.ts:274-278
const commands = (data.availableCommands ?? []).map((cmd) => ({
  name: cmd.name,
  description: cmd.description,
  hint: cmd.input?.hint,
}));
```

但 `ConfigTracker` 只存 `string[]`：

```typescript
// src/process/acp/session/ConfigTracker.ts:31
private availableCommands: string[] = [];

// :111
availableCommands: [...this.availableCommands],
```

`AcpSession.handleMessage` 不处理 `available_commands_update`（它走 `MessageTranslator.translate` → 输出 `IMessageAvailableCommands` TMessage → 到 `onMessage` 回调），但 `toResponseMessage()` 把 `available_commands` 类型过滤掉了（返回空 type）。

`AcpAgentV2.onConfigUpdate` 从 `configSnapshot().availableCommands`（`string[]`）重建 commands，丢失 description/hint：

```typescript
// src/process/acp/compat/AcpAgentV2.ts:273-278
if (this.onAvailableCommandsUpdate && config.availableCommands.length > 0) {
  const commands = config.availableCommands.map((name) => ({
    name,
    description: name, // ← 只有 name
  }));
  this.onAvailableCommandsUpdate(commands);
}
```

**修复方案：**

方案 A（推荐）：`AcpAgentV2` 直接监听 `onMessage` 中的 `available_commands` 类型消息，绕开 `ConfigTracker`：

```typescript
// src/process/acp/compat/AcpAgentV2.ts — buildCallbacks().onMessage 中
// 在现有 toResponseMessage 调用之前添加：
      onMessage: (message: TMessage) => {
        // Intercept available_commands before toResponseMessage filters them out
        if (message.type === 'available_commands') {
          const cmds = (message as IMessageAvailableCommands).content?.commands;
          if (this.onAvailableCommandsUpdate && cmds?.length) {
            this.onAvailableCommandsUpdate(cmds);
          }
          return; // Don't forward to stream — matches V1 behavior
        }

        const oldMsg = toResponseMessage(resolved, this.conversationId);
        ...
      },
```

方案 B：把 `ConfigTracker.availableCommands` 改为 `Array<{ name, description, hint? }>`。改动更大，涉及 types.ts ConfigSnapshot 类型。

---

### 7. Session capabilities 不持久化

**现状代码：**

V2 只在内存缓存：

```typescript
// src/process/acp/compat/AcpAgentV2.ts:238
onModelUpdate: (model: ModelSnapshot) => {
    this.cachedModelInfo = toAcpModelInfo(model);
    // ← 不写 disk
```

**V1 行为：**

```typescript
// src/process/agent/acp/index.ts:1825-1833
private cacheSessionCapabilities(snapshot: {
    modelInfo: AcpModelInfo | null;
    configOptions: AcpSessionConfigOption[] | null;
    modes: AcpSessionModes | null;
}): Promise<void> {
    const job = AcpAgent.cacheQueue.then(() => this.doCacheSessionCapabilities(snapshot));
    AcpAgent.cacheQueue = job.catch(() => {});
    return job;
}
```

**影响：** Guid 页面 / AgentModeSelector / AcpConfigSelector 在无 active session 时无法从缓存渲染。

**修复方案：**

在 `AcpAgentV2.buildCallbacks().onModelUpdate` 末尾添加持久化：

```typescript
// src/process/acp/compat/AcpAgentV2.ts — onModelUpdate 末尾
// Persist to disk for Guid page cache rendering
void this.cacheSessionCapabilities();
```

新增方法：

```typescript
// src/process/acp/compat/AcpAgentV2.ts — 新增 private 方法
  private static cacheQueue: Promise<void> = Promise.resolve();

  private cacheSessionCapabilities(): Promise<void> {
    const job = AcpAgentV2.cacheQueue.then(async () => {
      const { ProcessConfig } = await import('@process/utils/initStorage');
      const backend = this.agentConfig.agentBackend;
      const cached = (await ProcessConfig.get('acp.cachedSessionCapabilities')) || {};
      await ProcessConfig.set('acp.cachedSessionCapabilities', {
        ...cached,
        [backend]: {
          modelInfo: this.cachedModelInfo,
          configOptions: this.cachedConfigOptions,
          // modes: TODO if needed
        },
      });
    });
    AcpAgentV2.cacheQueue = job.catch(() => {});
    return job;
  }
```

---

### 8. Context usage 缺 `cost` 字段和 `PromptResponse.usage` fallback

**现状代码：**

```typescript
// src/process/acp/session/AcpSession.ts:315-323
case 'usage_update': {
    const u = update as UsageUpdate & { sessionUpdate: 'usage_update' };
    this.callbacks.onContextUsage({
      used: u.used ?? 0,
      total: u.size ?? 0,
      percentage: u.size > 0 ? Math.round((u.used / u.size) * 100) : 0,
      // ← 缺少 cost
    });
    return;
}
```

```typescript
// src/process/acp/types.ts:90-94
export type ContextUsage = {
  used: number;
  total: number;
  percentage: number;
  // ← 没有 cost 字段
};
```

**V1 行为：**

V1 转发 `cost` 并有 `PromptResponse.usage` fallback（当 agent 不发 `usage_update` 时）。

**修复方案：**

Step 1: 类型加 `cost`：

```typescript
// src/process/acp/types.ts:90-94
export type ContextUsage = {
  used: number;
  total: number;
  percentage: number;
  cost?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};
```

Step 2: `AcpSession.handleMessage` 传递 cost：

```typescript
// src/process/acp/session/AcpSession.ts:315-323
case 'usage_update': {
    const u = update as UsageUpdate & { sessionUpdate: 'usage_update'; cost?: unknown };
    this.callbacks.onContextUsage({
      used: u.used ?? 0,
      total: u.size ?? 0,
      percentage: u.size > 0 ? Math.round((u.used / u.size) * 100) : 0,
      cost: u.cost as ContextUsage['cost'],
    });
    return;
}
```

Step 3: `PromptExecutor.execute()` 添加 fallback：

```typescript
// src/process/acp/session/PromptExecutor.ts:71-74
// 改为：
this.timer.start();
const promptResult = await lifecycle.client.prompt(lifecycle.sessionId, content);
this.timer.stop();

// Fallback: use PromptResponse.usage if no usage_update notification was received
if (promptResult.usage) {
  const u = promptResult.usage;
  const total = u.inputTokens + u.outputTokens;
  this.host.callbacks.onContextUsage({
    used: total,
    total: 0,
    percentage: 0,
  });
}
```

注意：需要确认 SDK `PromptResponse` 类型是否有 `usage` 字段。如果没有，此 fallback 不适用。

---

## P2 — 行为差异

### 9. ApprovalCache 会缓存 `deny_always`

**现状代码：**

```typescript
// src/process/acp/session/PermissionResolver.ts:149
if (optionId.includes('always') || optionId === 'always') {
  this.cache.set(entry.cacheKey, optionId);
}
```

`deny_always` 也包含 `'always'`，会被缓存。下次同 key 的请求会自动拒绝。

**V1 行为：** `AcpApprovalStore.put()` (`:86`) 只缓存 `allow_always`。

**修复方案：**

```typescript
// src/process/acp/session/PermissionResolver.ts:149
// 改为：
if (optionId.startsWith('allow_') && optionId.includes('always')) {
  this.cache.set(entry.cacheKey, optionId);
}
```

---

### 10. Cancel 不立即发 finish

**现状代码：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:488-489
cancelPrompt(): void {
    this.session?.cancelPrompt();
}
```

V2 只调 `client.cancel()`，等后端发 `turn_finished`。如果后端响应慢，UI 会一直显示 loading。

**V1 行为：** `cancelPrompt()` 直接 reject pending permissions + 发 finish signal。

**修复方案：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts:488-489
// 改为：
cancelPrompt(): void {
    this.session?.cancelPrompt();

    // Fallback: emit finish if backend doesn't respond within 5s
    // (V1 emits finish immediately; V2 waits for turn_finished)
    const fallbackTimer = setTimeout(() => {
      this.onSignalEvent?.({
        type: 'finish',
        conversation_id: this.conversationId,
        msg_id: `cancel_finish_${Date.now()}`,
        data: null,
      });
    }, 5_000);

    // Cancel fallback if we receive a real finish before timeout
    const originalOnSignal = this.onSignalEvent;
    this.onSignalEvent = (event) => {
      if (event.type === 'finish') clearTimeout(fallbackTimer);
      this.onSignalEvent = originalOnSignal;
      originalOnSignal?.(event);
    };
}
```

注意：这个实现较 hacky，需要更仔细的设计。也可以在 `AcpAgentManager.stop()` 层做 fallback，和 `missingFinishFallbackDelayMs` 对齐。

---

### 11. Auth CLI login 不用 `cliPath`

**现状代码：**

```typescript
// src/process/acp/compat/AcpAgentV2.ts — handleAuthRequired 中
// runBackendLogin 直接 spawn 'claude' / 'qwen'，不用配置的 cliPath
```

**V1 行为：** 用 `this.extra.cliPath` 解析出完整路径，支持 npx 场景。

**修复方案：**

`handleAuthRequired` 里用 `this.agentConfig.command ?? backendName` 作为命令路径。

---

### 12. Navigation tool 拦截缺失（chrome-devtools preview）

**现状：** V2 完全没有 `NavigationInterceptor`，不发 `preview_open` 事件。

**影响：** 用户看不到 agent 打开的 URL 在预览面板中显示。

**修复方案：**

在 `AcpAgentManager.handleStreamEvent()` 中已有 `handlePreviewOpenEvent(message)` 调用（`:626`）。如果 V2 的 `acp_tool_call` 消息正确传递了 `rawInput`（已确认包含 URL），则这个拦截应该还能工作。

需要确认 `handlePreviewOpenEvent` 的匹配逻辑是否兼容 V2 的消息格式。如果是，则此问题已通过 Manager 层覆盖，无需在 V2 层添加。

---

## P3 — 低优先级（记录但不阻塞迁移）

### 13. Claude `pendingModelSwitchNotice` 缺失

**V1 行为（`index.ts:720-733`）：**

用户在 ACP 模式下切模型时，Claude CLI 不像终端那样自动输出 `/model X`。V1 在切模型后记录一个 `pendingModelSwitchNotice`，在下次 prompt 前注入一段 `<system-reminder>` 告知 agent 模型已切换，避免 agent 误报旧模型名。

**V2 现状：** 没有这段逻辑。`setModel` 只调 `client.setModel`，不注入通知。

**影响：** Claude 切模型后，agent 可能仍然回答 "I am claude-3.5-sonnet" 而非新选的模型。

**建议修复方向：** 在 `AcpSession.setModel` 成功后，记录一个 pending notice，在 `PromptExecutor.execute` 的 content 前注入。仅对 `backend === 'claude'` 生效。

---

### 14. `ccSwitchModelSource` 未集成

**V1 行为（`index.ts:504-517`）：**

Claude 有一个特殊的模型信息源——读取 Claude CLI 进程写的 `cc-switch` 文件（`readClaudeModelInfoFromCcSwitch()`），获取更准确的 available models 列表。V1 的 `getModelInfo()` 优先用这个源，fallback 到 ACP API 返回的。

**V2 现状：** `getModelInfo()` 直接返回 `cachedModelInfo`（来自 `toAcpModelInfo(ModelSnapshot)`），不读 cc-switch 文件。

**影响：** Claude 的可选模型列表可能不如 V1 准确。

**建议修复方向：** 在 `AcpAgentV2.getModelInfo()` 中，如果 `backend === 'claude'`，调用 `readClaudeModelInfoFromCcSwitch()` 合并。或者在 `onModelUpdate` 回调里做合并。

---

### 15. `getConfigOptions()` 不过滤 model/mode 类别

**V1 行为（`index.ts:525-529`）：**

```typescript
getConfigOptions(): AcpSessionConfigOption[] {
    const all = this.connection.getConfigOptions();
    if (!all) return [];
    return all.filter((opt) => opt.category !== 'model' && opt.category !== 'mode');
}
```

V1 过滤掉 `category === 'model'` 和 `category === 'mode'` 的 config options，因为模型和模式有独立的 UI 控件，不应出现在通用 config 面板里。

**V2 现状（`AcpAgentV2.ts:560`）：** `getConfigOptions()` 直接返回 `this.cachedConfigOptions`，不过滤。

**影响：** config 面板可能显示重复的 model/mode 选择器。

**建议修复方向：** 在 `AcpAgentV2.getConfigOptions()` 或 `toAcpConfigOptions()` 中添加同样的 filter。

---

### 16. Plan 消息不做 turn 内合并

**V1 行为：** 同一 turn 内多次收到 `plan` 更新时，V1 使用稳定的 `planMsgId` 让 renderer 合并到同一条消息上，实现 plan 进度的实时更新。

**V2 现状（`MessageTranslator.ts:247`）：** 每次 `plan` 更新生成新的 `crypto.randomUUID()`，renderer 会创建多条独立的 plan 消息。

**影响：** plan 消息在 UI 上会出现多条，而不是一条实时更新的。

**建议修复方向：** 在 `MessageTranslator.handlePlan()` 中使用 `resolveMsgId('plan')` 生成稳定的 per-turn plan ID，而非每次新建。

---

### 17. Error 分类粗糙

**V1 行为：** `sendMessage` 的 catch 块根据错误内容分类为 `AUTHENTICATION_FAILED`、`SESSION_EXPIRED`、`RESOURCE_EXHAUSTED`、`INTERNAL_ERROR` 等 5+ 种类型，并提供 backend-specific 的错误提示（如 Qwen internal error 的特殊处理）。

**V2 现状（`AcpAgentV2.ts:520-530`）：** 统一返回 `AcpErrorType.UNKNOWN`。

**影响：** renderer 无法根据错误类型显示差异化的 UI（如 auth 错误显示重新登录按钮）。`errorNormalize.ts` 已有分类逻辑，但仅在 `PromptExecutor` 内部使用（auth retry），未传递给 `sendMessage` 的返回值。

**建议修复方向：** 在 `AcpSession` 层暴露 prompt 的结构化错误（而非吞掉），让 `AcpAgentV2.sendMessage` 能映射到正确的 `AcpErrorType`。

---

### 18. `turnHasThought` 诊断日志

**V1 行为（`index.ts:1184-1189`）：**

```typescript
if (this.turnHasThought && !this.turnHasContent) {
  console.warn(
    `[ACP-STREAM] End turn with thought but no content (conversation=${this.id}, backend=${this.extra.backend})`
  );
}
```

当一个 turn 只有 thought（thinking）但没有实际内容输出时，V1 打一条 warning。这有助于诊断 agent 卡住或思考后不输出的问题。

**V2 现状：** `MessageTranslator.onTurnEnd()` 只清 map，不做诊断。

**影响：** 丢失诊断信号。

**建议修复方向：** 在 `MessageTranslator` 中追踪 turn 内是否有 thought/content，在 `onTurnEnd()` 时输出 warning。

---

### 19. `cacheInitializeResult` 不回写

**V1 行为（`index.ts:1789-1797`）：**

每次 session connect 成功后，V1 把 `connection.getInitializeResult()` 写入 `ProcessConfig('acp.cachedInitializeResult')`。这包含 agent 的 capabilities（如 `mcpCapabilities`），被 `AcpAgentV2.ensureSession()` (`:167`) 用来过滤 MCP server 配置。

**V2 现状：** 读缓存（`:167`）但不写回。如果缓存是空的（全新安装），MCP server 过滤逻辑拿不到 capabilities，可能注入不兼容的 MCP server。

**影响：** 全新安装后第一次使用，用户配置的 MCP server 可能无法正确过滤。第二次启动后 V1 的缓存生效（如果之前 V1 写过）。

**建议修复方向：** 在 `SessionLifecycle.establishSession()` 成功后，把 client 的 initialize result 写回 `ProcessConfig('acp.cachedInitializeResult')`。需要从 `ProcessAcpClient` 暴露 `getInitializeResult()` 方法。
