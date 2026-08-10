# 二开项目升级 — 资产清单与适配方案索引

> 本目录是二开资产化的唯一权威落点。目标：把二开代码划出**可携带边界**——逐文件/逐组件/逐接口给出风险分级、上游依赖、变化触发器、接入点和验证方法，并定义未来源码扩展包的目录与 manifest/adapter 结构。
>
> 建立日期：2026-08-09。本文档集只做调研与归档，不修改任何产品代码。

## 文档构成

| 文档 | 内容 |
| --- | --- |
| [01-二开代码资产与依赖分级.md](./01-二开代码资产与依赖分级.md) + [manifest.json](./01-二开代码资产与依赖分级.manifest.json) | **清单定稿**：A-D 分级、来源 commit、职责、依赖、宿主接点（含 v2.1.52 精确插入点）、上游变更触发器、迁移方式、验证方式；吸收临时团队 UI 审计证据并附勘误；机读 manifest 供抽包工具核对 |
| [02-二开扩展包目录与manifest-adapter方案.md](./02-二开扩展包目录与manifest-adapter方案.md) | 未来二开源码扩展包的目录边界、manifest 字段、adapter 分层与宿主接点收敛策略 |
| ~~01-二开资产清单与风险分级.md~~ | 已合并入 01 定稿，仅留指向页 |

## 盘点范围（数据口径）

二开 = fork（`origin` = DigitalNomad-Chat/AionUi）相对上游（`upstream` = iOfficeAI/AionUi）的增量。盘点覆盖三个并存形态：

| 形态 | 位置 | 基线 | 状态 |
| --- | --- | --- | --- |
| 主集成分支 | 本仓 `integrate/ad-hoc-team-latest` @ `b397e15fd` | AionUi v2.1.40 × AionCore v0.1.51 | 二开功能最完整（23 个本地提交，其中 18 个为二开/文档，5 个为浅克隆噪声的上游提交） |
| v2.1.52 隔离 worktree | `/private/tmp/aionui-latest-poc` @ `bd728fb4d` | AionUi v2.1.52（`7ebae30aa`）× AionCore v0.1.62 | "最新基线重做"进行中：15 个已提交重做提交（43 文件，+2476/−30）；临时团队会话 UI 组件（`AdHocTeam/`、`useTeammateBackflow`、`runtimeGate`、`conversationTeamOwnership`）与 SendBox 接线**尚未提交**（untracked / working-tree 修改） |
| 旧版原型分支 | `feat/ad-hoc-team-context` @ `8b2953a33` | v2.1.33 时代 | 已被 `700fdf117` 取代，仅作溯源；`backup/poc-latest-ui-*` 指向当前 HEAD，属回滚备份 |

另有一份固化补丁：`patches/2026-07-30-feat-team-add-reusable-expert-team-presets.patch`（`e3f154559` 导出，31 文件，+2681/−87，仅专家团功能、纯 AionUi 前端）。

## 风险分级定义（沿用任务描述口径）

| 级别 | 定义 | 迁移成本 |
| --- | --- | --- |
| **A** | 纯二开自有模块，上游不存在同名文件 | 直接搬运，零冲突 |
| **B** | 宿主插槽/入口：在上游文件内以追加方式挂载二开能力 | 轻适配：重新定位锚点即可 |
| **C** | 共享类型/状态/Team 创建基础设施：与上游逻辑交织的改写 | 中高适配：需人工合并 |
| **D** | IPC/API/数据库迁移/构建：版本契约与构建配套 | 关键适配：需走兼容矩阵与成对升级流程 |

## 既有决策的沿用关系

本清单与 `docs/plans/` 下历史文档的关系（详见 01 文档附录）：

- **当前主方案**：`2026-08-09-最新基线重做二开与兼容验证实施方案.md`（P0–P6 窗口体系）与 `2026-08-09-P6-升级窗口兼容矩阵与回滚手册.md`（权威兼容矩阵）——本清单引用而非复制。
- **仍有效的工作流原则**：`2026-07-22-二开功能模块独立维护与上游同步计划.md`（双仓成对升级、迁移编号规则）。
- **规格基线**：`2026-07-23-Team预设与专家团卡片实施计划.md`（TeamPreset 数据模型与 API 规格）。
- **已归档执行手册**：`2026-07-30-二开补丁包维护与窗口化升级实施任务清单.md`（§12 落地记录与重编号分析仍权威；§13 窗口 C 未执行即被取代）。

### 必须沿用的命名与规则

- 窗口编号 **P0–P6**，暂停点 **S0–S5**；一次性整合分支 `integrate/ad-hoc-team-YYYYMMDD`；备份 `backup/poc-latest-{ui,core}-<timestamp>`。
- **迁移编号规则**：二开迁移必须使用上游最新版本号之后的编号（`M+1..`），按依赖排序、不预留空号、已发布不改号；checksum（SHA-384）与 version 必须同事务修复（AionCore 脚本 `scripts/migration/repair-legacy-versions.sh`）。
- **成对配套原则**：AionUi `package.json` 的 `aioncoreVersion` pin + bundle manifest（version/sourceType/source + binary SHA256）+ Core tag/SHA 三者必须写入兼容矩阵同一行；AionUi 与 AionCore 成对回滚，禁止对原分支 destructive reset。
- 术语：临时团队 = ad-hoc team；来源会话 = origin/source conversation（`origin_conversation_id`）；归属键 `extra.teamId`（promoted source）/ `extra.team_id`（成员会话）；专家团 = Team Presets（`TeamPreset`/`TeamPresetMember`，SWR key `team-presets/${user_id}`）。
