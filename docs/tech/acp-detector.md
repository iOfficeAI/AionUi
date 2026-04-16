# AcpDetector 检测逻辑报告

> 源文件：`src/process/agent/acp/AcpDetector.ts` (345 行)
> 依赖模块：`src/process/utils/shellEnv.ts`, `src/common/types/acpTypes.ts`

## 概述

AcpDetector 是主进程中的 **单例 Agent 发现引擎**，负责检测系统上所有可用的 ACP (Agent Communication Protocol) CLI agent。它从三个来源并行检测，合并去重后输出一个统一的 agent 列表供 UI 和 IPC bridge 使用。

```
acpDetector = new AcpDetector()   // 模块级单例，导出供全局使用
```

## 检测流程总览

```
initialize()
│
├── Promise.all([
│   ├── detectBuiltinAgents()     ← Source 1: 内置已知 CLI 列表
│   ├── detectExtensionAgents()   ← Source 2: 扩展注册表
│   └── detectCustomAgents()      ← Source 3: 用户自定义配置
│])
│
├── 合成 Gemini agent（始终存在，无需 CLI 检测）
│
├── 合并: [Aionrs, Gemini, ...Builtin, ...Other, ...Remote, ...Extension]
│
└── this.isInitialized = true
```

## 三个检测来源详解

### Source 1: detectBuiltinAgents() (line 107)

从 `POTENTIAL_ACP_CLIS` 遍历所有已知 CLI 工具，对每个调用 `isCliAvailable(cli.cmd)` 验证是否存在于系统 PATH。

`POTENTIAL_ACP_CLIS` 由 `ACP_BACKENDS_ALL` 动态生成（Proxy 延迟初始化），过滤规则：

- 必须有 `cliCommand`
- 必须 `enabled: true`
- 排除 `gemini`（内置，无需检测）、`custom`（用户配置）、`aionrs`（非 ACP 协议）

返回包含 `backend`, `name`, `cliPath`, `acpArgs` 的 DetectedAgent 数组。

### Source 2: detectExtensionAgents() (line 125)

从 `ExtensionRegistry.getInstance().getAcpAdapters()` 获取扩展贡献的 ACP adapter。

过滤条件：

- `connectionType` 必须是 `'cli'` 或 `'stdio'`
- 必须有非空 `cliCommand`
- 对每个 adapter 调用 `isCliAvailable(cliCommand)` 验证

返回的 agent 固定 `backend: 'custom'`，并带有 `isExtension: true` 和 `extensionName` 标记。

整个方法包裹在 try/catch 中，ExtensionRegistry 加载失败时静默返回空数组。

### Source 3: detectCustomAgents() (line 179)

从 `ProcessConfig.get('assistants')` 读取助手配置。

过滤条件：

- `enabled === true`
- `defaultCliPath` 非空 **或** `isPreset === true`

**不执行 CLI 可用性检查** — 由用户自行保证 CLI 存在。

错误处理：`ENOENT`/`not found` 静默忽略（配置文件可能尚未创建），其他错误 warn 记录。

## CLI 可用性检测 (isCliAvailable)

核心方法，位于 line 60：

### macOS / Linux

```bash
which <command>
```

- 超时：1 秒
- 使用 `enhancedEnv` 作为环境变量（包含 shell PATH + 额外工具路径）
- 成功：`execSync` 无异常 → `true`
- 失败：`execSync` 抛异常 → `false`

### Windows

**两层回退**：

1. 首选：`where <command>` (超时 1 秒)
2. 回退：PowerShell `Get-Command -All <command> | Select-Object -First 1 | Out-Null` (超时 1 秒)

## 增强环境变量 (getEnhancedEnv)

`shellEnv.ts` 提供的 `getEnhancedEnv()` 是 CLI 检测的关键依赖。它确保无论应用从终端还是 Finder/launchd 启动，都能正确发现 CLI 工具。

### PATH 合并顺序（优先级从高到低）

```
1. bundledBunDir              ← 最高优先级，内置 bun 运行时
2. process.env.PATH           ← 当前进程环境
3. shellEnv.PATH              ← 用户登录 shell 环境
4. 平台额外工具路径           ← 按平台扫描已知安装目录
5. customEnv.PATH             ← 调用者自定义（如有）
```

### 用户 Shell 环境加载

