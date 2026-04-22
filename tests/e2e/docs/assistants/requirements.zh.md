# Assistant 设置页需求文档（反推自源码）

- 模块路径：`src/renderer/pages/settings/AssistantSettings/`
- 产出者：assistant-analyst-2
- 日期：2026-04-21
- 版本：v1.1（门 1 定稿，已双 review）
- 审阅状态：✅ Engineer review 通过（2026-04-21 14:50） + ✅ Designer review 通过（2026-04-21 15:00） + ✅ 已修订 8 条建议（2026-04-21 15:10）
- 目的：为"补充 E2E 测试"提供需求依据。本文档基于源码反推，不以现有 `tests/e2e/specs/assistant-settings-*.e2e.ts` 测试行为作为需求来源（specs 仅用于统计"已覆盖场景"）。

---

## 1. 页面概述与目的

Assistant 设置页（下文简称"本页"）是设置中心的一个子页面，用于管理应用中所有的 AI 助手（Assistant）。助手按来源分为三类：

- **Builtin（内置）**：由 `ASSISTANT_PRESETS` 预置（`assistantUtils.ts:1`），ID 前缀 `builtin-`
- **Extension（扩展）**：由已加载的 extension 贡献（`normalizeExtensionAssistants`，`assistantUtils.ts:72`），ID 前缀 `ext-`
- **Custom（自定义）**：用户自行创建

页面允许用户按需创建自己的助手、编辑助手的名称/描述/头像/主 Agent/Rules/Skills，以及启用/禁用、复制、删除助手。

UI 主要组件（引用自 `index.tsx`）：

- `AssistantListPanel`（列表视图 + 搜索/过滤 + 新建按钮）
- `AssistantEditDrawer`（编辑抽屉，右侧 Drawer）
- `DeleteAssistantModal`（删除确认弹窗）
- `AddSkillsModal`（从外部源添加技能的弹窗）
- `AddCustomPathModal`（为技能库添加自定义路径的弹窗）
- `SkillConfirmModals`（删除 pending 技能 / 从当前助手移除 custom 技能的确认弹窗）

---

## 2. 功能清单（对应源码）

### 2.1 列表展示

| # | 需求 | 源码追溯 |
|---|---|---|
| F-L-01 | 列表以卡片形式展示所有助手，每卡片含 Avatar、名称、描述、来源标签、启用开关、编辑按钮、复制按钮 | `AssistantListPanel.tsx:117-178` |
| F-L-02 | Avatar 支持 emoji / 图片 URL / 内置图标（Robot）三种渲染 | `AssistantAvatar.tsx:23-34`, `assistantUtils.ts:34-48` |
| F-L-03 | 卡片上的"Duplicate"按钮仅在 hover 时可见 (`invisible group-hover:visible`) | `AssistantListPanel.tsx:148` |
| F-L-04 | Extension 助手的启用开关**始终为 on 且 disabled** | `AssistantListPanel.tsx:159-161` |
| F-L-05 | 列表按"Enabled"和"Disabled"分为两个区段分别渲染，每个区段带 section 标题和数量 | `AssistantListPanel.tsx:180-192, 279-283` |
| F-L-06 | Custom 助手卡片右上显示"Custom"绿色标签；Builtin/Extension 不显示 | `AssistantListPanel.tsx:98-114` |
| F-L-07 | 点击卡片主体（非右侧操作区）= 打开编辑抽屉 | `AssistantListPanel.tsx:126-129` |
| F-L-08 | 过滤为空时显示"No assistants match the current filters." 占位文案 | `AssistantListPanel.tsx:284-290` |
| F-L-09 | 列表按 `ASSISTANT_PRESETS` 预置顺序排序（preset 部分） | `assistantUtils.ts:53-67` |
| F-L-10 | 移动端布局响应式：按钮/搜索区纵向排列（`flex-col`），Create 按钮宽度 100%、高度 36px（桌面 32px） | `AssistantListPanel.tsx:50-51, 200-217` |

### 2.2 搜索

