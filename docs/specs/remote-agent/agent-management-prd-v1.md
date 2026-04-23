# Agent 管理改造 PRD（V1）

> 状态：Done
> 日期：2026-03-26
> 关联背景：远端 Agent 能力已接入，当前入口分散，用户心智割裂

## 1. 背景与问题

当前产品中与 Agent 相关的能力分布在多个入口：

- 助手管理（本地/预设助手）
- 远端 Agent 管理（连接、编辑、删除）
- Gemini 独立设置页
- 首页顶部 Agent 区域中的快捷入口

这导致用户在使用中出现三个问题：

1. 不清楚"助手"和"远端 Agent"是否属于同一能力域
2. 新增入口分散，用户难以形成稳定路径
3. Gemini CLI 既是 Agent，又有独立配置，定位不明确

## 2. 目标与非目标

### 2.1 目标（V1）

- 建立统一的 `Agent 管理` 心智
- 在设置中将 Agent 管理结构明确拆分为 `本地 Agents` 与 `远端 Agents`
- 将助手管理（Assistants）从 Agent 管理中独立出来，明确两层概念的边界
- 提供首页到远端 Agent 管理的快捷直达路径
- 先完成结构统一与入口统一，不在 V1 引入复杂默认配置能力

### 2.2 非目标（V1 不做）

- 不在 V1 实现某 Agent 的默认 LLM/Mode/MCP/Skills 配置逻辑
- 不在 V1 下线 Gemini 独立页
- 不在 V1 全量替换所有历史"assistant"命名及数据结构

## 3. 关键定义（术语）

- **Agents**：底层 Agent 管理入口（Base Agent）
- **Assistants**：基于 Base Agent 升级的人格化助手管理入口
- **本地 Agents**：本地可运行或本地接入的 Agent（含默认与外部）
- **远端 Agents**：通过远程连接接入的 Agent
- **默认 Agent**：产品默认提供（如 Gemini CLI）
- **外部 Agent**：用户后接入（本地外部或远端外部）

## 4. 信息架构（IA）

### 4.1 设置一级导航

新增两个独立入口，明确两层概念边界：

- `Agents`（`/settings/agent`）：底层 Base Agent 管理，包含本地/远端双 Tab
- `Assistants`（`/settings/assistants`）：基于 Agent 的人格化助手管理
- 保留 `Gemini CLI`（`/settings/gemini`）：平台级高级配置

### 4.2 Agents 页内二级结构

- Tab 1：`本地 Agents`（Local Agents）
- Tab 2：`远端 Agents`（Remote Agents）

### 4.3 首页快捷入口

- 首页顶部 Agent 区域旁新增（或重定义）一个统一 `+` 快捷入口
- 点击后直接跳转至：`/settings/agent?tab=remote`
- 注：此入口用于连接远端 Agent，不与底部助手选择器混淆

## 5. 产品策略：Gemini CLI 的定位

Gemini CLI 在用户心智中属于 Agent，但同时具备平台级配置需求。V1 采用"双入口、单心智"策略：

- 在 `本地 Agents` 中展示 Gemini CLI（纳入 Agent 体系）
- 保留 `Gemini CLI` 独立页面（承载平台级高级配置）
- Gemini CLI 卡片的 `settings` 按钮**可点击**，直接跳转至 Gemini CLI 独立高级配置页

## 6. 功能需求（V1）

### 6.1 Agents 页面改造

1. 将当前"助手 + 远端"折叠并列结构改为二级 Tab 结构
2. 支持 query 驱动默认 Tab：
   - `?tab=local`
   - `?tab=remote`
3. 默认进入 `local`，但可被首页快捷入口覆盖为 `remote`

### 6.2 远端 Agents（V1）

- 保持现有能力不回退：
  - 新增远端 Agent
  - 编辑远端 Agent
  - 删除远端 Agent
  - 状态显示（connected/pending/error 等）

### 6.3 本地 Agents（V1）

- 先完成列表与基础展示（含 Gemini CLI）
- Gemini CLI 显示 `settings` 按钮，**可点击**，跳转至 Gemini CLI 独立高级配置页
- 其他本地 Agent 显示 `settings` 按钮但**置灰不可点击**，hover 提示"配置能力即将开放"
- 无本地 Agent 时显示空状态

### 6.4 Assistants 页面

- 将原助手管理（AssistantManagement）独立为 `/settings/assistants` 路由
- 功能与原有能力保持不变

### 6.5 Gemini 页

- 保留独立入口与现有配置能力
- 文案统一为 `Gemini CLI`

## 7. 交互与文案要求

### 7.1 交互要求

- Tab 位置固定在 Agents 页顶部
- Gemini CLI 的 `settings` 按钮可点击，点击跳转高级配置页
- 其他本地 Agent 的 `settings` 按钮置灰可见，不可点击
- hover 置灰按钮出现"即将开放"说明
- 首页 `+` 跳转后，页面应稳定落在 `远端 Agents` Tab

### 7.2 文案建议（可 i18n 化）

- 一级导航（底层）：`Agents`
- 一级导航（上层）：`Assistants`
- 二级 Tab：`本地 Agents` / `远端 Agents`
- 禁用提示：`配置能力即将开放`

### 7.3 布局说明

- 顶部 Agent 区域：用于管理底层 Agent（连接状态、快捷操作）
- 底部助手选择器：用于切换基于 Agent 的人格化助手
- 两个区域功能独立，V1 不关联

## 8. 验收标准（Acceptance Criteria）

满足以下条件即可视为 V1 完成：

1. 设置中存在 `Agents` 页面，并包含本地/远端双 Tab
2. 设置中存在独立的 `Assistants` 页面，承接原助手管理能力
3. 远端 Agent 的现有 CRUD 与状态能力均可正常使用
4. 本地 Agent 列表可见，非 Gemini CLI 的 `settings` 按钮为禁用态且有 hover 提示
5. Gemini CLI 的 `settings` 按钮可点击，跳转至独立高级配置页
6. 首页顶部 `+` 可稳定跳转到 `Agents` 的 `远端 Agents` Tab

## 9. 分阶段路线图

### Phase 1（已完成）

- Agents IA 改造（双 Tab）
- Assistants 独立页面拆分
- 首页统一快捷入口跳转远端 Tab
- 本地 Agent 列表上线，Gemini CLI settings 可点击，其他 settings 置灰 + 提示
- 保持 Gemini 独立页

### Phase 2（后续）

- 开放本地 Agent 默认配置：
  - 默认 LLM
  - 默认 Mode
  - 默认 MCP
  - 默认 Skills

### Phase 3（后续）

- 进一步统一"assistant/agent"术语与交互细节
- 评估是否将 Gemini 高级配置模块化嵌入 Agent 管理

## 10. 风险与规避

### 风险 1：用户对"Gemini 在两处出现"产生困惑

- 规避：在本地 Agents 的 Gemini 项明确"高级配置"跳转语义

### 风险 2：入口切换造成老用户路径变化

- 规避：保留旧入口一段时间，并在界面中提供明确引导

### 风险 3：本地 Agent 设置按钮禁用引发预期落差

- 规避：通过 hover 提示说明"即将开放"及具体规划能力范围

## 11. 版本结论

V1 优先完成"结构统一 + 入口统一 + 心智统一"，暂不进入复杂配置能力实现。
通过引入 Agents（底层）和 Assistants（上层）两个明确概念，建立清晰的产品分层，
为后续 Agent 平台化演进奠定基础。