| 平台    | Shell 解析方式                             | 默认 Shell  | 加载命令            |
| ------- | ------------------------------------------ | ----------- | ------------------- |
| macOS   | `dscl . -read /Users/<username> UserShell` | `/bin/zsh`  | `<shell> -l -c env` |
| Linux   | `getent passwd <username>`                 | `/bin/bash` | `<shell> -l -c env` |
| Windows | 跳过 shell 环境加载                        | N/A         | N/A                 |

继承的环境变量白名单：`PATH`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`, `NODE_TLS_REJECT_UNAUTHORIZED`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`。

### 平台额外工具路径

**macOS / Linux:**

| 路径           | 用途         |
| -------------- | ------------ |
| `~/.bun/bin`   | bun 全局包   |
| `~/.cargo/bin` | Rust / cargo |
| `~/go/bin`     | Go           |
| `~/.deno/bin`  | Deno         |
| `~/.local/bin` | pip, pipx 等 |

**Windows:**

| 路径                                        | 用途                         |
| ------------------------------------------- | ---------------------------- |
| `%APPDATA%\npm`                             | npm 全局包                   |
| `%ProgramFiles%\nodejs`                     | Node.js 官方安装             |
| `%APPDATA%\nvm` / `%NVM_HOME%`              | nvm-windows                  |
| `%ProgramFiles%\nodejs` / `%NVM_SYMLINK%`   | nvm 活跃版本符号链接         |
| `%LOCALAPPDATA%\fnm_multishells`            | fnm-windows                  |
| `~\.volta\bin`                              | Volta                        |
| `~\scoop\shims` / `%SCOOP%\shims`           | Scoop                        |
| `%LOCALAPPDATA%\pnpm`                       | pnpm 全局                    |
| `%ChocolateyInstall%\bin`                   | Chocolatey                   |
| `%ProgramFiles%\Git\{cmd,bin,usr\bin}`      | Git for Windows (含 cygpath) |
| `%ProgramFiles(x86)%\Git\{cmd,bin,usr\bin}` | Git for Windows (x86)        |
| `C:\cygwin64\bin`, `C:\cygwin\bin`          | Cygwin                       |
| `~\.bun\bin`                                | bun 全局包                   |

所有路径仅在 **存在且不在当前 PATH 中** 时才追加。

## 检测的完整 CLI 列表

| Backend ID         | CLI 命令    | ACP 启动参数                         | 名称           |
| ------------------ | ----------- | ------------------------------------ | -------------- |
| `claude`           | `claude`    | `['--experimental-acp']`             | Claude Code    |
| `qwen`             | `qwen`      | `['--acp']`                          | Qwen Code      |
| `iflow`            | `iflow`     | `['--experimental-acp']`             | iFlow CLI      |
| `codex`            | `codex`     | `[]`                                 | Codex          |
| `codebuddy`        | `codebuddy` | `['--acp']`                          | CodeBuddy      |
| `goose`            | `goose`     | `['acp']`                            | Goose          |
| `auggie`           | `auggie`    | `['--acp']`                          | Augment Code   |
| `kimi`             | `kimi`      | `['acp']`                            | Kimi CLI       |
| `opencode`         | `opencode`  | `['acp']`                            | OpenCode       |
| `droid`            | `droid`     | `['exec', '--output-format', 'acp']` | Factory Droid  |
| `copilot`          | `copilot`   | `['--acp', '--stdio']`               | GitHub Copilot |
| `qoder`            | `qodercli`  | `['--acp']`                          | Qoder CLI      |
| `vibe`             | `vibe-acp`  | `[]`                                 | Mistral Vibe   |
| `openclaw-gateway` | `openclaw`  | `['gateway']`                        | OpenClaw       |
| `nanobot`          | `nanobot`   | `['--experimental-acp']`             | Nano Bot       |
| `cursor`           | `agent`     | `['acp']`                            | Cursor Agent   |
| `kiro`             | `kiro-cli`  | `['acp']`                            | Kiro           |

**不参与 CLI 检测的 backend：**

| Backend ID | 原因                                |
| ---------- | ----------------------------------- |
| `gemini`   | 内置 agent，始终可用，无需 CLI 检测 |
| `custom`   | 用户自定义，无 `cliCommand`         |
| `aionrs`   | 非 ACP 协议（JSON Lines），显式排除 |
| `remote`   | 无本地 CLI，通过 WebSocket URL 连接 |

## 合并与去重

合并顺序：**Aionrs > Gemini > Builtin > Other > Remote > Extension**

不做去重 — 同一 CLI 可以同时作为 builtin 和 extension 存在，由 UI 层区分展示。

