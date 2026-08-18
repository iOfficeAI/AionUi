# 05 - P4 AionCore v0.1.67 二开契约适配设计

> 日期：2026-08-17
>
> 阶段：P4-D 设计稿。**2026-08-18 实施与手工复测已完成主要 ad-hoc 修复；实际落地差异、后 PIN 修复补遗、migration 042、模型继承、删除解绑与最终 binary build 门禁见 `07-v2.1.56实装修复与下次升级复用清单.md`。**
>
> 目标基线：AionCore `v0.1.67`（`48a8b9bf542fa8d17f7a75a10c5c7a8f1b8ea7d5`）。
>
> 参考重做线：`a887fc23 feat(team): port ad-hoc origin and team-presets onto v0.1.62` + `ce1a8bf3 fix(team): reuse origin conversation as ad-hoc lead and mark formal team_id`。
>
> 前置审计：`04-v2.1.56适配矩阵.md`。

## 1. 设计结论先行

本轮 Core 不应 cherry-pick `a887fc23` / `ce1a8bf3` 整块，也不应覆盖 v0.1.67 的 `service.rs` / `provisioning.rs`。正确策略是：

1. 以 v0.1.67 为宿主，恢复纯二开数据契约：`origin_conversation_id`、Team Presets DTO/DB/repository/service/routes；
2. 将 ad-hoc `from-conversation` 作为 `TeamSessionService` 的独立入口恢复，保持普通 `POST /api/teams` 继续拒绝 `agents[].conversation_id`；
3. 只在 `provision_initial_agents` 的 lead 分支增加“内部受控复用已有来源 conversation”的能力，不改变公共普通建团语义；
4. 保留 `fe99ff60` 新增的 `TeamToolCapabilityPort`、`TeamCapabilityResolver`、direct CLI MCP transport 逻辑；ad-hoc 复用 leader 进入 session 后必须继续经过同一 capability-aware attach 路径；
5. migration 从 v0.1.67 官方最大 038 后排为 039/040/041；实施后又新增 orphan binding cleanup，因此本轮最终窗口为 **039/040/041/042**；
6. 存量数据库不能只靠常规 sqlx migrate：旧二开 DB 的 migration version 与官方 034..038/新二开 039..041 存在冲突，必须在 migrator 前做显式 legacy remap，并同时更新 `_sqlx_migrations.version + description + checksum`；
7. `teamId` 与 `team_id` 保持非对称语义：`teamId` 是上游 TeamSessionBinding/runtime binding；`team_id` 是二开 sidebar/history ownership marker。二者禁止全局归一化。

## 2. redo 完整改动盘点

### 2.1 提交边界

`a887fc23`：29 文件，1376 insertions / 30 deletions，负责 origin/preset 基础契约。

`ce1a8bf3`：只改 3 文件（`provisioning.rs`、`service.rs`、migration test），负责把 ad-hoc lead 从“新建 lead conversation”修正为“复用 origin conversation”，并补 formal leader `team_id` marker。

所以最终规格应以 `v0.1.62..ce1a8bf3` 为准，而不是只看 `a887fc23`。

### 2.2 每个 redo 文件的改动意图

