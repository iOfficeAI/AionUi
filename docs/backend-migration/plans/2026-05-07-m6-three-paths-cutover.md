# M6: Three-Paths WebUI Cutover - Detailed Plan

**迁移目标**: 将桌面 WebUI 从 `packages/desktop/src/process/webserver/` 切换到 `packages/web-host`，实现三条路径的统一切换。

**前提条件**:
- M4 已完成：`BackendLifecycleManager` 已迁入 `@aionui/web-host`
- M5 已完成：`static-server` + `auth` 模块已在 `@aionui/web-host` 中实现并通过测试

**三条路径**:
1. **桌面 IPC 路径**: 通过 IPC bridge (`webui.start` / `webui.stop` / `webui.getStatus`) 启动/停止 WebUI
2. **桌面 GUI switch 路径**: 通过设置界面 (`WebuiModalContent.tsx`) 的开关/按钮控制 WebUI
3. **WebUI headless 路径**: 通过命令行 `bun run webui` 启动 headless WebUI 服务器

---

## 参考文档

本 plan 基于以下文档编写，执行时应优先查阅这些文档以理解上下文和约束：

1. **前置里程碑交付**:
   - `docs/backend-migration/handoffs/M4-outcome.md` — backend-launcher 接口签名
   - `docs/backend-migration/handoffs/M5-outcome.md` — static-server + auth 接口签名和 HTTP contract

2. **现有代码结构**:
   - `packages/desktop/src/process/webserver/` — 待迁移的 legacy webserver
   - `packages/desktop/src/process/bridge/webuiQR.ts` — QR 登录逻辑（无 Electron 依赖）
   - `packages/desktop/src/process/utils/webuiConfig.ts` — WebUI 配置读写和启动入口
   - `packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx` — 前端 UI
   - `packages/web-host/src/` — M4/M5 已实现的模块

3. **测试框架**:
   - `tests/e2e/` — E2E 测试目录（需新增三条路径的冒烟测试）
   - `vitest.config.ts` — 单元测试配置

---

## 阶段化分解

### Phase 0: Baseline Snapshot

**目的**: 记录切换前的基线状态，以便回滚和诊断。

**操作**:
1. 确认当前分支基于 `origin/feat/m5-static-server-auth-migration`
2. 运行以下命令并保存输出：
   ```bash
   git log --oneline -1
   bunx tsc --noEmit
   bun run lint
   bun test
   ```
3. 记录以下文件的 SHA256 checksum：
   ```bash
   find packages/desktop/src/process/webserver -type f -name "*.ts" | xargs shasum -a 256 > /tmp/m6-baseline-webserver.txt
   find packages/web-host/src -type f -name "*.ts" | xargs shasum -a 256 > /tmp/m6-baseline-web-host.txt
   ```
4. 测试桌面 WebUI 当前行为（手动）：
   - 启动桌面应用 `bun run dev`
   - 打开设置 → WebUI 标签
   - 点击"启动 WebUI"按钮
   - 验证可以打开 WebUI 页面并登录
   - 记录控制台日志和 QR 码是否正常显示

**产出**:
- `/tmp/m6-baseline-*.txt` 快照文件
- 基线测试报告（手动记录或截图）

---

### Phase 1: Pre-Flight Checks

**目的**: 确认 M4/M5 交付物完整且可用，避免基于不完整的前置条件开始迁移。

**操作**:

1. **验证 M4 交付**:
   ```bash
   # 检查 BackendLifecycleManager 是否可导入
   grep -r "BackendLifecycleManager" packages/web-host/src/index.ts
   grep -r "BackendLifecycleManager" packages/desktop/src/index.ts
   
   # 检查 M4 测试是否通过
   bunx vitest run packages/web-host/tests/backend-launcher.test.ts
   ```
   预期：导出存在，测试通过（可能有1个 unhandled rejection warning，属于已知问题）

2. **验证 M5 交付**:
   ```bash
   # 检查 static-server 和 auth 是否可导入
   grep -r "startStaticServer\|resetPassword\|verifyPassword" packages/web-host/src/index.ts
   
   # 检查 M5 测试是否通过
   bunx vitest run packages/web-host/tests/
   ```
   预期：导出存在，55+ 测试通过

