# AionUi 侧边对话（Side Conversation）实现规格

| 字段     | 值                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------- |
| 状态     | **Accepted** — v0.2（双路径 fork + 多 tab 侧边）                                                  |
| 版本     | **0.2**                                                                                           |
| 上一版   | 0.1 禁止 text fallback、单 side 槽位 — 见 §15                                                     |
| 相关研究 | [codex-side-conversation-implementation.md](./research/codex-side-conversation-implementation.md) |
| 主要仓库 | AionCore（`.aioncore-explore` / 上游 `aioncore`）、AionUi Desktop                                 |

---

## 1. 决策摘要

侧边对话是 **即时、临时、旁路** 能力：不打断主会话，在独立上下文里提问。

**语义仍对齐 Codex**（fork 快照 + boundary + 不自动同步 fork 后主线新 turn），**产品形态宽于 Codex TUI**（允许多个侧边 tab 共存）。

### 1.1 Backend 双路径

| 路径                  | 条件                                                | 行为                                               |
| --------------------- | --------------------------------------------------- | -------------------------------------------------- |
| **A `agent_fork`**    | ACP 且 `initialize` 声明 `sessionCapabilities.fork` | `session/fork` + boundary                          |
| **B `text_snapshot`** | ACP 无 fork；**aionrs**（本 PR）                    | 子会话 + 主线 transcript 快照 bootstrap + boundary |

- 路径 B **一律**用于无 fork 的 ACP（含当前 Codex，直至 `codex-acp` PR 合并）。
- **禁止** silent 假 fork；`fork_mode` 必须回传，UI 对 B 显示轻提示（§7.5）。
- **并行 upstream**：`zed-industries/codex-acp`（ACP fork）、**aionrs**（原生 fork，可优于 Codex）。

### 1.2 多侧边 tab

- 同一父会话可有 **多个** side 子会话；**顶栏标签**切换。
- **关 tab** → discard **该** 子会话（删 DB + close session）。
- **关整个侧栏** → **仅隐藏面板**，tab 列表与活跃子会话 **保留**（不 discard）。
- 再开侧栏 → 恢复上次 tab 状态。

### 1.3 Non-Goals（不变）

- side 打开期间 **不** 自动 merge 主线 fork 后的新 turn。
- openclaw / nanobot / remote 本 PR 不承诺 side。

---

## 2. 产品语义

### 2.1 用户故事

| #   | 场景                     | 期望                                                                            |
| --- | ------------------------ | ------------------------------------------------------------------------------- |
| U1  | 主会话进行中开侧边       | 主线继续；侧边独立                                                              |
| U2  | 已有侧边，再点「新侧边」 | **新 tab** + 新 fork/快照（该时刻认知）                                         |
| U3  | 主会话选中文本           | 「引用」旁 **「在侧边会话中提问」** → 打开/聚焦侧边，**填入输入框，不自动发送** |
| U4  | 主线等待审批             | 侧边 footer 显示父状态（approval / running 等）                                 |
| U5  | 关某个 tab               | discard 该 side                                                                 |
| U6  | 关侧栏面板               | 隐藏 UI，tabs 保留                                                              |
| U7  | Agent 无 ACP fork        | 仍可用 side（路径 B）+ 轻提示「摘要模式」                                       |

### 2.2 认知边界

- **每个 tab 创建瞬间**：拥有该时刻主线认知（A=fork / B=快照）。
- **tab 保持打开、主线继续**：该 tab **不** 自动获得之后的主线 turn。
- **要更新认知**：**新开 tab**（或关旧 tab 再开）。

### 2.3 与 Codex CLI 差异（有意）

| Codex TUI     | AionUi v0.2        |
| ------------- | ------------------ |
| 同时一个 side | 多 tab             |
| `/side` slash | 按钮 + 选区 + 命令 |
| 仅 ThreadFork | A/B 双路径         |

---

## 3. Backend 策略

### 3.1 统一入口

```
POST /api/conversations/:parent_id/side
  → 父会话 AgentType
  → Acp: supports_session_fork ? 路径 A : 路径 B
  → Aionrs: 路径 B（并行推进原生 fork → 路径 A）
  → 其他: 422 SIDE_NOT_SUPPORTED（或入口灰掉）
```

### 3.2 Backend 矩阵

| 父类型                              | 本 PR | 机制                        |
| ----------------------------------- | ----- | --------------------------- |
| ACP + fork                          | ✅    | 路径 A                      |
| ACP 无 fork（codex、gemini、qwen…） | ✅    | 路径 B                      |
| **aionrs**                          | ✅    | 路径 B；上游 fork PR 后切 A |
| openclaw / nanobot / remote         | ❌    | Phase 3                     |
| legacy gemini                       | ❌    | 只读                        |