| # | 需求 | 源码追溯 |
|---|---|---|
| F-S-01 | 顶部有"搜索"切换按钮（`data-testid="btn-search-toggle"`），点击后展开搜索输入框 | `AssistantListPanel.tsx:230-250` |
| F-S-02 | 搜索按钮的图标在"未展开"时为 Search、"已展开"时为 CloseSmall | `AssistantListPanel.tsx:235-241` |
| F-S-03 | 搜索按钮再次点击（已展开状态）= 清空 searchQuery 并折叠搜索栏 | `AssistantListPanel.tsx:242-249` |
| F-S-04 | 展开时搜索输入自动获取焦点（`autoFocus`） | `AssistantListPanel.tsx:256` |
| F-S-05 | 搜索支持 `allowClear`（输入时右侧出现清除图标） | `AssistantListPanel.tsx:255` |
| F-S-06 | 搜索范围：助手名称（含 i18n 版本）+ 描述（含 i18n 版本），不区分大小写，子串匹配 | `assistantUtils.ts:126-144` |
| F-S-07 | 空查询时不过滤（归一化后为空串直接跳过过滤） | `assistantUtils.ts:134-135` |
| F-S-08 | `searchQuery` 非空时（>0 字符），即便 `searchExpanded=false` 搜索栏也应保持可见 | `AssistantListPanel.tsx:194` |

### 2.3 过滤 Tabs

| # | 需求 | 源码追溯 |
|---|---|---|
| F-F-01 | 提供 All / System（builtin） / Custom 三个 Tab；默认 `all` | `AssistantListPanel.tsx:92-96` |
| F-F-02 | `builtin` tab 过滤条件为"非 custom"（即 builtin 或 extension 都会被包含） | `assistantUtils.ts:152-153` |
| F-F-03 | `custom` tab 仅显示 source 为 custom 的助手 | `assistantUtils.ts:154-155` |
| F-F-04 | 切换 Tab 后列表立即刷新（无需确认按钮） | `AssistantListPanel.tsx:267-276` |
| F-F-05 | `filterAssistants` 先过 searchQuery、再过 filter，两者为"与"关系 | `assistantUtils.ts:134-161` |

### 2.4 新建助手

| # | 需求 | 源码追溯 |
|---|---|---|
| F-C-01 | 页面右上有"Create Assistant"按钮（`data-testid="btn-create-assistant"`） | `AssistantListPanel.tsx:207-216` |
| F-C-02 | 点击后打开 `AssistantEditDrawer`，`isCreating=true`，Drawer 标题显示"Create Assistant" | `AssistantEditDrawer.tsx:181-183` |
| F-C-03 | 新建模式下底部按钮文案为"Create"（`isCreating ? 'Create' : 'Save'`） | `AssistantEditDrawer.tsx:217-219` |
| F-C-04 | 新建抽屉初始化时 Rules 编辑区自动获得焦点（在 `edit` 模式下，延迟 100ms 后聚焦 textarea） | `AssistantEditDrawer.tsx:107-115` |
| F-C-05 | 新建模式下不显示"Delete"按钮（仅非 builtin 且非 extension 的已有助手才显示） | `AssistantEditDrawer.tsx:229-239` |

### 2.5 编辑助手（Drawer 字段）

#### 2.5.1 权限规则（来自 `index.tsx:4-20` 表格注释）

| 字段 | Builtin | Extension | Custom |
|---|---|---|---|
| Save 按钮 | yes（显示 + 可点） | no（不显示） | yes |
| Name 输入 | disabled | disabled | 可编辑 |
| Description 输入 | disabled | disabled | 可编辑 |
| Avatar（EmojiPicker） | 不可替换（直接渲染 Avatar） | 不可替换 | 点击打开 EmojiPicker 可替换 |
| Main Agent 选择 | 可改 | 不可改 | 可改 |
| Rules（Prompt） | 只读（直接 Markdown 预览） | 只读 | 可编辑 + 可切"Edit/Preview" |
| Delete 按钮 | 不显示 | 不显示 | 显示 |

> **已知差异（源码实际行为 vs 权限表设计意图）**：
>
> `AssistantEditDrawer.tsx:280` 的 Name 输入 `disabled={activeAssistant?.isBuiltin}` —— Extension 助手的 `isBuiltin=false`，因此源码层面 Extension 的 Name 输入实际为 **enabled**，与 `index.tsx` 权限表的"Extension Name = no"矛盾。
>
> **E2E 测试原则**：以源码实际行为为准，断言 Extension Name input **not disabled**，并在 `discussion-log.zh.md` 记录此差异。Designer/Engineer 需评估是否为 bug 或需更新权限表。

#### 2.5.2 Drawer 布局与交互

