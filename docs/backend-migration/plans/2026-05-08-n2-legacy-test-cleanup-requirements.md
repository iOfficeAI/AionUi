# N2 旧测试清理 + 新布局骨架 - 需求文档

- **日期**:2026-05-08
- **里程碑**:N2
- **上游**:`origin/feat/cleanup-and-test-rewrite`(N1 产物)
- **对应总设计**:`2026-05-08-cleanup-and-test-rewrite-design.md` →
  UC-C / UC-F / 里程碑清单 N2 行
- **执行前必读**:
  - `2026-05-08-cleanup-teammate-cheatsheet.md`(teammate 硬约束,含 UC-F 5 条)
  - 本文档(requirements)
  - `handoffs/N1-outcome.md`(上游实际交付)

## 做什么

把仓内所有已过时 / 深度失败的老单测一次性清掉,并建立按功能模块镜像
`tests/e2e/features/` 的新布局骨架,为 N3/N4 的测试重写提供承接点。

具体动作:

1. **删除以下老测试目录的全部文件**(保留 `.gitkeep` 或不保留均可,但目录
   本身必须在 N2 结束时不存在):
   - `tests/unit/`(整目录删除,含 209 个顶层文件 + 8 个子目录 bridge/chat/
     common/platform/process/renderer/webserver 下的全部测试)
   - `tests/integration/`(共 ~10 个文件,包括 acp-smoke / pet-renderer-build
     / webui-pwa-build / i18n-packaged / webui-favicon-build / workspace-snapshot-service
     / autoUpdate.integration / i18n / i18n-performance / process/acp/session/…)
   - `tests/regression/`(含 `layout_theme_route_revert.test.ts`)
2. **删除仓内零散测试文件**:
   - `packages/desktop/src/process/bridge/__tests__/webuiQR.test.ts`(以及
     该 `__tests__/` 目录本身)
3. **保留不动**:
   - `tests/e2e/**`(e2e 体系)
   - `tests/fixtures/**`(fake-acp-cli / fake-extension 等测试资产)
   - `tests/vitest.setup.ts`
   - `tests/vitest.dom.setup.ts`
   - `packages/web-host/**/*.unit.test.ts`(web-host 自有测试体系)
4. **创建新布局骨架**,目录镜像 `tests/e2e/features/`:
   ```
   tests/unit/
     _helpers/          # N3 会在此放 mockHttpBridge.ts,N2 先建空目录
     common-adapter/    # N3 目标
     common-config/     # N3 目标
     assistants/        # N4a 目标(对应 e2e features/assistants/)
     skills/            # N4a 目标(对应 e2e features/settings/skills/)
     extension/         # N4a 目标(对应 e2e features/settings/extension/)
     providers/         # N4b 目标(对应 e2e features/settings/llm_providers/)
     system/            # N4b 目标(对应 e2e features/settings/system/)
     cron/              # N4b 目标
     previews/          # N4c 目标(对应 e2e features/previews/)
     assets/            # N4c 目标
     bootstrap/         # N4c 目标
   ```
   每个目录下放一个 `.gitkeep`,让 git 保留空目录。
5. **不改 `vitest.config.ts`**:现有 include(`tests/unit/**/*.test.ts` +
   `tests/unit/**/*.dom.test.ts`)对新布局的子目录递归天然适配

## 不做什么(边界)

- ❌ **不动** `vitest.config.ts`、`vitest.dom.setup.ts`、`vitest.setup.ts`
- ❌ **不动** `tests/e2e/**`、`tests/fixtures/**`、`packages/web-host/**`
- ❌ **不写新的测试代码**(N3/N4 职责)
- ❌ **不在同一个 commit 里动源码**(本里程碑只删测试 + 建骨架)
- ❌ **不删 `tests/` 之外的任何东西**(即使 N1 阶段漏掉的源文件,也另立 issue 补)
- ❌ **不顺手"修"某个老测试然后保留它**(全删重写的策略在总设计里锁定,
  UC-C;单个测试"看起来还有用"不是保留理由)
- ❌ **不建 `tests/unit/webui/` 目录**(webuiQR 是 Electron-only 能力,且不在
  UC-A 范围内;如未来需要,另立里程碑)
- ❌ **不合回共享分支,不建 PR**

## 已定决策

| 决策点                         | 结论                                                                                                 | 理由                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 删除方式                       | `git rm -rf tests/unit tests/integration tests/regression` + 手动删其它零散测试,**一次性结**(不分批) | 分批没有技术收益,review 时 diff 巨大但语义单一                                                                                      |
| 是否保留 `tests/bench/`        | **无需处理**(grep 未发现该目录存在)                                                                  | `vitest.config.ts` 中 benchmark.include 指向 `tests/bench/**`,目录不存在时 vitest bench 不跑,不影响 `vitest run`;如有该目录一并删除 |
| 是否在 `.gitkeep` 里写占位文本 | **否**,空文件即可                                                                                    | M 系列惯例                                                                                                                          |
| commit 粒度                    | **1 个 commit** 同时完成"删老测试 + 建骨架目录"                                                      | 两步语义紧耦合,拆开后中间态的 `bunx vitest run` 也是 0 tests,拆 commit 没有额外信息                                                 |
| N2 后 `bunx vitest run` 的预期 | **0 tests passed / 0 tests failed / exit code 0**(vitest 4 对空 include 默认为成功)                  | N2 完成 = "测试基础设施干净",不是"测试覆盖有意义";覆盖由 N3/N4 建立                                                                 |

## 验收标准

> **UC-F 硬约束提示**:handoff 必须贴每条命令的原始输出,禁止"按经验通过"
> 的转述。详见总设计 UC-F-1/5。

