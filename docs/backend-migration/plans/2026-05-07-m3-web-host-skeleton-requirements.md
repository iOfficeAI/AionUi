# M3 @aionui/web-host 骨架 + 单元测试基础 - 需求文档

- **日期**:2026-05-07
- **里程碑**:M3
- **上游**:M2(`feat/m2-aionrs-cleanup` 已 merge)
- **对应设计文档节**:目标形态 + 仓库组织("packages/web-host/" 子包) +
  关键接口抽象(`AppMetadata` / `BackendBinaryResolver` / `startWebHost`) +
  里程碑清单 M3 行

## 做什么

在 `packages/` 下新建 `web-host/` workspace 子包,产出:

1. **包骨架**:`packages/web-host/package.json`、`tsconfig.json`、`README.md`
2. **类型定义**:`packages/web-host/src/types.ts`,定义 `AppMetadata`、
   `BackendBinaryResolver`、`WebHostOptions`、`WebHostHandle` 接口
3. **空的模块占位**(带完整类型签名,但不实现):
   - `packages/web-host/src/backend-launcher.ts`:`startBackend(opts)` / `stopBackend(handle)`
   - `packages/web-host/src/static-server.ts`:`startStaticServer(opts)` / `stopStaticServer(handle)`
   - `packages/web-host/src/auth/index.ts`:**所有 auth 对外公共 API**(见设计文档 UC-3):
     - `resetPassword(opts)`
     - `changePassword(opts)`
     - `verifyPassword(opts)`
     - `loadConfig(opts)` / `saveConfig(opts)`
   - `packages/web-host/src/auth/config.ts`:内部 config 文件 I/O
   - `packages/web-host/src/auth/session.ts`:session cookie 管理
4. **顶层入口**:`packages/web-host/src/index.ts` 导出
   `startWebHost()` + auth 全部公共 API + 所有类型
5. **单元测试骨架**(全 mock,不依赖真 backend):
   - `packages/web-host/src/backend-launcher.test.ts`:mock `spawn` +
     `fetch /health` 的最小测试
   - `packages/web-host/src/static-server.test.ts`:mock HTTP server
     代理测试
   - `packages/web-host/src/auth/config.test.ts`:纯 I/O,fs mock
6. **bun test 配置**:确保 `cd packages/web-host && bun test` 能跑

所有模块现在都只抛 `throw new Error('M{X}: not implemented yet')`,让后续
M4/M5 来填实现。

## 不做什么(边界)

- ❌ **不写实现**,只留类型签名 + 抛 not implemented
- ❌ **不 import `packages/desktop/`** 任何内容(依赖边界硬约束)
- ❌ **不 import `electron`**(零 Electron 依赖是核心原则)
- ❌ **不动** `packages/desktop/`(M3 不 touch 桌面)
- ❌ **不发布到 npm**(`private: true`,仅 workspace 内部)
- ❌ **不引入 express / hono**(静态服务用 Node 原生 http + serve-handler,
  这是设计文档 C 节已定)

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 包名 | `@aionui/web-host` | 设计文档已定 |
| `private: true` | 是 | 不发 npm |
| 静态服务实现 | Node 原生 `http` + `serve-handler` | 零业务依赖,设计文档 C 节 |
| backend 启动策略 | 构造时接收 `AppMetadata` 和 `BackendBinaryResolver` | 解 Electron 耦合 |
| `backend` 参数形态 | `{ kind: 'ownBackend'; resolveBackend }` \| `{ kind: 'useExistingBackend'; port }` | 设计文档接口 3 |
| 测试框架 | 沿用仓库的 vitest + bun test | 不引新框架 |
| 本里程碑实现代码量 | 只有类型和占位,约 200 行 | 不越界到 M4/M5 职责 |
| 依赖边界 CI 检查 | 本里程碑加一条 grep 脚本验证 | 设计文档验证方式第 5 条 |

## 验收标准

**文件存在性**:

```bash
# 包骨架文件
ls packages/web-host/package.json \
   packages/web-host/tsconfig.json \
   packages/web-host/src/index.ts \
   packages/web-host/src/types.ts \
   packages/web-host/src/backend-launcher.ts \
   packages/web-host/src/static-server.ts \
   packages/web-host/src/auth/index.ts \
   packages/web-host/src/auth/config.ts \
   packages/web-host/src/auth/session.ts
# 预期:全部文件存在
```

**类型完整性**(tsc 通过):

```bash
bunx tsc --noEmit --project packages/web-host/tsconfig.json
# 预期:退出 0,无错误
```

**测试跑通**(全 mock):

```bash
cd packages/web-host && bun test
# 预期:至少 3 个测试文件执行,全部 PASS
# 预期:测试过程中不 spawn 任何真实进程,不开真实端口
```

