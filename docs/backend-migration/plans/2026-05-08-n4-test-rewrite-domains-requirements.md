# N4 领域层测试重写 - 需求文档

- **日期**:2026-05-08
- **里程碑**:N4
- **上游**:`origin/feat/n3-test-rewrite-adapter-common`(N3 产物,含 mock 模板)
- **对应总设计**:`2026-05-08-cleanup-and-test-rewrite-design.md` →
  UC-C / UC-D / UC-F / 测试覆盖清单
- **执行前必读**:
  - `2026-05-08-cleanup-teammate-cheatsheet.md`(teammate 硬约束,**特别是
    UC-F-4 + UC-G**:54 个领域测试写的时候大概率会撞 backend 行为不符,按
    UC-G 改 backend,不得 skip;N4a/N4b/N4c 三个并行 executor **共享同一个
    backend 分支 `feat/n4-test-rewrite-domains`**(与前端分支同名),按前端
    同样的 "先到先 push,后到 pull --rebase" 规则协同,零 crate 重叠)
  - 本文档(requirements)
  - `2026-05-08-n4-test-rewrite-domains.md`(executor 必读;由 plan-writer 产出,含 N4a/N4b/N4c 分区)
  - `handoffs/N3-outcome.md`(上游;**重要**:N3 handoff 里锁定的 `mockHttpBridge` 签名)

## 做什么

按 UC-A 的 7 个领域(assets / skills / extension / assistants / providers /
system / cron)+ file preview,基于 N3 沉淀的 `mockHttpBridge` helper 写至少
**54 个新测试文件**(详细清单见下),覆盖 L1 utils / L2 hooks / L3 components /
L4 bootstrap。此数字加上 N3 的 6 个文件满足总设计 UC-D "≥ 60" 的硬要求。

N4 整体可**内部并行**为 N4a / N4b / N4c 三路(参见"并行化"节),但**对外仍
是一个里程碑分支 `feat/n4-test-rewrite-domains`**。派并行 agent 是执行手段,
不是新里程碑。

## 覆盖清单(必落地,不得删项,只允许在 Deviations 里加项)

### N4a(19 文件):Assistants + Skills + Extension

#### Assistants(12 文件)

| #   | 路径                                                      | 被测对象                                                             | 层次 |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------- | ---- |
| A1  | `tests/unit/assistants/useAssistantList.dom.test.ts`      | `renderer/hooks/assistant/useAssistantList.ts`                       | L2   |
| A2  | `tests/unit/assistants/useAssistantEditor.dom.test.ts`    | `renderer/hooks/assistant/useAssistantEditor.ts`                     | L2   |
| A3  | `tests/unit/assistants/useAssistantSkills.dom.test.ts`    | `renderer/hooks/assistant/useAssistantSkills.ts`                     | L2   |
| A4  | `tests/unit/assistants/useDetectedAgents.dom.test.ts`     | `renderer/hooks/assistant/useDetectedAgents.ts`                      | L2   |
| A5  | `tests/unit/assistants/assistantUtils.test.ts`            | `renderer/pages/settings/AssistantSettings/assistantUtils.ts`        | L1   |
| A6  | `tests/unit/assistants/AssistantListPanel.dom.test.tsx`   | `renderer/pages/settings/AssistantSettings/AssistantListPanel.tsx`   | L3   |
| A7  | `tests/unit/assistants/AssistantEditDrawer.dom.test.tsx`  | `renderer/pages/settings/AssistantSettings/AssistantEditDrawer.tsx`  | L3   |
| A8  | `tests/unit/assistants/DeleteAssistantModal.dom.test.tsx` | `renderer/pages/settings/AssistantSettings/DeleteAssistantModal.tsx` | L3   |
| A9  | `tests/unit/assistants/AddSkillsModal.dom.test.tsx`       | `renderer/pages/settings/AssistantSettings/AddSkillsModal.tsx`       | L3   |
| A10 | `tests/unit/assistants/SkillConfirmModals.dom.test.tsx`   | `renderer/pages/settings/AssistantSettings/SkillConfirmModals.tsx`   | L3   |
| A11 | `tests/unit/assistants/migrateAssistants.test.ts`         | `process/utils/migrateAssistants.ts`                                 | L4   |
| A12 | `tests/unit/assistants/runBackendMigrations.test.ts`      | `process/utils/runBackendMigrations.ts`                              | L4   |

