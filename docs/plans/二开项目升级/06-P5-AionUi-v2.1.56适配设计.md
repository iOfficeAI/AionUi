# 06 - P5 AionUi v2.1.56 二开 UI 重放适配设计

> 日期：2026-08-17
>
> 阶段：P5-D，仅设计，不修改任何 TS/TSX 产品代码；唯一写入为本文档，不 add、不 commit。
>
> 目标基线：AionUi `v2.1.56`（`36d632de5275fdb4354d5b74e137182c4d47b0e0`）。
>
> redo 参考：`21d73ba45`，其关键分层提交包括 `c0fbf26ae`（shared contracts/bridges）、`d0beccbf8`（ad-hoc UI/runtime）、`1a7d1082c`（GroupedHistory ownership）、`6316b28b6`/`bd728fb4d`（i18n）、`9990640d6`/`21d73ba45`（Team Preset 创建流与 UI 修复）。
>
> 规格依据：`01-原版二开资产清单.manifest.json`、`02-v2.1.52适配矩阵.md`、`04-v2.1.56适配矩阵.md`。

## 1. 设计结论先行

本轮 UI 不应把 `21d73ba45` 整体 patch 到 v2.1.56。正确策略是：

1. **shared contracts 先落地**：纯二开 bridge/type/mapper 优先恢复；对 v2.1.56 已变化的 shared host 文件只做字段级三方合并；
2. **i18n 第二层恢复**：先恢复 `conversation.collaboration.*` 13 键及 key typing，保证后续组件不出现硬编码；
3. **A 级模块本体直接复用为主**：AdHocTeam 四组件、全量 hook、ownership helper、TeamPreset 平铺组件可从 redo 恢复；
4. **runtimeGate 不原样扩散**：保留“promoted source 不启动 standalone runtime”的业务语义，但优先映射到 v2.1.56 已有 `teamRuntime.runtimeGate` / `prepareRuntime` seam，避免重建旧 `isTeamRunning` prop 链；
5. **B/C 宿主必须三方合并**：ChatConversation、GroupedHistory、TeamCreateModal、useAcpConfigOptions 等禁止机械 patch；
6. **ACP teammate_message 不重放 helper case**：v2.1.56 已原生处理；Aionrs 仍缺，Aionrs 侧恢复 backflow；
7. **三组上游新增逻辑列为不可覆盖区**：Aionrs `forkCapability`、GroupedHistory manual unread、ACP config pending-next-turn；
8. **GroupedHistory ownership 必须统一通过 `conversationTeamOwnership`**，不允许继续在不同文件散落直接 `teamId/team_id` 判断；
9. 每一层独立测试门禁，C 级改写前必须做 `git diff v2.1.56..工作树 -- <host>` 人工审阅，不允许“测试过了就算合并正确”。

## 2. redo 分层事实

`v2.1.52..21d73ba45` 的关键提交顺序显示 UI 二开本来就是逐层恢复，而不是一次性移植：

```text
c0fbf26ae feat(team): adapt bridges for v0.1.62
...
1a7d1082c fix(history): keep ad-hoc source conversations visible
...
6316b28b6 fix(team): complete preset and ad-hoc i18n coverage
...
d0beccbf8 feat(team): restore ad-hoc collaboration UI and runtime
...
21d73ba45 fix(team): restore expert-team modal layering, alignment, and single sider create entry
```

其中：

- `c0fbf26ae`：10 文件 / 758 行，建立 adHoc/teamPreset bridge、types、teamMapper、ipcBridge 和 common adapter tests；
- `d0beccbf8`：46 文件 / 4119 insertions，恢复四组件、全量 ad-hoc hook、backflow、ownership/runtimeGate、Chat/SendBox 接线、13 语言 collaboration i18n 与大量 DOM tests；
- `1a7d1082c`：仅修改 `groupingHelpers.ts`，把 `teamId || team_id` 改为只隐藏 `team_id`；
- `21d73ba45`：修复 TeamPreset modal 层级/布局与 sidebar 重复入口。

因此 P5-I 实施应沿用“协议 → 文案 → 模块 → slot → 深改 → tests”的依赖方向。

## 3. 实施顺序与文件级动作

## 3.1 第 1 层：shared contracts / types / bridges

### 直接复制 redo 版

这些文件在 v2.1.56 upstream 不存在，可优先从 `21d73ba45` 恢复，再以当前 Core v0.1.67 契约做字段校对：

