# Sandbox 修复与 Lifecycle 进程隔离 — 实现方案

> 日期：2026-03-31 (问题 1-3) · 2026-04-01 (问题 4)
> PR：[#1991](https://github.com/iOfficeAI/AionUi/pull/1991) (问题 1-3)
> Issue：[#1990](https://github.com/iOfficeAI/AionUi/issues/1990)
> 关联：[research/sandbox-architecture.md](research/sandbox-architecture.md) · [research/security-model.md](research/security-model.md)

## 概述

本文档覆盖 4 个问题的实现方案：

| #   | 问题                     | 性质     | 影响                                 |
| --- | ------------------------ | -------- | ------------------------------------ |
| 1   | Worker→Host RPC 静默丢弃 | 功能 bug | `aion.storage.*` 调用永远 hang       |
| 2   | Worker→Host 事件静默丢弃 | 功能 bug | `emitEvent()` / `postToUI()` 无效    |
| 3   | Worker→Host 调用无超时   | 缺陷     | hang 后无法自行恢复                  |
| 4   | 生命周期钩子在主进程裸跑 | 架构问题 | `onInstall` 阻塞主线程，崩溃影响全局 |

---

## 问题 1：Worker→Host RPC 静默丢弃 (storage hang)

### 症状

扩展代码调用 `aion.storage.get/set/delete` 后永远不返回，整个扩展代码卡死。

### 根因

Worker 端 `callMainThread()` 发送 `{type: 'api-call'}` 消息到 Host，但 `SandboxHost.handleMessage()` 的 switch 没有 `case 'api-call'`，消息落入 `default: break` 被静默丢弃。Worker 端的 `pendingMainCalls` Promise 永远不会 resolve 或 reject。

```
sandbox.ts (修复前):

handleMessage(msg) {
  switch (msg.type) {
    case 'api-response': ...  // ← 只处理 Host→Worker 的响应
    case 'log': ...
    case 'event': break       // ← 空操作
    default: break            // ← api-call 落到这里, 静默丢弃
  }
}
```

### 修复方案

#### 1. SandboxHostOptions 新增 `apiHandlers`

通用的 handler map，不绑定具体 API。调用方决定注册哪些服务：

```typescript
// sandbox.ts
type SandboxApiHandler = (...args: unknown[]) => Promise<unknown> | unknown;

interface SandboxHostOptions {
  // ...existing
  apiHandlers?: Record<string, SandboxApiHandler>;
}
```

key 是 method 名（如 `'storage.get'`），与 Worker 端 `callMainThread(method, args)` 的 method 参数一一对应。

#### 2. handleMessage 新增 `case 'api-call'`

收到 Worker 的 api-call 后，路由到 apiHandlers，执行后回 api-response：

```typescript
// sandbox.ts — handleMessage()
case 'api-call': {
  this.handleWorkerApiCall(msg.id, msg.method, msg.args);
  break;
}
```

`handleWorkerApiCall` 的处理逻辑：

```
查 apiHandlers[method]
  ├── 无 handler → 回 {type:'api-response', id, error:'No handler registered for "xxx"'}
  ├── handler 是同步函数 → 执行，回 {type:'api-response', id, result}
  ├── handler 返回 Promise → await，回 {type:'api-response', id, result}
  └── handler 抛异常 → 回 {type:'api-response', id, error: String(e)}
```

无 handler 时回 error response 而不是静默丢弃——Worker 端的 Promise 会 reject，扩展代码能 catch 到错误。

#### 3. ExtensionStorage 作为 storage 后端

JSON 文件 KV 存储，每个扩展一个文件 `~/.aionui/extension-storage/{name}.json`：

```typescript
// ExtensionStorage.ts
class ExtensionStorage {
  async get(extensionName: string, key: string): Promise<unknown>;
  async set(extensionName: string, key: string, value: unknown): Promise<void>;
  async delete(extensionName: string, key: string): Promise<void>;

  // 生成绑定到特定扩展名的 apiHandlers map
  createApiHandlers(extensionName: string): Record<string, SandboxApiHandler>;
}
```

`createApiHandlers()` 返回的 key 与 `sandboxWorker.ts` 中 `callMainThread()` 的 method 名精确对应：

| Worker 端调用                  | callMainThread method | apiHandlers key    |
| ------------------------------ | --------------------- | ------------------ |
| `aion.storage.get(key)`        | `'storage.get'`       | `'storage.get'`    |
| `aion.storage.set(key, value)` | `'storage.set'`       | `'storage.set'`    |
| `aion.storage.delete(key)`     | `'storage.delete'`    | `'storage.delete'` |

**当前状态**：ExtensionStorage 已实现但未接入（`createSandbox()` 尚无调用方）。待 ChannelPlugin/Lifecycle 迁移到 Sandbox 时通过 apiHandlers 注入。

---

## 问题 2：Worker→Host 事件静默丢弃

### 症状

扩展调用 `aion.emitEvent()` 或 `aion.postToUI()`，事件消息从未到达 `extensionEventBus` 或渲染进程。

### 根因

`handleMessage()` 的 `case 'event'` 只有一个空 `break`，注释写着 "handled by event bus" 但无任何代码。

### 修复方案

#### 1. 按 name 字段路由到两条通道

Worker 端两个 API 复用同一个 `{type:'event'}` 消息类型，通过 `name` 区分目标：

| Worker API                   | 消息 name                   | Host 路由目标       |
| ---------------------------- | --------------------------- | ------------------- |
| `aion.postToUI(data)`        | `'ui-message'`（固定）      | `onUIMessage` 回调  |
| `aion.emitEvent(name, data)` | `'ext:{eventName}'`（动态） | `extensionEventBus` |

```typescript
// sandbox.ts — handleMessage()
case 'event': {
  const { name, payload } = msg;
  if (name === 'ui-message') {
    this.options.onUIMessage?.(this.options.extensionName, payload);
  } else if (name.startsWith('ext:')) {
    extensionEventBus.emitExtensionEvent(
      this.options.extensionName,
      name.slice(4), // 去掉 'ext:' 前缀
      payload,
    );
  }
  break;
}
```

#### 2. SandboxHostOptions 新增 `onUIMessage`

```typescript
type SandboxUIMessageHandler = (extensionName: string, payload: unknown) => void;

interface SandboxHostOptions {
  // ...existing
  onUIMessage?: SandboxUIMessageHandler;
}
```

SandboxHost 不关心消息怎么到渲染进程，只负责交给回调。调用方注入 IPC 转发逻辑。

---

## 问题 3：Worker→Host 调用无超时

### 症状

`callMainThread()` 创建的 Promise 没有超时。结合问题 1（消息被丢弃），Worker 端永远 hang，无法自行恢复。

### 修复

```typescript
// sandboxWorker.ts — callMainThread()
const CALL_MAIN_TIMEOUT = 30_000;

function callMainThread(method: string, args: unknown[]): Promise<unknown> {
  const id = `w-${++callIdCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingMainCalls.delete(id);
      reject(new Error(`Call "${method}" timed out after ${CALL_MAIN_TIMEOUT}ms`));
    }, CALL_MAIN_TIMEOUT);

    pendingMainCalls.set(id, { resolve, reject, timer });
    port.postMessage({ type: 'api-call', id, method, args });
  });
}
```

`api-response` handler 中对应加 `clearTimeout(pending.timer)`。

---

## 问题 4：生命周期钩子在主进程裸跑

### 症状

`onInstall` 等钩子通过 `eval('require')` 直接在 Electron 主进程加载执行。当钩子运行重操作（如 `bun add -g @anthropic-ai/claude-code`）时：

- **阻塞主线程事件循环** — UI 无响应，IPC 消息积压，用户体验为"卡死"
- **崩溃影响全局** — 钩子里的未捕获异常、`process.exit()`、native 模块 crash 直接终止整个应用
- **无超时保护** — 死循环或网络卡住时无法自行恢复

### 根因

```typescript
// lifecycle.ts (修复前)
const nativeRequire = eval('require');
const mod = nativeRequire(scriptPath); // ← 在主进程加载
const hookFn = mod.default || mod[hookName] || mod;
hookFn(context); // ← 在主进程执行，同步代码阻塞事件循环
```

钩子代码与主进程共享同一个事件循环、同一个进程空间。没有任何隔离。

### 方案选择

| 方案                       | 隔离级别   | 阻塞主线程? | 崩溃影响              | 复杂度 |
| -------------------------- | ---------- | ----------- | --------------------- | ------ |
| ~~主进程 eval('require')~~ | 无         | 是          | 致命                  | 低     |
| Worker Thread              | 线程级     | 否          | process.exit() 仍致命 | 中     |
| **child_process.fork()**   | **进程级** | **否**      | **无影响**            | **中** |

选择 `child_process.fork()`：

- 独立 Node.js 进程，完全不共享事件循环
- 子进程崩溃、`process.exit()`、native crash 都不影响主进程
- 超时后可 `SIGKILL` 强杀，主进程继续运行
- 比 Worker Thread 更彻底的隔离（进程级 vs 线程级）

### 适用范围：所有钩子统一走子进程

逐个分析 10 种 contribution 类型的安装需求后，发现只有少数类型（acpAdapters、mcpServers、channelPlugins）的 onInstall 需要重操作（装依赖、下载二进制），其余纯声明式类型（assistants、skills、themes 等）根本不需要 onInstall 或只做轻量操作：

| #   | contribution 类型 | 安装时做什么               | 需要子进程?          |
| --- | ----------------- | -------------------------- | -------------------- |
| 1   | `acpAdapters`     | `bun add -g` 装 CLI 二进制 | 是 — 网络下载 + 编译 |
| 2   | `mcpServers`      | 可能装 MCP server 依赖     | 可能                 |
| 3   | `assistants`      | 无（纯声明）               | 不需要               |
| 4   | ~~`agents`~~      | 无（待废弃）               | 不需要               |
| 5   | `skills`          | 无（纯声明）               | 不需要               |
| 6   | `themes`          | 无（纯声明）               | 不需要               |
| 7   | `channelPlugins`  | 可能 `npm install`         | 可能                 |
| 8   | `webui`           | 可能构建前端               | 可能                 |
| 9   | `settingsTabs`    | 无（纯声明）               | 不需要               |
| 10  | `modelProviders`  | 无（纯声明）               | 不需要               |

但 lifecycle hooks 是 **extension 级别**的，不是 contribution 级别的。一个 extension 可以同时贡献多种类型，系统无法从 contribution 类型推断 onInstall 里做了什么。

考虑过的方案：

1. ~~manifest 显式声明 `lifecycle.heavy: true`~~ — 增加了 API 复杂度，钩子作者容易忘标
2. ~~按钩子名判断（onInstall 走子进程，onActivate 走主进程）~~ — 不够通用，onActivate 也可能做重操作
3. **全部走子进程** — fork 开销 ~50-100ms，对钩子场景（低频、非热路径）可接受
4. ~~全部走主进程 + 超时~~ — 不解决阻塞和崩溃问题

**决策：全部走子进程（方案 3）。** 理由：一致性优于微优化。钩子执行是低频操作（安装/卸载/启用/禁用时才触发），50-100ms 的 fork 开销用户无感知。

- 子进程崩溃、`process.exit()`、native crash 都不影响主进程
- 超时后可 `SIGKILL` 强杀，主进程继续运行
- 比 Worker Thread 更彻底的隔离（进程级 vs 线程级）

### 实现方案

#### 1. 子进程 runner 脚本 (`lifecycleRunner.ts`)

子进程的入口。通过 IPC 接收钩子详情，执行后报告结果：

```
协议:
  Main → Child:  { scriptPath, hookName, context }
  Child → Main:  { success: true } | { success: false, error: string }
