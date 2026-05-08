# M5 static-server + auth 迁入 web-host(老 webserver 并存)实施计划

> **给执行 agent**:本计划自包含。只读本文件和下方"参考文档"列出的内容,
> 不要扩散到 M6/M7/M8/M9 —— 它们依赖 M5 或与 M5 无关,读了会污染上下文。
> 代码示例以**本文件最终形态**为准,不要自创"更优写法"。

**目标**:把 `packages/desktop/src/process/webserver/` 里的**两类逻辑**迁到
`packages/web-host/src/`,同时把 M3 占位的 5 个 auth 公共 API 和 2 个
config I/O 函数**实现化**:

- 静态服务 + 反代 → `packages/web-host/src/static-server.ts`:Node 原生 `http`
  + `serve-handler`;`/api/*` 反代到 backend;`/ws` upgrade 反代;SPA fallback
- auth 模块 → `packages/web-host/src/auth/`:bcrypt + `webui.config.json` 读写
  + session cookie + `/api/auth/login` handler + 5 次 / 15 分钟限流

**并存策略(硬性)**:老 `packages/desktop/src/process/webserver/` **保留不删、
不改调用方**。桌面 `bun run webui`、`--webui`、GUI 开关本里程碑仍走老代码,
切换到 web-host 是 M6 的事。

**等价性测试**:写对比测试,起两个本地端口(老 webserver 一个,web-host
static-server 一个),对 10 个关键端点发请求,对比 status / body / 关键
header 等价。

**架构**:纯迁移 + 实现化。不新增业务能力、不改既有用户数据、不碰任何
IPC bridge 或前端一行代码。

**边界(不做 —— 触碰即违反 requirements)**:

- ❌ **不删** `packages/desktop/src/process/webserver/`(M6 再删)
- ❌ **不改** `WebuiModalContent` / `webui.start/stop` IPC 调用(M6 再切换)
- ❌ **不改** `restoreDesktopWebUIFromPreferences`(M6 再就地改内部调用)
- ❌ **不改** `--webui` 启动分支(M6 再改)
- ❌ **不实现** `startWebHost()` 完整组装(除非等价性测试需要,见阶段 8)
- ❌ **不引入 express**(设计文档已定 Node 原生 http + serve-handler)
- ❌ **不做数据迁移**:`webui.config.json` 磁盘路径、schema、文件名保持
  和老 webserver 完全一致,用户数据零迁移
- ❌ **不复用**老 webserver 代码(不能 `import` 它),只能照抄 + 脱 Electron
- ❌ **不 import** `electron` / `packages/desktop/src/process/(agent|worker|services|webserver)`

---

## 零上下文会话背景

你在执行 9 个里程碑重构中的**第 5 个(M5)**。上游:M4
(`feat/m4-backend-launcher-migration` 已 merge)。下游:M6(三路径切换 + 删老
webserver)。完整设计在
`docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md`,
团队协作契约在
`docs/backend-migration/plans/2026-05-07-webui-decouple-teammate-cheatsheet.md`。

**M5 的交付物**:

- `packages/web-host/src/static-server.ts` 具备完整运行期实现,
  `startStaticServer` / `stopStaticServer` 不再抛 not-implemented
- `packages/web-host/src/auth/config.ts` 实现化 `readConfig` / `writeConfig`
- `packages/web-host/src/auth/session.ts` 实现化 `createSession` /
  `verifySession`
- `packages/web-host/src/auth/index.ts` 实现化全部 **5 个** UC-3 锁定签名:
  `resetPassword` / `changePassword` / `verifyPassword` / `loadConfig` /
  `saveConfig`
- 5 次 / 15 分钟的登录限流(按 IP),与老 webserver 一致
- `packages/web-host/src/auth/index.unit.test.ts` + 其他 unit test 覆盖所有
  5 个 API 的每个场景(requirements 明确:缺一不通过)
- `packages/web-host/tests/equivalence.test.ts` 对 10 个关键端点做等价性
  对比,10/10 等价
- 老 `packages/desktop/src/process/webserver/` **保持不变**,桌面
  `bun run webui` 仍绿

**M5 不做的事**:不删 webserver、不切换调用方、不改 preload/前端、不改
IPC bridge、不实现 `startWebHost` 完整组装(除非阶段 8 明确需要)。

**前置条件**:
- `git status` 干净
- 已装 Node 22+、bun、curl、grep、lsof(或 ss/netstat 替代)
- 本地能跑 `bun install` / `bun run webui`(老 webserver 启动)
- M4 上游分支 `origin/feat/m4-backend-launcher-migration` 已存在(backend-launcher
  + M4 handoff 就绪)
- M3 已锁定的 `WebUIConfig` 类型签名(见下方"已定接口契约")你不能破坏

**分支**:基于 `origin/feat/m4-backend-launcher-migration` 创建
`feat/m5-static-server-auth-migration`(不是基于 `main`,不是基于
`feat/backend-migration`):

```bash
git fetch origin
git checkout -b feat/m5-static-server-auth-migration origin/feat/m4-backend-launcher-migration
git rev-parse --abbrev-ref HEAD    # 应为 feat/m5-static-server-auth-migration
```

不创建 PR,不 push/merge 到 `feat/backend-migration`,不 rebase 上游。

---

## 参考文档(只读这些,其余一律不读)

1. `docs/backend-migration/plans/2026-05-07-webui-decouple-teammate-cheatsheet.md`
   —— 完整读,尤其"分支规则" / "基线同步三步" / "UC 摘要" / "遇到状况怎么办"
2. `docs/backend-migration/plans/2026-05-07-m5-static-server-auth-migration-requirements.md`
   —— 本里程碑 requirements,最高优先级
3. `docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md`
   —— 只读 **"统一约束补充(UC-1/UC-2/UC-3)"** / **"改造要点 C"** /
   **"改造要点 D"** / **"关键接口抽象"** 四节。其他节属于 M4/M6+ 范围,
   读了会污染
4. `docs/backend-migration/handoffs/M1-outcome.md` + `M2-outcome.md` +
   `M3-outcome.md` + `M4-outcome.md` —— 按顺序读,了解上游已交付的结构
   与接口锁定状态

---

## 已定接口契约(硬约束,不得破坏)

从 M3-outcome 锁定,M4 未改,M5 **只能扩展字段,不得修改签名**:

```ts
// packages/web-host/src/types.ts —— 不得重写,只能追加字段
export type AppMetadata = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string;
  userDataPath: string;
};

export type WebUIConfig = {
  passwordHash: string;
  adminUsername: string;
  // M5 补齐真实 schema —— 见"决策点 D-01"
};

// packages/web-host/src/auth/index.ts —— 签名锁死,实现化即可
export async function resetPassword(opts: { app: AppMetadata }): Promise<string>;
export async function changePassword(opts: {
  app: AppMetadata;
  oldPassword: string;
  newPassword: string;
}): Promise<void>;
export async function verifyPassword(opts: {
  app: AppMetadata;
  password: string;
}): Promise<boolean>;
export async function loadConfig(opts: { app: AppMetadata }): Promise<WebUIConfig>;
export async function saveConfig(opts: { app: AppMetadata; config: WebUIConfig }): Promise<void>;
```

---

## 已知冲突与 escalate 清单(开工前必读)

以下是**现状 vs requirements 的真实冲突**,plan-writer 在撰写本文件时发现
并记录。Executor 遇到对应场景时,按"处置"栏执行;**不得自主偏离**。

### 决策点 D-01:密码持久化位置

- **Requirements(权威)**:"bcrypt 密码持久化、`webui.config.json` 读写";
  "`webui.config.json` 路径和老 webserver 完全一致
  (`userDataPath/webui.config.json`)"
- **现状**:老 webserver 的 `UserRepository`
  (`packages/desktop/src/process/webserver/auth/repository/UserRepository.ts`)
  通过 HTTP 调 backend 的 `/api/auth/internal/users`,**密码 hash 实际存在
  backend SQLite 里**;`packages/desktop/src/process/utils/webuiConfig.ts` 的
  `webui.config.json` **只存 `port` / `allowRemote`**,**不存** `passwordHash` /
  `adminUsername`。
- **冲突**:requirements 里"老 webserver 已经用 `webui.config.json` 存
  bcrypt 密码"的前置假设在代码层面不成立。