- `packages/desktop/src/common/adapter/adHocTeamBridge.ts` —— **直接复制 redo 版**；
- `packages/desktop/src/common/types/team/adHocTeamTypes.ts` —— **直接复制 redo 版**；
- `packages/desktop/src/common/adapter/teamPresetBridge.ts` —— **直接复制 redo 版**。

### 三方合并

- `packages/desktop/src/common/types/team/teamTypes.ts`
  - 恢复 `origin_conversation_id`；
  - 恢复 `TeamPresetMember/TeamPreset` 尾块；
  - 保留 v2.1.56 上游新增/现有 Team 类型。
- `packages/desktop/src/common/types/platform/acpTypes.ts`
  - behavior policy 恢复 `supports_team` / `team_capable_override`；
  - 不覆盖 v2.1.56 其他 ACP config/prompt capability 类型。
- `packages/desktop/src/renderer/utils/model/agentTypes.ts`
  - BehaviorPolicy 镜像两字段；
  - 保持与 acpTypes 一致。
- `packages/desktop/src/common/adapter/teamMapper.ts`
  - 恢复 `origin_conversation_id` 透传；
  - 不改 v2.1.56 其他 TeamResponse mapping。
- `packages/desktop/src/common/adapter/ipcBridge.ts`
  - 只补 adHoc/preset bridge re-export/typed endpoint 所需最小接点；
  - v2.1.56 Team WS 15 组事件已原生，禁止重复定义。

### 验证门禁

优先恢复/运行：

- `tests/unit/common-adapter/adHocTeamMapper.test.ts`
- `tests/unit/common-adapter/ipcBridgeTeam.test.ts`
- `tests/unit/common-adapter/teamMapper.test.ts`
- `tests/unit/common-adapter/teamPresetBridge.test.ts`

门禁：formatter + TypeScript focused compile + 上述 tests。shared 层未过，不进入 UI 组件层。

## 3.2 第 2 层：i18n

### 恢复项

`conversation.collaboration.*` 共 13 键：

```text
launchTooltip
selectAgentTitle
createdSuccess
joinedSuccess
joinedHint
fallbackAgentName
createFailed
statusTitle
statusAria
latestMessage
disbanded
running
runDetail
```

语言目录按 manifest 的 13 语言：

```text
de-DE en-US es-ES fa-IR fr-FR ja-JP ko-KR pt-BR ru-RU tr-TR uk-UA zh-CN zh-TW
```

目标文件：

- `packages/desktop/src/renderer/services/i18n/locales/*/conversation.json`
- `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`

### 处理规则

- 13 键整体从 redo 恢复；
- `running/runDetail` 原始规格曾只有中英完整，但 redo `d0beccbf8` 已给 13 语言落键，本轮以 redo 已验证结果为迁移基准；
- `createdSuccess` 虽历史上未引用，仍保留以保持二开契约完整；
- 不触碰 upstream `conversation.createError/agentError TEAM_*`，manifest 明确它们不是二开资产。

### 验证门禁

- `bun run i18n:types`；
- grep 13 个 locale 均有 collaboration object；
- 定向跑 AdHocTeam component tests，确保无 missing-key fallback。

## 3.3 第 3 层：A 级模块

### AdHocTeam 四组件 —— 直接复制 redo 版

- `components/AdHocTeam/AdHocTeamSection.tsx`
- `components/AdHocTeam/AgentSelectorModal.tsx`
- `components/AdHocTeam/CollaborationLauncher.tsx`
- `components/AdHocTeam/TeamStatusCard.tsx`

组件本体可复制，但**不要同时复制 ChatConversation 挂载代码**。

### hooks / pure logic

- `hooks/useAdHocTeamFromConversation.ts` —— **以 redo 全量 287 行级版本为基准复制并做类型校对**。02 明确 27 行 SWR 精简版不足以满足事件订阅/状态规格；v2.1.56 的 15 组 Team WS 可直接复用。
- `hooks/useTeammateBackflow.ts` —— **保留为 Aionrs 可复用 helper**；ACP 不再接入它，避免与 upstream case 重复。
- `utils/conversationTeamOwnership.ts` —— **直接复制 redo 版作为统一 ownership 契约**。
- `utils/runtimeGate.ts` —— **不直接按 redo 扩散调用点**。文件可保留为兼容 helper，但实施前先按 §7 的新 runtime seam 设计收敛调用方。

