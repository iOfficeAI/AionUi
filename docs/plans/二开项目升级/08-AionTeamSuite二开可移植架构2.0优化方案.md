# 08 - AionTeamSuite 二开可移植架构 2.0 优化方案

> 日期：2026-08-18
>
> 背景基线：AionUi `v2.1.56` × AionCore `v0.1.67` 二开升级已完成候选版收口、生产包打包、真实生产数据库 migration repair 与启动验证。
>
> 本文用途：作为下一阶段“二开可移植架构优化”的统一基线设计文档。后续所有架构重构、目录演进、能力抽离、升级工具化，都应优先对齐本文目标、边界和分阶段计划。

---

## 1. 背景与问题定义

本轮升级最终证明，当前 AionTeamSuite 已经解决了“二开能力容易遗漏、历史修复容易丢失、迁移经验难复用”的问题，但尚未完全解决“升级时仍需大量重新编码与三方合并”的问题。

当前更准确的状态是：

> AionTeamSuite 已经是“可恢复二开资产库”，但还不是“低成本可升级二开运行时”。

本轮正式收口的产品改动规模：

```text
AionUi   78 files
AionCore 40 files
```

其中当然包含测试、i18n、migration 等，但仍然清楚暴露出一个结构性问题：大量二开逻辑直接长在 AionUi / AionCore 上游宿主文件中。

典型宿主触点包括：

```text
AionUi
- ChatConversation.tsx
- TeamSiderSection.tsx
- TeamCreateModal.tsx
- TeamPage.tsx
- conversation history / runtime / agent hooks

AionCore
- service.rs
- provisioning.rs
- routes.rs
- state.rs
- repository/*
- api-types/*
- migrations/*
```

只要 upstream 继续迭代，这些宿主文件就会变化，导致下一次升级仍然需要：

```text
旧资产对线
→ 理解历史语义
→ 找新版宿主锚点
→ 人工三方合并
→ 重新编码
→ 重新测试
```

下一阶段目标就是把这条链路尽可能压缩。

---

## 2. 总目标

将二开从：

> 散落在 AionUi / AionCore 宿主里的定制修改

逐步重构为：

> 二开自有能力模块 + 少量稳定宿主 Slots / Ports + 版本 Adapter + 自动化升级工具链

最终把未来升级从“代码迁移工程”降级为“兼容性适配工程”。

目标体验：

```text
checkout 新 AionUi / AionCore
        ↓
upgrade doctor
        ↓
同步 owned runtime
        ↓
自动生成 migration
        ↓
检查 host slots / ports
        ↓
只修 Yellow / Red adapter
        ↓
focused contracts
        ↓
full tests
        ↓
production DB preflight
        ↓
build package
        ↓
production acceptance
```

而不是继续依赖大量旧代码人工重放。

---

## 3. 目标总体架构

```text
┌─────────────────────────────────────┐
│        AionUi / AionCore upstream   │
│          尽量保持原生宿主            │
└─────────────────┬───────────────────┘
                  │
          少量 Stable Slots / Ports
                  │
┌─────────────────▼───────────────────┐
│        Host Adapter Layer           │
│  AionUi vX / AionCore vY 版本适配层  │
└─────────────────┬───────────────────┘
                  │
          稳定的二开能力接口
                  │
┌─────────────────▼───────────────────┐
│          AionTeam Runtime           │
│                                     │
│ AdHoc Team │ Presets │ Binding      │
│ Model      │ Events  │ Lifecycle    │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│     Migration / Compatibility       │
│ semantic migration / repair / doctor│
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│             Test Contracts          │
│ unit / integration / production gate│
└─────────────────────────────────────┘
```

原则：上游负责宿主能力和正式 Team Runtime；AionTeamSuite 负责二开 orchestration、preset、binding、model policy、integration 与兼容规则。

---

## 4. 统一代码归属模型

以后每一处二开代码必须明确归属，不再只用 `copyable=true/false` 表示。

只允许以下四类：