| 文件 | redo 意图 | v0.1.67 重放策略 |
| --- | --- | --- |
| `crates/aionui-api-types/src/lib.rs` | 适配/导出新增 Team DTO，修正相关 struct literal/测试编译面 | 小范围重放，禁止覆盖 v0.1.67 其他 API 类型变化 |
| `crates/aionui-api-types/src/team.rs` | `TeamResponse.origin_conversation_id`；新增 from-conversation request/response、by-conversation association、Team Preset DTO | 恢复这些纯二开 DTO；保留 v0.1.67 已有 run/session/direct CLI 相关 DTO |
| `crates/aionui-app/src/router/state.rs` | 构造 `TeamPresetService` 并注入 `TeamRouterState` | 在 v0.1.67 `build_team_state` 中追加 preset service，但必须保留 `TeamCapabilityResolver` 与 capability_port 注入 |
| `crates/aionui-app/tests/active_lease_e2e.rs` | `TeamRow` 新字段补 `origin_conversation_id: None` | 随 model 字段恢复做机械补全 |
| `migrations/038_ad_hoc_team_origin_conversation.sql` | teams 新增 origin 字段 + unique/user index | 平移成 `039_*`，SQL 主体可复用 |
| `migrations/039_team_presets.sql` | 创建 `team_presets` 表和 user/update 索引 | 平移成 `040_*`，当前 v0.1.67 无同名表，SQL 主体可复用 |
| `migrations/040_backfill_formal_team_leader_team_id.sql` | formal leader conversation 写 `extra.team_id`；ad-hoc origin 排除 | 平移成 `041_*`；需在 039 已增加 origin 字段后执行 |
| `crates/aionui-db/src/lib.rs` | 导出新 model/repository 类型 | 小范围恢复 |
| `crates/aionui-db/src/models/mod.rs` | 导出 `TeamPresetRow/TeamPresetMemberRow` | 小范围恢复 |
| `crates/aionui-db/src/models/team.rs` | TeamPreset rows + TeamRow.origin_conversation_id | 在 v0.1.67 TeamRow 的 `project_id/folder_id` 前后安全插入 origin 字段，并补所有测试 literal |
| `crates/aionui-db/src/repository/team.rs` | `UpdateTeamParams.origin_conversation_id`、按 origin 查询、Preset CRUD trait | 恢复；保留 v0.1.67 project/folder/activity API |
| `crates/aionui-db/src/repository/sqlite_team.rs` | INSERT/UPDATE/SELECT origin；Preset CRUD SQL | 三方重放；必须保留 v0.1.67 project/folder binding 和 activity 分页逻辑 |
| `crates/aionui-db/tests/ad_hoc_presets_migration.rs` | 验证 origin column/unique、preset table、backfill 及 migration version | 恢复并把预期版本改为 039/040/041；新增三类 legacy DB remap 测试 |
| `crates/aionui-db/tests/team_repository.rs` | TeamRow literal 补 origin | 机械补全 + 新增 origin lookup/preset repo assertions |
| `crates/aionui-team/src/error.rs` | `PresetNotFound` | 恢复一个独立错误 variant；保持 v0.1.67 public error 分类不动 |
| `crates/aionui-team/src/lib.rs` | 注册/导出 `preset_service` | 恢复，同时保留 `TeamToolCapabilityPort` 等 v0.1.67 exports |
| `crates/aionui-team/src/preset_service.rs` | 用户隔离的 Preset CRUD、JSON row↔DTO 转换、validation | 文件可近似直接恢复；以 v0.1.67 Error/Repository 类型重新编译校对 |
| `crates/aionui-team/src/provisioning.rs` | 最终规格：lead input 带内部 conversation_id 时绑定已有 conversation；`build_team_extra` 增 include_team_id_marker；formal leader/teammate 写 team_id，ad-hoc origin lead 不写 | **高风险 adapter**：只重放 lead reuse 分支与 marker 语义，完整保留 v0.1.67 `capability_port` / transport 逻辑 |
| `crates/aionui-team/src/routes.rs` | Preset CRUD 路由 + from-conversation/by-conversation + handler + PresetNotFound mapping | 在 v0.1.67 router 链上追加；不改变既有 Team routes |
| `crates/aionui-team/src/service.rs` | Team/TeamRow 增 origin；remove team 跳过 origin conversation 删除；实现 create/get ad-hoc association + idempotent target add | **高风险 adapter**：在 v0.1.67 service 上按函数粒度恢复；不得覆盖 capability/session/run 新逻辑 |
| `crates/aionui-team/src/service/response_builder.rs` | TeamResponse 透传 origin | 小范围恢复 |
| `crates/aionui-team/src/session.rs` | Team/TeamRow literal 补 origin | 机械补全 |
| `crates/aionui-team/src/test_utils.rs` | Mock repo 支持 origin/preset，TeamRow literal | 按新 trait 面补齐 mock |
| `crates/aionui-team/src/types.rs` | Domain `Team.origin_conversation_id` + from_row/clone helpers | 恢复；保持 v0.1.67 Team 其他字段/运行态语义 |
| `crates/aionui-team/tests/common/mod.rs` | Mock ITeamRepository 新方法 | 补 trait mock |
| `tests/e2e_team_flow.rs` | TeamRow literal | 机械补全；保留 v0.1.67 新 Team E2E |
| `tests/mailbox_integration.rs` | TeamRow literal | 机械补全 |
| `tests/preset_service.rs` | Preset CRUD/ownership/validation | 文件级恢复并跑全量 |
| `tests/session_service_integration.rs` | origin/from-conversation 行为测试；ce1 后验证复用 source、marker 语义 | 三方合并到 v0.1.67 新 capability-port harness；不能回退为旧 constructor |
| `tests/task_board_integration.rs` | TeamRow literal | 机械补全 |