### 3.3 路径 B（text_snapshot）要点

- 从父会话生成 **只读 transcript 快照**（hidden bootstrap），附 boundary。
- **不** 在每条 side `send_message` 时重复 enrich。
- 子 `extra.fork_mode = 'text_snapshot'`。
- 质量低于 A，但可先上线 Codex / Gemini 等。

### 3.4 摘要模式提示（必须）

当 `fork_mode === 'text_snapshot'` 时，桌面端 **轻提示**（Toast 首次打开该 tab 或 panel 顶栏常驻小字，二选一实现，至少一种）：

- i18n key 示例：`sideConversation.snapshotModeHint`
- 中文：**「当前 agent 为摘要模式，完整 fork 待 CLI 升级」**

### 3.5 ACP fork capability 参考（源码审计）

| 声明 fork              | 未声明 fork（走 B）                            |
| ---------------------- | ---------------------------------------------- |
| Claude, OpenCode, Vibe | Codex, Gemini, Qwen, Kimi, Goose, CodeBuddy, … |

_Codex 原生 `/side` 不经 `codex-acp`；见 research 文档。_

### 3.6 Upstream（并行，不阻塞本 PR）

1. **`zed-industries/codex-acp`**：`fork: {}` + `session/fork` → Codex 切路径 A。
2. **aionrs**：同等或更强 side fork API → aionrs 切路径 A。

---

## 4. API 规格（AionCore）

### 4.1 `POST /api/conversations/:id/side`

#### Request

```typescript
type CreateSideConversationRequest = {
  guardrail?: 'reference_readonly';
  initial_prompt?: string;
  forked_at_msg_id?: string;
};
```

#### Response

```typescript
type CreateSideConversationResponse = {
  conversation_id: string;
  created: true;
  fork_mode: 'agent_fork' | 'text_snapshot';
};
```

**v0.2 变更：** 每次成功创建 **均为新子会话**（`created: true`），**不再**复用单一 `side_conversation_id` 返回 `created: false`。

#### 成功条件

1. 父会话存在；至少一条用户消息；父 agent 已 warm（有 session 或等价）。
2. 路径 A 或 B 成功创建子行 + boundary + 可选 `initial_prompt`。
3. **不** 要求更新父 `extra.side_conversation_id`（多 tab 以子行 `parent_conversation_id` 查询为准）。

#### 错误码

| HTTP | code                    | 条件                  |
| ---- | ----------------------- | --------------------- |
| 404  | —                       | 父不存在              |
| 422  | `SIDE_PARENT_NOT_READY` | 父未开始 / 无 session |
| 422  | `SIDE_NOT_SUPPORTED`    | 非 Acp / aionrs       |
| 502  | `SIDE_FORK_FAILED`      | 路径 A fork RPC 失败  |
| 502  | `SIDE_SNAPSHOT_FAILED`  | 路径 B 构建失败       |

_移除 v0.1 的 `SIDE_ALREADY_OPEN`、`SIDE_FORK_UNSUPPORTED`（无 fork 改走 B）。_

### 4.2 Discard

**按子会话 id discard**（推荐）：

- `DELETE /api/conversations/:child_id`（已有 remove）且 `extra.side_mode === true`，或
- `DELETE /api/conversations/:parent_id/side/:child_id`（若新增路由）

行为：interrupt → `session/close`（若 capability）→ 删子行；**不** 影响同父其他 side tab。

关侧栏 **不** 调用 discard。

### 4.3 列表（可选，Phase 1 可前端缓存）

`GET /api/conversations/:parent_id/sides` → 子会话 id 列表（`side_mode=true`）。

_若时间紧：桌面在内存维护 tab→childId，刷新时按 DB 查询恢复。_

### 4.4 废弃

| 项                                                             | 处理                     |
| -------------------------------------------------------------- | ------------------------ |
| `POST .../side-question`                                       | 兼容保留；新 UI 不用     |
| 父级单槽 `side_conversation_id`                                | 废弃写入；迁移可不删字段 |
| `ipcBridge.createSide` → `conversation.create` 无标注 fallback | 删除；统一 `POST /side`  |

---

## 5. 数据模型

### 5.1 父 conversation `extra`

| 字段                   | 说明                                               |
| ---------------------- | -------------------------------------------------- |
| `side_conversation_id` | **Deprecated**；v0.2 不以之为唯一 side             |
| `active_side_id`       | 可选；持久化最后活跃 tab（Phase 1 可仅前端 state） |

### 5.2 子 conversation `extra`

