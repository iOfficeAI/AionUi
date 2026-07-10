# 团队运行体验优化 · 技术设计

配套 PRD：`team-runtime-experience.md`。本文面向实现，给出现状调研结论、架构决策、模块设计、关键代码骨架与分阶段落地。全部为渲染层改动，不改 aioncore 与团队数据结构；持久化走 `localStorage`。

代码位置基准：`packages/desktop/src/renderer/`（下称 `@renderer`）。

---

## 0. 现状调研结论（决定架构的关键事实）

| #   | 事实                                                                                                                        | 出处                                                               | 对方案的影响                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------- |
| F1  | `TeamTabsProvider` 已是每团队一实例，已有按 `team_id` 分键的 localStorage（`team-active-slot-*`、`team-assistant-order-*`） | `hooks/TeamTabsContext.tsx:72,30-49`                               | 身份色映射、视图模式复用同一层与同款 key                             |
| F2  | 运行时事件 `ITeamAgentRuntimeStatusEvent` 带 `slot_id` + `status: 'pending'                                                 | 'ready'                                                            | 'failed'`                                                            | `common/types/team/teamTypes.ts:161` | **可单独判定 Leader ready** → warmup 闸门成立 |
| F3  | `membershipMutationBusy` 是全员聚合忙碌，不区分 Leader                                                                      | `hooks/teamMembershipMutationBusy.ts:51`                           | warmup 需在 session 层额外派生 leader-ready                          |
| F4  | teammate 消息只带 `senderConversationId`（无 `slot_id`）                                                                    | `chatLib.ts:117`、`MessageText.tsx:167`                            | **身份色按 conversation_id 取色**；需要 `conversationId→颜色` 的解析 |
| F5  | 发送框预填走 `getSendBoxDraftHook(type)(conversation_id).mutate(d=>({...d,content}))`，SWR 同 key 自动同步到 SendBox        | `hooks/chat/useSendBoxDraft.ts:93`、`TeamChatEmptyState.tsx:76-89` | 「告诉 Leader」直接复用，无需新机制                                  |
| F6  | 并行/全屏已有 `fullscreenSlotId`（TeamPageContent 本地 state）                                                              | `TeamPage.tsx:247,462-559`                                         | 升级为显式、持久化的 `viewMode`（不新造全屏逻辑）                    |
| F7  | 空状态 Leader 分支有 subtitle + 3 建议卡；建议卡 onClick=`fillDraft(label)`                                                 | `TeamChatEmptyState.tsx:157-178`                                   | Leader 问候语替换 subtitle，纯文案                                   |
| F8  | 选中/列高亮当前散落在 TeamPage（leader 硬编码 primary 色）与 TeamTabs（active class）                                       | `TeamPage.tsx:140-154`、`TeamTabs.tsx:107-108`                     | 身份色系统统一收口，替换这些硬编码                                   |
| F9  | 成员实例键为 `slot_id`；`conversation_id` 与 `slot_id` 在 `assistants[]` 上一一对应                                         | `TeamPage.tsx:294`、teamTypes                                      | 建 `conversationId→slot_id` 索引即可打通消息与成员                   |

**架构含义**：身份色的「真源」是 `slot_id`（成员实例），但消息侧只认 `conversation_id`。因此身份色系统对外暴露两个查询：`colorOf(slot_id)` 与 `colorOfConversation(conversation_id)`，内部用 `assistants[]` 维护 `conversation_id→slot_id` 索引打通。

---

## 1. 模块总览

```
TeamTabsProvider (已存在，每团队一实例)
├── useTeamMemberColors(team_id, assistants)     ← 新增：身份色真源 + 持久化
├── useTeamViewMode(team_id)                      ← 新增：并行/单聊，持久化
├── useTeamWarmup(team_id, leaderSlotId, statusMap) ← 新增：warmup 闸门/进度/超时
└── context 追加导出: colorOf / colorOfConversation / viewMode / setViewMode / warmup
```

新增纯函数 / 组件：

