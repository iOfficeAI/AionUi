# N6 前端死代码清理实施计划

> **给 executor**:本计划自包含。除了下方"参考文档"列出的两份文件,不要再读其他里程碑的 plan / requirements / handoff。
> 每个阶段步骤的命令都可直接 copy-paste,不留占位符。

**目标**:把 `docs/backend-migration/plans/2026-05-12-frontend-dead-code-audit.md` 的 §5 / §6 / §7 落地为 9 个独立 commit,净删 ~3672 行(32 个文件 DELETE + 10 个 MODIFY 点 + 1 个文件 MOVE),保持每个 commit 独立 `bunx tsc --noEmit` 通过。

**架构**:纯清理与瘦身。不引入新逻辑、不改 backend(active-count 暂保留 `return 0`)。单分支、9 个 commit,**不创建 PR**,只 push 追加到当前分支 `cleanup/audit-backend-migrated-dead-code`。

**技术栈**:TypeScript / bun / vitest / oxlint / prek / git。

---

## 零上下文会话背景

你正在执行 AionUi 后端迁移清理链的 N6 里程碑,把 `aionui-backend`(Rust)接管后仍残留在 `packages/desktop/src/process/` 的死代码一次性清除。审计文档已经给出 DELETE / MODIFY / KEEP 的最终清单和依赖顺序;你的任务是**忠实落地**这个清单,不加不减。

**N6 的交付物**:

- 32 个死文件被 `git rm`(`process/bridge/*` / `process/services/*` / `process/utils/*` / `process/task/*` 共计 ~3579 行)
- 10 个 MODIFY 点(`bridge/index.ts` / `initBridge.ts` / `src/index.ts` / `applicationBridge.ts` / `tray.ts` / `petConfirmManager.ts` / `petManager.ts` / `systemSettingsBridge.ts` / `applicationBridgeCore.ts` + 5 处 `@process/agent/remote/types` import 替换)
- 1 个文件 MOVE(`process/agent/remote/types.ts` → `common/types/remoteAgentTypes.ts`)+ 删除空的 `process/agent/` 目录
- 9 个 commit(C1-C9),每个独立 `bunx tsc --noEmit` 通过

**N6 不做的事**:

- 不新增后端路由(如 `/api/conversations/active-count` —— 已决策延后,tray 硬编码 `return 0`)
- 不碰 `renderer/` / `common/` / `preload/`(除了 C9 的 5 处 import 路径替换 + 新建 `common/types/remoteAgentTypes.ts`)
- 不改任何 KEEP 文件的业务逻辑
- 不创建 PR、不合入 `main`、不跨仓(UC-G 本次不触发)

**开始前的前置条件**:

- `git status` 干净
- 当前分支 `cleanup/audit-backend-migrated-dead-code`,HEAD 是 `9998c1593`(基线快照命令会再次验证)
- 已装 bun、Node 22+、prek
- `bun install` 成功
- `bunx vitest --version` 输出 vitest/4.x

**分支**:**直接在当前分支** `cleanup/audit-backend-migrated-dead-code` 追加 9 个 commit。**不开新分支,不开 PR**(team-lead 决策)。

```bash
cd /Users/zhoukai/Documents/github/AionUi
git rev-parse --abbrev-ref HEAD   # 应为 cleanup/audit-backend-migrated-dead-code
git status                         # 应为 clean
```

---

## 参考文档

除本计划外,**只**读这两份:

1. `docs/backend-migration/plans/2026-05-12-frontend-dead-code-audit.md` —— 战略源,尤其 §4.9 / §5.2 / §5.3 / §6.1 / §6.2 / §7
2. `docs/backend-migration/plans/2026-05-08-cleanup-teammate-cheatsheet.md` —— UC-F 反偷懒硬约束(贴原始命令输出、grep 证据、无 skip)

不要读其他 N{x} 里程碑的 requirements / plan / handoff —— 那是独立历史链。

---

## 用户已确认的关键决策(不可更改)