```

```typescript
// lifecycleRunner.ts
process.on('message', async (msg) => {
  try {
    const mod = eval('require')(msg.scriptPath);
    const hookFn = mod.default || mod[msg.hookName] || mod;

    if (typeof hookFn !== 'function') {
      process.send({ success: false, error: 'Not a callable function' });
      process.exit(1);
      return;
    }

    const result = hookFn(msg.context);
    if (result?.then) await result; // 支持 async hook

    process.send({ success: true });
    process.exit(0);
  } catch (error) {
    process.send({ success: false, error: String(error) });
    process.exit(1);
  }
});
```

#### 2. 改造 `runLifecycleHook()` 使用 fork

```typescript
// lifecycle.ts
import { fork } from 'child_process';

async function runLifecycleHook(extension, hookName, scriptRelativePath): Promise<boolean> {
  // ... 路径安全检查、文件存在检查（不变）...

  const runnerScript = path.join(__dirname, 'lifecycleRunner.js');

  return new Promise((resolve) => {
    const child = fork(runnerScript, [], {
      cwd: extension.directory, // 钩子工作目录 = 扩展目录
      env: process.env, // 继承环境变量（含 PATH、registry 配置等）
      silent: false, // 钩子的 console.log 直接可见
    });

    const timer = setTimeout(() => {
      settle(false, 'timed out');
      child.kill('SIGKILL'); // 超时强杀
    }, timeout);

    child.on('message', (msg) => settle(msg.success, msg.error));
    child.on('error', (err) => settle(false, err.message));
    child.on('exit', (code) => {
      if (code !== 0) settle(false, `exit ${code}`);
    });

    child.send({ scriptPath, hookName, context });
  });
}
```

#### 3. 按钩子类型差异化超时 + 开发者可配置

系统提供默认超时，但扩展开发者可以按钩子覆盖：

**默认超时（系统提供）：**

| 钩子           | 默认超时     | 理由                                                |
| -------------- | ------------ | --------------------------------------------------- |
| `onInstall`    | 120s (2 min) | 可能执行 `bun add -g`，下载二进制，编译 native 模块 |
| `onUninstall`  | 60s (1 min)  | 清理操作，可能删文件、卸载                          |
| `onActivate`   | 30s          | 轻量初始化                                          |
| `onDeactivate` | 30s          | 轻量清理                                            |

**开发者覆盖（manifest 声明）：**

lifecycle hook 支持两种格式，向后兼容：

```jsonc
{
  "lifecycle": {
    // 旧格式: 纯字符串，使用系统默认超时
    "onActivate": "scripts/activate.js",

    // 新格式: 对象，可自定义超时 (ms)
    "onInstall": { "script": "scripts/install.js", "timeout": 180000 },
    "onDeactivate": { "script": "scripts/deactivate.js", "timeout": 5000 },
  },
}
```

**Manifest Schema 变更：**

```typescript
// types.ts — lifecycle 字段的每个 hook
z.union([
  z.string(), // 旧格式: "scripts/activate.js"
  z.object({
    script: z.string(), // 脚本路径
    timeout: z.number().int().positive().optional(), // 超时 (ms), 不填用默认值
  }),
]).optional();
```

**解析逻辑：**

```
hook 值是 string        → script = 值,  timeout = 默认值
hook 值是 { script, timeout }  → script = script, timeout = timeout ?? 默认值
hook 值是 { script }    → script = script, timeout = 默认值
```

#### 4. 错误处理策略

钩子失败是**非致命**的。不管什么原因失败，主进程都继续运行：

```
子进程 message {success: false}  → 记录错误，返回 false
子进程 error 事件               → 记录错误，返回 false（spawn 失败等）
子进程 exit code !== 0          → 记录错误，返回 false（崩溃、未处理异常）
超时                            → 记录错误，SIGKILL 子进程，返回 false
正常完成                        → 记录成功，返回 true
```

调用方 (`activateExtension` 等) 不因钩子失败而中断。扩展仍然会被激活/停用，只是钩子没跑完。

### 修复前后对比

```
修复前:
┌────────────────────────────────────────┐
│          Electron 主进程               │
│                                        │
│  ExtensionRegistry.init()              │
│    → activateExtension()               │
│      → eval('require')(hookScript)     │
│      → hookFn(context)  ← 阻塞!        │
│        └── bun add -g ... (30-60s)     │
│            主线程卡死, UI 无响应       │
│                                        │
│  IPC / UI / 其他操作 ← 全部等待        │
└────────────────────────────────────────┘