| 类型 | 所有者 | 下次升级处理方式 |
|---|---|---|
| `owned` | AionTeamSuite | 原样复用 / 同步 |
| `adapter` | AionTeamSuite | 针对新版宿主调整 |
| `slot` | AionUi / AionCore | 极少量人工接线 |
| `generated` | 工具生成 | 自动重新生成 |

示例：

```text
AdHocTeamSection.tsx        → owned
TeamStatusCard.tsx          → owned
TeamPresetPicker.tsx        → owned
preset_service.rs           → owned
ChatConversation 挂载点     → slot
AionCore router 注册点       → slot
AionUi v2.1.56 bridge        → adapter
migration 语义               → owned
migration 数字编号           → generated
```

此模型将成为 Phase 0 架构盘点的核心分类标准。

---

## 5. UI 架构优化目标

### 5.1 当前可优先抽离的 UI Owned Modules

本轮已确认大量代码本质上属于二开自有模块：

```text
AdHocTeam/
- AdHocTeamSection.tsx
- AgentSelectorModal.tsx
- CollaborationLauncher.tsx
- TeamStatusCard.tsx

Team Preset/
- TeamPresetEditorModal.tsx
- TeamPresetEmptyState.tsx
- TeamPresetMemberList.tsx
- TeamPresetPanel.tsx
- TeamPresetPicker.tsx
- TeamPresetPreview.tsx

Hooks / Utils / Bridge
- adHocTeamBridge.ts
- teamPresetBridge.ts
- adHocTeamNaming.ts
- useAdHocTeamFromConversation.ts
- useTeammateBackflow.ts
- conversationTeamOwnership.ts
- runtimeGate.ts
```

目标形态：

```text
packages/aion-team-extension-ui/
├─ src/
│  ├─ adhoc/
│  ├─ presets/
│  ├─ components/
│  ├─ hooks/
│  ├─ bridge/
│  ├─ model/
│  ├─ runtime/
│  ├─ ports/
│  └─ index.ts
└─ tests/
```

这些模块由 AionTeamSuite authoritative source 管理，通过同步/materialize 进入宿主，不允许形成脆弱的本地绝对路径依赖。

### 5.2 UI 稳定 Slots 目标

第一版目标控制在 3～5 个宿主 Slot：

#### U1 Conversation Slot

负责：

```text
普通会话
→ 临时 Team 创建
→ Team 状态
→ collaboration launcher
```

目标宿主形态类似：

```tsx
<AionTeamConversationExtension conversation={conversation} />
```

#### U2 Sidebar Slot

负责：

```text
Team list
实时刷新
Team identity
```

#### U3 Team Page Slot

负责：

```text
Preset Panel
Preset Picker
Team Create 扩展
```

#### U4 Conversation Metadata Slot

负责 history filter、team ownership、source conversation 等宿主接线。若后续可通过 Adapter 消除，则继续收敛。

#### U5 Agent Model Slot

仅保留真正需要读取宿主 Agent catalog / model metadata 的接口。

### 5.3 UI Ports

Owned UI 不直接依赖宿主 IPC / SWR / router / Aionrs 具体实现，而通过稳定 Port：

```ts
interface TeamHostPort {
  createAdHocTeam(...)
  getAdHocAssociation(...)
  removeTeam(...)
  listTeams(...)
}

interface TeamPresetPort {
  listPresets(...)
  createPreset(...)
  updatePreset(...)
}

interface AgentCatalogPort {
  listSelectableAgents(...)
}

interface TeamRealtimePort {
  subscribe(...)
}

interface NavigationPort {
  openTeam(...)
  openConversation(...)
}
```

升级到新 AionUi 时，优先只调整 `aionui-vX-adapter`，不修改 Owned Runtime。

---

## 6. Core 架构优化目标

Core 是下一阶段最重要、风险也最高的优化区域。

目标是建立独立二开 crate，概念结构：