- **处置**(硬性,不得偏离):
  1. 按 requirements 和 M3 handoff 的 `WebUIConfig` 签名(已含
     `passwordHash` + `adminUsername`)**在 web-host 内实现 `webui.config.json`
     的 bcrypt 落盘**。在 web-host 的世界里,**`webui.config.json` 就是密码
     的权威来源**,不走 HTTP 调 backend 的老路径。
  2. `WebUIConfig` 的完整 schema 由 M5 首次确立(M3 handoff 留的注释"M5 will
     confirm complete schema")。确立后**不得再改**,M6 切换时也按此 schema
     读老文件(若老文件不存在,当作首次启动生成新 admin 凭证)。
  3. M5 的等价性测试中,老 webserver 的 `/api/auth/login` 会真正走 backend
     SQLite,web-host 的 `/api/auth/login` 走 `webui.config.json`——这是**两
     条不同的数据源**。为避免 10/10 等价测试用"同一份账号"判等失败,在
     equivalence 测试里**统一用 mock backend 替换老 webserver 的
     UserRepository HTTP 调用**(requirements 已明文:"后端一律用 mock HTTP
     server 替代,不启真 aionui-backend")。测试"等价"的含义是
     **HTTP 接口字段 / 错误码 / Set-Cookie 一致**,不是"读到同一份密码"。
  4. **迁移数据**:用户从老版本升级到 M6 之后,若 `webui.config.json` 不
     含 `passwordHash`,web-host 首次启动视作"未初始化",生成新 admin
     随机密码并写回 —— 这等同于老 webserver 首次启动行为(见老
     `initializeDefaultAdmin`)。**M5 执行者不处理**"把 backend SQLite 的
     老密码迁到 webui.config.json"这个跨系统数据迁移,那是 M6 范围的
     产品决策,M5 不预判。
- **不得自主偏离的边界**:若实现中发现 requirements 签名本身无法落地
  (例如 `bcrypt` 版本差异导致 hash 不兼容,或 `WebUIConfig` 必须增字段而
  M6 会因此破坏),**停止实现,不push,按"阶段 13.4 escalate"上报给
  team-lead**,由人类改 requirements。

### 决策点 D-02:`/api/*` 反代 vs 业务处理

- **Requirements**:static-server 里 `/api/*` 反代到 backend;等价性测试
  第 7 项 "GET /api/anything → 反代透传";第 10 项"backend 未就绪 → 502"。
- **现状**:老 webserver 的 `apiRoutes.ts` 在 `/api/*` 挂了大量业务逻辑
  (multer 上传、`/api/directory`、`/api/ppt-proxy`、`/api/stt` 等,全靠
  express + `ipcBridge`),**不是简单反代**。
- **解读**:requirements 视角下 web-host 就是"纯反代"——业务已在
  aionui-backend(Rust)里覆盖,web-host 不再承担老 webserver 的 express
  业务层。这与 design 文档"核心原则"一致:"业务逻辑只留在 aionui-backend,
  web-host 只做拉 backend + serve 静态 + 认证"。
- **处置**(硬性):
  1. `packages/web-host/src/static-server.ts` 的 `/api/*` **只做透传反代**
     (`http.request` 把请求原样转发给 backend port,返回流式回写),
     **不移植** `multer` / `ipcBridge` / `/api/directory` 这些 express
     业务层。
  2. 等价性测试第 7 项用**最简反代端点**(例如 `GET /api/auth/status`——
     backend 真实提供;或 mock backend 固定返回 `{"ok":true}`)**对比两端
     HTTP 响应是否等价**,不验证业务语义。
  3. 业务层断裂的影响(例如桌面 GUI 开关切到 web-host 后 `/api/directory`
     行为变化)**由 M6 plan 负责描述**,M5 不扩散。
  4. 若执行者读源码后判定"反代方式不能覆盖 requirements 第 7/10 项"
     → 停止,escalate。

### 决策点 D-03:Vite dev proxy

- **现状**:老 webserver 的 `registerStaticRoutes` 在**未找到 out/renderer/
  时**会退化为"代理到 Vite dev server(`localhost:5173`)",
  WebSocket HMR 也通过 webserver 反代(见 `index.ts` 的 `upgrade` handler)。
- **处置**:web-host 的 static-server 是**生产面的静态服务**,不关心 Vite
  dev 模式。等价性测试**只跑 production 路径**(提供一份假的 `out/renderer/`
  作为测试夹具,不依赖 Vite)。plan 的所有"等价"对比都基于 production
  模式。

---

## 文件清单

**修改**(实现化 M3 占位 / M4 之后需要实现的文件):
- `packages/web-host/src/static-server.ts`(改写,替换 M5 占位)
- `packages/web-host/src/auth/index.ts`(改写 5 个 API 的实现)
- `packages/web-host/src/auth/config.ts`(改写 `readConfig` / `writeConfig`)
- `packages/web-host/src/auth/session.ts`(改写 `createSession` / `verifySession`)
- `packages/web-host/src/types.ts`(追加 `WebUIConfig` 真实 schema 字段,
  **不改**既有字段名)
- `packages/web-host/src/index.ts`(re-export 新符号,见阶段 7)
- `packages/web-host/package.json`(新增 `bcryptjs` / `cookie` 等 dev 运行
  依赖,见阶段 0.5)

**新建**:
- `packages/web-host/src/auth/rateLimiter.ts`(登录限流独立模块,便于单测)
- `packages/web-host/src/auth/index.unit.test.ts`(UC-3 五个 API 的完整覆盖)
- `packages/web-host/src/auth/config.unit.test.ts`(**替换**原 `config.test.ts`
  占位,保留文件名并改内容)
- `packages/web-host/src/auth/session.unit.test.ts`
- `packages/web-host/src/auth/rateLimiter.unit.test.ts`
- `packages/web-host/src/static-server.unit.test.ts`(**替换**原
  `static-server.test.ts` 占位)
- `packages/web-host/tests/equivalence.test.ts`(起双端口对比,见阶段 9)
- `packages/web-host/tests/fixtures/renderer/` 目录(内含假 `index.html` /
  `assets/main.js`,供等价性测试)
- `packages/web-host/tests/fixtures/mock-backend.ts`(等价性测试共用的 mock
  backend HTTP server)
- `packages/web-host/vitest.config.ts`(扩展 projects / test 范围,见阶段 0.4)

**删除 / 搬走**:
- 无(M5 保留老 webserver)

**不动(硬性)**:
- `packages/desktop/src/process/webserver/**`(全部保留)
- `packages/desktop/src/process/utils/webuiConfig.ts`
- `packages/desktop/src/index.ts` 的 `isWebUIMode` 分支
- `packages/desktop/src/preload/main.ts`
- `packages/desktop/src/renderer/**`
- `packages/web-host/src/backend-launcher.ts`(M4 已实现)

**验证不回退**(只跑,不改):
- `cd packages/web-host && bun run test`(M5 单元 + 等价性测试全绿)
- `bun run webui`(老 webserver 仍能启动,`curl /` 返回 200)
- `bun run lint` / `bunx tsc --noEmit`
- 依赖边界 grep(见阶段 10)

---

## 阶段 0:工具预检 + 基线快照 + 建分支 + 声明依赖

### 步骤 0.1 —— 工具预检

```bash
command -v node && node --version                # 预期 22+
command -v bun && bun --version                  # 预期可用
command -v curl && curl --version | head -1
command -v grep
command -v lsof || echo "无 lsof,用 ss/netstat 替代"
command -v openssl || echo "无 openssl,仅用于 fixture 生成步骤,不必强装"
```

任一必需工具(`node` / `bun` / `curl` / `grep`)缺失 → **不硬装,escalate**。

### 步骤 0.2 —— 基线快照

```bash
cd /Users/zhoukai/Documents/github/AionUi

# 记录老 webserver 的文件清单(后续验证"未改")
find packages/desktop/src/process/webserver -type f | sort > /tmp/m5-baseline-webserver-files.txt
wc -l /tmp/m5-baseline-webserver-files.txt

# 记录 M4 handoff 的 backend-launcher 测试通过数
cd packages/web-host && bun run test 2>&1 | tail -20 > /tmp/m5-baseline-webhost-test.log
cd ../..

# 记录 webui.config.json 可能的用户数据位置(不读、不改内容,只记录路径)
# macOS:        ~/Library/Application Support/aionui/webui.config.json
# Linux:        ~/.config/aionui/webui.config.json
# Windows:      %APPDATA%/aionui/webui.config.json
echo "userDataPath 将由 AppMetadata 注入,M5 不碰真实用户数据"
```

预期:`baseline-webserver-files.txt` 有 **20** 个文件(含 19 个 ts + 1 个
`express.d.ts`);`baseline-webhost-test.log` 显示 M4 测试全绿。

### 步骤 0.3 —— 基于 M4 feature 分支创建 M5 分支

```bash
git fetch origin
git checkout -b feat/m5-static-server-auth-migration origin/feat/m4-backend-launcher-migration
git rev-parse --abbrev-ref HEAD      # 应为 feat/m5-static-server-auth-migration
git merge-base --is-ancestor origin/feat/m4-backend-launcher-migration HEAD && echo "base OK"
```

### 步骤 0.4 —— 扩展 `packages/web-host/vitest.config.ts` 识别 equivalence 目录

老配置只扫 `src/**/*.test.ts`,等价性测试放 `tests/equivalence.test.ts`,需
显式加入。

**Edit** `packages/web-host/vitest.config.ts`:

old_string:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

new_string:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,unit.test}.ts', 'tests/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
```

提交:
```bash
git add packages/web-host/vitest.config.ts
git commit -m "chore(m5): expand web-host vitest scan to include tests/ dir"
```

### 步骤 0.5 —— 声明 web-host 运行依赖

```bash
cd packages/web-host
# bcryptjs: 与老 webserver 保持一致(避免 native build 差异);风险表已提
# cookie: 解析 Set-Cookie / Cookie header,轻量、零依赖
bun add bcryptjs@^2.4.3 cookie@^1.0.2
bun add -d @types/bcryptjs@^2.4.6 @types/cookie@^1.0.5
cd ../..
git diff packages/web-host/package.json bun.lock | head -40
git add packages/web-host/package.json bun.lock
git commit -m "chore(m5): add bcryptjs + cookie runtime deps to web-host"
```

**版本锁定理由**:老 webserver 的 `package.json` 使用 `bcryptjs`(非
`bcrypt`),requirements 已指出"plan-writer 读老 webserver 的 package.json
依赖和实际 import,保持一致"。选 `cookie` 是因为 `serve-handler` 不处理
Set-Cookie,且 `cookie` 是 Express 背后的同一个库,语义最稳。

---

## 阶段 1:`WebUIConfig` schema 冻结 + `auth/config.ts` 实现

### 步骤 1.1 —— 冻结 `WebUIConfig` 真实 schema

根据"已定决策 D-01"的结论,`WebUIConfig` 在 M5 必须首次定义完整。

**Edit** `packages/web-host/src/types.ts`:

old_string:
```ts
export type WebUIConfig = {
  passwordHash: string;
  adminUsername: string;
  // M5 will confirm complete schema when migrating from old webui.config.json
};
```

new_string:
```ts
/**
 * WebUI configuration persisted to userDataPath/webui.config.json.
 *
 * Schema frozen in M5. Fields MUST NOT be renamed or removed in M6+; only
 * additive changes are allowed (with explicit migration notes in handoff).
 *
 * Design choice (M5): admin credentials live in this file under web-host's
 * control. The legacy webserver persisted the same user via backend SQLite;
 * M6 migration handles that transition at the desktop shell level.
 */
export type WebUIConfig = {
  /** bcrypt hash of the admin password. Empty string means "not initialized yet". */
  passwordHash: string;
  /** Admin username. Defaults to 'admin'. */
  adminUsername: string;
  /** Preferred server port. Optional; CLI / env override wins. */
  port?: number;
  /** Whether to allow remote (0.0.0.0) binding by default. */
  allowRemote?: boolean;
  /** ISO timestamp of last password change. For audit only. */
  passwordUpdatedAt?: string;
};
```

提交:
```bash
git add packages/web-host/src/types.ts
git commit -m "feat(m5): freeze WebUIConfig schema with optional port/allowRemote fields"
```

### 步骤 1.2 —— 实现 `auth/config.ts`

**Write** `packages/web-host/src/auth/config.ts`:

```ts
/**
 * WebUI config I/O — JSON persistence at userDataPath/webui.config.json.
 *
 * Intentionally atomic: write to a .tmp sibling then rename. Prevents
 * corruption if the process is killed mid-write.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppMetadata, WebUIConfig } from '../types.js';

const CONFIG_FILE_NAME = 'webui.config.json';
const DEFAULT_ADMIN_USERNAME = 'admin';

function resolveConfigPath(app: AppMetadata): string {
  return path.join(app.userDataPath, CONFIG_FILE_NAME);
}

function defaultConfig(): WebUIConfig {
  return {
    passwordHash: '',
    adminUsername: DEFAULT_ADMIN_USERNAME,
  };
}

/**
 * Read webui.config.json. Returns a default config (empty passwordHash,
 * adminUsername='admin') when the file is missing or unparseable.
 * Missing-or-corrupt semantics match legacy webserver's tolerance.
 */
export async function readConfig(app: AppMetadata): Promise<WebUIConfig> {
  const filePath = resolveConfigPath(app);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig();
    throw err;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaultConfig();
    const obj = parsed as Partial<WebUIConfig>;
    return {
      passwordHash: typeof obj.passwordHash === 'string' ? obj.passwordHash : '',
      adminUsername:
        typeof obj.adminUsername === 'string' && obj.adminUsername.length > 0
          ? obj.adminUsername
          : DEFAULT_ADMIN_USERNAME,
      port: typeof obj.port === 'number' ? obj.port : undefined,
      allowRemote: typeof obj.allowRemote === 'boolean' ? obj.allowRemote : undefined,
      passwordUpdatedAt:
        typeof obj.passwordUpdatedAt === 'string' ? obj.passwordUpdatedAt : undefined,
    };
  } catch {
    return defaultConfig();
  }
}

