# AionUi 侧边对话（Side Conversation）实现规格

> 2026-08 重构版：基于上游原生 fork 体系（AionCore `POST /api/conversations/:id/fork` +
> `fork_capability` 能力上报），不再依赖自定义 AionCore side API。
> 历史方案（`agent_fork | text_snapshot` 双路径、`POST /api/conversations/:id/side`）已废弃。

## 1. 决策摘要

- **复用原生 fork**：侧边线程 = `conversation.fork`（锚点=父会话最新消息）+ 渲染层在子会话
  `extra` 上补 `side_mode` 标记。没有第二条 fork 通路，没有 per-backend 白名单。
- **能力驱动**：入口可见性完全由会话详情响应的 `fork_capability` 决定
  （`common/chat/sideConversation.ts` → `isSideConversationSupported`）。claude / codex /
  Aion CLI 等后端只要后端上报能力即自动支持；team 会话与只读类型不上报能力，天然排除。
- **桌面端自包含**：不再需要 AionCore 配套 PR —— fork、update(merge_extra)、
  getUserConversations 均为上游既有 API。
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
- **折叠**：仅 UI 状态（`side_panel_hidden`），不删会话。
- **关闭 tab**：乐观移除 + `conversation.remove`，只影响该子会话。
- **转正（Keep）**：子会话 `ephemeral: false` —— 线程出现在历史列表（带 fork 徽标），
  不再被 `isEphemeralSideConversation` 过滤。
- **历史列表过滤**：`GroupedHistory/hooks/useConversationListSync.ts` 的
  `refreshConversations` 过滤 `isEphemeralSideConversation`。

## 5. 桌面端 UI

- **布局**：`ChatLayout` 新增 `sideDock / sideDockOpen` props，在聊天区与 workspace 栏之间
  渲染可拖拽列（`useResizableSplit`，storageKey `side-conversation-width-px`，仅桌面端）。
- **渲染子会话**：`SideConversationPanel/SideChildChat` 按子会话 type 分发到
  `AcpChat` / `AionrsChat`（`isSideMode` 紧凑布局 + `composerPrefix` 快捷提问位）。
  **不**向子会话传 `forkCapability` —— 消息级分叉入口会整页导航，不应出现在侧边线程内。
- **入口**：
  - SendBox 触发按钮（`side-btn-text`）与 `Ctrl/Cmd + Shift + S`；
  - `/side [question]` 内建 slash 命令（带提问时直接创建并发出首条消息）；
  - 划选文本浮层的「在侧边会话中提问」（`SelectionReplyButton`，填 composer 不发送）；
  - dock 头部的快捷 Prompt 轮播（26 个 key，每 30s 轮换 4 个）。
- **composer 填充**：`emitter` 新增 `sendbox.fill.scoped` /
  `sendbox.fill.scoped.handled`——按 `conversation_id` 定向到对应侧边 tab 的 SendBox
  （`conversationScopeId`），120ms 重试直至 ack（约 4.8s 上限）。
- **禁止嵌套**：侧边 composer（`isSideComposer` / `ConversationContext.isSideConversation`）
  不再展示任何侧边入口。

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
- 移动端不出 dock（入口在 `!isMobile` 下才出现）。
- team 会话不支持（后端不上报 fork 能力，自动满足）。