### Team Preset 全套

以 redo 的**平铺版 DR-1**为目标，而不是恢复原版嵌套目录：

- `pages/team/components/TeamPresetEditorModal.tsx`
- `TeamPresetPicker.tsx`
- `TeamPresetPreview.tsx`
- `TeamPresetMemberList.tsx`
- `TeamPresetEmptyState.tsx`
- `TeamPresetPanel.tsx`
- `pages/team/TeamPresets/hooks/useTeamPresets.ts` 或 redo 当前实际 hook 路径

动作：**直接复制 redo tip 版本**。特别是 Editor/Picker 必须使用 `21d73ba45`，不能用更早 `9990640d6`，因为前者修复了 modal 层叠、尺寸和重复入口问题。

### 验证门禁

AdHoc focused tests：

- `AgentSelectorModal.dom.test.tsx`
- `CollaborationLauncher.dom.test.tsx`
- `TeamStatusCard.dom.test.tsx`
- `useAdHocTeamFromConversation*.test.ts(x)`
- `conversationTeamOwnership.test.ts`
- `runtimeGate.test.ts`
- `teammateBackflow.dom.test.tsx`

Preset focused tests：

- `useTeamPresets.dom.test.tsx`
- `TeamPresetPicker.dom.test.tsx`
- `TeamPresetEditorModal.dom.test.tsx`

A 级组件必须做到“孤立导入可编译 + focused tests 过”，再进入 host slot。

## 3.4 第 4 层：B 级 slot

### ChatConversation.tsx —— 三方合并

两个挂载点继续存在，但 v2.1.56 必须保留 fork capability：

- Aionrs 渲染：v2.1.56 **251 行** `forkCapability={conversation.fork_capability}`；
- ACP 渲染：v2.1.56 **311 行** `forkCapability={conversation.fork_capability}`，并同时有 `promptCapability`。

二开挂载动作：

1. 恢复 `useAuth`、`useAdHocTeamFromConversation`、ownership import；
2. Aionrs headerExtra 区域挂 `AdHocTeamSection`；
3. ACP/antigravity 共用 headerExtraNode 区域挂第二个 `AdHocTeamSection`；
4. 不覆盖 fork/prompt/project/antigravity 分支。

**禁止直接复制 redo ChatConversation 整文件。**

### TeamPage.tsx —— 三方合并/低风险 slot

恢复 `origin_conversation_id` 返回来源会话入口，锚点仍是 `headerLeading`。保留 v2.1.56 当前 Team runtime/UI。

### Sider/SiderItem.tsx —— 三方合并

恢复二开所需菜单 `disabled?`/删除状态接线，保持 upstream SiderItem API 其余字段。

### GroupedHistory —— 三方合并

文件：

- `ConversationRow.tsx`
- `types.ts`
- `ConversationSearchPopover.tsx`
- `hooks/useConversationListSync.ts`
- `utils/groupingHelpers.ts`

具体 ownership 见 §6；manual unread 合并见 §5.2。

### AcpChat/AcpSendBox/AionrsChat/AionrsSendBox —— 全新 runtime adapter

不再重放 redo 的 `isTeamRunning?: boolean` prop 链。使用 v2.1.56 已有：

```text
teamRuntime?: TeamSendBoxRuntime
teamRuntime.runtimeGate
teamSendMessage
prepareRuntime / prepareSetRuntime
```

只把 promoted source 的额外 standalone 限制映射到 runtime seam，详见 §7。

## 3.5 第 5 层：C 级深改

### TeamCreateModal.tsx —— 三方合并

以 `21d73ba45` 为 redo 视觉/交互基准，把 preset mode 重新植入 v2.1.56 当前 modal；禁止整文件覆盖。

检查点：

- EditorModal 必须是创建 Modal 的兄弟节点，不得重新嵌进父 AionModal children；
- 保留 `21d73ba45` 的 z-index / mask / autofocus 修复；
- Preset Picker 高度、移动端堆叠、空态布局保真；
- 不新增 sidebar 第二个 preset “+”。

### useAcpMessage.ts —— 三方合并但不重放 teammate case

v2.1.56 已原生 `case 'teammate_message'`，并做 conversation id 过滤 + text normalize + merge。

本轮只处理 promoted source runtime ownership 所需的 runtime prepare 逻辑，不接 `useTeammateBackflow`，否则可能双写消息。