1. **分支策略**:直接在当前分支 `cleanup/audit-backend-migrated-dead-code` 追加 9 个 commit。**不开新分支,不创建 PR**。
2. **active-count 短期方案**(audit §4.9.2 #4 / §4.9.4):`tray.ts` 的 `getRunningTasksCount()` 直接 `return 0`。本次**不改 backend**,不触发 UC-G 跨仓。
3. **UC-B 修正**:`ccSwitchModelSource.ts` 和 `previewUtils.ts` 虽在 2026-05-08 文档 UC-B 的保留名单,audit §4.3.5 / §4.6.18 已证伪(对应消费者 `process/acp/*` / `process/agent/acp/*` / `task/AcpAgentManager.ts` 均已删除),本次按 DELETE 处理。

---

## 关键风险与已知坑(必读)

### R1. adapter 的 wsEmitter.emit 在主进程是 no-op

审计 §4.9.3 #6 要求把 `new IpcAgentEventEmitter().emitConfirmationRemove(...)` 改成 `ipcBridge.conversation.confirmation.remove.emit(...)`。实测 `packages/desktop/src/common/adapter/httpBridge.ts:394` 的 `wsEmitter` 工厂 `emit: (() => {}) as ...` —— **emit 是真正的 no-op**;且 `ensureWs()` 在 `typeof window === 'undefined'` 时直接 return(line 295-299),主进程根本不订阅 WS。

结论:替换后这行调用变成事实 no-op。原先 `emitConfirmationRemove` 的"立即广播给 main renderer 防止二次响应"这个语义**已经不生效了**(这是 pre-existing bug,不在 N6 scope)。executor 严格按 audit 指令替换调用即可,**不额外删除**,也**不尝试修复**这个 pre-existing bug —— handoff 写进"遗留问题"节告知 team-lead。

### R2. petConfirmManager 的 setConfirmHook 注册实际上已失效

`setConfirmHook` 只在 `IpcAgentEventEmitter.emit*()` 被调用时触发,而 IpcAgentEventEmitter 由 task/ 目录的 AgentFactory 产生,AgentFactory **从未注册任何 agent creator**(audit §4.9.1)。也就是说 `petConfirmManager.initPetConfirmManager` 里的 `setConfirmHook({onAdd, onUpdate, onRemove})` 现在就是死代码。

本次 C7 删除 IpcAgentEventEmitter 和整个 task/ 目录后,`setConfirmHook` / `ConfirmHook` 类型定义也消失;pet 改为**直接删除这些 hook 注册**(见 C7 petConfirmManager 改动)。这不会影响用户可见功能,因为这条路径本来就不会触发。

### R3. common/types/ 目录已有 18 个文件,加新文件达到 19,超过 AGENTS.md 的 10 个硬上限

C9 把 `remoteAgentTypes.ts` 放入 `common/types/`,会使该目录达到 19 个直接子项。这**不是 N6 引入的违规**(目录早已超标),但 executor 不应因此改变 C9 的目标位置(type 必须放 `common/`,不能留 `process/`)。handoff 写一条"遗留问题 / 后续整改":"common/types/ 目录需按 AGENTS.md 重新按领域拆子目录"。

### R4. `setCloseToTray.provider` 本地副作用已失效

瘦身 systemSettingsBridge(C8)要求删除 `setCloseToTray.provider` 代码块。该 block 里调的 `_changeListener?.(enabled)` 自 adapter HTTP 化后已永不触发(`.provider` 是 no-op)——这是 pre-existing bug。**按 audit §7.4 删除整个 block**;保留 `onCloseToTrayChanged` / `_changeListener` 的声明(因为 `src/index.ts:628` 仍在 import),tsc 不会报错。写进 handoff "遗留问题":"systemSettingsBridge 的 closeToTray listener 链路已死,src/index.ts:628 的 onCloseToTrayChanged 调用可在未来整改"。

### R5. 审计文档的导入次数微差

audit §5.3 / §7.3 说 C9 要更新"5 处 `@process/agent/remote/types` 引用"。实际探查(`grep -rn '@process/agent/remote/types'`)命中 **6 处**:1 处 tsx(`RemoteAgentManagement.tsx:8`)+ 5 处 `ipcBridge.ts`(line 818 / 819 / 823 / 824 / 826)。executor 按**实际 6 处**替换。

---

## 文件清单

**DELETE(32 文件)**:

| #   | 相对路径(含 `packages/desktop/src/`)                        | 行数 | Commit |
| --- | ----------------------------------------------------------- | ---: | ------ |
| 1   | `process/bridge/authBridge.ts`                              |   59 | C1     |
| 2   | `process/bridge/remoteAgentBridge.ts`                       |   21 | C1     |
| 3   | `process/bridge/shellBridge.ts`                             |  273 | C1     |
| 4   | `process/bridge/taskBridge.ts`                              |   45 | C1     |
| 5   | `process/bridge/workspaceSnapshotBridge.ts`                 |   68 | C2     |
| 6   | `process/services/WorkspaceSnapshotService.ts`              |  433 | C2     |
| 7   | `process/bridge/speechToTextBridge.ts`                      |   14 | C3     |
| 8   | `process/bridge/services/SpeechToTextService.ts`            |  260 | C3     |
| 9   | `process/utils/mainLogger.ts`                               |   43 | C3     |
| 10  | `process/services/conversationServiceSingleton.ts`          |   18 | C4     |
| 11  | `process/services/ConversationServiceImpl.ts`               |  160 | C4     |
| 12  | `process/services/IConversationService.ts`                  |   58 | C4     |
| 13  | `process/services/database/SqliteConversationRepository.ts` |  109 | C4     |
| 14  | `process/utils/initAgent.ts`                                |  414 | C5     |
| 15  | `process/utils/openclawUtils.ts`                            |   30 | C5     |
| 16  | `process/services/ccSwitchModelSource.ts`                   |  236 | C6     |
| 17  | `process/services/openclawConflictDetector.ts`              |  208 | C6     |
| 18  | `process/utils/credentialCrypto.ts`                         |  109 | C6     |
| 19  | `process/utils/safeExec.ts`                                 |  173 | C6     |
| 20  | `process/utils/message.ts`                                  |  143 | C6     |
| 21  | `process/utils/previewUtils.ts`                             |   84 | C6     |
| 22  | `process/utils/configureConsole.ts`                         |   21 | C6     |
| 23  | `process/task/AgentFactory.ts`                              |   25 | C7     |
| 24  | `process/task/ConversationBusyGuard.ts`                     |   96 | C7     |
| 25  | `process/task/IAgentEventEmitter.ts`                        |   23 | C7     |
| 26  | `process/task/IAgentFactory.ts`                             |   28 | C7     |
| 27  | `process/task/IAgentManager.ts`                             |   30 | C7     |
| 28  | `process/task/IpcAgentEventEmitter.ts`                      |   53 | C7     |
| 29  | `process/task/IWorkerTaskManager.ts`                        |   19 | C7     |
| 30  | `process/task/WorkerTaskManager.ts`                         |  123 | C7     |
| 31  | `process/task/agentTypes.ts`                                |   17 | C7     |
| 32  | `process/task/workerTaskManagerSingleton.ts`                |   86 | C7     |

**DELETE 行数合计**:~3579

**MODIFY(10 个文件)**:

| 文件                                                                                              | Commit            | 改动                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process/bridge/index.ts`                                                                         | C1 / C2 / C3 / C7 | 逐 commit 增量移除 import / init 调用 / export 段 + C7 移除 `BridgeInitDeps.workerTaskManager`                                                                                |
| `process/utils/initBridge.ts`                                                                     | C7                | 移除 `workerTaskManager` 相关 import 和 wiring                                                                                                                                |
| `src/index.ts`                                                                                    | C7                | 删除 `import { workerTaskManager }` + `await workerTaskManager.clear()`                                                                                                       |
| `process/bridge/applicationBridge.ts`                                                             | C7                | 删除 `IWorkerTaskManager` import / 形参 / `.clear()` 调用                                                                                                                     |
| `process/utils/tray.ts`                                                                           | C7                | 删除 `workerTaskManager` import,`getRunningTasksCount()` 改为 `return 0`                                                                                                      |
| `process/pet/petConfirmManager.ts`                                                                | C7                | 删除 `workerTaskManager` / `setConfirmHook` / `IpcAgentEventEmitter` import;hook 注册删除;pet 响应改用 `ipcBridge.conversation.confirmation.confirm.invoke` 和 `.remove.emit` |
| `process/pet/petManager.ts`                                                                       | C7                | 无实际引用,仅 grep 验证 —— 若 grep 有命中按实际清理                                                                                                                           |
| `process/bridge/systemSettingsBridge.ts`                                                          | C8                | 删 11 处 HTTP no-op `.provider()` block,保留 pet / setKeepAwake / changeLanguage                                                                                              |
| `process/bridge/applicationBridgeCore.ts`                                                         | C8                | 删除 `systemInfo.provider(...)` 3 行                                                                                                                                          |
| `common/adapter/ipcBridge.ts` + `renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx` | C9                | 6 处 `@process/agent/remote/types` import 改为 `@/common/types/remoteAgentTypes`                                                                                              |

**MOVE(1 文件)**:

- `process/agent/remote/types.ts` → `common/types/remoteAgentTypes.ts` (C9)
- 删除空目录:`process/agent/remote/` 和 `process/agent/` (C9)

**验证命令(每个 commit 必跑,不能跳)**:

```bash
bunx tsc --noEmit       # 退出 0
bun run lint            # 退出 0(允许 warnings,但不允许 errors)
```

**整链末尾(阶段 10)额外跑**:

```bash
bunx vitest run         # 退出 0
prek run --from-ref origin/main --to-ref HEAD  # 退出 0
```

---

## 阶段 0:建立基线快照

- [ ] **步骤 0.1:确认分支与工作区状态**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git rev-parse --abbrev-ref HEAD
git status --porcelain
git rev-parse HEAD
```

预期:

- 分支 `cleanup/audit-backend-migrated-dead-code`
- `git status --porcelain` 无输出
- HEAD 为 `9998c1593bc179383ca1c746fe7a9f22d4309cde`(若不同,说明有新提交,在 handoff"偏离"节记录并继续 —— 新 SHA 也可接受)

- [ ] **步骤 0.2:记录基线度量供后续对比**

```bash
mkdir -p /tmp/n6-baseline

# 当前 process/ 文件数
find packages/desktop/src/process -type f -name '*.ts' | wc -l > /tmp/n6-baseline/process-file-count.txt

# 当前所有测试数(用 vitest 的 collect)
bunx tsc --noEmit > /tmp/n6-baseline/tsc.log 2>&1
echo "tsc exit: $?" >> /tmp/n6-baseline/tsc.log

bun run lint > /tmp/n6-baseline/lint.log 2>&1
echo "lint exit: $?" >> /tmp/n6-baseline/lint.log

bunx vitest run --reporter=default > /tmp/n6-baseline/vitest.log 2>&1
echo "vitest exit: $?" >> /tmp/n6-baseline/vitest.log

# 快照关键 SHA
git rev-parse HEAD > /tmp/n6-baseline/head-sha.txt
```

预期:

- `/tmp/n6-baseline/process-file-count.txt` 是具体数字(约 80)
- `tsc.log` 末尾 `tsc exit: 0`(若非 0,不继续 N6,escalate)
- `lint.log` 末尾 `lint exit: 0`
- `vitest.log` 末尾 `vitest exit: 0`

**这些文件是基线,不 commit。它们会进 handoff 用于与最终验证对比。**

- [ ] **步骤 0.3:工具预检**

```bash
which bunx && bunx vitest --version
which prek && prek --version
which gh    # PR 不需要,但 handoff 可能要看远端状态
```

预期:全部命令有输出,无 `command not found`。若 `prek` 缺失,按 cheatsheet 装:

```bash
npm install -g @j178/prek
```

- [ ] **步骤 0.4:跑 bun install 确认依赖一致**

```bash
bun install 2>&1 | tail -5
```

预期:无 "Failed" 字样,退出 0。

---

## 阶段 1(C1):删除 4 个纯 no-op bridge + bridge/index.ts 同步清理

### 1.1 UC-F-3 grep 证据(先采集,再删)

```bash
grep -rn "from .\./authBridge'\|from '\./authBridge'\|initAuthBridge" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' \
  2>/dev/null > /tmp/n6-c1-authBridge.grep

grep -rn "from .\./shellBridge'\|from '\./shellBridge'\|initShellBridge" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' \
  2>/dev/null > /tmp/n6-c1-shellBridge.grep

grep -rn "from .\./taskBridge'\|from '\./taskBridge'\|initTaskBridge" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' \
  2>/dev/null > /tmp/n6-c1-taskBridge.grep

grep -rn "from .\./remoteAgentBridge'\|from '\./remoteAgentBridge'\|initRemoteAgentBridge" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' \
  2>/dev/null > /tmp/n6-c1-remoteAgentBridge.grep

cat /tmp/n6-c1-authBridge.grep /tmp/n6-c1-shellBridge.grep /tmp/n6-c1-taskBridge.grep /tmp/n6-c1-remoteAgentBridge.grep
```

**预期**:所有命中都在 `packages/desktop/src/process/bridge/authBridge.ts`(self-reference)或 `packages/desktop/src/process/bridge/index.ts`(会在本 commit 一并清理)。**如果有其他文件命中,立即 escalate,不继续 C1**。

### 1.2 删除 4 个文件

```bash
git rm packages/desktop/src/process/bridge/authBridge.ts
git rm packages/desktop/src/process/bridge/remoteAgentBridge.ts
git rm packages/desktop/src/process/bridge/shellBridge.ts
git rm packages/desktop/src/process/bridge/taskBridge.ts
```

### 1.3 修改 `packages/desktop/src/process/bridge/index.ts`

用 Edit 工具(平台无关,不用 sed)。**每次 Edit 只改一处**。

**Edit 1.3.1 —— 移除已删 bridge 的 import 行**

old_string(精确匹配 line 7-18,含缩进):

```ts
import { initApplicationBridge } from './applicationBridge';
import { initAuthBridge } from './authBridge';
import { initDialogBridge } from './dialogBridge';
import { initShellBridge } from './shellBridge';
import { initSpeechToTextBridge } from './speechToTextBridge';
import { initTaskBridge } from './taskBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';
import { initRemoteAgentBridge } from './remoteAgentBridge';
```

new_string:

```ts
import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initSpeechToTextBridge } from './speechToTextBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';
```

**Edit 1.3.2 —— 移除 initAllBridges 函数体内已删 bridge 的 init 调用**

old_string:

```ts
export function initAllBridges(deps: BridgeDependencies): void {
  initDialogBridge();
  initShellBridge();
  initApplicationBridge(deps.workerTaskManager);
  initAuthBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initTaskBridge(deps.workerTaskManager);
  initSpeechToTextBridge();
  initWorkspaceSnapshotBridge();
  initRemoteAgentBridge();
  initWebuiBridge();
}
```

new_string:

```ts
export function initAllBridges(deps: BridgeDependencies): void {
  initDialogBridge();
  initApplicationBridge(deps.workerTaskManager);
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initSpeechToTextBridge();
  initWorkspaceSnapshotBridge();
  initWebuiBridge();
}
```

**Edit 1.3.3 —— 移除 export 段中已删 bridge 的名字**

old_string:

```ts
export {
  initApplicationBridge,
  initAuthBridge,
  initDialogBridge,
  initNotificationBridge,
  initShellBridge,
  initSpeechToTextBridge,
  initSystemSettingsBridge,
  initTaskBridge,
  initUpdateBridge,
  initRemoteAgentBridge,
  initWindowControlsBridge,
  initWorkspaceSnapshotBridge,
  initWebuiBridge,
};
```

new_string:

```ts
export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSpeechToTextBridge,
  initSystemSettingsBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWorkspaceSnapshotBridge,
  initWebuiBridge,
};
```

### 1.4 验证 C1

```bash
bunx tsc --noEmit 2>&1 | tail -20
echo "tsc exit: $?"

bun run lint 2>&1 | tail -20
echo "lint exit: $?"
```

预期:`tsc exit: 0` 和 `lint exit: 0`。如有 tsc 错误,查 `grep -n authBridge\|shellBridge\|taskBridge\|remoteAgentBridge packages/desktop/src/process/bridge/index.ts` 看是否漏删某处。

### 1.5 Commit C1

```bash
git add -A
git status   # 确认改动仅限于 bridge/index.ts 以及 4 个删除文件

git commit -m "refactor(n6/process): remove dead no-op bridges (auth/shell/task/remoteAgent)

These bridges consist entirely of .provider() registrations over HTTP/stub
adapter routes where the provider callback is a no-op, making every handler
registration dead code. backend-side routes (aionui-shell, stub for
googleAuth, stubProvider for task.stopAll/getRunningCount, remoteAgent
HTTP) fully cover the runtime behaviour.

- process/bridge/authBridge.ts (59 lines)
- process/bridge/remoteAgentBridge.ts (21 lines, self-labelled \"Intentionally empty\")
- process/bridge/shellBridge.ts (273 lines)
- process/bridge/taskBridge.ts (45 lines)
- process/bridge/index.ts: drop their init calls and re-exports

Audit: docs/backend-migration/plans/2026-05-12-frontend-dead-code-audit.md
sections 4.1.3 / 4.1.8 / 4.1.9 / 4.1.12 / 6.2 C1."
```

记下 commit SHA:

```bash
git rev-parse HEAD > /tmp/n6-c1-sha.txt
```

### 1.6 失败诊断路径

- tsc 报错 "Cannot find module './authBridge'" / 等 → Edit 1.3.1 的 import 段漏删某行。重读 `bridge/index.ts` 再改。
- tsc 报错 "Property 'initAuthBridge' does not exist" → Edit 1.3.2 漏删某行调用。
- tsc 报错 "initAuthBridge is not exported" → Edit 1.3.3 的 export 段漏删。
- lint 失败 → 检查 `.oxlintrc.json` 规则;常见是 `no-unused-vars`,对应 `_` 前缀规则或本 commit 遗留未用 import。

---

## 阶段 2(C2):删除 workspaceSnapshot 两件套 + bridge/index.ts 同步

### 2.1 UC-F-3 grep 证据

```bash
grep -rn "from .\./workspaceSnapshotBridge'\|from '\./workspaceSnapshotBridge'\|initWorkspaceSnapshotBridge\|disposeAllSnapshots\|WorkspaceSnapshotService" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' \
  2>/dev/null > /tmp/n6-c2.grep

cat /tmp/n6-c2.grep
```

**预期命中**:

- `packages/desktop/src/process/bridge/index.ts:17`(本 commit 清理)
- `packages/desktop/src/process/bridge/index.ts:37`(本 commit 清理)
- `packages/desktop/src/process/bridge/index.ts:54`(本 commit 清理)
- `packages/desktop/src/process/bridge/index.ts:57`(本 commit 清理)
- `packages/desktop/src/process/bridge/workspaceSnapshotBridge.ts:*`(self-reference)
- `packages/desktop/src/process/services/WorkspaceSnapshotService.ts:*`(self-reference)

**其他命中一律 escalate。**

### 2.2 删除文件

```bash
git rm packages/desktop/src/process/bridge/workspaceSnapshotBridge.ts
git rm packages/desktop/src/process/services/WorkspaceSnapshotService.ts
```

### 2.3 修改 `packages/desktop/src/process/bridge/index.ts`

**Edit 2.3.1 —— 移除 workspaceSnapshotBridge import**

old_string:

```ts
import { initNotificationBridge } from './notificationBridge';
import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';
```

new_string:

```ts
import { initNotificationBridge } from './notificationBridge';
```

**Edit 2.3.2 —— 移除 initAllBridges 函数体内的 initWorkspaceSnapshotBridge 调用**

old_string:

```ts
initSpeechToTextBridge();
initWorkspaceSnapshotBridge();
initWebuiBridge();
```

new_string:

```ts
initSpeechToTextBridge();
initWebuiBridge();
```

**Edit 2.3.3 —— 移除 export 段的 initWorkspaceSnapshotBridge**

old_string:

```ts
  initWindowControlsBridge,
  initWorkspaceSnapshotBridge,
  initWebuiBridge,
};
```

new_string:

```ts
  initWindowControlsBridge,
  initWebuiBridge,
};
```

**Edit 2.3.4 —— 移除 disposeAllSnapshots re-export**

old_string:

```ts
export { disposeAllSnapshots } from './workspaceSnapshotBridge';
export { registerWindowMaximizeListeners } from './windowControlsBridge';
```

new_string:

```ts
export { registerWindowMaximizeListeners } from './windowControlsBridge';
```

### 2.4 验证 C2

```bash
bunx tsc --noEmit 2>&1 | tail -20
echo "tsc exit: $?"

bun run lint 2>&1 | tail -20
echo "lint exit: $?"
```

预期:两者均退出 0。如果 tsc 报 "Cannot find module" 指向 `workspaceSnapshotBridge`,说明漏删某行 re-export。

### 2.5 Commit C2

```bash
git add -A
git commit -m "refactor(n6/process): remove dead workspace snapshot bridge + service

/api/fs/snapshot/* is fully handled by aionui-backend crate aionui-file's
snapshot_manager. The frontend bridge consisted entirely of HTTP-routed
.provider() registrations (no-op) and a \`disposeAllSnapshots\` re-export
with zero consumers.

- process/bridge/workspaceSnapshotBridge.ts (68 lines)
- process/services/WorkspaceSnapshotService.ts (433 lines, cascaded)
- process/bridge/index.ts: drop init call, re-export, named export

Audit sections 4.1.16 / 4.3.7 / 6.2 C2."

git rev-parse HEAD > /tmp/n6-c2-sha.txt
```

### 2.6 失败诊断

- tsc 报错涉及 `disposeAllSnapshots` → Edit 2.3.4 的 re-export 未删干净。

---

## 阶段 3(C3):删除 speechToText 三件套 + mainLogger

### 3.1 UC-F-3 grep 证据

```bash
grep -rn "from .\./speechToTextBridge'\|from '\./speechToTextBridge'\|initSpeechToTextBridge\|SpeechToTextService\|mainLogger\|mainLog\|mainWarn\|mainError" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' \
  2>/dev/null > /tmp/n6-c3.grep

cat /tmp/n6-c3.grep
```

**预期命中**:

- `packages/desktop/src/process/bridge/speechToTextBridge.ts`(self-reference)
- `packages/desktop/src/process/bridge/services/SpeechToTextService.ts`(self-reference + 对 mainLogger 的 import,本 commit 删除)
- `packages/desktop/src/process/utils/mainLogger.ts`(self-reference)
- `packages/desktop/src/process/bridge/index.ts:11 / :36 / :48`(本 commit 清理)

**任何其他命中,包括 renderer 或 tests/ 的真实 import,立即 escalate。**

特别注意:`mainLog` / `mainWarn` / `mainError` 这些 short name 可能命中无关代码。筛查时只关注**完整 basename 的 import 路径**(`from '.../mainLogger'`)。

精准 grep 命令:

```bash
grep -rn "from .*['\"].*mainLogger['\"]" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  2>/dev/null
```

预期:只有 `SpeechToTextService.ts:14` 一条(本 commit 级联删除)。

### 3.2 删除文件

```bash
git rm packages/desktop/src/process/bridge/speechToTextBridge.ts
git rm packages/desktop/src/process/bridge/services/SpeechToTextService.ts
git rm packages/desktop/src/process/utils/mainLogger.ts
```

**注意**:`SpeechToTextService.ts` 所在的 `process/bridge/services/` 目录在删除后若为空,`git rm` 会自动让目录在 commit 中消失(git 不跟踪空目录)。用以下命令确认:

```bash
find packages/desktop/src/process/bridge/services -type f 2>/dev/null | head -5
```

若无输出,目录已空 —— 不需要显式 `rmdir`(git mv/rm 已处理)。

### 3.3 修改 `packages/desktop/src/process/bridge/index.ts`

**Edit 3.3.1 —— 移除 speechToTextBridge import**

old_string:

```ts
import { initDialogBridge } from './dialogBridge';
import { initSpeechToTextBridge } from './speechToTextBridge';
import { initUpdateBridge } from './updateBridge';
```

new_string:

```ts
import { initDialogBridge } from './dialogBridge';
import { initUpdateBridge } from './updateBridge';
```

**Edit 3.3.2 —— 移除 initSpeechToTextBridge 调用**

old_string:

```ts
initNotificationBridge();
initSpeechToTextBridge();
initWebuiBridge();
```

new_string:

```ts
initNotificationBridge();
initWebuiBridge();
```

**Edit 3.3.3 —— 移除 export 段**

old_string:

```ts
  initNotificationBridge,
  initSpeechToTextBridge,
  initSystemSettingsBridge,
```

new_string:

```ts
  initNotificationBridge,
  initSystemSettingsBridge,
```

### 3.4 验证 C3

```bash
bunx tsc --noEmit 2>&1 | tail -20
echo "tsc exit: $?"

bun run lint 2>&1 | tail -20
echo "lint exit: $?"
```

预期:退出 0。

### 3.5 Commit C3

```bash
git add -A
git commit -m "refactor(n6/process): remove dead STT bridge, service, and mainLogger

/api/stt is handled by backend aionui-system (proxy to OpenAI/Deepgram/
Gemini). SpeechToTextService (260 lines) has no consumers after its bridge
is removed; mainLogger (43 lines) has no consumers after SpeechToTextService
is removed — all three deleted as one cascade.

- process/bridge/speechToTextBridge.ts (14 lines)
- process/bridge/services/SpeechToTextService.ts (260 lines, cascaded)
- process/utils/mainLogger.ts (43 lines, cascaded)
- process/bridge/index.ts: drop init call, re-export

Audit sections 4.1.10 / 4.2.1 / 4.6.13 / 7.2 / 6.2 C3."

git rev-parse HEAD > /tmp/n6-c3-sha.txt
```

---

## 阶段 4(C4):删除 ConversationService 四件套

### 4.1 UC-F-3 grep 证据

```bash
grep -rn "from .*['\"].*conversationServiceSingleton['\"]\|from .*['\"].*ConversationServiceImpl['\"]\|from .*['\"].*IConversationService['\"]\|from .*['\"].*SqliteConversationRepository['\"]" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  2>/dev/null > /tmp/n6-c4.grep

cat /tmp/n6-c4.grep
```

**预期命中**(全部 self-reference 或互为消费者):

- `ConversationServiceImpl.ts` 的 line 7 import IConversationService(本 commit 内删除)
- `conversationServiceSingleton.ts` line 13 / 14 / 17(本 commit 内删除)
- `SqliteConversationRepository.ts` line 8 import IConversationRepository(**跨出本 commit**,指向 KEEP 的 `IConversationRepository.ts`,但本 commit 级联删除 SqliteConvRepo 即可)

**任何其他 renderer / test / process 的 import,立即 escalate**。

注:`services/database/IConversationRepository.ts`(39 行)是 KEEP(被 `workerTaskManagerSingleton.ts` 作为类型消费,C7 才处理)。**本 commit 不碰它**。

### 4.2 删除文件

```bash
git rm packages/desktop/src/process/services/conversationServiceSingleton.ts
git rm packages/desktop/src/process/services/ConversationServiceImpl.ts
git rm packages/desktop/src/process/services/IConversationService.ts
git rm packages/desktop/src/process/services/database/SqliteConversationRepository.ts
```

### 4.3 验证 C4

```bash
bunx tsc --noEmit 2>&1 | tail -30
echo "tsc exit: $?"

bun run lint 2>&1 | tail -10
echo "lint exit: $?"
```

预期:退出 0。如有 tsc 错误,常见是漏删了某个自相关文件的互相 import。

### 4.4 Commit C4

```bash
git add -A
git commit -m "refactor(n6/process): remove dead ConversationService layer

conversationServiceSingleton has zero external consumers; the implementation
chain (ConversationServiceImpl, IConversationService,
SqliteConversationRepository) is only used internally by the singleton.
All conversation CRUD has been taken over by aionui-backend crate
aionui-conversation via the HTTP adapter
(ipcBridge.conversation.create → POST /api/conversations).

IConversationRepository.ts (39 lines) is kept because
workerTaskManagerSingleton still types against it — that dependency is
removed in the task/ cascade commit (C7).

- process/services/conversationServiceSingleton.ts (18 lines)
- process/services/ConversationServiceImpl.ts (160 lines, cascaded)
- process/services/IConversationService.ts (58 lines, cascaded)
- process/services/database/SqliteConversationRepository.ts (109 lines, cascaded)

Audit sections 4.3.1 / 4.3.2 / 4.3.3 / 4.5.2 / 6.2 C4."

git rev-parse HEAD > /tmp/n6-c4-sha.txt
```

---

## 阶段 5(C5):删除 initAgent + openclawUtils

### 5.1 UC-F-3 grep 证据

```bash
grep -rn "from .*['\"].*utils/initAgent['\"]\|from .*['\"].*utils/openclawUtils['\"]\|createAcpAgent\|createOpenClawAgent\|createNanobotAgent\|createRemoteAgent\|createAionrsAgent\|computeOpenClawIdentityHash" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  2>/dev/null > /tmp/n6-c5.grep

cat /tmp/n6-c5.grep
```

**预期**:

- `process/utils/initAgent.ts`(self-reference,本 commit 删除)
- `process/utils/openclawUtils.ts`(self-reference,本 commit 删除)
- 零其他命中(ConversationServiceImpl 是 C4 删除的唯一外部消费者,C4 已完成)

**任何其他命中 escalate。**

### 5.2 删除文件

```bash
git rm packages/desktop/src/process/utils/initAgent.ts
git rm packages/desktop/src/process/utils/openclawUtils.ts
```

### 5.3 验证 C5

```bash
bunx tsc --noEmit 2>&1 | tail -20
echo "tsc exit: $?"

bun run lint 2>&1 | tail -10
echo "lint exit: $?"
```

预期:退出 0。

### 5.4 Commit C5

```bash
git add -A
git commit -m "refactor(n6/process): remove dead agent factory utils

initAgent (414 lines) only consumed by ConversationServiceImpl (removed in
C4). openclawUtils.computeOpenClawIdentityHash only consumed by initAgent.
All agent creation is now owned by aionui-backend crate aionui-conversation.

- process/utils/initAgent.ts (414 lines, cascaded from C4)
- process/utils/openclawUtils.ts (30 lines, cascaded)

Audit sections 4.6.10 / 4.6.17 / 6.2 C5."

git rev-parse HEAD > /tmp/n6-c5-sha.txt
```

---

## 阶段 6(C6):删除 7 个零消费者孤儿

### 6.1 UC-F-3 grep 证据(每个文件分别采集)

```bash
for f in ccSwitchModelSource openclawConflictDetector credentialCrypto safeExec message previewUtils configureConsole; do
  echo "=== $f ===" >> /tmp/n6-c6.grep
  grep -rn "from .*['\"].*\(utils\|services\)/${f}['\"]" \
    packages/ scripts/ tests/ \
    --include='*.ts' --include='*.tsx' --include='*.js' \
    2>/dev/null >> /tmp/n6-c6.grep
done

cat /tmp/n6-c6.grep
```

**预期**:每个文件下方**无命中**(全部孤儿)。**如果任何文件有外部消费者,立即 escalate,不继续 C6**。

注:`message` 如果用宽泛 grep 会命中 `.message` 属性、`messageList` 等;严格使用 `from .*['\"].*utils/message['\"]` 模式可规避假阳性。

### 6.2 删除文件

```bash
git rm packages/desktop/src/process/services/ccSwitchModelSource.ts
git rm packages/desktop/src/process/services/openclawConflictDetector.ts
git rm packages/desktop/src/process/utils/credentialCrypto.ts
git rm packages/desktop/src/process/utils/safeExec.ts
git rm packages/desktop/src/process/utils/message.ts
git rm packages/desktop/src/process/utils/previewUtils.ts
git rm packages/desktop/src/process/utils/configureConsole.ts
```

### 6.3 验证 C6

```bash
bunx tsc --noEmit 2>&1 | tail -20
echo "tsc exit: $?"

bun run lint 2>&1 | tail -10
echo "lint exit: $?"
```

预期:退出 0(完全孤儿删除不应产生 tsc 错误)。

### 6.4 Commit C6

```bash
git add -A
git commit -m "refactor(n6/process): remove seven zero-consumer orphan files

All seven files have no import references anywhere in packages/ after the
earlier cascades (C4/C5) and the removal of process/acp/* and
process/agent/acp/* in prior milestones. The audit section 8.2 documents
that UC-B's original retention of ccSwitchModelSource.ts and previewUtils.ts
was predicated on AcpAgentManager.ts (long deleted), so both are eligible
for deletion here.

- process/services/ccSwitchModelSource.ts (236 lines)
- process/services/openclawConflictDetector.ts (208 lines)
- process/utils/credentialCrypto.ts (109 lines)
- process/utils/safeExec.ts (173 lines)
- process/utils/message.ts (143 lines)
- process/utils/previewUtils.ts (84 lines)
- process/utils/configureConsole.ts (21 lines)

Audit sections 4.3.5 / 4.3.6 / 4.6.4 / 4.6.6 / 4.6.15 / 4.6.18 / 4.6.21 /
6.2 C6 / 8.2."

git rev-parse HEAD > /tmp/n6-c6-sha.txt
```

---

## 阶段 7(C7):删除 process/task/ 目录 + 6 处消费点改造

> 本阶段是全链最复杂一步。**先改消费点,再删文件**,否则 tsc 会红。

### 7.1 UC-F-3 grep 证据(三个级别)

**7.1.1 workerTaskManager 全仓消费点**

```bash
grep -rn "from .*['\"].*task/workerTaskManagerSingleton['\"]\|from .*['\"].*task/WorkerTaskManager['\"]\|from .*['\"].*task/IWorkerTaskManager['\"]" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' \
  2>/dev/null > /tmp/n6-c7-workerTaskManager.grep

cat /tmp/n6-c7-workerTaskManager.grep
```

**预期命中**(6 个消费点):

- `packages/desktop/src/index.ts:32`(C7 改)
- `packages/desktop/src/process/bridge/applicationBridge.ts:10`(C7 改)
- `packages/desktop/src/process/bridge/index.ts:20`(C7 改)
- `packages/desktop/src/process/pet/petConfirmManager.ts:10`(C7 改)
- `packages/desktop/src/process/utils/initBridge.ts:9`(C7 改)
- `packages/desktop/src/process/utils/tray.ts:17`(C7 改)
- task/ 目录内的互相 import(self-reference,随目录删除自然消失)

**7.1.2 IpcAgentEventEmitter / setConfirmHook**

```bash
grep -rn "from .*['\"].*task/IpcAgentEventEmitter['\"]\|IpcAgentEventEmitter\|setConfirmHook" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' \
  2>/dev/null > /tmp/n6-c7-ipcAgentEventEmitter.grep

cat /tmp/n6-c7-ipcAgentEventEmitter.grep
```

**预期**:

- `process/pet/petConfirmManager.ts:11 / 39 / 67 / 80 / 357`(C7 改)
- `process/task/IpcAgentEventEmitter.ts`(self,本 commit 删除)
- `process/task/workerTaskManagerSingleton.ts`(self,本 commit 删除)

**任何其他命中(尤其是 renderer)立即 escalate。**

**7.1.3 task/ 目录内其他文件的外部 import**

```bash
for f in AgentFactory ConversationBusyGuard IAgentEventEmitter IAgentFactory IAgentManager agentTypes; do
  echo "=== $f ===" >> /tmp/n6-c7-internal.grep
  grep -rn "from .*['\"].*task/${f}['\"]" \
    packages/ scripts/ tests/ \
    --include='*.ts' --include='*.tsx' \
    2>/dev/null >> /tmp/n6-c7-internal.grep
done

cat /tmp/n6-c7-internal.grep
```

**预期**:每个文件命中均在 `process/task/` 目录内(self + task/ 互引)。**task/ 外的命中必 escalate**。

### 7.2 修改 `packages/desktop/src/process/pet/petConfirmManager.ts`

**改造目标**:

1. 移除对 task/ 目录的 3 处 import
2. 删除 `setConfirmHook` 的 3 处调用
3. 把 `new IpcAgentEventEmitter().emitConfirmationRemove(...)` 改为 `ipcBridge.conversation.confirmation.remove.emit(...)`
4. 把 `workerTaskManager.getTask(cid)?.confirm(...)` 改为 `await ipcBridge.conversation.confirmation.confirm.invoke(...)`

**Edit 7.2.1 —— 移除 task/ import**

old_string:

```ts
import type { IConfirmation } from '@/common/chat/chatLib';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { setConfirmHook, IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';
import { ProcessConfig } from '@process/utils/initStorage';
```

new_string:

```ts
import type { IConfirmation } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import { ProcessConfig } from '@process/utils/initStorage';
```

**Edit 7.2.2 —— initPetConfirmManager 里删除 setConfirmHook 注册**

old_string:

```ts
export function initPetConfirmManager(bounds: { x: number; y: number; width: number; height: number }): void {
  anchorBounds = bounds;
  unregisterIpcHandlers();
  registerIpcHandlers();
  // Use main-process hook (buildEmitter.on() only works in renderer)
  setConfirmHook({
    onAdd: (conversation_id, data) => {
      showConfirmation({ ...data, conversation_id: conversation_id });
    },
    onUpdate: (conversation_id, data) => {
      updateConfirmation({ ...data, conversation_id: conversation_id });
    },
    onRemove: (conversation_id, confirmationId) => {
      removeConfirmation({ conversation_id: conversation_id, id: confirmationId });
    },
  });
}
```

new_string:

```ts
export function initPetConfirmManager(bounds: { x: number; y: number; width: number; height: number }): void {
  anchorBounds = bounds;
  unregisterIpcHandlers();
  registerIpcHandlers();
}
```

> 注:`setConfirmHook` 的入口 `IpcAgentEventEmitter.emit*()` 从未被实际调用(AgentFactory 未注册任何 creator),所以 hook 删除后无功能回退(见 plan "关键风险与已知坑" R2)。`showConfirmation` / `updateConfirmation` / `removeConfirmation` 函数保留,仍由 `createConfirmWindow` / `ipcMain.on('pet:confirm-respond')` 等本地路径调用。

**Edit 7.2.3 —— destroyPetConfirmManager 里删除 setConfirmHook(null)**

old_string:

```ts
export function destroyPetConfirmManager(): void {
  unregisterIpcHandlers();
  setConfirmHook(null);
  destroyConfirmWindow();
  currentConfirmations.clear();
  anchorBounds = null;
  userPosition = null;
}
```

new_string:

```ts
export function destroyPetConfirmManager(): void {
  unregisterIpcHandlers();
  destroyConfirmWindow();
  currentConfirmations.clear();
  anchorBounds = null;
  userPosition = null;
}
```

**Edit 7.2.4 —— unhookPetConfirm 里删除 setConfirmHook(null)**

old_string:

```ts
export function unhookPetConfirm(): void {
  setConfirmHook(null);
}
```

new_string:

```ts
export function unhookPetConfirm(): void {
  /* confirm hook was removed with process/task/; confirmations now route via
   * WS from backend straight to renderer. This function is retained as a
   * no-op so callers (petManager confirmBubbleEnabled toggle) stay compile-safe. */
}
```

**Edit 7.2.5 —— 替换 IpcAgentEventEmitter 和 workerTaskManager 调用**

old_string(完整 handler block):

```ts
ipcMain.on(
  'pet:confirm-respond',
  (_event, data: { conversation_id: string; msg_id: string; call_id: string; data: any }) => {
    console.log('[PetConfirm] Received response:', JSON.stringify(data));

    // Remove from local tracking
    const confirmation = Array.from(currentConfirmations.values()).find(
      (c) => c.call_id === data.call_id && c.conversation_id === data.conversation_id
    );

    if (confirmation) {
      currentConfirmations.delete(confirmation.id);

      // CRITICAL: Immediately broadcast removal to prevent main renderer from also responding.
      // The main renderer's confirmation UI has keyboard shortcuts that can trigger
      // a second response. Since worker uses pipe.once(call_id), only the first response is
      // processed — if main renderer responds first (e.g., user presses Enter accidentally),
      // the pet window's response (e.g., 'cancel') is ignored.
      // By emitting remove NOW, main renderer removes the confirmation from state before
      // its keyboard handler can fire, ensuring pet window response reaches worker first.
      new IpcAgentEventEmitter().emitConfirmationRemove(data.conversation_id, confirmation.id);
    }

    // Forward response directly to task (main→main, cannot use ipcBridge.invoke)
    const task = workerTaskManager.getTask(data.conversation_id);
    if (task) {
      console.log('[PetConfirm] Calling task.confirm with:', data.msg_id, data.call_id, data.data);
      task.confirm(data.msg_id, data.call_id, data.data);
    } else {
      console.error('[PetConfirm] Task not found for conversation:', data.conversation_id);
    }

    // Close window if no confirmations left
    if (currentConfirmations.size === 0) {
      destroyConfirmWindow();
    }
  }
);
```

new_string:

```ts
ipcMain.on(
  'pet:confirm-respond',
  (_event, data: { conversation_id: string; msg_id: string; call_id: string; data: any }) => {
    console.log('[PetConfirm] Received response:', JSON.stringify(data));

    // Remove from local tracking
    const confirmation = Array.from(currentConfirmations.values()).find(
      (c) => c.call_id === data.call_id && c.conversation_id === data.conversation_id
    );

    if (confirmation) {
      currentConfirmations.delete(confirmation.id);

      // Announce removal on the WS channel so any renderer confirmation UI
      // can drop the entry. NOTE: with the HTTP/WS adapter, emit() is a
      // no-op in the main process (see httpBridge.ts wsEmitter); the
      // authoritative remove event is broadcast by the backend itself when
      // /confirmations/{call_id}/confirm is accepted.
      ipcBridge.conversation.confirmation.remove.emit({
        conversation_id: data.conversation_id,
        id: confirmation.id,
      });
    }

    // Forward response to backend via HTTP (aionui-conversation route)
    ipcBridge.conversation.confirmation.confirm
      .invoke({
        conversation_id: data.conversation_id,
        msg_id: data.msg_id,
        call_id: data.call_id,
        data: data.data,
      })
      .catch((error: unknown) => {
        console.error('[PetConfirm] confirmation.confirm.invoke failed:', error);
      });

    // Close window if no confirmations left
    if (currentConfirmations.size === 0) {
      destroyConfirmWindow();
    }
  }
);
```

> 调用签名验证:见 `packages/desktop/src/common/adapter/ipcBridge.ts:287-293`,`confirmation.confirm` 参数是 `{ conversation_id, msg_id, data, call_id, always_allow? }`。`always_allow` 是 optional,省略即可(adapter 的 mapBody 会 `?? false`)。`confirmation.remove` 是 `wsEmitter<{ conversation_id, id }>` (line 297)。

### 7.3 修改 `packages/desktop/src/process/utils/tray.ts`

**Edit 7.3.1 —— 移除 workerTaskManager import**

old_string:

```ts
import { workerTaskManager } from '../task/workerTaskManagerSingleton';
```

new_string(删除整行,前后空行由 Edit 自动处理;若该行上下有其他 import,用更精确的 old_string,例如包含上一行):

> 建议先读文件 line 15-20 确认上下文,再给出精确 old_string。以下是保守版本:

old_string:

```ts
import { workerTaskManager } from '../task/workerTaskManagerSingleton';
```

new_string:

```ts

```

(即整行删除;若 Edit 不接受空 new_string,改用上一行+该行的组合 old_string,new_string 只保留上一行)

**Edit 7.3.2 —— getRunningTasksCount 硬编码 0**

old_string:

```ts
const getRunningTasksCount = (): number => {
  try {
    return workerTaskManager.listTasks().length;
  } catch {
    return 0;
  }
};
```

new_string:

```ts
// Backend-managed task count is not yet exposed via HTTP; hardcode 0 until
// GET /api/conversations/active-count lands (see audit section 4.9.4).
const getRunningTasksCount = (): number => 0;
```

### 7.4 修改 `packages/desktop/src/process/bridge/applicationBridge.ts`

**Edit 7.4.1 —— 移除 IWorkerTaskManager import**

old_string:

```ts
import { ipcBridge } from '@/common';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { ProcessConfig } from '@process/utils/initStorage';
```

new_string:

```ts
import { ipcBridge } from '@/common';
import { ProcessConfig } from '@process/utils/initStorage';
```

**Edit 7.4.2 —— 去掉 initApplicationBridge 的 workerTaskManager 形参和使用**

old_string:

```ts
export function initApplicationBridge(workerTaskManager: IWorkerTaskManager): void {
  // Platform-agnostic handlers: systemInfo, updateSystemInfo, getPath
  initApplicationBridgeCore();

  ipcBridge.application.restart.provider(async () => {
    // 清理所有工作进程，等待子进程退出
    await workerTaskManager.clear();
    // 重启应用 - 使用标准的 Electron 重启方式
    app.relaunch();
    app.exit(0);
  });
```

new_string:

```ts
export function initApplicationBridge(): void {
  // Platform-agnostic handlers: systemInfo, updateSystemInfo, getPath
  initApplicationBridgeCore();

  ipcBridge.application.restart.provider(async () => {
    // Backend subprocess shutdown is handled by backendManager.stop() in the
    // main window's before-quit hook; agent children are killed transitively
    // when backend exits.
    app.relaunch();
    app.exit(0);
  });
```

### 7.5 修改 `packages/desktop/src/process/bridge/index.ts`

**Edit 7.5.1 —— 移除 IWorkerTaskManager import**

old_string:

```ts
import { initWebuiBridge } from './webuiBridge';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export interface BridgeDependencies {
  workerTaskManager: IWorkerTaskManager;
}

export function initAllBridges(deps: BridgeDependencies): void {
  initDialogBridge();
  initApplicationBridge(deps.workerTaskManager);
```

new_string:

```ts
import { initWebuiBridge } from './webuiBridge';

export type BridgeDependencies = Record<string, never>;

export function initAllBridges(_deps: BridgeDependencies = {}): void {
  initDialogBridge();
  initApplicationBridge();
```

> 注:`BridgeDependencies` 保留为空对象类型以兼容现有调用方(`initBridge.ts` / `web-host`),参数改为可选 default,让 executor 在 initBridge.ts 中可以直接 `initAllBridges()` 不传参。`_deps` 下划线前缀避免 oxlint 的 `no-unused-vars` 报错(参考 AGENTS.md "Unused params")。

### 7.6 修改 `packages/desktop/src/process/utils/initBridge.ts`

**Edit 7.6.1 —— 彻底删除 workerTaskManager wiring**

old_string:

```ts
import { logger } from '@office-ai/platform';
import { initAllBridges } from '../bridge';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';

logger.config({ print: true });

initAllBridges({
  workerTaskManager,
});
```

new_string:

```ts
import { logger } from '@office-ai/platform';
import { initAllBridges } from '../bridge';

logger.config({ print: true });

initAllBridges();
```

### 7.7 修改 `packages/desktop/src/index.ts`

**Edit 7.7.1 —— 删除 workerTaskManager import**

old_string:

```ts
import { setInitialLanguage } from '@process/services/i18n';
import { workerTaskManager } from './process/task/workerTaskManagerSingleton';
import { setupApplicationMenu } from './process/utils/appMenu';
```

new_string:

```ts
import { setInitialLanguage } from '@process/services/i18n';
import { setupApplicationMenu } from './process/utils/appMenu';
```

**Edit 7.7.2 —— 删除 .clear() 调用**

old_string:

```ts
// Stop aionui-backend subprocess
await backendManager.stop().catch((err) => console.error('[App] Failed to stop backend:', err));

// Kill all agent worker processes
await workerTaskManager.clear();

// Destroy desktop pet windows
```

new_string:

```ts
// Stop aionui-backend subprocess — backend shutdown kills all agent
// children transitively (no separate frontend workerTaskManager remains)
await backendManager.stop().catch((err) => console.error('[App] Failed to stop backend:', err));

// Destroy desktop pet windows
```

### 7.8 在消费点改造完成后,删除 process/task/ 目录的 10 个文件

```bash
git rm packages/desktop/src/process/task/AgentFactory.ts
git rm packages/desktop/src/process/task/ConversationBusyGuard.ts
git rm packages/desktop/src/process/task/IAgentEventEmitter.ts
git rm packages/desktop/src/process/task/IAgentFactory.ts
git rm packages/desktop/src/process/task/IAgentManager.ts
git rm packages/desktop/src/process/task/IpcAgentEventEmitter.ts
git rm packages/desktop/src/process/task/IWorkerTaskManager.ts
git rm packages/desktop/src/process/task/WorkerTaskManager.ts
git rm packages/desktop/src/process/task/agentTypes.ts
git rm packages/desktop/src/process/task/workerTaskManagerSingleton.ts
```

验证目录彻底空:

```bash
find packages/desktop/src/process/task -type f 2>/dev/null
```

预期:无输出。git 不跟踪空目录,commit 后目录自动消失。

### 7.9 petManager.ts 兜底 grep(audit §4.9.3 #7)

```bash
grep -n "workerTaskManager\|IpcAgentEventEmitter" \
  packages/desktop/src/process/pet/petManager.ts
```

预期:无输出(petManager 本身不直接引用这两者,但必须 grep 兜底。若命中,用 Edit 移除对应 import 和调用,然后重跑 tsc)。

### 7.10 验证 C7

```bash
bunx tsc --noEmit 2>&1 | tail -30
echo "tsc exit: $?"

bun run lint 2>&1 | tail -20
echo "lint exit: $?"
```

预期:退出 0。

### 7.11 业务功能自动化验证:pet confirmation 路径冒烟

因 pet confirmation 路径改造最 invasive,写一段 node 脚本自动化冒烟(不需要真实窗口,只验证 ipcBridge 接口签名):

```bash
cat > /tmp/n6-c7-smoke.ts <<'EOF'
// Type-level smoke test: verify the new ipcBridge.confirmation.confirm signature
// matches what petConfirmManager passes. If the adapter types drift, this
// file fails tsc.
import { ipcBridge } from '@/common';

async function _smoke() {
  // Must compile: all positional fields present.
  await ipcBridge.conversation.confirmation.confirm.invoke({
    conversation_id: 'c1',
    msg_id: 'm1',
    call_id: 'cc1',
    data: { choice: 'approve' },
  });

  ipcBridge.conversation.confirmation.remove.emit({
    conversation_id: 'c1',
    id: 'i1',
  });
}
EOF

cp /tmp/n6-c7-smoke.ts packages/desktop/src/_n6_smoke.ts
bunx tsc --noEmit 2>&1 | grep -E '_n6_smoke|confirmation' | head -20
echo "tsc exit: $?"
rm packages/desktop/src/_n6_smoke.ts
```

预期:`tsc exit: 0`,grep 无 `error` 字样输出。脚本仅作为类型契约冒烟,**执行完毕必须删除**(上面 rm 命令)。

若 tsc 报错,说明 adapter 签名与改造不符 —— 重新对照 `ipcBridge.ts:287-297` 修正 `petConfirmManager.ts` 的 `.invoke({...})` 字段,再重跑。

### 7.12 Commit C7

```bash
git add -A
git status   # 确认只触动本阶段目标文件

git commit -m "refactor(n6/process): remove process/task/ directory and rewire consumers

The AgentFactory/WorkerTaskManager layer is fully dead: no creators were
ever registered, so listTasks() always returns []. All four live consumers
have equivalent replacements:

- src/index.ts :787 .clear() call — redundant: backendManager.stop() kills
  agent subprocesses transitively
- process/bridge/applicationBridge.ts :103 .clear() call — same rationale
- process/utils/tray.ts :71 listTasks().length — hardcoded 0 (active-count
  HTTP route deferred, see audit section 4.9.4)
- process/pet/petConfirmManager.ts :361 workerTaskManager.getTask(...).confirm(...)
  — replaced with ipcBridge.conversation.confirmation.confirm.invoke(...)

The main-process setConfirmHook/ConfirmHook pathway was dead code
(IpcAgentEventEmitter.emit*() never called) and is removed with the
directory.

- process/task/*.ts (10 files, ~600 lines)
- process/bridge/index.ts: drop BridgeDependencies.workerTaskManager field
- process/bridge/applicationBridge.ts: drop IWorkerTaskManager param
- process/utils/initBridge.ts: drop workerTaskManager wiring
- process/utils/tray.ts: getRunningTasksCount → 0
- process/pet/petConfirmManager.ts: HTTP invoke for confirm, WS emit for remove
- src/index.ts: drop workerTaskManager.clear() call

Audit sections 4.9 / 6.2 C7."

git rev-parse HEAD > /tmp/n6-c7-sha.txt
```

### 7.13 失败诊断

- tsc `Cannot find module '@process/task/...'` → 某处 import 漏删,按模块名 grep `packages/desktop/src` 补。
- tsc `Property 'workerTaskManager' does not exist on type 'BridgeDependencies'` → Edit 7.5.1 没生效,重读 `bridge/index.ts`。
- tsc `Expected 1 arguments, but got 0` 指向 `initApplicationBridge` → Edit 7.5.1 移除形参后 `bridge/index.ts` 里 `initApplicationBridge(deps.workerTaskManager)` 没同步改。
- tsc 指向 `ipcBridge.conversation.confirmation.confirm.invoke` 签名错 → 对照 `ipcBridge.ts:287-293` 确认字段。
- lint `'_deps' is defined but never used` → oxlint rule 放宽 `^_` 前缀;如仍报错,把 `_deps: BridgeDependencies = {}` 写法改成不接收参数:`initAllBridges(): void { ... }` + 更新 initBridge.ts 的调用(`initAllBridges()`)。

---

## 阶段 8(C8):systemSettingsBridge + applicationBridgeCore 瘦身

### 8.1 修改 `packages/desktop/src/process/bridge/systemSettingsBridge.ts`

删除 11 处 HTTP no-op `.provider()` 注册块。**Edit 逐块进行,保留注释上下文**。

**Edit 8.1.1 —— getCloseToTray + setCloseToTray(包括本地副作用 block)**

old_string:

```ts
export function initSystemSettingsBridge(): void {
  // 获取"关闭到托盘"设置 / Get "close to tray" setting
  ipcBridge.systemSettings.getCloseToTray.provider(async () => {
    const value = await ProcessConfig.get('system.closeToTray');
    return value ?? false;
  });

  // 设置"关闭到托盘"，先持久化再通知主进程
  // Set "close to tray", persist first then notify main process
  ipcBridge.systemSettings.setCloseToTray.provider(async ({ enabled }) => {
    // 先持久化到配置存储
    await ProcessConfig.set('system.closeToTray', enabled);
    // 然后通知主进程更新托盘状态
    _changeListener?.(enabled);
  });

  // 获取"任务完成通知"设置 / Get "task completion notification" setting
```

new_string:

```ts
export function initSystemSettingsBridge(): void {
  // 获取"任务完成通知"设置 / Get "task completion notification" setting
```

> 注:`onCloseToTrayChanged` / `_changeListener` 定义保留(`src/index.ts:628` 仍在 import);本 commit 不改 `src/index.ts`。见 plan "R4"。

**Edit 8.1.2 —— getNotificationEnabled + setNotificationEnabled**

old_string:

```ts
// 获取"任务完成通知"设置 / Get "task completion notification" setting
ipcBridge.systemSettings.getNotificationEnabled.provider(async () => {
  const value = await ProcessConfig.get('system.notificationEnabled');
  return value ?? true; // 默认开启 / Default enabled
});

// 设置"任务完成通知" / Set "task completion notification"
ipcBridge.systemSettings.setNotificationEnabled.provider(async ({ enabled }) => {
  // 先持久化到配置存储
  await ProcessConfig.set('system.notificationEnabled', enabled);
});

// 获取"定时任务通知"设置 / Get "scheduled task notification" setting
```

new_string:

```ts
// 获取"定时任务通知"设置 / Get "scheduled task notification" setting
```

**Edit 8.1.3 —— getCronNotificationEnabled + setCronNotificationEnabled**

old_string:

```ts
// 获取"定时任务通知"设置 / Get "scheduled task notification" setting
ipcBridge.systemSettings.getCronNotificationEnabled.provider(async () => {
  const value = await ProcessConfig.get('system.cronNotificationEnabled');
  return value ?? false; // 默认关闭 / Default disabled
});

// 设置"定时任务通知" / Set "scheduled task notification"
ipcBridge.systemSettings.setCronNotificationEnabled.provider(async ({ enabled }) => {
  // 先持久化到配置存储
  await ProcessConfig.set('system.cronNotificationEnabled', enabled);
});

// Get "keep awake" setting
```

new_string:

```ts
// Get "keep awake" setting
```

**Edit 8.1.4 —— getKeepAwake(getter 部分)**

old_string:

```ts
  // Get "keep awake" setting
  ipcBridge.systemSettings.getKeepAwake.provider(async () => {
    const value = await ProcessConfig.get('system.keepAwake');
    return value ?? false;
  });

  // Set "keep awake" — toggle prevent-display-sleep blocker
  ipcBridge.systemSettings.setKeepAwake.provider(async ({ enabled }) => {
```

new_string:

```ts
  // Set "keep awake" — toggle prevent-display-sleep blocker.
  // getKeepAwake is served by the backend via HTTP; only the setter remains
  // because it drives the local power.preventDisplaySleep blocker.
  ipcBridge.systemSettings.setKeepAwake.provider(async ({ enabled }) => {
```

**Edit 8.1.5 —— getSaveUploadToWorkspace + setSaveUploadToWorkspace**

old_string:

```ts
// 获取"上传文件保存到工作区"设置 / Get "save uploads to workspace" setting
ipcBridge.systemSettings.getSaveUploadToWorkspace.provider(async () => {
  const value = await ProcessConfig.get('upload.saveToWorkspace');
  return value ?? true; // 默认开启 / Default enabled
});

// 设置"上传文件保存到工作区" / Set "save uploads to workspace"
ipcBridge.systemSettings.setSaveUploadToWorkspace.provider(async ({ enabled }) => {
  await ProcessConfig.set('upload.saveToWorkspace', enabled);
});

// 获取"自动预览新建 Office 文件"设置 / Get "auto preview new Office files" setting
```

new_string:

```ts
// 获取"自动预览新建 Office 文件"设置 / Get "auto preview new Office files" setting
```

**Edit 8.1.6 —— getAutoPreviewOfficeFiles + setAutoPreviewOfficeFiles**

old_string:

```ts
// 获取"自动预览新建 Office 文件"设置 / Get "auto preview new Office files" setting
ipcBridge.systemSettings.getAutoPreviewOfficeFiles.provider(async () => {
  const value = await ProcessConfig.get('system.autoPreviewOfficeFiles');
  return value ?? true; // 默认开启 / Default enabled
});

// 设置"自动预览新建 Office 文件" / Set "auto preview new Office files"
ipcBridge.systemSettings.setAutoPreviewOfficeFiles.provider(async ({ enabled }) => {
  await ProcessConfig.set('system.autoPreviewOfficeFiles', enabled);
});

// Desktop pet settings
```

new_string:

```ts
// Desktop pet settings
```

### 8.2 修改 `packages/desktop/src/process/bridge/applicationBridgeCore.ts`

**Edit 8.2.1 —— 删除 systemInfo.provider block**

old_string:

```ts
export function initApplicationBridgeCore(): void {
  ipcBridge.application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });

  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
```

new_string:

```ts
export function initApplicationBridgeCore(): void {
  // application.systemInfo is served by the backend via HTTP; updateSystemInfo
  // and getPath below remain buildProvider (true IPC) because they need
  // main-process-only APIs (copyDirectoryRecursively, os.homedir()).
  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
```

### 8.3 UC-F 验证:确认 getSystemDir 仍有消费者

`systemInfo.provider` 被删后,`getSystemDir` 只剩 `updateSystemInfo.provider` 内部调用。验证无死代码:

```bash
grep -rn "getSystemDir\b" packages/desktop/src --include='*.ts' 2>/dev/null
```

预期:至少命中 `applicationBridgeCore.ts`(`updateSystemInfo` 使用)+ `utils/initStorage.ts`(定义点)+ 其他业务文件。**如果所有业务消费者都删了**(不应发生),escalate。

### 8.4 验证 C8

```bash
bunx tsc --noEmit 2>&1 | tail -20
echo "tsc exit: $?"

bun run lint 2>&1 | tail -10
echo "lint exit: $?"
```

预期:退出 0。

### 8.5 Commit C8

```bash
git add -A
git commit -m "refactor(n6/process): trim HTTP no-op provider blocks in system settings and app core

Eleven .provider() registrations in systemSettingsBridge route to HTTP via
the adapter (getCloseToTray / setCloseToTray / getNotificationEnabled /
setNotificationEnabled / getCronNotificationEnabled /
setCronNotificationEnabled / getKeepAwake getter / getSaveUploadToWorkspace /
setSaveUploadToWorkspace / getAutoPreviewOfficeFiles /
setAutoPreviewOfficeFiles) — all no-ops at runtime. Same for
applicationBridgeCore.systemInfo.

Kept:
- setKeepAwake.provider — drives local power.preventDisplaySleep blocker
- changeLanguage.provider — main-process i18n broadcast + listener
- 8 pet buildProvider entries — true IPC for windowed pet state
- updateSystemInfo.provider / getPath.provider — main-process-only APIs

Audit sections 7.4 / 7.5 / 6.2 C8."

git rev-parse HEAD > /tmp/n6-c8-sha.txt
```

---

## 阶段 9(C9):搬迁 `process/agent/remote/types.ts` → `common/types/remoteAgentTypes.ts`

### 9.1 UC-F-3 grep 证据

```bash
grep -rn "@process/agent/remote/types\|process/agent/remote/types" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  2>/dev/null > /tmp/n6-c9.grep

cat /tmp/n6-c9.grep
```

**预期命中**(6 处):

- `packages/desktop/src/renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx:8`
- `packages/desktop/src/common/adapter/ipcBridge.ts:818`
- `packages/desktop/src/common/adapter/ipcBridge.ts:819`
- `packages/desktop/src/common/adapter/ipcBridge.ts:823`
- `packages/desktop/src/common/adapter/ipcBridge.ts:824`
- `packages/desktop/src/common/adapter/ipcBridge.ts:826`

audit §5.3 / §7.3 说 5 处;实际 6 处(tsx + 5 ipcBridge)。**按实际 6 处 替换**。

### 9.2 创建新文件 `packages/desktop/src/common/types/remoteAgentTypes.ts`

用 Write 工具,内容与 `process/agent/remote/types.ts` 一字不差(保留 license header 和 canonical 注释):

```ts
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical definitions live in common/types/detectedAgent.ts
import type { RemoteAgentProtocol, RemoteAgentAuthType } from '@/common/types/detectedAgent';
export type { RemoteAgentProtocol, RemoteAgentAuthType } from '@/common/types/detectedAgent';

/** Last known connection status (cached for UI display) */
export type RemoteAgentStatus = 'unknown' | 'connected' | 'pending' | 'error';

/** Remote Agent instance configuration (corresponds to remote_agents DB table) */
export type RemoteAgentConfig = {
  id: string;
  name: string;
  protocol: RemoteAgentProtocol;
  url: string;
  auth_type: RemoteAgentAuthType;
  auth_token?: string;
  /** Skip TLS certificate verification (for self-signed certificates) */
  allow_insecure?: boolean;
  avatar?: string;
  description?: string;
  /** Ed25519 public key SHA256 fingerprint (OpenClaw protocol only, per-agent) */
  device_id?: string;
  /** Ed25519 public key PEM (OpenClaw protocol only) */
  device_public_key?: string;
  /** Ed25519 private key PEM (OpenClaw protocol only) */
  device_private_key?: string;
  /** Device token issued by Gateway after hello-ok (OpenClaw protocol only) */
  device_token?: string;
  status?: RemoteAgentStatus;
  last_connected_at?: number;
  created_at: number;
  updated_at: number;
};

/** Parameters for creating/updating a remote agent config */
export type RemoteAgentInput = {
  name: string;
  protocol: RemoteAgentProtocol;
  url: string;
  auth_type: RemoteAgentAuthType;
  auth_token?: string;
  /** Skip TLS certificate verification (for self-signed certificates) */
  allow_insecure?: boolean;
  avatar?: string;
  description?: string;
};
```

### 9.3 更新 6 处 import

**Edit 9.3.1 —— RemoteAgentManagement.tsx line 8**

old_string:

```tsx
import type { RemoteAgentConfig, RemoteAgentInput } from '@process/agent/remote/types';
```

new_string:

```tsx
import type { RemoteAgentConfig, RemoteAgentInput } from '@/common/types/remoteAgentTypes';
```

**Edit 9.3.2 —— ipcBridge.ts 5 处 inline import**

先 Read `packages/desktop/src/common/adapter/ipcBridge.ts` line 815-830 获取精确上下文,然后:

old_string(完整 block,5 处 import 在一起):

```ts
  list: httpGet<import('@process/agent/remote/types').RemoteAgentConfig[], void>('/api/remote-agents'),
  get: httpGet<import('@process/agent/remote/types').RemoteAgentConfig | null, { id: string }>(
```

new_string:

```ts
  list: httpGet<import('@/common/types/remoteAgentTypes').RemoteAgentConfig[], void>('/api/remote-agents'),
  get: httpGet<import('@/common/types/remoteAgentTypes').RemoteAgentConfig | null, { id: string }>(
```

然后 Edit 9.3.3 处理第 3 / 4 处:

old_string:

```ts
(import('@process/agent/remote/types').RemoteAgentConfig, import('@process/agent/remote/types').RemoteAgentInput);
```

new_string:

```ts
(import('@/common/types/remoteAgentTypes').RemoteAgentConfig,
  import('@/common/types/remoteAgentTypes').RemoteAgentInput);
```

Edit 9.3.4 处理第 5 处:

old_string:

```ts
  update: httpPut<boolean, { id: string; updates: Partial<import('@process/agent/remote/types').RemoteAgentInput> }>(
```

new_string:

```ts
  update: httpPut<boolean, { id: string; updates: Partial<import('@/common/types/remoteAgentTypes').RemoteAgentInput> }>(
```

> 如果 5 处位置在未来版本差异,建议 executor 一次性用 Edit 的 `replace_all: true` 做字符串替换("@process/agent/remote/types" → "@/common/types/remoteAgentTypes")并手动验证每处都合理。

### 9.4 删除旧文件和目录

```bash
git rm packages/desktop/src/process/agent/remote/types.ts

# 检查 remote/ 目录是否空
find packages/desktop/src/process/agent/remote -type f 2>/dev/null
# 应无输出

# 检查 agent/ 目录是否空
find packages/desktop/src/process/agent -type f 2>/dev/null
# 应无输出

# git 不跟踪空目录,但在 macOS 下可能有 .DS_Store,需要清理
find packages/desktop/src/process/agent -name '.DS_Store' -delete 2>/dev/null

# 最终清理空目录(git 不跟踪,但本地文件系统保留会影响 IDE 观感)
rmdir packages/desktop/src/process/agent/remote 2>/dev/null
rmdir packages/desktop/src/process/agent 2>/dev/null
```

### 9.5 UC-F 补充 grep:确认无残留 `@process/agent`

```bash
grep -rn "@process/agent" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml' \
  2>/dev/null
```

预期:无输出(所有 6 处已替换)。如果有命中,按命中位置补 Edit。

### 9.6 验证 C9

```bash
bunx tsc --noEmit 2>&1 | tail -20
echo "tsc exit: $?"

bun run lint 2>&1 | tail -10
echo "lint exit: $?"
```

预期:退出 0。

### 9.7 Commit C9

```bash
git add -A
git status

git commit -m "refactor(n6/common): move remote agent types from process/ to common/

RemoteAgentConfig / RemoteAgentInput are consumed by both the renderer
(RemoteAgentManagement.tsx) and the adapter (ipcBridge.ts type imports),
so the canonical home is common/types/ rather than process/. With the
move, process/agent/ becomes empty and is removed.

- Add: common/types/remoteAgentTypes.ts (51 lines, identical content)
- Delete: process/agent/remote/types.ts
- Delete: empty directories process/agent/remote/, process/agent/
- Update 6 import sites (1 tsx + 5 inline type imports in ipcBridge.ts)

Audit sections 4.7.1 / 7.3 / 6.2 C9."

git rev-parse HEAD > /tmp/n6-c9-sha.txt
```

---

## 阶段 10:全量验证 + 同步基线 + push + handoff + SendMessage

### 10.1 全量验证

```bash
bunx tsc --noEmit 2>&1 | tee /tmp/n6-final-tsc.log | tail -20
echo "tsc exit: $?" | tee -a /tmp/n6-final-tsc.log

bun run lint 2>&1 | tee /tmp/n6-final-lint.log | tail -20
echo "lint exit: $?" | tee -a /tmp/n6-final-lint.log

bunx vitest run --reporter=default 2>&1 | tee /tmp/n6-final-vitest.log | tail -30
echo "vitest exit: $?" | tee -a /tmp/n6-final-vitest.log

prek run --from-ref origin/main --to-ref HEAD 2>&1 | tee /tmp/n6-final-prek.log | tail -30
echo "prek exit: $?" | tee -a /tmp/n6-final-prek.log
```

预期:四个全退出 0。

**如果 vitest 失败**:检查失败测试是否涉及已删除的 process/ 文件。本次 N6 不删除测试,若 legacy test 引用删除的 source(例如 `process/task/WorkerTaskManager.test.ts`,但该目录下无测试目前),需要:

- 先确认测试现状:`find tests -name '*.test.ts' | xargs grep -l 'workerTaskManager\|initAgent\|ccSwitchModelSource\|shellBridge\|authBridge'` 2>/dev/null
- **如有命中**:escalate(这属于 N2 legacy test cleanup 范畴,不由 N6 处理;team-lead 决策是否需要补 commit)

**如果 prek 失败**:查 prek 报告,通常是 trailing whitespace / end-of-file 之类,按照 cheatsheet 用 `bun run format` / 手工补换行修复。

### 10.2 Pet confirmation 端到端冒烟(业务功能自动化验证)

> 这是 C7 改造最关键的人机验证。如果主进程无法被无头驱动,退一步使用类型级冒烟(已在 C7 步骤 7.11 执行)+ 源码路径对账。

**路径对账自动化检查**:

```bash
# 1. 确认 petConfirmManager 不再引用 task/
grep -n "workerTaskManager\|IpcAgentEventEmitter\|setConfirmHook" \
  packages/desktop/src/process/pet/petConfirmManager.ts
# 预期:无输出

# 2. 确认 petConfirmManager 使用 ipcBridge.conversation.confirmation.*
grep -n "ipcBridge.conversation.confirmation" \
  packages/desktop/src/process/pet/petConfirmManager.ts
# 预期:至少 2 行命中(remove.emit + confirm.invoke)

# 3. 类型签名对齐 ipcBridge.ts:287-297
grep -n "confirmation:" packages/desktop/src/common/adapter/ipcBridge.ts
# 预期:找到 "confirmation: {" block,确认 confirm / remove 签名与 petConfirmManager 一致

# 4. 整个 task/ 目录彻底消失
find packages/desktop/src/process/task -type f 2>/dev/null
# 预期:无输出

# 5. process/agent/ 目录彻底消失
find packages/desktop/src/process/agent -type f 2>/dev/null
# 预期:无输出
```

预期:五条全部通过(1 / 4 / 5 无输出,2 / 3 有命中)。

### 10.3 基线快照对比

```bash
# 文件数变化
find packages/desktop/src/process -type f -name '*.ts' | wc -l > /tmp/n6-final-file-count.txt
echo "baseline:" && cat /tmp/n6-baseline/process-file-count.txt
echo "final:" && cat /tmp/n6-final-file-count.txt
```

预期:final 比 baseline 少 32 左右(本次删 32 .ts 文件,加 1 新 .ts → 净 -31)。

```bash
# DELETE commit 数量
git log --oneline origin/main..HEAD | wc -l
```

预期:9(C1..C9)+ 之前的 main 上 commit。若只看 N6,用 baseline HEAD 对齐:

```bash
git log --oneline 9998c1593..HEAD | wc -l
# 预期:9
```

### 10.4 同步基线(merge `origin/main`,不 rebase)

```bash
git fetch origin main
git log --oneline HEAD..origin/main | head -10
```

- 如无输出 → 基线无变化,跳到 10.5
- 如有 commit → merge:

```bash
git merge origin/main --no-ff -m "chore(n6): sync with main"
```

冲突处理(参考 cheatsheet):

- 无冲突 → 直接继续
- 简单冲突(不同文件)→ 手动解决,`git add ... && git commit`
- 复杂冲突(同文件同段)→ **不硬改**,escalate

合并后重跑 10.1 四条验证命令。若引入新失败 → escalate。

### 10.5 push 分支(不创建 PR)

```bash
git rev-parse HEAD > /tmp/n6-final-sha.txt
cat /tmp/n6-final-sha.txt

git push origin cleanup/audit-backend-migrated-dead-code
```

预期:push 成功。**禁止** `git push --force` / `--force-with-lease`(分支是 team-lead 决策的可持续分支)。

### 10.6 写 handoff

路径:`docs/backend-migration/handoffs/N6-outcome.md`(≤ 700 字;命令输出按头 10 + 尾 10 + 总行数截断)。

模板:

```markdown
# N6 frontend-dead-code-cleanup - 交付摘要

## 已交付

- 9 个 commit 追加到 `cleanup/audit-backend-migrated-dead-code`
  - C1..C9 SHA: <从 /tmp/n6-c{1..9}-sha.txt 填>
- 删除 32 源文件 + 1 文件 MOVE + 10 个 MODIFY 点(详情见 plan 阶段 0 文件清单)
- 净减 ~3579 行(DELETE)+ ~93 行(C8 瘦身)+ 0 行(C9 MOVE)

## 与计划的偏离

- <如无偏离写"无">
- <逐条列出:偏离点 — 原因 — 对后续影响>

## 给下一个里程碑的提醒

- `process/agent/` / `process/task/` 目录已消失,C7 之后 backend 需要补 `GET /api/conversations/active-count` 以替代 tray 硬编码 0(audit §4.9.4)
- `systemSettingsBridge` 的 `_changeListener` / `onCloseToTrayChanged` 已是死链(C8 瘦身后),`src/index.ts:628` 的调用链等待后续整改
- `common/types/` 目录现有 19 个文件,超过 AGENTS.md 的 10 个硬上限,需按领域拆子目录

## 验证证据(UC-F-1)

- 分支:`cleanup/audit-backend-migrated-dead-code`
- 基线 HEAD SHA:`9998c1593bc179383ca1c746fe7a9f22d4309cde`
- 最终 HEAD SHA:<从 /tmp/n6-final-sha.txt 填>
- 基线同步状态:<如有 merge commit 填 SHA;否则填"无需同步,上游无新 commit">

### tsc

`$ bunx tsc --noEmit`
<头 10 行 /tmp/n6-final-tsc.log>
...
<尾 10 行 /tmp/n6-final-tsc.log>
总行数:<wc -l> 退出码:0

### lint

`$ bun run lint`
...(同上)

### vitest

`$ bunx vitest run`
...

### prek

`$ prek run --from-ref origin/main --to-ref HEAD`
...

### Pet confirmation 路径对账

(阶段 10.2 五条命令输出)

## Backend 修改(UC-G)

无。本里程碑未触碰 aionui-backend(active-count 路由延后作为 future-work)。

## Backend 问题发现(UC-G escalate)

无新发现。审计 §4.9.2 #4 记录的"tray 硬编码 0"是已知短期方案,非本次 bug 发现。

## 遗留问题 / 跟进项

- R1:`petConfirmManager.ts` 里 `ipcBridge.confirmation.remove.emit(...)` 是主进程 wsEmitter no-op,backend 自身的 remove event 会覆盖此 UI 同步。Pre-existing bug,不在 N6 scope。
- R2:`petConfirmManager` 原先的 `setConfirmHook` 路径从未触发(IpcAgentEventEmitter 无 emit 点),删除无回退。
- R3:`common/types/` 19 个文件超 AGENTS.md 限制。
- R4:`systemSettingsBridge.ts` 的 `_changeListener` / `onCloseToTrayChanged` 死链(`src/index.ts:628` 的调用永不触发),建议未来整改。
- active-count HTTP 路由待后端补。
- 本里程碑未触发 CI run,统一由 team-lead 在整链合入 dev 时验证。
```

### 10.7 SendMessage 给 team-lead

```
SendMessage({
  to: "team-lead",
  message: "N6 完成。
  - 分支:cleanup/audit-backend-migrated-dead-code(已 push)
  - 9 个 commit 已追加,SHA 详情见 handoff
  - 基线 HEAD:9998c1593 → 最终 HEAD:<从 /tmp/n6-final-sha.txt>
  - 净减 ~3579 行(DELETE)+ ~93 行(C8 瘦身)
  - Handoff:docs/backend-migration/handoffs/N6-outcome.md
  - UC-F 证据:贴命令输出 ✓ / grep 证据 9 份 ✓ / 无 skip ✓ / 基线同步 ✓
  - 偏离计划:<无 / 列出>
  - 遗留:1 个 pre-existing bug(wsEmitter.emit no-op,见 handoff R1)+ 3 个整改项
  请验收。"
})
```

若非 team 模式,在会话末尾打印相同 message 即可。

---

## 回滚指令

### 回滚档位 A:本地未 push

某个 commit 发现问题,本地未 push:

```bash
# 回到基线
git reset --hard 9998c1593bc179383ca1c746fe7a9f22d4309cde

# 或只撤销最后一次 commit(保留工作区变更)
git reset --soft HEAD~1

# 或按 commit 顺序反向执行(保留中间历史)
git revert HEAD   # 只回滚最后一个 commit
```

### 回滚档位 B:已 push 但下游未使用

某个 commit 已 push,但 team-lead / executor 尚未基于这个分支继续工作:

```bash
# 在本分支做 revert commit(不用 reset + force-push)
git revert <bad-sha>
git push origin cleanup/audit-backend-migrated-dead-code
```

**禁止** `git push --force` —— 分支是 team-lead 管控的可持续分支,force-push 会抹掉记录。

### 回滚档位 C:已 push 且下游已使用

发现方向性问题(如审计结论出错)无法用 revert 修复,需要重做整个 N6:

1. 不自主决策。
2. SendMessage 给 team-lead,列具体问题和已尝试的修复。
3. 由 team-lead 决定是重做 N6 还是接受现状并在 N7 补修。

---

## 常见踩坑

### P1:Edit 的 old_string 无法唯一匹配

如果 old_string 在文件中出现多次,Edit 会报错。对策:把 old_string 扩大到包含足够上下文(多取 1-2 行),或用 `replace_all: true` 配合极度精确的短字符串。

### P2:oxlint 对 `_` 前缀变量的处理

按 `.oxlintrc.json` 的 `no-unused-vars`,以 `_` 开头的变量被忽略。C7 `BridgeDependencies` 改造用了 `_deps: ... = {}` 形参,应该 OK;若 lint 仍报,改为无参签名 + 同步改 `initBridge.ts` 的调用。

### P3:prek 报 `end-of-file-fixer` 或 `trailing-whitespace`

本计划的 Edit 模板都保留尾换行;若 prek 仍报错,用:

```bash
bun run format   # oxfmt 会修复大部分 whitespace/eof
# 然后重跑 prek
```

### P4:macOS 系统目录里 `.DS_Store`

`git rm` / `rmdir` 不处理 `.DS_Store`。C9 的 `process/agent/` 目录清理已包含 `find ... -name '.DS_Store' -delete`;**不要**把此操作扩大到整仓(会误删其他目录已被 .gitignore 的 `.DS_Store`)。

### P5:vitest fake timers 与微任务

本计划不写新测试,无此风险。但若 executor 本地 `bunx vitest run` 失败涉及 fake timers,按 MEMORY.md "Writing tests: think first" 的建议排查;本次 scope 内不修复,escalate。

### P6:审计文档与 teammate cheatsheet UC-B 的矛盾

audit §4.3.5 / §4.6.18 / §8.4 明确推翻了 cheatsheet UC-B 对 `ccSwitchModelSource.ts` 和 `previewUtils.ts` 的"保留"结论。本 plan 按 audit 处理(已在"用户已确认的关键决策 #3"锁定)。如 executor 对此有疑问,**不自主决策**,先读 audit §8.4 的 grep 证据。

### P7:"`setCloseToTray.provider` 的本地副作用已失效"是 pre-existing bug

不要尝试在 C8 修复这条链路(`src/index.ts:628` 调 `onCloseToTrayChanged`,但从无触发者)。这超出 N6 的 "清理而非重构" 范围。仅在 handoff R4 记录。

---

## 上游 handoff 字段映射(本里程碑无上游依赖,留作占位)

N6 直接在 `cleanup/audit-backend-migrated-dead-code` 分支上工作,不继承其他 N 系列 milestone handoff。基线参考文件是:

- `docs/backend-migration/plans/2026-05-12-frontend-dead-code-audit.md`(战略)
- `docs/backend-migration/plans/2026-05-08-cleanup-teammate-cheatsheet.md`(硬约束)

**不读**其他 N{x} 的 requirements / handoff(独立历史链)。

---

**文档结束。plan-writer-n6 已完成,等待 team-lead 下派 executor-n6。**