3. **检查依赖边界**:
   ```bash
   # web-host 不应依赖 electron
   grep -r "electron\|@process/\|@renderer/" packages/web-host/src/ || echo "✓ Clean"
   ```
   预期：无输出（Clean）

4. **检查 legacy webserver 未被意外修改**:
   ```bash
   git diff origin/feat/m5-static-server-auth-migration -- packages/desktop/src/process/webserver/
   ```
   预期：无输出（M5 承诺未修改 legacy webserver）

**失败处理**:
- 如果 M4/M5 测试失败或导出缺失，停止 M6 执行，回退到 M4/M5 修复阶段
- 如果 legacy webserver 被意外修改，先 revert 再继续

**Commit**: 无（只读检查）

---

### Phase 2: Implement `startWebHost` Orchestration

**目的**: 实现 M5 遗留的 `startWebHost` 占位符，编排 backend-launcher + static-server + auth 的完整流程。

**文件**: `packages/web-host/src/index.ts`

**实现要点**:

```typescript
export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle> {
  // 1. Load or initialize config
  const config = await loadConfig({ configPath: opts.configPath });
  if (!config.passwordHash) {
    // First-run: generate random password
    const { password, hash } = await resetPassword({ configPath: opts.configPath });
    console.log(`[WebHost] Generated initial password: ${password}`);
    config.passwordHash = hash;
    config.adminUsername = config.adminUsername || 'admin';
  }

  // 2. Start backend (M4)
  const backendHandle = await startBackend({
    app: opts.app,
    resolveBackend: opts.resolveBackend,
    port: opts.backendPort, // undefined → auto-allocate
    dataDir: opts.dataDir,
    logDir: opts.logDir,
  });

  // 3. Start static-server (M5)
  const staticHandle = await startStaticServer({
    port: opts.port || config.port || 33000,
    host: opts.host || (config.allowRemote ? '0.0.0.0' : '127.0.0.1'),
    distPath: opts.distPath,
    backendUrl: `http://127.0.0.1:${backendHandle.port}`,
    config,
  });

  // 4. Return combined handle
  return {
    port: staticHandle.port,
    backendPort: backendHandle.port,
    url: `http://127.0.0.1:${staticHandle.port}`,
    async stop() {
      await staticHandle.stop();
      await backendHandle.stop();
    },
  };
}
```

**Before**:
```typescript
export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle> {
  throw new Error('M5: startWebHost not implemented yet');
}
```

**After**: 完整实现如上。

**Commit**:
```
feat(web-host): implement startWebHost orchestration (M6 phase 2)

- Orchestrate backend-launcher (M4) + static-server (M5) + auth
- Handle first-run password generation
- Return combined handle with stop() cleanup
```

---

### Phase 3: Write Unit Tests for `startWebHost`

**目的**: 确保 `startWebHost` 的编排逻辑正确，所有分支（首次运行、配置存在、端口冲突等）都有覆盖。

**文件**: `packages/web-host/tests/start-web-host.test.ts`

**测试用例**:

1. **First-run: generate password**
   - Given: `configPath` 指向空配置
   - When: `startWebHost()`
   - Then: 调用 `resetPassword`，返回 handle，控制台输出初始密码

2. **Existing config: reuse**
   - Given: `configPath` 已有 `passwordHash`
   - When: `startWebHost()`
   - Then: 不调用 `resetPassword`，直接启动

3. **Backend port conflict**
   - Given: `backendPort` 已被占用
   - When: `startWebHost()`
   - Then: `startBackend` 抛出错误，`startWebHost` 也抛出错误

4. **Static-server port conflict**
   - Given: `port` 已被占用
   - When: `startWebHost()`
   - Then: `startStaticServer` 抛出错误，已启动的 backend 被清理

5. **Stop cleanup**
   - Given: `startWebHost()` 成功
   - When: `handle.stop()`
   - Then: 先停 static-server，再停 backend

**Mock 策略**:
- Mock `loadConfig` / `resetPassword` / `saveConfig` (from `auth/index.ts`)
- Mock `startBackend` (from `backend-launcher.ts`)
- Mock `startStaticServer` (from `static-server.ts`)

**Commit**:
```
test(web-host): add unit tests for startWebHost

