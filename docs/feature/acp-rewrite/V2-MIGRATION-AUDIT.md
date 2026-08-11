# AcpAgent V1 → AcpAgentV2 迁移审计报告

> 基于 `refactor/acp-migration-phase2` 分支审计
> 初始审计日期: 2026-04-17
> 二次校对日期: 2026-04-18

## 修复进度

| 级别          | 总数 | 已修复 | 状态                           |
| ------------- | ---- | ------ | ------------------------------ |
| P0 — 功能断裂 | 5    | 4      | 1 open (#20)                   |
| P1 — 功能缺失 | 6    | 4      | 2 open (#21, #22)              |
| P2 — 行为差异 | 7    | 4      | 3 open (#23, #24, #25)         |
| P3 — 低优先级 | 8    | 6      | 1 deferred (#13), 1 open (#26) |

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

---

## 二次校对 — 2026-04-18 新发现

> 以下问题通过逐方法对比 `AcpAgent`（V1, 1884 行）和 `AcpAgentV2`（809 行）发现，
> 覆盖公共 API、内部状态管理、事件格式、文件处理等差异。

---

## P0 — 功能断裂

### 20. `agentCrash` flag 缺失 — 团队模式崩溃检测失效

**问题：** V1 `AcpAgent.handleDisconnect()` 在进程意外退出时 emit finish 事件并携带
`agentCrash: true` 标记（`src/process/agent/acp/index.ts:1240`）：

```typescript
// V1: AcpAgent.handleDisconnect()
this.onSignalEvent({
  type: 'finish',
  conversation_id: this.id,
  msg_id: uuid(),
  data: {
    error: `Process exited unexpectedly (code: ${error.code}, signal: ${error.signal})`,
    agentCrash: true,
  },
});
```

`TeammateManager` (`src/process/team/TeammateManager.ts:271-272`) 依赖此 flag 检测崩溃：

```typescript
const msgData = msg.data as { agentCrash?: boolean; error?: string } | null;
if (msg.type === 'finish' && msgData?.agentCrash) {
  void this.handleAgentCrash(agent, msgData.error ?? 'Unknown error');
  return;
}
```

V2 的 `AcpSession.onDisconnect()` 在进程崩溃时转为 `suspended` 状态并尝试
`resumeFromDisconnect()`，通过 `onStatusChange` emit `agent_status` 事件，
**从不 emit `finish` with `agentCrash: true`**。

**影响：** 团队模式下 agent 进程崩溃不会被 `TeammateManager` 识别，无法触发
`handleAgentCrash` 进行自动重启/替换。

**缓解因素：** `TeammateManager:276-279` 有第二道防线——检测 `msg.type === 'error'`
中是否包含 `process exited unexpectedly` 或 `Session not found` 字符串。V2 的
`PromptExecutor.handlePromptError` 在进程崩溃时会通过 `onSignal({ type: 'error' })`
发出错误，但 error message 来自 `normalizeError()` 转换后的 `AcpError.message`，
可能不包含这些精确的关键字。

**修复方案：** 在 `AcpAgentV2.buildCallbacks().onSignal` 的 `'error'` case 中，
如果错误来自进程崩溃（检测 `PROCESS_CRASHED` 关键字或 `disconnect` 相关信息），
额外 emit 一个带 `agentCrash: true` 的 finish 信号。

**涉及文件：**

- `src/process/acp/compat/AcpAgentV2.ts` — `buildCallbacks().onSignal` 的 `error` case
- `src/process/acp/session/SessionLifecycle.ts` — `handleDisconnect` 传递的 `DisconnectInfo`

**修复代码：**

```typescript
// AcpAgentV2.ts — buildCallbacks().onSignal 的 error case

case 'error': {
  // Detect process crash from error message keywords to emit agentCrash
  // flag that TeammateManager.handleResponseStream relies on.
  const isCrash =
    event.message.includes('process exited unexpectedly') ||
    event.message.includes('PROCESS_CRASHED') ||
    event.message.includes('Process disconnected');

  this.onSignalEvent({
    type: 'error',
    conversation_id: this.conversationId,
    msg_id: `signal_${Date.now()}`,
    data: event.message,
  });

  if (isCrash) {
    this.onSignalEvent({
      type: 'finish',
      conversation_id: this.conversationId,
      msg_id: `finish_${Date.now()}`,
      data: {
        error: event.message,
        agentCrash: true,
      },
    });
  }
  break;
}
```

同时需要确保 `SessionLifecycle.handleDisconnect` → `AcpSession.onDisconnect` →
`enterError` 路径中，error message 包含可识别的关键字。当前
`PromptExecutor.handlePromptError` 对 `PROCESS_CRASHED` 类型的 AcpError 已经
re-throw，但 `AcpSession.onDisconnect` 在 prompting 状态下走 `resumeFromDisconnect`
而非 `enterError`，需要在 resume 也失败后 emit crash signal：

```typescript
// AcpSession.ts — onDisconnect 补充 crash 信号

private onDisconnect(info?: DisconnectInfo): void {
  if (this._status === 'idle' || this._status === 'suspended' || this._status === 'error') return;

  this.lifecycle.clearClient();

  if (this._status === 'prompting') {
    this.promptExecutor.stopTimer();
    this.permissionResolver.rejectAll(new Error('Process disconnected'));

    // Emit crash signal so TeammateManager can detect agent crash
    // before attempting resume (which may also fail).
    if (info?.reason === 'process_exit' || info?.reason === 'process_close') {
      this.callbacks.onSignal({
        type: 'error',
        message: `process exited unexpectedly (code: ${info.exitCode}, signal: ${info.signal})`,
        recoverable: true,
      });
    }

    this.lifecycle.resumeFromDisconnect();
  } else {
    this.setStatus('suspended');
  }
}
```

---

## P1 — 功能缺失

### 21. `sendMessage` 缺少自动重连

**问题：** V1 `AcpAgent.sendMessage()` 在发送前检测连接状态，断开时自动重连
（`src/process/agent/acp/index.ts:648-661`）：

```typescript
// V1: AcpAgent.sendMessage()
if (!this.connection.isConnected || !this.connection.hasActiveSession) {
  try {
    await this.start();
  } catch (reconnectError) {
    return { success: false, error: createAcpError(AcpErrorType.CONNECTION_NOT_READY, ...) };
  }
}
```

V2 `AcpSession.sendMessage()` 只处理 `active` 和 `suspended` 两个状态
（`src/process/acp/session/AcpSession.ts:194-206`）：

```typescript
// V2: AcpSession.sendMessage()
switch (this._status) {
  case 'active':
    await this.promptExecutor.execute(content);
    return;
  case 'suspended':
    this.promptExecutor.setPending(content);
    this.lifecycle.resume();
    return;
  default:
    throw new AcpError('INVALID_STATE', `Cannot send in ${this._status} state`);
}
```

在 `error` 或 `idle` 状态下直接抛 `INVALID_STATE` 异常。

**影响：** 如果 session 进入 error 状态（如非 disconnect 类的 internal error），用户
发消息直接失败，无法自愈。V1 能自动重新 start。

**缓解因素：** V2 的 `SessionLifecycle` 对 disconnect 类崩溃有内建的
`resumeFromDisconnect` → `spawnAndInit` 重连逻辑，`suspended` 状态也能自动 resume。
只有非 disconnect 类的 `error` 状态缺乏恢复路径。

**修复方案：** 在 `AcpAgentV2.sendMessage` 中增加 error/idle 状态的自动恢复。

**涉及文件：**

- `src/process/acp/compat/AcpAgentV2.ts` — `sendMessage()` 方法

**修复代码：**

```typescript
// AcpAgentV2.ts — sendMessage() 增加自动重连

async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
  try {
    // ... existing start event emission ...

    // Auto-reconnect if session is in error/idle state (mirrors V1 behavior)
    if (this.lastStatus === 'error' || this.lastStatus === 'idle') {
      try {
        await this.kill();       // Clean up stale session
        await this.start();      // Re-create session
      } catch (reconnectError) {
        return {
          success: false,
          error: {
            type: AcpErrorType.CONNECTION_NOT_READY,
            code: 'CONNECTION_FAILED',
            message: `Failed to reconnect: ${reconnectError instanceof Error ? reconnectError.message : String(reconnectError)}`,
            retryable: true,
          },
        };
      }
    }

    // ... rest of sendMessage ...
  }
}
```

---

### 22. `InputPreprocessor` `@` 文件引用解析弱化

**问题：** V1 使用完整的 `parseAllAtCommands` / `extractAtPaths` 解析器
（`src/process/agent/acp/index.ts:809-904`），具备：

- 带空格路径支持：`@"path with spaces/file.txt"`
- uploaded files 去重：跳过已在 `files` 数组中的文件，避免重复读取
- 二进制文件检测：`readFile(path, 'utf-8')` catch 后 `console.warn` 并跳过
- 工作区递归搜索：`findFileInWorkspace(workspace, fileName, maxDepth=3)`
- 文件内容结构化追加：`--- Referenced file contents ---` + `[Content of path]:`

V2 `InputPreprocessor`（`src/process/acp/session/InputPreprocessor.ts`）使用简单正则：

```typescript
const AT_FILE_REGEX = /@([\w/.~-]+\.\w+)/g;
```

**具体缺陷：**

1. **带空格路径**：正则 `[\w/.~-]` 不含空格，`@"my file.txt"` 无法匹配
2. **无去重**：`files` 数组中的文件会被 `@` 引用再次匹配和读取，重复占用 context
3. **无工作区搜索**：只尝试原始路径，不做 `findFileInWorkspace` 递归查找
4. **二进制文件**：readFile 失败静默返回 `null`，无 warning 日志
5. **uploaded files 同时走两条路径**：`files` 数组的文件在循环中被 `tryReadFile` 读取，
   同时 text 中的 `@path` 也被正则再次匹配

**影响：** 用户 @引用带空格路径的文件失败；已上传的文件被重复读入 prompt 浪费 context。

**修复方案（两阶段）：**

**阶段 1（最小修复）：** 增强正则 + uploaded files 去重

**涉及文件：**

- `src/process/acp/session/InputPreprocessor.ts`

**修复代码：**

```typescript
// InputPreprocessor.ts — 增强版

import type { PromptContent } from '@process/acp/types';
import type { ContentBlock } from '@agentclientprotocol/sdk';

// Match @path or @"path with spaces" (quoted form)
const AT_FILE_REGEX = /@(?:"([^"]+)"|(\S+\.\w+))/g;

export class InputPreprocessor {
  constructor(private readonly readFile: (path: string) => string) {}

  process(text: string, files?: string[]): PromptContent {
    const items: ContentBlock[] = [{ type: 'text', text }];

    // Track which files we've already read (for deduplication)
    const readPaths = new Set<string>();

    // 1. Read explicitly uploaded files first
    if (files) {
      for (const filePath of files) {
        if (readPaths.has(filePath)) continue;
        const item = this.tryReadFile(filePath);
        if (item) {
          items.push(item);
          readPaths.add(filePath);
        }
      }
    }

    // 2. Parse @references from text, skipping already-read files
    const matches = text.matchAll(AT_FILE_REGEX);
    for (const match of matches) {
      const filePath = match[1] ?? match[2]; // group 1 = quoted, group 2 = unquoted
      if (!filePath || readPaths.has(filePath)) continue;

      // Also skip if basename matches any uploaded file
      const basename = filePath.split(/[\\/]/).pop();
      if (files?.some((f) => f === filePath || f.endsWith(`/${basename}`) || f.endsWith(`\\${basename}`))) {
        continue;
      }

      const item = this.tryReadFile(filePath);
      if (item) {
        items.push(item);
        readPaths.add(filePath);
      }
    }
    return items;
  }

  private tryReadFile(filePath: string): ContentBlock | null {
    try {
      const content = this.readFile(filePath);
      return { type: 'text', text: `[File: ${filePath}]\n${content}` };
    } catch {
      // Binary files or missing files — skip silently (consistent with V1 behavior)
      return null;
    }
  }
}
```

**阶段 2（长期方案）：** 见 `TODO.md` "文件引用/上传应使用 SDK ContentBlock 而非纯文本"，
根据 agent 的 `promptCapabilities` 使用 `file` / `image` ContentBlock 类型代替纯文本拼接。

---

## P2 — 行为差异

### 23. Model re-assertion 策略差异

**问题：** V1 在 **每次 prompt 前** 检查 `userModelOverride` 是否与当前模型一致，
不一致则重新 `setModel`（`src/process/agent/acp/index.ts:706-718`）：

```typescript
// V1: sendMessage() — 每次 prompt 前 re-assert
if (this.userModelOverride) {
  const currentInfo = this.getModelInfo();
  if (currentInfo?.currentModelId !== expected) {
    await this.connection.setModel(expected);
  }
}
```

`userModelOverride` 在 `setModelByConfigOption` 中设置后 **永不清除**，每次 prompt
都会检查。这是对 Claude CLI 内部 state 丢失（如 compaction 后重置）的 workaround。

V2 的 `ConfigTracker.setCurrentModel(modelId)` 在 setModel 成功后清除 `desiredModelId`：

```typescript
// ConfigTracker.ts
setCurrentModel(modelId: string): void {
  this.currentModelId = modelId;
  if (this.desiredModelId === modelId) this.desiredModelId = null;  // ← 清除
}
```

之后 `reassertConfig()` 拿到的 `pending.model` 是 `null`，不会 re-assert。

**影响：** 如果 CLI 在 session 内部丢失了模型状态（Claude 的 internal compaction），
V1 能在下一次 prompt 自动恢复，V2 不会——用户切的模型会静默回退到默认模型。

**修复方案：** 在 `AcpAgentV2.setModelByConfigOption` 中保存 override，
在 `sendMessage` 的 prompt 之前判断需要时手动 re-assert。

**涉及文件：**

- `src/process/acp/compat/AcpAgentV2.ts` — `setModelByConfigOption()` 和 `sendMessage()`

**修复代码：**

```typescript
// AcpAgentV2.ts

// 新增字段（和 V1 对齐）
private userModelOverride: string | null = null;

// setModelByConfigOption 中保存 override
async setModelByConfigOption(modelId: string): Promise<AcpModelInfo | null> {
  this.userModelOverride = modelId;  // ← 新增：持久记录用户选择
  // ... existing code ...
}

// sendMessage 中在 prompt 前 re-assert
async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
  try {
    // ... existing start event emission ...

    // Re-assert model override before sending prompt (mirrors V1 behavior).
    // Prevents model drift if CLI subprocess loses override state after
    // internal compaction or restart.
    if (this.userModelOverride && this.session) {
      const currentModel = this.cachedModelInfo?.currentModelId;
      if (currentModel !== this.userModelOverride) {
        try {
          this.session.setModel(this.userModelOverride);
        } catch {
          // best effort — continue even if re-assert fails
        }
      }
    }

    // ... rest of sendMessage ...
  }
}
```

---

### 24. `sendMessage` 错误后缺少 finish signal

**问题：** V1 `sendMessage` 的 catch block 同时 emit error message **和** finish signal
（`src/process/agent/acp/index.ts:780-791`）：

```typescript
// V1: sendMessage catch
this.emitErrorMessage(errorMsg);
if (this.onSignalEvent) {
  this.onSignalEvent({
    type: 'finish',
    conversation_id: this.id,
    msg_id: uuid(),
    data: null,
  });
}
```

V2 `sendMessage` 的 catch block 只返回 error result（`AcpAgentV2.ts:573-585`）：

```typescript
// V2: sendMessage catch
return { success: false, error: { type: errorType, ... } };
```

不 emit 任何 signal。

**影响分析：**

`AcpAgentManager` 的 turn tracking 机制：

- `sendMessage` 开始 → 设置 `activeTrackedTurnId`
- 收到 stream/signal `finish` → `handleTurnComplete` → 重置 turn tracking
- 缺少 finish → `missingFinishFallbackTimer`（15s delay）兜底

V2 的 `PromptExecutor.handlePromptError` 会发 `onSignal({ type: 'error' })`，
经 `AcpAgentV2.buildCallbacks().onSignal` 转为 `onSignalEvent({ type: 'error' })`，
Manager 的 `handleSignalEvent` 收到 `type: 'error'` 后执行的逻辑取决于 Manager 实现。

**但问题在于 "start event 已发出但 prompt 未真正执行" 的场景**——比如 sendMessage 中
在 `session.sendMessage` 之前就抛异常（如 `INVALID_STATE`），此时 start 已发出但
PromptExecutor 未介入，不会有任何 signal。Manager 会等 15s fallback。

**修复方案：** 在 `AcpAgentV2.sendMessage` 的 catch block 中补发 finish signal。

**涉及文件：**

- `src/process/acp/compat/AcpAgentV2.ts` — `sendMessage()` catch block

**修复代码：**

```typescript
// AcpAgentV2.ts — sendMessage() catch block

} catch (err) {
  const errorType = err instanceof AcpSessionError ? mapAcpErrorCodeToType(err.code) : AcpErrorType.UNKNOWN;
  const retryable = err instanceof AcpSessionError ? err.retryable : false;

  // Emit finish signal to reset frontend loading state and Manager turn tracking.
  // V1 does this in the catch block; without it the UI stays in loading state
  // until the 15s missingFinishFallbackTimer fires.
  if (this.onSignalEvent) {
    this.onSignalEvent({
      type: 'finish',
      conversation_id: this.conversationId,
      msg_id: `finish_${Date.now()}`,
      data: null,
    });
  }

  return {
    success: false,
    error: {
      type: errorType,
      code: err instanceof AcpSessionError ? err.code : 'UNKNOWN',
      message: err instanceof Error ? err.message : String(err),
      retryable,
    },
  };
}
```

**注意：** 此修复与 `PromptExecutor.handlePromptError` 中的 `onSignal({ type: 'error' })`
→ `AcpAgentV2.onSignal` → `onSignalEvent({ type: 'error' })` 路径不冲突。
error signal 触发 Manager 的错误处理逻辑，finish signal 触发 turn tracking 重置。
两者职责不同，V1 也是同时发出两者。但需要确保不会重复 emit finish——如果
`PromptExecutor` 已经在内部通过 `onSignal('turn_finished')` 发了 finish，
`AcpAgentV2` 的 catch 不应再发。实际上走到 catch 时 `PromptExecutor.handlePromptError`
re-throw 了 error 但不发 `turn_finished`，所以不会重复。

---

### 25. 权限请求数据格式重构

**问题：** V1 `emitPermissionRequest` 直接转发完整的 `AcpPermissionRequest` 对象
（`src/process/agent/acp/index.ts:1381-1388`）：

```typescript
// V1: emitPermissionRequest
this.onSignalEvent({
  type: 'acp_permission',
  data: data, // data: AcpPermissionRequest（包含 sessionId, toolCall, options 等完整字段）
});
```

V1 还额外做了两件事：

1. 将 `toolCall` 注册到 `adapter.activeToolCalls`（`index.ts:1347-1377`），
   确保后续 `tool_call_update` 能找到对应的初始 tool_call
2. 拦截 navigation tools 发 `preview_open` 事件

V2 在 `AcpAgentV2.buildCallbacks().onPermissionRequest` 中重构了数据格式
（`AcpAgentV2.ts:340-359`）：

```typescript
// V2: onPermissionRequest callback
this.onSignalEvent({
  type: 'acp_permission',
  data: {
    toolCall: {
      toolCallId: data.callId,
      title: data.title,
      kind: data.kind,
      rawInput: data.rawInput,
    },
    options: data.options.map((opt) => ({
      optionId: opt.optionId,
      name: opt.label,
    })),
  },
});
```

**差异对比：**

| 字段                       | V1（AcpPermissionRequest） | V2（重构后）                                   |
| -------------------------- | -------------------------- | ---------------------------------------------- |
| `data.sessionId`           | 有                         | 无                                             |
| `data.toolCall.toolCallId` | 有                         | `data.toolCall.toolCallId` (via `data.callId`) |
| `data.toolCall.status`     | 有                         | 无                                             |
| `data.toolCall.content`    | 有（tool call 内容块）     | 无                                             |
| `data.toolCall.locations`  | 有（文件位置数组）         | 无                                             |
| `data.options[].optionId`  | 有                         | 有                                             |
| `data.options[].name`      | `option.name`              | `option.label`（字段映射变化）                 |

**影响：**

- `AcpAgentManager.handleSignalEvent` 中 `acp_permission` case 将 `data` 透传给
  IPC bridge → renderer。如果 renderer 的权限对话框组件依赖 `data.toolCall.content`
  或 `data.toolCall.locations` 显示权限请求详情（如显示文件路径、工具输入内容），
  V2 会导致这些信息丢失。
- `data.options[].name` vs `data.options[].label`：如果 renderer 用 `option.name`
  渲染按钮文本，V2 的 `name` 字段来自 V1 的 `label`，语义一致但字段路径变了。

**修复方案：** 检查 renderer 的权限对话框组件实际使用哪些字段，补齐缺失字段。
保守做法是在 V2 中尽量还原 V1 的完整数据结构。

**涉及文件：**

- `src/process/acp/compat/AcpAgentV2.ts` — `buildCallbacks().onPermissionRequest`
- `src/renderer/pages/conversation/platforms/acp/` — 权限对话框组件（检查消费方）

**修复代码：**

```typescript
// AcpAgentV2.ts — onPermissionRequest 还原完整格式

onPermissionRequest: (data) => {
  if (this.onSignalEvent) {
    this.onSignalEvent({
      type: 'acp_permission',
      conversation_id: this.conversationId,
      msg_id: data.callId,
      data: {
        sessionId: this.lastSessionId ?? '',
        toolCall: {
          toolCallId: data.callId,
          title: data.title,
          kind: data.kind,
          rawInput: data.rawInput,
          status: 'pending',
          content: [],      // V2 PermissionResolver 不传此字段，留空
          locations: [],    // 同上
        },
        options: data.options.map((opt) => ({
          optionId: opt.optionId,
          name: opt.label,
        })),
      },
    });
  }
},
```

---

## P3 — 低优先级

### 26. Qwen backend 特殊错误处理丢失

**问题：** V1 对 Qwen 的 `Internal error` 做了增强错误提示
（`src/process/agent/acp/index.ts:749-760`）：

```typescript
// V1: sendMessage catch — Qwen specific
if (errorMsg.includes('Internal error')) {
  if (this.extra.backend === 'qwen') {
    const enhancedMsg =
      `Qwen ACP Internal Error: This usually means authentication failed or ` +
      `the Qwen CLI has compatibility issues. Please try: 1) Restart the application ` +
      `2) Use the packaged bun launcher instead of a global qwen install ` +
      `3) Check if you have valid Qwen credentials.`;
    this.emitErrorMessage(enhancedMsg);
    return { success: false, error: createAcpError(AcpErrorType.AUTHENTICATION_FAILED, enhancedMsg, false) };
  }
}
```

V2 使用通用的 `mapAcpErrorCodeToType` 映射，不做 backend-specific 错误增强。
Qwen 用户遇到 Internal error 时只看到原始错误信息，缺少引导性的排查建议。

**影响：** 用户体验降级，Qwen 用户更难自行排查认证/兼容性问题。

**修复方案：** 在 `AcpAgentV2.sendMessage` 的 catch block 中增加 backend-specific
错误增强（或将此逻辑上移到 `AcpAgentManager.sendMessage` 中统一处理）。

**涉及文件：**

- `src/process/acp/compat/AcpAgentV2.ts` — `sendMessage()` catch block

**修复代码：**

```typescript
// AcpAgentV2.ts — sendMessage catch block 增加 Qwen 特殊处理

} catch (err) {
  let errorType = err instanceof AcpSessionError ? mapAcpErrorCodeToType(err.code) : AcpErrorType.UNKNOWN;
  let errorMessage = err instanceof Error ? err.message : String(err);
  const retryable = err instanceof AcpSessionError ? err.retryable : false;

  // Qwen backend: enhance "Internal error" with actionable troubleshooting steps
  if (this.agentConfig.agentBackend === 'qwen' && errorMessage.includes('Internal error')) {
    errorType = AcpErrorType.AUTHENTICATION_FAILED;
    errorMessage =
      `Qwen ACP Internal Error: This usually means authentication failed or ` +
      `the Qwen CLI has compatibility issues. Please try: 1) Restart the application ` +
      `2) Use the packaged bun launcher instead of a global qwen install ` +
      `3) Check if you have valid Qwen credentials.`;
  }

  // ... finish signal + return error ...
}
```

**长期方案：** 将 backend-specific 错误增强逻辑移到 `SessionPlugin.onError` hook 中
（见 `TODO.md` 的 SessionPlugin 设计），保持 compat 层干净。
