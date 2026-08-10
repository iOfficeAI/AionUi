# 02 - 二开扩展包目录与 manifest/adapter 方案

> 目标：把 01 清单中的二开资产收敛为一个**可携带的源码扩展包**，使未来上游基线升级 = "替换宿主基线 → 重放扩展包 → 跑验证矩阵"，而非逐文件考古。
> 方案不新造概念：全部模式均已在当前 delta 中验证过（bridge 隔离、尾部追加块、锚点插入），本方案是把它们规范化、声明化。

## 1. 设计原则

1. **协议出口唯一**：所有后端交互只经 adapter 层（`adHocTeamBridge`/`teamPresetBridge` 模式），页面与组件禁止裸 HTTP/WS/IPC（沿用既有决策）。
2. **A 级资产目录自包含**：模块内只依赖宿主公开符号（类型、组件、hook），依赖在 manifest 中声明，搬运时按符号清单核对。
3. **B/C 级宿主侵入全部声明为 slot patch**：每个插入点记录宿主文件、锚点（anchor）、插入内容形态、冲突策略；不再靠人肉记忆"改了哪 25 个文件"。
4. **D 级资产不进源码包**：DB 迁移、版本钉版、bundle 配套属"版本窗口"产物，走 P0–P6 窗口流程与兼容矩阵，扩展包只记录其**要求**（如"需要 desktop DB ≥ v27 且含 origin_conversation_id"）。
5. **双仓成对**：扩展包 manifest 的 `host.aionui` 与 `host.aioncore` 版本钉版必须落在兼容矩阵同一行。

## 2. 目录结构（提案）

```
extensions/team-suite/                    # 二开扩展包根（名字待定，可先放仓内 extensions/）
├── manifest.json                         # 包清单（见 §3）
├── modules/                              # A 级：纯自有模块（整目录搬运）
│   ├── ad-hoc-team/
│   │   ├── adapter/                      # adHocTeamBridge.ts + adHocTeamTypes.ts
│   │   ├── components/                   # AdHocTeamSection/AgentSelectorModal/
│   │   │                               # CollaborationLauncher/TeamStatusCard
│   │   ├── hooks/                        # useAdHocTeamFromConversation.ts
│   │   │                               # useTeammateBackflow.ts
│   │   └── utils/                        # conversationTeamOwnership.ts runtimeGate.ts
│   └── team-presets/
│       ├── adapter/                      # teamPresetBridge.ts
│       ├── components/                   # TeamPreset*.tsx 平铺布局（形态基准
│       │                               # 见下方决策记录 DR-1）+ TeamPresetPanel
│       └── hooks/                        # useTeamPresets.ts
├── slots/                                # B/C 级：宿主插槽补丁（声明 + patch 正文）
│   ├── README.md                         # slot 应用顺序与冲突处理规程
│   ├── chat-conversation.slot.patch      # ChatConversation 两处 AdHocTeamSection 挂载
│   ├── acp-send-chain.slot.patch         # AcpChat/AcpSendBox isTeamRunning 链
│   ├── aionrs-platform.slot.patch        # AionrsChat/SendBox/useAionrsMessage
│   ├── acp-message-backflow.slot.patch   # useAcpMessage 回流抽 hook + runtimeGate（C 级）
│   ├── team-create-modal.slot.patch      # TeamCreateModal Tabs 双模式（C 级，最深改写）
│   ├── team-sider.slot.patch             # TeamSiderSection + SiderItem
│   ├── grouped-history.slot.patch        # GroupedHistory 6 文件过滤/删除确认
│   ├── team-page.slot.patch              # TeamPage headerLeading 返回按钮
│   ├── agent-capability.slot.patch       # acpTypes/agentTypes/InlineAgentEditor/
│   │                                   # useAcpConfigOptions 团队能力覆盖
│   └── shared-types.slot.patch           # teamTypes 尾块 + teamMapper 透传 + ipcBridge 挂载
├── i18n/
│   ├── keys.json                         # 49 个 key 的权威定义（按前缀分组）
│   └── locales/                          # 13 语言 × team/conversation 两模块的增量片段
├── migrations/                           # 仅声明与 SQL 引用，不直接进宿主树
│   ├── desktop/                          # migration_v27 片段（up/down）+ 编号重排规程
│   └── aioncore/                         # 038/039/040 SQL 引用（实体在 AionCore 仓；
│                                         # 编号属 v2.1.52 窗口，原版为 034/035/036，见 01 §5.3）
├── tests/                                # 27 个单测，目录镜像 modules/ 与 slots/
└── docs/                                 # 本目录（01/02）软链或拷贝
```