## 3. v0.1.67 / fe99ff60 交叉点

### 3.1 fe99ff60 的新架构事实

v0.1.67 新增：

- `TeamToolCapabilityPort`：Team domain 只问“该 backend 支持哪种 Team tool transport”，不再直接读某一种历史 ACP capability snapshot；
- `TeamCapabilityResolver`：优先读取 `aionui_session::backend_capability_descriptor(backend)`，direct Claude/Codex/Antigravity 由 descriptor 直接得到 MCP 能力；其余 backend 再读 persisted ACP handshake；
- `TeamAgentProvisioner.capability_port`；
- `resolve_team_tool_transport`：`mcp.stdio => MCP`，否则 `cli_fallback => CliAssumed`；
- `TeamSessionService::new_with_capability_port` / `new_with_prompt_dump(... capability_port ...)`；
- `build_team_state` 构造真实 `TeamCapabilityResolver` 并传入 service；
- integration tests 改用 `TestTeamToolCapabilityPort`。

### 3.2 与 redo 的直接冲突

#### 冲突 A：`TeamAgentProvisioner::new`

redo ce1 的 constructor 没有 `capability_port`；v0.1.67 有。

**处理：**绝不复制 redo constructor。仅在 v0.1.67 provisioner 上增加 bind/reuse helper；所有新 helper继续使用同一个 provisioner instance，因此 capability_port 自动保留。

#### 冲突 B：`provision_initial_agents`

v0.1.67 当前无条件调用 `create_team_conversation_for_agent` 创建 leader；redo 把这里改为：

```text
leader_input.conversation_id 非空
  -> bind_existing_conversation_as_leader
否则
  -> create_team_conversation_for_agent
```

**处理：**恢复这一内部 branch，但公共 `create_team()` 的 598-606 行拒绝逻辑必须保留。这样普通 `/api/teams` 仍不能复用 solo conversation，只有内部 `create_ad_hoc_team_from_conversation()` 自己构造带 conversation_id 的 `TeamAgentInput` 后调用 provisioner。

这构成一个非常重要的边界：

> API 普通 Team creation 禁止 conversation reuse；二开 ad-hoc service 内部受控复用。

#### 冲突 C：`build_team_extra`

v0.1.67 生成 Team binding extra；redo 增加 `include_team_id_marker`。

**处理：**在当前函数末端增加 marker 参数/策略，但不能改变 `teamId`、`slot_id`、role、backend、session_mode、assistant/model/workspace 等上游字段。

#### 冲突 D：session attach transport

ad-hoc reuse lead 后，后续 `ensure_session/attach_agent_process` 会走 v0.1.67 `resolve_team_tool_transport`。

**处理：**不要在 ad-hoc 代码里自行选择 ACP/CLI/MCP，不新增 capability 分支。直接让 origin leader 与其他 Team agent 一样经过 v0.1.67 capability resolver。需要新增测试覆盖 ad-hoc origin leader 为 Claude/Codex/direct backend 时 Team MCP capability 不退化。

#### 冲突 E：测试 harness