### TeamSiderSection.tsx —— 三方合并

恢复/核对：

- ad-hoc icon/tooltip；
- deletingTeamId；
- 删除后回 origin；
- 运行态继续复用 upstream `useSiderTeamRunning`；
- 保持 `21d73ba45` 已删除重复 preset `+` 的结论。

### useConversationActions.ts —— 三方合并

新增 promoted source 强删除确认，但必须保留 v2.1.56 manual unread 相关 action/state。

推荐签名从：

```text
handleDeleteClick(conversation_id)
```

扩成：

```text
handleDeleteClick(conversation_id, extra?)
```

仅在 promoted source (`teamId` 且无 `team_id`) 使用 `conversation.history.deleteTeamSource*` 三键；其他删除路径沿用 upstream confirm。

### InlineAgentEditor.tsx —— 三方合并

恢复 BehaviorPolicy 两字段逐字段 serialize/deserialize，保留 v2.1.56 既有 `supports_side_question` 与其它编辑器逻辑。

### useAcpConfigOptions.ts —— 全新最小 adapter

这里必须特别注意一个事实：**`21d73ba45` 实际文件并没有 redo team guard**；`git log v2.1.52..21d73ba45 -- useAcpConfigOptions.ts` 为空。02/04 的“需要重插 team guard”属于规格/待办，不是可直接复制的 redo 代码。

所以 v2.1.56 实施应采用**全新最小 adapter**：

- 不修改 4b0025897 带来的 pending-next-turn 状态机；
- 不删除 `statusByConversation` / pending map / listener / resolvePendingFromSnapshot；
- 只在默认 standalone loader 或 prepare path 前增加 promoted source ownership 判定；
- 若上层已传 `prepareRuntime/loadConfigOptions`（Team runtime），继续走上层 seam；
- promoted source 不应因为 config options 查询而触发 standalone `ensureConversationRuntime`。

具体建议：把“是否允许默认 standalone prepare”抽成很小的 helper，而不是在 300 行 hook 内散落多个 `teamId` if。

## 4. 三组上游新逻辑合并方案

## 4.1 Aionrs forkCapability

v2.1.56 实际证据：

- `ChatConversation.tsx:251` AionrsChat `forkCapability={conversation.fork_capability}`；
- `ChatConversation.tsx:311` AcpChat 同样透传；
- `AionrsChat.tsx:43` 声明 `forkCapability?: { at_turn: boolean }`；
- `:58` 解构；
- `:76` 放进 ConversationProvider value；
- `:86` 进入 useMemo deps。

合并规则：

1. ChatConversation 插 AdHocTeamSection 时不得替换 AionrsChat/AcpChat 整个 JSX block；
2. AionrsChat 如需新增二开 props，只在现有 props 上追加，不重写 props type；
3. ConversationProvider value/deps 中 forkCapability 必须原样保留；
4. focused test 增“ad-hoc action 存在时 fork capability 仍传入 provider”的断言。

## 4.2 GroupedHistory manual unread + 删除保护

v2.1.56：

- `ConversationRow` 已有 `onToggleManualUnread/isManualUnread`；
- `types.ts` 的 `ConversationRowProps` 已有 manual unread props；
- `useConversationListSync` 有 persisted manual unread Set/localStorage；
- `useConversationActions` 保持当前删除流程，同时 surrounding hook 已与 unread 行为协作。

合并方案：

- `ConversationRowProps.onDelete` 从 `(conversation_id: string)` 扩为 `(conversation_id: string, extra?: TChatConversation['extra'])`，**只扩签名，不删除 unread props**；
- `ConversationRow` delete click 改为 `onDelete(conversation.id, conversation.extra)`；mark unread 菜单逻辑保持原样；
- `useConversationActions.handleDeleteClick` 接受 extra，先通过 ownership helper 判断 promoted source，再选择二开强警告或 upstream 普通警告；
- batch delete 不默认套用 promoted source 特殊确认，若 batch 中包含 promoted source，实施时应选择“阻止并提示”或“单独确认”之一，不能静默绕过保护；建议 P5-I 先保持 batch 逻辑不支持删除 promoted source并补测试。

## 4.3 useAcpConfigOptions pending-next-turn

v2.1.56 `4b0025897` 的关键状态机包括：

