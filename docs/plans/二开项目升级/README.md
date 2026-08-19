# 二开项目升级 — 资产清单与适配方案索引

> 本目录是 AionUi 侧的二开升级设计、审计与 SOP 索引；二开代码与可移植资产的唯一权威源已迁移到独立仓 `AionTeamSuite`。本目录负责记录宿主版本适配、生产验证与升级执行规则，不再承担二开源码资产本体。
>
> 建立日期：2026-08-09。2026-08-10（P8-1）按来源审计 `/tmp/audit-2dev-docs-provenance-20260810.md` 完成**物理分层**：原版资产、v2.1.52 适配、扩展包决策三分离，旧文件名移入 `legacy/` 保留指向。2026-08-17～19 已补充 v2.1.56 / v0.1.67 升级审计、实装修复复盘，以及 AionTeamSuite 二开可移植架构 2.0。`08` 是架构设计与 Phase 0–7 实施基线，`09` 是今后每一次正式升级优先执行的标准 SOP。

## 文档构成

| 文档 | 内容 |
| --- | --- |
| [01-原版二开资产清单.md](./01-原版二开资产清单.md) + [01-原版二开资产清单.manifest.json](./01-原版二开资产清单.manifest.json) | **原版清单**：仅以固定证据树（PIN-UI `adf8dfaa4` / PIN-CORE `eb0c884e` / `e3f154559`）核验的 A-D 分级、来源 commit、职责、依赖、契约、触发器、缺陷；机读 manifest 为 `originalSource`/`adapterTarget` 双层（schema `aionui-2dev-asset-inventory/2`） |
| [02-v2.1.52适配矩阵.md](./02-v2.1.52适配矩阵.md) | **适配矩阵**：v2.1.52 重做线的提交对应、B/C 级插入点、移植判定、迁移窗口（038/039/040、repair 脚本）与 P7 修复记录（`d0beccbf8`/`21d73ba45`） |
| [03-扩展包与adapter决策.md](./03-扩展包与adapter决策.md) | **adapter 决策层**：未来二开源码扩展包的目录边界、manifest 字段、adapter 分层、宿主接点收敛策略与形态决策记录（DR-1） |
| [04-v2.1.56适配矩阵.md](./04-v2.1.56适配矩阵.md) | **v2.1.56 / v0.1.67 升级前差异审计**：A/B/C/D 资产在新宿主中的复用、adapter、上游替代与 migration 窗口判定 |
| [05-P4-AionCore-v0.1.67适配设计.md](./05-P4-AionCore-v0.1.67适配设计.md) | **Core 实施设计**：ad-hoc origin、Team Presets、migration/repair、provisioning/service 的 v0.1.67 适配边界 |
| [06-P5-AionUi-v2.1.56适配设计.md](./06-P5-AionUi-v2.1.56适配设计.md) | **UI 实施设计**：shared contracts、i18n、AdHocTeam、GroupedHistory、Team Presets 与 runtime seam 的分层重放方案 |
| [07-v2.1.56实装修复与下次升级复用清单.md](./07-v2.1.56实装修复与下次升级复用清单.md) | **v2.1.56 实施后补遗**：后 PIN 修复扫描、5 个实测缺陷根因与修复、WS/cache 一致性、migration 042、最终 binary build 陷阱、完整生命周期 checklist；对应适配证据维护在 `AionTeamSuite/packages/adaptations/v2.1.56-v0.1.67/` |
| [08-AionTeamSuite二开可移植架构2.0优化方案.md](./08-AionTeamSuite二开可移植架构2.0优化方案.md) | **可移植架构 2.0 设计与实施基线**：owned/adapter/slot/generated 分类、UI/Core portable runtime、stable ports、semantic migration、Upgrade Doctor、Upgrade Overlay、Phase 0–7 与量化指标；已完成真实 v2.1.57 × v0.1.68 相邻版本演练 |
| [09-二开可移植架构2.0标准升级SOP.md](./09-二开可移植架构2.0标准升级SOP.md) | **今后正式升级的首要执行入口**：Gate A–N 覆盖新宿主隔离、Doctor、migration preflight、materialize、overlay、generated artifacts、focused/full tests、生产 DB、打包、人工验收与 Promote latest；新对话应优先引用本文件 |
| [设计规格归档/](./设计规格归档/) | 专家团/创建弹窗等 e3 原版 UI 设计规格与验收清单（P8-2 维护） |
| [审计报告/](./审计报告/) | 来源审计报告原样归档（不篡改结论）：`adhoc-team-design-source-audit-2026-08-10.md`（设计规格归档来源审计）、`audit-2dev-docs-provenance-20260810.md`（二开文档来源审计，P8-1 分层依据） |
| [原始源码包/](./原始源码包/) | 临时团队与专家团两个原版 UI 源码快照，以及共同的 AionCore 原版配套；仅来自固定原始提交，不含新版重写代码 |
| [legacy/](./legacy/) | 旧文件名兼容指向与历史说明（`01-二开代码资产与依赖分级.*`、`01-二开资产清单与风险分级.md`、`02-二开扩展包目录与manifest-adapter方案.md`） |