redo 的旧 `TeamSessionService::new`/`new_with_prompt_dump` 参数表已经过时。

**处理：**所有恢复的 redo tests 统一迁移到 v0.1.67 `new_with_capability_port` 或当前 harness，并注入 TestTeamToolCapabilityPort。

## 4. Migration 039/040/041 设计

### 4.1 目标文件

```text
039_ad_hoc_team_origin_conversation.sql
040_team_presets.sql
041_backfill_formal_team_leader_team_id.sql
```

### 4.2 039：origin_conversation_id

建议内容与旧 038 主体一致，仅修正头部 migration 编号说明：

```sql
ALTER TABLE teams ADD COLUMN origin_conversation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_origin_conversation_id
    ON teams(origin_conversation_id);

CREATE INDEX IF NOT EXISTS idx_teams_user_origin_conversation
    ON teams(user_id, origin_conversation_id);
```

v0.1.67 当前 `teams` 初始 schema 无该字段，028 只新增 project_id/folder_id，038 只处理 Aionrs fork capability，因此无需改 SQL 结构。

### 4.3 040：team_presets

旧 039 表名、列名在 v0.1.67 没有冲突，可原样平移，仅改 migration 编号注释。

保留索引：

- `idx_team_presets_user_id`
- `idx_team_presets_user_updated_at`

### 4.4 041：formal leader team_id backfill

旧 040 SQL 可继续使用，但前置依赖明确变成：

```text
039 origin column 已存在
040 preset 与此无数据依赖，仅编号顺序在中间
041 查询 teams.origin_conversation_id 判定 formal/ad-hoc
```

保留语义：

- formal Team leader：写 `conversations.extra.team_id = teams.id`；
- ad-hoc origin：`origin_conversation_id IS NOT NULL`，不写 team_id，保持普通会话历史可见；
- `teamId` 不在 041 中删除或覆盖。

## 5. SQLx migration history / legacy repair 设计

### 5.1 事实修正

历史提交 `e0e03ab8` 存在 `scripts/migration/repair-legacy-versions.sh`，但：

- 该文件不在 `ce1a8bf3` redo tip；
- 该文件不在 v0.1.67；
- 脚本正文处理的是更早的 `029→034, 030→035, 031→036, 032→037`；
- 正文只更新 `_sqlx_migrations.version`，没有更新 description/checksum。

所以本轮不能宣称“直接适配已有脚本”，而应把 e0e03ab8 当作安全操作模板（dry-run、backup、冲突拒绝、事务、post-check），重新设计新的二开迁移修复逻辑。

### 5.2 为什么必须改 checksum

旧数据库的 `_sqlx_migrations` 中，旧二开 migration 已以旧版本号/旧文件内容 checksum 记录；目标树的 039/040/041 文件名与头部注释发生变化，SQLx 会按目标 migration 文件校验 metadata。

因此 remap 应同时设置：

```text
version
description
checksum (目标 migration 文件的 SHA-384)
```

并保持 `success/installed_on/execution_time` 原值。

### 5.3 三类 DB 升级路径

#### 路径 A：全新 DB

无需 repair：

```text
official 001..038
→ custom 039
→ custom 040
→ custom 041
```

验证最终 max=41，三条成功且 checksum 与目标文件一致。

#### 路径 B：v0.1.62 重做线 DB

旧二开记录：

```text
038 ad_hoc
039 presets
040 backfill
```

而目标需要：

```text
038 official aionrs_fork_capability
039 ad_hoc
040 presets
041 backfill
```

必须在目标 migrator 校验前完成 metadata 搬移。推荐事务顺序为高位到低位，避免 PK 碰撞：

```text
040 -> 041
039 -> 040
038 -> 039
```

每一步同时写目标 description/checksum。完成后 038 空出，正常 sqlx migrator 再执行官方 038。

preflight 必须验证 038/039/040 三行的 checksum/description 确实属于 redo 二开内容，不能只看 version；否则拒绝自动修复。