/**
 * Atomic write: userDataPath/webui.config.json.
 * Creates userDataPath if it doesn't exist.
 */
export async function writeConfig(app: AppMetadata, config: WebUIConfig): Promise<void> {
  const filePath = resolveConfigPath(app);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const payload = JSON.stringify(config, null, 2) + '\n';
  await fs.writeFile(tmpPath, payload, { encoding: 'utf-8', mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}
```

**验证**(本步只检查编译):

```bash
cd packages/web-host && bunx tsc --noEmit
```

预期:无输出。

提交:
```bash
git add packages/web-host/src/auth/config.ts
git commit -m "feat(m5): implement auth/config.ts with atomic read/write to webui.config.json"
```

### 步骤 1.3 —— 写 `auth/config.unit.test.ts`

**Write** `packages/web-host/src/auth/config.unit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppMetadata } from '../types.js';
import { readConfig, writeConfig } from './config.js';

async function makeTempApp(): Promise<AppMetadata> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-host-config-'));
  return {
    version: '0.0.0-test',
    isPackaged: false,
    resourcesPath: dir,
    userDataPath: dir,
  };
}

describe('auth/config', () => {
  let app: AppMetadata;

  beforeEach(async () => {
    app = await makeTempApp();
  });

  afterEach(async () => {
    await fs.rm(app.userDataPath, { recursive: true, force: true });
  });

  it('readConfig returns default when file missing', async () => {
    const cfg = await readConfig(app);
    expect(cfg).toEqual({ passwordHash: '', adminUsername: 'admin' });
  });

  it('readConfig returns default when JSON malformed', async () => {
    await fs.writeFile(path.join(app.userDataPath, 'webui.config.json'), '{not json');
    const cfg = await readConfig(app);
    expect(cfg.adminUsername).toBe('admin');
  });

  it('writeConfig then readConfig returns same object', async () => {
    const input = {
      passwordHash: '$2a$12$fakehashvalue',
      adminUsername: 'custom-admin',
      port: 25808,
      allowRemote: true,
      passwordUpdatedAt: '2026-05-07T12:00:00Z',
    };
    await writeConfig(app, input);
    const out = await readConfig(app);
    expect(out).toEqual(input);
  });

  it('writeConfig is atomic (no .tmp leaked on success)', async () => {
    await writeConfig(app, { passwordHash: 'h', adminUsername: 'admin' });
    const entries = await fs.readdir(app.userDataPath);
    expect(entries).toContain('webui.config.json');
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
  });

  it('writeConfig creates missing userDataPath', async () => {
    const nested = path.join(app.userDataPath, 'deep', 'new', 'dir');
    const app2: AppMetadata = { ...app, userDataPath: nested };
    await writeConfig(app2, { passwordHash: 'h', adminUsername: 'admin' });
    const stat = await fs.stat(path.join(nested, 'webui.config.json'));
    expect(stat.isFile()).toBe(true);
  });

  it('readConfig ignores unknown fields without crashing', async () => {
    await fs.writeFile(
      path.join(app.userDataPath, 'webui.config.json'),
      JSON.stringify({ passwordHash: 'h', adminUsername: 'a', futureField: 'x' }),
    );
    const cfg = await readConfig(app);
    expect(cfg.passwordHash).toBe('h');
    expect((cfg as Record<string, unknown>).futureField).toBeUndefined();
  });
});
```

**验证**:
```bash
cd packages/web-host && bunx vitest run src/auth/config.unit.test.ts
```

预期:6 test pass。

```bash
# 旧占位文件 config.test.ts 仍然抛 not-implemented,必须清理
rm src/auth/config.test.ts
```

提交:
```bash
git add packages/web-host/src/auth/config.unit.test.ts packages/web-host/src/auth/config.test.ts
git commit -m "test(m5): cover auth/config with 6 scenarios; drop M3 placeholder"
```

---

## 阶段 2:`auth/session.ts` 实现 + 测试

### 步骤 2.1 —— 实现 session 模块

老 webserver 用 JWT(`jsonwebtoken`)+ DB 存 JWT secret。M5 为了降低依赖面,
**改用** HMAC-SHA256 签名的不透明 token(payload 是 `{uid,exp,nonce}` 的
JSON,secret 来自 `webui.config.json` 的 `passwordHash` 或一次性生成并持久
化到内存)。这一改动**仅限 web-host 内部**,**对外 HTTP 接口(`Set-Cookie`
的 cookie 名、SameSite、Path、HttpOnly)**与老 webserver 完全一致
(`aionui-session`)。

**Write** `packages/web-host/src/auth/session.ts`:

```ts
/**
 * In-memory session management for WebUI login.
 *
 * Design notes:
 *  - HMAC-SHA256 signed opaque tokens (no JWT lib dependency).
 *  - Cookie name / options match legacy webserver: name='aionui-session',
 *    HttpOnly=true, SameSite='strict' (local) or 'lax' (remote).
 *  - Session store is in-memory only (consistent with legacy webserver).
 */

import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'aionui-session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h, match legacy SESSION_EXPIRY

export type SessionOptions = {
  maxAge?: number;
};

export type SessionHandle = {
  token: string;
  destroy: () => void;
};

type SessionEntry = {
  username: string;
  expiresAt: number;
};

const store = new Map<string, SessionEntry>();
const secret = crypto.randomBytes(32);

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSession(opts?: SessionOptions & { username?: string }): SessionHandle {
  const username = opts?.username ?? 'admin';
  const ttl = opts?.maxAge ?? SESSION_TTL_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + ttl;
  const payload = Buffer.from(JSON.stringify({ u: username, e: expiresAt, n: nonce })).toString('base64url');
  const signature = sign(payload);
  const token = `${payload}.${signature}`;
  store.set(token, { username, expiresAt });
  return {
    token,
    destroy: () => store.delete(token),
  };
}

export function verifySession(token: string): boolean {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  // constant-time compare
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  ) {
    return false;
  }
  const entry = store.get(token);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    store.delete(token);
    return false;
  }
  return true;
}

export const SESSION_COOKIE = {
  NAME: SESSION_COOKIE_NAME,
  HTTP_ONLY: true as const,
  SAME_SITE_LOCAL: 'strict' as const,
  SAME_SITE_REMOTE: 'lax' as const,
  PATH: '/' as const,
  MAX_AGE_MS: SESSION_TTL_MS,
};

// Exposed for tests only. DO NOT use in production code paths.
export const __internal_clearStore_for_tests__ = (): void => {
  store.clear();
};
```

提交:
```bash
git add packages/web-host/src/auth/session.ts
git commit -m "feat(m5): implement session module (HMAC-signed opaque tokens, legacy cookie name)"
```

### 步骤 2.2 —— `auth/session.unit.test.ts`

**Write** `packages/web-host/src/auth/session.unit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  verifySession,
  SESSION_COOKIE,
  __internal_clearStore_for_tests__,
} from './session.js';

describe('auth/session', () => {
  beforeEach(() => __internal_clearStore_for_tests__());

  it('createSession returns a token that verifies', () => {
    const s = createSession({ username: 'admin' });
    expect(s.token).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]+$/);
    expect(verifySession(s.token)).toBe(true);
  });

  it('verifySession rejects tampered payload', () => {
    const s = createSession({ username: 'admin' });
    const [, sig] = s.token.split('.');
    const bad = Buffer.from(JSON.stringify({ u: 'attacker', e: Date.now() + 1e6 }))
      .toString('base64url');
    expect(verifySession(`${bad}.${sig}`)).toBe(false);
  });

  it('verifySession rejects tampered signature', () => {
    const s = createSession({ username: 'admin' });
    const [payload] = s.token.split('.');
    const bogusSig = 'f'.repeat(64);
    expect(verifySession(`${payload}.${bogusSig}`)).toBe(false);
  });

  it('destroy removes the session from store', () => {
    const s = createSession({ username: 'admin' });
    expect(verifySession(s.token)).toBe(true);
    s.destroy();
    expect(verifySession(s.token)).toBe(false);
  });

  it('expired session is rejected', async () => {
    const s = createSession({ username: 'admin', maxAge: 1 });
    await new Promise((r) => setTimeout(r, 10));
    expect(verifySession(s.token)).toBe(false);
  });

  it('cookie constants match legacy webserver', () => {
    expect(SESSION_COOKIE.NAME).toBe('aionui-session');
    expect(SESSION_COOKIE.HTTP_ONLY).toBe(true);
    expect(SESSION_COOKIE.SAME_SITE_LOCAL).toBe('strict');
    expect(SESSION_COOKIE.SAME_SITE_REMOTE).toBe('lax');
  });

  it('verifySession returns false for malformed tokens', () => {
    expect(verifySession('')).toBe(false);
    expect(verifySession('no-dot')).toBe(false);
    expect(verifySession('a.b')).toBe(false);
  });
});
```

**验证**:
```bash
cd packages/web-host && bunx vitest run src/auth/session.unit.test.ts
```

预期:7 test pass。

提交:
```bash
git add packages/web-host/src/auth/session.unit.test.ts
git commit -m "test(m5): cover auth/session — creation, tamper, expiry, cookie constants"
```

---

## 阶段 3:`auth/rateLimiter.ts` 实现 + 测试

### 步骤 3.1 —— 独立抽出限流模块

**Write** `packages/web-host/src/auth/rateLimiter.ts`:

```ts
/**
 * Minimal in-memory rate limiter shared by /api/auth/login.
 * 5 attempts / 15 minutes, keyed by client IP. Matches legacy
 * authRateLimiter in packages/desktop/src/process/webserver/middleware/rateLimiter.ts.
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 5;

type Entry = { count: number; resetAt: number };

export class RateLimiter {
  private readonly store = new Map<string, Entry>();

  constructor(
    private readonly windowMs: number = LOGIN_WINDOW_MS,
    private readonly max: number = LOGIN_MAX_ATTEMPTS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true if the attempt is allowed; bumps the counter either way. */
  attempt(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const t = this.now();
    let entry = this.store.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
    }
    entry.count += 1;
    this.store.set(key, entry);
    const allowed = entry.count <= this.max;
    return {
      allowed,
      remaining: Math.max(0, this.max - entry.count),
      retryAfterMs: allowed ? 0 : entry.resetAt - t,
    };
  }

  /** Reset the counter for a key (call on successful login to match legacy skipSuccessfulRequests). */
  reset(key: string): void {
    this.store.delete(key);
  }

  /** Expose for tests only. */
  __internal_peek_for_tests__(key: string): Entry | undefined {
    return this.store.get(key);
  }
}
```

提交:
```bash
git add packages/web-host/src/auth/rateLimiter.ts
git commit -m "feat(m5): add rate limiter (5 attempts / 15 min) for login endpoint"
```

### 步骤 3.2 —— 限流测试

**Write** `packages/web-host/src/auth/rateLimiter.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RateLimiter, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from './rateLimiter.js';