- `team/identity/teamMemberColors.ts` — 色板 + 分配算法（纯函数，可单测）
- `team/identity/TeamIdentityDot / useMemberColorVars` — 把颜色落成 CSS 变量的小工具
- `team/components/TeamMemberCapsuleBar.tsx` — 胶囊成员栏（替换现 TeamTabs 呈现）
- `team/components/TeamWarmupOverlay.tsx` — warmup 遮罩
- `team/components/TeamViewToggle.tsx` — 标题行视图切换
- 改造：`MessageText.tsx`（气泡色条+彩名）、`TeamChatEmptyState.tsx`（问候语 + 告诉 Leader）、`AssistantChatSlot`/`TeamPage`（列高亮用身份色）

设计原则：**身份色系统是唯一色源**，所有用色处（胶囊 / 气泡 / 列 / 遮罩）都从它取，杜绝各处硬编码 primary（消除 F8 的分散）。

---

## 2. 身份色系统（PRD §1）

### 2.1 色板（`teamMemberColors.ts`）

```ts
// 低饱和 slate 邻近色，取自 AionUi 品牌基调。每色给 accent(主) + soft(浅底) 两档，
// 浅底用 color-mix 在运行时算，故此处只存 accent（CSS 变量或 hex）。
export const TEAM_MEMBER_PALETTE = [
  'var(--brand)', // 0 = Leader 固定
  '#5c9ea4',
  '#b58a5e',
  '#9481bf',
  '#c07d97',
  '#6ba07e',
  '#4f8ac9',
  '#c99a4b',
] as const;
export const LEADER_COLOR_INDEX = 0;
```

深色模式：这些 hex 在深色下仍是中性可辨的低饱和色；如需微调，后续在 `default-color-scheme.css` 暗色块加对应 `--team-mX` 覆盖，`teamMemberColors` 改为引用 `var(--team-mX)`。首版直接用 hex，避免铺开主题工作量。

### 2.2 分配算法（钉死 + 释放复用，PRD §1）

真源是一张 `Record<slot_id, colorIndex>`，随成员列表增量维护：

```ts
// 纯函数：给定上次映射 + 当前成员列表 → 新映射
export function assignMemberColors(
  prev: Record<string, number>,
  assistants: { slot_id: string; role: string }[]
): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  // 1) Leader 固定 0
  const leader = assistants.find((a) => a.role === 'leader');
  if (leader) {
    next[leader.slot_id] = LEADER_COLOR_INDEX;
    used.add(LEADER_COLOR_INDEX);
  }
  // 2) 已有映射的沿用（钉死）
  for (const a of assistants) {
    if (a.slot_id in next) continue;
    const c = prev[a.slot_id];
    if (c !== undefined) {
      next[a.slot_id] = c;
      used.add(c);
    }
  }
  // 3) 新成员取「未占用的最小非0色号」，优先复用被释放的空档；超出则对长度取模循环
  let cursor = 1;
  for (const a of assistants) {
    if (a.slot_id in next) continue;
    while (used.has(cursor % TEAM_MEMBER_PALETTE.length) && used.size < TEAM_MEMBER_PALETTE.length - 1) cursor++;
    const idx = cursor % TEAM_MEMBER_PALETTE.length || 1; // 保底非0（0 属 Leader）
    next[a.slot_id] = idx;
    used.add(idx);
    cursor++;
  }
  return next;
}
```

> 注：移除成员时该 slot 不在 `assistants[]` 里 → 自然从 `next` 消失 = 释放；其余 slot 因走「沿用」分支而不变色。满足 PRD「别人增删不改变已有颜色」。循环仅在成员数超过色板时发生（罕见），循环项位置相隔远、不易混淆。

### 2.3 持久化与 Hook（`useTeamMemberColors`）

```ts
// key: team-member-colors-${team_id}，值 = Record<slot_id, colorIndex>
function useTeamMemberColors(team_id: string, assistants: TeamAssistant[]) {
  const key = `team-member-colors-${team_id}`;
  const [map, setMap] = useState<Record<string, number>>(() => readJSON(key, {}));
  useEffect(() => {
    setMap((prev) => {
      const next = assignMemberColors(prev, assistants);
      if (!shallowEqual(prev, next)) writeJSON(key, next);
      return next;
    });
  }, [assistants, key]);
  const convIndex = useMemo(
    () => Object.fromEntries(assistants.filter((a) => a.conversation_id).map((a) => [a.conversation_id, a.slot_id])),
    [assistants]
  );
  const colorOf = (slot_id?: string) => TEAM_MEMBER_PALETTE[map[slot_id ?? ''] ?? LEADER_COLOR_INDEX];
  const colorOfConversation = (cid?: string) => colorOf(convIndex[cid ?? '']);
  return { colorOf, colorOfConversation };
}
```