#### 路径 C：旧 v0.1.51 原始二开 DB

根据现有资产历史，旧二开三条曾位于：

```text
034 ad_hoc
035 presets
036 backfill
```

而 v0.1.67 官方 034/035/036 已分别是：

```text
034_add_antigravity_builtin_agent
035_conversation_name_source
036_conversation_fork
```

所以必须在官方 migrator 校验前把旧二开 metadata 从 034/035/036 搬到 039/040/041，再让官方 034..038 正常执行。

推荐顺序：

```text
036 -> 041
035 -> 040
034 -> 039
```

同样以旧 checksum/description 白名单识别，禁止“看到 034 就搬”。

### 5.4 Repair 工具安全要求

实现阶段建议恢复/新建专用 `scripts/migration/repair-2dev-team-migrations.sh`（名称可再定），要求：

1. 默认 dry-run；
2. `--apply` 才改；
3. 必须 backup；
4. 读取 `_sqlx_migrations` 完整列；
5. 用旧二开 checksum/description 识别窗口，而不是只看 version；
6. 自动区分 legacy-034/035/036 与 redo-038/039/040；
7. 目标 039/040/041 若已经存在且不是预期同一 migration，立即拒绝；
8. version/description/checksum 在 `BEGIN IMMEDIATE` 中同事务更新；
9. post-check：源版本已释放、目标 metadata 与目标文件一致；
10. repair 后再启动 AionCore migrator。

如果未来希望自动化到应用启动前，需另做架构评审；本轮优先采用显式 operator repair，避免在启动路径静默重写 migration history。

## 6. 契约具体落点

### 6.1 API Types

`crates/aionui-api-types/src/team.rs`：

恢复：

- `TeamResponse.origin_conversation_id: Option<String>`；
- `CreateAdHocTeamFromConversationRequest`；
- `AdHocTeamFromConversationResponse`；
- `AdHocTeamAssociationStatus/Response`；
- `TeamPresetMember`；
- `CreateTeamPresetRequest`；
- `UpdateTeamPresetRequest`；
- `TeamPresetResponse/ListResponse`。

保持 v0.1.67 `TeamAgentInput.conversation_id` 的 deprecated 注释与反序列化兼容。不要重新开放普通 `/api/teams` reuse。

### 6.2 DB model/repository

`models/team.rs`：

```text
TeamRow + origin_conversation_id: Option<String>
TeamPresetMemberRow
TeamPresetRow
```

`repository/team.rs`：

```text
UpdateTeamParams.origin_conversation_id
get_team_by_origin_conversation_id(user_id, origin)
create/list/get/update/delete_team_preset
```

`sqlite_team.rs`：

- create_team INSERT 增 origin column/bind；
- update_team 增 origin set/bind；
- origin lookup 必须带 `user_id`；
- preset CRUD 按 user ownership 由 service 层校验。

### 6.3 Domain type / response

`aionui-team/src/types.rs`：`Team.origin_conversation_id`。

`service/response_builder.rs`：输出到 `TeamResponse.origin_conversation_id`。

`remove_team`：如果 agent conversation 是 `origin_conversation_id`，kill runtime 可以发生，但 **delete_team_conversation 必须跳过来源会话**；其他 Team member conversation 照旧删除。

### 6.4 from-conversation

落点：`aionui-team/src/service.rs`，恢复独立：

```text
create_ad_hoc_team_from_conversation(user_id, req)
ensure_ad_hoc_target_and_respond(...)
get_ad_hoc_team_by_conversation(...)
```

流程：

1. `lookup_team_binding_by_conversation` 确认 conversation 存在和 user ownership；
2. 按 `origin_conversation_id` 查询已有 team，保证幂等；
3. 读取 source conversation assistant_id；
4. 通过 `assistant_catalog.resolve_team_selectable_assistant` 确认 lead；
5. 读取 source workspace；
6. 构造 lead `TeamAgentInput`，仅内部设置 `conversation_id=origin`；
7. target assistant 有值则构造 teammate；
8. 新 team id；
9. 调当前 v0.1.67 provisioner；
10. 保存 TeamRow，`origin_conversation_id=Some(origin)`；
11. unique race 时重读 origin team；
12. 返回 leader/target slot。