## 刷新机制

| 方法                       | 刷新范围          | 清除 env 缓存 |
| -------------------------- | ----------------- | ------------- |
| `refreshBuiltinAgents()`   | 仅内置 CLI agents | 是            |
| `refreshExtensionAgents()` | 仅扩展贡献 agents | 是            |
| `refreshRemoteAgents()`    | 仅远程 agents     | 否            |
| `refreshAll()`             | 全部来源重新检测  | 是            |

所有 refresh 方法都会先移除对应类型的旧 agent，重新检测后追加。

## 初始化入口

| 启动模式   | 入口文件                                    | 调用方式                              |
| ---------- | ------------------------------------------- | ------------------------------------- |
| Electron   | `src/index.ts`                              | `initializeAcpDetector()` (异步并行)  |
| Standalone | `src/process/utils/initBridgeStandalone.ts` | `acpDetector.initialize()` (直接调用) |

## 消费者

| 文件                                            | 用途                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| `src/process/bridge/acpConversationBridge.ts`   | IPC bridge：获取 agent 列表、健康检查、模型探测 |
| `src/process/extensions/hub/HubInstaller.ts`    | 扩展安装后 refreshAll + 验证检测结果            |
| `src/process/extensions/hub/HubStateManager.ts` | 刷新内置 agents 以判断扩展安装状态              |
| `src/process/team/TeammateManager.ts`           | 为 Team 功能筛选可用 agent 类型                 |
| `src/process/channels/actions/SystemActions.ts` | 构建频道可选 agent 列表                         |

## 容错设计

1. **每个检测源独立 try/catch** — 单个来源失败不影响其他来源
2. **Gemini 始终注入** — 保证至少有一个可用 agent
3. **CLI 检测超时 1 秒** — 防止 `which`/`where` 阻塞
4. **Shell 环境加载超时 5 秒** — 防止异常 shell 配置阻塞启动
5. **Windows 双重回退** — `where` 失败自动尝试 PowerShell `Get-Command`
6. **初始化幂等** — `initialize()` 通过 `isDetected` 标志防止重复执行aa
7. **自定义 agent 不验证 CLI** — 跳过可用性检查，由用户负责
8. **env 缓存按需清除** — 每次 refresh 清除 `enhancedEnv`，确保捕获 PATH 变更

---

# Claude Code 连接流程追踪

> 核心文件链路：
> `AcpDetector.ts` → `acpConversationBridge.ts` → `AcpAgentManager.ts` → `AcpAgent (index.ts)` → `AcpConnection.ts` → `acpConnectors.ts`

## 连接全景图

```
用户选择 Claude Code → 发送消息
│
├── [IPC Bridge] acpConversationBridge
│   └── workerTaskManager.getOrBuildTask(conversationId)
│
├── [Task Manager] AcpAgentManager
│   ├── resolveCliPath('claude') → 'claude' 或用户配置路径
│   ├── new AcpAgent({ backend: 'claude', cliPath, ... })
│   └── agent.start()
│
├── [Agent] AcpAgent.start()
│   ├── connection.connect('claude', cliPath, workingDir)
│   ├── performAuthentication()
│   ├── createOrResumeSession()
│   ├── applyYoloMode() (if enabled)
│   └── applyModelFromSettings()
│
├── [Connection] AcpConnection.connect('claude')
│   └── doConnect() → switch('claude') → connectClaude()
│
├── [Connector] connectClaude()
│   └── connectNpxBackend({
│       npxPackage: '@zed-industries/claude-agent-acp@0.21.0',
│       prepareFn: prepareClaude,
│   })
│
├── [Spawn] spawnNpxBackend()
│   └── spawn(npxCommand, ['--yes', '--prefer-offline',
│       '@zed-industries/claude-agent-acp@0.21.0'], { stdio: 'pipe', detached: true })
│
├── [Protocol] setupChildProcessHandlers()
│   ├── stdout → NDJSON 解析 → handleMessage()
│   ├── stderr → 诊断缓冲
│   └── initialize() → JSON-RPC handshake
│
└── [Session] newSession() / sendPrompt()
    └── JSON-RPC over stdin/stdout
```

## 关键发现：Claude 不是直接启动的

**Claude Code 并非**通过 `claude --experimental-acp` 直接启动。实际启动的是一个 **npx bridge 包**：

```bash
# 实际执行的命令 (macOS)
/usr/local/bin/npx --yes --prefer-offline @zed-industries/claude-agent-acp@0.21.0
```