挂载点：`TeamTabsProvider`（已持有 `team_id` + `assistants`）。在 context value 追加 `colorOf` / `colorOfConversation`，供 TeamTabs、TeamPage 列、以及（通过一个轻量 context 或参数）MessageText 使用。

### 2.4 消息侧取色（F4 的解法）

`MessageText` 目前不在 TeamTabsProvider 子树内的保证性不足（它在会话渲染链里）。两个方案：

- **方案 a（推荐）**：team 会话渲染链上已知 `team_id` 与 `assistants`，在 `AssistantChatSlot → TeamChatView` 传入一个 `resolveSenderColor(senderConversationId)` 回调，透传到 MessageList/MessageText。改动局部、不引入全局 context。
- 方案 b：新建一个 `TeamIdentityContext` 提供 `colorOfConversation`，MessageText 里 `useContext`（可选、非 team 场景返回 undefined→不显示色条）。

首版走 a：沿现有 props 链把 `resolveSenderColor` 传到 MessageText；非团队消息该回调不存在 → 行为不变。

### 2.5 用色落地（CSS 变量注入）

统一做法：给需要着色的容器设 `style={{ '--mc': colorOf(slot_id) }}`，CSS 里用 `var(--mc)` + `color-mix` 出浅底：

- 胶囊底：`background: color-mix(in srgb, var(--mc) 9%, var(--bg-base))`；选中 16% + `box-shadow:0 0 0 1.5px var(--mc)`
- 列选中：`box-shadow: inset 0 0 0 2px var(--mc)`；列头 `color-mix(... 8% ...)`
- 气泡：发送者名 `color:var(--mc)`；气泡 `border-left:3px solid var(--mc)`

---

## 3. 视图切换（PRD §4）

`useTeamViewMode(team_id)`：`viewMode: 'parallel' | 'single'`，key `team-view-mode-${team_id}`，默认 `'parallel'`。挂 `TeamTabsProvider`，context 暴露 `viewMode/setViewMode`。

TeamPage 渲染改造：把现有 `fullscreenSlotId ? 全屏 : 并行` 的判断，替换为 `viewMode === 'single' ? 单列(activeSlotId) : 并行`。

- 单聊显示 `activeSlotId` 对应成员（复用现全屏那段 JSX，slot 来源从 `fullscreenSlotId` 换成 `activeSlotId`）。
- `fullscreenSlotId` 本地 state 移除；原「点全屏图标」改为「切到单聊 + switchTab 到该 slot」。
- 选中成员被移除时回退 Leader：已有逻辑 `TeamTabsContext.tsx:104-110` 覆盖。
- 视图切换控件 `TeamViewToggle` 放 ChatLayout 标题行右侧（`headerLeading` 对侧，需确认 ChatLayout 是否提供 title 右侧 slot；若无，作为 tabsSlot 区域右对齐元素）。

warmup 期间允许切视图：TeamViewToggle 不受 warmup 禁用影响。

---

## 4. Warmup（PRD §7）

### 4.1 派生 leader-ready（F2/F3）

`useTeamWarmup`（可并入 useTeamSession 或独立 hook，挂 provider）：

