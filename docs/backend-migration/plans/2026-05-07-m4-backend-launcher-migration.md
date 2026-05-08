# M4 backend-launcher 迁入 web-host + 桌面 IPC 接入 实施计划

> **给执行 agent**:本计划自包含。只读本文件和下方"参考文档"列出的文件,
> 不要读其他 Mx 计划 —— 它们依赖 M4 或与 M4 无关,读了会污染上下文。
> 本文中所有代码示例都要以**本文件贴出的最终形态**为准,不要自创"更优写法"。

**目标**:把 `packages/desktop/src/process/backend/lifecycleManager.ts` 完整迁到
`packages/web-host/src/backend-launcher.ts`,脱 Electron 依赖(`app.*` 改为构造时
注入的 `AppMetadata`),保留所有现有行为(`buildSpawnArgs` / `buildSpawnEnv` /
`findAvailablePort` / `BackendLifecycleManager` 类 / crash 重启策略);同时让桌面
IPC 入口(`packages/desktop/src/index.ts`)从 import 本地 `lifecycleManager` 切到
import `@aionui/web-host`,构造时注入 `AppMetadata` 和本地 `binaryResolver` 实现
的 `BackendBinaryResolver`。最后**删除** `lifecycleManager.ts`。

**架构**:纯迁移型重构。运行期行为不变(spawn 参数、健康检查超时、crash 重启窗口、
SIGTERM/SIGKILL 语义),只改代码位置和依赖注入方式。

**边界(不做)**:
- ❌ **不改** `packages/desktop/src/process/backend/binaryResolver.ts`(本里程碑
  它仍保持"bundled → PATH"的现状实现,作为桌面壳注入给 web-host 的 resolver)。
  UC-2 的完整分档(生产严格、开发 fallback)由后续 M7/M8/M9 落地
- ❌ **不实现** `startWebHost`(web-host/src/index.ts 中 M5 才会实现)
- ❌ **不实现** `startStaticServer` / auth(M5)
- ❌ **不碰** `useExistingBackend` 分支逻辑(M6)
- ❌ **不碰** `packages/desktop/src/renderer/` / `preload/`(前端无感知)
- ❌ **不改** Electron `--webui` 模式的 `src/process/webserver/`(M6 才切换)
- ❌ **不改** 任何 IPC bridge 接口签名

---

## 零上下文会话背景

你正在执行 9 个里程碑重构中的第 4 个(M4),目标是把 AionUi 的 WebUI 从
Electron 解耦。完整设计在
`docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md`。
团队协作契约在
`docs/backend-migration/plans/2026-05-07-webui-decouple-teammate-cheatsheet.md`。

**M4 的交付物**:
- `packages/web-host/src/backend-launcher.ts` 具备与原
  `packages/desktop/src/process/backend/lifecycleManager.ts` 等价的完整运行期行为,
  并且**不 import electron**
- `packages/web-host/src/backend-launcher.test.ts` 全 mock 覆盖:
  spawn 参数构造 / health 成功 / health 超时 / crash 重启 / SIGTERM-SIGKILL 停机
- `packages/desktop/src/process/backend/lifecycleManager.ts` 已**删除**
- `packages/desktop/src/process/backend/index.ts` 不再 re-export `lifecycleManager`
  的符号,改为从 `@aionui/web-host` 引入(或直接在 `src/index.ts` 引入)
- `packages/desktop/src/index.ts` 的 `BackendLifecycleManager` 来自 web-host,
  并在构造/启动时显式注入 `AppMetadata` + 桌面版 `resolveBinaryPath`
- `bun run dev` 启动后 backend 日志(`[aionui-backend] listening on port XXXXX`)
  与迁移前一致;`curl /health` 返回 200

**M4 不做的事**:不改 `binaryResolver.ts` 行为;不实现 `startWebHost`;不动
webserver;不碰 preload/IPC;不动前端任何一行代码。

**开始前的前置条件**:
- `git status` 干净
- 已装 Node 22+、bun、ripgrep(`rg` / 失败可用 `grep -rn` 替代)
- 本地能跑 `bun install` / `bun run dev`(Electron dev 启动)
- M3 上游分支 `origin/feat/m3-web-host-skeleton` 已存在(web-host 骨架就绪,
  `backend-launcher.ts` 是占位签名 `throw new Error('M4: startBackend not implemented yet')`)

**分支**:基于 `origin/feat/m3-web-host-skeleton` 创建
`feat/m4-backend-launcher-migration`(**不是** 基于 `main`,**不是** 基于
`feat/backend-migration`):

```bash
git fetch origin
git checkout -b feat/m4-backend-launcher-migration origin/feat/m3-web-host-skeleton
git rev-parse --abbrev-ref HEAD   # 应为 feat/m4-backend-launcher-migration
```

**不创建 PR,不 push/merge 到 `feat/backend-migration`,不 rebase 上游**。

---

## 参考文档(只读这些,不要扩散)

1. `docs/backend-migration/plans/2026-05-07-webui-decouple-teammate-cheatsheet.md`
   —— 完整读,尤其是"分支规则" / "基线同步三步" / "UC 摘要" / "遇到状况怎么办"
2. `docs/backend-migration/plans/2026-05-07-m4-backend-launcher-migration-requirements.md`
   —— 本里程碑 requirements,最高优先级
3. `docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md`
   —— 只读 **"统一约束补充"(UC-1/UC-2/UC-3)** / **"目标形态"** / **"改造要点 A"**
   三节。其他节的具体步骤属于后续里程碑,读了会污染
4. `docs/backend-migration/handoffs/M1-outcome.md` + `M2-outcome.md`
   —— 了解上游改动面(monorepo 结构 + aionrs 已清空)
5. 若存在 `docs/backend-migration/handoffs/M3-outcome.md` —— 读之核对接口签名是否
   有微调(本 plan 已按 `packages/web-host/src/backend-launcher.ts` 和 `types.ts`
   的 M3 占位实际签名对齐)

---

## 文件清单

**修改**:
- `packages/web-host/src/backend-launcher.ts`(改写,替换 M3 占位签名为真实实现)
- `packages/web-host/src/index.ts`(新增 `startBackend` / `stopBackend` /
  `BackendLifecycleManager` / `buildSpawnArgs` / `buildSpawnEnv` /
  `findAvailablePort` / `BackendDirConfig` / `BackendLaunchOptions` / `BackendHandle`
  的 re-export)
- `packages/web-host/src/backend-launcher.test.ts`(重写为真实 mock 测试)
- `packages/desktop/src/process/backend/index.ts`(不再导出 `BackendLifecycleManager`
  及 `buildSpawnArgs` / `buildSpawnEnv` / `findAvailablePort` / `BackendDirConfig`;
  只保留 `resolveBinaryPath` 的本地导出)
- `packages/desktop/src/index.ts`(改 import 为 `@aionui/web-host`,
  注入 `AppMetadata` + `resolveBinaryPath`)
- `packages/desktop/package.json`(新增 `"@aionui/web-host": "workspace:*"` 依赖)

**删除**:
- `packages/desktop/src/process/backend/lifecycleManager.ts`

**新建**:
- 无

**验证不回退**(只跑,不改):
- `bun run dev`(桌面 IPC 模式 backend 启动日志 + `/health` 响应)
- `cd packages/web-host && bunx vitest run backend-launcher.test.ts`
- 仓库根 `bun test`(回归,确认未破坏既有测试)
- `bun run lint` / `bunx tsc --noEmit`
- 依赖边界 grep(见阶段 11)

---

## 阶段 0:工具预检 + 基线快照 + 建分支

- [ ] **步骤 0.1:工具预检**

```bash
command -v node && node --version           # 预期 22+
command -v bun && bun --version             # 预期可用
command -v curl && curl --version | head -1
command -v grep
# 可选:ripgrep(如果装了就用 rg,后续命令也给了 grep fallback)
command -v rg || echo "rg 不存在,使用 grep 替代"
# 可选:lsof(只在验证 /health 端口时用)
command -v lsof || echo "lsof 不存在,可用 ss 或 netstat 替代"
```