`@zed-industries/claude-agent-acp` 是由 Zed 维护的 ACP bridge，它在内部负责启动和管理 Claude Code CLI。AionUi 与这个 bridge 通过 stdin/stdout 上的 JSON-RPC (NDJSON) 进行通信。

## Phase 1: CLI 路径解析

**文件：`src/process/task/AcpAgentManager.ts`**

当 `backend === 'claude'` 时，路径解析逻辑：

1. 读取 `ProcessConfig.get('acp.config')` 检查用户是否配置了自定义 `cliPath`
2. 如果没有，回退到 `ACP_BACKENDS_ALL.claude.cliCommand` = `'claude'`
3. 对于 Claude，`acpArgs` 在 `ACP_BACKENDS_ALL` 中未定义，使用默认值 `['--experimental-acp']`

但这个 `cliPath` 和 `acpArgs` 实际上**不影响连接过程** — Claude 走的是 npx bridge 路径，不是 generic spawn。

## Phase 2: 环境准备 (prepareClaude)

**文件：`src/process/agent/acp/acpConnectors.ts:335-339`**

```typescript
async function prepareClaude(): Promise<NpxPrepareResult> {
  const cleanEnv = await prepareCleanEnv();
  ensureMinNodeVersion(cleanEnv, 20, 10, 'Claude ACP bridge');
  return { cleanEnv, npxCommand: resolveNpxPath(cleanEnv) };
}
```

### prepareCleanEnv() 做了什么

1. `loadFullShellEnvironment()` — 异步加载用户完整 shell 环境（`<shell> -i -l -c env`，包含 `.zshrc` 中导出的 API key 等）
2. `getEnhancedEnv()` — 合并 process.env + shell PATH + 平台工具路径 + bundled bun
3. 合并两者：`{ ...fullShellEnv, ...enhancedEnv }`
4. 清理有害变量：
   - 删除 `NODE_OPTIONS`, `NODE_INSPECT`, `NODE_DEBUG`
   - 删除 `CLAUDECODE`（防止嵌套检测）
   - 删除所有 `npm_*` 前缀变量（防止 npm lifecycle 干扰）

### Node 版本要求

Claude ACP bridge 要求 **Node.js >= 20.10**。如果检测到旧版本，会自动扫描 nvm/fnm/volta 目录寻找合适版本并修正 PATH。

## Phase 3: 进程启动 (spawnNpxBackend)

**文件：`src/process/agent/acp/acpConnectors.ts:298-332`**

### Phase 1/2 重试策略

```
Phase 1: npx --yes --prefer-offline @zed-industries/claude-agent-acp@0.21.0
         ↓ 失败?
Phase 2: npx --yes @zed-industries/claude-agent-acp@0.21.0  (无 --prefer-offline)
```

- **Phase 1**：使用 `--prefer-offline` 优先从本地 npm 缓存启动（~1-2s）
- **Phase 2**：Phase 1 失败后，去掉 `--prefer-offline` 从 npm registry 拉取（~3-5s）

### 实际 spawn 参数

```typescript
spawn(
  npxCommand,
  [
    '--yes', // 自动确认安装
    '--prefer-offline', // Phase 1 only
    '@zed-industries/claude-agent-acp@0.21.0',
  ],
  {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'], // stdin/stdout/stderr 全部 pipe
    env: cleanEnv,
    shell: false, // Unix 不使用 shell
    detached: true, // macOS/Linux: 创建新 session，防止 SIGTTOU
  }
);
child.unref(); // 允许父进程正常退出
```

### npm 缓存异常恢复

**文件：`src/process/agent/acp/AcpConnection.ts:214-261`**

如果连接失败，`connect()` 还有两层额外恢复：

1. **notarget/版本不匹配**：执行 `npm cache clean --force` 后重试
2. **npx 缓存损坏**（ENOENT/ERR_MODULE_NOT_FOUND）：删除整个 `~/.npm/_npx` 目录后重试

## Phase 4: 协议建立 (setupChildProcessHandlers)

**文件：`src/process/agent/acp/AcpConnection.ts:338-483`**

### stdout 解析 — NDJSON 协议

```typescript
let buffer = '';
child.stdout?.on('data', (data: Buffer) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // 保留不完整的最后一行

  for (const line of lines) {
    if (line.trim()) {
      const message = JSON.parse(line) as AcpMessage;
      this.handleMessage(message);
    }
  }
});
```