- per-conversation set status；
- pending value storage/listener；
- `confirmation === 'pending_next_turn'` 时 `markPending`；
- snapshot 保持旧 current value；
- observed 后 `resolvePendingFromSnapshot`；
- reload/set 都支持外部 `prepareRuntime/prepareSetRuntime/loadConfigOptions`。

二开只做一件事：**promoted source 不得通过默认 loader 启动 standalone runtime**。

禁止：

- 把 hook 替换成 redo 旧版本；
- 把 `ensureConversationRuntime` 简单全局替换为旧 `ensureStandaloneConversationRuntime` 而不考虑 `prepareRuntime` seam；
- 改 pending map/confirmation 判定。

## 5. GroupedHistory 非对称 ownership 设计

## 5.1 helper 输入输出契约

继续使用 redo `conversationTeamOwnership.ts`：

```ts
getTeamMemberId(extra) -> string | undefined       // 只读 team_id
getPromotedSourceTeamId(extra) -> string | undefined // 只读 teamId
isTeamMemberConversation(conversation) -> boolean
isPromotedTeamSourceConversation(conversation) -> boolean
isTeamRelatedConversation(conversation | undefined) -> boolean
```

规范：

- `team_id` = Team member/sidebar ownership marker；
- `teamId` = Team runtime binding / promoted source association；
- helper 只接受非空 string，空串不算 binding；
- 不提供“统一 normalize team id”的函数，防止未来误把两种语义合并。

## 5.2 useConversationListSync 接线

v2.1.56 当前：

```text
return extra?.is_health_check !== true && !extra?.team_id && !extra?.teamId
```

目标：

```text
return extra?.is_health_check !== true && !isTeamMemberConversation(conv)
```

重要：下方 responseStream known IDs 必须继续使用**未过滤的 items**，保留 upstream 防无限 refresh 逻辑。

manual unread 的 persisted Set/state 完整保留。

## 5.3 groupingHelpers 接线

不要在该文件再定义另一套 `isTeamConversation`。直接 import 统一 helper：

```text
visibleConversations = conversations.filter(c => !isTeamMemberConversation(c))
```

redo `1a7d1082c` 的语义可以保留，但实现上建议去重到统一 helper，避免 GroupedHistory 与 useConversationListSync 两份规则再次漂移。

## 5.4 ConversationSearchPopover 接线

搜索结果同样只过滤 member conversation：

```text
!isTeamMemberConversation(conversation)
```

promoted source 必须可搜索到。

## 6. runtime 接线收敛设计

## 6.1 为什么不继续旧 isTeamRunning prop 链

redo `d0beccbf8` 曾给：

```text
AcpChat -> AcpSendBox -> isTeamRunning
AionrsChat -> AionrsSendBox -> isTeamRunning
```

并直接把 SendBox `disabled` 与 `isTeamRunning` 绑定。

但 v2.1.56 已经原生有：

- `teamRuntime?: TeamSendBoxRuntime`；
- `teamRuntime.runtimeGate`；
- `teamSendMessage`；
- `teamRuntime.loading/isActive/onFocus/onStop/...`；
- `prepareRuntime/prepareSetRuntime/loadConfigOptions` seam。

因此旧 prop 链属于应淘汰的 adapter 形态。

## 6.2 新 runtime 规则

### 普通 standalone conversation

仍走 upstream `runtimeView` / `ensureConversationRuntime`。

### Team 页面内成员 conversation

继续由 `teamPermission` / `teamRuntime` 接管，完全使用 upstream。

### promoted source conversation

业务规则：来源会话已被 Team runtime 管理时，UI 的 config/model/send 准备动作不得私自创建第二套 standalone runtime。

设计落点：

1. ChatConversation 根据 `isPromotedTeamSourceConversation` + adHocTeam status 生成一个**source runtime adapter**；
2. adapter 向 Acp/Aionrs Chat 提供现有 `teamRuntime` / `prepareRuntime` 接口能表达的 gate；
3. SendBox 继续以 `teamRuntime.runtimeGate ?? runtimeView gate` 作为 command queue gate；
4. mode/model config 使用 `prepareRuntime/prepareSetRuntime` seam；
5. 只有无法通过现有 seam 表达的 standalone ensure 调用才使用一个很薄的 ownership-aware helper。

不要新增第二套 Team runtime state machine。

## 6.3 runtimeGate.ts 的定位

旧文件的核心规则可以保留：