任一必需工具缺失(`node` / `bun` / `curl` / `grep`)→ 不硬装,escalate 给
team-lead,终止执行。

- [ ] **步骤 0.2:记录基线状态**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git status -sb > /tmp/m4-baseline-gitstatus.log
cat /tmp/m4-baseline-gitstatus.log
```

预期:干净(只显示 `## <branch>...`)。如果有未提交改动 → stash 或 escalate,
**不要**带着脏工作区开工。

```bash
# 当前测试通过数作为回归基线
cd /Users/zhoukai/Documents/github/AionUi
bun test 2>&1 | tail -10 > /tmp/m4-baseline-test.log
cat /tmp/m4-baseline-test.log
```

- [ ] **步骤 0.3:从 `origin/feat/m3-web-host-skeleton` 创建新分支**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git fetch origin
git fetch origin feat/m3-web-host-skeleton
git checkout -b feat/m4-backend-launcher-migration origin/feat/m3-web-host-skeleton
git branch --show-current    # 预期 feat/m4-backend-launcher-migration
git merge-base --is-ancestor origin/feat/m3-web-host-skeleton HEAD && echo "base OK"
```

**诊断**:
- 如果 `git fetch origin feat/m3-web-host-skeleton` 失败(404 等)→ 上游 M3
  尚未推送。**不要**改为基于 `feat/backend-migration` 自主开工,escalate 给
  team-lead 确认 M3 状态
- 如果 `base OK` 没输出 → 分支基线错了,`git checkout -` 回退,重来

- [ ] **步骤 0.4:记录 M3 签名基线(供阶段 1 写入 launcher 时核对)**

```bash
# 核对 M3 产物的接口签名,本 plan 所有代码都基于这里为准
cat packages/web-host/src/types.ts
cat packages/web-host/src/backend-launcher.ts
cat packages/web-host/src/index.ts
```

**核对要点**:
- `AppMetadata` 必须含 `{ version, isPackaged, resourcesPath, userDataPath }`(4 字段)
- `BackendBinaryResolver = () => string`
- `BackendLaunchOptions` 含 `{ app, resolveBackend, port?, dataDir?, logDir? }`
- `BackendHandle` 含 `{ port, stop: () => Promise<void> }`
- 现有 `startBackend` / `stopBackend` 为占位 `throw`

**如果 M3 handoff 报告接口与上述签名不一致**(如少了字段、类型变了)→ 不要
自主扩展,escalate 给 team-lead 修 M3 的 types.ts。

- [ ] **步骤 0.5:记录 lifecycleManager 当前 import 列表(供阶段 1 判定依赖)**

```bash
grep -nE "^import" packages/desktop/src/process/backend/lifecycleManager.ts
```

预期输出(M4 开工基线,与本 plan 贴的代码一致):

```
8:import { type ChildProcess, spawn } from 'node:child_process';
9:import { createServer } from 'node:net';
10:import { app } from 'electron';
11:import { resolveBinaryPath } from './binaryResolver';
```

**如果行号或内容与上面不一致**,说明上游基线变了,escalate 给 team-lead。

---

## 阶段 1:把 lifecycleManager 迁入 web-host(脱 Electron)

本阶段只写 `packages/web-host/src/backend-launcher.ts`,**不删旧文件**(阶段 4 再删),
**不改 desktop 调用点**(阶段 3 再改)。

- [ ] **步骤 1.1:用以下内容**覆盖** `packages/web-host/src/backend-launcher.ts`**

替换整个文件内容(现有文件只有 M3 占位,约 30 行,整体 Write):

```ts
/**
 * Lifecycle manager for the aionui-backend subprocess (web-host version).
 *
 * Migrated from packages/desktop/src/process/backend/lifecycleManager.ts in M4.
 * Electron dependency removed: `app.*` replaced with constructor-injected
 * `AppMetadata`, and binary path resolved by injected `BackendBinaryResolver`.
 * Runtime behavior (spawn args, /health timeout, SIGTERM/SIGKILL, crash
 * restart window) is byte-for-byte preserved from the original.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import type { AppMetadata, BackendBinaryResolver } from './types.js';

type BackendStatus = 'stopped' | 'starting' | 'running' | 'error';

type SpawnConfig = {
  port: number;
  dbPath: string;
  local: boolean;
  logDir?: string;
  appVersion: string;
  isPackaged: boolean;
};

export type BackendDirConfig = {
  cacheDir: string;
  workDir: string;
  logDir: string;
};

export type BackendLaunchOptions = {
  app: AppMetadata;
  resolveBackend: BackendBinaryResolver;
  port?: number;
  dataDir?: string;
  logDir?: string;
};

export type BackendHandle = {
  port: number;
  stop: () => Promise<void>;
};

export function buildSpawnArgs(config: SpawnConfig): string[] {
  const logLevel = process.env.AIONUI_LOG_LEVEL || (config.isPackaged ? 'info' : 'debug');
  const args = [
    '--port',
    String(config.port),
    '--data-dir',
    config.dbPath,
    '--log-level',
    logLevel,
    '--app-version',
    config.appVersion,
  ];
  if (config.logDir) args.push('--log-dir', config.logDir);
  if (config.local) args.push('--local');
  return args;
}

/**
 * Backend reads AIONUI_{CACHE,WORK,LOG}_DIR env vars to report system dirs
 * (see aionui-backend/crates/aionui-system/src/sysinfo.rs). Inject them so the
 * backend's `/api/system/info` matches what Electron main persists in
 * ProcessEnv('aionui.dir').
 */
export function buildSpawnEnv(dirs: BackendDirConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AIONUI_CACHE_DIR: dirs.cacheDir,
    AIONUI_WORK_DIR: dirs.workDir,
    AIONUI_LOG_DIR: dirs.logDir,
  };
}

export function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
  });
}

export class BackendLifecycleManager {
  private childProcess: ChildProcess | null = null;
  private _port = 0;
  private _status: BackendStatus = 'stopped';
  private _lastDbPath = '';
  private _lastLogDir?: string;
  private _lastDirs?: BackendDirConfig;
  private restartCount = 0;
  private restartWindowStart = 0;
  private readonly maxRestarts = 3;
  private readonly restartWindowMs = 60_000;

  constructor(
    private readonly appMeta: AppMetadata,
    private readonly resolveBackend: BackendBinaryResolver,
  ) {}

  get port(): number {
    return this._port;
  }

  get status(): BackendStatus {
    return this._status;
  }

  async start(dbPath: string, logDir?: string, dirs?: BackendDirConfig): Promise<number> {
    const binaryPath = this.resolveBackend();
    const appVersion = this.appMeta.version;
    this._port = await findAvailablePort();
    this._status = 'starting';
    this._lastDbPath = dbPath;
    this._lastLogDir = logDir;
    this._lastDirs = dirs;

    const args = buildSpawnArgs({
      port: this._port,
      dbPath,
      local: true,
      logDir,
      appVersion,
      isPackaged: this.appMeta.isPackaged,
    });
    console.log(`[aionui-backend] starting: ${binaryPath} ${args.join(' ')}`);

    this.childProcess = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: dirs ? buildSpawnEnv(dirs) : process.env,
    });

    this.childProcess.stdin?.end();

    const pid = this.childProcess.pid;
    const killOnExit = () => {
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    };
    process.on('exit', killOnExit);

    this.childProcess.on('exit', (code) => {
      process.removeListener('exit', killOnExit);
      if (this._status === 'running') this.handleCrash(code);
    });

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) console.log(`[aionui-backend] ${line}`);
      }
    });

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) console.error(`[aionui-backend] ${line}`);
      }
    });

    const ready = await this.waitForHealth(this._port);
    if (!ready) {
      this.childProcess?.kill('SIGKILL');
      this.childProcess = null;
      this._status = 'error';
      throw new Error('aionui-backend failed to start within timeout');
    }

    this._status = 'running';
    this.restartCount = 0;
    console.log(`[aionui-backend] listening on port ${this._port}, data-dir: ${dbPath}`);
    return this._port;
  }

  async stop(): Promise<void> {
    if (!this.childProcess) return;
    this._status = 'stopped';

    this.childProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.childProcess?.kill('SIGKILL');
        resolve();
      }, 5000);
      this.childProcess?.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.childProcess = null;
  }

  private async waitForHealth(port: number, timeoutMs = 30_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) return true;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  private handleCrash(_code: number | null): void {
    const now = Date.now();
    if (now - this.restartWindowStart > this.restartWindowMs) {
      this.restartCount = 0;
      this.restartWindowStart = now;
    }
    this.restartCount++;

    if (this.restartCount > this.maxRestarts) {
      this._status = 'error';
      return;
    }

    const delay = Math.pow(2, this.restartCount - 1) * 1000;
    setTimeout(() => {
      if (this._status === 'stopped') return;
      this._status = 'starting';
      this.start(this._lastDbPath, this._lastLogDir, this._lastDirs).catch(() => {
        this._status = 'error';
      });
    }, delay);
  }
}

