# 来源审计报告：二开代码分级文档是否混入新版重写实现

- 任务：019fe97f-a557-7483-b2dc-42056b802301
- 审计人：Kimi（teammate）
- 日期：2026-08-10
- 审计对象：`docs/plans/二开项目升级/` 的 README.md、01-二开代码资产与依赖分级.md（+manifest.json）、02-二开扩展包目录与manifest-adapter方案.md
- 唯一原版证据源：
  - AionUi `integrate/ad-hoc-team-latest` 固定 SHA `adf8dfaa432625cd1688459b2990156140be1fd7`（下称 PIN-UI）
  - AionCore 同名分支固定 SHA `eb0c884ecbed47f96d5a80b0ea603933fd4cf668`（下称 PIN-CORE）
  - 专家团原始提交 `e3f154559`（独立核验）
- 方法：不信任文档自述，逐项 `git show/ls-tree/log` 回到两棵固定 SHA 提交树核验；/tmp 与当前工作区仅作新版旁证。
- 分级：ORIGINAL（与固定树一致）/ REWRITE（把新版重写当原版）/ MIXED（新旧混排或未标注来源）/ UNVERIFIED（本环境无法复算）

## 总体结论

**文档主体（A/B/C 级资产清单、溯源链、勘误、i18n、专家团）经逐项核验与 PIN-UI 树完全一致，未发现把 v2.1.52 重写实现伪装成旧版二开资产的 REWRITE 条目。**

发现 **2 处 MIXED**（D 级 AionCore 迁移编号/修复工具、扩展包 presets 布局基准），均为"新版窗口事实未标注来源、与固定树不符"，建议修订；另有若干 STALE/UNVERIFIED 元数据。

## 1. 基线一致性（ORIGINAL）

- 文档口径基线 `b397e15fd` 与 PIN-UI 之间仅隔 2 个 docs 提交（`272daa403`、`b397e15fd`），`git diff adf8dfaa4 b397e15fd` 只触及 docs/plans 与 patches/，**产品代码完全一致**——文档以 b397e15fd 为口径、以 adf8dfaa4 为证据合法。
- PIN-CORE 即 AionCore `integrate/ad-hoc-team-latest` 分支当前 HEAD（`eb0c884e`）。
- README:25 提到的固化补丁 `patches/2026-07-30-*.patch` 在 PIN-UI 树**不存在**（随 `272daa403` 才入库）——属 docs 口径产物，非产品规格问题，备注即可。

## 2. A 级资产（20 项）：全部 ORIGINAL

对 PIN-UI 逐文件核验存在性与行数，**20/20 精确一致**：

| 文件 | 文档行数 | PIN-UI 行数 |
| --- | --- | --- |
| common/adapter/adHocTeamBridge.ts | 74 | 74 ✓ |
| common/types/team/adHocTeamTypes.ts | 41 | 41 ✓ |
| AdHocTeam/CollaborationLauncher.tsx | 90 | 90 ✓ |
| AdHocTeam/AgentSelectorModal.tsx | 104 | 104 ✓ |
| AdHocTeam/AdHocTeamSection.tsx | 75 | 75 ✓ |
| AdHocTeam/TeamStatusCard.tsx | 138 | 138 ✓ |
| hooks/useAdHocTeamFromConversation.ts | 284 | 284 ✓ |
| hooks/useTeammateBackflow.ts | 59 | 59 ✓ |
| utils/conversationTeamOwnership.ts | 29 | 29 ✓ |
| utils/runtimeGate.ts | 22 | 22 ✓ |
| common/adapter/teamPresetBridge.ts | 115 | 115 ✓ |
| TeamPresets/{index.ts:14, types.ts:7, useTeamPresets.ts:160, EditorModal:372, Picker:155, Preview:111, MemberList:63, EmptyState:39} | — | 全部 ✓ |
| TeamCreateModal.module.css | 71 | 71 ✓ |

行为级声明同步核验（PIN-UI）：

- AdHocTeamSection:65-66 `navigate(`/team/${teamId}`)` —— §9-1"disbanded 回航断链"缺陷描述属实 ✓
- TeamStatusCard:57/66-68 disbanded→`onNavigate(origin_conversation_id)` ✓
- useAdHocTeamFromConversation **15** 个 `.on(` 订阅，:185-211 ✓（§1.3 对审计文件"17 个"的勘误成立）
- `clearUnreadTeammateMessages` 导出 :253/:268 ✓（§9-3 无调用方债务属实）
- TeamCreateModal.module.css、TeamPresets 目录形态与 §2.4 一致 ✓