## 盘点范围（数据口径）

当前生产集成线已经完成从历史 fork 资产向可移植架构 2.0 的迁移：

| 形态 | 位置 | 基线 | 状态 |
| --- | --- | --- | --- |
| 当前主集成分支 | `integrate/ad-hoc-team-latest` | AionUi v2.1.56 × AionCore v0.1.67 | 已由生产验证候选晋升；UI 候选 `01f627bac`、Core 候选 `0e93765d` 已成为 latest 历史祖先 |
| 生产验证候选 | `integrate/ad-hoc-team-v2.1.56` / `integrate/ad-hoc-team-v0.1.67` | v2.1.56 × v0.1.67 | 已完成真实生产应用验证，作为本次 latest 晋升来源 |
| 可移植架构权威资产 | 独立仓 `AionTeamSuite` | portable architecture 2.0 | runtime、capabilities、migration compiler、Doctor、Overlay、验收记录均维护于此 |
| 历史原版/重做线 | 本目录 `01`～`07`、`legacy/` 与 AionTeamSuite archive | v2.1.33～v2.1.52 | 仅用于溯源和兼容证据，不再作为下一次升级的代码来源 |

旧的单提交 patch、历史 fork 源码快照和固定 PIN 证据已迁入 `AionTeamSuite` 保存，AionUi 产品仓不再重复维护这些源码资产。

## 风险分级定义（沿用任务描述口径）

| 级别 | 定义 | 迁移成本 |
| --- | --- | --- |
| **A** | 纯二开自有模块，上游不存在同名文件 | 直接搬运，零冲突 |
| **B** | 宿主插槽/入口：在上游文件内以追加方式挂载二开能力 | 轻适配：重新定位锚点即可 |
| **C** | 共享类型/状态/Team 创建基础设施：与上游逻辑交织的改写 | 中高适配：需人工合并 |
| **D** | IPC/API/数据库迁移/构建：版本契约与构建配套 | 关键适配：需走兼容矩阵与成对升级流程 |

## 当前决策的沿用关系

后续升级只保留以下权威层级：

- **架构设计基线**：`08-AionTeamSuite二开可移植架构2.0优化方案.md`。
- **正式升级执行入口**：`09-二开可移植架构2.0标准升级SOP.md`。
- **最近一次生产实装经验**：`07-v2.1.56实装修复与下次升级复用清单.md`。
- **代码与机器可执行资产**：独立仓 `AionTeamSuite`，包括 portable runtime、Capability manifests、semantic migration、Upgrade Doctor、Upgrade Overlay 和验证报告。
- `01`～`06` 与 `legacy/` 保留历史来源和兼容证据；若与 `08/09` 冲突，以 `08/09` 和 AionTeamSuite 当前工具链为准。

### 必须沿用的命名与规则

- 窗口编号 **P0–P6**，暂停点 **S0–S5**；一次性整合分支 `integrate/ad-hoc-team-YYYYMMDD`；备份 `backup/poc-latest-{ui,core}-<timestamp>`。
- **迁移编号规则**：二开迁移必须使用上游最新版本号之后的编号（`M+1..`），按依赖排序、不预留空号、已发布不改号；checksum（SHA-384）与 version 必须同事务修复。迁移编号双窗口（原版 034/035/036 @ PIN-CORE；v2.1.52 线 038/039/040）见 01 §5.3 与 02 §5；修复脚本 `scripts/migration/repair-legacy-versions.sh` 为 v0.1.62 重做线资产（`e0e03ab8` 引入；原版 PIN-CORE 无此脚本）。
- **成对配套原则**：AionUi `package.json` 的 `aioncoreVersion` pin + bundle manifest（version/sourceType/source + binary SHA256）+ Core tag/SHA 三者必须写入兼容矩阵同一行；AionUi 与 AionCore 成对回滚，禁止对原分支 destructive reset。
- 术语：临时团队 = ad-hoc team；来源会话 = origin/source conversation（`origin_conversation_id`）；归属键 `extra.teamId`（promoted source）/ `extra.team_id`（成员会话）；专家团 = Team Presets（`TeamPreset`/`TeamPresetMember`，SWR key `team-presets/${user_id}`）。