/**
 * Functional wrapper for ownBackend usage in startWebHost (M5 will consume).
 * Not used by desktop IPC path in M4 (desktop instantiates BackendLifecycleManager
 * directly to preserve current stop/port getter semantics).
 */
export async function startBackend(opts: BackendLaunchOptions): Promise<BackendHandle> {
  const manager = new BackendLifecycleManager(opts.app, opts.resolveBackend);
  const dataDir = opts.dataDir ?? '';
  if (!dataDir) {
    throw new Error('startBackend: dataDir is required');
  }
  const port = await manager.start(dataDir, opts.logDir);
  return {
    port,
    stop: () => manager.stop(),
  };
}

/**
 * Functional wrapper kept for symmetry; prefers handle.stop() directly.
 */
export async function stopBackend(handle: BackendHandle): Promise<void> {
  await handle.stop();
}
```

**关键差异点清单**(请在 Write 后肉眼核对本文件确实写入):
1. `import { app } from 'electron'` → **已移除**
2. `import { resolveBinaryPath } from './binaryResolver'` → **已移除**,改为
   `constructor(private readonly appMeta, private readonly resolveBackend)` 注入
3. `app.isPackaged` → 通过 `SpawnConfig.isPackaged` 传入(构造函数里的 `this.appMeta.isPackaged`)
4. `app.getVersion()` → `this.appMeta.version`
5. `resolveBinaryPath()` → `this.resolveBackend()`
6. 新增 `startBackend` / `stopBackend` 函数式包装(覆盖 M3 占位 `throw`)
7. 所有其他方法 body(`start` / `stop` / `waitForHealth` / `handleCrash`)**一字不改**
8. `buildSpawnArgs` 签名**已新增** `isPackaged: boolean` 字段(取代原 `app.isPackaged`
   直读);这是 M4 的**计划内契约变更**,不是偏离

- [ ] **步骤 1.2:本地类型检查(不验证 dev 启动,那是阶段 5)**

```bash
cd /Users/zhoukai/Documents/github/AionUi/packages/web-host
bunx tsc --noEmit
```

预期:退出码 0,无错误。

**诊断**:
- `Cannot find module './types.js'` → 检查 M3 的 `types.ts` 是否存在;若不存在,
  stop & escalate(M3 依赖未就绪)
- `Type 'X' is not assignable to 'AppMetadata'` → 核对 M3 的 `AppMetadata` 字段
  是否与阶段 0.4 记录的一致;若 M3 改了签名,escalate

- [ ] **步骤 1.3:更新 `packages/web-host/src/index.ts` 的 re-export**

当前内容(M3 产物):

```ts
import type { WebHostOptions, WebHostHandle } from './types.js';

export type { AppMetadata, BackendBinaryResolver, WebHostOptions, WebHostHandle, WebUIConfig } from './types.js';
export { resetPassword, changePassword, verifyPassword, loadConfig, saveConfig } from './auth/index.js';

/**
 * Start WebHost (main entry point)
 * M4-M5: implementation will orchestrate backend-launcher + static-server
 */
export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle> {
  throw new Error('M4: startWebHost not implemented yet');
}
```

改成(整体 Write,只在既有 re-export 之后追加 backend-launcher 的 export):

```ts
import type { WebHostOptions, WebHostHandle } from './types.js';

export type { AppMetadata, BackendBinaryResolver, WebHostOptions, WebHostHandle, WebUIConfig } from './types.js';
export { resetPassword, changePassword, verifyPassword, loadConfig, saveConfig } from './auth/index.js';

// Backend launcher exports (M4)
export {
  BackendLifecycleManager,
  buildSpawnArgs,
  buildSpawnEnv,
  findAvailablePort,
  startBackend,
  stopBackend,
} from './backend-launcher.js';
export type {
  BackendDirConfig,
  BackendLaunchOptions,
  BackendHandle,
} from './backend-launcher.js';

/**
 * Start WebHost (main entry point)
 * M5: implementation will orchestrate backend-launcher + static-server + auth
 */
export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle> {
  throw new Error('M5: startWebHost not implemented yet');
}
```

注意:`startWebHost` 的 `throw` 消息从 `M4:` 改为 `M5:`(M4 不实现 `startWebHost`,
交给 M5)。

- [ ] **步骤 1.4:web-host 类型再验一次**

```bash
cd /Users/zhoukai/Documents/github/AionUi/packages/web-host
bunx tsc --noEmit
```

预期:退出码 0。

- [ ] **步骤 1.5:commit(阶段 1)**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git add packages/web-host/src/backend-launcher.ts packages/web-host/src/index.ts
git status   # 验证只这两个文件改动
git commit -m "refactor(m4): migrate lifecycleManager to @aionui/web-host backend-launcher

- Port full lifecycle (spawn, health, crash restart, SIGTERM/SIGKILL) from
  packages/desktop/src/process/backend/lifecycleManager.ts.
- Replace 'electron' app.* with constructor-injected AppMetadata and
  BackendBinaryResolver.
- Add functional startBackend/stopBackend wrappers for M5 startWebHost.
- Keep runtime behavior byte-for-byte identical; desktop wiring in follow-up commits."
```

---

## 阶段 2:重写 backend-launcher.test.ts(全 mock)

本阶段只改测试文件;跑通 web-host 的 vitest 即完成。

- [ ] **步骤 2.1:用以下内容**整体覆盖** `packages/web-host/src/backend-launcher.test.ts`**