#### Skills(4 文件)

| #   | 路径                                                          | 被测对象                                                                                    | 层次 |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---- |
| SK1 | `tests/unit/skills/skillSuggestParser.test.ts`                | `renderer/utils/chat/skillSuggestParser.ts`                                                 | L1   |
| SK2 | `tests/unit/skills/AddCustomPathModal.dom.test.tsx`           | `renderer/pages/settings/AssistantSettings/AddCustomPathModal.tsx`(属于 skill 外部路径配置) | L3   |
| SK3 | `tests/unit/skills/useAssistantSkillsIntegration.dom.test.ts` | `useAssistantSkills` + `AddSkillsModal` 组合(使用 mockHttpBridge 拉 skill detection 接口)   | L4   |
| SK4 | `tests/unit/skills/SkillsHubSettings.dom.test.tsx`            | `renderer/pages/settings/SkillsHubSettings.tsx`(Skills Hub 入口页)                          | L3   |

#### Extension(3 文件)

| #   | 路径                                                            | 被测对象                                                                              | 层次 |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---- |
| E1  | `tests/unit/extension/ExtensionSettingsPage.dom.test.tsx`       | `renderer/pages/settings/ExtensionSettingsPage.tsx`                                   | L3   |
| E2  | `tests/unit/extension/ExtensionSettingsTabContent.dom.test.tsx` | `renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent.tsx` | L3   |
| E3  | `tests/unit/extension/extensionMapperIntegration.test.ts`       | Extension 相关 ipcBridge 调用序列(mock httpBridge 模拟 `/api/extension/*`)            | L4   |

---

### N4b(18 文件):Providers + System + Cron

#### Providers(8 文件)

| #   | 路径                                                           | 被测对象                                                                               | 层次 |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| P1  | `tests/unit/providers/useModelProviderList.dom.test.ts`        | `renderer/hooks/agent/useModelProviderList.ts`                                         | L2   |
| P2  | `tests/unit/providers/useConfigModelListWithImage.dom.test.ts` | `renderer/hooks/agent/useConfigModelListWithImage.ts`                                  | L2   |
| P3  | `tests/unit/providers/useGoogleAuthModels.dom.test.ts`         | `renderer/hooks/agent/useGoogleAuthModels.ts`                                          | L2   |
| P4  | `tests/unit/providers/ModelModalContent.dom.test.tsx`          | `renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx`            | L3   |
| P5  | `tests/unit/providers/RotatingApiClient.test.ts`               | `common/api/RotatingApiClient.ts` + `AnthropicRotatingClient` + `OpenAIRotatingClient` | L1   |
| P6  | `tests/unit/providers/ApiKeyManager.test.ts`                   | `common/api/ApiKeyManager.ts`                                                          | L1   |
| P7  | `tests/unit/providers/ClientFactory.test.ts`                   | `common/api/ClientFactory.ts`                                                          | L1   |
| P8  | `tests/unit/providers/ProtocolConverter.test.ts`               | `common/api/ProtocolConverter.ts` + `OpenAI2AnthropicConverter.ts`                     | L1   |

#### System(3 文件)

| #   | 路径                                                 | 被测对象                                                                                                                                  | 层次 |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| S1  | `tests/unit/system/SystemModalContent.dom.test.tsx`  | `renderer/components/settings/SettingsModal/contents/SystemModalContent/index.tsx`                                                        | L3   |
| S2  | `tests/unit/system/clientPrefSettings.test.ts`       | language / cronNotificationEnabled 等走 `/api/settings/client` 的 hook 或 utils(从 `useSettingsModal` / `DisplayModalContent` 等找触发点) | L2   |
| S3  | `tests/unit/system/DisplayModalContent.dom.test.tsx` | `renderer/components/settings/SettingsModal/contents/DisplayModalContent.tsx`(主题 / 字号 / 语言等 client-pref 的 UI)                     | L3   |