修复后:
┌────────────────────────────────────────┐
│          Electron 主进程               │
│                                        │
│  ExtensionRegistry.init()              │
│    → activateExtension()               │
│      → fork(lifecycleRunner)           │
│      → await IPC message (非阻塞)      │
│                                        │
│  IPC / UI / 其他操作 ← 正常运行        │
└─────────────┬──────────────────────────┘
              │ child_process.fork()
┌─────────────▼──────────────────────────┐
│          子进程 (独立 Node.js)         │
│                                        │
│  require(hookScript)                   │
│  hookFn(context)                       │
│    └── bun add -g ... (随便跑多久)     │
│                                        │
│  完成 → process.send({success: true})  │
│  崩溃 → 主进程收到 exit event, 不受影响│
└────────────────────────────────────────┘
```

---

## 变更文件清单 (问题 1-3, PR #1991)

| 文件                                                        | 变更                                                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/process/extensions/sandbox/sandbox.ts`                 | `handleMessage()` 加 `case 'api-call'` 和 `case 'event'` 路由；新增 `handleWorkerApiCall()`；Options 新增 `apiHandlers` / `onUIMessage` |
| `src/process/extensions/sandbox/sandboxWorker.ts`           | `callMainThread()` 加 30s 超时；`api-response` handler 加 `clearTimeout`                                                                |
| `src/process/extensions/sandbox/ExtensionStorage.ts`        | 新文件。JSON KV 存储，`createApiHandlers()` 生成 storage handler map                                                                    |
| `src/process/extensions/index.ts`                           | 导出新类型和 ExtensionStorage                                                                                                           |
| `src/process/extensions/resolvers/ChannelPluginResolver.ts` | TODO 注释：迁移到 Worker Thread                                                                                                         |
| `tests/unit/extensions/sandboxHost.test.ts`                 | 新文件。13 个测试覆盖 api-call 路由、event 路由、api-response                                                                           |
| `tests/unit/extensions/extensionStorage.test.ts`            | 新文件。10 个测试覆盖 get/set/delete、隔离、持久化、损坏恢复                                                                            |