```ts
/**
 * M4 unit tests for backend-launcher.
 * All external I/O mocked: node:child_process.spawn, node:net.createServer, fetch.
 * No real backend is spawned.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

// ---- Module-level mocks ----
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:net', () => ({
  createServer: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {
  buildSpawnArgs,
  buildSpawnEnv,
  findAvailablePort,
  BackendLifecycleManager,
} from './backend-launcher.js';
import type { AppMetadata } from './types.js';

const APP_META: AppMetadata = {
  version: '1.2.3',
  isPackaged: false,
  resourcesPath: '/mock/resources',
  userDataPath: '/mock/userData',
};

const APP_META_PACKAGED: AppMetadata = { ...APP_META, isPackaged: true };

function makeFakeServer(port = 54321) {
  const server = new EventEmitter() as EventEmitter & {
    listen: (p: number, h: string, cb: () => void) => void;
    address: () => { port: number };
    close: (cb?: () => void) => void;
  };
  server.listen = (_p, _h, cb) => {
    setImmediate(cb);
  };
  server.address = () => ({ port });
  server.close = (cb) => {
    if (cb) setImmediate(cb);
  };
  return server;
}

function makeFakeChild(): ChildProcess {
  const child = new EventEmitter() as EventEmitter & Partial<ChildProcess>;
  child.stdout = new EventEmitter() as ChildProcess['stdout'];
  child.stderr = new EventEmitter() as ChildProcess['stderr'];
  (child.stdin as unknown) = { end: vi.fn() };
  child.kill = vi.fn() as unknown as ChildProcess['kill'];
  child.pid = 99999;
  return child as ChildProcess;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Do NOT call restoreAllMocks; it would remove vi.mock() module factories.
});

describe('buildSpawnArgs', () => {
  it('produces all required flags with logDir and local=true', () => {
    const args = buildSpawnArgs({
      port: 12345,
      dbPath: '/data/path',
      local: true,
      logDir: '/log/dir',
      appVersion: '9.9.9',
      isPackaged: true,
    });
    expect(args).toEqual([
      '--port',
      '12345',
      '--data-dir',
      '/data/path',
      '--log-level',
      'info',
      '--app-version',
      '9.9.9',
      '--log-dir',
      '/log/dir',
      '--local',
    ]);
  });

  it('uses debug log level when not packaged', () => {
    const args = buildSpawnArgs({
      port: 1,
      dbPath: '/d',
      local: false,
      appVersion: '0.0.1',
      isPackaged: false,
    });
    expect(args).toContain('debug');
    expect(args).not.toContain('--log-dir');
    expect(args).not.toContain('--local');
  });

  it('respects AIONUI_LOG_LEVEL override', () => {
    const prev = process.env.AIONUI_LOG_LEVEL;
    process.env.AIONUI_LOG_LEVEL = 'trace';
    try {
      const args = buildSpawnArgs({
        port: 1,
        dbPath: '/d',
        local: false,
        appVersion: 'x',
        isPackaged: true,
      });
      expect(args).toContain('trace');
    } finally {
      if (prev === undefined) delete process.env.AIONUI_LOG_LEVEL;
      else process.env.AIONUI_LOG_LEVEL = prev;
    }
  });
});

describe('buildSpawnEnv', () => {
  it('merges process.env with AIONUI_* dir vars', () => {
    const env = buildSpawnEnv({
      cacheDir: '/c',
      workDir: '/w',
      logDir: '/l',
    });
    expect(env.AIONUI_CACHE_DIR).toBe('/c');
    expect(env.AIONUI_WORK_DIR).toBe('/w');
    expect(env.AIONUI_LOG_DIR).toBe('/l');
    expect(env.PATH).toBe(process.env.PATH); // inherits
  });
});

describe('findAvailablePort', () => {
  it('resolves with the port reported by the listening server', async () => {
    vi.mocked(createServer).mockImplementationOnce(() => makeFakeServer(40404) as unknown as ReturnType<typeof createServer>);
    const port = await findAvailablePort();
    expect(port).toBe(40404);
  });
});

describe('BackendLifecycleManager.start (success path)', () => {
  it('spawns with correct args, waits for /health, reports running', async () => {
    vi.mocked(createServer).mockImplementation(() => makeFakeServer(55555) as unknown as ReturnType<typeof createServer>);
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as unknown as Response,
    );

    const resolveBackend = vi.fn(() => '/abs/path/aionui-backend');
    const mgr = new BackendLifecycleManager(APP_META_PACKAGED, resolveBackend);

    const port = await mgr.start('/db/path', '/log/dir', {
      cacheDir: '/c',
      workDir: '/w',
      logDir: '/l',
    });

    expect(port).toBe(55555);
    expect(mgr.port).toBe(55555);
    expect(mgr.status).toBe('running');
    expect(resolveBackend).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledTimes(1);

    const spawnCall = vi.mocked(spawn).mock.calls[0];
    expect(spawnCall[0]).toBe('/abs/path/aionui-backend');
    expect(spawnCall[1]).toEqual([
      '--port', '55555',
      '--data-dir', '/db/path',
      '--log-level', 'info',
      '--app-version', '1.2.3',
      '--log-dir', '/log/dir',
      '--local',
    ]);
    const opts = spawnCall[2] as { env: NodeJS.ProcessEnv };
    expect(opts.env.AIONUI_CACHE_DIR).toBe('/c');
    expect(opts.env.AIONUI_WORK_DIR).toBe('/w');
    expect(opts.env.AIONUI_LOG_DIR).toBe('/l');

    expect(fetchSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

describe('BackendLifecycleManager.start (health timeout)', () => {
  it('kills child and throws when /health never responds OK within timeout', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(createServer).mockImplementation(() => makeFakeServer(33333) as unknown as ReturnType<typeof createServer>);
      const child = makeFakeChild();
      vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const mgr = new BackendLifecycleManager(APP_META, () => '/x');
      const startPromise = mgr.start('/db');
      // Push past waitForHealth's 30s budget with async timer advance so the
      // awaited 200ms sleeps inside the loop resolve correctly.
      await vi.advanceTimersByTimeAsync(31_000);

      await expect(startPromise).rejects.toThrow(/failed to start within timeout/);
      expect(mgr.status).toBe('error');
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');

      fetchSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BackendLifecycleManager.stop', () => {
  it('sends SIGTERM then resolves when child emits exit', async () => {
    vi.mocked(createServer).mockImplementation(() => makeFakeServer(22222) as unknown as ReturnType<typeof createServer>);
    const child = makeFakeChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as unknown as Response,
    );

    const mgr = new BackendLifecycleManager(APP_META, () => '/x');
    await mgr.start('/db');

    const stopPromise = mgr.stop();
    // Simulate graceful child exit
    (child as unknown as EventEmitter).emit('exit', 0);
    await stopPromise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mgr.status).toBe('stopped');

    fetchSpy.mockRestore();
  });

  it('escalates to SIGKILL when SIGTERM times out', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(createServer).mockImplementation(() => makeFakeServer(22223) as unknown as ReturnType<typeof createServer>);
      const child = makeFakeChild();
      vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }) as unknown as Response,
      );

      const mgr = new BackendLifecycleManager(APP_META, () => '/x');
      await mgr.start('/db');

      const stopPromise = mgr.stop();
      await vi.advanceTimersByTimeAsync(5_100);
      await stopPromise;

      expect(vi.mocked(child.kill).mock.calls).toEqual(
        expect.arrayContaining([['SIGTERM'], ['SIGKILL']]),
      );

      fetchSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BackendLifecycleManager crash restart', () => {
  it('attempts restart on unexpected exit within window', async () => {
    vi.useFakeTimers();
    try {
      // First createServer call assigns port 60001; subsequent restart uses port 60002
      let portCounter = 60000;
      vi.mocked(createServer).mockImplementation(
        () => makeFakeServer(++portCounter) as unknown as ReturnType<typeof createServer>,
      );
      const child1 = makeFakeChild();
      const child2 = makeFakeChild();
      vi.mocked(spawn).mockReturnValueOnce(child1 as unknown as ChildProcess)
                      .mockReturnValueOnce(child2 as unknown as ChildProcess);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('ok', { status: 200 }) as unknown as Response,
      );

      const mgr = new BackendLifecycleManager(APP_META, () => '/x');
      await mgr.start('/db');
      expect(mgr.status).toBe('running');

      // Simulate first child crash
      (child1 as unknown as EventEmitter).emit('exit', 1);
      // handleCrash schedules restart after 1000ms (2^(1-1) * 1000)
      await vi.advanceTimersByTimeAsync(1_100);
      // Allow awaited findAvailablePort / spawn to settle
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.mocked(spawn)).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

**关于异步时序的说明**(来自 MEMORY):
- 使用 `vi.useFakeTimers()` 时必须用 `await vi.advanceTimersByTimeAsync(...)` 而非
  同步版本,否则 `await` 挂起的 microtask 不会推进
- 避免 `vi.restoreAllMocks()`(会移除 `vi.mock()` 的 module factory);只对单个
  spy 用 `spy.mockRestore()`
- reject 的 promise 先 `rejects.toThrow(...)` 链上再触发,否则会产生
  unhandled rejection

- [ ] **步骤 2.2:跑 web-host 测试**

```bash
cd /Users/zhoukai/Documents/github/AionUi/packages/web-host
bunx vitest run backend-launcher.test.ts 2>&1 | tee /tmp/m4-phase2-test.log | tail -40
```

预期:全部通过,至少 9 个 test case。

**诊断**:
- `Cannot find module 'vitest'` → `cd /Users/zhoukai/Documents/github/AionUi && bun install`,
  确认 workspace 依赖已装
- `health timeout` 测试挂了很久 → 确认 `vi.advanceTimersByTimeAsync(31_000)`
  而非 `advanceTimersByTime(31_000)`
- `Cannot find './types.js'` / `./backend-launcher.js` → `tsconfig.json` 的
  `moduleResolution` 异常,核对 `packages/web-host/tsconfig.json` 是否 `extends` 仓库根 tsconfig
- 测试报 `spawn` 没被调用但实际代码里调用了 → `vi.mock('node:child_process')`
  的位置必须在 `import` 之前,请核对文件顶部排列

- [ ] **步骤 2.3:commit(阶段 2)**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git add packages/web-host/src/backend-launcher.test.ts
git commit -m "test(m4): mock-based unit tests for backend-launcher

Cover spawn arg shape, buildSpawnEnv merge, findAvailablePort,
start/stop happy path, health timeout, SIGKILL escalation, crash restart.
No real backend spawned; node:child_process / node:net / fetch all mocked."
```