### 6.5 provisioning 适配

在 v0.1.67 `provision_initial_agents`：

- lead `conversation_id` 为空：完全保持现有 formal Team path；
- lead `conversation_id` 非空：调用新 `bind_existing_conversation_as_leader`；
- teammate 不允许走 reuse path。

`bind_existing_conversation_as_leader`：

- 使用当前 `cli_backend_metadata/agent_type_for_backend/session_mode_for_backend`；
- build runtime extra；
- `teamId` 必须写；
- `team_id` 不写；
- 非 Aionrs 保持 current_model_id；
- patch existing conversation；
- workspace 从 existing conversation 回读；
- 不创建新 conversation。

**不要在该 helper 内调用/绕开 capability resolver。** capability resolver 是 session attach 阶段统一处理。

### 6.6 Team Presets

`preset_service.rs` 可按 redo 恢复：

- create/list/get/update/delete；
- user ownership；
- leader/member/tag/prompt JSON 转换；
- request validation；
- `PresetNotFound`。

`routes.rs`：

```text
/api/team-presets
/api/team-presets/{id}
/api/teams/from-conversation
/api/teams/by-conversation
```

路由应在 `/api/teams/{id}` 等动态路径前声明，维持 redo 的明确顺序。

`TeamRouterState` 增：

```text
preset_service: Arc<TeamPresetService>
```

`build_team_state`：先 clone team_repo 创建 preset_service，再构造 TeamSessionService；同时完整保留 v0.1.67：

```text
TeamCapabilityResolver
capability_port
slash_command_port
prompt_dump
project_service
```

## 7. teamId / team_id 契约逐条清单

### 7.1 `teamId`：上游 runtime binding，必须保留

v0.1.67 `TeamSessionBinding::from_extra_value` 读取 `extra.teamId`；该字段决定 Team session typed binding / MCP runtime context。

写入规则：

- formal leader：写 `teamId`；
- formal teammate：写 `teamId`；
- ad-hoc reused origin leader：**仍写 `teamId`**；
- ad-hoc teammate：写 `teamId`。

禁止为了让来源会话“看起来像普通聊天”而去掉 `teamId`，否则会破坏 TeamSessionBinding。

### 7.2 `team_id`：二开 ownership/history marker

写入规则：

- formal leader：写 `team_id`；
- formal teammate：写 `team_id`；
- ad-hoc reused origin leader：**不写 `team_id`**；
- ad-hoc teammate：写 `team_id`。

041 migration 只给 formal leader 补 `team_id`，并通过 `teams.origin_conversation_id IS NULL` 排除 ad-hoc origin。

### 7.3 Legacy normalize

v0.1.67 migration 002 有将历史 `teamId` 复制到 `team_id` 的 normalize SQL。这个 SQL 发生在很早的数据库升级历史；新二开 DB 到 039/041 时必须用测试确认不会把 ad-hoc origin 在后续重新污染为 team_id。

对于已经运行过 002 的老库，ad-hoc 功能当时尚不存在，因此没有 ad-hoc origin 受影响；新建 ad-hoc 发生在 039 之后，002 不会重新执行。

### 7.4 读取规则

- Team domain/runtime：遵守上游 `TeamSessionBinding`，读 `teamId`；
- 二开 origin association：读 `teams.origin_conversation_id`，不要靠 extra 猜；
- UI/sidebar ownership 以后由 AionUi `conversationTeamOwnership` 区分 `team_id` vs `teamId`；
- DB diagnostics 可以继续兼容读取两者，但不能据此改变写入语义。

## 8. 建议提交划分

实施阶段建议 6 个小提交，顺序固定：

1. `feat(db): add ad-hoc origin and team preset schema for v0.1.67`
   - migrations 039/040/041
   - DB models/repository
   - migration/repository tests