边界说明：

> **决策记录 DR-1（2026-08-10，leader 确认，依据来源审计 §7.2 升级为显式决策）**：扩展包 `team-presets` 模块以 **v2.1.52 worktree 平铺形态**（`pages/team/components/TeamPreset*.tsx`，重做提交 `f5ab5f9b2`/`16cceab84`/`9990640d6`）为收拢与对照基准，**舍弃 `e3f154559` 原版的 `TeamPresets/` 目录形态**。理由：新版宿主已按平铺落地并完成 P7 弹窗层级/对齐回归修复（`21d73ba45`），扩展包从现行宿主形态收拢比重构回目录形态成本低、冲突面小；原版目录形态不作为规范，但作为**规格证据**完整保留在 `设计规格归档/`（来源审计已核验其 e3 证据链未被污染）。后续若推翻本基准，需在此追加 DR-2 并同步 01 §2.4/§4 与 manifest。

- `modules/` 与宿主源码通过**构建期拷贝或 path alias**（如 `@ext/team-suite/*`）接入，保持文件物理独立；现阶段（未抽包前）可先以目录约定模拟——这正是 v2.1.52 worktree 把 presets 组件平铺进 `pages/team/components/` 的过渡形态，抽包时再收拢。
- `slots/` 采用"一宿主域一 patch"而非"一提交一 patch"（区别于 `patches/2026-07-30-*.patch` 的 format-patch 固化）：每个 slot patch 以宿主**结构锚点**（组件名/hook 名/JSX 容器）定位，基线漂移时按锚点重放，冲突即显式报出而非静默错位。
- slot 应用顺序沿用既有 `D → B → A → C` 思想：**shared-types → agent-capability → grouped-history → acp/aionrs/chat → team-*（modal/sider/page）**——类型先行，深改写的 C 级 slot 最后应用、逐个人工确认。

## 3. manifest.json（字段提案）

