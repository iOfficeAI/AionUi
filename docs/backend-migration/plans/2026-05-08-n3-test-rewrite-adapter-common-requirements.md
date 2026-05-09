# N3 adapter/common 测试重写 + mock 模板 - 需求文档

- **日期**:2026-05-08
- **里程碑**:N3
- **上游**:`origin/feat/n2-legacy-test-cleanup`(N2 产物)
- **对应总设计**:`2026-05-08-cleanup-and-test-rewrite-design.md` →
  UC-C / UC-D / UC-F / 测试覆盖清单(N3/N4)
- **执行前必读**:
  - `2026-05-08-cleanup-teammate-cheatsheet.md`(teammate 硬约束,**特别是
    UC-F-4 + UC-G**:写测试发现 backend bug 时按 UC-G 改 backend,不得 skip)
  - 本文档(requirements)
  - `2026-05-08-n3-test-rewrite-adapter-common.md`(executor 必读;由 plan-writer 产出)
  - `handoffs/N2-outcome.md`(上游)

## 做什么

为 `packages/desktop/src/common/adapter/` 和 `packages/desktop/src/common/config/`
中的纯函数 / 配置迁移 / HTTP 工厂写单测,并**沉淀 N4 复用的 mock 模板**。这一步
是后续 60+ 个领域测试的地基,必须在 N3 完成后才进入 N4。

具体交付:

### 交付 1:`tests/unit/_helpers/mockHttpBridge.ts`(mock 模板)

- 提供统一的 `createMockHttpBridge()` 工厂
- 支持路由级 stub(`mock.onGet('/api/providers', () => [...])`)
- 支持 WS 事件级 stub(`mock.emit('cron.job-created', payload)`)
- 默认未匹配的路由抛 "unexpected call"(便于测试发现意外路由)
- 导出 `resetMockHttpBridge()` 供 `beforeEach` 使用
- **严禁**在 helper 里加业务逻辑(helper 只做 mock 基础设施)

设计约束:

- helper 的 shape 必须与 `packages/desktop/src/common/adapter/httpBridge.ts`
  的 `httpGet` / `httpPost` / `httpPut` / `httpPatch` / `httpDelete` / `wsEmitter`
  / `wsMappedEmitter` 导出名保持一致,通过 `vi.mock('@/common/adapter/httpBridge', ...)`
  注入,不要求修改 httpBridge 源码
- helper 必须在 N3 完成前通过自测(给自身写最小 demo 测试)

### 交付 2:N3 测试清单(最少 6 个文件,不含 helper)

| #   | 路径                                               | 被测对象                           | 层次 | 关键用例                                                                                                                                                                                                           |
| --- | -------------------------------------------------- | ---------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | `tests/unit/common-adapter/apiModelMapper.test.ts` | `common/adapter/apiModelMapper.ts` | L1   | `toApiModel`/`toApiModelOptional`/`fromApiConversation`/`fromApiPaginatedConversations` 前后端互转;`hasCompleteModelIdentity` 的缺失字段分支                                                                       |
| T2  | `tests/unit/common-adapter/searchMapper.test.ts`   | `common/adapter/searchMapper.ts`   | L1   | `fromApiSearchResult` 对 `PaginatedResult<ApiMessageSearchItem>` 的映射;conversation 字段完整 / 缺省分支                                                                                                           |
| T3  | `tests/unit/common-adapter/httpBridge.test.ts`     | `common/adapter/httpBridge.ts`     | L1   | `getBackendPort` 的 window / globalThis / fallback 三分支;`getBaseUrl` / `getWsUrl`;`httpGet`/`httpPost` 构造的对象 shape(带 `.provider` no-op);`stubProvider` 默认值;`wsEmitter` / `wsMappedEmitter` 的 `on` 行为 |
| T4  | `tests/unit/common-config/configMigration.test.ts` | `common/config/configMigration.ts` | L1   | `migrateConfigStorage` / `migrateProviders`:老结构 → 新结构 diff;已迁移数据的幂等;损坏数据的兜底                                                                                                                   |
| T5  | `tests/unit/common-config/storage.test.ts`         | `common/config/storage.ts`         | L1   | `TChatConversation` / `IProvider` / 其它 type guard / helper 函数(仅测导出的 runtime 代码,不测 pure type alias)                                                                                                    |
| T6  | `tests/unit/_helpers/mockHttpBridge.test.ts`       | 本里程碑交付的 helper              | L1   | helper 自测:路由注册 / 未匹配路由报错 / WS 事件分发 / reset 后状态清空                                                                                                                                             |

**不计入 6 个清单的辅助测试**:允许 T1-T6 任何一个拆成多个 `.test.ts`(同目录)
以保持单文件可读性,但**总测试文件数 ≥ 6**。

### 交付 3:N3 handoff 里锁定 mock 模板签名