| # | 需求 | 源码追溯 |
|---|---|---|
| F-E-01 | Drawer 右侧弹出，`placement='right'`，width 根据窗口宽度响应：`Math.min(1024, Math.max(480, width * 0.5))` | `AssistantEditDrawer.tsx:117-128, 199-200` |
| F-E-02 | 顶部右上有自定义关闭按钮（`Close` 图标），点击关闭 Drawer | `AssistantEditDrawer.tsx:185-194` |
| F-E-03 | Drawer 带 `data-testid="assistant-edit-drawer"` | `AssistantEditDrawer.tsx:243` |
| F-E-04 | Drawer 从右侧滑入不会遮盖 Cancel/Save 按钮 | `AssistantEditDrawer.tsx:209-241` |
| F-E-05 | Drawer 底部含三个按钮：主按钮 Save/Create、副按钮 Cancel、危险按钮 Delete（条件显示） | `AssistantEditDrawer.tsx:209-241` |
| F-E-06 | Rules 区顶部有"Expand/Collapse"按钮，切换内容高度（`420px` vs `260/220px`） | `AssistantEditDrawer.tsx:170-174, 351-355` |
| F-E-07 | Rules 区在 Custom 助手下有"Edit / Preview"两个 Tab 样式选择器 | `AssistantEditDrawer.tsx:361-376` |
| F-E-08 | Rules 预览模式下内容为空时显示"No content to preview" | `AssistantEditDrawer.tsx:397-404` |
| F-E-09 | 底部 Summary 小卡片显示当前选中的 Main Agent Tag + Skills 计数 Tag | `AssistantEditDrawer.tsx:329-343` |
| F-E-10 | Main Agent 下拉项渲染：opt.name + 带 `Extension` tag 标识（当 `opt.isExtension=true`） | `AssistantEditDrawer.tsx:308-326` |

#### 2.5.3 Skills 区（仅在 `showSkills=true` 时渲染）

`showSkills` 逻辑（`AssistantEditDrawer.tsx:131-134`）：

1. `isCreating=true` → 显示
2. 已选 Builtin 且 `hasBuiltinSkills(id)` → 显示
3. 已选 Custom（`!isBuiltin`）→ 显示

**Extension 助手行为**：Extension 的 `isBuiltin=false`，因此满足条件 3（`!activeAssistant.isBuiltin`），**会显示 Skills 区**，但因 `isExtensionAssistant(activeAssistant)` 判断，其字段为只读。

| # | 需求 | 源码追溯 |
|---|---|---|
| F-SK-01 | Skills 区顶部有"Add Skills"按钮，点击打开 `AddSkillsModal` | `AssistantEditDrawer.tsx:416-425` |
| F-SK-02 | Skills 区内部有 `Collapse`，默认展开 `custom-skills` 分组 | `AssistantEditDrawer.tsx:428` |
| F-SK-03 | 分组包括：Custom/Imported（含 Pending + 已导入 custom）、Builtin、Extension（有才显示）、Auto-injected（有才显示）| `AssistantEditDrawer.tsx:430-702` |
| F-SK-04 | 每个分组 header 右侧有"已激活/总数"计数 + 状态点（激活绿、无灰） | `AssistantEditDrawer.tsx:438-451, 550-562, 604-617, 661-670` |
| F-SK-05 | Pending 技能卡片有橘黄色 `PENDING` 标签 | `AssistantEditDrawer.tsx:473-476` |
| F-SK-06 | Custom（已导入）技能卡片有橘黄色 `CUSTOM` 标签 | `AssistantEditDrawer.tsx:513-517` |
| F-SK-07 | Extension 技能卡片有蓝色 `EXTENSION` 标签 | `AssistantEditDrawer.tsx:636-639` |
| F-SK-08 | Auto-injected 技能卡片有绿色 `AUTO` 标签 | `AssistantEditDrawer.tsx:689-692` |
| F-SK-09 | Pending/Custom 技能卡片 hover 时右侧显示删除按钮，点击打开对应确认弹窗 | `AssistantEditDrawer.tsx:482-491, 522-531` |
| F-SK-10 | Auto-injected 技能的勾选存 `disabledBuiltinSkills`（反向逻辑：勾中 = 启用 = 不在 disabled 列表） | `AssistantEditDrawer.tsx:677-685` |
| F-SK-11 | 空态文案：Pending+Custom 都为空 → "No custom skills added"；Builtin 为空 → "No builtin skills available" | `AssistantEditDrawer.tsx:534-538, 589-592` |

### 2.6 复制助手

| # | 需求 | 源码追溯 |
|---|---|---|
| F-D-01 | 列表卡片 hover 时出现"Duplicate"文字按钮，`data-testid="btn-duplicate-<id>"` | `AssistantListPanel.tsx:146-155` |
| F-D-02 | 点击 Duplicate 调用 `editor.handleDuplicate`（由 `useAssistantEditor` hook 处理），之后 Drawer 以 isCreating=true 打开，字段预填复制源的内容 | `index.tsx:149-150` |