- Cover first-run password generation
- Cover existing config reuse
- Cover backend/static-server port conflicts
- Cover stop() cleanup order
```

---

### Phase 4: Update Desktop IPC Bridge to Use `startWebHost`

**目的**: 将桌面的 IPC bridge (`webuiBridge.ts` 或相关文件) 从调用 legacy `packages/desktop/src/process/webserver/index.ts` 切换到调用 `@aionui/web-host` 的 `startWebHost`。

**文件**: 
- `packages/desktop/src/process/utils/webuiConfig.ts` (主要修改)
- `packages/desktop/src/process/bridge/webuiQR.ts` (可能需要调整，但 M5 说它无 Electron 依赖)

**关键修改**:

1. **Import 切换**:
   ```typescript
   // Before
   import { startWebServer } from '@process/webserver';

   // After
   import { startWebHost } from '@aionui/web-host';
   import { resolveBinaryPath } from '@process/backend';
   ```

2. **`startWebServerWithInstance` 重构**:
   ```typescript
   // Before: 调用 legacy startWebServer
   export async function startWebServerWithInstance(port: number, allowRemote: boolean) {
     const instance = await startWebServer(port, allowRemote);
     // ...
   }

   // After: 调用 startWebHost
   export async function startWebServerWithInstance(port: number, allowRemote: boolean) {
     const app = getApp(); // Electron app metadata
     const resolveBackend = resolveBinaryPath; // From @process/backend

     const handle = await startWebHost({
       app,
       resolveBackend,
       port,
       host: allowRemote ? '0.0.0.0' : '127.0.0.1',
       configPath: path.join(app.getPath('userData'), 'webui.config.json'),
       distPath: path.join(__dirname, '../../renderer'), // Adjust based on actual structure
       dataDir: app.getPath('userData'),
       logDir: path.join(app.getPath('userData'), 'logs'),
     });

     // Map handle to legacy format if needed
     return {
       port: handle.port,
       url: handle.url,
       stop: handle.stop,
     };
   }
   ```

3. **QR 逻辑保持不变**: `webuiQR.ts` 已经是无 Electron 依赖的纯逻辑，不需要修改（除非需要同步 session token 存储位置）。

**Commit**:
```
refactor(desktop): switch IPC bridge to use @aionui/web-host (M6 phase 4)

- Replace legacy startWebServer with startWebHost
- Pass Electron app metadata and binary resolver
- Map web-host handle to IPC bridge format
```

---

### Phase 5: Update Desktop GUI (`WebuiModalContent.tsx`)

**目的**: 确保前端 UI 在调用 IPC bridge 时，能正确处理 M6 后的新行为（例如初始密码来源、QR 码生成逻辑）。

**文件**: `packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx`

**可能的修改**:

1. **初始密码来源**: M5 后，初始密码由 `resetPassword` 生成并保存在 `webui.config.json`，而非 backend SQLite。前端需要从 IPC `webui.getStatus` 返回的 `initialPassword` 字段读取（如果该字段已在 M5 实现，则无需修改；否则需要在 IPC bridge 中暴露）。

2. **QR 码 URL**: M6 后，QR 码仍由 `generateQRLoginUrlDirect` 生成，URL 格式保持不变，前端无需修改。

3. **错误提示**: 如果 `startWebHost` 抛出错误（例如端口冲突），IPC bridge 应返回清晰的错误信息，前端显示给用户。

**检查项**:
- 前端是否依赖 legacy webserver 的特定行为（例如特定的错误码、特定的日志格式）？
- 前端是否需要新的 IPC 方法（例如 `webui.resetPassword`）？

**Commit**:
```
refactor(desktop): update WebuiModalContent for M6 web-host (M6 phase 5)

