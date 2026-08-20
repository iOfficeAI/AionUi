# AionUi 侧边对话（Side Conversation）实现规格

> 2026-08 重构版：基于上游原生 fork 体系（AionCore `POST /api/conversations/:id/fork` +
> `fork_capability` 能力上报），不再依赖自定义 AionCore side API。
> 历史方案（`agent_fork | text_snapshot` 双路径、`POST /api/conversations/:id/side`）已废弃。

## 1. 决策摘要

- **复用原生 fork（双模式）**：`resolveSideConversationMode` 决定创建方式——
  - `fork`：后端上报 `fork_capability`（claude / codex / Aion CLI…）→ `conversation.fork`
    （锚点=父会话最新消息）+ 渲染层在子会话 `extra` 上补 `side_mode` 标记；
  - `snapshot`：不支持 fork 但可对话的 agent（hermes / pi / 任意 ACP 自定义 agent）→
    `createWithConversation` 克隆父会话（同 agent 身份、清空历史）+ 一条框定的只读
    转录参考消息（`loadParentReferenceTranscript`，仅文本、40 条/2000 字符上限）。
    没有 per-backend 白名单；gemini/openclaw/nanobot/remote 等上游只读类型两种模式都不适用。
- **视觉上是干净的新线程**：fork 子会话继承的历史消息在 dock 里隐藏——子会话
  `extra.forked_at_msg_id` 作为边界（fork 拷贝的最后一行），MessageList 按
  `ConversationContext.sideForkBoundaryMsgId` 过滤掉边界及之前的所有行；上下文完整保留
  在后端 session 里。snapshot 子会话本来就无历史。
- **选中文本以引用胶囊交付**：划选 → 「在侧边会话中提问」→ `sendbox.reply.scoped`
  （按 conversation_id 定向）→ 侧边 composer 的既有 ReplyQuote 胶囊 UI（可移除，发送时
  作为引用前缀），绝不把原文灌进输入框；侧边 composer 同时忽略主线程的全局
  `sendbox.reply` 事件，互不串扰。发送时 SendBox 仍按既有线格式把引用拼成
  `> 行 + 空行 + 正文`（模型可见全文不变）；侧边会话渲染用户气泡时由
  `splitLeadingReplyQuote`（MessageText，按 `isSideConversation` 门控）把这段前缀
  剥出来渲染成单行截断的胶囊标签，正文里不再出现裸 `> ` 行。
- **桌面端自包含**：不需要 AionCore 配套 PR —— fork、clone、update(merge_extra)、
  getUserConversations、sendMessage 均为上游既有 API。
- **替代 /btw**：旧的 BtwOverlay 侧问（仅 claude、一次性 overlay、不留会话）整体移除，
  入口（slash 命令、选中文本）迁移到侧边对话。

## 2. 创建流程（桌面端）

1. 解析 fork 锚点：`resolveParentForkMsgId` 取父会话最新一条消息
   （HEAD-only 后端只能从最新分叉；`at_turn` 后端也接受最新，故锚点统一取最新）。
2. `ipcBridge.conversation.fork.invoke({ conversation_id, message_id })` → 得到子会话。
3. `conversation.update({ id: child.id, merge_extra: true })` 写入
   `{ side_mode: true, ephemeral: true, parent_conversation_id, forked_at_msg_id }`。
4. `ensureRuntime` 预热；若带初始提问（`/side <question>`）则 `sendMessage` 发出首条消息。
5. 追加 tab、写父会话 `extra.active_side_id / side_panel_hidden`（同样 merge_extra）。

错误映射复用 `getForkErrorMessage`（`FORK_*` 原因码）；父会话无消息时报
`conversation.sideConversation.parentEmpty`。

## 3. 数据模型（`common/config/storage.ts`）

`SideConversationExtra` 挂在所有会话变体的 `extra` 上（可选字段）：

| 字段                     | 位置 | 含义                                                 |
| ------------------------ | ---- | ---------------------------------------------------- |
| `side_mode`              | 子   | 标记 dock 侧边线程（区别于用户可见的"分叉为新会话"） |
| `ephemeral`              | 子   | 未"转正"的线程在历史列表中隐藏                       |
| `parent_conversation_id` | 子   | 父会话 id（恢复 tab 时过滤）                         |
| `forked_at_msg_id`       | 子   | 分叉锚点（信息性）                                   |
| `active_side_id`         | 父   | 当前激活的侧边 tab                                   |
| `side_panel_hidden`      | 父   | dock 折叠状态                                        |

服务端铸造的 `extra.fork`（`TConversationForkLineage`）原样保留 —— 转正后的线程在历史列表
里自动带上游的 fork 血缘徽标。

## 4. 恢复与生命周期

- **恢复**：挂载时 `database.getUserConversations` 全量拉取，按
  `isSideChildOf(conv, parent.id)`（`side_mode` + `parent_conversation_id`）过滤，
  `created_at` 排序；激活 tab 取父 `extra.active_side_id`，否则最后一个。