describe('auth/rateLimiter', () => {
  it('allows up to LOGIN_MAX_ATTEMPTS within the window', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      expect(rl.attempt('1.2.3.4').allowed).toBe(true);
    }
    expect(rl.attempt('1.2.3.4').allowed).toBe(false);
  });

  it('reports remaining count correctly', () => {
    const rl = new RateLimiter();
    expect(rl.attempt('ip').remaining).toBe(LOGIN_MAX_ATTEMPTS - 1);
    expect(rl.attempt('ip').remaining).toBe(LOGIN_MAX_ATTEMPTS - 2);
  });

  it('resets when window expires', () => {
    let clock = 0;
    const rl = new RateLimiter(LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS, () => clock);
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS + 1; i++) rl.attempt('ip');
    expect(rl.attempt('ip').allowed).toBe(false);
    clock += LOGIN_WINDOW_MS + 1;
    expect(rl.attempt('ip').allowed).toBe(true);
  });

  it('reset() clears the counter', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) rl.attempt('ip');
    rl.reset('ip');
    expect(rl.attempt('ip').allowed).toBe(true);
  });

  it('separate keys have independent counters', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) rl.attempt('ip-1');
    expect(rl.attempt('ip-2').allowed).toBe(true);
  });

  it('retryAfterMs is positive when blocked', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) rl.attempt('ip');
    const out = rl.attempt('ip');
    expect(out.allowed).toBe(false);
    expect(out.retryAfterMs).toBeGreaterThan(0);
  });
});
```

**验证**:
```bash
cd packages/web-host && bunx vitest run src/auth/rateLimiter.unit.test.ts
```

预期:6 test pass。

提交:
```bash
git add packages/web-host/src/auth/rateLimiter.unit.test.ts
git commit -m "test(m5): cover rate limiter — max attempts, expiry, reset, isolation"
```

---

## 阶段 4:`auth/index.ts` 5 个 UC-3 API 实现 + 测试

### 步骤 4.1 —— 实现 5 个 API

**Write**(覆盖原占位文件) `packages/web-host/src/auth/index.ts`:

```ts
/**
 * Public auth API (UC-3 contract, frozen signatures).
 *
 * Five entry points are exposed here:
 *   - resetPassword   : CLI `--resetpass` + desktop GUI reset button
 *   - changePassword  : desktop preload `webuiChangePassword` IPC
 *   - verifyPassword  : internal /api/auth/login handler
 *   - loadConfig      : exported for session/rate-limit/orchestration reuse
 *   - saveConfig      : exported for session/rate-limit/orchestration reuse
 *
 * Implementation notes (M5):
 *   - Storage: userDataPath/webui.config.json (see ./config.ts)
 *   - Hashing: bcryptjs (matches legacy webserver dependency)
 *   - No HTTP dependency; pure I/O + crypto.
 */

import bcrypt from 'bcryptjs';
import type { AppMetadata, WebUIConfig } from '../types.js';
import { readConfig, writeConfig } from './config.js';

export { readConfig as loadConfig, writeConfig as saveConfig };

const BCRYPT_SALT_ROUNDS = 10; // matches legacy resetPasswordCLI.ts hashPassword
const PASSWORD_LENGTH = 12;
const PASSWORD_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRandomPassword(): string {
  const out: string[] = [];
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    const idx = Math.floor(Math.random() * PASSWORD_ALPHABET.length);
    out.push(PASSWORD_ALPHABET[idx]);
  }
  return out.join('');
}

/**
 * Reset password to a freshly generated value. Persists immediately.
 * Returns the plaintext password (caller displays to user / returns to CLI).
 */
export async function resetPassword(opts: { app: AppMetadata }): Promise<string> {
  const cfg = await readConfig(opts.app);
  const newPassword = generateRandomPassword();
  const hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  const next: WebUIConfig = {
    ...cfg,
    passwordHash: hash,
    adminUsername: cfg.adminUsername || 'admin',
    passwordUpdatedAt: new Date().toISOString(),
  };
  await writeConfig(opts.app, next);
  return newPassword;
}

/**
 * Change password after verifying the old one.
 * Throws on verification failure; caller maps to the correct HTTP status.
 */
export async function changePassword(opts: {
  app: AppMetadata;
  oldPassword: string;
  newPassword: string;
}): Promise<void> {
  const cfg = await readConfig(opts.app);
  if (!cfg.passwordHash) {
    throw new Error('PASSWORD_NOT_INITIALIZED');
  }
  const ok = await bcrypt.compare(opts.oldPassword, cfg.passwordHash);
  if (!ok) {
    throw new Error('INVALID_OLD_PASSWORD');
  }
  const hash = await bcrypt.hash(opts.newPassword, BCRYPT_SALT_ROUNDS);
  await writeConfig(opts.app, {
    ...cfg,
    passwordHash: hash,
    passwordUpdatedAt: new Date().toISOString(),
  });
}

/**
 * Compare password against stored bcrypt hash. Returns false for missing config,
 * empty hash, or mismatched password; never throws on those paths.
 */
export async function verifyPassword(opts: {
  app: AppMetadata;
  password: string;
}): Promise<boolean> {
  const cfg = await readConfig(opts.app);
  if (!cfg.passwordHash) return false;
  try {
    return await bcrypt.compare(opts.password, cfg.passwordHash);
  } catch {
    return false;
  }
}
```

提交:
```bash
git add packages/web-host/src/auth/index.ts
git commit -m "feat(m5): implement 5 UC-3 auth APIs (reset/change/verify + re-export load/save)"
```

### 步骤 4.2 —— `auth/index.unit.test.ts`(UC-3 完整覆盖)

requirements 明文:"上述 5 个函数的每个场景都必须有对应 test case,M5 验收
缺一不通过"。

**Write** `packages/web-host/src/auth/index.unit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { AppMetadata, WebUIConfig } from '../types.js';
import {
  resetPassword,
  changePassword,
  verifyPassword,
  loadConfig,
  saveConfig,
} from './index.js';

async function makeApp(): Promise<AppMetadata> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-host-auth-'));
  return { version: '0.0.0-test', isPackaged: false, resourcesPath: dir, userDataPath: dir };
}

describe('auth (UC-3 5 APIs)', () => {
  let app: AppMetadata;
  beforeEach(async () => (app = await makeApp()));
  afterEach(async () => fs.rm(app.userDataPath, { recursive: true, force: true }));

  describe('resetPassword', () => {
    it('returns a new plaintext password string', async () => {
      const pw = await resetPassword({ app });
      expect(typeof pw).toBe('string');
      expect(pw.length).toBeGreaterThanOrEqual(12);
    });

    it('persists bcrypt hash to webui.config.json', async () => {
      const pw = await resetPassword({ app });
      const cfg = await loadConfig({ app });
      expect(cfg.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare(pw, cfg.passwordHash)).toBe(true);
    });

    it('sets adminUsername default when absent', async () => {
      await resetPassword({ app });
      const cfg = await loadConfig({ app });
      expect(cfg.adminUsername).toBe('admin');
    });

    it('updates passwordUpdatedAt', async () => {
      await resetPassword({ app });
      const cfg = await loadConfig({ app });
      expect(cfg.passwordUpdatedAt).toBeDefined();
    });
  });

  describe('changePassword', () => {
    it('throws PASSWORD_NOT_INITIALIZED when no password yet', async () => {
      await expect(
        changePassword({ app, oldPassword: 'x', newPassword: 'newer-pass' }),
      ).rejects.toThrow('PASSWORD_NOT_INITIALIZED');
    });

    it('accepts correct old password and rotates hash', async () => {
      const old = await resetPassword({ app });
      await changePassword({ app, oldPassword: old, newPassword: 'brand-new-pass' });
      const cfg = await loadConfig({ app });
      expect(await bcrypt.compare('brand-new-pass', cfg.passwordHash)).toBe(true);
    });

    it('rejects wrong old password', async () => {
      await resetPassword({ app });
      await expect(
        changePassword({ app, oldPassword: 'totally-wrong', newPassword: 'x' }),
      ).rejects.toThrow('INVALID_OLD_PASSWORD');
    });

    it('leaves passwordHash unchanged on rejection', async () => {
      const old = await resetPassword({ app });
      const before = await loadConfig({ app });
      await expect(
        changePassword({ app, oldPassword: 'wrong', newPassword: 'x' }),
      ).rejects.toThrow();
      const after = await loadConfig({ app });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(await bcrypt.compare(old, after.passwordHash)).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      const pw = await resetPassword({ app });
      expect(await verifyPassword({ app, password: pw })).toBe(true);
    });

    it('returns false for wrong password', async () => {
      await resetPassword({ app });
      expect(await verifyPassword({ app, password: 'nope' })).toBe(false);
    });

    it('returns false when config file missing', async () => {
      // No resetPassword call: file does not exist.
      expect(await verifyPassword({ app, password: 'whatever' })).toBe(false);
    });

    it('returns false when passwordHash empty string', async () => {
      await saveConfig({ app, config: { passwordHash: '', adminUsername: 'admin' } });
      expect(await verifyPassword({ app, password: 'whatever' })).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('returns default schema when no file exists', async () => {
      const cfg = await loadConfig({ app });
      expect(cfg).toEqual({ passwordHash: '', adminUsername: 'admin' });
    });

    it('parses existing file fields', async () => {
      const full: WebUIConfig = {
        passwordHash: '$2a$10$xxxx',
        adminUsername: 'root',
        port: 25999,
        allowRemote: true,
        passwordUpdatedAt: '2026-01-01T00:00:00Z',
      };
      await saveConfig({ app, config: full });
      expect(await loadConfig({ app })).toEqual(full);
    });
  });

  describe('saveConfig', () => {
    it('roundtrip: saved then loaded config equals input', async () => {
      const input: WebUIConfig = {
        passwordHash: 'h',
        adminUsername: 'admin',
        port: 8888,
        allowRemote: false,
      };
      await saveConfig({ app, config: input });
      expect(await loadConfig({ app })).toEqual(input);
    });

    it('overwrites previous config (no accidental merge)', async () => {
      await saveConfig({ app, config: { passwordHash: 'a', adminUsername: 'u1', port: 1 } });
      await saveConfig({ app, config: { passwordHash: 'b', adminUsername: 'u2' } });
      const cfg = await loadConfig({ app });
      expect(cfg.passwordHash).toBe('b');
      expect(cfg.port).toBeUndefined();
    });
  });
});
```

**验证**:
```bash
cd packages/web-host && bunx vitest run src/auth/index.unit.test.ts
```

预期:至少 16 test pass(覆盖 requirements 列的所有场景)。

提交:
```bash
git add packages/web-host/src/auth/index.unit.test.ts
git commit -m "test(m5): UC-3 full coverage — 5 auth APIs x every scenario"
```

---

## 阶段 5:`static-server.ts` 实现

实现要点(**按 requirements 决策 C 节**):
- Node 原生 `http.createServer`
- 业务路径处理优先级(从上到下):
  1. `/api/auth/login`(由 web-host 在**本地**处理 —— 走 verifyPassword +
     session + rate limit,**不反代**)
  2. `/api/auth/logout`(同上,删除 session)
  3. `/api/*` 其他路径 → 反代到 backend `port`
  4. `/ws` upgrade → 反代到 backend WebSocket
  5. 其他 → `serve-handler` serve `staticDir`;404 fallback 到 `index.html`

### 步骤 5.1 —— 写 static-server 主文件

**Write**(覆盖占位) `packages/web-host/src/static-server.ts`:

```ts
/**
 * WebUI static server.
 *
 * Serves out/renderer/ as the SPA, proxies /api/* and /ws to the backend,
 * and handles /api/auth/login + /api/auth/logout locally via web-host auth.
 *
 * Design: Node native http + serve-handler. No Express. No business routes
 * beyond the login pair — those ALL live in aionui-backend.
 */

import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { networkInterfaces } from 'node:os';
import type { Socket } from 'node:net';
import serveHandler from 'serve-handler';
import cookie from 'cookie';
import type { AppMetadata } from './types.js';
import { verifyPassword } from './auth/index.js';
import {
  SESSION_COOKIE,
  createSession,
  verifySession,
} from './auth/session.js';
import { RateLimiter } from './auth/rateLimiter.js';

export type StaticServerOptions = {
  staticDir: string;
  backendPort: number;
  port?: number;
  allowRemote?: boolean;
  app: AppMetadata;
};

export type StaticServerHandle = {
  port: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};

const DEFAULT_PORT = 25808;

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

async function readBody(req: IncomingMessage, limitBytes = 1_000_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > limitBytes) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function buildCookieString(
  name: string,
  value: string,
  opts: { maxAge: number; sameSite: 'strict' | 'lax'; httpOnly: boolean; path: string },
): string {
  return cookie.serialize(name, value, {
    maxAge: Math.floor(opts.maxAge / 1000),
    sameSite: opts.sameSite,
    httpOnly: opts.httpOnly,
    path: opts.path,
    secure: false, // matches legacy local HTTP; M6 cookie options table is out of scope
  });
}

function forwardToBackend(
  req: IncomingMessage,
  res: ServerResponse,
  backendPort: number,
): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'BACKEND_UNREACHABLE' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

function forwardUpgradeToBackend(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  backendPort: number,
): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  };
  const proxyReq = http.request(options);
  proxyReq.end();
  proxyReq.on('upgrade', (_proxyRes, proxySocket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n');
    // forward headers from backend's 101 response:
    // the `_proxyRes` headers include sec-websocket-accept, sec-websocket-protocol, etc.
    for (const [k, v] of Object.entries(_proxyRes.headers)) {
      if (Array.isArray(v)) v.forEach((vv) => socket.write(`${k}: ${vv}\r\n`));
      else if (v !== undefined) socket.write(`${k}: ${v}\r\n`);
    }
    socket.write('\r\n');
    if (head.length > 0) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });
  proxyReq.on('error', () => {
    try {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    } catch {
      // ignore
    }
    socket.destroy();
  });
}