---

## 阶段 3:桌面入口切到 `@aionui/web-host`

- [ ] **步骤 3.1:在 `packages/desktop/package.json` 声明 workspace 依赖**

当前内容:

```json
{
  "name": "@aionui/desktop",
  "version": "0.0.0",
  "private": true,
  "description": "AionUi desktop Electron application",
  "main": "../../out/main/index.js"
}
```

改为(整体 Write):

```json
{
  "name": "@aionui/desktop",
  "version": "0.0.0",
  "private": true,
  "description": "AionUi desktop Electron application",
  "main": "../../out/main/index.js",
  "dependencies": {
    "@aionui/web-host": "workspace:*"
  }
}
```

注意:**根 `package.json` 暂不改**;desktop app 的真正依赖仍然 hoist 到根
`node_modules`,这里 `workspace:*` 主要是把 `@aionui/web-host` 拉通为可解析模块。

- [ ] **步骤 3.2:重新 install,让 workspace 符号链接建立**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bun install
# 验证 link 成立(两条之一应输出路径)
ls -la node_modules/@aionui/web-host 2>&1 || ls -la packages/desktop/node_modules/@aionui/web-host 2>&1
```

预期:`@aionui/web-host` 指向 `../../packages/web-host` 或 `../packages/web-host`
(具体取决于 bun 的 hoisting 策略)。

**诊断**:
- `bun install` 报 workspace 协议不支持 → 核对 bun 版本 >= 1.1(支持 `workspace:*`)
- link 不存在 → 检查根 `package.json` 的 `workspaces: ["packages/*"]` 是否还在(M1 设的)

- [ ] **步骤 3.3:改 `packages/desktop/src/process/backend/index.ts`**

当前内容:

```ts
export { resolveBinaryPath } from './binaryResolver';
export { BackendLifecycleManager, buildSpawnArgs, buildSpawnEnv, findAvailablePort } from './lifecycleManager';
export type { BackendDirConfig } from './lifecycleManager';
```

Edit 把 `BackendLifecycleManager` 等导出全部去掉,只留 `resolveBinaryPath`:

```ts
export { resolveBinaryPath } from './binaryResolver';
```

**理由**:`lifecycleManager.ts` 阶段 4 会被删除,这里不能再 re-export。整个仓库
除了 `packages/desktop/src/index.ts` 之外都**不** import `@process/backend` 的
lifecycle 符号(已在阶段 0.5 之后 grep 验证过,见阶段 11 的最终检查),因此
去掉是安全的。

- [ ] **步骤 3.4:改 `packages/desktop/src/index.ts`**

定位原 import(约 L27):

```ts
import { BackendLifecycleManager } from '@process/backend';
```

Edit 改为:

```ts
import { BackendLifecycleManager } from '@aionui/web-host';
import { resolveBinaryPath } from '@process/backend';
```

定位原实例化(约 L187):

```ts
const backendManager = new BackendLifecycleManager();
```

Edit 改为:

```ts
const backendManager = new BackendLifecycleManager(
  {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath('userData'),
  },
  resolveBinaryPath,
);
```

**注意**:
- `app` 和 `process.resourcesPath` 当前文件(`packages/desktop/src/index.ts`)
  已经 import 了 `app`(L17)且 `process` 是全局 —— **无需新增 import**
- `backendManager.start(...)` / `backendManager.stop(...)` / `backendManager.port`
  的调用点(L196, L484, L489, L740)**保持不变**(构造签名变了,但公共 API 不变)

- [ ] **步骤 3.5:类型检查**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bunx tsc --noEmit 2>&1 | tee /tmp/m4-phase3-tsc.log | tail -40
```

预期:退出码 0。

**诊断**:
- `Cannot find module '@aionui/web-host'` → `bun install` 未生效,核对步骤 3.2
- `Property 'port' does not exist` 之类 → 误改了 `BackendLifecycleManager` 公共
  API,回看阶段 1 的代码,确认 `get port()` / `get status()` / `start()` / `stop()`
  签名与原始一致
- `Expected 2 arguments, but got 0` 指向别的文件 → grep 看还有哪里在 `new BackendLifecycleManager()`,
  本里程碑只允许 `packages/desktop/src/index.ts` 一处实例化

- [ ] **步骤 3.6:commit(阶段 3)**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git add packages/desktop/package.json packages/desktop/src/process/backend/index.ts packages/desktop/src/index.ts bun.lock
git status   # 核对文件清单
git commit -m "refactor(m4): wire desktop IPC to @aionui/web-host backend-launcher

- Add @aionui/web-host workspace dep to packages/desktop/package.json.
- Inject AppMetadata (from electron app.*) + resolveBinaryPath at
  BackendLifecycleManager construction site in packages/desktop/src/index.ts.
- Drop local re-export of lifecycle symbols in process/backend/index.ts; only
  resolveBinaryPath stays as the desktop-side BackendBinaryResolver impl."
```

---

## 阶段 4:删除旧 `lifecycleManager.ts`

- [ ] **步骤 4.1:删除文件**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git rm packages/desktop/src/process/backend/lifecycleManager.ts
```

- [ ] **步骤 4.2:验证没有遗留引用**

```bash
# 一:不应再有 import 指向旧路径
grep -rn "process/backend/lifecycleManager\|from '\./lifecycleManager'\|from \"\./lifecycleManager\"" packages/ 2>/dev/null
# 预期:无输出

# 二:不应再有 packages 外引用
grep -rn "process/backend/lifecycleManager" . \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=out --exclude-dir=dist 2>/dev/null
# 预期:无输出
```

**诊断**:
- 如果有输出,说明还有 import 指向旧文件。定位并改为 `@aionui/web-host`
  或删除;**不要**把旧文件恢复

- [ ] **步骤 4.3:类型检查 + web-host 测试**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bunx tsc --noEmit 2>&1 | tail -15
cd packages/web-host && bunx vitest run backend-launcher.test.ts 2>&1 | tail -10
```

预期:都绿。

- [ ] **步骤 4.4:commit(阶段 4)**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git add -A
git status
git commit -m "refactor(m4): remove obsolete packages/desktop/src/process/backend/lifecycleManager.ts"
```

---

## 阶段 5:桌面 dev 启动不回归冒烟

目标是验证 `bun run dev` 启动后桌面 IPC 模式能正确 spawn backend,且 `/health` 通过。

- [ ] **步骤 5.1:起 dev,抓日志**

```bash
cd /Users/zhoukai/Documents/github/AionUi
# 先清旧日志
rm -f /tmp/m4-dev.log

# 启动并后台收日志(25 秒窗口足够触发 backend spawn + health)
# 注意:不能用 `bun run dev &`,electron-vite 需要 stdin;改为 nohup
nohup bun run dev > /tmp/m4-dev.log 2>&1 &
DEV_PID=$!
echo "DEV_PID=$DEV_PID"

# 等 25 秒让 backend 起来
sleep 25
```

- [ ] **步骤 5.2:日志 + 健康检查**