### 自动化门禁

```bash
# 1. 老测试目录已删
test ! -d tests/unit
test ! -d tests/integration
test ! -d tests/regression
test ! -d packages/desktop/src/process/bridge/__tests__
# 预期:全部 exit 0

# 2. 保留目录还在
test -d tests/e2e
test -d tests/fixtures
test -f tests/vitest.setup.ts
test -f tests/vitest.dom.setup.ts
# 预期:全部 exit 0

# 3. 新布局骨架存在
for d in _helpers common-adapter common-config assistants skills extension \
         providers system cron previews assets bootstrap; do
  test -d "tests/unit/$d" || { echo "MISSING: tests/unit/$d"; exit 1; }
done
# 预期:无 MISSING 输出

# 4. git 能追踪到空目录(有 .gitkeep)
find tests/unit -name '.gitkeep' | wc -l
# 预期:12(与上面循环一致)

# 5. 没有残留的僵尸 import 指向已删测试
grep -rn "tests/unit/\|tests/integration/\|tests/regression/" \
  packages/ scripts/ .github/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' 2>&1 | grep -v "^docs/"
# 预期:仅 `vitest.config.ts` 的 include/exclude glob,其它无输出

# 6. 类型检查
bunx tsc --noEmit
# 预期:退出 0

# 7. Lint
bun run lint
# 预期:退出 0

# 8. vitest 空运行
bunx vitest run
# 预期:退出 0;输出里应含 "No test files found" 或 "0 passed"

# 9. prek
prek run --from-ref origin/feat/backend-migration --to-ref HEAD
# 预期:全绿
```

### 产出摘要对比

- `git diff --stat origin/feat/cleanup-and-test-rewrite..HEAD -- tests/`
  应显示 ≈ 220+ 文件被删、12 个 `.gitkeep` 新增
- 总 LoC 减少:约 4-6 万行(老 unit 文件各 100-500 行 × 209 文件)
- `find tests -type f | wc -l` 从 ~873 降到 ≈ 600(保留 e2e + fixtures + 2 个
  setup + 12 个 .gitkeep)

## 关键风险

| 风险                                                                                  | 缓解                                                                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 有测试被其它脚本 `require`(如 `package.json` scripts 里的 `bun test src/process/...`) | 先 grep `package.json` / `.github/workflows/` / `scripts/` 确认无硬路径引用(已在自动化门禁 5 覆盖);有引用 escalate 给 team-lead   |
| `vitest.config.ts` 的 `benchmark.include` 指向不存在的 `tests/bench/**`               | 该字段对 `vitest run` 无影响,仅 `vitest bench` 会读;本里程碑不动它;N5 最终校验仍通过                                              |
| `tests/fixtures/fake-extension.zip` 之类资产被老测试依赖,删测试后 fixtures 变成孤儿   | fixtures 不在本次范围;即使变孤儿也不影响 CI(它们是静态文件不会被自动引用);follow-up 里处理                                        |
| 其它并行 agent 在 `tests/unit/` 加了新测试                                            | push 前 `git fetch origin feat/backend-migration` + 比较 `git diff origin/feat/backend-migration -- tests/`,若有意外新增 escalate |
| `.gitkeep` 被 `.gitignore` 忽略                                                       | 仓内 `.gitignore` 全仓搜 `.gitkeep` 确认无忽略规则(M 系列已用过 `.gitkeep`,应该安全)                                              |
| 删除后同步基线引入冲突                                                                | 基线同步环节若有 `tests/unit/` 下的新 commit,按 UC-F-5 处理:隐性冲突修之 + 写 Deviations;破坏性变更 escalate                      |

## 依赖上游

- **N1 必须已 push**:本里程碑从 `origin/feat/cleanup-and-test-rewrite` 拉分支
- **读 N1 handoff**:`docs/backend-migration/handoffs/N1-outcome.md` 确认 N1
  实际交付

## 分支与 handoff

- 上游分支:`origin/feat/cleanup-and-test-rewrite`(N1 的分支名)
- 本里程碑分支:`feat/n2-legacy-test-cleanup`
- handoff 位置:`docs/backend-migration/handoffs/N2-outcome.md`
- 完成后 push 前(UC-F-5):
  ```bash
  git fetch origin feat/backend-migration
  git merge origin/feat/backend-migration --no-ff \
    -m "chore(n2): sync with feat/backend-migration"
  # 重跑 lint / tsc / vitest run / prek
  git push -u origin feat/n2-legacy-test-cleanup
  ```

## 预计执行时间

1-2 小时:

- 批量 `git rm -rf` + 创建骨架:30 分钟
- 自动化门禁 9 条:30 分钟
- 基线同步 + 复跑 + handoff:30 分钟

## Handoff 必填字段

- 本里程碑分支名 + 最新 SHA + 基线同步 merge commit SHA
- 实际删除的文件 / 目录清单 + `git diff --stat` 统计(对比 N1)
- **UC-F-1 命令输出**:自动化门禁 9 条命令各自的头 10 尾 10 + 总行数 + 退出码
  (`bunx vitest run` 特别贴全,因为是 0 tests 的情况要确认)
- 新布局骨架截图或 `tree tests/unit` 的输出
- 若删除过程中发现老测试实际引用了 UC-A 之外领域的东西(间接佐证老测试覆盖面
  和新覆盖清单的 gap),在 handoff "观察"节记一笔,供 N4 写 requirements 时参考
- 若有偏离(例如某个目录漏建 / 骨架命名和本需求不一致),单列 Deviations 节
- 若发现 `tests/bench/` 确实存在,说明是否已一并清掉 + 理由