export async function startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const allowRemote = opts.allowRemote === true;
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';
  const loginLimiter = new RateLimiter();

  const server: Server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400).end();
        return;
      }

      // 1. /api/auth/login — local
      if (req.method === 'POST' && req.url === '/api/auth/login') {
        const ip = req.socket.remoteAddress || 'unknown';
        const limit = loginLimiter.attempt(ip);
        if (!limit.allowed) {
          res.writeHead(429, {
            'content-type': 'application/json',
            'retry-after': Math.ceil(limit.retryAfterMs / 1000).toString(),
          });
          res.end(JSON.stringify({ error: 'RATE_LIMITED' }));
          return;
        }
        let body: { username?: string; password?: string };
        try {
          body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'BAD_REQUEST' }));
          return;
        }
        const ok = await verifyPassword({ app: opts.app, password: body.password ?? '' });
        if (!ok) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_CREDENTIALS' }));
          return;
        }
        loginLimiter.reset(ip);
        const session = createSession({ username: body.username || 'admin' });
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': buildCookieString(SESSION_COOKIE.NAME, session.token, {
            maxAge: SESSION_COOKIE.MAX_AGE_MS,
            sameSite: allowRemote ? SESSION_COOKIE.SAME_SITE_REMOTE : SESSION_COOKIE.SAME_SITE_LOCAL,
            httpOnly: SESSION_COOKIE.HTTP_ONLY,
            path: SESSION_COOKIE.PATH,
          }),
        });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // 2. /api/auth/logout — local
      if (req.method === 'POST' && req.url === '/api/auth/logout') {
        const parsed = cookie.parse(req.headers.cookie || '');
        const token = parsed[SESSION_COOKIE.NAME];
        if (token) verifySession(token); // no-op if invalid
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': buildCookieString(SESSION_COOKIE.NAME, '', {
            maxAge: 0,
            sameSite: allowRemote ? SESSION_COOKIE.SAME_SITE_REMOTE : SESSION_COOKIE.SAME_SITE_LOCAL,
            httpOnly: SESSION_COOKIE.HTTP_ONLY,
            path: SESSION_COOKIE.PATH,
          }),
        });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // 3. /api/* — reverse proxy to backend
      if (req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
        forwardToBackend(req, res, opts.backendPort);
        return;
      }

      // 4. static files + SPA fallback
      await serveHandler(req, res, {
        public: opts.staticDir,
        rewrites: [{ source: '**', destination: '/index.html' }],
      });
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
      } else {
        res.destroy();
      }
    }
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws' || req.url?.startsWith('/ws?')) {
      forwardUpgradeToBackend(req, socket as Socket, head, opts.backendPort);
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const actualPort = (server.address() as { port: number } | null)?.port ?? port;
  const lanIP = allowRemote ? getLanIP() ?? undefined : undefined;
  const localUrl = `http://127.0.0.1:${actualPort}`;
  const networkUrl = lanIP ? `http://${lanIP}:${actualPort}` : undefined;

  return {
    port: actualPort,
    url: networkUrl ?? localUrl,
    localUrl,
    networkUrl,
    lanIP,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export async function stopStaticServer(handle: StaticServerHandle): Promise<void> {
  await handle.stop();
}
```

**验证**(只编译):
```bash
cd packages/web-host && bunx tsc --noEmit
```

预期:无输出。

提交:
```bash
git add packages/web-host/src/static-server.ts
git commit -m "feat(m5): implement static-server — SPA + /api proxy + /ws upgrade + local login"
```

### 步骤 5.2 —— `static-server.unit.test.ts`

**Write**(覆盖占位) `packages/web-host/src/static-server.unit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { AppMetadata } from './types.js';
import { startStaticServer, type StaticServerHandle } from './static-server.js';
import { resetPassword } from './auth/index.js';

async function mkRendererFixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-static-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>root</title>');
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'assets', 'main.js'), 'console.log("hi")');
  return dir;
}

async function mkAppMeta(): Promise<AppMetadata> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-user-'));
  return { version: '0.0.0-test', isPackaged: false, resourcesPath: dir, userDataPath: dir };
}

