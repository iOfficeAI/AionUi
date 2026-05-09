# N5 恢复 CI 单测 + 最终校验 - 交付摘要

- **分支**: `feat/n5-restore-ci`
- **最新 SHA**: `e6c7351a6`(基线同步后)
- **基线**: `origin/feat/backend-migration @ 1dbfa98d2` 已合入

## 已交付

### 代码改动

1. **恢复 3 个 workflow 的 `bunx vitest run` 步骤**(commit 5ea238139):
   - `.github/workflows/_build-reusable.yml:67-69`
   - `.github/workflows/build-and-release.yml:52-55`
   - `.github/workflows/pack-web-cli.yml:67-69`
   - 删除临时注释块"Unit tests temporarily disabled"
   - 恢复为标准两行:`- name: Run unit tests` + `run: bunx vitest run`

2. **更新 `docs/backend-migration/handoffs/ci-web-cli-release-outcome.md`**(commit 803712029):
   - "未解决的 TODO"节中单元测试禁用段落标记为 `✅ DONE (N5 恢复于 2026-05-09)`
   - 引用本 handoff 路径

3. **格式修复**(commit 6dcd8416b):
   - `docs/backend-migration/handoffs/N4-outcome.md` end-of-file 修复(prek 自动检测)

4. **基线同步**(commit e6c7351a6):
   - 合并 `origin/feat/backend-migration @ 1dbfa98d2`
   - 新增 1 个文件变更:`packages/desktop/src/renderer/pages/conversation/platforms/aionrs/useAionrsMessage.ts`(6 行新增,1 行删除)

### 验证结果

所有 4 个本地门禁在基线同步后**完整复跑并通过**:

| 命令                                                              | 退出码 | 输出摘要                              |
| ----------------------------------------------------------------- | ------ | ------------------------------------- |
| `bun run lint`                                                    | 0      | 846 warnings / 0 errors(9818 行输出)  |
| `bunx tsc --noEmit`                                               | 0      | 无输出                                |
| `bunx vitest run`                                                 | 0      | 64 files / 720 tests passed(9 行输出) |
| `prek run --from-ref origin/feat/backend-migration --to-ref HEAD` | 0      | 所有 hook passed(12 行输出)           |

## 与计划的偏离

无。3 个 workflow 的 diff 完全符合 UC-E 要求,无额外改动。

## 给整链合入的提醒

- **本里程碑未触发 CI run**,统一由 team-lead 在整链合入 dev 时验证(按 UC-F-2 规定)
- 整链 SHA 列表(供 team-lead 合入 dev 使用):
  - N1: `1b8e7da05` (`feat/cleanup-and-test-rewrite`)
  - N2: `ae1d150f3` (`feat/n2-legacy-test-cleanup`)
  - N3: `df071f82a` (`feat/n3-test-rewrite-adapter-common`)
  - N4: `77d8ee00a` (`feat/n4-test-rewrite-domains`)
  - N5: `e6c7351a6` (`feat/n5-restore-ci`)

## UC-F 证据对照

| 约束                | 状态 | 证据位置                                   |
| ------------------- | ---- | ------------------------------------------ |
| UC-F-1 命令原始输出 | ✓    | 本 handoff "验证结果"表格 + 下方完整输出   |
| UC-F-2 不触发 CI    | ✓    | 本 handoff 明确声明"本里程碑未触发 CI run" |
| UC-F-3 grep 证据    | N/A  | N5 不删除文件                              |
| UC-F-4 测试真实执行 | ✓    | vitest 输出 720 tests passed;N5 不新增测试 |
| UC-F-5 基线同步复跑 | ✓    | 上表"验证结果"为基线同步后复跑结果         |

### 命令原始输出(UC-F-1)

#### lint(基线同步后)

````
$ bun run lint
<头 10 行>
$ oxlint

  ! eslint-plugin-unicorn(prefer-array-find): Prefer `find` over filtering and accessing the first result.
    ,-[packages/desktop/src/renderer/utils/chat/autoTitle.ts:11:6]
 10 |     .map((line) => line.trim())
 11 |     .filter((line) => line && line !== '```');
    :      ^^^^^^
 12 |
    `----
  help: Use `find(predicate)` instead of `filter(predicate)[0]` or similar patterns.

... (总计 9818 行)

<尾 10 行>
  ! eslint-plugin-unicorn(prefer-add-event-listener): Prefer `addEventListener()` over their `on`-function counterparts.
     ,-[packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm.tsx:323:8]
 322 |
 323 |     es.onerror = () => {
     :        ^^^^^^^
 324 |       es.close();
     `----

Found 846 warnings and 0 errors.
Finished in 46ms on 940 files with 128 rules using 12 threads.

$ echo $?
0
````

#### tsc(基线同步后)

```
$ bunx tsc --noEmit
(无输出)

$ echo $?
0
```

#### vitest(基线同步后,完整输出)

```
$ bunx vitest run
 RUN  v4.1.0 /Users/zhoukai/Documents/github/AionUi


 Test Files  64 passed (64)
      Tests  720 passed (720)
   Start at  01:06:31
   Duration  9.44s (transform 2.67s, setup 2.84s, import 31.40s, tests 15.48s, environment 20.20s)

$ echo $?
0
```

#### prek(基线同步后)