### 2.7 启用/禁用

| # | 需求 | 源码追溯 |
|---|---|---|
| F-T-01 | 卡片右侧 Switch（`data-testid="switch-enabled-<id>"`）用于切换 `enabled` | `AssistantListPanel.tsx:156-164` |
| F-T-02 | Extension 的 Switch `disabled` 且 `checked=true` 固定 | `AssistantListPanel.tsx:159-160` |
| F-T-03 | 切换后卡片在"Enabled"/"Disabled"区段间重新分组 | `assistantUtils.ts:167-170` |

### 2.8 删除

| # | 需求 | 源码追溯 |
|---|---|---|
| F-R-01 | Drawer 底部的 Delete 按钮仅对 Custom 助手可见（见 2.5.1 权限表） | `AssistantEditDrawer.tsx:229` |
| F-R-02 | 点击 Delete 打开 `DeleteAssistantModal` | `DeleteAssistantModal.tsx:28-57` |
| F-R-03 | 弹窗内含确认文案 + 助手卡片预览（Avatar、名称、描述）| `DeleteAssistantModal.tsx:42-55` |
| F-R-04 | 确认按钮状态 `danger`，文案"Delete"；取消按钮文案"Cancel" | `DeleteAssistantModal.tsx:33-37` |
| F-R-05 | 弹窗 `data-testid="modal-delete-assistant"` | `DeleteAssistantModal.tsx:35` |

### 2.9 AddSkillsModal（外部技能源浏览）

| # | 需求 | 源码追溯 |
|---|---|---|
| F-A-01 | 顶部显示所有外部技能源（来自 `externalSources`），每个源是 pill 按钮，显示源名 + 技能数 | `AddSkillsModal.tsx:74-95` |
| F-A-02 | 右侧操作区：Refresh 按钮（加载时 `animate-spin`）、"+"按钮打开"Add Custom Path"弹窗 | `AddSkillsModal.tsx:96-112` |
| F-A-03 | 搜索输入框用于过滤当前激活源的技能 | `AddSkillsModal.tsx:116-123` |
| F-A-04 | 技能列表空态文案（按状态）：Loading → "Loading..."；无源 → "No external skill sources discovered"；搜索无结果 → "No skills found" | `AddSkillsModal.tsx:127-187` |
| F-A-05 | 每个技能卡片右侧 Add 按钮；已添加过则按钮文案变"Added" 且 disabled | `AddSkillsModal.tsx:152-172` |
| F-A-06 | 点击 Add 调用 `handleAddFoundSkills`（将技能加到 pending） | `AddSkillsModal.tsx:166-167` |
| F-A-07 | Modal 关闭时清空搜索框（`onCancel` 的 callback 在 `index.tsx:203-207`） | `index.tsx:203-207` |

### 2.10 AddCustomPathModal

| # | 需求 | 源码追溯 |
|---|---|---|
| F-P-01 | 两个输入：Name、Skill Directory Path | `AddCustomPathModal.tsx:45-89` |
| F-P-02 | Path 输入右侧有"FolderOpen"按钮，点击触发 `dialog.showOpen`（选择目录） | `AddCustomPathModal.tsx:70-83` |
| F-P-03 | 确认按钮在 Name 或 Path 任一为空（trim 后）时 disabled | `AddCustomPathModal.tsx:39` |

### 2.11 SkillConfirmModals

| # | 需求 | 源码追溯 |
|---|---|---|
| F-SC-01 | "删除 Pending 技能"确认弹窗：仅从 pending/customSkills/selectedSkills 移除；弹 message "Skill removed from pending list" | `SkillConfirmModals.tsx:50-81` |
| F-SC-02 | "从助手移除 Custom 技能"确认弹窗：仅从当前助手的 customSkills/selectedSkills 移除；弹 message "Skill removed from this assistant" | `SkillConfirmModals.tsx:84-116` |
| F-SC-03 | 两个弹窗的 OK 按钮都是 danger 状态 | `SkillConfirmModals.tsx:54, 88` |

---

## 3. 交互流程（关键路径）

### 3.1 创建 Custom 助手（典型完整流程）

1. 用户点击顶部 `btn-create-assistant`
2. Drawer 以 `isCreating=true` 打开，内部字段为空（或预填默认 Agent）
3. 用户填写 Name/Description/Avatar/Agent；编辑 Rules；（可选）在 Skills 区"Add Skills"
4. 用户点 Save/Create
5. 后端持久化 → 列表刷新 → Drawer 关闭（注：create 完成会关闭，但 Edit 模式下 Save 不自动关闭，见 specs/crud 测试 L249）

