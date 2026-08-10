# 设计规格归档来源审计

审计日期：2026-08-10  
范围：`AionUi/docs/plans/二开项目升级/设计规格归档/` 下 8 份 Markdown 与 `assets/` 下 8 份 SVG。  
原始证据：`adf8dfaa432625cd1688459b2990156140be1fd7`、`e3f154559ec4cbb68816bf35e914b49f3221b9e2`。  
审计方式：只读 `git show/git grep/git diff`，未修改仓库文件；报告写入 `/tmp`。

## 结论

总体判定：规格归档确实以原始二开源码/测试/i18n 为主证据，未发现被 v2.1.52 重写实现反向污染的证据。`e3f154559` 是 `adf8dfaa4` 的后继提交（`git merge-base adf8dfaa4 e3f154559` 返回 e3），其新增专家团预设目录、TeamCreateModal 接入、测试和 13 语言文案均可从该提交直接复核。归档文档和 SVG 的证据标注一致指向 `e3f154559`，没有把 `d0beccbf8`、`9990640d6`、`bd728fb4d` 或 v2.1.52 代码提交冒充原始规格。

但归档存在两项需要更正的文档准确性问题：

1. `07-文案键清单.md` 声称“每语言 35 个预设相关键”；对 `e3f154559` 的 13 个 `team.json` 做 JSON 解析，`presets` 对象均为 31 个键（含遗留 `editorComingSoon` 和删除相关键）。应改为 31，或明确 35 是跨 namespace/辅助键的统计口径。
2. 同一文档先写“源码中所有 `t()` 均带 `defaultValue`”，后面又明确承认 `conversation.collaboration.createFailed` 直接使用键、没有 `defaultValue`。应改为“预设/创建主要文案带 defaultValue”，避免自相矛盾。

这两项是归档文字统计/表述问题，不改变其 UI 规格来源判定。

## 逐文件来源核验

| 归档文件 | 原始来源对照 | 结果 |
| --- | --- | --- |
| `01-专家团预设-设计规格.md` | `e3f154559:packages/desktop/src/renderer/pages/team/TeamPresets/`；对照 Picker、Preview、MemberList、EmptyState、EditorModal、`useTeamPresets` | 结构、卡片行为、缺失成员、编辑校验、Leader 规则、乐观 CRUD 均能在原始源码找到；“搜索框旧版不绑定过滤”与源码一致。 |
| `02-团队创建弹窗-设计规格.md` | `e3f154559:.../TeamCreateModal.tsx`、`TeamCreateModal.module.css`、`memberPicker/*` | 双 Tab、桌面双栏、移动单栏、成员草稿、Leader 校验、预设回填及 Tabs CSS 说明均有源码证据；不是从 v2.1.52 当前实现反推。 |
| `03-团队页与运行态-设计规格.md` | `e3f154559:TeamPage.tsx`、`TeamTabs.tsx`、`TeamViewToggle.tsx`、`TeamWarmupOverlay.tsx`、`TeamChatEmptyState.tsx`、`AgentStatusBadge.tsx`、identity/base CSS | 胶囊成员栏、并行/单聊、颜色分配、warmup 状态、空状态和移除确认可在 e3 文件中逐项定位。 |
| `04-入口与临时团队-设计规格.md` | `e3f154559:Router.tsx`、`TeamSiderSection.tsx`、`AdHocTeam/*`、`TeamAddMemberPopover.tsx`、`TeamAssistantPickerDropdown.tsx` | 侧栏入口、CollaborationLauncher、AgentSelectorModal、TeamStatusCard、添加成员和回源交互均以原始源码为依据。 |
| `05-状态矩阵.md` | 对照上述 e3 组件和 e3 DOM tests | 状态枚举与测试意图和原版一致；其中“验收/矩阵”是规格要求，不等同于当前 v2.1.52 已全部通过。 |
| `06-交互流程.md` | 对照 e3 组件处理函数及 `useTeamPresets.dom.test.tsx`、`TeamPresetPicker.dom.test.tsx` 等 | 创建、调用、CRUD、成员管理、warmup、临时团队和视图切换步骤与旧源码行为相符。 |
| `07-文案键清单.md` | 13 个 `e3f154559:.../locales/*/team.json`，及 `conversation.json` | 13 语言目录和键位一致；预设统计数应为 31 而非 35，另有 defaultValue 表述矛盾。 |
| `08-验收清单.md` | e3 DOM tests、组件 testid 和对应源码 | testid 清单大多可由 e3 `git grep` 复核；方框均为待执行验收项，不应被解读为 e3 或 v2.1.52 已验证结果。 |