#### Cron(7 文件)

| #   | 路径                                               | 被测对象                                                                                                | 层次 |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---- |
| C1  | `tests/unit/cron/cronUtils.test.ts`                | `renderer/pages/cron/cronUtils.ts`                                                                      | L1   |
| C2  | `tests/unit/cron/useCronJobs.dom.test.ts`          | `renderer/pages/cron/useCronJobs.ts`                                                                    | L2   |
| C3  | `tests/unit/cron/CreateTaskDialog.dom.test.tsx`    | `renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx`                                           | L3   |
| C4  | `tests/unit/cron/TaskDetailPage.dom.test.tsx`      | `renderer/pages/cron/ScheduledTasksPage/TaskDetailPage.tsx`                                             | L3   |
| C5  | `tests/unit/cron/CronStatusTag.dom.test.tsx`       | `renderer/pages/cron/ScheduledTasksPage/CronStatusTag.tsx`                                              | L3   |
| C6  | `tests/unit/cron/CronJobSiderSection.dom.test.tsx` | `renderer/components/layout/Sider/CronJobSiderSection/CronJobSiderSection.tsx` + `CronJobSiderItem.tsx` | L3   |
| C7  | `tests/unit/cron/CronJobManager.dom.test.tsx`      | `renderer/pages/cron/components/CronJobManager.tsx`                                                     | L3   |

---

### N4c(19 文件):Previews + Assets + Bootstrap

#### Previews(12 文件)

| #   | 路径                                                      | 被测对象                                                                       | 层次 |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| V1  | `tests/unit/previews/PreviewContext.dom.test.tsx`         | `renderer/pages/conversation/Preview/context/PreviewContext.tsx`               | L3   |
| V2  | `tests/unit/previews/usePreviewHistory.dom.test.ts`       | `renderer/pages/conversation/Preview/hooks/usePreviewHistory.ts`               | L2   |
| V3  | `tests/unit/previews/OfficeWatchViewer.dom.test.tsx`      | `renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer.tsx` | L3   |
| V4  | `tests/unit/previews/PptViewer.dom.test.tsx`              | `viewers/PptViewer.tsx`                                                        | L3   |
| V5  | `tests/unit/previews/OfficeDocViewer.dom.test.tsx`        | `viewers/OfficeDocViewer.tsx`                                                  | L3   |
| V6  | `tests/unit/previews/ExcelViewer.dom.test.tsx`            | `viewers/ExcelViewer.tsx`                                                      | L3   |
| V7  | `tests/unit/previews/MarkdownViewer.dom.test.tsx`         | `viewers/MarkdownViewer.tsx`                                                   | L3   |
| V8  | `tests/unit/previews/HTMLViewer.dom.test.tsx`             | `viewers/HTMLViewer.tsx`                                                       | L3   |
| V9  | `tests/unit/previews/PreviewPanel.dom.test.tsx`           | `PreviewPanel/PreviewPanel.tsx`                                                | L3   |
| V10 | `tests/unit/previews/PreviewHistoryDropdown.dom.test.tsx` | `PreviewPanel/PreviewHistoryDropdown.tsx`                                      | L3   |
| V11 | `tests/unit/previews/fileUtils.test.ts`                   | `Preview/fileUtils.ts` + `previewUrls.ts`                                      | L1   |
| V12 | `tests/unit/previews/previewHistoryIntegration.test.ts`   | Preview History 相关 ipcBridge 组合(mock `/api/preview-history/*`)             | L4   |

#### Assets(2 文件)

| #                                                    | 路径                                                 | 被测对象                                                         | 层次 |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ---- |
| X1                                                   | `tests/unit/assets/agentLogo.test.ts`                | 前端 agent logo 解析 / asset URL 构造工具(grep 找出实际文件,例如 |
| `renderer/utils/...` 里 logo / asset-related helper) | L1                                                   |
| X2                                                   | `tests/unit/assets/presetAssistantResources.test.ts` | `renderer/utils/model/presetAssistantResources.ts`               | L1   |