```jsonc
{
  "name": "@aionui-ext/team-suite",
  "version": "0.2.0",
  "host": {
    "aionui": "v2.1.52",          // 兼容矩阵同行的 AionUi 基线 tag
    "aioncore": "v0.1.62"         // 成对 AionCore tag；二者不得单独升级
  },
  "modules": [                     // A 级模块登记
    {
      "id": "ad-hoc-team",
      "path": "modules/ad-hoc-team",
      "exports": ["AdHocTeamSection", "useAdHocTeamFromConversation", "useTeammateBackflow", "conversationTeamOwnership", "runtimeGate", "adHocTeam"],
      "hostDeps": [                // 搬运时按此核对宿主符号存在性
        "@/common/adapter/httpBridge:httpGet,httpPost,withResponseMap",
        "@/common/adapter/teamMapper:fromBackendTeam",
        "@/common/types/team/teamTypes:TTeam,WorkspaceMode,TeamAssistant.conversation_id",
        "@/common/chat/chatLib:normalizeTextMessageContent",
        "@renderer/pages/conversation/Messages/hooks:useMergeLiveMessage",
        "@renderer/pages/team/hooks/useTeamAssistantOptions:default",
        "@renderer/pages/team/components/memberPicker/TeamAssistantPicker:default",
        "@renderer/components/base/AionModal:default"
      ],
      "contracts": {               // D 级契约引用（实体不进包）
        "rest": ["POST /api/teams/from-conversation", "GET /api/teams/by-conversation"],
        "ws": ["team.removed", "team.renamed", "team.agentStatusChanged", "team.sessionChanged", "team.teammateMessage", "team.runAccepted", "team.runStarted", "team.runUpdated", "team.runCompleted", "team.runCancelled", "team.runFailed", "team.childTurnStarted", "team.childTurnCompleted", "team.childTurnCancelled", "team.taskChanged"],
        "extraKeys": ["conversation.extra.teamId", "conversation.extra.team_id"]
      }
    },
    {
      "id": "team-presets",
      "path": "modules/team-presets",
      "exports": ["TeamPresetPicker", "TeamPresetPreview", "TeamPresetMemberList", "TeamPresetEditorModal", "TeamPresetPanel", "useTeamPresets", "teamPreset"],
      "hostDeps": ["@/common/adapter/httpBridge:httpGet,httpPost,httpPatch,httpDelete", "@renderer/hooks/context/AuthContext:useAuth", "@/common/utils/utils:uuid"],
      "contracts": { "rest": ["GET /api/team-presets", "POST /api/team-presets", "PATCH /api/team-presets/{id}", "DELETE /api/team-presets/{id}"] }
    }
  ],
  "slots": [                       // B/C 级宿主接点登记表（与 slots/*.patch 一一对应）
    { "id": "chat-conversation", "grade": "B", "hostFile": "packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx",
      "anchors": ["AionrsConversationPanel.headerExtra", "ChatConversation.rightSider 模型选择器行"], "onConflict": "manual" },
    { "id": "team-create-modal", "grade": "C", "hostFile": "packages/desktop/src/renderer/pages/team/components/TeamCreateModal.tsx",
      "anchors": ["desktopBody 左栏 Tabs", "mobileBody Tabs", "return fragment 双 Modal"], "onConflict": "manual", "note": "全 delta 最深改写；优先对照 v2.1.52 worktree 版本（平铺形态基准依据 DR-1）" },
    { "id": "acp-message-backflow", "grade": "C", "hostFile": "packages/desktop/src/renderer/pages/conversation/platforms/acp/useAcpMessage.ts",
      "anchors": ["case 'teammate_message'", "ensureRuntime 调用点 ×3"], "onConflict": "manual" },
    { "id": "shared-types", "grade": "C", "hostFile": "packages/desktop/src/common/types/team/teamTypes.ts",
      "anchors": ["TTeam.origin_conversation_id", "文件尾 Team presets 区块"], "onConflict": "append-tail" }
    // …其余 slot 同构登记（完整 12 项见 slots/README.md）
  ],
  "requires": {                    // D 级要求（窗口流程保证，包内不含实体）
    "desktopDb": { "minVersion": 27, "columns": ["teams.origin_conversation_id"], "numberingRule": "upstream-max+1, no reserved gaps" },
    "aioncoreMigrations": ["038_ad_hoc_team_origin_conversation", "039_team_presets", "040_backfill_formal_team_leader_team_id"],
                             // 编号属 v2.1.52 窗口（a887fc23 线）；原版 PIN-CORE eb0c884e 为同名 034/035/036，见 01 §5.3
    "bundleManifest": ["version", "sourceType", "source", "sha256"]
  },
  "i18n": { "namespaces": ["team", "conversation"], "keyPrefixes": ["team.presets.", "team.sider.adHoc", "conversation.collaboration.", "conversation.history.deleteTeamSource"] },
  "verification": {                // 一键验证入口（与 01 清单验证列对应）
    "unit": ["bun run test -- tests/unit/common-adapter tests/unit/renderer/conversation tests/unit/renderer/team tests/unit/process/services/database"],
    "types": ["bunx tsc --noEmit"],
    "i18n": ["bun run i18n:types", "node scripts/check-i18n.js"],
    "smoke": ["POST /api/teams/from-conversation", "GET /api/team-presets"]
  }
}
```