## SVG 逐项核验

8 个 SVG 顶部证据标注均指向 e3 文件：

- `preset-editor-modal.svg` → e3 `TeamPresetEditorModal/index.tsx`；宽度 720、z-index 10001/10000 与源码一致。
- `presets-tab.svg` → e3 Picker/Preview/MemberList；对应桌面左右分栏宿主。
- `team-create-modal-desktop.svg` → e3 `TeamCreateModal.tsx`；900 宽、`min(54vh,470px)`、双栏等测量值与源码一致。
- `team-create-modal-mobile.svg` → e3 `mobileBody`/`TeamAssistantPickerDropdown`；移动宽度和 testid 说明与源码一致。
- `team-page-parallel.svg` → e3 TeamPage/TeamTabs/TeamViewToggle；并行/单聊说明与源码一致。
- `team-tabs-capsules.svg` → e3 TeamTabs/AgentStatusBadge/teamMemberColors。
- `warmup-overlay.svg` → e3 TeamWarmupOverlay/base CSS keyframes。
- `sider-team-section.svg` → e3 TeamSiderSection，并注明临时团队入口。

SVG 中未发现 `v2.1.52`、`d0beccbf8`、`9990640d6` 或 `bd728fb4d` 标识。SVG 是源码测量线框，不是运行时截图；因此可以证明尺寸/结构取证链，不能单独证明像素渲染或当前实现通过。

## 测试与 i18n 原始证据

`e3f154559` 至少包含以下直接相关测试：

- `tests/unit/renderer/team/TeamPresetPicker.dom.test.tsx`：Arco Button 可访问性、Enter/点击选中、Invoke/More 独立按钮。
- `tests/unit/renderer/team/useTeamPresets.dom.test.tsx`：list、乐观 create/update/delete、未知 id 和失败回滚。
- `tests/unit/renderer/team/TeamTabs.dom.test.tsx`、`TeamWarmupOverlay.dom.test.tsx`、`useTeamWarmup.dom.test.ts`：团队页运行态。

对 13 个 e3 `team.json` 进行 JSON 解析，`presets` 键数量全部为 31；其中法语文件也为 31，不能支持“35”这一数字。`adf8dfaa4` 是 e3 的祖先基础，且 e3 新增的专家团资产完整存在，故来源链闭合。

## v2.1.52 反向污染审计

- 规格 Markdown 的主证据统一写为 e3 路径/提交；SVG 顶部证据同样统一为 e3。
- `README.md` 中出现的 v2.1.52 仅是旁证审计文件 `/tmp/adhoc-team-ui-audit-v2.1.52.md` 的链接，且文本明确区分“临时团队演进审计”和“e3 专家团规格”，不是规格来源替换。
- 归档所在提交为 `951bc6b66245e5e55da696720d7d25712ab29ac0`（父提交 `b397e15fd...`），其提交消息为 `docs(team): archive reusable customization assets`；该文档提交晚于 v2.1.52 开发活动本身不构成污染证据。来源审计应以文件内明确证据和 e3 对照为准。
- 当前 v2.1.52 实现可有必要适配差异，但不应回写为旧版产品规格；本归档目前未出现这种回写。

## 建议

1. 仅修正文案统计和 defaultValue 句子的两个文字问题；保留所有 e3 来源标注。
2. 在归档 README 增加“规格档案不是当前实现状态/验收结果”的警示，避免把 `08-验收清单` 的未勾选项误当成已通过。
3. 后续适配报告继续分开记录“e3 规格事实”和“v2.1.52 宿主适配事实”，不要将当前实现 testid/行为差异直接改写进本归档。