```bash
# 1) 日志里出现 backend 启动信息
grep -E "\[aionui-backend\] listening on port [0-9]+" /tmp/m4-dev.log | head -3

# 2) 解析端口
PORT=$(grep -oE "listening on port [0-9]+" /tmp/m4-dev.log | head -1 | grep -oE "[0-9]+$")
echo "BACKEND_PORT=$PORT"

# 3) /health 200
if [ -n "$PORT" ]; then
  curl -fsS -o /dev/null -w "HEALTH_STATUS=%{http_code}\n" "http://127.0.0.1:$PORT/health"
else
  echo "PORT_NOT_PARSED"
fi
```

预期:
- `[aionui-backend] listening on port XXXXX` 行存在
- `BACKEND_PORT=` 后面是数字(端口)
- `HEALTH_STATUS=200`

- [ ] **步骤 5.3:(可选)crash 重启冒烟**

> ⚠️ **只在前两步都 PASS 后执行,且仅做一次**。不 PASS 不要做这个。
> 如果不方便做(如无 `lsof`),跳过,加到 handoff "遗留问题"节。

```bash
# 找 backend 子进程(aionui-backend)
if [ -n "$PORT" ]; then
  BACKEND_PID=$(lsof -iTCP:$PORT -sTCP:LISTEN -nP 2>/dev/null | awk 'NR==2 {print $2}')
  echo "BACKEND_PID=$BACKEND_PID"
  if [ -n "$BACKEND_PID" ]; then
    kill -9 "$BACKEND_PID"
    # 按 handleCrash: 第 1 次重启 delay = 2^(1-1)*1000 = 1s
    sleep 4
    # 新的 backend 端口可能变了;重新扫描日志找到"最新"listening 行
    LATEST_PORT=$(grep -oE "listening on port [0-9]+" /tmp/m4-dev.log | tail -1 | grep -oE "[0-9]+$")
    echo "BACKEND_PORT_AFTER_RESTART=$LATEST_PORT"
    curl -fsS -o /dev/null -w "HEALTH_AFTER_RESTART=%{http_code}\n" "http://127.0.0.1:$LATEST_PORT/health"
  fi
fi
```

预期:`HEALTH_AFTER_RESTART=200`(允许跳过;跳过则记录到 handoff)。

- [ ] **步骤 5.4:关闭 dev**

```bash
kill -TERM $DEV_PID 2>/dev/null || true
# 等父进程清理,Electron 不退出就 KILL
sleep 3
kill -9 $DEV_PID 2>/dev/null || true
# 以防 Electron 子进程残留
pgrep -f "electron-vite\|AionUi\|aionui-backend" | xargs -r kill -9 2>/dev/null || true
```

- [ ] **步骤 5.5:收集日志证据到 handoff 暂存**

```bash
# 日志片段保存,handoff 要贴
grep -E "\[aionui-backend\] (starting|listening)" /tmp/m4-dev.log | head -6 > /tmp/m4-dev-evidence.log
cat /tmp/m4-dev-evidence.log
```

**如果步骤 5.2 的 `[aionui-backend] listening` 没出现**:
1. 先 `tail -80 /tmp/m4-dev.log` 看错误
2. 常见错误:
   - `Cannot find "aionui-backend" binary.` → binaryResolver 没找到二进制。
     **这和 M4 代码无关**,是 M2 环境问题(bundled 目录为空或未 cargo install)。
     在 handoff 的"遗留问题"节注明,继续 push(按 requirements 这属于 M7 修复)
   - `Cannot find module '@aionui/web-host'` → 阶段 3.2 的 `bun install` 未成功,
     回去复查
   - `appMeta is undefined` → 构造时注入写错了,回阶段 3.4 对照
3. 除"binary 未找到"外的任何错误 → **stop,不 push**,去 **阶段 12 失败诊断路径**

---

## 阶段 6:全量自动化验证(不启动真 backend)

- [ ] **步骤 6.1:类型检查**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bunx tsc --noEmit 2>&1 | tee /tmp/m4-final-tsc.log | tail -10
```

预期:退出码 0,无输出。

- [ ] **步骤 6.2:lint**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bun run lint 2>&1 | tee /tmp/m4-final-lint.log | tail -10
```

预期:退出码 0。

如果 oxlint 报 web-host 新增文件的"trailing comma"之类格式问题:

```bash
bun run lint:fix
git add -A && git commit -m "style(m4): oxlint auto-fixes"
```

- [ ] **步骤 6.3:web-host 单元测试**

```bash
cd /Users/zhoukai/Documents/github/AionUi/packages/web-host
bunx vitest run backend-launcher.test.ts 2>&1 | tee /tmp/m4-final-wh-test.log | tail -20
```

预期:全绿。