字段语义：`hostDeps` 解决"A 级模块对宿主的隐式符号依赖在升级时静默断裂"的问题——抽包工具可据此生成符号核对报告；`contracts` 把字符串硬契约（REST 路径、WS 事件名、extra 键名）从源码注释提升为机器可校验声明；`slots[].onConflict` 区分 `append-tail`（可自动重放）与 `manual`（必须人工）。

## 4. adapter 分层

```
┌─ modules（A 级，功能实现）────────────────┐
│  组件 / hooks / utils —— 只见 adapter 接口  │
├─ adapter（协议适配层）─────────────────────┤
│  adHocTeamBridge / teamPresetBridge        │
│  · 唯一许可的 httpBridge 消费方             │
│  · 负责 snake_case/别名/epoch 容错 mapper   │
│  · 经 ipcBridge 的 3+2 行挂载点注入宿主     │
├─ slot adapter（宿主接点适配层）─────────────┤
│  slots/*.patch + manifest.slots 登记        │
│  · B 级：锚点插入（追加式，可半自动重放）    │
│  · C 级：结构改写（人工合并，对照 worktree）│
├─ migration adapter（版本窗口层，包外）──────┤
│  desktop v27 片段 + AionCore 038/039/040    │
│  （编号属 v2.1.52 窗口；原版 034/035/036）   │
│  · 编号随上游窗口平移，checksum 同事务修复  │
│  · P0–P6 窗口流程 + 兼容矩阵 + 成对回滚     │
└────────────────────────────────────────────┘
```

与既有 AionCore 侧决策的对应：AionCore 的 `team_conversation_adapters.rs` 防腐层（领域服务不直接依赖 App 实现）与本包 `adapter/` 同构——双仓各守一层，契约只在 manifest `contracts` 与 AionCore OpenAPI/路由层交汇。

## 5. 与既有流程的衔接

- **升级窗口**：扩展包不改变 P0–P6 流程，只改变各阶段产物形态——P3（协议桥接）产出 adapter 重放报告，P4（UI）产出 slot 重放报告，P5 沿用成对 bundle 黑盒，P6 兼容矩阵追加一行扩展包 `version`。
- **迁移编号**：`requires.desktopDb.numberingRule` 固化"M+1 起、按依赖排序、不预留空号、已发布不改号"；AionCore 侧继续用 `repair-legacy-versions.sh` 处理存量库（该脚本为 v0.1.62 重做线资产，`e0e03ab8` 引入；原版 PIN-CORE 无此脚本，见 01 §5.3）。
- **补丁维护**：`patches/` 目录继续存放"单提交固化补丁"（历史重放输入），`slots/` 存放"结构锚点补丁"（前向重放输入）——两者职责不同，不互相取代。
- **验证**：`verification` 段与 01 清单的逐行"验证方式"对应，作为 S0–S5 暂停点的检查清单来源。

## 6. 落地路径（两步走，不阻塞当前窗口）

1. **仓内模拟（当前即可做，零构建改动）**：按 §2 目录约定整理文档与测试映射；把 01 清单的 B/C 接点逐一补写 `slots/*.slot.patch` 与锚点描述；v2.1.52 worktree 收口时优先将未提交的 AdHocTeam 组件按本结构归位。
2. **抽包（下一个产品窗口）**：引入 `@ext/team-suite/*` path alias 与构建期拷贝；写 manifest 生成/校验脚本（hostDeps 符号核对、contracts 字符串扫描）；把 `verification` 接入 `just push` 前置检查。

不做的事（防范围扩张）：不改宿主构建系统、不引入插件运行时、不动 web-host/mobile 包、不把 D 级实体迁入包内。