- Adjust initial password display logic if needed
- Update error handling for startWebHost failures
- Add user-facing messages for migration
```

**注意**: 如果前端无需修改，此阶段可省略（提交空 commit 或跳过）。

---

### Phase 6: Implement Headless CLI (`bun run webui`)

**目的**: 实现命令行启动 WebUI 的功能，供 Linux headless 环境使用。

**文件**: 
- `packages/desktop/scripts/webui.ts` (新建)
- `packages/desktop/package.json` (添加 script)

**实现**:

1. **`scripts/webui.ts`**:
   ```typescript
   #!/usr/bin/env bun
   import { startWebHost } from '@aionui/web-host';
   import { resolveBinaryPath } from './src/process/backend';
   import path from 'path';
   import { app } from 'electron';

   // Fake Electron app metadata for headless
   const fakeApp = {
     getPath: (name: string) => {
       const base = process.env.AIONUI_DATA_DIR || path.join(process.cwd(), '.aionui');
       if (name === 'userData') return base;
       if (name === 'logs') return path.join(base, 'logs');
       return base;
     },
     getName: () => 'AionUi',
     getVersion: () => require('../package.json').version,
   };

   async function main() {
     const port = parseInt(process.env.AIONUI_PORT || '33000', 10);
     const allowRemote = process.env.AIONUI_ALLOW_REMOTE === 'true';

     const handle = await startWebHost({
       app: fakeApp,
       resolveBackend: resolveBinaryPath,
       port,
       host: allowRemote ? '0.0.0.0' : '127.0.0.1',
       configPath: path.join(fakeApp.getPath('userData'), 'webui.config.json'),
       distPath: path.join(__dirname, '../out/renderer'),
       dataDir: fakeApp.getPath('userData'),
       logDir: fakeApp.getPath('logs'),
     });

     console.log(`[WebUI Headless] Started on ${handle.url}`);
     console.log(`[WebUI Headless] Backend on http://127.0.0.1:${handle.backendPort}`);

     process.on('SIGINT', async () => {
       console.log('[WebUI Headless] Shutting down...');
       await handle.stop();
       process.exit(0);
     });
   }

   main().catch((err) => {
     console.error('[WebUI Headless] Fatal error:', err);
     process.exit(1);
   });
   ```

2. **`package.json`**:
   ```json
   {
     "scripts": {
       "webui": "bun run scripts/webui.ts"
     }
   }
   ```

**Commit**:
```
feat(desktop): add headless WebUI CLI script (M6 phase 6)

- Implement scripts/webui.ts using startWebHost
- Support AIONUI_PORT and AIONUI_ALLOW_REMOTE env vars
- Add "bun run webui" script to package.json
```

---

### Phase 7: Write E2E Tests for Three Paths

**目的**: 为三条路径编写端到端冒烟测试，确保 M6 切换后所有路径都能正常工作。

**文件**:
- `tests/e2e/cases/webui/desktop-ipc.e2e.ts` (新建)
- `tests/e2e/cases/webui/desktop-gui-switch.e2e.ts` (新建)
- `tests/e2e/cases/webui/webui-headless.e2e.ts` (新建)

**测试骨架**:

#### 1. `desktop-ipc.e2e.ts`

**场景**: 通过 IPC bridge 启动/停止 WebUI。

```typescript
import { test, expect } from 'vitest';
import { webuiBridge } from '@/process/bridge/webuiBridge'; // Adjust import

test('IPC path: start and stop WebUI', async () => {
  // 1. Start WebUI via IPC
  const result = await webuiBridge.start({ port: 33001, allowRemote: false });
  expect(result.success).toBe(true);
  expect(result.data?.port).toBe(33001);

  // 2. Check status
  const status = await webuiBridge.getStatus();
  expect(status.running).toBe(true);
  expect(status.port).toBe(33001);

  // 3. Verify HTTP endpoint responds
  const response = await fetch(`http://127.0.0.1:33001/`);
  expect(response.status).toBe(200);

  // 4. Stop WebUI
  const stopResult = await webuiBridge.stop();
  expect(stopResult.success).toBe(true);

  // 5. Verify stopped
  const statusAfter = await webuiBridge.getStatus();
  expect(statusAfter.running).toBe(false);
});
```

#### 2. `desktop-gui-switch.e2e.ts`

**场景**: 通过 GUI 开关控制 WebUI（需要 Playwright 或类似工具）。

```typescript
import { test, expect } from '@playwright/test'; // Or vitest + puppeteer