### 3.2 路由打开指定助手（`?highlight=id` + 滚动高亮）

1. 进入页面带 `?highlight=<id>` query
2. `useEffect` 等 assistants 加载完、DOM ref 填好后滚动到对应卡片
3. 添加 `border-primary-5 bg-primary-1` 高亮 2 秒
4. 调用 `onHighlightConsumed` → 清空 query param

> 源码：`AssistantListPanel.tsx:66-81`, `index.tsx:53-58`

### 3.3 导航状态自动打开编辑器

页面通过两条路径可被"跳转 + 自动打开编辑器"：
- React Router `location.state = { openAssistantId, openAssistantEditor: true }`
- `sessionStorage['guid.openAssistantEditorIntent'] = JSON({assistantId, openAssistantEditor: true})`

页面读取到 intent 后调用 `editor.handleEdit(target)`，并 `sessionStorage.removeItem` 清理 intent（`index.tsx:105-137`）。

### 3.4 Skills → Pending → Imported 状态流

1. 用户在 `AddSkillsModal` 选中外部技能点 Add
2. 技能被加到 `pendingSkills`（显示 PENDING 标签）
3. 用户 Save → 后端导入 → pending 迁移到 customSkillItems（显示 CUSTOM 标签）

---

## 4. 数据模型与持久化

- `AssistantListItem = AcpBackendConfig & { _source, _extensionName, _kind }`（`types.ts:35-39`）
- `SkillInfo`：name / description / location / isCustom / source
- `PendingSkill`：path / name / description
- `BuiltinAutoSkill`：name / description
- 数据通过 `useAssistantList` / `useAssistantEditor` / `useAssistantSkills` hook 获取，底层走 IPC bridge 持久化（具体 bridge key 需 Engineer 查询）
- `ASSISTANT_PRESETS`：来源 `@/common/config/presets/assistantPresets`，定义 builtin 顺序、预置 skills

---

## 5. 边界与异常处理

| # | 场景 | 预期 | 源码追溯 |
|---|---|---|---|
| B-01 | 搜索输入只有空白 | `trim().toLowerCase()` → 空串 → 不过滤 | `assistantUtils.ts:132` |
| B-02 | 新建助手 Name 为空直接 Save | Drawer 不关闭（`handleSave` 应做校验，具体由 hook 控制；UI 层 Name 前有红色 `*` 标识必填） | `AssistantEditDrawer.tsx:248-249` |
| B-03 | 过滤后结果为 0 | 显示"No assistants match the current filters." | `AssistantListPanel.tsx:284-290` |
| B-04 | Pending/Custom 都空 | Custom 分组空态"No custom skills added" | `AssistantEditDrawer.tsx:534-538` |
| B-05 | Builtin 预置没有 skills | Builtin 分组空态"No builtin skills available" | `AssistantEditDrawer.tsx:589-592` |
| B-06 | Avatar 为非图片字符串（例如纯文字） | `resolveAvatarImageSrc` 返回 undefined → 回退到 emoji 或 Robot 图标 | `assistantUtils.ts:34-48`, `AssistantAvatar.tsx:25-32` |
| B-07 | Avatar 解析 `aion-asset://` / `file://` / `data:` / `http(s):` / `.svg/png/...` | 识别为 image，返回可用 src | `assistantUtils.ts:46` |
| B-08 | Duplicate 按钮点击时卡片主体 onClick 被 stopPropagation 拦截 | 卡片主体的 onClick 不会被触发 | `AssistantListPanel.tsx:143-145` |
| B-09 | Switch 点击不应触发卡片主体的 onClick | 同上（共享同一个 stopPropagation 容器） | `AssistantListPanel.tsx:143-145` |
| B-10 | Extension 助手的 enabled Switch | 始终 `checked=true` 且 `disabled` | `AssistantListPanel.tsx:159-161` |
| B-11 | 导航 intent JSON parse 失败 | console.error，不崩页 | `index.tsx:119-121` |
| B-12 | highlightId 指向不存在的 id | `find` 返回 undefined → 静默跳过（不滚动、不高亮） | `AssistantListPanel.tsx:68-70` |
| B-13 | Delete Modal 打开时 `activeAssistant=null` | 不渲染助手预览行（`activeAssistant && ...`） | `DeleteAssistantModal.tsx:47` |
| B-14 | 高亮动画中途组件卸载 | `useEffect` cleanup 清理 timer，避免 warning | `AssistantListPanel.tsx:66-81`（`setTimeout` 2 秒 + `return () => clearTimeout(timer)`） |
| B-15 | 搜索 + Tab 过滤同时生效导致空结果 | 两个条件为"与"关系，用户可能误以为是 bug | `assistantUtils.ts:134-161`（`filterAssistants` 先过 searchQuery、再过 filter） |