每行 stdout 是一个完整的 JSON-RPC 消息。协议为 **换行分隔的 JSON (NDJSON)**。

### 初始化握手

```typescript
await Promise.race([
  this.initialize(), // 发送 initialize 请求
  new Promise((reject) => setTimeout(reject, 60000)), // 60 秒超时
  processExitPromise, // 进程提前退出则立即失败
]);
```

### initialize 请求

**发出 (写入子进程 stdin)：**

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": { "protocolVersion": 1, "clientCapabilities": { "fs": { "readTextFile": true, "writeTextFile": true } } }
}
```

**收到：** 包含 `authMethods`、`agentCapabilities`（含 `mcpCapabilities`）等。

## Phase 5: 认证

**文件：`src/process/agent/acp/index.ts`**

Claude 的认证流程：

1. 检查 `initialize` 响应中的 `authMethods`
2. 先尝试直接创建 session
3. 如果认证失败，执行 `claude /login` 刷新 token
4. 重试 session 创建

## Phase 6: Session 创建

**文件：`src/process/agent/acp/AcpConnection.ts:884-928`**

```json
// 发出：
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{
  "cwd": ".",
  "mcpServers": [...],
  "_meta": {
    "claudeCode": {
      "options": {
        "resume": "<existing-session-id>"
      }
    }
  }
}}
```

Claude 特有：通过 `_meta.claudeCode.options.resume` 实现 session 恢复（其他 backend 使用 `resumeSessionId` 参数）。

响应包含 `sessionId`、`configOptions`（模型、模式）、`models`。

## Phase 7: 消息交换

### 发送 Prompt

**文件：`src/process/agent/acp/AcpConnection.ts:1005-1023`**

```json
// 发出：
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "session/prompt",
  "params": {
    "sessionId": "abc123",
    "prompt": [{ "type": "text", "text": "用户输入的消息" }]
  }
}
```

### 接收流式响应

子进程通过 stdout 发送 NDJSON 消息，由 `handleMessage()` 分发：

| 消息类型         | 判断条件             | 处理方式                                              |
| ---------------- | -------------------- | ----------------------------------------------------- |
| **Response**     | 有 `id`，无 `method` | 匹配 pendingRequests 中的 Promise，resolve/reject     |
| **Notification** | 有 `method`，无 `id` | 分发到 `handleIncomingRequest()`                      |
| **Request**      | 有 `method` 和 `id`  | 分发到 `handleIncomingRequest()`，处理后回写 response |

### 入站方法处理

| Method                       | 用途                         | 处理方式                                        |
| ---------------------------- | ---------------------------- | ----------------------------------------------- |
| `session/update`             | 流式内容、工具调用、思考过程 | → `AcpAgent` → `AcpAdapter` → 转换为 UI 消息    |
| `session/request_permission` | 工具权限请求                 | 暂停超时 → 弹出 UI 对话框 → 用户选择 → 回写结果 |
| `fs/read_text_file`          | 后端读取文件                 | 解析路径 → `readTextFile()` → 回写内容          |
| `fs/write_text_file`         | 后端写入文件                 | 解析路径 → `writeTextFile()` → 通知 UI          |

### 数据流向

```
AcpConnection.onSessionUpdate
  → AcpAgent.handleSessionUpdate()
    → AcpAdapter.convertSessionUpdate()  // 转换为 TMessage[]
    → AcpAgent.emitMessage()
      → AcpAgentManager.onStreamEvent callback
        → transformMessage() → addOrUpdateMessage() (DB)
        → ipcBridge.acpConversation.responseStream.emit() (to renderer)
```

## Phase 8: 取消和断开

### 取消当前 Prompt（不杀进程）

```json
{ "jsonrpc": "2.0", "method": "session/cancel", "params": { "sessionId": "abc123" } }
```

### 完全断开连接

```
AcpConnection.disconnect()
  → stopPromptKeepalive()
  → terminateChild()
    → killChild()
      macOS/Linux (detached): process.kill(-pid, 'SIGTERM')  // 杀进程组
      Windows: taskkill /PID <pid> /T /F
    → 等待最多 3 秒
  → 重置所有状态
