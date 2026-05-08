# M4 backend-launcher 迁入 web-host + 桌面 IPC 接入 - 需求文档

- **日期**:2026-05-07
- **里程碑**:M4
- **上游**:M3(`feat/m3-web-host-skeleton` 已 merge)
- **对应设计文档节**:改造要点 A(lifecycleManager 脱 Electron) +
  接口抽象 1-2(`AppMetadata` / `BackendBinaryResolver`) +
  里程碑清单 M4 行

## 做什么

把当前 `packages/desktop/src/process/backend/lifecycleManager.ts` 的
完整逻辑迁到 `packages/web-host/src/backend-launcher.ts`,解除 Electron
依赖,并让桌面 IPC 模式改为 import web-host 版本。

具体动作:

1. **实现** `packages/web-host/src/backend-launcher.ts`:
   - 内部实现从 `lifecycleManager.ts` 拷贝迁移
   - 把 `import { app } from 'electron'` 改为构造时注入 `AppMetadata`
   - `app.isPackaged` → `meta.isPackaged`
   - `app.getVersion()` → `meta.version`
   - 保留所有现有行为:`buildSpawnArgs`、`buildSpawnEnv`、
     `findAvailablePort`、`BackendLifecycleManager` 类、crash 重启逻辑
2. **保留** `packages/desktop/src/process/backend/binaryResolver.ts`
   不动(留在 desktop 壳作为注入给 web-host 的 resolver 实现)
3. **改造** `packages/desktop/src/process/backend/index.ts`(或等价的调用
   入口):
   - 从 import 本地 `lifecycleManager` 改为 import `@aionui/web-host`
   - 构造时注入 `AppMetadata`(用 electron 的 `app.*` 填充)和
     `BackendBinaryResolver`(本地 `binaryResolver.ts`)
4. **删除** `packages/desktop/src/process/backend/lifecycleManager.ts`
   (空目录保留或一并清理,看 M1 后实际结构)
5. **补充 mock 单元测试**:`packages/web-host/src/backend-launcher.test.ts`
   覆盖 spawn / health check / crash 重启逻辑(全 mock,不启真 backend)

## 不做什么(边界)

- ❌ **不改** `binaryResolver.ts` 的查找顺序;按设计文档 UC-2 分档实现
  (生产模式严格查 bundled;开发模式才允许 env / PATH / 兄弟目录 fallback)。
  **禁止简化为扁平的 `bundled → env → PATH`**,生产模式不允许 PATH fallback
- ❌ **不动** `packages/desktop/` 以外的桌面代码(`renderer/` / `preload/`
  一律不碰)
- ❌ **不引入** Electron IPC 模式和 `--webui` 模式的"复用 backend"逻辑
  (那是 M6 的事;M4 只确保桌面 IPC 启动 backend 的路径通畅)
- ❌ **不实现** `startWebHost` 的完整 flow(M4 只管 backend-launcher,不管
  static-server + auth 的组装)
- ❌ **不做** `useExistingBackend` 的分支逻辑(M6 再做)

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| lifecycleManager 迁移策略 | **完整搬迁**,不边改边迁 | 保留原有行为不变是 M4 验收前提 |
| `AppMetadata` 注入方式 | **构造时注入**,不用全局单例 | 方便测试,解耦 |
| `BackendBinaryResolver` 接口 | `() => string`,同步返回绝对路径或抛错 | 设计文档已定 |
| backend 健康检查 | 沿用 `GET /health` 30 秒超时 | 保持与 M1 前行为一致 |
| crash 重启策略 | 沿用 3 次/60 秒窗口 | 保持与 M1 前行为一致 |
| 测试是否要起真 backend | **不起**,全 mock | 符合设计文档"测试层 1" |
| 桌面 IPC 模式是否仍由 Electron 启动 backend | **是** | M4 只改实现位置,不改启动时机 |

## 验收标准

**单元测试**:

```bash
cd packages/web-host && bun test backend-launcher.test.ts
# 预期:至少覆盖
# - spawn 参数构造正确(port / data-dir / log-level / app-version)
# - health 检查通过
# - health 检查超时抛错
# - crash 后按策略重启
# - stop 后进程被 SIGTERM / SIGKILL
# - 所有测试不 spawn 真实进程,用 vi.mock('node:child_process')
```

**桌面功能不回归**:

```bash
bun run dev &
DEV_PID=$!
sleep 25

# backend 端口应已 listening
# 读桌面日志找 backend 端口号
grep -oE "\[aionui-backend\] listening on port [0-9]+" /tmp/m4-dev.log | head -1
# 预期:输出 "listening on port XXXXX"

# 通过 backend 健康检查
PORT=$(grep -oE "listening on port [0-9]+" /tmp/m4-dev.log | head -1 | grep -oE "[0-9]+$")
curl -fsS http://127.0.0.1:$PORT/health
# 预期:200 OK

# 触发 backend 崩溃(杀 backend 子进程,不杀 Electron 主进程),
# 桌面应在 3 秒内自动重启 backend
# (高级 e2e,M4 plan 可选择性覆盖或放 M6)

kill $DEV_PID
```

**旧文件已删除**:

```bash
ls packages/desktop/src/process/backend/lifecycleManager.ts 2>&1
# 预期:No such file or directory
```

**import 已切换**:

```bash
grep -rn "import.*lifecycleManager" packages/desktop/src/
# 预期:无输出

grep -rn "from ['\"]@aionui/web-host" packages/desktop/src/
# 预期:至少 1 处(新的 import 点)
```

## 关键风险

| 风险 | 缓解 |
|---|---|
| `lifecycleManager.ts` 里有对其他 desktop 文件的 import(比如 `binaryResolver`、日志、config) | plan-writer 迁移前先 `grep -n "^import" packages/desktop/src/process/backend/lifecycleManager.ts`,所有依赖要么迁入 web-host(如果通用),要么改为构造注入(如果是 desktop 特有) |
| 桌面 IPC 模式启动 backend 失败(因为 `AppMetadata` 注入错) | plan-writer 在桌面入口(可能是 `src/index.ts` 或 `process/backend/index.ts`)集中注入一次 `AppMetadata`,不要在多处重复 |
| backend 启动路径变更导致 e2e 挂 | 跑一次现有 e2e 套件(`bun run test:e2e`),对比 M3 前的通过率;如果有测试 mock 了 `BackendLifecycleManager`,同步更新 mock |
| 循环依赖(`@aionui/web-host` 的 `AppMetadata` 被桌面 import,同时 backend-launcher 被 desktop 间接 import) | 依赖方向明确:desktop → web-host,单向;web-host 不反向 import |
| 如果 M3 的接口签名和实际实现需要不符(如 `resolveBackend` 同步/异步) | **不自主改接口**,escalate 给 team-lead 修改 M3 接口契约 |

## 依赖上游

- **M3 已合入**:`@aionui/web-host` 骨架存在,`types.ts` 里 `AppMetadata`
  和 `BackendBinaryResolver` 已声明
- **读 M3 handoff**:确认接口签名是否有微调;确认 `backend-launcher.ts`
  占位是否如预期
- **不依赖 M2**(aionrs 清理和 backend launcher 无关),但按基线同步规范
  仍需 merge `origin/feat/backend-migration`

## 分支与 handoff

- 上游分支:`origin/feat/m3-web-host-skeleton`
- 本里程碑分支:`feat/m4-backend-launcher-migration`
- handoff 位置:`docs/backend-migration/handoffs/M4-outcome.md`
- handoff 必须附:
  - `BackendLifecycleManager` 构造函数的完整签名(给 M5/M6 用)
  - 桌面 IPC 模式下 `AppMetadata` 的注入点文件路径
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`

## 预计执行时间

4-6 小时(代码迁移工作量中等,主要时间在:写 mock 测试、验证桌面启动不回归)