test('GUI path: toggle WebUI switch', async ({ page }) => {
  // 1. Open desktop app
  await page.goto('http://localhost:5173'); // Vite dev server

  // 2. Navigate to Settings → WebUI
  await page.click('text=Settings');
  await page.click('text=WebUI');

  // 3. Click "Start WebUI" button
  await page.click('button:has-text("Start WebUI")');

  // 4. Wait for success message
  await expect(page.locator('text=WebUI started')).toBeVisible();

  // 5. Verify URL is displayed
  const urlText = await page.locator('[data-testid="webui-url"]').textContent();
  expect(urlText).toMatch(/http:\/\/127\.0\.0\.1:\d+/);

  // 6. Click "Stop WebUI" button
  await page.click('button:has-text("Stop WebUI")');

  // 7. Verify stopped message
  await expect(page.locator('text=WebUI stopped')).toBeVisible();
});
```

**注意**: GUI 测试需要完整的桌面应用环境，可能较慢或需要 mock。如果时间有限，可以只写骨架 + 关键断言示例，标记为 `test.skip` 或 `test.todo`。

#### 3. `webui-headless.e2e.ts`

**场景**: 通过命令行启动 headless WebUI。

```typescript
import { test, expect } from 'vitest';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { setTimeout } from 'timers/promises';

const sleep = promisify(setTimeout);

test('Headless path: bun run webui', async () => {
  // 1. Spawn "bun run webui" in background
  const proc = spawn('bun', ['run', 'webui'], {
    env: { ...process.env, AIONUI_PORT: '33002' },
    detached: true,
    stdio: 'pipe',
  });

  // 2. Wait for startup (check stdout for "Started on")
  let started = false;
  proc.stdout.on('data', (data) => {
    if (data.toString().includes('Started on')) {
      started = true;
    }
  });

  await sleep(5000); // Wait up to 5s for startup
  expect(started).toBe(true);

  // 3. Verify HTTP endpoint responds
  const response = await fetch('http://127.0.0.1:33002/');
  expect(response.status).toBe(200);

  // 4. Send SIGINT to stop
  proc.kill('SIGINT');

  // 5. Wait for process to exit
  await new Promise((resolve) => proc.on('exit', resolve));
  expect(proc.exitCode).toBe(0);
});
```

**Commit**:
```
test(e2e): add three-paths cutover smoke tests (M6 phase 7)

- desktop-ipc.e2e.ts: IPC bridge start/stop
- desktop-gui-switch.e2e.ts: GUI toggle (skeleton + key assertions)
- webui-headless.e2e.ts: CLI bun run webui
```

---

### Phase 8: Remove Legacy Webserver

**目的**: 删除 `packages/desktop/src/process/webserver/` 中已被 `@aionui/web-host` 取代的代码，保留部分可能需要的桥接逻辑。

**文件**: `packages/desktop/src/process/webserver/` (整个目录)

**删除清单**:
- `index.ts` (legacy webserver 入口)
- `adapter.ts`, `directoryApi.ts`, `setup.ts` (legacy 逻辑)
- `auth/` (已迁移到 `@aionui/web-host/src/auth/`)
- `middleware/` (已迁移到 `@aionui/web-host/src/auth/rateLimiter.ts` 等)
- `routes/` (已迁移到 `@aionui/web-host/src/static-server.ts`)
- `websocket/` (WebSocket proxy 已在 `static-server.ts` 中实现)

**保留清单** (如果有桥接需求):
- 可能需要保留 `config/constants.ts` 中的常量定义（如果桌面其他地方引用）
- 可能需要保留 `types/` 中的类型定义（如果桌面其他地方引用）

**检查引用**:
```bash
# 查找哪些文件仍在 import legacy webserver
grep -r "from '@process/webserver" packages/desktop/src/ --include="*.ts" --include="*.tsx"
```

**处理引用**:
- 如果有引用，先将引用切换到 `@aionui/web-host` 或移除
- 确认无引用后，删除整个 `webserver/` 目录

**Commit**:
```
refactor(desktop): remove legacy webserver (M6 phase 8)