| 字段                     | 类型                              | 说明                                       |
| ------------------------ | --------------------------------- | ------------------------------------------ |
| `parent_conversation_id` | `string`                          | 父 id                                      |
| `side_mode`              | `true`                            |                                            |
| `ephemeral`              | `true`                            |                                            |
| `side_guardrail`         | `'reference_readonly'`            |                                            |
| `fork_mode`              | `'agent_fork' \| 'text_snapshot'` |                                            |
| `forked_at_msg_id`       | `string?`                         | 审计                                       |
| `parent_session_id`      | `string?`                         | A 路径                                     |
| `forked_from_session_id` | `string?`                         | A 路径                                     |
| `side_title`             | `string?`                         | 可选；tab 标签默认「侧边 1」或首条问题截断 |

**子 extra 复制规则：** 同 v0.1 §5.2（fork-safe only）。

### 5.3 多 tab 策略

- **新建 side** = 新 POST，新 child id，新 tab。
- **关 tab** = discard 该 child。
- **关 panel** = UI `panelVisible: false`，tabs 保留。

---

## 6. Agent 层（AionCore）

### 6.1 `open_session_fork`（路径 A）

同 v0.1 §6.1；`supports_session_fork` 探测后调用。

### 6.2 `create_side_snapshot`（路径 B）

- 构建父会话 transcript 快照 + boundary（hidden messages）。
- 子 agent：`session/new` 或等价；**不** 声称 agent_fork。
- aionrs / ACP 共用 service 层分支，agent 实现可不同。

### 6.3 Boundary

同 v0.1 §6.2 语义；**禁止** per-turn enrich。

### 6.4 流程

```
create_side_conversation(parent_id, req)
  ├─ validate parent
  ├─ branch: Acp | Aionrs | err
  ├─ if supports_session_fork → A: open_session_fork
  │   else → B: build_text_snapshot
  ├─ create child conversation + bind agent
  ├─ insert boundary (+ snapshot if B)
  └─ return { conversation_id, fork_mode, created: true }
```

---

## 7. 桌面端（AionUi Desktop）

### 7.1 规范（必须遵守）

实现可视化内容时遵循项目约定（`AGENTS.md`）：

| 项     | 要求                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| 组件   | `@arco-design/web-react`；禁止 raw `<button>` / `<input>` 等                                    |
| 图标   | `@icon-park/react`                                                                              |
| 样式   | UnoCSS 语义 token；复杂样式用 `ComponentName.module.css`                                        |
| 文案   | **全部 i18n**（`sideConversation` 或 `conversation` 模块）；`bun run i18n:types` + `check-i18n` |
| 结构   | 目录 ≤10 子项；见 `architecture` skill                                                          |
| 输入框 | **高度与主会话 Composer 一致**（修当前 side 偏高问题）                                          |

### 7.2 布局

| 元素     | 位置 / 行为                                           |
| -------- | ----------------------------------------------------- |
| 侧栏入口 | 主 Composer：**`+` 号右侧**                           |
| 侧栏     | 停靠列；顶栏 **Tab**（可关闭单 tab）                  |
| 关 panel | 折叠/隐藏侧栏，**保留 tabs**                          |
| 父状态   | Header / footer：`parentRunning`、pending approval 等 |

### 7.3 选区菜单

主会话消息/输入选区浮动菜单：

- 保留 **「引用」**
- 新增 **「在侧边会话中提问」**（i18n）
- 行为：若无 panel 则打开；无 tab 则 `POST /side`；将选中文本 **填入** 当前 tab 的 composer，**不自动发送**

### 7.4 快捷 prompt（轮播）

**场景：** 侧边是「旁路问一句」，不是第二条完整聊天。文案应贴近：

- 澄清主线、审批前问一句、选中片段什么意思、会不会打断主线、帮写回主线的简短问题等。

**交互：**

- 维护 **prompt 池**（≥12 条，i18n，见 §7.6）。
- 输入框上方 **同时只展示 3 条** chip（Arco `Tag` / 小 `Button`）。
- **轮播**：每 8s 轮换下一组 3 条（或侧栏每次展开时 shuffle 一组）；动画轻量，避免布局跳动（固定一行高度）。
- 点击 chip → 填入 composer，不发送。

### 7.5 摘要模式 UI

- `fork_mode === 'text_snapshot'`：显示 §3.4 轻提示。
- 可选：tab 上小图标区分 A/B（Phase 1.1）。

### 7.6 快捷 prompt 池（i18n key 建议）

模块：`sideConversation.quickPrompts.*`