#### Bootstrap(3 文件)

| #   | 路径                                                      | 被测对象                                                                                                                                      | 层次 |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | `tests/unit/bootstrap/initStorage.migrations.test.ts`     | `process/utils/initStorage.ts` 中与 migration 相关的分支(M1 / assistant / provider)                                                           | L4   |
| B2  | `tests/unit/bootstrap/configMigrationIntegration.test.ts` | 跨文件:`configMigration` + `migrateAssistants` + `runBackendMigrations` 串起来的首启流程,用 `mockHttpBridge` 假 `/api/settings/client` 等接口 | L4   |
| B3  | `tests/unit/bootstrap/migrationErrorRecovery.test.ts`     | 某一步 migration 失败时的降级行为(从 `runBackendMigrations.ts` 的 `allSucceeded` 分支反推)                                                    | L4   |

---

**合计**:N4a 19 + N4b 18 + N4c 17 = **54 个测试文件**。最低门槛 54,可根据实际
grep 发现再加项(例如某个 hook 拆成两个测试文件),加项要在 handoff Deviations
节说明,**但不得减项**。

## 不做什么(边界)

- ❌ **不动** adapter/common 代码(N3 已覆盖)
- ❌ **不动** 源码:N4 只写测试 + 必要时补 `@ts-expect-error` 类型注释
- ❌ **不改** N3 产出的 `mockHttpBridge.ts` helper(要改必须 escalate 给 team-lead)
- ❌ **不引入新 mock 库**(msw / nock / sinon 等都不要,`vi.mock` + helper 已足够)
- ❌ **不测** UC-A 之外的领域:team / acp / conversation / mcp / shell / pet / agent/ /
  task/ / worker/ / webui / auth / remoteAgent / workspaceSnapshot / windowControls /
  tray / autoUpdate / deepLink / zoom / initAgent(除 migration 分支) / shellEnv
- ❌ **不测** 已删文件(见 N1)
- ❌ **不做 e2e**(`tests/e2e/**` 不在本里程碑范围)
- ❌ **不合回共享分支,不建 PR**

## 已定决策

| 决策点                                   | 结论                                                                                                                                                                                           | 理由                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 每个测试文件的 case 数量下限             | ≥ 3(happy path / 边界 / 错误路径各至少 1 个);L3 组件 ≥ 5(渲染 / 交互 / 加载 / 错误 / 空状态)                                                                                                   | 控制每个文件的实际价值                                                                |
| `.dom.test.ts` vs `.test.ts` 划分        | 涉及 React 组件 / 依赖 DOM API 的用 `.dom.test.ts(x)`(归 jsdom 项目);纯逻辑用 `.test.ts`(归 node 项目)                                                                                         | 与现有 `vitest.config.ts` 两个 project 对齐                                           |
| migrate 类测试是否验真实 IPC             | **否**,全 mock;验证点是 "正确的路由调用序列 + 正确的 payload shape"                                                                                                                            | migrate 在 CI 里真跑一次成本高、flaky;正确性靠 payload 合约断言                       |
| L3 组件测试是否触发真实 arco-design 交互 | **是**,用 `@testing-library/react` 的 `userEvent` 触发点击 / 输入;不用 `fireEvent` 低层 API                                                                                                    | arco-design 基于 React,`userEvent` 语义更接近用户;与 `tests/vitest.dom.setup.ts` 一致 |
| 并行子 agent 是否允许                    | **允许 N4a/N4b/N4c 三个 agent 并行**,但必须基于 N3 的 mock helper;每个子 agent 提交后 rebase/merge 回 `feat/n4-test-rewrite-domains` 分支,最终只 push 一次                                     | 加速;减少 3 份 handoff                                                                |
| 子 agent 间文件冲突风险                  | 通过目录分区避免:N4a 只写 `tests/unit/assistants`+`skills`+`extension`,N4b 写 `providers`+`system`+`cron`,N4c 写 `previews`+`assets`+`bootstrap`,三者零重叠                                    |                                                                                       |
| 覆盖率硬门禁                             | 仍保持 `thresholds: 0`(不 gate),但 handoff 必须贴每个新测试文件的 v8 覆盖率,低于 60% 的要解释                                                                                                  | 逐步提高,不一次搞"达标强迫症"                                                         |
| 发现源码 bug 怎么办                      | 小 bug(typo / null-guard):测试里用 `@ts-expect-error` 或 `expect(current).toEqual(...)` 写成"文档化现状"的断言,在 handoff Deviations 说明,不改源码;大 bug:escalate 给 team-lead 走另一个 PR 修 | 保持 N4 scope 纯粹                                                                    |