```text
crates/aion-team-extension/
├─ src/
│  ├─ adhoc/
│  │  ├─ lifecycle.rs
│  │  ├─ create.rs
│  │  ├─ remove.rs
│  │  └─ naming.rs
│  ├─ presets/
│  │  ├─ service.rs
│  │  └─ types.rs
│  ├─ binding/
│  │  └─ conversation.rs
│  ├─ model/
│  │  └─ resolver.rs
│  ├─ ports/
│  ├─ routes/
│  ├─ events/
│  └─ lib.rs
└─ tests/
```

### 6.1 Core Extension 只依赖稳定 Ports

建议逐步形成：

```rust
trait TeamRepositoryPort
trait ConversationBindingPort
trait AssistantCatalogPort
trait TeamEventPort
trait AgentProvisioningPort
trait TeamSessionPort
trait TeamRuntimePort
```

Extension 只表达业务意图，例如：

```text
remove ad-hoc team
→ stop session
→ preserve origin conversation
→ unassign binding
→ delete team
→ broadcast event
```

具体 SQLite / AppState / Router / Provisioning 实现由宿主 Adapter 完成。

### 6.2 Core 稳定接线点目标

目标控制在约 5～6 个：

#### C1 App State Adapter

将宿主 AppState 包装为 Extension Ports。

#### C2 Router Registration

宿主只负责类似：

```rust
router.merge(aion_team_extension::routes(...))
```

Preset / AdHoc routes 由扩展自身维护。

#### C3 Formal Team Gateway

不复制 upstream Team Engine，而建立稳定 façade：

```rust
trait TeamRuntimePort {
    create_team(...)
    add_member(...)
    start(...)
    stop(...)
    remove(...)
}
```

#### C4 Assistant Catalog Adapter

宿主负责提供 preferred model；二开业务不直接解析宿主内部结构。

#### C5 Conversation Binding Adapter

统一 source conversation Team metadata 的 assign/unassign 语义。

#### C6 Migration Integration

由单独 Migration Compatibility 层负责。

### 6.3 Core 抽离优先顺序

禁止一次性 Big Bang。

优先：

```text
Preset Service
→ Conversation Binding
→ Model Resolution
→ AdHoc Lifecycle
```

其中 `preset_service.rs` 是第一批最适合作为 owned code 抽离的模块。

---

## 7. Migration Compatibility 2.0

### 7.1 migration 资产改成“语义迁移”

不再把：

```text
039
040
041
042
```

视为长期资产。

真正长期资产是：

```text
ad-hoc-team-origin-conversation
team-presets
formal-team-leader-team-id
remove-orphan-team-binding
```

概念定义：

```yaml
id: team-presets
depends_on:
  - ad-hoc-team-origin-conversation
sql:
  sqlite: ...
```

升级工具负责读取新 upstream max 并自动 materialize：

```text
upstream max = M
→ M+1_ad_hoc_team_origin_conversation.sql
→ M+2_team_presets.sql
→ M+3_backfill_formal_team_leader_team_id.sql
→ M+4_remove_orphaned_team_conversation_bindings.sql
```

### 7.2 Repair Mapping 自动生成

历史 adaptation manifest 保存历史语义 ID 与旧版本号。

新 target numbering 生成后，工具自动推导：

```text
historical version → semantic id → new target version
```

repair 仍必须保留：

```text
description
+ SHA-384
+ success=1
```

严格白名单校验，但映射不再人工硬编码。

### 7.3 生产数据库 Preflight 固定 Gate

在生产安装之前，必须对真实生产数据库副本执行：

```text
读取 _sqlx_migrations
→ 检查 historical adaptation
→ 检查 target migration window
→ dry-run repair
→ backup strategy
→ compatibility verdict
```

生产库 repair 仍遵循：

```text
自动 .backup
→ metadata remap
→ post-check
→ 正常 AionCore migrator
→ pending migration success=1
```

---

## 8. Capability Manifest 2.0

AionTeamSuite 不再只保存旧文件列表，而是逐步建立能力依赖图。

建议能力拆分：