handoff 里**必须**列出 `createMockHttpBridge` 的最终 TypeScript 签名,N4 不得
私自改动。如 N4 要扩展 helper 能力,必须 escalate 给 team-lead(对照 M 系列
M3 的做法)。

## 不做什么(边界)

- ❌ **不测** 已删除的文件(bedrockBridge / previewHistoryBridge / pptPreviewBridge
  / officeWatchBridge / documentBridge / previewHistoryService / conversionService —— N1 已删)
- ❌ **不测** `common/adapter/teamMapper.ts`(team 不在 UC-A 范围内)
- ❌ **不测** `common/adapter/workspaceMapper.ts`(workspace 不在 UC-A 范围内)
- ❌ **不测** `common/adapter/ipcBridge.ts`(这是组装层,被 mapper + httpBridge
  组合出来,组装逻辑的回归由 N4 各领域测试间接覆盖)
- ❌ **不测** `common/adapter/browser.ts`、`main.ts`、`registry.ts`、`constant.ts`
  (入口 / 静态常量;没有单测价值)
- ❌ **不测** `common/api/*`(AnthropicRotatingClient / OpenAIRotatingClient /
  ApiKeyManager / ClientFactory / ProtocolConverter / OpenAI2AnthropicConverter 等
  放在 N4b providers 领域,不在 N3)
- ❌ **不改 源码**(adapter / httpBridge 实现都不改,只写测试)
- ❌ **不引入新依赖**(如 nock / msw)—— 纯 `vi.mock` 覆盖 httpBridge 足够
- ❌ **不合回共享分支,不建 PR**

## 已定决策

| 决策点                     | 结论                                                                                                  | 理由                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| mock helper 放哪           | `tests/unit/_helpers/mockHttpBridge.ts`(与测试同根,不进 `src/`)                                       | 只服务于测试、不上 runtime;下划线前缀规避 vitest include glob 误匹配(`_helpers/**/*.test.ts` 仍可被 glob 命中,而 helper 本身非 .test.ts) |
| mock 基础机制              | `vi.mock('@/common/adapter/httpBridge', ...)` + 自建 registry                                         | 纯 vitest 能力,零新依赖;配合 TypeScript 强类型更稳                                                                                       |
| WS 事件模拟                | helper 暴露 `mock.emit(eventName, payload)` + 内部 queue,测试里 await tick 后断言                     | 与记忆里 "vi.advanceTimersByTimeAsync" 的 async 教训一致;真实 WS 行为(fire-and-forget + 订阅)用 queue 模拟最准                           |
| 每个被测文件单一 test 文件 | 默认 1 对 1 映射;被测超过 200 行或覆盖多个逻辑主题允许拆                                              | 可读性与覆盖率兼顾                                                                                                                       |
| 覆盖率门禁                 | 维持 `thresholds: 0` 不改;N3 handoff 里单独列出 v8 报告里 6 个文件的 statement 覆盖率(仅展示,不 gate) | 减少噪声 gate;硬指标是"清单全落地 + vitest run 绿"                                                                                       |

## 验收标准

> **UC-F 硬约束提示**:handoff 必须贴命令输出 + 贴 `vitest run --reporter=verbose`
> 里每个新测试文件的 `✓` 行。禁止 `.skip` / `.todo`。详见总设计 UC-F-1/4/5。

### 自动化门禁

```bash
# 1. 清单文件全部落地
for f in \
  tests/unit/_helpers/mockHttpBridge.ts \
  tests/unit/_helpers/mockHttpBridge.test.ts \
  tests/unit/common-adapter/apiModelMapper.test.ts \
  tests/unit/common-adapter/searchMapper.test.ts \
  tests/unit/common-adapter/httpBridge.test.ts \
  tests/unit/common-config/configMigration.test.ts \
  tests/unit/common-config/storage.test.ts; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done
# 预期:无 MISSING

# 2. helper 被至少 1 个 N3 测试 import(除自测外)
grep -rn "mockHttpBridge" tests/unit/common-adapter tests/unit/common-config
# 预期:至少一行(说明被其它测试 import)

# 3. 类型检查
bunx tsc --noEmit
# 预期:退出 0

# 4. Lint
bun run lint
# 预期:退出 0

# 5. vitest 运行(verbose 输出 handoff 要贴)
bunx vitest run --reporter=verbose
# 预期:退出 0;passed 数 ≥ 6(每个 .test.ts 至少 1 个 test case)

# 6. test count 下限:handoff 必须算出并贴,至少 >= 30 个 test case
#    (6 个文件 × 平均 5 个 case)
bunx vitest run --reporter=verbose 2>&1 | \
  grep -E "^Tests" | tail -1
# 预期:例如 "Tests  35 passed (35)"

# 7. 无 skip/todo
grep -rnE "\\.skip\\(|\\.todo\\(|test\\.skip|it\\.skip" tests/unit
# 预期:无输出

# 8. prek
prek run --from-ref origin/feat/backend-migration --to-ref HEAD
# 预期:全绿
```