- **折叠**：`side_panel_hidden` 仅作恢复时的向后兼容读取；日常显隐由原生右侧栏折叠接管。
- **关闭 tab**：乐观移除 + `conversation.remove`，只影响该子会话。
- **转正（Keep）**：子会话 `ephemeral: false` —— 线程出现在历史列表（带 fork 徽标），
  不再被 `isEphemeralSideConversation` 过滤。
- **历史列表过滤**：`GroupedHistory/hooks/useConversationListSync.ts` 的
  `refreshConversations` 过滤 `isEphemeralSideConversation`。

## 5. 桌面端 UI

- **布局**：侧边会话不再使用独立 dock 列——它收进原生右侧栏（ExplorerContainer）的
  第三个顶级页签「侧边会话」（与 文件/变更 并列）。页签自带线程数角标（Arco Badge，
  0 时隐藏）与下拉菜单（Arco Dropdown）：每行一条线程（名称=首个提问，回退
  `tabLabel {{index}}`，当前高亮，行内 ✕ 关闭），分隔线后是「＋ 新建侧边会话」与
  「将当前侧边会话转为普通会话」（只作用于当前激活线程；无激活线程或已转正时禁用）。
  首次点击页签只激活面板，再次点击（或点 ▾）展开下拉。无项目/无工作区的会话只显示
  这一个页签。内容区直接就是子会话聊天（无大标题行、无胶囊 tab 条），切页签时保持
  挂载（display:none），流式订阅与草稿不断。
- **跨子树状态**：侧边状态机仍挂在 ChatConversation 的 wiring
  （`useSideConversationWiring`）里；ExplorerContainer 在项目会话下位于 Layout 级
  ProjectPanelHost（不同子树），所以 wiring 把线程列表 / 激活 id / 动作 /
  内容节点发布到模块级 `sideConversationUiStore`（`useSyncExternalStore`，
  按 `parentId` 匹配当前会话），ExplorerContainer 订阅渲染。入口动作（SendBox 触发、
  `Ctrl/Cmd + Shift + S`、`/side`、划选提问）同时派发
  `aionui-workspace-open`（只展开、绝不把可见侧栏合上的 explicit-open，
  由 useWorkspaceCollapse / useProjectPanelCollapse 处理）与
  `aionui-explorer-show-side`（ExplorerContainer 切到 side 页签）。
- **渲染子会话**：`SideConversationPanel/SideChildChat` 按子会话 type 分发到
  `AcpChat` / `AionrsChat`（`isSideMode` 紧凑布局 + `composerPrefix` 快捷提问位）。
  **不**向子会话传 `forkCapability` —— 消息级分叉入口会整页导航，不应出现在侧边线程内。
- **入口**：
  - SendBox 触发按钮（`side-btn-text`）与 `Ctrl/Cmd + Shift + S`；
  - `/side [question]` 内建 slash 命令（带提问时直接创建并发出首条消息）；
  - 划选文本浮层的「在侧边会话中提问」（`SelectionReplyButton`，以 ReplyQuote 胶囊
    挂到侧边 composer，不写入输入框、不发送）；
  - composer 上方的快捷 Prompt 轮播（26 个 key，每 30s 轮换 4 个，无边框图标、
    纯文字 999px 圆角药丸，悬停暂停）。
- **composer 投递**：`emitter` 新增 `sendbox.fill.scoped`（快捷 Prompt 文本填充）与
  `sendbox.reply.scoped`（选中文本 → 引用胶囊）两组事件及对应 ack——按 `conversation_id`
  定向到对应侧边 tab 的 SendBox（`conversationScopeId`），120ms 重试直至 ack（约 4.8s 上限）。
- **禁止嵌套**：侧边 composer（`isSideComposer` / `ConversationContext.isSideConversation`）
  不再展示任何侧边入口。
- **折叠语义**：`side_panel_hidden` 仅在恢复时读取（向后兼容）；面板的显隐由整条右侧栏
  的折叠接管，不再有 dock 级「折叠/重新打开」按钮。

## 6. 与上游 fork 入口的关系

|      | 消息级分叉（上游 #3843） | 侧边对话（本特性）                     |
| ---- | ------------------------ | -------------------------------------- |
| 入口 | 消息 hover 分叉按钮      | SendBox 按钮 / `/side` / 快捷键 / 选区 |
| 产物 | 普通会话，整页跳转       | dock 内多 tab，临时隐藏于历史          |
| 锚点 | 任意合法消息（按能力）   | 父会话最新消息                         |
| 标记 | `extra.fork` 血缘        | `extra.fork` + `side_mode` 等          |

## 7. Non-Goals

- 不做 mid-history 侧边分叉（锚点固定最新消息，保持两种 fork 入口语义清晰）。
- 不做侧边线程内的再分叉（不传 `forkCapability`）。
- team 会话不支持（后端不上报 fork 能力，自动满足）。