- [ ] **步骤 6.4:仓库根回归测试**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bun test 2>&1 | tee /tmp/m4-final-root-test.log | tail -20
```

**和 /tmp/m4-baseline-test.log 对比**:通过数应一致(或更多,因 M4 新增了
web-host 测试,但根 vitest 的 projects 只扫 `tests/**`,所以通过数理论上一致,
除非根 vitest 跨包扫描)。

**诊断**:
- 如果根 vitest 突然 include 了 `packages/web-host/src/backend-launcher.test.ts`
  (vitest 4 可能默认扫全仓):
  - 通过数增加是正常的
  - 如果测试**失败**(如因 alias 或环境问题),检查 `vitest.config.ts` 的
    `projects.test.include` 是否只含 `tests/**` —— M1 基线就是这样,应无变化

- [ ] **步骤 6.5:prek 完整检查**

```bash
cd /Users/zhoukai/Documents/github/AionUi
prek run --from-ref origin/feat/m3-web-host-skeleton --to-ref HEAD 2>&1 | tail -30
```

预期:全绿。

**诊断**:
- 没装 `prek` → `npm install -g @j178/prek`,再跑
- 如果 format/lint 报错 → `bun run lint:fix && bun run format`,新增 commit
  (不要 amend,参考 MEMORY:commit 不要 amend)

---

## 阶段 7:依赖边界检查

- [ ] **步骤 7.1:web-host 零 electron 依赖**

```bash
grep -rn "from ['\"]electron['\"]\|require(['\"]electron['\"])\|import \* as [a-zA-Z_]* from ['\"]electron['\"]" packages/web-host/src/
# 预期:无输出
```

**若有输出**:回阶段 1,是迁移时漏删了 `import { app } from 'electron'`。

- [ ] **步骤 7.2:web-host 不反向 import desktop 业务目录**

```bash
grep -rnE "packages/desktop/src/process/(agent|worker|services)" packages/web-host/src/
# 预期:无输出
```

- [ ] **步骤 7.3:确认旧 lifecycleManager 已删**

```bash
ls packages/desktop/src/process/backend/lifecycleManager.ts 2>&1
# 预期:No such file or directory
```

- [ ] **步骤 7.4:确认 desktop 只在 index.ts 消费 web-host 的 backend 符号**

```bash
grep -rn "from ['\"]@aionui/web-host['\"]" packages/desktop/src/
# 预期:至少 1 行,且位置是 packages/desktop/src/index.ts
```

- [ ] **步骤 7.5:确认没有残留对旧 `BackendLifecycleManager from '@process/backend'`**

```bash
grep -rn "BackendLifecycleManager.*from.*@process/backend\|buildSpawnArgs.*from.*@process/backend\|buildSpawnEnv.*from.*@process/backend\|findAvailablePort.*from.*@process/backend\|BackendDirConfig.*from.*@process/backend" packages/
# 预期:无输出
```

- [ ] **步骤 7.6:(requirements 验收) import lifecycleManager 应无残留**

```bash
grep -rn "import.*lifecycleManager" packages/desktop/src/
# 预期:无输出
```

---

## 阶段 8:commit 余项 + 同步基线 + push + handoff

- [ ] **步骤 8.1:检查有无未提交的改动**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git status
```

预期:工作区干净。若有未 commit 的文件(如 `bun.lock` 在阶段 3.2 后有变化),
commit:

```bash
git add bun.lock
git commit -m "chore(m4): update bun.lock for @aionui/web-host workspace link"
```

- [ ] **步骤 8.2:同步基线 `origin/feat/backend-migration`**

按 cheatsheet 的"基线同步三步":

```bash
cd /Users/zhoukai/Documents/github/AionUi
git fetch origin feat/backend-migration
git log --oneline HEAD..origin/feat/backend-migration | head -10
```

- 如果输出为空:基线无新 commit,**跳到步骤 8.3**
- 如果有 commit:

  ```bash
  git merge origin/feat/backend-migration --no-ff \
    -m "chore(m4): sync with feat/backend-migration"
  ```

  **冲突处理**:
  - 无冲突:继续
  - 冲突简单(不同文件 / 同文件不同段落):手动解决,`git add <文件> && git commit`
    (保留 merge 消息)
  - 冲突复杂(同一段代码两边都改):**不硬改**,进入阶段 12 escalate

  合入后重跑核心验证:
  ```bash
  bunx tsc --noEmit && bun run lint && \
    (cd packages/web-host && bunx vitest run backend-launcher.test.ts)
  ```
  全绿才能继续。失败 → escalate。

- [ ] **步骤 8.3:写 handoff `docs/backend-migration/handoffs/M4-outcome.md`**

内容(≤500 字,按 cheatsheet 模板;贴原始命令输出,不要转述):

```markdown
# M4 backend-launcher 迁移 - 交付摘要

## 已交付
- 新建:`packages/web-host/src/backend-launcher.ts` 完整实现
  (`BackendLifecycleManager` 类 + `buildSpawnArgs` / `buildSpawnEnv` /
   `findAvailablePort` / `startBackend` / `stopBackend` / `BackendDirConfig` /
   `BackendLaunchOptions` / `BackendHandle`)
- 新建:`packages/web-host/src/backend-launcher.test.ts` 全 mock 覆盖
  (spawn 参数、buildSpawnEnv、findAvailablePort、start 成功、health 超时、
   SIGTERM→SIGKILL stop、crash 重启)
- 修改:`packages/web-host/src/index.ts` re-export backend-launcher 符号
- 修改:`packages/desktop/package.json` 新增 `@aionui/web-host: workspace:*`
- 修改:`packages/desktop/src/process/backend/index.ts` 只保留
  `resolveBinaryPath` 导出
- 修改:`packages/desktop/src/index.ts` 从 `@aionui/web-host` import
  `BackendLifecycleManager`,构造时注入 `AppMetadata` + `resolveBinaryPath`
- 删除:`packages/desktop/src/process/backend/lifecycleManager.ts`

## 对外接口(给 M5/M6 用)
- `new BackendLifecycleManager(appMeta: AppMetadata, resolveBackend: BackendBinaryResolver)`
- `startBackend(opts: { app, resolveBackend, port?, dataDir, logDir? }): Promise<{ port, stop }>`
- `AppMetadata` 的桌面注入点:`packages/desktop/src/index.ts`(`new BackendLifecycleManager({...})` 一处,其他里程碑不要再实例化)

## 与计划的偏离
- <无 / 列出>

## 给下一个里程碑的提醒
- `binaryResolver.ts` 还是 M4 前的"bundled → PATH"实现;UC-2 的严格分档由
  M7/M8/M9 落地
- `startWebHost` 的 `throw` 提示从 `M4:` 改成了 `M5:`
- crash 重启 e2e 在 dev 冒烟中<已覆盖 / 已跳过并原因>

## 验证证据(原始输出)
- 分支:feat/m4-backend-launcher-migration
- SHA:<填入 git rev-parse HEAD>
- 基线同步:origin/feat/backend-migration @ <基线 sha>(<已合入 / 无新 commit>)
- `bunx tsc --noEmit`:<贴 /tmp/m4-final-tsc.log 的 tail>
- `bun run lint`:<贴 /tmp/m4-final-lint.log 的 tail>
- `bunx vitest run backend-launcher.test.ts`:<贴 /tmp/m4-final-wh-test.log 的 tail>
- `bun run dev` backend 启动日志:<贴 /tmp/m4-dev-evidence.log>
- `curl /health`:<贴阶段 5.2 的 HEALTH_STATUS=200>
- grep 边界检查全部无输出(阶段 7.1/7.2/7.6):<贴输出或写 "no output">

## 遗留问题 / 跟进项
- <若跳过 crash 冒烟,写明原因;若 backend 二进制未就绪,写明并指向 M7>
```

- [ ] **步骤 8.4:push feature 分支**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git add docs/backend-migration/handoffs/M4-outcome.md
git commit -m "docs(m4): handoff outcome for backend-launcher migration"
git rev-parse HEAD > /tmp/m4-final-sha.txt
cat /tmp/m4-final-sha.txt
git push -u origin feat/m4-backend-launcher-migration
```

预期:
- push 成功
- `git branch -vv` 显示 tracking `origin/feat/m4-backend-launcher-migration`
- `/tmp/m4-final-sha.txt` 内容非空

**禁止**:
- ❌ `git push origin feat/backend-migration`
- ❌ `git push --force`
- ❌ `gh pr create` 或任何建 PR 操作
- ❌ 对 `feat/m3-web-host-skeleton` 做 push / rebase

- [ ] **步骤 8.5:SendMessage 通知 team-lead**

按 cheatsheet 模板:

```
SendMessage({
  to: "team-lead",
  summary: "M4 complete",
  message: "M4 完成。
  - 分支:feat/m4-backend-launcher-migration
  - SHA:<从 /tmp/m4-final-sha.txt 读>
  - 基线同步:origin/feat/backend-migration @ <基线 SHA>(已合入 / 无新 commit)
  - Handoff:docs/backend-migration/handoffs/M4-outcome.md
  - 偏离计划:<无 / 列出>
  请启动 M5。"
})
```

---

## 阶段 9:业务功能不回归自动化验证(可选增强)

阶段 5 的 dev 冒烟 + 阶段 6 的 `bun test` 已覆盖大部分回归。如果 team-lead
要求更深的 e2e(`tests/e2e/` 相关 job),跑一次:

```bash
cd /Users/zhoukai/Documents/github/AionUi
# 若存在 e2e 脚本
grep -E "\"test:e2e\":" package.json && bun run test:e2e 2>&1 | tail -30
```

通过/失败都记录到 handoff "遗留问题"节。

**不强制做**:requirements 说明"高级 e2e,M4 plan 可选择性覆盖或放 M6";若
本机 e2e 环境未装(如 playwright 浏览器二进制缺失)→ 跳过并记录。

---

## 阶段 10:平台兼容 / macOS vs Linux 差异

**本 plan 中实际不依赖 `sed -i` 等平台差异命令**,所有文件修改均走 Write / Edit
工具,字符串替换也是 Write 覆盖,无差异风险。

**可能踩坑的平台差异**:
- `grep -E`:macOS 和 Linux 都支持,但 macOS 的 BSD grep 对某些 POSIX 字符类
  解释不同 —— 本 plan 没用它们,安全
- `lsof`:macOS 原生支持;部分 Linux 发行版默认不装 —— 步骤 5.3 已标为"可选",
  未装就跳过
- `pgrep -f`:macOS / Linux 都支持;Windows 不支持(本里程碑不在 Windows 执行)
- `nohup`:都支持
- `sleep`:都支持,整数秒参数无差异

**如果在 Linux 环境执行且需要 `sed` 批量替换**(本 plan 未使用,但加以说明):
- macOS:`sed -i '' 's/old/new/' file`
- Linux:`sed -i 's/old/new/' file`
- 推荐一律用 Edit 工具,避免此类差异

---

## 阶段 11:最终自检 清单(push 前执行一次)

- [ ] `packages/web-host/src/backend-launcher.ts` 不 import electron
- [ ] `packages/web-host/src/backend-launcher.ts` 暴露:`BackendLifecycleManager`(类)
      / `buildSpawnArgs` / `buildSpawnEnv` / `findAvailablePort` / `startBackend` /
      `stopBackend` / 类型 `BackendDirConfig` / `BackendLaunchOptions` / `BackendHandle`
- [ ] `packages/web-host/src/index.ts` re-export 上述 runtime 和 types
- [ ] `packages/web-host/src/backend-launcher.test.ts` 至少覆盖:spawn args /
      buildSpawnEnv / findAvailablePort / start happy path / health timeout /
      SIGTERM 停机 / SIGKILL 升级 / crash 重启 —— 全 mock
- [ ] `packages/desktop/src/process/backend/lifecycleManager.ts` 不存在
- [ ] `packages/desktop/src/process/backend/index.ts` 只导出 `resolveBinaryPath`
- [ ] `packages/desktop/src/index.ts` import 路径已切换,且构造时注入 4 字段
      `AppMetadata` + `resolveBinaryPath`
- [ ] `packages/desktop/package.json` 含 `"@aionui/web-host": "workspace:*"`
- [ ] `bunx tsc --noEmit` 退出码 0
- [ ] `bun run lint` 退出码 0
- [ ] `cd packages/web-host && bunx vitest run backend-launcher.test.ts` 全绿
- [ ] `bun run dev` 启动后 `[aionui-backend] listening on port XXXXX` 出现,
      `curl /health` 返回 200(或已按诊断路径记录例外)
- [ ] 基线同步已做(或确认无新 commit)
- [ ] handoff 已写且含所有必要证据
- [ ] feature 分支已 push,PR **未**创建

---

## 阶段 12:失败诊断路径 / 异常 escalate

**总原则**:失败 **不** push;诊断清楚后(a)若明确是环境问题记 handoff 继续,
(b)若不明确或涉及上游变动,**不硬改,SendMessage escalate**。

### 12.1 web-host 类型报错(阶段 1.2 / 1.4)

| 错误 | 诊断 | 处理 |
|---|---|---|
| `Cannot find module './types.js'` | M3 产物缺失 | 确认 `packages/web-host/src/types.ts` 存在 + 内容与阶段 0.4 一致;若 M3 未完成,escalate |
| `Property 'isPackaged' does not exist on type 'AppMetadata'` | M3 types 被改 | 核对 `types.ts`;不要自主加字段,escalate |
| 阶段 1 复制过来还报 electron 错 | `import { app } from 'electron'` 没删干净 | 回阶段 1 重写 backend-launcher.ts |

### 12.2 web-host 测试挂(阶段 2.2)

| 错误 | 诊断 | 处理 |
|---|---|---|
| `vi.useFakeTimers` 下 health timeout 死等 | 用了同步 `advanceTimersByTime` | 改 `advanceTimersByTimeAsync(31_000)` |
| `Cannot find module 'vitest'` | workspace 未 install | `cd 仓库根 && bun install` |
| `spawn is not a function` | `vi.mock('node:child_process')` 位置错 | `vi.mock` 必须在顶部、import 之前 |
| `unhandled rejection` (health 超时用例) | reject promise 未先 chain handler | 先 `expect(...).rejects.toThrow(...)` 再 `advanceTimersByTimeAsync`;注意 async 顺序 |

### 12.3 桌面 tsc 报错(阶段 3.5)

| 错误 | 诊断 | 处理 |
|---|---|---|
| `Cannot find module '@aionui/web-host'` | workspace 未 install | `bun install` |
| `Expected 2 arguments, but got 0` | 漏改 `new BackendLifecycleManager()` | 补构造参数 |
| `'BackendLifecycleManager' is not exported` | index.ts re-export 漏了 | 回阶段 1.3 |
| 其他 desktop 业务文件报错 | 可能误删了 `process/backend/index.ts` 的其他 export | 核对阶段 3.3 只删了 lifecycle 相关,保留 `resolveBinaryPath` |

### 12.4 dev 启动 backend 没起来(阶段 5.2)

| 现象 | 诊断 | 处理 |
|---|---|---|
| 日志含 `Cannot find "aionui-backend" binary.` | binaryResolver 找不到(bundled 空 + PATH 无) | **不是** M4 代码问题;handoff 注明,跳过 5.3 crash 冒烟;继续 push(requirements 允许 M7 后再修) |
| 日志含 `appMeta is undefined` / `version undefined` | 构造注入写错 | 回阶段 3.4 对照代码 |
| 日志含 `resolveBackend is not a function` | 没把 resolver 作为第二参数传入 | 同上 |
| Electron 主进程崩 | 可能是别的业务 bug,非 M4 | tail 日志 200 行贴给 team-lead,escalate |

### 12.5 基线同步冲突(阶段 8.2)

| 情况 | 处理 |
|---|---|
| `backend-launcher.ts` 在 `feat/backend-migration` 上也被改了(e.g. 上游 hotfix) | **不硬 merge**,escalate;附冲突文件名 + 两侧 sha |
| `packages/desktop/src/index.ts` 的 `BackendLifecycleManager` 构造在基线上也变了 | 同上 |
| 非 backend 代码冲突(renderer / 其他 process 模块) | 可自主解决(按语义合并),再跑完整 tsc/lint/test |

### 12.6 上游 M3 与计划不一致

| 情况 | 处理 |
|---|---|
| `backend-launcher.ts` 的 M3 占位签名与本 plan 假设不同(如 `BackendLaunchOptions` 字段) | 以 M3 实际为准;如果完全不兼容,escalate;不要自主扩 types.ts |
| M3 的 `AppMetadata` 少字段 | escalate |
| M3 还没 push | escalate(分支不存在,不要自主基于 backend-migration 开工) |

### escalate 模板

```
SendMessage({
  to: "team-lead",
  summary: "M4 blocked",
  message: "M4 执行被阻塞,需要人类决策。
  - 当前分支:feat/m4-backend-launcher-migration(本地,尚未 push)
  - 当前 SHA:<git rev-parse HEAD>
  - 问题:<简述>
  - 已尝试:<具体步骤>
  - 相关日志:<贴 tail 50 行>
  请决定如何处理。"
})
```

---

## 阶段 13:回滚

### 13.1 本地未 push(任何阶段失败)

```bash
cd /Users/zhoukai/Documents/github/AionUi
git reset --hard origin/feat/m3-web-host-skeleton
git clean -fd
# 重新 install(因为 packages/desktop/package.json 回退了)
bun install
```

### 13.2 已 push 但下游 M5 未开工

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout feat/m3-web-host-skeleton
git branch -D feat/m4-backend-launcher-migration
git push origin --delete feat/m4-backend-launcher-migration
# 重建:从 0.3 开始
```

### 13.3 已 push 且下游 M5 已基于此分支开工

**不能删分支,不能 force push**。做一个修复 commit:

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout feat/m4-backend-launcher-migration
# 修改问题代码
git commit -m "fix(m4): <describe fix>"
git push origin feat/m4-backend-launcher-migration
# 通知 M5 pull
```

如果是方向性问题(整个 M4 思路不对):不自主决定,escalate。

---

## 常见踩坑 / Notes

1. **`process.resourcesPath` 在 dev 模式下是 Electron 内置路径**
   (不是仓库根),这是 Electron 的预期行为,web-host 不关心它的语义,只透传

2. **`app.getVersion()` 在 dev 模式返回 `package.json` 的 version**
   (如 "1.9.19");packaged 返回 electron-builder 注入的版本。本 plan 不关心
   其具体值,只要求它是 string

3. **M4 不改 `startWebHost`** —— `throw new Error('M5: ...')` 是预期状态;
   只有 M5 的 executor 才实现它

4. **`webserver/` 还在** —— `bun run webui` 仍走老路径;M6 才切换。本 plan
   阶段 5 不测 `bun run webui`

5. **测试里避免 `vi.restoreAllMocks()`** —— 会移除 `vi.mock()` 的 module
   factory,后续用例会炸。只对个别 spy 用 `spy.mockRestore()`

6. **commit 不 amend** —— 前面 hook 失败或漏文件,新建 commit,不 amend 上一条
   (参考 MEMORY / cheatsheet)

7. **root `vitest.config.ts` 的 projects.include 是 `tests/**`**,不会扫
   `packages/web-host/src/*.test.ts`;必须 `cd packages/web-host` 才能跑 web-host 内的测试