```ts
function useTeamWarmup(team_id, leaderSlotId, statusMap) {
  const [leaderReady, setLeaderReady] = useState(
    () => statusMap.get(leaderSlotId)?.status && statusMap.get(leaderSlotId)!.status !== 'pending'
  );
  const [timedOut, setTimedOut] = useState(false);
  const [leaderFailed, setLeaderFailed] = useState(false);
  useEffect(() => {
    const unsub = ipcBridge.team.agentRuntimeStatusChanged.on((e: ITeamAgentRuntimeStatusEvent) => {
      if (e.team_id !== team_id || e.slot_id !== leaderSlotId) return;
      if (e.status === 'ready') setLeaderReady(true);
      if (e.status === 'failed') setLeaderFailed(true);
    });
    const timer = setTimeout(() => setTimedOut(true), WARMUP_TIMEOUT_MS); // e.g. 20_000
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [team_id, leaderSlotId]);
  const phase = leaderReady ? 'ready' : leaderFailed ? 'error' : timedOut ? 'timeout' : 'warming';
  return { phase }; // 'warming' | 'ready' | 'error' | 'timeout'
}
```

> 需实现时校验：进入团队时 Leader 若已 ready，`statusMap` 初值是否已是非 pending（`useTeamSession.ts:41` 用 `team.assistants[].status` 初始化）—— 若后端在进入时不重发 ready 事件，靠初值判定；若重发，靠事件。两条都覆盖，故 `leaderReady` 初值也读 statusMap。

### 4.2 遮罩组件 `TeamWarmupOverlay`

- `phase==='warming'`：磨砂遮罩（`backdrop-filter:blur(3px)` + `bg color-mix(--bg-1 78%)`）+ 成员头像从左到右逐个点亮（依据各 slot 的 statusMap ready 数）+「唤醒中 N/M」+ 品牌色进度条。
- `phase==='error'|'timeout'`：错误态卡片（文案 + 重试/返回）。重试 = 重新触发进入团队的初始化（复用现有进入路径 / `useActiveLease` 重建；具体动作实现时定，不新增后端接口）。
- `phase==='ready'`：不渲染（撤除）。
- 渲染位置：TeamPageContent 内容区之上（`.warmwrap` 定位父级，覆盖 chat 区，不盖标题行——标题行的视图切换仍可用）。

### 4.3 禁用清单接线

warmup（`phase==='warming'`）期间：

- 加/删/改成员：已有 `membershipMutationBusy` 门控（`TeamTabs`、`TeamPage.handleRemoveAssistant:277`）；warmup 与之高度重合，保持即可。加号（TeamAddMemberPopover disabled）同理。
- 发消息：遮罩覆盖 chat 区（含 SendBox）→ 天然禁用，无需额外逻辑。
- 允许：切视图、切成员、滚动（这些控件在标题行/成员栏，不被遮罩覆盖）。

---

## 5. 成员栏胶囊化（PRD §2/§3）

`TeamMemberCapsuleBar`（替换 `TeamTabs` 的呈现，保留其 context 消费与 data-testid 契约）：

- 每成员 = 胶囊：`rav`(头像，无描边) + 名称 + `AgentStatusBadge` + 身份色浅底；hover 出重命名/移除小图标（复用现 `onRename`/`onRemove`/`membershipMutationBusy` 门控）。
- 选中态：底色加深 + `box-shadow:0 0 0 1.5px var(--mc)`。
- 溢出：横向滚动 + 两侧渐隐（复用现 `TAB_OVERFLOW_THRESHOLD` 逻辑）。
- 加号：`TeamAddMemberPopover` 固定最右、虚线胶囊样式，不随列表滚（wrap 成 `flex` 两段：左滚动列表 + 右固定加号，参照已实现的移动端加成员模式）。

**测试契约**：保留现有 `data-testid`（`team-tab-${slot_id}`、`team-tab-name-${slot_id}`、`team-tab-add-member`、`team-tab-remove-${slot_id}` 等），E2E/单测不破。若 DOM 结构变化影响 selector，同步更新对应测试（参照本仓既有 [E2E SYNC] 约定）。

---

## 6. 告诉 Leader（PRD §5）+ Leader 问候（PRD §6）

### 6.1 告诉 Leader

在 `TeamAssistantPickerDropdown` 底部 footer 已具备（前序已实现 header/footer 能力）。点击「告诉 Leader →」：

```ts
switchTab(leaderSlotId); // 选中 Leader
setViewMode('single'); // 切单聊全屏 Leader（可选，按体验）
// 预填 Leader 会话草稿（F5），不自动发
const draft = getSendBoxDraftHook(kindOf(leaderConv.type), initial)(leaderConv.conversation_id);
draft.mutate((prev) => ({ ...prev, content: t('team.addMember.tellLeaderPrefill') }));
```