---

## 6. 国际化 / 主题相关

- 所有文本通过 `useTranslation()`（`react-i18next`）；默认 fallback 是英文 defaultValue
- `nameI18n` / `descriptionI18n` / `contextI18n` / `promptsI18n` 按 `localeKey` 查找本地化版本（`filterAssistants` 也用 localeKey 做搜索 key）
- 列表按钮/输入使用 Arco Design 组件（`@arco-design/web-react`）
- 图标统一 `@icon-park/react`

---

## 7. 已覆盖场景清单（from `tests/e2e/specs/assistant-settings-*.e2e.ts`）

### 7.1 `assistant-settings-crud.e2e.ts`（15 个用例）

| ID | Test name | 覆盖的需求 |
|---|---|---|
| C-01 | page loads with assistant list | F-L-01（基础渲染） |
| C-02 | search filter — by name | F-S-06（搜索过滤） |
| C-03 | search filter — clear restores full list | F-S-03（清空搜索） |
| C-04 | tab filter — System / Custom | F-F-01 / F-F-02 / F-F-03 |
| C-05 | create custom assistant — full flow | F-C-01 / F-C-02 / F-C-03 / 3.1 流程 |
| C-06 | create assistant — name required validation | B-02（Name 必填校验） |
| C-07 | edit custom assistant — change name | F-E-01（编辑 Name） |
| C-08 | edit custom assistant — switch Main Agent | F-E-10（切换 Agent） |
| C-09 | duplicate assistant | F-D-01 / F-D-02 |
| C-10 | delete custom assistant | F-R-01 / F-R-02 |
| C-11 | enable / disable toggle | F-T-01 / F-T-03 |
| C-12 | disabled builtin assistant removed from guid page presets | F-T-01（与 guid 联动） |
| C-13 | re-enabled assistant visible after toggle back on | F-T-03（re-enable） |
| C-14 | created assistant persists after page reload | 4（持久化） |
| C-15 | sort order — enabled section renders before disabled | F-L-05（section 顺序） |

### 7.2 `assistant-settings-permissions.e2e.ts`（8 个用例）

| ID | Test name | 覆盖的需求 |
|---|---|---|
| P-01 | builtin — name/desc/avatar read-only | 2.5.1 权限表（Builtin Name/Desc disabled） |
| P-02 | builtin — Main Agent editable | 2.5.1 权限表（Builtin Agent 可改） |
| P-03 | builtin — no delete button | 2.5.1 权限表（Builtin 无 Delete） |
| P-04 | builtin — save button enabled | 2.5.1 权限表（Builtin Save 可点） |
| P-05 | extension — name/desc/save all editable | 2.5.1 权限表（Extension，**实际 Name not disabled**） |
| P-06 | extension — no delete button | 2.5.1 权限表（Extension 无 Delete） |
| P-07 | extension — can duplicate | F-D-01（Extension 可 Duplicate） |
| P-08 | custom — all fields editable | 2.5.1 权限表（Custom 全可编辑） |

### 7.3 `assistant-settings-skills.e2e.ts`（10 个用例）

| ID | Test name | 覆盖的需求 |
|---|---|---|
| S-01 | skill panel shows builtin skills for custom assistant | F-SK-03（Builtin 分组） |
| S-02 | skill panel shows auto-injected skills section | F-SK-03（Auto-injected 分组） |
| S-03 | toggle builtin skill selection | F-SK-03（勾选 Builtin skill） |
| S-04 | disable auto-injected skill and save | F-SK-10（反向逻辑） |
| S-05 | add skills button opens modal | F-SK-01 / F-A-01 |
| S-06 | skill selection persists after save and reopen | 4（持久化） |
| S-07 | builtin assistant can access skills section | 2.5.3（Builtin showSkills） |
| S-08 | custom skills collapse renders | F-SK-02（Custom 分组） |
| S-09 | extension assistant drawer opens without error | 部分覆盖 2.5.3（验证 Extension Drawer 可打开，**但未断言 Skills 区渲染**） |
| S-10 | skills counter shows in summary | F-E-09（Summary 计数） |