```
$ prek run --from-ref origin/feat/backend-migration --to-ref HEAD
<头 10 行>
check yaml...............................................................Passed
check json...........................................(no files to check)Skipped
check toml...........................................(no files to check)Skipped
check for merge conflicts................................................Passed
check for case conflicts.................................................Passed
check for added large files..............................................Passed
fix end of files.........................................................Passed
trim trailing whitespace.................................................Passed
TypeScript Check.........................................................Passed
Oxlint...................................................................Passed

... (总计 12 行)

<尾 10 行>
check toml...........................................(no files to check)Skipped
check for merge conflicts................................................Passed
check for case conflicts.................................................Passed
check for added large files..............................................Passed
fix end of files.........................................................Passed
trim trailing whitespace.................................................Passed
TypeScript Check.........................................................Passed
Oxlint...................................................................Passed
Oxfmt....................................................................Passed
i18n Check...........................................(no files to check)Skipped

$ echo $?
0
```

### 3 个 workflow 的 diff(vs origin/feat/n4-test-rewrite-domains)

```diff
diff --git a/.github/workflows/_build-reusable.yml b/.github/workflows/_build-reusable.yml
index b081779ba..f16898405 100644
--- a/.github/workflows/_build-reusable.yml
+++ b/.github/workflows/_build-reusable.yml
@@ -65,9 +65,8 @@ jobs:
       - name: TypeScript type check
         run: bunx tsc --noEmit

-      # Unit tests temporarily disabled — see docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
-      # - name: Run unit tests
-      #   run: bunx vitest run
+      - name: Run unit tests
+        run: bunx vitest run

   build:
     name: Build ${{ matrix.platform }}

diff --git a/.github/workflows/build-and-release.yml b/.github/workflows/build-and-release.yml
index 61bd718dd..cc98d48af 100644
--- a/.github/workflows/build-and-release.yml
+++ b/.github/workflows/build-and-release.yml
@@ -50,10 +50,8 @@ jobs:
       - name: TypeScript type check
         run: bunx tsc --noEmit

-      # Unit tests temporarily disabled — see docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
-      # 暂时跳过单元测试 —— 详见 handoff TODO
-      # - name: Run unit tests
-      #   run: bunx vitest run
+      - name: Run unit tests
+        run: bunx vitest run

   build-pipeline:
     name: Build Pipeline

diff --git a/.github/workflows/pack-web-cli.yml b/.github/workflows/pack-web-cli.yml
index a844d48f3..a014f6449 100644
--- a/.github/workflows/pack-web-cli.yml
+++ b/.github/workflows/pack-web-cli.yml
@@ -65,9 +65,8 @@ jobs:
       - name: TypeScript type check
         run: bunx tsc --noEmit

-      # Unit tests temporarily disabled — see docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
-      # - name: Run unit tests
-      #   run: bunx vitest run
+      - name: Run unit tests
+        run: bunx vitest run

   pack-web-cli:
     name: Pack web-cli ${{ matrix.platform }}-${{ matrix.arch }}
```

### ci-web-cli-release-outcome.md 的 diff

```diff
diff --git a/docs/backend-migration/handoffs/ci-web-cli-release-outcome.md b/docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
index 3f8e8..8c3e4 100644
--- a/docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
+++ b/docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
@@ -42,7 +42,7 @@

 ## 未解决的 TODO

-- **单元测试(`bunx vitest run`)在 3 个 code-quality job 中都被临时注释**(`build-and-release.yml`、`pack-web-cli.yml`、`_build-reusable.yml`)。原因:M1-M9 合入后仓库累积了 168 个 failing test / 49 个 failing test file,按用户要求暂时跳过以解除 release 通道阻塞。**必须尽快修**:搜 `Run unit tests` 的注释块,跟同步修复全仓单测一起恢复;不要让这个临时状态长期化
+- **单元测试(`bunx vitest run`)恢复** ✅ **DONE (N5 恢复于 2026-05-09)**:3 个 workflow 中被临时注释的 `bunx vitest run` 已在 N5 里程碑恢复(commit 5ea238139)。N1-N4 完成死代码清理 + 60 个新测试文件后,720 tests 全绿,CI 门禁已重新激活。详见 `docs/backend-migration/handoffs/N5-outcome.md`
 - **bundled-bun runtime 代码未清理**:backend 已自带 bun runtime,`prepareBundledBun` 在打包链上已全线移除(脚本/test/electron-builder/vitest/CI step 均已删除)。**仅剩 `packages/desktop/src/process/utils/shellEnv.ts:34-42` 的 `getBundledBunDir()` 及其 2 处 consumer**(行 416-418 / 565-567)需要后续确认 backend 真的提供 bun 后一并移除。
   - 当前行为:`getBundledBunDir()` 在 dmg 里找不到 `resources/bundled-bun/`,返回 null,consumer 自动 fallback 到系统 PATH,**不 crash**
   - `.gitignore:201` 的 `resources/bundled-bun` 条目保留,防止本地 dev 误提交这个目录
```

## Backend 修改

无。

## 整链合入 dev 验证(team-lead 回填)

- 合入 dev 的 merge commit SHA: _待回填_
- `gh run list --branch dev` 的最新 run JSON: _待回填_
- `build-and-release.yml` conclusion: success URL: _待回填_
- 是否有 rerun 及原因: _待回填_

## 遗留 / 跟进项

无。本里程碑为纯机械配置恢复,无遗留技术债。

---

**整条链已就绪**。请 team-lead 按 `docs/backend-migration/plans/2026-05-08-cleanup-teammate-cheatsheet.md` 的"整链末端(team-lead 一次性做)"节,把 N1-N5 整链合入 dev 并回填本 handoff 的"整链合入 dev 验证"节。