## 验收标准

> **UC-F 硬约束提示**:handoff 必须贴每条命令的原始输出 + vitest
> `--reporter=verbose` 的所有新增测试的 `✓` 行。禁止 `.skip` / `.todo`。
> 详见总设计 UC-F-1/4/5。

### 自动化门禁

```bash
# 1. 清单 54 个文件全部落地(脚本化检查,避免遗漏)
# 完整 54 条路径列在本 requirements 上方表格,执行者据此写检查脚本
TESTS=(
  tests/unit/assistants/useAssistantList.dom.test.ts
  tests/unit/assistants/useAssistantEditor.dom.test.ts
  tests/unit/assistants/useAssistantSkills.dom.test.ts
  tests/unit/assistants/useDetectedAgents.dom.test.ts
  tests/unit/assistants/assistantUtils.test.ts
  tests/unit/assistants/AssistantListPanel.dom.test.tsx
  tests/unit/assistants/AssistantEditDrawer.dom.test.tsx
  tests/unit/assistants/DeleteAssistantModal.dom.test.tsx
  tests/unit/assistants/AddSkillsModal.dom.test.tsx
  tests/unit/assistants/SkillConfirmModals.dom.test.tsx
  tests/unit/assistants/migrateAssistants.test.ts
  tests/unit/assistants/runBackendMigrations.test.ts
  tests/unit/skills/skillSuggestParser.test.ts
  tests/unit/skills/AddCustomPathModal.dom.test.tsx
  tests/unit/skills/useAssistantSkillsIntegration.dom.test.ts
  tests/unit/skills/SkillsHubSettings.dom.test.tsx
  tests/unit/extension/ExtensionSettingsPage.dom.test.tsx
  tests/unit/extension/ExtensionSettingsTabContent.dom.test.tsx
  tests/unit/extension/extensionMapperIntegration.test.ts
  tests/unit/providers/useModelProviderList.dom.test.ts
  tests/unit/providers/useConfigModelListWithImage.dom.test.ts
  tests/unit/providers/useGoogleAuthModels.dom.test.ts
  tests/unit/providers/ModelModalContent.dom.test.tsx
  tests/unit/providers/RotatingApiClient.test.ts
  tests/unit/providers/ApiKeyManager.test.ts
  tests/unit/providers/ClientFactory.test.ts
  tests/unit/providers/ProtocolConverter.test.ts
  tests/unit/system/SystemModalContent.dom.test.tsx
  tests/unit/system/clientPrefSettings.test.ts
  tests/unit/system/DisplayModalContent.dom.test.tsx
  tests/unit/cron/cronUtils.test.ts
  tests/unit/cron/useCronJobs.dom.test.ts
  tests/unit/cron/CreateTaskDialog.dom.test.tsx
  tests/unit/cron/TaskDetailPage.dom.test.tsx
  tests/unit/cron/CronStatusTag.dom.test.tsx
  tests/unit/cron/CronJobSiderSection.dom.test.tsx
  tests/unit/cron/CronJobManager.dom.test.tsx
  tests/unit/previews/PreviewContext.dom.test.tsx
  tests/unit/previews/usePreviewHistory.dom.test.ts
  tests/unit/previews/OfficeWatchViewer.dom.test.tsx
  tests/unit/previews/PptViewer.dom.test.tsx
  tests/unit/previews/OfficeDocViewer.dom.test.tsx
  tests/unit/previews/ExcelViewer.dom.test.tsx
  tests/unit/previews/MarkdownViewer.dom.test.tsx
  tests/unit/previews/HTMLViewer.dom.test.tsx
  tests/unit/previews/PreviewPanel.dom.test.tsx
  tests/unit/previews/PreviewHistoryDropdown.dom.test.tsx
  tests/unit/previews/fileUtils.test.ts
  tests/unit/previews/previewHistoryIntegration.test.ts
  tests/unit/assets/agentLogo.test.ts
  tests/unit/assets/presetAssistantResources.test.ts
  tests/unit/bootstrap/initStorage.migrations.test.ts
  tests/unit/bootstrap/configMigrationIntegration.test.ts
  tests/unit/bootstrap/migrationErrorRecovery.test.ts
)
# 上方数组为完整 54 项;数组 size 与上方表格 54 项严格对齐
# 漏项 / 多项必须在 handoff Deviations 说明

for f in "${TESTS[@]}"; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done
# 预期:无 MISSING(54 项)

# 2. 全量 vitest run
bunx vitest run --reporter=verbose
# 预期:退出 0;passed 数 ≥ N3 产出(6)+ N4 产出(54)= 60 个测试文件

# 3. test case 总数下限(每个文件平均 ≥ 3 case)
bunx vitest run --reporter=verbose 2>&1 | grep -E "^Tests" | tail -1
# 预期:Tests ≥ 180 passed

# 4. 无 skip/todo
grep -rnE "\\.skip\\(|\\.todo\\(|test\\.skip|it\\.skip|xit\\(|xtest\\(" tests/unit
# 预期:无输出

# 5. helper 未被改(diff hash 对比)
git diff origin/feat/n3-test-rewrite-adapter-common -- tests/unit/_helpers/mockHttpBridge.ts
# 预期:无 diff(helper 不得改);若有改必须 escalate

# 6. 类型检查
bunx tsc --noEmit
# 预期:退出 0

# 7. Lint
bun run lint
# 预期:退出 0

# 8. 覆盖率报告(不 gate,handoff 贴)
bunx vitest run --coverage
# 预期:退出 0;覆盖率报告生成到 coverage/

# 9. prek
prek run --from-ref origin/feat/backend-migration --to-ref HEAD
# 预期:全绿

# 10. 基线同步后复跑(UC-F-5)
git fetch origin feat/backend-migration
git merge origin/feat/backend-migration --no-ff -m "chore(n4): sync with feat/backend-migration"
bun run lint
bunx tsc --noEmit
bunx vitest run
prek run --from-ref origin/feat/backend-migration --to-ref HEAD
# 预期:退出 0
```