2. `fix(db): add 2dev legacy migration metadata repair`
   - repair utility
   - legacy 034/035/036 → 039/040/041
   - redo 038/039/040 → 039/040/041
   - checksum/description tests or fixture verification

3. `feat(team): restore ad-hoc origin API contracts`
   - api-types
   - domain Team origin field
   - service response
   - routes DTO handlers skeleton

4. `feat(team): adapt conversation promotion to capability-aware provisioner`
   - `service.rs` from-conversation/by-conversation
   - `provisioning.rs` reuse lead + marker semantics
   - preserve `TeamToolCapabilityPort`
   - integration tests for direct CLI capability + reused lead

5. `feat(team): restore team preset service and routes`
   - preset_service
   - TeamRouterState/build_team_state
   - preset tests

6. `test(team): cover ad-hoc migration, ownership, lifecycle and compatibility`
   - remaining fixture literals/mocks
   - remove-team keeps origin
   - race/idempotency/cross-user
   - DB upgrade matrices

若某提交无法独立通过编译，可将 3+4 合为一个 contract+service 提交，但 DB schema 与 legacy repair 仍建议独立。

## 9. 验证方案

### 9.1 格式/静态

实施期间 affected-first：

```bash
cargo fmt --check
cargo clippy -p aionui-db -p aionui-api-types -p aionui-team -p aionui-app --all-targets -- -D warnings
```

如果仓库既有 clippy warning 阻塞，必须记录原始基线与新增 warning 差异，不通过 suppress/delete test 解决。

### 9.2 DB tests

```bash
cargo test -p aionui-db
```

必须恢复/新增：

- origin column 存在；
- origin unique；
- `(user_id, origin)` lookup；
- preset schema/index；
- Preset CRUD repo；
- 041 formal leader backfill；
- ad-hoc origin 不被 041 写 team_id；
- migration versions 为 039/040/041；
- fresh DB max=41；
- old 034/035/036 fixture repair；
- redo 038/039/040 fixture repair；
- repair 后官方 034..038 + custom 039..041 能完整 migrate；
- repair 二次运行 no-op；
- checksum mismatch / ambiguous collision 必须拒绝。

### 9.3 API types

```bash
cargo test -p aionui-api-types
```

恢复：

- from-conversation request/response serialization；
- association status；
- TeamResponse origin optional；
- preset DTO snake_case/optional fields。

保持并确认：普通 TeamAgentInput conversation_id 兼容 parse，但 service 普通 create 拒绝 reuse。

### 9.4 Team domain

```bash
cargo test -p aionui-team
```

重点：

- create from conversation reuses origin conversation id；
- 不额外创建 lead conversation；
- origin lead extra 有 `teamId`、无 `team_id`；
- formal lead 同时有 `teamId/team_id`；
- teammate 有 `teamId/team_id`；
- cross-user forbidden；
- same origin idempotent；
- concurrent duplicate origin race 重读成功；
- target assistant 首次创建与后续补加；
- by-conversation active/disbanded；
- remove Team 不删除 origin conversation；
- remove Team 仍删除 teammate conversations；
- direct Claude/Codex/Antigravity ad-hoc lead session 仍由 capability descriptor 选 MCP；
- custom ACP fallback 逻辑不回归；
- preset CRUD/ownership/validation。

### 9.5 App wiring

```bash
cargo test -p aionui-app
```

至少覆盖：

- router state 构造成功；
- TeamCapabilityResolver 仍注入；
- `/api/team-presets`；
- `/api/teams/from-conversation`；
- `/api/teams/by-conversation`；
- authentication/user ownership；
- direct CLI Team MCP parity tests `fe99ff60` 不回归。

### 9.6 最终 Core 门禁

在 affected crates 全绿后再跑：

```bash
cargo test -p aionui-db -p aionui-api-types -p aionui-team -p aionui-app
cargo build -p aionui-app
```

若项目 CI 规定 workspace test，则 S2 前追加 `cargo test --workspace`。

## 10. 风险清单