## 变更文件清单 (问题 4)

| 文件                                                  | 变更                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/process/extensions/types.ts`                     | lifecycle hook schema 从 `z.string()` 改为 `z.union([z.string(), z.object({script, timeout?})])`                   |
| `src/process/extensions/lifecycle/lifecycle.ts`       | `runLifecycleHook()` 改用 `child_process.fork()`；解析 string/object 两种 hook 格式；差异化超时 + 开发者可配置超时 |
| `src/process/extensions/lifecycle/lifecycleRunner.ts` | 新文件。子进程 runner，通过 IPC 接收钩子详情并执行                                                                 |
| `tests/unit/extensions/lifecycle.test.ts`             | 新文件。12 个测试覆盖正常执行、错误处理、子进程通信                                                                |

---

## 测试覆盖

### SandboxHost (13 cases)

**api-call routing (问题 1 fix)**

- 同步 handler 正常返回 → api-response with result
- 异步 handler resolve → api-response with result
- 同步 handler throw → api-response with error
- 异步 handler reject → api-response with error
- 无 handler 注册 → api-response with "No handler registered" error
- apiHandlers 未提供 → 同上

**event routing (问题 2 fix)**

- `ext:*` 事件 → extensionEventBus 收到
- `ui-message` → onUIMessage 回调被调用
- onUIMessage 未提供 → 不抛异常
- 非 `ext:` 非 `ui-message` → 两者都不触发

**api-response (回归测试)**

- 正常 result → pending call resolve
- error → pending call reject

### ExtensionStorage (10 cases)

- 不存在的 key → null
- set → get 往返
- 复杂对象持久化
- delete 后 → null
- delete 不存在的 key → 不抛异常
- 扩展间数据隔离
- JSON 文件落盘验证
- 新实例从磁盘恢复
- 损坏的 JSON 文件 → 优雅降级
- createApiHandlers 集成测试

### Lifecycle fork (12 cases)

**activateExtension**

- isFirstTime=true → fork 两次（onInstall + onActivate）
- isFirstTime=false → fork 一次（仅 onActivate）
- 无 lifecycle 声明 → 不 fork

**runLifecycleHook (通过公共 API 测试)**

- 脚本不存在 → 优雅跳过，不 fork
- 路径逃逸 → 拒绝，不 fork
- 子进程 error 事件 → 不抛异常
- 子进程非零退出 → 不抛异常
- 子进程返回失败消息 → 不抛异常
- fork 时 cwd 设为扩展目录
- 发送给子进程的 payload 正确

**deactivateExtension / uninstallExtension**

- 各 fork 一次对应钩子