```text
ad-hoc-team
team-presets
conversation-binding
model-preference
realtime-team-sync
migration-compat
```

示例：

```yaml
capability: ad-hoc-team

owned:
  ui:
    - components/*
    - hooks/*
  core:
    - lifecycle/*
    - model/*

ui_ports:
  - TeamHostPort
  - AgentCatalogPort
  - RealtimePort

core_ports:
  - TeamRuntimePort
  - ConversationBindingPort
  - AssistantCatalogPort
  - EventPort

host_slots:
  ui:
    - conversation
    - sidebar
  core:
    - app_state
    - router

migrations:
  - ad-hoc-team-origin-conversation

events:
  publishes:
    - team.created
    - team.removed

contracts:
  - create-is-active
  - preferred-model
  - same-name-id
  - realtime-sidebar
  - delete-unbind
```

以后 Agent 升级时，应首先读取 capability dependency graph，而不是直接浏览一堆旧代码。

---

## 9. AionTeamSuite 目录演进建议

保留现有 curated / adaptations 作为历史证据链，不删除、不覆盖。

在其上新增可执行架构：

```text
AionTeamSuite/
│
├─ capabilities/
│  ├─ ad-hoc-team/
│  ├─ team-presets/
│  ├─ conversation-binding/
│  ├─ model-preference/
│  ├─ realtime-team-sync/
│  └─ migration-compat/
│
├─ runtime/
│  ├─ ui/
│  └─ core/
│
├─ host-adapters/
│  ├─ aionui/
│  │  └─ v2.1.56/
│  └─ aioncore/
│     └─ v0.1.67/
│
├─ migrations/
│  ├─ definitions/
│  ├─ repair/
│  └─ preflight/
│
├─ upgrade/
│  ├─ doctor/
│  ├─ sync/
│  ├─ materialize/
│  └─ verify/
│
├─ contracts/
│
├─ packages/
│  ├─ adaptations/       # 现有 validated adaptation 继续保留
│  ├─ aionui/            # 原 curated evidence
│  └─ aioncore/          # 原 curated evidence
│
└─ docs/
```

目录最终结构可在 Phase 1 细化，但“历史证据层”和“可执行二开层”必须明确分离。

---

## 10. authoritative source 与宿主同步策略

禁止让 AionUi / AionCore build 直接依赖：

```text
../../AionTeamSuite/...
```

或其他机器相关绝对路径。

推荐：

> AionTeamSuite authoritative source + generated/vendor sync

例如：

```text
AionTeamSuite/runtime/ui
        ↓ materialize
AionUi/packages/aion-team-extension
```

```text
AionTeamSuite/runtime/core
        ↓ materialize
AionCore/crates/aion-team-extension
```

宿主中的生成目录必须标记：

```text
GENERATED / VENDORED
DO NOT EDIT DIRECTLY
```

通过 manifest/hash 保证同步一致。

这样同时满足：

- CI 可独立构建；
- 不依赖本地路径；
- authoritative source 唯一；
- 宿主可独立 checkout；
- 下次升级可以自动同步。

---

## 11. Upgrade Doctor 目标

未来建立统一：

```text
aionteam doctor
```

或等价项目命令。

自动检查：

```text
AionUi host
AionCore host
Owned modules
UI slots
Core ports
Migration range
Historical DB state
Contracts
```

目标输出：

```text
AionTeam Upgrade Doctor

Host
✓ AionUi v2.x
✓ AionCore v0.x

Owned modules
✓ 22/22 portable

UI slots
✓ conversation slot compatible
✓ team page slot compatible
⚠ sidebar slot signature changed

Core ports
✓ TeamRepositoryPort
✓ ConversationBindingPort
⚠ AssistantCatalogPort changed

Migration
upstream max: 047
planned custom range: 048-051
✓ no collision

Production DB
historical adaptation detected
✓ repair plan generated

Result:
GREEN: 27
YELLOW: 2
RED: 0
```

目标是在正式编码前就知道升级难度和人工处理点。

---