```

## Claude 特有行为 vs 其他 Backend

| 特性              | Claude                                              | 其他 Backend                               |
| ----------------- | --------------------------------------------------- | ------------------------------------------ |
| **启动方式**      | npx bridge (`@zed-industries/claude-agent-acp`)     | 直接 spawn CLI (`goose acp`, `qwen --acp`) |
| **Session 恢复**  | `_meta.claudeCode.options.resume`                   | `resumeSessionId` 参数                     |
| **模型来源**      | 读取 `~/.claude/settings.json` 的 `ANTHROPIC_MODEL` | session/new 响应                           |
| **YOLO 模式**     | `'bypassPermissions'`                               | `'yolo'` (Qwen/iFlow)                      |
| **认证失败恢复**  | 执行 `claude /login` 刷新 token                     | 无特殊处理                                 |
| **模型切换**      | 注入 `<system-reminder>` 通知 AI 模型已变更         | 无                                         |
| **Node 版本要求** | >= 20.10                                            | >= 18.17 (generic)                         |
| **npx 缓存恢复**  | 支持 (NPX_BACKENDS 成员)                            | 不适用                                     |

## 涉及的模块总览

| 模块                    | 文件                       | 职责                                              |
| ----------------------- | -------------------------- | ------------------------------------------------- |
| `AcpDetector`           | `AcpDetector.ts`           | 检测系统已安装的 CLI agents                       |
| `acpConversationBridge` | `acpConversationBridge.ts` | renderer ↔ main 进程的 IPC 桥接                   |
| `AcpAgentManager`       | `AcpAgentManager.ts`       | 任务生命周期管理：创建 Agent、持久化、IPC 事件    |
| `AcpAgent`              | `index.ts`                 | 编排连接/认证/会话/消息流程；权限、模型切换       |
| `AcpConnection`         | `AcpConnection.ts`         | 核心协议：子进程管理、JSON-RPC 收发、session 状态 |
| `acpConnectors`         | `acpConnectors.ts`         | 各 backend 的 spawn 逻辑、环境准备、npx Phase 1/2 |
| `AcpAdapter`            | `AcpAdapter.ts`            | ACP session update → AionUi TMessage 格式转换     |
| `ApprovalStore`         | `ApprovalStore.ts`         | 会话级 "always allow" 权限缓存                    |
| `utils`                 | `utils.ts`                 | JSON-RPC stdin 写入、进程终止、文件 I/O           |
| `mcpSessionConfig`      | `mcpSessionConfig.ts`      | 构建 session/new 的 MCP server 列表               |
| `modelInfo`             | `modelInfo.ts`             | 从 configOptions/models 提取模型信息              |
| `constants`             | `constants.ts`             | 各 backend 的 YOLO mode 字符串                    |

---

# @zed-industries/claude-agent-acp 内部深度追踪

> 上文分析了 AionUi 侧如何通过 npx 启动 `@zed-industries/claude-agent-acp`。
> 本节深入 bridge 包内部，追踪它如何通过 `claude-code-sdk` 发现并驱动本地 Claude CLI。
>
> 源码参考：
>
> - Adapter: https://github.com/agentclientprotocol/claude-agent-acp (Apache-2.0)
> - Claude Agent SDK: https://github.com/anthropics/claude-agent-sdk-typescript
> - ACP SDK: https://github.com/agentclientprotocol/typescript-sdk

## 包归属变迁

该包已从 `@zed-industries/claude-agent-acp` (v0.23.1) 迁移至 `@agentclientprotocol/claude-agent-acp` (v0.25.3)，共享同一代码库。

## 内部依赖链

```
@agentclientprotocol/claude-agent-acp
  ├── @agentclientprotocol/sdk (0.17.0)         -- ACP 协议实现
  ├── @anthropic-ai/claude-agent-sdk (0.2.83+)   -- Claude Code SDK
  │     ├── @anthropic-ai/sdk (^0.80.0)          -- Anthropic API client
  │     ├── @modelcontextprotocol/sdk (^1.27.1)  -- MCP 协议
  │     └── cli.js                               -- 内嵌的 Claude Code CLI (~13MB)
  └── zod (^3.25.0 || ^4.0.0)
```

## 核心发现：不搜索 PATH，使用内嵌 CLI

**`claude-agent-acp` 不会从系统 PATH 搜索本地安装的 `claude` CLI。** 它始终使用 `@anthropic-ai/claude-agent-sdk` npm 包内部内嵌的 `cli.js`（版本锁定，如 Claude Code v2.1.92）。这个 `cli.js` 是一个 ~13MB 的自包含、压缩后的完整 Claude Code 运行时。

## 完整链路追踪

### Step 1: 入口 (`dist/index.js`)

```js
// --cli 模式: 直接运行 SDK 内嵌的 Claude CLI
if (process.argv.includes('--cli')) {
  await import(await claudeCliPath());
}