## 3. B/C 级插槽锚点：全部 ORIGINAL

PIN-UI 逐项命中：ChatConversation hook :203/:284、挂载 :220(aionrs)/:383(ACP)、isTeamRunning :309；useAcpMessage teammate case :361 + ensureStandalone :561（调用点 :570/:601）；useAionrsMessage case :321；AionrsSendBox :175/:214；AcpSendBox :696 `disabled={isTeamRunning}`（文档 :695-696，1 行偏差）；AionrsChat warmup effect :60-63；TeamPage `team-back-to-origin` :450；SiderItem disabled :18/:113；ConversationRow :236；types.ts :60；SearchPopover :196；groupingHelpers :92-125；useConversationActions deleteTeamSource :97-101；useAcpConfigOptions teamId→[] :141-144；InlineAgentEditor 三字段 :322-331；i18n/index.ts localStorage 守卫 :69-77；migration_v27 :1224 + 注册 :1258 + `CURRENT_DB_VERSION=27` schema.ts:165；teamTypes origin_conversation_id :48、TeamPresetMember :261 / TeamPreset :271 / 全文 285 行；ipcBridge :120-122、:1959-1960、behavior_policy 内联 :863/:886。

轻微行号偏差（AcpChat props 文档 :99 实际 :112/:122；AcpSendBox :695-696 实际 :696）不影响分级结论。

## 4. 溯源链提交：全部 ORIGINAL

`700fdf117 / 8cbd1e833 / ea7757ce5 / ebca50b35 / 63ffc91e9 / cc9f05549 / b19a68072 / bee2093d9 / 35464bd9e / 7f38664ae / a7efe3fb5 / 5c459df38 / 14d11cc6e` 均为 PIN-UI 祖先 ✓。`8b2953a33` 非祖先——文档本就标注其为被取代的旧原型分支、仅作溯源 ✓。

## 5. 专家团 e3f154559 独立判源：ORIGINAL

- `git show --stat`：**31 文件，+2681/−87**，与 README:25/01:8 完全一致 ✓
- 文件清单：TeamPresets 目录 8 文件（index/types/hooks/5 组件目录中的 4 个 + EmptyState）+ TeamCreateModal.tsx + TeamCreateModal.module.css + ipcBridge/teamMapper/teamTypes + i18n-keys.d.ts + 13 locale team.json + 4 测试——**全部位于 packages/desktop/src 与 tests/，纯 AionUi 前端** ✓
- **不含** teamPresetBridge.ts——与文档"e3f154559 → ebca50b35（抽 bridge）"的链条一致 ✓
- 为 PIN-UI 祖先 ✓
- §2.4 对其数据模型/交互的描述（TeamPreset/TeamPresetMember 尾块 :255-285、SWR key、zIndex、`:global()` CSS）逐项在 PIN-UI 命中 ✓
- 结论：e3f154559 为原版二开提交，文档对专家团的定级与溯源**未混入**新版平铺重写（f5ab5f9b2/16cceab84/9990640d6 仅出现在明确标注的"v2.1.52 状态/对应"栏）。

## 6. i18n 资产：ORIGINAL

PIN-UI en-US：collaboration 13 key ✓、history.deleteTeamSource×3 ✓、team.presets×31 ✓、sider adHocTooltip+deleting ✓；13 个 locale 目录 ✓；49=13+3+31+2 ✓。TEAM_* 错误码 key（en-US 7 处、i18n-keys.d.ts 11 处）确认为上游 PR #3395（`72129a5e8`，PIN-UI 祖先）资产，文档"不计入 49 key"的勘误成立 ✓。`tests/e2e/specs/team-create-preset-leader.e2e.ts` 溯源至上游 PR #2576/#2616，"虽同名但属上游"的判断成立 ✓。

## 7. MIXED 发现（需修订）

### 7.1 D 级 AionCore 迁移：新版窗口编号/工具未标注来源 ⚠️