文案 `team.addMember.tellLeaderPrefill` = 「帮我在团队里加一个擅长 \_\_\_ 的成员」。

### 6.2 Leader 问候

`TeamChatEmptyState.tsx:157-161` subtitle 替换为 B 版文案（新 i18n key `team.emptyState.leaderGreeting`）：「你好，我是 Leader，负责理解你的目标并协调团队。描述你想做的事，我来安排。」保留 3 建议卡不动。

---

## 7. i18n 新增 key（覆盖各 locale）

| key                                                                                                   | 用途            |
| ----------------------------------------------------------------------------------------------------- | --------------- |
| `team.view.parallel` / `team.view.single`                                                             | 视图切换标签    |
| `team.warmup.title` / `team.warmup.progress` (带 {n}/{m})                                             | 遮罩文案        |
| `team.warmup.timeout` / `team.warmup.leaderFailed` / `team.warmup.retry`                              | 错误态          |
| `team.member.startFailed` / `team.member.retry`                                                       | teammate 失败态 |
| `team.addMember.tellLeaderHint` / `team.addMember.tellLeaderCta` / `team.addMember.tellLeaderPrefill` | 告诉 Leader     |
| `team.emptyState.leaderGreeting`                                                                      | Leader 问候     |

准确翻译 en-US / zh-CN / zh-TW，其余 locale 英文兜底；改后跑 `node scripts/generate-i18n-types.js` + `node scripts/check-i18n.js`。

---

## 8. 分阶段落地与验收

每阶段：改动 → `bunx tsc --noEmit` + `oxlint` + 相关单测 + `bun run package` 起 dev/CDP 自查 → 交验收 → 通过后按聚焦 commit。

### 阶段 1 — 身份色系统 + 胶囊栏 + 气泡 + 选中态

1. `teamMemberColors.ts`（纯函数）+ 单测（分配/钉死/释放/循环用例）
2. `useTeamMemberColors` 挂 provider，context 暴露 `colorOf/colorOfConversation`
3. `TeamMemberCapsuleBar` 替换 TeamTabs 呈现（保留 testid）
4. TeamPage 列高亮改用 `--mc`（替换 F8 硬编码 primary）
5. MessageText 气泡色条+彩名（经 `resolveSenderColor` props 链，非团队不变）

- **验收**：多成员/同助手多实例下颜色清晰稳定；增删成员别人不变色；选中态明显。

### 阶段 2 — 视图切换

1. `useTeamViewMode` + `TeamViewToggle`（标题行右侧）
2. TeamPage 用 `viewMode` 替换 `fullscreenSlotId`

- **验收**：并行/单聊切换连贯、按团队记忆、选中态共享、移除回退 Leader。

### 阶段 3 — Warmup

1. `useTeamWarmup`（先校验 leader-ready 信号可取）
2. `TeamWarmupOverlay`（warming/error/timeout）+ 超时
3. teammate 失败态落到胶囊/列

- **验收**：Leader ready 即可用；某成员失败不卡死；超时有兜底；期间可切视图、发消息被挡。

### 阶段 4 — 告诉 Leader + Leader 问候

1. Dropdown footer 引导 + 点击预填切 Leader
2. 空状态问候语替换
3. i18n 收口

- **验收**：入口常驻可见、引导可切 Leader 预填不自动发、问候到位。

---

## 9. 风险与回归

- **测试契约**：胶囊栏替换 TeamTabs DOM，需同步 team 相关单测/E2E 的 selector（本仓有 [E2E SYnC] 约定）。
- **主题回归**：身份色用 hex + color-mix，深色模式需目视核对；多套自定义主题（discourse-horizon 等）用 `:has()` 覆盖过 modal，需确认不误伤团队页新类。
- **leader-ready 信号**：阶段 3 实现前必须先在代码/CDP 确认信号可取，否则 warmup 闸门方案需回退到「全员聚合 + 超时」。
- **性能**：身份色映射为 O(成员数) 纯函数，随 assistants 变化重算，无忧。