// 默认模式: 作为 ACP agent 运行
runAcp();
```

### Step 2: ACP Transport 建立 (`runAcp()`, `dist/acp-agent.js:1702`)

```js
export function runAcp() {
  const input = nodeToWebWritable(process.stdout);
  const output = nodeToWebReadable(process.stdin);
  const stream = ndJsonStream(input, output);
  new AgentSideConnection((client) => new ClaudeAcpAgent(client), stream);
}
```

适配器通过 **stdin/stdout NDJSON** 与上游 ACP client（AionUi / Zed 编辑器等）通信。`AgentSideConnection` 负责 JSON-RPC 分发。

### Step 3: 适配器如何调用 claude-code-sdk

从 SDK 导入三个关键函数：

```js
import { getSessionMessages, listSessions, query } from '@anthropic-ai/claude-agent-sdk';
```

| 函数                   | 用途                                     |
| ---------------------- | ---------------------------------------- |
| `query()`              | 核心函数：spawn CLI 子进程创建新 session |
| `listSessions()`       | 从磁盘列出现有 session                   |
| `getSessionMessages()` | 从之前的 session 检索消息用于回放        |

创建新 ACP session 时（`createSession` 方法, line 937）：

```js
const q = query({
  prompt: input, // AsyncIterable<SDKUserMessage> (Pushable)
  options, // session 配置
});
```

### Step 4: SDK 如何定位 CLI 二进制文件（关键路径）

在 `sdk.mjs` 内部，初始化函数解析可执行文件路径：

```js
// sdk.mjs 反混淆后的伪代码
let pathToClaudeCodeExecutable = options.pathToClaudeCodeExecutable;
if (!pathToClaudeCodeExecutable) {
  const currentDir = fileURLToPath(import.meta.url);
  const parentDir = path.join(currentDir, '..');
  pathToClaudeCodeExecutable = path.join(parentDir, 'cli.js');
}
```

**默认行为：使用 SDK 包目录下同级的 `cli.js`，不做任何 PATH 查找。**

适配器端的路径解析函数（`acp-agent.js:35`）：

```js
export async function claudeCliPath() {
  return isStaticBinary()
    ? (await import('@anthropic-ai/claude-agent-sdk/embed')).default
    : import.meta.resolve('@anthropic-ai/claude-agent-sdk').replace('sdk.mjs', 'cli.js');
}
```

### Step 5: 覆盖 CLI 路径的方式

| 机制                                                       | 优先级 | 说明                                             |
| ---------------------------------------------------------- | ------ | ------------------------------------------------ |
| `CLAUDE_CODE_EXECUTABLE` 环境变量                          | 最高   | 直接覆盖可执行文件路径                           |
| Static binary 模式 (`CLAUDE_AGENT_ACP_IS_SINGLE_FILE_BUN`) | 高     | Bun `--compile` 构建：从 `$bunfs` 提取到临时目录 |
| `options.pathToClaudeCodeExecutable`                       | 中     | SDK 层 API option                                |
| 默认 fallback                                              | 最低   | `path.join(dirname(import.meta.url), "cli.js")`  |

适配器中的环境变量检查（`acp-agent.js:1034`）：

```js
...(process.env.CLAUDE_CODE_EXECUTABLE
    ? { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE }
    : isStaticBinary()
        ? { pathToClaudeCodeExecutable: await claudeCliPath() }
        : {}),
```

Static binary 模式下（`bun build --compile`），`cli.js` 嵌入 Bun 虚拟文件系统。运行时 `extractFromBunfs()` 将其复制到 `/tmp/claude-agent-sdk-<sha256hash>/cli.js`，因为子进程无法访问 `$bunfs`。

### Step 6: 子进程 Spawn (ProcessTransport)

SDK 内的 `ProcessTransport` 类负责启动 CLI：

```js
// sdk.mjs 反混淆
const isNativeBinary =
  !pathToClaudeCodeExecutable.endsWith('.js') &&
  !pathToClaudeCodeExecutable.endsWith('.mjs') &&
  !pathToClaudeCodeExecutable.endsWith('.tsx') &&
  !pathToClaudeCodeExecutable.endsWith('.ts') &&
  !pathToClaudeCodeExecutable.endsWith('.jsx');

const command = isNativeBinary ? pathToClaudeCodeExecutable : executable;
// executable 默认: isBun ? "bun" : "node"

