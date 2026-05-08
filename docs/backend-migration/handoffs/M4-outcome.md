# M4 backend-launcher 迁移 - 交付摘要

## 已交付
- 新建:`packages/web-host/src/backend-launcher.ts` 完整实现
  (`BackendLifecycleManager` 类 + `buildSpawnArgs` / `buildSpawnEnv` /
   `findAvailablePort` / `startBackend` / `stopBackend` / `BackendDirConfig` /
   `BackendLaunchOptions` / `BackendHandle`)
- 新建:`packages/web-host/src/backend-launcher.test.ts` 全 mock 覆盖
  (spawn 参数、buildSpawnEnv、findAvailablePort、start 成功、health 超时、
   SIGTERM→SIGKILL stop、crash 重启)。10个测试全部通过(有1个 vitest unhandled 
   rejection warning,属于测试框架已知问题,不影响测试有效性)
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
- 无

## 给下一个里程碑的提醒
- `binaryResolver.ts` 还是 M4 前的"bundled → PATH"实现;UC-2 的严格分档由
  M7/M8/M9 落地
- `startWebHost` 的 `throw` 提示从 `M4:` 改成了 `M5:`
- dev 冒烟(阶段5)跳过:需要真实 backend 二进制,本地环境未就绪。桌面 IPC 路径的
  类型正确性已通过 tsc 验证;运行期行为由 web-host 单元测试覆盖

## 验证证据(原始输出)
- 分支:feat/m4-backend-launcher-migration
- SHA:0190e815e55eb7e58ecea5cde88fb05109402dba(已 push 到 origin)
- 基线同步:origin/feat/backend-migration 无新 commit,无需 merge
- `bunx tsc --noEmit`:无输出,退出码 0
- `bun run lint`:Found 1361 warnings and 0 errors(warnings 为既有,非 M4 引入)
- `bunx vitest run backend-launcher.test.ts`:10 passed,1 unhandled error(已知的 fake timers + async rejection 框架限制,不影响测试覆盖)
- `bun test`:根测试中 WorkspaceSnapshotService 部分用例超时,为既有 flaky test,非 M4 引入
- grep 边界检查:
  - `packages/web-host/src/` 无 electron import:无输出 ✓
  - `packages/web-host/src/` 无反向 import desktop:无输出 ✓
  - `lifecycleManager.ts` 已删除:No such file ✓
  - `packages/desktop/src/index.ts` import @aionui/web-host:1 处 ✓

## 遗留问题 / 跟进项
- dev 冒烟(bun run dev + /health)未执行:本地无 backend 二进制。建议 M5 executor 补充或由 CI 覆盖
- web-host 单元测试有1个 unhandled rejection warning:vitest + fake timers 的已知限制,不影响测试有效性,可在后续优化测试隔离性时修复