- Delete packages/desktop/src/process/webserver/
- All functionality migrated to @aionui/web-host
- Retain types/constants if referenced elsewhere
```

---

### Phase 9: Update Documentation and Handoff

**目的**: 更新文档以反映 M6 的变更，并为 M7 准备交接。

**文件**:
- `docs/backend-migration/handoffs/M6-outcome.md` (新建)
- `README.md` (可选，如果有 WebUI 使用说明需要更新)

**M6-outcome.md 内容**:

```markdown
# M6 Three-Paths WebUI Cutover - Outcome

## Delivered

1. **`startWebHost` implementation** (`packages/web-host/src/index.ts`):
   - Orchestrates backend-launcher (M4) + static-server (M5) + auth
   - Handles first-run password generation
   - Returns combined handle with `stop()` cleanup

2. **Desktop IPC bridge migration** (`packages/desktop/src/process/utils/webuiConfig.ts`):
   - Replaced legacy `startWebServer` with `startWebHost`
   - Passes Electron app metadata and binary resolver

3. **Headless CLI script** (`packages/desktop/scripts/webui.ts`):
   - Supports `bun run webui` for Linux headless environments
   - Configurable via `AIONUI_PORT` and `AIONUI_ALLOW_REMOTE` env vars

4. **E2E smoke tests** (`tests/e2e/cases/webui/`):
   - `desktop-ipc.e2e.ts`: IPC bridge path
   - `desktop-gui-switch.e2e.ts`: GUI toggle path (skeleton)
   - `webui-headless.e2e.ts`: CLI path

5. **Legacy webserver removal** (`packages/desktop/src/process/webserver/`):
   - Deleted 20+ files, ~2000 lines
   - All functionality migrated to `@aionui/web-host`

## Test Results

- Unit tests: `bunx vitest run packages/web-host/tests/` — 70+ tests pass
- E2E tests: `bunx vitest run tests/e2e/cases/webui/` — 3 tests pass
- Type check: `bunx tsc --noEmit` — 0 errors
- Lint: `bun run lint` — 0 errors (existing warnings remain)

## API for M7

- `startWebHost(opts: WebHostOptions): Promise<WebHostHandle>` — main entry point
- `WebHostOptions`:
  - `app: AppMetadata` — Electron app or fake for headless
  - `resolveBackend: BackendBinaryResolver` — from `@process/backend`
  - `port?: number` — static-server port (default: 33000)
  - `host?: string` — bind address (default: '127.0.0.1')
  - `configPath: string` — path to `webui.config.json`
  - `distPath: string` — path to `out/renderer/`
  - `dataDir: string` — backend data directory
  - `logDir?: string` — backend log directory
- `WebHostHandle`:
  - `port: number` — static-server port
  - `backendPort: number` — backend HTTP port
  - `url: string` — full URL (e.g., `http://127.0.0.1:33000`)
  - `stop(): Promise<void>` — cleanup both servers

## Known Issues / Deviations

1. **Equivalence testing**: M5 deferred equivalence test to M6, but M6 also deferred it to manual validation. Suggest M7 adds integration test comparing legacy vs new behavior.

2. **GUI E2E test**: `desktop-gui-switch.e2e.ts` is a skeleton with key assertions only. Full Playwright setup deferred to M7 or CI improvement.

3. **Password migration**: First-run after M6 cutover treats empty `webui.config.json` as "not initialized" and generates new password. Existing desktop users will see "password reset" on first launch. UI should guide users to set custom password.

## Rollback Plan

See "Rollback Scenarios" section in M6 plan.

## Next Milestone (M7)

- Prepare backend CI: add backend build step to CI, ensure binary is available for E2E tests
- Web CLI tarball: package `@aionui/web-host` as standalone tarball for distribution
```

**Commit**:
```
docs(backend-migration): add M6 outcome handoff (M6 phase 9)