this.process = spawn(command, args, {
  cwd: cwd,
  stdio: ['pipe', 'pipe', stderrMode],
  signal: abortSignal,
  env: env,
  windowsHide: true,
});
```

传递的关键 CLI 参数：

| 参数                                            | 用途                           |
| ----------------------------------------------- | ------------------------------ |
| `--output-format stream-json`                   | CLI 输出 streaming JSON        |
| `--input-format stream-json`                    | CLI 接受 streaming JSON 输入   |
| `--verbose`                                     | 启用详细输出                   |
| `--permission-prompt-tool stdio`                | 权限请求通过 stdin/stdout 回传 |
| `--model`, `--max-turns`, `--thinking`, `--cwd` | 各种 session 配置              |

运行时继承（`acp-agent.js:1033`）：

```js
executable: isStaticBinary() ? undefined : process.execPath,
```

确保启动适配器的 Node.js 也用于运行 CLI 子进程。

### Step 7: SDK 与 CLI 之间的通信协议

通信基于子进程的 **stdin/stdout streaming NDJSON**：

- **Input (SDK → CLI)**: 用户消息通过 `ProcessTransport.write()` 以 JSON 行写入 stdin
- **Output (CLI → SDK)**: CLI 将 JSON 消息写入 stdout，每行一条，SDK 用 `readline.createInterface()` 逐行解析

CLI 输出的消息类型：

| 类型                 | 说明                                                    |
| -------------------- | ------------------------------------------------------- |
| `system`             | init, status, compact_boundary, session_state_changed   |
| `result`             | success, error_during_execution, error_max_turns        |
| `stream_event`       | content_block_start, content_block_delta, message_start |
| `user` / `assistant` | 包含 tool_use, text, thinking blocks 的对话消息         |
| `tool_progress`      | 工具执行进度                                            |
| `auth_status`        | 认证状态                                                |
| `rate_limit_event`   | 速率限制事件                                            |

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│          AionUi                                     │
│                                                     │
│  通过 npx 以子进程方式 spawn 适配器                 │
│  stdin/stdout NDJSON (JSON-RPC) 通信                │
└────────────────────┬────────────────────────────────┘
                     │ stdin/stdout (NDJSON, JSON-RPC)
                     ▼
┌─────────────────────────────────────────────────────┐
│      claude-agent-acp (ACP Agent Adapter)           │
│                                                     │
│  ClaudeAcpAgent: 翻译 ACP ↔ SDK 消息                │
│  AgentSideConnection: ACP JSON-RPC 分发             │
│  SettingsManager: 读取 .claude/settings.json        │
│  Permission 代理: canUseTool → requestPermission    │
└────────────────────┬────────────────────────────────┘
                     │ SDK query() API
                     ▼
┌─────────────────────────────────────────────────────┐
│       @anthropic-ai/claude-agent-sdk                │
│                                                     │
│  query(): 创建 ProcessTransport                     │
│  ProcessTransport: spawn cli.js 为子进程            │
│  默认路径:                                          │
│    path.join(dirname(import.meta.url), "cli.js")    │
└────────────────────┬────────────────────────────────┘
                     │ child_process.spawn()
                     │ stdin/stdout (streaming NDJSON)
                     ▼
┌─────────────────────────────────────────────────────┐
│    cli.js (内嵌 Claude Code ~13MB)                  │
│                                                     │
│  完整的 Claude Code 运行时                          │
│  --output-format stream-json                        │
│  --input-format stream-json                         │
│  --permission-prompt-tool stdio                     │
│  通过 HTTPS 与 Anthropic API 通信                   │
└─────────────────────────────────────────────────────┘
```

## 与上文 AionUi 侧的连接关系

AionUi 通过 npx 启动 `claude-agent-acp`（上文 Phase 3），bridge 进程启动后：

1. AionUi 与 bridge 之间 = **ACP 协议**（上文 Phase 4-8）
2. bridge 内部调用 `claude-code-sdk` 的 `query()` = **SDK API**（本节 Step 3-4）
3. SDK spawn `cli.js` 子进程 = **streaming NDJSON**（本节 Step 6-7）
4. `cli.js` 与 Anthropic API = **HTTPS**

整条链路共有 **三层子进程嵌套**：

```
AionUi (Electron main)
  → npx claude-agent-acp (Node.js)
    → node cli.js (Claude Code runtime)
      → HTTPS → api.anthropic.com
```