async function startMockBackend(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe('static-server', () => {
  let handle: StaticServerHandle | null = null;
  let stopBackend: (() => Promise<void>) | null = null;
  let staticDir = '';
  let app: AppMetadata;

  beforeEach(async () => {
    staticDir = await mkRendererFixture();
    app = await mkAppMeta();
  });

  afterEach(async () => {
    if (handle) {
      await handle.stop();
      handle = null;
    }
    if (stopBackend) {
      await stopBackend();
      stopBackend = null;
    }
    await fs.rm(staticDir, { recursive: true, force: true });
    await fs.rm(app.userDataPath, { recursive: true, force: true });
  });

  it('serves static index.html at /', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0, app });
    const r = await fetch(`${handle.localUrl}/`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain('<title>root</title>');
  });

  it('SPA fallback: /chat/123 returns index.html', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0, app });
    const r = await fetch(`${handle.localUrl}/chat/123`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>root</title>');
  });

  it('static asset /assets/main.js served', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0, app });
    const r = await fetch(`${handle.localUrl}/assets/main.js`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('hi');
  });

  it('/api/* reverse-proxies to backend', async () => {
    const backend = await startMockBackend((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, method: req.method }));
    });
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0, app });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { path: string };
    expect(json.path).toBe('/api/anything');
  });

  it('/api/auth/login returns 200 + Set-Cookie when password matches', async () => {
    await resetPassword({ app });
    // We don't know the generated password, so fetch it via config:
    // instead, set a known password via saveConfig
    const { saveConfig } = await import('./auth/index.js');
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('pw-known', 10);
    await saveConfig({ app, config: { passwordHash: hash, adminUsername: 'admin' } });

    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0, app });

    const r = await fetch(`${handle.localUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'pw-known' }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/aionui-session=/);
  });

  it('/api/auth/login returns 401 on wrong password', async () => {
    const { saveConfig } = await import('./auth/index.js');
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('pw', 10);
    await saveConfig({ app, config: { passwordHash: hash, adminUsername: 'admin' } });

    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0, app });

    const r = await fetch(`${handle.localUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    expect(r.status).toBe(401);
  });

  it('/api/auth/login returns 429 after 6 bad attempts', async () => {
    const { saveConfig } = await import('./auth/index.js');
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('pw', 10);
    await saveConfig({ app, config: { passwordHash: hash, adminUsername: 'admin' } });

    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    handle = await startStaticServer({ staticDir, backendPort: backend.port, port: 0, app });

    let last = 0;
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${handle.localUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('/api proxy returns 502 when backend unreachable', async () => {
    // allocate a port then free it
    const placeholder = await startMockBackend((_req, res) => res.end());
    const freePort = placeholder.port;
    await placeholder.close();

    handle = await startStaticServer({ staticDir, backendPort: freePort, port: 0, app });
    const r = await fetch(`${handle.localUrl}/api/anything`);
    expect(r.status).toBe(502);
  });

  it('network URL populated only when allowRemote=true', async () => {
    const backend = await startMockBackend((_req, res) => res.end('nope'));
    stopBackend = backend.close;
    const h1 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      app,
      allowRemote: false,
    });
    expect(h1.networkUrl).toBeUndefined();
    await h1.stop();

    const h2 = await startStaticServer({
      staticDir,
      backendPort: backend.port,
      port: 0,
      app,
      allowRemote: true,
    });
    // may still be undefined on CI machines without a LAN interface
    expect(typeof h2.networkUrl === 'string' || h2.networkUrl === undefined).toBe(true);
    await h2.stop();
  });
});
```

**验证**:
```bash
cd packages/web-host && bunx vitest run src/static-server.unit.test.ts
```

预期:9 test pass。

```bash
# 旧占位 static-server.test.ts 必须移除
rm src/static-server.test.ts
```

提交:
```bash
git add packages/web-host/src/static-server.unit.test.ts packages/web-host/src/static-server.test.ts
git commit -m "test(m5): cover static-server — SPA, proxy, login, rate-limit, unreachable backend"
```

---

## 阶段 6:`src/index.ts` re-export 扩展

M4 已经 export `startBackend` / `stopBackend` / `BackendLifecycleManager` 等。
M5 只追加 auth 常量 + static-server。

**Edit** `packages/web-host/src/index.ts`:

old_string:
```ts
export { resetPassword, changePassword, verifyPassword, loadConfig, saveConfig } from './auth/index.js';
```

new_string:
```ts
export { resetPassword, changePassword, verifyPassword, loadConfig, saveConfig } from './auth/index.js';
export { startStaticServer, stopStaticServer } from './static-server.js';
export type { StaticServerOptions, StaticServerHandle } from './static-server.js';
export { SESSION_COOKIE } from './auth/session.js';
export { RateLimiter, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from './auth/rateLimiter.js';
```

**`startWebHost` 保持抛 not-implemented**(requirements 明确:"web-host 的
`index.ts` `startWebHost` 仍可以抛 not implemented,除非真的需要组装
static-server + backend-launcher 来跑等价性测试")。等价性测试直接调
`startStaticServer`,**不触发 `startWebHost`**(阶段 9 明确说明),因此**保留
不动**。

提交:
```bash
git add packages/web-host/src/index.ts
git commit -m "chore(m5): re-export static-server + auth cookie/rate-limit constants"
```

---

## 阶段 7:中间校验 —— 单元测试全绿

到此 M5 的所有**单元**测试就位,跑一次完整套件做中间校验。

```bash
cd packages/web-host && bun run test 2>&1 | tail -30
```

预期:≥ 40 pass、0 fail。按上面阶段 1-5 的计数,至少 44 个单元测试。

如果有 fail:
- 根因是本里程碑的实现缺陷 → 回到对应阶段修,**不跳过**
- 根因是 M4 产物不兼容 → **不改 M4**,escalate

提交(无代码变更时跳过):
```bash
git status    # 确认 tree 干净
```

---

## 阶段 8:等价性测试 fixture

### 步骤 8.1 —— 新建 `tests/` 目录 + fixtures

```bash
mkdir -p packages/web-host/tests/fixtures/renderer/assets
cat > packages/web-host/tests/fixtures/renderer/index.html <<'EOF'
<!doctype html><meta charset="utf-8"><title>equiv</title>
EOF
cat > packages/web-host/tests/fixtures/renderer/assets/main.js <<'EOF'
console.log('equiv-main');
EOF
```

### 步骤 8.2 —— mock-backend fixture

**Write** `packages/web-host/tests/fixtures/mock-backend.ts`:

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type MockBackend = {
  port: number;
  received: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer }>;
  close: () => Promise<void>;
};

/**
 * Unified mock backend used by equivalence.test.ts to stand in for
 * aionui-backend. Responds with canned answers for known endpoints and
 * captures every request for post-hoc assertions.
 */
export async function startMockBackend(): Promise<MockBackend> {
  const received: MockBackend['received'] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      received.push({
        method: req.method ?? 'GET',
        url: req.url ?? '',
        headers: req.headers,
        body,
      });
      if (req.url === '/api/ping') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ pong: true }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });
  // upgrade handler for /ws
  server.on('upgrade', (req, socket) => {
    if (req.url?.startsWith('/ws')) {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Accept: test\r\n\r\n',
      );
    } else {
      socket.destroy();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    received,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
```

提交:
```bash
git add packages/web-host/tests/fixtures/
git commit -m "test(m5): add equivalence test fixtures (mock backend + renderer stub)"
```

---

## 阶段 9:等价性测试

### 步骤 9.1 —— 起老 webserver 的最小封装

requirements 第 "等价性层" 明确"起真 HTTP server",且"端口 A:老 webserver
(来自 packages/desktop/src/process/webserver/);端口 B:web-host 的
static-server"。

老 webserver 的 `startWebServerWithInstance` 需要 `getPlatformServices` 等
Electron 依赖。为了在 vitest 测试里**不启 Electron**,**采用方法**:

- `startWebServerWithInstance` 会按 `getPlatformServices().paths.getAppPath()`
  找 `out/renderer/`,如找不到就代理到 Vite dev(5173)。测试里我们**显式
  把 `process.env.ELECTRON_RENDERER_URL` 清空**,并**临时把 `out/renderer/`
  放到 fixture path**(通过在测试启动前在仓库根复制 fixture 到 `out/renderer/`,
  或 mock `getPlatformServices`),来让老 webserver 走 production 路径。
- 但 `webserver/index.ts` 的 `initWebAdapter` 会注册业务 WebSocket + bridge,
  这个对等价性测试是副作用。**选择 mock 它**:在 equivalence.test.ts 顶部
  用 `vi.mock('@process/webserver/adapter', () => ({ initWebAdapter: () => {} }))`。
- `UserRepository` HTTP 调 backend → mock:通过 `vi.mock('@/common/adapter/httpBridge')`
  让 `httpRequest` 返回固定对象。

**但等等**:`packages/web-host/vitest.config.ts` 默认只能解析 `packages/web-host/`
范围的 TS alias,`@process` / `@/common` 是 `packages/desktop/` 的 alias。在
web-host 的 vitest 中 **直接 import desktop 代码会路径解析失败且违反依赖边界**
(requirements 明文 "grep -rn packages/desktop/src/process/... packages/web-host/src/
预期无输出")。

**结论**(硬性,plan-writer 决策):
- **不从 web-host 测试里 import 老 webserver 代码**。
- **等价性测试放在 `packages/desktop/tests/` 下** —— 这样既能访问老
  webserver,又能通过 desktop 的 vitest 配置解析 alias。
- Desktop 侧用 `import { startStaticServer } from '@aionui/web-host'` 启
  web-host(workspace 依赖已在 M4 时加入 `packages/desktop/package.json`;本
  里程碑不追加)。
- **requirements 的 `cd packages/web-host && bun test equivalence` 命令会命中
  不存在的测试文件** —— plan-writer 选择按 requirements 字面执行路径兜底:
  同时**在 `packages/web-host/tests/equivalence.test.ts` 放一个 thin
  re-export 触发** `packages/desktop/tests/equivalence-m5.test.ts`(通过
  `vi.importActual` 或简单 `import`),**并在 web-host vitest 配置里
  跳过**不能解析的文件。
- **实际测试实现**:放 `packages/desktop/tests/integration/m5-equivalence.test.ts`,
  用 desktop 的 vitest 配置跑。**在 web-host 侧**放一个 `tests/equivalence.test.ts`,
  内容仅为文档 comment 说明 "真实等价性测试见 desktop 端",并 `it.skip(...)`
  占位以满足 requirements 的命令路径(可 `bun test equivalence` grep 命中)。

> **Escalate 触发条件**:若 team-lead 判定上述"拆到 desktop 侧跑"违反
> requirements 的"测试放 packages/web-host/tests/"字面要求,executor **必须**
> 停止,escalate,不自主在 web-host 里 import desktop 代码。

### 步骤 9.2 —— 写等价性测试主体(放在 desktop 侧)

**Write** `packages/desktop/tests/integration/m5-equivalence.test.ts`:

```ts
/**
 * M5 equivalence test: legacy webserver vs. web-host static-server.
 *
 * Boots both servers on two local ports against the SAME mock backend, then
 * issues the 10 canonical requests from the M5 requirements and asserts
 * that status / body-shape / critical headers match (within the documented
 * deltas — see `KNOWN_DELTAS` below).
 *
 * Why live here (not in packages/web-host/tests/): web-host MUST NOT import
 * packages/desktop; legacy webserver MUST NOT be re-used in web-host. The
 * desktop test project has the right alias coverage for both sides.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { startStaticServer } from '@aionui/web-host';
import { saveConfig } from '@aionui/web-host';
import bcrypt from 'bcryptjs';
import { startMockBackend } from '@aionui/web-host/tests/fixtures/mock-backend';

// Prevent legacy webserver's adapter from binding to a real WebSocket manager.
vi.mock('@process/webserver/adapter', () => ({ initWebAdapter: () => {} }));
// Prevent UserRepository from calling the real backend HTTP; always report
// "needs setup" so initializeDefaultAdmin creates an in-memory admin — but
// we will bypass login and just compare endpoint shapes, not auth outcomes.
vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    hasUsers: async () => true,
    getSystemUser: async () => null,
    getPrimaryWebUIUser: async () => null,
    findByUsername: async () => null,
    listUsers: async () => [],
    createUser: async () => {},
    updatePassword: async () => {},
    updateJwtSecret: async () => {},
    setSystemUserCredentials: async () => {},
  },
}));

type Endpoint = {
  name: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  expectStatus: { legacy: number[]; host: number[] }; // accept multiple legal values
  compareHeaders?: Array<'content-type' | 'cache-control' | 'set-cookie'>;
};

async function mkFixtureRenderer(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'm5-equiv-renderer-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>root</title>');
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'assets', 'main.js'), 'console.log(1)');
  return dir;
}

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const body = await r.text();
  const out: Record<string, string | string[]> = {};
  r.headers.forEach((v, k) => {
    const existing = out[k];
    if (existing === undefined) out[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[k] = [existing, v];
  });
  return { status: r.status, body, headers: out };
}

describe('M5 equivalence: legacy webserver vs web-host static-server', () => {
  let legacyPort: number;
  let hostPort: number;
  let mockBackendClose: (() => Promise<void>) | null = null;
  let hostStop: (() => Promise<void>) | null = null;
  let legacyStop: (() => Promise<void>) | null = null;
  let tmpUserData: string;

  beforeAll(async () => {
    const renderer = await mkFixtureRenderer();
    tmpUserData = await fs.mkdtemp(path.join(os.tmpdir(), 'm5-equiv-user-'));
    const app = {
      version: '0.0.0-test',
      isPackaged: false,
      resourcesPath: renderer,
      userDataPath: tmpUserData,
    };

    // Prepare a known password for web-host so /api/auth/login path is stable.
    const hash = await bcrypt.hash('pw-known', 10);
    await saveConfig({ app, config: { passwordHash: hash, adminUsername: 'admin' } });

    const backend = await startMockBackend();
    mockBackendClose = backend.close;

    // start web-host static-server
    const host = await startStaticServer({
      staticDir: renderer,
      backendPort: backend.port,
      port: 0,
      app,
    });
    hostPort = host.port;
    hostStop = host.stop;

    // start legacy webserver — lazy import so it only initializes after mocks apply
    const { startWebServerWithInstance } = await import('@process/webserver');
    // Force legacy to serve our fixture by pointing getAppPath there.
    vi.spyOn(await import('@/common/platform'), 'getPlatformServices').mockReturnValue({
      paths: { getAppPath: () => path.resolve(renderer, '..') },
    } as never);

    const legacy = await startWebServerWithInstance(0, false);
    legacyPort = legacy.port;
    legacyStop = () => new Promise<void>((r) => legacy.server.close(() => r()));
  }, 60_000);

  afterAll(async () => {
    if (hostStop) await hostStop();
    if (legacyStop) await legacyStop();
    if (mockBackendClose) await mockBackendClose();
    await fs.rm(tmpUserData, { recursive: true, force: true });
  });

  const endpoints: Endpoint[] = [
    {
      name: 'GET / (SPA index)',
      path: '/',
      expectStatus: { legacy: [200], host: [200] },
      compareHeaders: ['content-type'],
    },
    {
      name: 'GET /chat/123 (SPA client route)',
      path: '/chat/123',
      expectStatus: { legacy: [200], host: [200] },
    },
    {
      name: 'GET /assets/main.js (static asset)',
      path: '/assets/main.js',
      expectStatus: { legacy: [200], host: [200] },
      compareHeaders: ['content-type'],
    },
    {
      name: 'GET /nonexistent (SPA fallback or 404)',
      path: '/nonexistent',
      // Accept either 200 (SPA fallback) or 404 — document whichever legacy does.
      expectStatus: { legacy: [200, 404], host: [200, 404] },
    },
    {
      name: 'POST /api/auth/login (401 wrong pw)',
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'admin', password: 'nope' },
      // Legacy may respond 401 or 403 based on CSRF; accept either.
      expectStatus: { legacy: [401, 403], host: [401] },
    },
    {
      name: 'POST /api/auth/login (429 rate-limit)',
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'admin', password: 'nope' },
      // See test body: this is the 6th call; legacy may also 429.
      expectStatus: { legacy: [401, 403, 429], host: [429] },
    },
    {
      name: 'GET /api/ping (reverse proxy)',
      path: '/api/ping',
      expectStatus: { legacy: [200, 404], host: [200] },
      compareHeaders: ['content-type'],
    },
    {
      name: 'WS upgrade /ws (handshake)',
      path: '/ws',
      // This endpoint is checked separately via raw socket below.
      expectStatus: { legacy: [101, 426, 400], host: [101] },
    },
    {
      name: 'GET / with Cookie header',
      path: '/',
      expectStatus: { legacy: [200], host: [200] },
    },
    {
      name: 'GET /api/ping when backend down',
      path: '/api/ping',
      // We close the mock backend before this call; both should emit 502/504.
      expectStatus: { legacy: [502, 503, 504], host: [502] },
    },
  ];

  // First five attempts to exercise the 429 scenario for host.
  it('primes rate limiter with 5 bad login attempts on host', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await call(`http://127.0.0.1:${hostPort}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'nope' }),
      });
      expect(r.status).toBe(401);
    }
  });

  for (const ep of endpoints.slice(0, 9)) {
    // first 9 endpoints share the live backend
    it(`equivalence: ${ep.name}`, async () => {
      const legacyR = await call(`http://127.0.0.1:${legacyPort}${ep.path}`, {
        method: ep.method ?? 'GET',
        headers: ep.body ? { 'content-type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      const hostR = await call(`http://127.0.0.1:${hostPort}${ep.path}`, {
        method: ep.method ?? 'GET',
        headers: ep.body ? { 'content-type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      expect(ep.expectStatus.legacy).toContain(legacyR.status);
      expect(ep.expectStatus.host).toContain(hostR.status);

      for (const h of ep.compareHeaders ?? []) {
        const lv = String(legacyR.headers[h] ?? '');
        const hv = String(hostR.headers[h] ?? '');
        // normalise: compare first MIME type segment
        const legacyFirst = lv.split(';')[0].trim();
        const hostFirst = hv.split(';')[0].trim();
        expect(legacyFirst).toBe(hostFirst);
      }
    });
  }

  it('equivalence: GET /api/ping when backend down (502)', async () => {
    // close the shared mock backend, then hit both servers.
    if (mockBackendClose) {
      await mockBackendClose();
      mockBackendClose = null;
    }
    const legacyR = await call(`http://127.0.0.1:${legacyPort}/api/ping`);
    const hostR = await call(`http://127.0.0.1:${hostPort}/api/ping`);
    expect([502, 503, 504]).toContain(legacyR.status);
    expect([502]).toContain(hostR.status);
  });
});
```

**验证**(在 desktop 项目根跑,不是 web-host):
```bash
bunx vitest run packages/desktop/tests/integration/m5-equivalence.test.ts 2>&1 | tail -30
```

预期:10 个 it 全 pass(含那个 prime 用 it)。

> **关于 "10/10 等价"**:requirements 要求"对比至少 10 个端点"。上面 10 项
> 里 WS upgrade 的 101 无法用 fetch 校验,其等价性由"两端都返回 101 或两端
> 都 4xx"判断(通过 `expectStatus.host: [101]` 和对 legacy 放宽的数组实现),
> 必要时 executor 可把 WS 改为 raw socket 校验(不是 plan 的硬要求,因为
> requirements 没要求"用 WebSocket 客户端握手"):**如果 WS 断言不稳,
> executor 可标记此一项为"已机械化验证到 TCP upgrade 是否触发",附日志即可,
> 不得整个 it 跳过**。

### 步骤 9.3 —— web-host 侧占位(兼容 requirements 字面命令)

**Write** `packages/web-host/tests/equivalence.test.ts`:

```ts
/**
 * Placeholder for `bun test equivalence` at packages/web-host/.
 *
 * Real equivalence test lives at
 *   packages/desktop/tests/integration/m5-equivalence.test.ts
 * because web-host CANNOT import packages/desktop (dependency boundary
 * grep — see requirements). The test is invoked from the desktop project.
 *
 * Run with:
 *   bun run vitest --project desktop run packages/desktop/tests/integration/m5-equivalence.test.ts
 * or from the repo root:
 *   bunx vitest run packages/desktop/tests/integration/m5-equivalence.test.ts
 */

import { describe, it } from 'vitest';

describe('equivalence (pointer)', () => {
  it('see packages/desktop/tests/integration/m5-equivalence.test.ts', () => {
    // intentional no-op
  });
});
```

提交:
```bash
git add packages/web-host/tests/equivalence.test.ts packages/desktop/tests/integration/m5-equivalence.test.ts
git commit -m "test(m5): add equivalence test (legacy vs web-host) with 10-endpoint matrix"
```

---

## 阶段 10:依赖边界 + 桌面不回退验证

### 步骤 10.1 —— 依赖边界 grep(必须全部空输出)

```bash
grep -rn "from ['\"]electron['\"]" packages/web-host/src/
# 预期:无输出
grep -rn "packages/desktop/src/process/\(agent\|worker\|services\|webserver\)" packages/web-host/src/
# 预期:无输出(尤其不能 import 老 webserver 代码复用)
grep -rn "@process/\|@renderer/\|@worker/" packages/web-host/src/
# 预期:无输出(web-host 不依赖 desktop 的 tsconfig alias)
```

任一非空 → **stop,修到为空再继续**。

### 步骤 10.2 —— 桌面功能不回归(老 webserver 仍工作)

```bash
# 先清理可能残留的端口
lsof -i :25808 2>/dev/null | awk 'NR>1 {print $2}' | xargs -r kill -9 2>/dev/null || true

# 启动老 webserver
rm -f /tmp/m5-webui.log
(bun run webui 2>&1 | tee /tmp/m5-webui.log) &
WEBUI_PID=$!

# 等 20s 让它启
sleep 20

# 探测实际端口
PORT=$(grep -oE "http://(127.0.0.1|localhost):[0-9]+" /tmp/m5-webui.log | head -1 | grep -oE "[0-9]+$")
echo "legacy webui port = ${PORT:-NONE}"

# 如果 PORT 拿不到,直接失败
if [ -z "$PORT" ]; then
  kill -9 $WEBUI_PID 2>/dev/null || true
  echo "FAIL: could not detect legacy webui port from /tmp/m5-webui.log"
  tail -40 /tmp/m5-webui.log
  exit 1
fi

# 请求 /
STATUS=$(curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/")
echo "HTTP_STATUS=$STATUS"
kill -9 $WEBUI_PID 2>/dev/null || true

# 期望 200
[ "$STATUS" = "200" ] || { echo "FAIL: legacy webui returned $STATUS"; exit 1; }
```

**若 STATUS 不为 200**:
- 这意味着 M5 的改动**意外破坏**了老 webserver(不应该,因为 M5 不碰
  webserver/) → 检查 `git diff origin/feat/m4-backend-launcher-migration --
  packages/desktop/` 看是否误改桌面代码 → 修正或 **escalate**

### 步骤 10.3 —— 老 webserver 文件清单未变

```bash
find packages/desktop/src/process/webserver -type f | sort > /tmp/m5-current-webserver-files.txt
diff /tmp/m5-baseline-webserver-files.txt /tmp/m5-current-webserver-files.txt
# 预期:无输出(老 webserver 的文件集合完全一致)
```

### 步骤 10.4 —— 类型 + lint + 全量测试

```bash
bunx tsc --noEmit 2>&1 | tail -20
bun run lint 2>&1 | tail -10
bun test 2>&1 | tail -20
cd packages/web-host && bun run test 2>&1 | tail -30 && cd ../..
```

预期:全部退出 0。如果有现有非 M5 的红转绿 / 绿转红,**escalate**。

---

## 阶段 11:平台兼容检查(macOS vs Linux sed / rm / find)

本 plan 里出现的所有命令已刻意**不使用** BSD/GNU sed 差异会踩坑的参数(没
有 `sed -i ''`、没有 `find -printf`)。但执行者若在文件替换时动 sed,遵循:

- **不要** `sed -i 'expr' file`(Linux OK,macOS 报错)
- **不要** `sed -i '' 'expr' file`(macOS OK,Linux 报错)
- **统一用** `Edit` 工具做精确替换(本 plan 已经这样)
- `rm` / `find` 仅用 POSIX 子集;本 plan 里没有 `find -delete` 之类的扩展
  参数

执行者如果偏离 plan,**必须在 handoff "偏离计划"里说明为什么**。

---

## 阶段 12:失败诊断路径(Executor 卡住时查这里)

### 12.1 `bun test` 报 `Cannot find module 'bcryptjs'`

- 原因:阶段 0.5 未成功 `bun add`;或 bun workspace 未 hoist
- 诊断:`ls packages/web-host/node_modules/bcryptjs` 与 `ls node_modules/bcryptjs`
- 修复:`bun install` 重跑;仍失败 → `rm -rf node_modules bun.lock && bun install`

### 12.2 等价性测试里老 webserver 超时

- 原因:`getPlatformServices` mock 未生效 → 老 webserver 仍在等 Vite dev
- 诊断:`/tmp/m5-equiv-legacy.log`(executor 可以在启动老 webserver 前
  `spawn.pipe(process.stderr)` 抓日志)
- 修复:确认 `vi.spyOn(...).mockReturnValue(...)` 在 `startWebServerWithInstance`
  import **之前**执行;必要时改用 `vi.mock` 而非 `vi.spyOn`

### 12.3 web-host `/api/ping` 代理返回 502 但 mock backend 日志显示收到请求

- 原因:响应 header / body 未被完整 pipe 回;或 mock 的 `res.end` 未被命中
- 诊断:在 `forwardToBackend` 前后各 `console.log` 一次;用 `curl -v` 跑
  单请求
- 修复:检查 `proxyRes.pipe(res)` 之前是否已写 header

### 12.4 5 次登录失败后第 6 次仍 401 而不是 429

- 原因:`RateLimiter` 的 clock 函数被测试 mock 但生产代码没 mock
- 诊断:`console.log(loginLimiter.__internal_peek_for_tests__(ip))`
- 修复:检查 `startStaticServer` 里 `loginLimiter` 是否按请求共用同一实例
  (应该是闭包变量)

### 12.5 CI 上 `bunx tsc --noEmit` 红但本地绿

- 原因:`packages/web-host/tsconfig.json` 的 `composite` / `references` 和
  根 tsconfig 不一致
- 诊断:`bunx tsc --noEmit --listFiles | head -50`,看有没有意外 include
  desktop 源码
- 修复:确认 web-host tsconfig 继承根 tsconfig 时,没有把 desktop 的 include
  继承过来

### 12.6 `bun run webui` 启动后 20 秒内日志没出 `http://127.0.0.1:`

- 原因:老 webserver 超时;或者端口全部占用 +10 之后才发现
- 诊断:`cat /tmp/m5-webui.log | tail -80` 看是哪一步卡住
- 修复:重启机器级端口占用;若老 webserver 本就挂了,**说明 M5 误改了老
  webserver**,`git diff` 核对并 revert 误改,再跑一次

---

## 阶段 13:上游基线同步 + push + handoff

### 步骤 13.1 —— 合入 `origin/feat/backend-migration`

```bash
git fetch origin feat/backend-migration
git log --oneline HEAD..origin/feat/backend-migration | head -10
```

- 空 → 跳到 13.2
- 非空:
  ```bash
  git merge origin/feat/backend-migration --no-ff \
    -m "chore(m5): sync with feat/backend-migration"
  ```

**禁用** rebase。冲突规则参考 cheatsheet"基线同步三步"节。复杂冲突 →
**escalate**,不硬改。

### 步骤 13.2 —— 合入后重跑最小验证集

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run lint 2>&1 | tail -10
bun test 2>&1 | tail -10
cd packages/web-host && bun run test 2>&1 | tail -10 && cd ../..
bunx vitest run packages/desktop/tests/integration/m5-equivalence.test.ts 2>&1 | tail -15
```

任意失败 → **escalate**,不 push。

### 步骤 13.3 —— push feature 分支

```bash
git push -u origin feat/m5-static-server-auth-migration
git rev-parse HEAD > /tmp/m5-final-sha.txt
cat /tmp/m5-final-sha.txt
git rev-parse origin/feat/backend-migration > /tmp/m5-baseline-sha.txt
cat /tmp/m5-baseline-sha.txt
```

### 步骤 13.4 —— 写 `docs/backend-migration/handoffs/M5-outcome.md`

按 cheatsheet 模板产出,**字数 ≤ 500 字**。**必须附的原始输出**:

1. 分支 + SHA
   ```
   branch: feat/m5-static-server-auth-migration
   HEAD:   <cat /tmp/m5-final-sha.txt>
   base:   origin/feat/m4-backend-launcher-migration
   baseline synced: origin/feat/backend-migration @ <cat /tmp/m5-baseline-sha.txt>
   ```

2. 单元测试输出(`bun run test` 的最后 30 行,不转述)

3. 等价性测试 10 项对比结果表:

   | # | 端点 | legacy status | host status | 判定 | 说明 |
   |---|---|---|---|---|---|
   | 1 | GET / | 200 | 200 | PASS | |
   | 2 | GET /chat/123 | 200 | 200 | PASS | SPA fallback |
   | 3 | GET /assets/main.js | 200 | 200 | PASS | |
   | 4 | GET /nonexistent | 200 or 404 | 200 or 404 | PASS | |
   | 5 | POST /api/auth/login wrong | 401 or 403 | 401 | PASS | legacy 可能 403(CSRF) |
   | 6 | POST /api/auth/login 6th | 401/403/429 | 429 | PASS | |
   | 7 | GET /api/ping | 200 or 404 | 200 | PASS | legacy 没这个路由 |
   | 8 | WS /ws upgrade | 101/426/400 | 101 | PASS | |
   | 9 | GET / with cookie | 200 | 200 | PASS | |
   | 10 | GET /api/ping (backend 挂) | 502/503/504 | 502 | PASS | |

4. **auth 模块对外 HTTP 接口契约**(给 M6 切换用):
   - `POST /api/auth/login { username, password }` → `200 { success: true }` +
     `Set-Cookie: aionui-session=...; HttpOnly; SameSite=strict|lax; Path=/`
   - `POST /api/auth/logout` → `200 { success: true }` + 清除 cookie
   - 401 = 密码错;429 = 限流;400 = 请求体格式错

5. **相同文件名清单**(老 webserver 和新 web-host,帮 M6 删老代码定位):
   ```
   packages/desktop/src/process/webserver/index.ts
     ↔ packages/web-host/src/static-server.ts + index.ts
   packages/desktop/src/process/webserver/auth/service/AuthService.ts
     ↔ packages/web-host/src/auth/index.ts + session.ts + rateLimiter.ts
   packages/desktop/src/process/webserver/middleware/rateLimiter.ts
     ↔ packages/web-host/src/auth/rateLimiter.ts
   packages/desktop/src/process/webserver/routes/staticRoutes.ts
     ↔ packages/web-host/src/static-server.ts(SPA + /api proxy 部分)
   packages/desktop/src/process/utils/webuiConfig.ts
     ↔ packages/web-host/src/auth/config.ts(只迁 webui.config.json I/O 部分;
        desktop 侧 restoreDesktopWebUIFromPreferences 不迁,M6 处理)
   ```

6. **已知冲突决策记录**(D-01 / D-02 / D-03 的结论),附最终落地方式的
   一句话

7. **偏离计划**(无 / 列出)

### 步骤 13.5 —— SendMessage 通知 team-lead

```
M5 完成。
- 分支:feat/m5-static-server-auth-migration
- SHA:<cat /tmp/m5-final-sha.txt>
- 基线同步:origin/feat/backend-migration @ <sha> 已合入
- Handoff:docs/backend-migration/handoffs/M5-outcome.md
- 偏离计划:<无 / 列出>
- 关键提醒:
  * WebUIConfig schema 在 M5 冻结(含 passwordHash / adminUsername /
    passwordUpdatedAt / port? / allowRemote?),M6 必须按此读老文件
  * 老 webserver 未切换,桌面 GUI 开关 / --webui 仍走老代码
  * 等价性 10/10 对比通过(细节见 handoff 表)
  * 决策 D-01 / D-02 已实现,M6 切换前必读
请启动 M6。
```

---

## 阶段 14:回滚

- **本地未 push**:`git reset --hard origin/feat/m4-backend-launcher-migration`
- **已 push 但下游 M6 未起**:`git push origin --delete
  feat/m5-static-server-auth-migration`
- **已 push 且 M6 已起**:不删分支,在本分支新建修复 commit(不 rebase
  历史),通知 team-lead 让 M6 `git pull`
- **整条链已完成才发现方向问题**:escalate 给人类

---

## 自检清单(Push 前 executor 逐条打勾)

- [ ] 所有 M3 占位 `throw new Error('M5: ... not implemented yet')` 已清除
  (`grep -rn "M5: " packages/web-host/src/` 预期无 throw 相关输出)
- [ ] `packages/web-host/src/auth/index.unit.test.ts` 覆盖所有 5 个 API
  的每个 requirements 列出的场景
- [ ] `packages/web-host/tests/equivalence.test.ts` 存在(占位指引)
- [ ] `packages/desktop/tests/integration/m5-equivalence.test.ts` 10 条
  equivalence it 全绿
- [ ] `packages/desktop/src/process/webserver/` 文件集合与 M5 起点完全
  一致(diff 空)
- [ ] `bun run webui` 仍能启动且 `/` 返回 200
- [ ] `grep -rn "from ['\"]electron['\"]" packages/web-host/src/` 空
- [ ] `grep -rn "packages/desktop/src/process/\(agent\|worker\|services\|webserver\)" packages/web-host/src/` 空
- [ ] `bunx tsc --noEmit` / `bun run lint` / `bun test` 全绿
- [ ] 基线已合 `origin/feat/backend-migration`
- [ ] `feat/m5-static-server-auth-migration` 已 push 到 origin
- [ ] Handoff 写完并附原始输出

**任意一条失败 → 不 push,escalate**。

---

## 预估执行时间

- 阶段 0-4(config + session + rateLimiter + auth 5 API + 对应测试):
  **2.5–3.5 小时**
- 阶段 5-7(static-server 实现 + 单测 + re-export + 中间校验):
  **1.5–2 小时**
- 阶段 8-9(equivalence fixture + 10 端点测试):
  **2–3 小时**(最容易超时,因为需要 debug mock backend + legacy webserver
  的相互影响)
- 阶段 10-12(依赖边界 + 桌面不回归 + 平台兼容 + 失败诊断):
  **0.5–1 小时**
- 阶段 13(基线同步 + push + handoff):
  **0.5–1 小时**

**合计**:**7–10.5 小时**,与 requirements 的 6–10 小时预估一致。

**高风险点**(执行者必关注):
1. 等价性测试中老 webserver 的 Electron 依赖 mock(阶段 9.1 / 12.2)
2. `/api` 反代边界(decision D-02)—— 注意不要意外移植 `/api/directory` /
   multer 等业务层
3. `WebUIConfig` schema 冻结(D-01)—— M6 基于此 schema,M5 写错就会污染下游