- Summarize deliverables and test results
- Document API for M7
- Note known issues and rollback plan
```

---

### Phase 10: Final Validation and Push

**目的**: 运行完整的质量检查，确保 M6 切换后代码库健康，然后推送到远程分支。

**操作**:

1. **类型检查**:
   ```bash
   bunx tsc --noEmit
   ```
   预期：0 errors

2. **Lint**:
   ```bash
   bun run lint
   ```
   预期：0 errors（warnings 可接受）

3. **单元测试**:
   ```bash
   bun test
   ```
   预期：所有 M6 新增测试通过，既有测试无 regression

4. **E2E 测试**:
   ```bash
   bunx vitest run tests/e2e/cases/webui/
   ```
   预期：3 个路径的冒烟测试通过

5. **手动冒烟**:
   - 启动桌面应用 `bun run dev`
   - 打开设置 → WebUI，点击"启动 WebUI"
   - 验证可以打开 WebUI 并登录
   - 停止 WebUI，验证端口释放
   - 运行 `bun run webui`，验证 headless 模式启动

6. **同步基线**:
   ```bash
   git fetch origin
   git merge origin/feat/backend-migration --no-edit
   ```
   如果有冲突，解决后继续。

7. **推送**:
   ```bash
   git push origin feat/m6-three-paths-cutover
   ```

**Commit**: 无（推送操作）

---

## 失败诊断

参考 playbook M6 诊断小节（待 playbook 提供后补充）。通用诊断步骤：

1. **端口冲突**:
   - 症状：`startWebHost` 抛出 `EADDRINUSE`
   - 检查：`lsof -i :33000` 或 `netstat -an | grep 33000`
   - 解决：杀死占用进程或更换端口

2. **Backend 启动失败**:
   - 症状：`startBackend` 抛出错误或超时
   - 检查：
     - Backend 二进制是否存在：`ls -la $(which aionui-backend)` 或检查 `resolveBinaryPath` 返回值
     - Backend health endpoint: `curl http://127.0.0.1:<backendPort>/health`
     - Backend 日志：`tail -f ~/.aionui/logs/backend.log`
   - 解决：确保 backend 二进制可执行，检查依赖库

3. **Static-server 404**:
   - 症状：访问 `http://127.0.0.1:33000/` 返回 404
   - 检查：
     - `distPath` 是否正确：`ls -la <distPath>/index.html`
     - Static-server 日志：查看 `console.log` 输出
   - 解决：确保 `distPath` 指向正确的 `out/renderer/` 目录

4. **Login 401**:
   - 症状：输入正确密码仍返回 401
   - 检查：
     - `webui.config.json` 的 `passwordHash` 是否正确：`cat ~/.aionui/webui.config.json`
     - `verifyPassword` 是否被正确调用：添加 debug 日志
   - 解决：运行 `resetPassword` 重置密码，或手动修复配置

5. **QR 码不显示**:
   - 症状：前端看不到 QR 码
   - 检查：
     - IPC `webui.getStatus` 是否返回 `qrUrl` 和 `expiresAt`
     - `generateQRLoginUrlDirect` 是否被调用
   - 解决：确保 IPC bridge 正确调用 `webuiQR.ts` 的逻辑

**日志优先级**:
- Backend 启动/停止：`console.log('[WebHost] ...')`
- 认证成功/失败：`console.log('[Auth] ...')`
- 端口分配：`console.log('[Static] Listening on ...')`

**最小证据**:
- 如果报告问题，需提供：
  - 错误消息（完整堆栈）
  - 相关日志（最后 50 行）
  - 环境信息：OS, Node/Bun 版本，Electron 版本

---

## 回滚

### 场景 1: M6 功能性回退（IPC/GUI/CLI 路径任一损坏）

**操作**:
1. 切回 M5 分支：
   ```bash
   git checkout feat/m5-static-server-auth-migration
   ```
2. 验证 legacy webserver 仍可用：
   ```bash
   bun run dev
   # 打开设置 → WebUI，验证可启动
   ```
3. 通知团队：M6 需修复，暂时使用 M5 baseline