```text
isPromotedTeamSourceConversation => skip ensureConversationRuntime
```

但建议在新实现中把它定位为**兼容 fallback helper**，而不是让所有 Chat/SendBox 都绕开 upstream teamRuntime。

验收条件：代码中不再新增 `isTeamRunning` props；grep `isTeamRunning` 不应出现为本轮新增链路。

## 7. Aionrs teammate_message 重放方案

v2.1.56 ACP 原生 case：

```text
case 'teammate_message':
  tmMsg = message.data as TMessage
  conversation_id 匹配
  text -> normalizeTextMessageContent
  mergeLiveMessage
```

redo Aionrs 当前为：

```text
case 'teammate_message':
  handleTeammateMessage(message)
```

并由 `useTeammateBackflow` 提供：

- conversation filter；
- msg_id dedup；
- text normalize；
- merge。

本轮设计：

1. Aionrs `useAionrsMessage.ts` 恢复 `teammate_message` case；
2. 可以继续调用 `useTeammateBackflow`，其 dedup 比 ACP upstream 当前实现更严格；
3. ACP 不接该 helper，避免双 merge；
4. 若未来要统一 ACP/Aionrs，必须另开 refactor，把 ACP 原生实现迁入共享 helper并同时删除旧 case，不能本轮双路并存。

测试：

- Aionrs same conversation backflow 显示；
- other conversation 忽略；
- same msg_id dedup；
- JSON/string text normalize；
- ACP 只出现一次消息。

## 8. i18n 完整缺口

### collaboration 13 键

见 §3.2，全部恢复到 13 locale。

### 其他二开 i18n 同步核对

虽然 P2 重点是 collaboration，P5-I 还应确认：

- `conversation.history.deleteTeamSourceTitle`
- `conversation.history.deleteTeamSourceConfirm`
- `conversation.history.deleteTeamSourceOk`
- `team.sider.adHocTooltip`
- `team.sider.deleting`
- `team.presets.*` 31 键

其中 Team Presets 多数在 redo 已完成；本轮只做 diff 校验，不重复覆盖 v2.1.56 上游 locale。

## 9. 建议 commit 划分

建议 7 个提交：

1. `feat(team-ui): restore shared ad-hoc and preset contracts`
   - types/bridges/mapper/ipc minimal changes + common adapter tests

2. `fix(i18n): restore ad-hoc collaboration messages`
   - 13 locale + key typing

3. `feat(team-ui): restore ad-hoc and preset standalone modules`
   - 四组件、hooks、ownership、Preset components

4. `feat(team-ui): reconnect ad-hoc conversation and history slots`
   - ChatConversation、TeamPage、Sider、GroupedHistory
   - 保留 fork/manual unread

5. `refactor(team-ui): adapt promoted source runtime to upstream teamRuntime`
   - Chat/SendBox runtime seam
   - 不新增 isTeamRunning prop chain
   - Aionrs teammate backflow

6. `feat(team-ui): restore deep team adapters`
   - TeamCreateModal、TeamSiderSection、useConversationActions、InlineAgentEditor、useAcpConfigOptions minimal guard

7. `test(team-ui): restore v2.1.56 ad-hoc and preset regression matrix`

如果 4/5 依赖太强可合并，但 C 级 TeamCreateModal/useAcpConfigOptions 不应提前混入。

## 10. 每层验证门禁

### Layer 1 contracts

```text
format/lint changed files
TypeScript check
common adapter 4 suites
```

### Layer 2 i18n

```text
bun run i18n:types
locale key presence check
```

### Layer 3 A modules

focused Vitest：AdHoc components/hooks/ownership/runtimeGate + TeamPreset component/hook tests。

### Layer 4 B slots

focused DOM：

- ChatConversation ad-hoc ACP/Aionrs；
- forkCapability 仍存在；
- GroupedHistory member hidden/promoted visible；
- manual unread toggle/persistence；
- TeamPage back origin；
- Sider delete state。

### Layer 5 runtime

- ACP Team runtime regression；
- Aionrs Team runtime regression；
- promoted source 不启动 standalone runtime；
- Team message 仍走 teamSendMessage；
- command queue gate 正确；
- Aionrs teammate backflow；
- ACP teammate_message 不重复。

### Layer 6 C-grade

- TeamCreateModal preset/editor DOM；
- TeamSiderSection；
- deleteTeamSource confirm；
- InlineAgentEditor behavior_policy roundtrip；
- useAcpConfigOptions pending-next-turn + promoted ownership guard。