### 并行化(可选,子 agent 派发规范)

如果采用并行:

- **N4a agent**(`assistants` / `skills` / `extension`):读 N3 handoff 锁定的
  helper 签名 + 本需求"覆盖清单 N4a"节 + Assistant / Skill 领域的源码
- **N4b agent**(`providers` / `system` / `cron`):同上,对应 N4b 清单
- **N4c agent**(`previews` / `assets` / `bootstrap`):同上,对应 N4c 清单
- **三路零重叠**:文件路径按目录分区,不触碰其它分区
- **合并策略**:N4a agent 先完成 → push 到 `feat/n4-test-rewrite-domains` →
  N4b agent `git pull --rebase` → 写完 push → N4c 同理。**不开子分支**
- **共享 handoff**:三路合并完后由 N4 主 agent(或人类协调者)写单一
  `N4-outcome.md`,三路各写一个内部子节"A 部分 / B 部分 / C 部分"
- **冲突处理**:按 UC-F-5,merge 不 rebase,冲突 escalate

**如不并行**:单 agent 按 A→B→C 顺序一次性写完;时间预计 7-10 天(54 文件
× 平均 2 小时)。

## 关键风险

| 风险                                                                                          | 缓解                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 54 个测试里有 test case 跑得很慢,`vitest run` 超 5 分钟                                       | 所有网络 / IO 全 mock(UC-F-4 硬要求);single-file timeout 维持 `vitest.config.ts` 的 `testTimeout: 10000`;若某 case 仍慢,调查是不是错用了真 http / fs            |
| L3 组件测试需要大量 arco 上下文(ConfigProvider / Locale / Modal root)                         | 在 `tests/vitest.dom.setup.ts` 补充全局 wrapper(类似 `<ConfigProvider componentConfig={...}>`),或为 dom 测试单独再起一个 setup 文件                             |
| `useCronJobs` 这类 hook 内部订阅 WS 事件,fake timers + async 会 flaky(记忆里踩过)             | 用 N3 helper 的 sync emit 模式;必要时 `vi.advanceTimersByTimeAsync()`;不得无脑 `waitFor` + 长 timeout                                                           |
| 发现某个源文件实际已经不在代码库(被 M 系列某个里程碑顺手删了但文件名还在这个 requirements 里) | 执行 agent 在落地前先 `test -f <source>`,不存在的源码对应项从 Deviations 节列出,**保留清单总数**(用同领域其它源码文件补位),handoff 提示下一轮 requirements 修正 |
| AssistantSettings 目录有 `types.ts`(纯 type)                                                  | 不测;但 `AddCustomPathModal.tsx` / `AssistantAvatar.tsx` 如果实际没有交互(纯展示),允许只写"渲染无报错 + props 回显"的最小测试,case 数放宽到 2                   |
| 并行 agent 互相 merge 冲突严重                                                                | 领域目录分区 + helper 不改 + 不跨分区 import;冲突只能在 import 顺序和 vitest.config 上出现,实际极少                                                             |
| 写完发现 tests 真实 pass 但 `bunx vitest run --coverage` 失败(v8 插件崩)                      | 覆盖率展示不 gate,失败 escalate 给 team-lead(可能是 vitest 4 升级后的兼容问题,独立 issue)                                                                       |