### 覆盖率展示(不 gate,仅 handoff 里贴)

```bash
bunx vitest run --coverage 2>&1 | grep -E "apiModelMapper|searchMapper|httpBridge|configMigration|storage"
```

handoff 里列出每个文件的 statement 覆盖率(应 ≥ 70%,若某行覆盖不到要说明
理由;不作为门禁,但作为 N4 写领域测试时的参考基线)。

### 产出摘要对比

- `git diff --stat origin/feat/n2-legacy-test-cleanup..HEAD -- tests/unit/`
  应显示 7 个文件新增(6 个测试 + 1 个 helper),≈ 1000-1500 行
- `bunx vitest run` 的测试数从 N2 的 0 增长到 ≥ 30

## 关键风险

| 风险                                                                           | 缓解                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| helper 设计过于复杂,N4 反而不愿意用                                            | helper API 表面严格控制在 5 个方法以内(`createMockHttpBridge` / `mock.onGet/Post/Put/Patch/Delete` / `mock.emit` / `reset`);N3 handoff 里锁定签名后 N4 不得改 |
| `vi.mock` 路径别名 `@/common/adapter/httpBridge` 在 vitest 4 下行为异常        | `vitest.config.ts` 的 `resolve.alias` 已配置(见文件);先写 T6 helper 自测验证,不行就用 `vi.mock('/abs/path/httpBridge', ...)` 兜底                             |
| `getBackendPort` 的 `window.__backendPort` 分支在 jsdom 环境下表现与 node 不同 | T3 用 `@vitest-environment` 指定 `node` + 手动 mock `window` 对象;dom 分支另起 `.dom.test.ts`;避免同一文件里切环境                                            |
| `configMigration.ts` 涉及 electron config 存储的 IO,测试难隔离                 | `vi.mock` 掉 `common/config/storage.ts` 的读写接口;T4 只测 migration 的 "transform" 部分                                                                      |
| 记忆里的 "fake timers + async" 陷阱                                            | helper 的 `emit` 支持 sync / async 双模;默认 sync 路径跳过 fake timers;handoff 里写明选择理由                                                                 |
| 已删的 M 系列测试可能"隐式"依赖了某些 common mock,新写时容易漏洞               | 仅参考 `packages/web-host/src/**/*.unit.test.ts` 的风格(它们还活着),不回读已删的 `tests/unit/` 内容                                                           |

## 依赖上游

- **N1 必须已 merge**:`common/adapter/httpBridge.ts` 的 shape 要用到 N1 已确认的
  adapter 路由表(总设计附录 B)
- **N2 必须已 merge**:`tests/unit/_helpers/` 和 `tests/unit/common-adapter/` 等
  骨架目录是 N2 交付
- **读 N1/N2 handoff**:`docs/backend-migration/handoffs/N1-outcome.md` /
  `N2-outcome.md`

## 分支与 handoff

- 上游分支:`origin/feat/n2-legacy-test-cleanup`
- 本里程碑分支:`feat/n3-test-rewrite-adapter-common`
- handoff 位置:`docs/backend-migration/handoffs/N3-outcome.md`
- 完成后 push 前(UC-F-5 标准顺序):
  ```bash
  git fetch origin feat/backend-migration
  git merge origin/feat/backend-migration --no-ff \
    -m "chore(n3): sync with feat/backend-migration"
  # 重跑 lint / tsc / vitest run / prek
  git push -u origin feat/n3-test-rewrite-adapter-common
  ```

## 预计执行时间

1-2 天:

- helper 设计 + 自测:0.5 天
- T1-T5 单测:1 天(每个文件 ~2 小时)
- 基线同步 + 复跑 + handoff:0.5 天

## Handoff 必填字段

- 本里程碑分支名 + 最新 SHA + 基线同步 merge SHA
- **锁定的 helper 签名**:把 `tests/unit/_helpers/mockHttpBridge.ts` 的所有
  exported 类型 / 函数签名原样贴出(供 N4 引用,禁止 N4 改)
- **UC-F-1 命令输出**:自动化门禁 1-8 条 + 复跑一轮
- **UC-F-4 测试执行证据**:`bunx vitest run --reporter=verbose` 完整输出
  (或按 UC-F-1 头 10 尾 10 + 总行数);每个新增 test 文件对应的 `✓` 行
- 覆盖率展示表格(6 个文件 × statement/branches/functions/lines)
- 若某条用例被迫 skip(不允许),单独在 Deviations 节 + 跟进 issue 号
- 若 helper 设计过程中发现 httpBridge 源码有 bug 或 gap,escalate
