# 旧版前端页面与交互设计规格归档（专家团预设 + 临时团队）

> 本目录是「二开资产化」的设计档案：**旧版已确认二开 UI/交互是唯一规格**。未来前端按此逐像素/逐状态复现，禁止自行简化或重设计。
> 本档案只做调研与归档，不含任何产品代码改动。代码清点/风险分级与扩展包方案见上级目录（`../README.md`、`../01-二开资产清单与风险分级.md`、`../02-二开扩展包目录与manifest-adapter方案.md`）。

## 规格基线（证据路径）

| 项 | 值 |
| --- | --- |
| 规格 commit | `e3f154559` `feat(team): add reusable expert team presets`（分支 `integrate/ad-hoc-team-latest`） |
| 主要源码 | `packages/desktop/src/renderer/pages/team/`（TeamPresets/、components/、hooks/、identity/） |
| 临时团队源码 | `packages/desktop/src/renderer/pages/conversation/components/AdHocTeam/`、`components/layout/Sider/TeamSiderSection.tsx` |
| 类型 | `packages/desktop/src/common/types/team/teamTypes.ts`（`TeamPreset`/`TeamPresetMember`） |
| 文案 | `packages/desktop/src/renderer/services/i18n/locales/*/team.json`、`conversation.json`（13 语言，本档案录 zh-CN/en-US） |
| 测试取证 | `tests/unit/renderer/team/`（TeamPresetPicker、TeamCreateModal.presets、useTeamPresets、TeamTabs、TeamWarmupOverlay 等 DOM 测试） |
| 配套 PRD | `docs/prds/teams/team-runtime-experience.md` / `.design.md`（同 commit） |

取证方式：以上文件均按 commit `e3f154559` 提取并逐行精读；所有尺寸、颜色 token、状态、文案键均可在对应源码行中复核。旧版界面未重新构建运行（避免回退当前工作区），故视觉稿采用**从源码测量值生成的精确 SVG 线框**（见 `assets/`），每张图顶部标注了证据来源，可用任意浏览器/SVG 工具打开复现。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [01-专家团预设-设计规格.md](01-专家团预设-设计规格.md) | TeamPresetPicker / Preview / MemberList / EmptyState / EditorModal 的结构、布局、token、状态、流转 |
| [02-团队创建弹窗-设计规格.md](02-团队创建弹窗-设计规格.md) | TeamCreateModal 桌面双栏 / 窄屏单栏、Assistants+专家团双 Tab、成员草稿列表、Arco Tabs 高度修复 CSS |
| [03-团队页与运行态-设计规格.md](03-团队页与运行态-设计规格.md) | 团队页并行/单聊视图、胶囊成员栏、身份色系统、warmup 遮罩、空状态 |
| [04-入口与临时团队-设计规格.md](04-入口与临时团队-设计规格.md) | 路由、侧栏团队区、会话内协作入口（CollaborationLauncher / AgentSelectorModal / TeamStatusCard）、添加成员下拉 |
| [05-状态矩阵.md](05-状态矩阵.md) | 全部组件 × 全部状态（空/加载/错误/选中/hover/缺失成员/运行/停止/恢复等）核对表 |
| [06-交互流程.md](06-交互流程.md) | 操作流：建团、调用预设、预设 CRUD、加成员、warmup 自救、临时团队升降级 |
| [07-文案键清单.md](07-文案键清单.md) | 全部 i18n 键（zh-CN / en-US），13 语言键位一致 |
| [08-验收清单.md](08-验收清单.md) | 前端逐项核对验收清单（可勾选） |

## 视觉稿（assets/）

| 文件 | 对应界面 |
| --- | --- |
| `team-create-modal-desktop.svg` | 团队创建弹窗 · 桌面双栏（assistants 模式） |
| `presets-tab.svg` | 创建弹窗「专家团」Tab：左 Picker / 右 Preview |
| `preset-editor-modal.svg` | 新建/编辑专家团弹窗 |
| `team-create-modal-mobile.svg` | 创建弹窗 · 窄屏单栏 + 添加成员下拉 |
| `team-page-parallel.svg` | 团队页并行视图（标题行/胶囊栏/多列/滚动箭头） |
| `team-tabs-capsules.svg` | 胶囊成员栏六种状态 + 状态点 + 身份色板 |
| `warmup-overlay.svg` | warmup 遮罩：唤醒中 / 失败两阶段 |
| `sider-team-section.svg` | 侧栏团队区（展开/收起）+ 会话内临时团队入口 |

## 复现总原则

1. **UI 库**：Arco Design（`@arco-design/web-react`）+ `@icon-park/react` 图标；不出现原生 `<button>/<input>`（TeamTabs 胶囊内的原生元素是旧版有意的例外，见 03 文档说明）。
2. **样式**：UnoCSS 工具类为主，语义 token（`bg-fill-1/2`、`text-t-primary/secondary/tertiary`、`border-border-2/3`、`primary`、`danger-6`、`warning`）——**不允许硬编码色值**（身份色板 `TEAM_MEMBER_PALETTE` 是规格的一部分，除外）。
3. **弹窗壳**：统一 `AionModal variant='standard'`（标题区 `px-24 pt-20 pb-16` + 下分隔线 / 内容区 `px-24 py-20` / 按钮区 `border-t px-24 py-16`）；按钮统一 `h-38 rd-8 px-18 text-13`，Cancel `min-w-84`、主按钮 `min-w-100`。
4. **i18n**：所有用户可见文案走 i18n 键，13 语言键位一致（键清单见 07）。
5. **data-testid**：旧版 E2E/单测依赖的 testid 是规格的一部分，复现时同名保留（清单见 08 验收清单附录）。