### 最终 S3 前

按仓库脚本执行：

```text
format
lint
tsc
i18n checks
focused vitest
最终 desktop/unit 全量 test（若成本可接受）
```

任何 tsc 既有基线错误需单独记录，不通过新增 any/suppress 来规避。

## 11. C 级机械 patch 禁令的落实检查点

每个 C 级文件实施必须完成以下 5 步：

1. `git show v2.1.56:<path>` 读取目标宿主；
2. `git show 21d73ba45:<path>` 读取 redo；
3. `git diff v2.1.52..v2.1.56 -- <path>` 标记 upstream 新逻辑；
4. 只按业务意图手工插入最小块；
5. 实施后 `git diff v2.1.56 -- <path>` 人工核对“上游新增逻辑是否仍存在”。

对三大不可覆盖区增加硬检查：

```text
ChatConversation/AionrsChat grep forkCapability
GroupedHistory grep manualUnread/onToggleManualUnread
useAcpConfigOptions grep pending_next_turn/markPending/resolvePendingFromSnapshot
```

任一缺失即视为 merge 失败，即使测试暂时通过也不能提交。

## 12. 风险清单

| 风险 | 等级 | 防护 |
| --- | --- | --- |
| ChatConversation redo 覆盖 forkCapability | 高 | 三方合并 + grep 硬门禁 |
| GroupedHistory 覆盖 manual unread | 高 | props/state/storage 测试 + diff 审阅 |
| useAcpConfigOptions 覆盖 pending-next-turn | 高 | 只做最小 ownership adapter；禁止复制旧文件 |
| ACP teammate_message 双 merge | 高 | ACP 不接 useTeammateBackflow |
| Aionrs teammate_message 漏回流 | 高 | 恢复 case + dedup tests |
| 继续扩散 isTeamRunning prop 链 | 高 | 本轮新增 grep 应为 0；优先 teamRuntime seam |
| teamId/team_id 再次被统一过滤 | 高 | ownership helper 单一真相源 |
| promoted source config/model 查询启动 standalone runtime | 高 | prepareRuntime seam + ownership tests |
| TeamCreateModal modal 层叠回归 | 高 | 使用 21d73ba45 视觉基准 + DOM test |
| TeamSiderSection 重复 preset + | 中 | 保持 21d73ba45 单入口结论 |
| shared host 类型整文件覆盖 | 中 | field-level 三方合并 |
| i18n key typing 遗漏 | 中 | i18n:types 门禁 |

## 13. P5-I 实施前暂停点

进入产品代码修改前确认：

- [ ] Core P4 的最终 API DTO/route 已稳定，前端 bridge 字段不再变化；
- [ ] shared contracts 文件动作类型已确认；
- [ ] 13 个 collaboration key 的目标 locale 已确认；
- [ ] ChatConversation 251/311 forkCapability 列为不可覆盖；
- [ ] manual unread 四文件列为不可覆盖；
- [ ] pending-next-turn 状态机列为不可覆盖；
- [ ] ACP teammate_message 明确不重复重放；
- [ ] Aionrs teammate_message 明确恢复；
- [ ] runtime 方案明确“不新增 isTeamRunning prop 链”；
- [ ] ownership helper 作为唯一 teamId/team_id 语义入口；
- [ ] TeamCreateModal 使用 21d73ba45 而非更早 redo 版本；
- [ ] focused test 清单已准备。

## 14. P5-D 结论

AionUi v2.1.56 的 UI 重放难度主要不在 A 级模块，而在 5 个宿主融合点：

1. ChatConversation：AdHoc 双挂载与 forkCapability 共存；
2. GroupedHistory：manual unread 与非对称 ownership/删除保护共存；
3. runtime：把旧 isTeamRunning/standalone gate 收敛到 upstream `teamRuntime` seam；
4. useAcpConfigOptions：在不碰 pending-next-turn 状态机的前提下阻止 promoted source standalone runtime；
5. TeamCreateModal：保留 21d73ba45 已验证的 preset modal 层级与布局。

只要坚持“纯模块可复制、宿主只三方合并、上游新增逻辑硬门禁、runtime 不造第二套状态机”，v2.1.52 redo 资产仍能高比例复用，同时不会牺牲 v2.1.55/v2.1.56 的新增能力。