---

## 8. 补充测试范围（未被 specs/ 覆盖的需求项）

**总计**：38 条补充测试清单（P0=6 / P1=27 / P2=5）

下表列出本次**补充 E2E 测试**要覆盖的需求，每条明确对应本文档第 2/3/5 节的需求 ID。按优先级排序（P0=核心交互、P1=重要 UI 状态、P2=边界/辅助）。

### P0（核心交互，必测）

| 补充用例 | 覆盖的需求 | 优先级 | 理由 |
|---|---|---|---|
| 搜索栏展开/折叠按钮行为 + 图标切换 | F-S-01 / F-S-02 / F-S-03 / F-S-08 | P0 | specs C-02/C-03 只测了搜索结果过滤，未测切换按钮图标变化、折叠清空行为 |
| 卡片点击区域隔离（主体 vs 右侧操作区） | F-L-07 / B-08 / B-09 | P0 | specs 多数通过 helper `openAssistantDrawer` 触发，未验证"右侧 Switch/Duplicate 点击不会打开 Drawer" |
| Delete 确认弹窗含助手预览卡片 | F-R-03 / F-R-04 / F-R-05 | P0 | specs C-10 用 helper 直接确认删除，未验证预览区 Avatar/名称/描述渲染 |
| highlightId 滚动到卡片并高亮 2 秒，之后清 query | 3.2 交互流程 | P0 | 未覆盖 |
| AddSkillsModal 搜索框过滤 + 无结果文案 "No skills found" | F-A-03 / F-A-04 | P0 | 未覆盖（AddSkillsModal 搜索是"添加技能"主交互的关键用户反馈） |
| Extension 助手 Skills 区渲染验证 | 2.5.3（Extension showSkills） | P0 | S-09 仅测 Drawer 可打开，未断言 `data-testid="skills-section"` 可见 |

### P1（重要 UI 状态，推荐测）

| 补充用例 | 覆盖的需求 | 优先级 | 理由 |
|---|---|---|---|
| 搜索输入 autoFocus | F-S-04 | P1 | 未覆盖 |
| 搜索空白查询不过滤 | F-S-07 / B-01 | P1 | 未覆盖 |
| Custom 来源标签显示 / Builtin 不显示 | F-L-06 | P1 | specs 只测了 filter Tab，未测卡片内的来源标签 |
| 过滤结果为 0 的空态文案 | F-L-08 / B-03 | P1 | 未覆盖 |
| Duplicate 按钮仅在 hover 时可见 | F-L-03 / F-D-01 | P1 | specs P-07 仅测"可见"（hover 后），未测默认"不可见" |
| Extension Switch 为 disabled 且 checked | F-L-04 / F-T-02 / B-10 | P1 | 未覆盖 |
| Drawer 关闭按钮（右上 Close 图标） | F-E-02 | P1 | specs 多用 Escape，未测自定义关闭图标 |
| Drawer footer 的 Cancel 按钮关闭 Drawer | F-E-05 | P1 | 未覆盖 |
| Rules 区 Expand/Collapse 切换高度 | F-E-06 | P1 | 未覆盖 |
| Rules 区 Edit/Preview Tab 切换 | F-E-07 / F-E-08 | P1 | 未覆盖 |
| Rules 预览模式空内容占位文案 | F-E-08 | P1 | 未覆盖 |
| Main Agent 下拉项显示 Extension tag | F-E-10 | P1 | 未覆盖 |
| Skills 区分组 Header 计数格式（N/M + 状态点） | F-SK-04 | P1 | 未覆盖 |
| Pending 技能 PENDING 标签渲染 | F-SK-05 | P1 | 未覆盖 |
| Custom 技能 CUSTOM 标签渲染 | F-SK-06 | P1 | 未覆盖 |
| 点击 Pending 删除 → SkillConfirm 删除弹窗 + 确认消息 | F-SC-01 | P1 | 未覆盖 |
| 点击 Custom 删除 → SkillConfirm 从助手移除弹窗 + 确认消息 | F-SC-02 | P1 | 未覆盖 |
| Auto-injected 技能反向逻辑持久化：勾去掉 → 再打开仍为去掉状态 | F-SK-10 | P1 | S-04 仅测 save 不崩，未断言 `disabledBuiltinSkills` 在下次打开时生效 |
| Custom 空态文案 "No custom skills added" | F-SK-11 / B-04 | P1 | 未覆盖 |
| AddSkillsModal 顶部外部源 pill 渲染 + 激活切换 | F-A-01 | P1 | specs S-05 仅开弹窗 + Escape，未测 pill |
| AddSkillsModal 已添加技能显示 Added disabled | F-A-05 | P1 | 未覆盖 |
| Drawer 响应式宽度（480 / 1024 / 2048 viewport） | F-E-01 | P1 | 未覆盖（不同 viewport 下 Drawer 宽度差异显著，需验证 `Math.min(1024, Math.max(480, width * 0.5))` 公式） |
| sessionStorage/路由 state 的 openAssistantEditorIntent 触发自动打开编辑器 | 3.3 交互流程 | P1 | 未覆盖（低频辅助特性，替代路径已充分覆盖） |
| 移动端布局响应式验证（按钮/搜索纵向排列 + 按钮宽度 100%） | F-L-10 | P1 | 未覆盖 |
| AddSkillsModal 关闭时清空 `searchExternalQuery` | F-A-07 | P1 | 未覆盖 |
| 列表排序——section 标题文案 + 数量显示 (N) | F-L-05 | P1 | specs C-15 只验证 section 存在顺序，未断言"(N)"数字 |
| Summary Skills 计数 Tag 颜色（0=gray, >0=green） | F-E-09 | P1 | specs S-10 仅验证 drawer 文本 truthy，未断言计数/颜色 |