- 文档：01 §5.3「`038_ad_hoc_team_origin_conversation.sql`、`039_team_presets.sql`、`040_backfill_formal_team_leader_team_id.sql`（上游 v0.1.62 max=037；`037_enable_grok_build_team` 已删）」；01 §2.4「Migration 039」；manifest `dLevel.aioncore-migrations`；README:48 与 01 §5.3 引用修复脚本 `scripts/migration/repair-legacy-versions.sh`。
- PIN-CORE 树事实：三个迁移编号为 **034/035/036**（同名）；**`037_enable_grok_build_team.sql` 存在**（二开提交 `7bdd1b5e` 引入，从未在本分支删除）；**无 repair-legacy-versions.sh**（scripts/migration/ 仅 check-immutability 系列）。
- 新版旁证：038/039/040 编号、"037 已删（上游 033_team_capability_criteria 为超集）"、repair 脚本均来自 **v0.1.62 重做线**（`a887fc23`，分支 `p2/v0162-adhoc-presets`；repair 脚本由 `e0e03ab8` 引入）——这些事实本身在新版线上成立（已旁证：a887fc23 树含 038/039/040、无 037 grok；上游 tag v0.1.62 max=037 ✓）。
- 判定：**MIXED**。文档把重做线事实当作资产清单的现行事实陈述，未标注其来源窗口；以 PIN-CORE 为唯一原版证据时不可核验。建议：该行改为双栏（原版 034/035/036 @ eb0c884e；新版 038/039/040 @ a887fc23 线），repair 脚本标注引入提交 e0e03ab8。

### 7.2 扩展包 presets 布局以 worktree 重做形态为准 ⚠️

- 位置：01:90「未来扩展包以平铺布局为准」；02 §2:29-31「TeamPreset*.tsx 平铺布局（以 v2.1.52 worktree 形态为准）」；02:57；01:125 与 manifest:69、02:104 TeamCreateModal「直接对照 worktree 版本 / 9990640d6」。
- 判定：**MIXED（已声明的决策，但实质上让新版重写形态成为规范基准）**。e3f154559 原版为 `TeamPresets/` 目录形态；扩展包方案将 v2.1.52 worktree 的平铺重做（f5ab5f9b2/16cceab84/9990640d6）作为"为准"形态与最深 C 级改写的对照基准。文本有明确标注、非隐蔽混入，但这正是"以 /tmp worktree 作为产品规格"的落点，建议 leader 决策确认是否保留该基准，或在文档中显式升级为"决策记录"而非附带表述。

## 8. STALE（时间性失效，非来源问题）

- manifest `baselines.redo.uncommitted`、README:22、01:6「尚未提交/untracked」、techDebt#9「重做未收口」——AdHocTeam 组件与 sendbox 接线已于 2026-08-09 23:54 收口为 worktree 提交 `d0beccbf8 feat(team): restore ad-hoc collaboration UI and runtime`，建议刷新这些条目。

## 9. UNVERIFIED（本环境不可复算）

1. **delta 统计「64 新文件 + 45 修改源文件 + 26 locale + 27 新测试」**：本地浅克隆 `upstream/main...adf8dfaa4` 无 merge base，无法原法复算。替代法（汇总 20 个二开/文档提交自身足迹）得：新增 56（测试 27 ✓ + 其他 29）、修改 packages 源文件 29、locale 26 ✓。27 测试与 26 locale 精确命中；64/45 无法证实/证伪，建议文档补注复算方法或用全量克隆重算。
2. **「23 个本地提交（18 二开/文档 + 5 上游噪声）」**：5 个上游噪声提交精确命中（`e9882492e/4d6949780/f50832c59/92a55c952/590a5bdb7`，均为上游 PR 提交、PIN-UI 祖先）；`e9882492e..b397e15fd` 实际 23 个提交，但二开/文档口径我数得 20–22（含 hygiene chore 与 2 个 docs 提交），18 的口径无法复现——计数约定差异，不影响判源。
3. **测试用例数**：TeamStatusCard 文档 18 例（grep `it(` 得 21）、status.dom 17 例（得 19）——或为 it.each/嵌套统计口径差异，轻微，建议核对。
4. AionCore 后端 WS 事件 15 个与 REST 路由在 PIN-CORE 的存在性：路由文件命中（`aionui-team/src/routes.rs`、`aionui-api-types/src/team.rs`）✓；事件名清单未逐个比对载荷（超出本次范围，留待窗口门禁）。

## 10. 修订建议（供 leader 决策，本审计未改任何文件）

1. 01 §5.3 / §2.4 / manifest dLevel：AionCore 迁移拆"原版 034/035/036 @ eb0c884e"与"新版 038/039/040 @ a887fc23 线"双栏；repair-legacy-versions.sh 标注来源提交 e0e03ab8。
2. 01:90 / 02 §2 / 01:125：把"以 worktree 平铺形态为准"显式改写为决策记录（谁、何时、为何舍弃 e3f154559 目录形态）。
3. 刷新 STALE 条目（d0beccbf8 已收口）。
4. delta 统计与测试用例数按 §9 复核或加注。