## 依赖上游

- **N3 必须已 merge**:`tests/unit/_helpers/mockHttpBridge.ts` 必须可用
- **读 N3 handoff**:拿到 helper 锁定签名
- **N2 骨架必须已存在**:`tests/unit/{assistants,skills,extension,providers,system,cron,previews,assets,bootstrap}/` 必须都已建好(N2 产物)

## 分支与 handoff

- 上游分支:`origin/feat/n3-test-rewrite-adapter-common`
- 本里程碑分支:`feat/n4-test-rewrite-domains`
- handoff 位置:`docs/backend-migration/handoffs/N4-outcome.md`
- 完成后 push 前:UC-F-5 标准顺序

## 预计执行时间

单 agent 顺序:7-10 天
三路并行:3-4 天
实际取决于执行者对 adapter 领域代码的熟悉度和 arco-design 测试模式的沉淀

## Handoff 必填字段

- 本里程碑分支名 + 最新 SHA + 基线同步 merge SHA
- 54 个测试文件的完整清单 `git diff --stat origin/feat/n3-test-rewrite-adapter-common..HEAD -- tests/unit/`
- **UC-F-1 命令输出**:自动化门禁 1-10 条(特别是第 2 / 5 / 10 条的原始输出)
- **UC-F-4 测试执行证据**:`bunx vitest run --reporter=verbose` 里 54 个文件的
  逐个 `✓ tests/unit/<领域>/<文件> (N tests)` 行
- 覆盖率汇总表格:每行一个领域(assistants / skills / ...)× 列(statement/branches/functions/lines)
- Deviations 节:
  - 加项:源码存在但本需求没覆盖的小文件(可选)
  - 减项:源码已不存在但需求里列了,被迫移除或换源码,必须列出
  - 发现的源码 bug(不修,但描述清楚 + 后续 issue 号)
- 若某个测试文件只做了"snapshot"或"渲染不报错"级别的浅测试,单列一节说明
  原因 + 跟进计划
- 若采用并行:每个子 agent 自报的小 handoff(贴 A/B/C 分节里)