## 12. 分阶段实施计划

### Phase 0：建立架构基线

**原则：不改变产品行为。**

任务：

1. 对本轮 AionUi 78 个文件、AionCore 40 个文件逐一分类；
2. 分类为：
   - owned
   - adapter
   - slot
   - generated
   - upstream-touch
   - test
3. 建立：

```text
Capability → File → Host → Port/Slot → Contract
```

依赖图；
4. 生成基线文件，例如：

```text
portable-architecture-map.yaml
```

5. 标识 high-churn upstream host files 与优先抽离对象。

**Phase 0 验收：**

- 所有当前二开改动都有唯一归属；
- 不存在“用途不明确”的文件；
- 能统计当前宿主侵入点总数。

---

### Phase 1：Capability 化

**仍不改产品行为。**

建立能力目录：

```text
ad-hoc-team
team-presets
conversation-binding
model-preference
realtime-team-sync
migration-compat
```

每个 capability 明确：

- owned files
- adapters
- host slots
- required ports
- events
- data ownership
- migration semantics
- contracts/tests

**Phase 1 验收：**

未来 Agent 能仅凭 capability manifest 回答：

> 这个能力需要什么宿主接口、什么事件、什么数据、什么测试。

---

### Phase 2：UI Owned Runtime 抽离

第一批抽离：

```text
AdHocTeam/*
TeamPreset*
adHocTeamNaming
runtimeGate
conversationTeamOwnership
bridge
hooks
```

形成可独立测试的 `aion-team-extension-ui`。

宿主压缩为 U1～U5 少量 Slot。

**Phase 2 核心目标：**

当前 UI 78 changed files 中，未来真正需要随 upstream 人工适配的宿主文件：

```text
目标 ≤ 8
```

理想核心 Slot：

```text
≤ 5
```

---

### Phase 3：Core Preset + Binding + Model 抽离

优先抽风险较低、边界清晰的部分：

```text
preset_service
conversation binding/unassign
model resolution
```

建立第一版 Core Ports。

**Phase 3 验收：**

- Preset 业务代码成为 owned crate/module；
- binding 逻辑不再直接散落宿主 repository/service；
- model preference 由稳定 port 获取。

---

### Phase 4：AdHoc Lifecycle 抽离

将：

```text
create
reuse
add target
remove
team.created/team.removed event
```

逐步从 `service.rs / provisioning.rs` 移到 extension runtime。

正式 Team Engine 仍使用 upstream，不另造 Team Runtime。

**Phase 4 验收：**

- ad-hoc lifecycle 主流程由 Extension 控制；
- upstream service/provisioning 仅作为 Port 实现；
- lifecycle contract tests 全部通过。

---

### Phase 5：Migration Compiler + Repair Generator

建立：

```text
semantic migration
→ number allocator
→ SQL materializer
→ historical map
→ repair generator
→ production DB preflight
```

**Phase 5 验收：**

- migration 编号 100% 自动生成；
- collision 100% preflight 检测；
- repair mapping 不再人工硬编码；
- fresh / redo / legacy / production-copy 全路径测试。

---

### Phase 6：Upgrade Doctor

将 Slots / Ports / Migrations / DB / Contracts 的规则机器化。

**Phase 6 验收：**

正式编码前即可输出：

```text
GREEN
YELLOW
RED
```

以及精确人工适配清单。

---

### Phase 7：模拟下一版本升级

不等待真实生产升级。

选择一个后续 upstream baseline 做演练：

```text
old portable runtime
→ new host
→ doctor
→ materialize
→ adapter fixes
→ migration generation
→ tests
```

记录真实指标：

```text
人工修改宿主文件数
重新编码行数
Owned Code 原样复用率
自动生成 migration 比例
Doctor 预判准确率
```

只有模拟升级达到目标，架构优化才算真正成功。

---

## 13. 硬性量化指标

### 13.1 UI 宿主侵入

目标：

```text
核心 Slot ≤ 5
升级时需人工检查文件 ≤ 8
```