| key                  | 中文意图（贴近 side 场景）                            |
| -------------------- | ----------------------------------------------------- |
| `clarifyMain`        | 主线刚才那段话，用更简单的话再说一遍                  |
| `safeToContinue`     | 我现在能批准主线继续吗？会有什么风险？                |
| `meaningOfSelection` | 我选中的这段，在主线里具体指什么？                    |
| `sideQuestionDraft`  | 帮我想一个**不会打断主线**的问法，我去侧边问          |
| `willThisInterrupt`  | 要是我在主线里做 X，会不会破坏当前计划？              |
| `explainErrorOnly`   | 只解释主线上**最后一条报错**，别改代码                |
| `approvalContext`    | 主线在等审批：侧边里我该先确认哪几件事？              |
| `compareOptions`     | 主线提到的 A/B 方案，对比优缺点（**不要**替我做决定） |
| `whatDidIMiss`       | 开这个侧边前，主线有没有我漏掉的关键步骤？            |
| `oneSentenceStatus`  | 主线现在进行到哪一步了？一句话                        |
| `pasteBackToMain`    | 把侧边结论整理成**可粘贴回主线**的短消息              |
| `scopeCheck`         | 这个问题该在侧边问，还是该回主线问？                  |
| `readonlyConfirm`    | 确认：侧边**不会**改仓库、不会继续执行主任务          |

_实现时从中随机取 3 条展示；英文等语言按同一意图翻译。_

### 7.7 状态机（修订）

```
panelHidden ⇄ panelVisible
  tabs: [ { id, childId, forkMode, title } ... ]
  activeTabId
  tab close → DELETE child / discard
  new tab → POST /side
```

`discarded` tab 从列表移除。`promote` Phase 1 隐藏入口。

---

## 8. 测试

| 区域     | 用例                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| AionCore | A 路径 fork；B 路径 snapshot；aionrs B；多 child 同父                             |
| Desktop  | 多 tab；关 tab discard；关 panel 保留；选区填入不发送；轮播 prompt；composer 等高 |
| i18n     | 新 keys 全语言                                                                    |

---

## 9. 实施阶段

### Phase 1 — v0.2 MVP

- [ ] AionCore：双路径 + aionrs B + 多 child
- [ ] Desktop：tab 侧栏 + UI §7 + i18n
- [ ] 移除 silent createSide fallback
- [ ] 起草 codex-acp / aionrs upstream issue
- [ ] Smoke：Claude (A)、Codex (B)、aionrs (B)

### Phase 2

- [ ] 父状态 SideParentStatus 完整
- [ ] `GET .../sides` 或刷新恢复
- [ ] aionrs / codex 切路径 A 后去掉 B 提示（可选）

---

## 10. 与「分支对话」PR 的关系

本 PR 沉淀：**父/子 conversation、fork 探测、fork_mode、ephemeral、分屏+多 tab composer、boundary**。

分支 PR 可复用并扩展：**持久分支、树 UI、promote/merge** — 不必重做 fork 管线。

---

## 11. 开放问题

| ID  | 问题                    | 倾向                             |
| --- | ----------------------- | -------------------------------- |
| O1  | tab 标题自动生成规则    | 首条用户消息前 20 字或「侧边 N」 |
| O2  | 轮播 8s 是否可配置      | Phase 1 固定 8s                  |
| O3  | snapshot 快照最大 token | 截断 + 注明「更早消息已省略」    |

---

## 12. 术语表

| 术语     | 含义                                       |
| -------- | ------------------------------------------ |
| 路径 A   | `agent_fork`，ACP `session/fork`           |
| 路径 B   | `text_snapshot`，transcript 快照 bootstrap |
| 关 tab   | discard 该子会话                           |
| 关 panel | 仅隐藏侧栏 UI                              |

---

## 13. 一句话

**AionUi 侧边对话 = 多 tab 临时子会话 +（有 fork 则 A，否则 B）+ boundary；关 tab 丢弃，关 panel 只隐藏；UI 遵循 AionUi 规范与 i18n。**

---

## 14. Upstream 备忘

- [ ] PR/issue：`zed-industries/codex-acp` — `session/fork`
- [ ] PR/issue：**aionrs** — native side fork

---

## 15. v0.1 → v0.2 变更记录

| v0.1                      | v0.2                                      |
| ------------------------- | ----------------------------------------- |
| 无 fork → 422             | 无 fork → **路径 B**                      |
| 单 `side_conversation_id` | **多 tab** 多 child                       |
| 关 side = discard 全部    | **关 tab = discard**；**关 panel = 隐藏** |
| 禁止 enrich               | **允许** 一次性 snapshot（B）             |
| aionrs Phase 2            | aionrs **B 在本 PR**                      |
| 无选区/轮播 prompt        | §7.3–7.6                                  |
| Composer 侧栏按钮位置未定 | **`+` 右侧**                              |

---

## 16. 旧版一句话（v0.1，已废止）

~~不支持则明确失败，不用文本 enrich 冒充 fork。~~ → 见 §13。