**依赖边界**:

```bash
# web-host 不 import desktop
grep -r "packages/desktop\|@aionui/desktop" packages/web-host/src/
# 预期:无输出

# web-host 不 import electron
grep -rE "from ['\"]electron['\"]|require\(['\"]electron" packages/web-host/src/
# 预期:无输出

# web-host 不 import 业务目录(agent / worker / services)
grep -rE "packages/desktop/src/process/(agent|worker|services)" packages/web-host/src/
# 预期:无输出
```

**workspace 集成**:

```bash
# 根 bun install 能识别新子包
rm -rf node_modules bun.lock
bun install
ls node_modules/@aionui/web-host
# 预期:存在(symlink 到 packages/web-host)
```

**功能不回归**(M1 的基础没被破坏):

```bash
bun run dev &   # 验证桌面启动
bun run webui &  # 验证 webui 启动
bun test         # 全仓测试通过(含新增的 web-host 测试)
```

## 关键风险

| 风险 | 缓解 |
|---|---|
| `serve-handler` 依赖引入影响全仓 bun install 速度/体积 | `packages/web-host/package.json` 只声明它为自己的 `dependencies`,不加到根 |
| 空占位 `throw new Error` 在 M4/M5 之前被误 import 使用 | 本里程碑**不让** `packages/desktop/` 或其他地方 import `@aionui/web-host`,只在 web-host 内部 test 里 import |
| `AppMetadata` / `BackendBinaryResolver` 类型签名后期需要演化 | 类型集中在 `types.ts`,M4/M5 可扩展字段(非破坏性),不允许删字段 |
| `packages/web-host/tsconfig.json` 和根 tsconfig 的 paths 冲突 | web-host 的 tsconfig 用 `extends: "../../tsconfig.json"` 继承,自己只定义 `include`;不重复写 paths |
| 依赖边界 grep 漏过(比如 import 路径用了别名) | CI 加的 grep 脚本要同时检查字符串 `packages/desktop`、`@aionui/desktop`、以及 electron-vite 的路径别名名称 |

## 依赖上游

- **M2 必须已合入**:因为 aionrs 遗留清理后,`scripts/build-with-builder.js`
  的 `prepareAionrs()` 调用位置已改变。M3 的 CI grep 脚本可能会被这个
  `scripts/build-with-builder.js` 的修改影响(虽然概率低,但要对齐基线)
- **读 M2 handoff**:`docs/backend-migration/handoffs/M2-outcome.md`

## 分支与 handoff

- 上游分支:`origin/feat/m2-aionrs-cleanup`
- 本里程碑分支:`feat/m3-web-host-skeleton`
- handoff 位置:`docs/backend-migration/handoffs/M3-outcome.md`
- handoff 必须附:**`@aionui/web-host` 的对外接口签名**
  (供 M4/M5/M6/M8 参考,避免接口漂移)
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`

## 接口契约(M3 handoff 锁定,后续不得破坏性改动)

M3 产出的接口签名,M4-M8 只能**扩展**不能**破坏**:

```ts
// packages/web-host/src/types.ts

export type AppMetadata = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string;
  userDataPath: string;
};

export type BackendBinaryResolver = () => string;

export type WebHostOptions = {
  app: AppMetadata;
  staticDir: string;
  port?: number;
  allowRemote?: boolean;
  dataDir?: string;
  logDir?: string;
  backend:
    | { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver }
    | { kind: 'useExistingBackend'; port: number };
};

export type WebHostHandle = {
  port: number;
  backendPort: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  initialPassword?: string;
  stop: () => Promise<void>;
};

export type WebUIConfig = {
  passwordHash: string;
  adminUsername: string;
  // 其他字段:和老 src/process/webserver/ 的 webui.config.json schema 完全一致
  // M5 迁移时由 plan-writer 确认完整 schema
};

// packages/web-host/src/index.ts
export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle>;

// packages/web-host/src/auth/index.ts(M3 必须全部定义签名,哪怕占位)
// 见设计文档 UC-3(Auth 公共接口契约)
export function resetPassword(opts: { app: AppMetadata }): Promise<string>;
export function changePassword(opts: {
  app: AppMetadata;
  oldPassword: string;
  newPassword: string;
}): Promise<void>;
export function verifyPassword(opts: {
  app: AppMetadata;
  password: string;
}): Promise<boolean>;
export function loadConfig(opts: { app: AppMetadata }): Promise<WebUIConfig>;
export function saveConfig(opts: { app: AppMetadata; config: WebUIConfig }): Promise<void>;
```

## 预计执行时间

2-3 小时(骨架代码量不大,主要时间在配置 workspace、tsconfig 继承和 mock 测试模板)