| 风险 | 等级 | 防护 |
| --- | --- | --- |
| 038 migration 已被官方占用 | 高 | 039/040/041 + legacy metadata repair |
| SQLx checksum VersionMismatch | 高 | version/description/checksum 同事务 remap；checksum 白名单识别 |
| 旧 0.1.51 DB 的 034/035/036 与官方同号 | 高 | migrator 前 remap，不允许启动后再补救 |
| redo 0.1.62 DB 的 038 与官方 038 冲突 | 高 | 040→041、039→040、038→039 后执行官方 038 |
| 覆盖 fe99 capability resolver | 高 | 仅函数级 adapter；保留 capability_port 构造/测试 |
| 普通 `/api/teams` 意外重新允许 conversation reuse | 高 | 保留 service 598-606 rejection；仅内部 ad-hoc 入口可设置 conversation_id |
| ad-hoc origin 缺 teamId 导致 TeamSessionBinding 失效 | 高 | bind helper 始终写 teamId |
| ad-hoc origin 被写 team_id 导致历史隐藏 | 高 | include marker=false + 041 排除 + tests |
| Team 删除误删来源 conversation | 高 | origin comparison 后 skip delete |
| Preset service 注入覆盖 capability_port 参数 | 中高 | build_team_state 三方合并，明确保留 capability_port/slash/prompt/project |
| Mock trait 大面积编译失败 | 中 | DB/API commit 后集中更新 test_utils/common harness |
| 旧 repair script 被误认为可直接复用 | 中 | 新设计独立 repair；e0 只做安全流程参考 |

## 11. 回滚预案

### 11.1 代码回滚

提交按 DB → repair → contract → provisioning → preset → tests 分层，因此可按相反顺序 revert；不回写官方 migrations 001..038。

### 11.2 新数据库

若尚未发布，直接丢弃测试 DB 重建即可。

### 11.3 存量 DB repair

repair 必须先生成 SQLite backup。若后续迁移失败：

1. 停止 AionCore/AionUi；
2. 保留失败 DB 作审计；
3. 从 pre-repair backup 恢复；
4. 不手工删除 `_sqlx_migrations` 行；
5. 修正脚本/目标 checksum 后重新 dry-run。

### 11.4 已应用 039/040/041

SQLx migrations 视为 immutable。发布后禁止改已执行文件内容或重新编号；后续修复只能追加 042+。

## 12. 实施前暂停点（P4-D → P4-I）

进入产品代码实施前，应确认：

- [ ] 039/040/041 编号不再变化；
- [ ] legacy 原始二开 DB 的实际 034/035/036 checksum/description 已从真实 fixture 或备份取证；
- [ ] redo DB 的 038/039/040 checksum/description 已取证；
- [ ] repair 工具明确采用 checksum 白名单，不只按 version；
- [ ] `TeamCapabilityResolver` / `capability_port` 列入不可覆盖项；
- [ ] 普通 `create_team` 的 conversation_id reject 列入不可删除项；
- [ ] `teamId/team_id` 非对称规则写入测试清单；
- [ ] S2 验证命令和测试范围确认。

其中第一项真正需要在实施前补做的证据是两种存量 DB migration row 的真实 checksum/description。若没有真实 DB fixture，可以从对应历史 migration 文件计算 SHA-384 并建立受控 fixture，但不能用“version 号看起来对”代替身份校验。

## 13. P4-D 结论

AionCore v0.1.67 对二开不是结构性阻断。数据库/API/preset 大部分是可重放资产；真正需要人工 adapter 的核心只有两块：

1. `provisioning.rs`：把 ce1 的 existing-conversation lead reuse 嵌入 fe99 的 capability-aware provisioner；
2. migration history：处理官方 038 与两代二开 migration 编号的冲突。

只要严格保持“普通 Team creation 不复用 conversation、ad-hoc 内部受控复用”和“teamId runtime binding / team_id ownership marker”两条边界，本轮 Core 可以在不牺牲 v0.1.67 direct CLI Team MCP 能力的前提下恢复二开契约。