### P2（边界/辅助，可选）

| 补充用例 | 覆盖的需求 | 优先级 | 理由 |
|---|---|---|---|
| 高亮动画中途离开页面无 warning | B-14 | P2 | 未覆盖（验证 `useEffect` cleanup 正确清理 timer） |
| 搜索 + Tab 过滤同时生效空态 | B-15 | P2 | 未覆盖（用户可能误以为是 bug，需验证空态文案） |
| Pending/Custom 技能 hover 显示删除按钮 | F-SK-09 | P2 | 未覆盖（视觉细节，已有 P1 测试删除功能） |
| AddCustomPathModal OK 按钮 disabled 规则（Name/Path trim 后任一为空） | F-P-03 | P2 | 未覆盖 |
| AddCustomPathModal 选择目录按钮触发 dialog.showOpen（mock 返回路径） | F-P-02 | P2 | 未覆盖 |

**后续门 2**：Designer 从上表挑选用例细化为具体步骤/前置/预期/覆盖的需求 ID。

---

## 9. 需求争议点 / 待讨论事项（留给 Designer / Engineer）

1. **2.5.1 Extension Name 输入权限矛盾**（Designer & Engineer 一致认为是 bug）
   - **设计意图**（index.tsx 权限表）：Extension 的 Name/Desc 应为 read-only
   - **源码实际**（`AssistantEditDrawer.tsx:280`）：`disabled={activeAssistant?.isBuiltin}`，Extension 的 `isBuiltin=false` → Name input **not disabled**
   - **测试原则**：E2E 以源码实际行为为准，断言 Name **not disabled**
   - **修复建议（Designer UX 视角）**：
     - Extension 助手由外部扩展控制，用户修改 Name 后可能与扩展元数据不一致，导致混淆
     - **推荐修复**：改为 `disabled={activeAssistant?.isBuiltin || isExtensionAssistant(activeAssistant)}`
     - **如不修复**：UI 需增加 warning 提示"修改后可能与原扩展配置不一致"
   - **后续跟进**：门 2 实施前确认产品需求，避免测试用例与修复后行为冲突

2. **2.5.3 Extension 助手 showSkills 行为**
   - **源码实际**（`AssistantEditDrawer.tsx:131-134`）：`showSkills = isCreating || (hasBuiltinSkills) || (!activeAssistant.isBuiltin)` —— Extension 的 `isBuiltin=false` 会满足第三分支，因此 **Extension 会显示 Skills 区**
   - **权限约束**：由于 `isExtensionAssistant(activeAssistant)` 判断，Extension 的 Skills 区字段为只读（Add Skills 按钮等不可点）
   - **specs 实际**：S-09 测试 "extension assistant drawer opens without error" 通过，说明 Extension Drawer 可正常打开
   - **后续跟进**：如果 Extension 不应显示 Skills 区，需修改 `showSkills` 条件添加 `&& !isExtensionAssistant(activeAssistant)`；否则文档已明确其行为

3. **Save 按钮在 Edit 模式下是否自动关闭 Drawer**
   - **specs 注释**（crud.e2e.ts L249）：`Edit save does not auto-close the drawer`
   - **后续跟进**：Engineer 需在写测试前重新确认此行为，以当前实际为准