**恢复点**: M5 最后一次 commit（`32092b8...`）

### 场景 2: M6 性能回退（启动时间 >5s 或内存占用 >100MB）

**诊断**:
- 使用 `time bun run webui` 测量启动时间
- 使用 `ps aux | grep bun` 查看内存占用

**操作**:
- 如果性能回退不可接受，回到场景 1
- 否则，创建性能优化任务，M7 跟进

### 场景 3: M6 数据丢失（密码重置导致用户无法登录）

**预防**:
- M6 应在首次启动时提示用户"密码已重置，请设置新密码"
- 提供 CLI 命令 `bun run reset-webui-password` 供用户重置

**恢复**:
- 如果用户忘记密码，运行：
  ```bash
  bun run reset-webui-password
  ```
  输出新密码并写入 `webui.config.json`

---

## 时间估算

| Phase | 估算时间 | 备注 |
|-------|---------|------|
| 0. Baseline Snapshot | 30 min | 手动测试 + 记录 |
| 1. Pre-Flight Checks | 15 min | 自动化脚本 |
| 2. `startWebHost` Implementation | 2 hours | 核心逻辑 + 错误处理 |
| 3. Unit Tests for `startWebHost` | 2 hours | 5 个测试用例 + mock |
| 4. Update Desktop IPC Bridge | 1.5 hours | Import 切换 + 参数映射 |
| 5. Update Desktop GUI | 1 hour | 前端调整（如果需要） |
| 6. Headless CLI Script | 1 hour | 简单脚本 + env 变量 |
| 7. E2E Tests (Three Paths) | 3 hours | 3 个测试文件，GUI 测试可能较慢 |
| 8. Remove Legacy Webserver | 1 hour | 删除文件 + 检查引用 |
| 9. Documentation & Handoff | 1 hour | 写 M6-outcome.md |
| 10. Final Validation & Push | 1 hour | 完整测试 + 推送 |
| **Total** | **14 hours** | 约 2 个工作日 |

**风险缓冲**: 建议预留 20% 时间（+3 hours）应对意外问题（端口冲突、环境差异、GUI 测试调试）。

**总预算**: **17 hours**

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| Legacy webserver 存在隐藏依赖 | 删除后桌面应用启动失败 | 中 | Phase 8 前先 grep 检查引用，逐步删除 |
| GUI E2E 测试环境配置困难 | 测试无法运行或 flaky | 高 | 只写骨架 + 关键断言，标记为 manual test |
| Backend 二进制在 CI 不可用 | E2E 测试跳过或失败 | 中 | Phase 1 检查二进制路径，M7 补充 CI build |
| 密码迁移逻辑不兼容 | 用户无法登录 | 低 | Phase 2 加强首次运行提示，提供 reset 命令 |
| Headless 模式在 Windows 不可用 | CLI 路径跨平台失败 | 中 | Phase 6 测试多平台，调整 path 逻辑 |

---

## 成功标准

M6 完成的标志：

1. ✅ `startWebHost` 实现并通过单元测试（5+ 测试）
2. ✅ 桌面 IPC 路径切换到 `@aionui/web-host`，手动冒烟通过
3. ✅ 桌面 GUI 路径可启动/停止 WebUI，手动冒烟通过
4. ✅ Headless CLI 路径可通过 `bun run webui` 启动，E2E 测试通过
5. ✅ Legacy `packages/desktop/src/process/webserver/` 已删除
6. ✅ E2E 测试覆盖三条路径（至少骨架 + 关键断言）
7. ✅ 类型检查、lint、单元测试全部通过
8. ✅ M6-outcome.md 已提交并推送

---

## 下一个里程碑 (M7 预告)

- **M7: Prepare Backend CI**: 在 CI 中构建 backend 二进制，确保 E2E 测试可用
- **M8: Web CLI Tarball**: 打包 `@aionui/web-host` 为独立 tarball，供非 Electron 环境使用
- **M9: Install Web Script**: 提供一键安装脚本，简化 Linux headless 部署

---

**Plan Writer**: plan-writer-m6-retry  
**Plan Version**: 1.0  
**Last Updated**: 2026-05-08