### 13.2 Core 宿主侵入

目标：

```text
稳定 Ports / registration points ≤ 6
升级时需人工检查文件 ≤ 10
```

### 13.3 Owned Code 复用率

下一次升级：

```text
≥ 80% 二开业务代码无需重新编码
```

中期：

```text
≥ 90%
```

### 13.4 Migration

```text
编号 100% 自动分配
collision 100% preflight 检测
repair mapping 自动生成
```

### 13.5 升级可预测性

正式编码前，Doctor 必须能够输出人工适配点和风险级别。

---

## 14. 明确禁止项

架构优化过程中禁止：

- 为追求“插件化”另造一套正式 Team Engine；
- 把 upstream Team Runtime 复制进 AionTeamSuite；
- 一次性 Big Bang 重写 118 个文件；
- 直接在已验证生产候选分支进行高风险架构重构；
- 破坏现有 curated fixed-PIN 证据链；
- 覆盖现有 validated adaptations；
- 形成 AionUi/AionCore 对本机 AionTeamSuite 绝对路径的 build 依赖；
- 同一份 owned code 在多个仓库分别人工维护；
- migration 编号继续人工硬编码；
- 在没有 contract regression 的情况下移动 lifecycle 逻辑。

---

## 15. 分支与实施隔离策略

当前：

```text
AionUi   integrate/ad-hoc-team-v2.1.56
AionCore integrate/ad-hoc-team-v0.1.67
```

属于已经验证过的生产候选基线。

原则：

> **生产候选继续做稳定性测试；架构优化必须另开专门 branch/worktree。**

不在候选分支直接进行大规模抽离。

这样可以始终保留：

```text
Verified Baseline
        ↕
Architecture Refactor
```

双向对照。

如果重构后行为异常，可以直接与当前已验证候选逐项比较。

---

## 16. 推荐立即执行范围

当前不建议直接进入整个 Phase 0～7 全量重构。

推荐第一轮只执行：

```text
Phase 0
→ Phase 1
→ Phase 2
```

原因：

1. Phase 0/1 基本不改产品行为，可先建立完整架构地图；
2. UI Owned Runtime 风险低于 Core，适合做第一块可移植架构样板；
3. 可以快速验证“几十个 host touch 压缩到个位数”的路线是否成立；
4. UI 成功后再复制模式到 Core，避免 Core 直接高风险重构。

第一轮真正成功的标志不是“写了更多文档”，而是：

> 在不改变现有功能行为的前提下，把 AionUi 二开从大量散落修改压缩成一个 Owned Runtime + 少量明确 Host Slots，并证明下一次升级只需要处理少数 Adapter/Slot。

---

## 17. 本文与现有文档的关系

现有升级文档：

```text
04-v2.1.56适配矩阵.md
05-P4-AionCore-v0.1.67适配设计.md
06-P5-AionUi-v2.1.56适配设计.md
07-v2.1.56实装修复与下次升级复用清单.md
```

职责：

```text
04：升级前差异审计
05：Core 重放设计
06：UI 重放设计
07：实装经验、生产验证、下次升级 SOP
08：下一阶段可移植架构 2.0 总设计基线
```

后续架构优化任务应明确引用本文 `08`，并以当前 v2.1.56/v0.1.67 已验证行为作为不可回归基线。

---

## 18. 最终判断标准

本次架构优化最终不是以“代码看起来更漂亮”为完成标准，而是回答一个实际问题：

> 下一次升级时，我们是否还能像本轮一样重新编码大量二开逻辑？

如果答案仍然是“需要”，则架构优化没有真正完成。

真正目标是：

```text
旧版二开能力
     ↓
Owned Runtime 原样复用
     ↓
少量 Host Adapter / Slot 适配
     ↓
自动 Migration Compatibility
     ↓
Contract Tests 验证
```

最终让 AionTeamSuite 从“二开代码资产母库”演进为：

> **二开能力可移植层 + 宿主兼容系统 + 升级自动化工具链。**
