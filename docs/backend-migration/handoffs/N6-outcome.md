# N6 frontend-dead-code-cleanup - 交付摘要

## 已交付

- 9 个 commit 追加到 `cleanup/audit-backend-migrated-dead-code`
  - C1: `c4927d4b7` — remove dead no-op bridges (auth/shell/task/remoteAgent)
  - C2: `6596f2ac3` — remove dead workspace snapshot bridge + service
  - C3: `bec1b0949` — remove dead STT bridge, service, and mainLogger
  - C4: `95fbc0b10` — remove dead ConversationService layer
  - C5: `ded7534d7` — remove dead agent factory utils
  - C6: `b660d3882` — remove seven zero-consumer orphan files
  - C7: `2f3feb33a` — remove process/task/ directory and rewire consumers
  - C8: `b9e6ab3d8` — trim HTTP no-op provider blocks in system settings and app core
  - C9: `8a3c75a63` — move remote agent types from process/ to common/
- 删除 32 源文件 + 1 文件 MOVE (process/agent/remote/types.ts → common/types/remoteAgentTypes.ts) + 10 个 MODIFY 点
- 净减 ~3579 行 (DELETE) + ~66 行 (C8 瘦身 HTTP no-op providers) + 0 行 (C9 MOVE)
- 额外产生 1 个格式修正 commit (`90d8c66ee` — oxfmt formatting after N6)

## 与计划的偏离

**Plan 阶段 10 把上游分支写错:**

- **偏离点**: plan 10.1 / 10.4 把上游误写为 `origin/main`,实际应为 `origin/feat/backend-migration`
- **原因**: 本分支真实 base 是 `feat/backend-migration`(UC-F-5 cheatsheet 明确指出),该分支包含 `src/` → `packages/desktop/src/` 目录重命名,而 `origin/main` 尚未合并该迁移,导致 executor 初次尝试 merge `origin/main` 时遇到 91 个冲突(超过 15 个阈值,按 plan 要求 escalate)
- **解决方案**: team-lead 纠正后,executor 改用 `origin/feat/backend-migration` 作为 baseline,merge 无冲突(仅 1 个上游 commit: `054857c39` team agent_type fix),全量验证通过
- **对后续影响**: 无。分支已成功 push 到 `origin/cleanup/audit-backend-migrated-dead-code`,后续 PR 应 base 到 `feat/backend-migration` 而非 `main`

**C9 import 站点计数偏差:**

- **偏离点**: plan 写 C9 有 5 个 import 站点,实际有 6 个(ipcBridge.ts 中有 5 处 type import)
- **解决方案**: 使用 Edit replace_all: true 一次性替换 ipcBridge.ts 的所有 type import,加上 RemoteAgentManagement.tsx 的 1 处,共 6 处修改
- **对后续影响**: 无

## 给下一个里程碑的提醒

- **Active task count API 缺失**: `process/task/` 目录已消失,C7 之后 tray 的 `getRunningTasksCount()` 硬编码返回 0。Backend 需要补充 `GET /api/conversations/active-count` 路由以提供真实任务数(audit §4.9.4 future-work)
- **SystemSettings 死链清理**: `systemSettingsBridge.ts` 的 `_changeListener` / `onCloseToTrayChanged` 在 C8 瘦身后已是死链(只有 setter 保留,getter 走 HTTP),`src/index.ts:628` 的调用链等待后续整改
- **common/types/ 目录超限**: 当前 19 个文件,超过 AGENTS.md 规定的 10 个上限。C9 新增 `remoteAgentTypes.ts` 后需按领域拆分子目录(例如 `types/remote/`, `types/conversation/` 等)

## 验证证据(UC-F-1)

- 分支: `cleanup/audit-backend-migrated-dead-code`
- 基线 HEAD SHA: `9998c1593bc179383ca1c746fe7a9f22d4309cde` (docs commit before C1)
- 最终 HEAD SHA: `a5b60b3a61b8a2be8b2a5dc3a78040239cc220fe` (merge commit with feat/backend-migration)
- 基线同步状态: 已 merge `origin/feat/backend-migration` (SHA `a5b60b3a6`), 仅 1 个上游新 commit,无冲突

### tsc

```
$ bunx tsc --noEmit
(no output)
Exit code: 0
```

### lint

```
$ bun run lint
Found 727 warnings and 0 errors.
Finished in 85ms on 847 files with 128 rules using 12 threads.
Exit code: 0
```

### vitest

```
$ bunx vitest run --reporter=default
Test Files  78 passed (78)
Tests      799 passed (799)
Start at   16:06:07
Duration   14.83s (transform 4.57s, setup 4.61s, import 63.95s, tests 21.28s, environment 32.38s)
Exit code: 0
```

### prek

```
$ prek run --from-ref origin/feat/backend-migration --to-ref HEAD
check yaml...........................................(no files to check)Skipped
check json...............................................................Passed
check toml...........................................(no files to check)Skipped
check for merge conflicts................................................Passed
check for case conflicts.................................................Passed
check for added large files..............................................Passed
fix end of files.........................................................Passed
trim trailing whitespace.................................................Passed
TypeScript Check.........................................................Passed
Oxlint...................................................................Passed
Oxfmt....................................................................Passed
i18n Check...............................................................Passed
Exit code: 0
```

### Pet confirmation 路径对账

```bash
# 1. 确认 petConfirmManager 不再引用 task/
$ grep -n "workerTaskManager\|IpcAgentEventEmitter\|setConfirmHook" \
    packages/desktop/src/process/pet/petConfirmManager.ts
(no output)

# 2. 确认 petConfirmManager 使用 ipcBridge.conversation.confirmation.*
$ grep -n "ipcBridge.conversation.confirmation" \
    packages/desktop/src/process/pet/petConfirmManager.ts
337:        ipcBridge.conversation.confirmation.remove.emit({
341:        ipcBridge.conversation.confirmation.confirm
348:          console.error('[PetConfirm] confirmation.confirm.invoke failed:', error);

# 3. 确认 task/ 目录彻底消失
$ find packages/desktop/src/process/task -type f 2>/dev/null
(no output)

# 4. 确认 agent/ 目录彻底消失
$ find packages/desktop/src/process/agent -type f 2>/dev/null
(no output)
```

## Backend 修改(UC-G)

无。本里程碑未触碰 aionui-backend。Active task count API (`GET /api/conversations/active-count`) 作为 future-work 延后实现。
