# Skills / MCP 复用 POUNDING 模型配置指南

> 适用场景：未来新增 **skills、MCP tools、内置工具、外部脚本工具** 时，希望它们直接复用 POUNDING / `api.mxou.cn` 的模型 URL、API Key、模型名，而不是让用户再次手动配置。

---

## 目标

POUNDING 的技能与工具链路必须满足以下原则：

1. **终端用户零配置**
   - 用户登录后由 POUNDING 自动下发模型配置
   - skill / MCP / tool 不再单独要求用户填写 URL、Key、Model

2. **单一配置源**
   - URL、Key、模型名只在 AionUi / POUNDING 的模型配置中心维护一份
   - skill 不自己保存第二份

3. **运行时注入**
   - skill / MCP / tool 通过环境变量读取配置
   - 不直接读前端 localStorage，不直接解析 UI 表单

4. **按能力分组**
   - 文本模型、图片模型、语音模型使用不同的环境变量前缀
   - 避免所有 skill 抢同一份“默认模型”导致混乱

---

## 当前已实现的标准模板

图片生成工具已经实现了完整的“配置中心 -> 环境变量 -> 工具执行”链路，可作为未来所有 skill 的标准模板。

### 现有参考实现

- 配置存储：
  - `packages/desktop/src/common/config/storage.ts`
  - `tools.imageGenerationModel`

- 前端同步到 MCP env：
  - `packages/desktop/src/renderer/components/settings/SettingsModal/contents/ToolsModalContent.tsx`

- 启动时迁移 / 初始化 MCP env：
  - `packages/desktop/src/process/utils/initStorage.ts`

- MCP 工具读取 env：
  - `packages/desktop/src/process/resources/builtinMcp/imageGenServer.ts`

---

## 当前图片工具使用的环境变量

现有内置图片工具使用以下变量：

- `AIONUI_IMG_PLATFORM`
- `AIONUI_IMG_BASE_URL`
- `AIONUI_IMG_API_KEY`
- `AIONUI_IMG_MODEL`
- `AIONUI_IMG_PROXY`（可选）

这些变量已经是有效标准，**不要重命名**，新增图片类 tool / skill 时优先复用。

---

## 未来统一规范

未来所有需要模型能力的 skill / MCP / tool，统一按下面的命名约定接入。

### 1) 文本 / 推理模型

用于：

- 通用技能
- 文本生成
- 总结、改写、结构化输出
- agent 辅助工具

环境变量：

- `AIONUI_LLM_PLATFORM`
- `AIONUI_LLM_BASE_URL`
- `AIONUI_LLM_API_KEY`
- `AIONUI_LLM_MODEL`

### 2) 图片生成 / 图片编辑模型

用于：

- 生图
- 改图
- 图片变体
- 图片分析（如果该工具链路走图片模型）

环境变量：

- `AIONUI_IMG_PLATFORM`
- `AIONUI_IMG_BASE_URL`
- `AIONUI_IMG_API_KEY`
- `AIONUI_IMG_MODEL`
- `AIONUI_IMG_PROXY`（可选）

### 3) 语音转写 / 语音模型

用于：

- Speech-to-Text
- Audio transcription
- Voice input related tools

环境变量建议：

- `AIONUI_STT_PLATFORM`
- `AIONUI_STT_BASE_URL`
- `AIONUI_STT_API_KEY`
- `AIONUI_STT_MODEL`

> 注：语音当前已有 `tools.speechToText` 配置，但尚未形成和图片工具完全一致的 MCP env 规范时，新增 tool 时应优先补齐这一层。

---

## 强制接入规则

以后任何新 skill / MCP / tool，如果要使用 POUNDING 的模型能力，必须遵守以下规则：

### 必须做

1. **只从环境变量读取**
2. **允许宿主在运行时注入**
3. **用户侧保持零配置**
4. **URL / Key / Model 不写死在 skill 代码里**
5. **优先复用现有 provider 配置**

### 禁止做

1. 在 skill 源码里硬编码：
   - `https://api.mxou.cn`
   - 固定 API Key
   - 固定模型名
2. 新增“独立的 skill 配置页”要求用户再填一遍
3. skill 自己持久化第二份模型配置
4. skill 直接从前端组件状态读取 URL / Key
5. 不经宿主注入，擅自维护另一套 provider 体系

---

## 推荐架构

标准链路应为：

```text
POUNDING 登录 / 自动配置模型
  -> provider 配置写入 AionUi 配置中心
  -> 宿主在运行 skill / MCP / tool 时注入 env
  -> skill / tool 从 env 读取
  -> 直接调用 api.mxou.cn 对应模型
```

即：

```text
配置中心
  -> 运行时注入
  -> 技能消费
```

而不是：

```text
skill 自己保存配置
  -> 用户再次填写
  -> skill 单独调用
```

---

## 新 skill 的标准接入步骤

以下步骤可以直接交给 agent 执行。

### 场景 A：新增图片类 MCP / tool

直接复用现有图片工具规范：

1. 从统一配置中选出图片模型
2. 写入 / 同步以下 env：
   - `AIONUI_IMG_PLATFORM`
   - `AIONUI_IMG_BASE_URL`
   - `AIONUI_IMG_API_KEY`
   - `AIONUI_IMG_MODEL`
3. tool 启动时从 `process.env` 读取
4. 缺少变量时返回“未配置图片模型”的明确错误

### 场景 B：新增文本类 skill / MCP

新增统一文本模型 env 注入链路：

1. 从 provider 配置中解析当前可用文本模型
2. 注入：
   - `AIONUI_LLM_PLATFORM`
   - `AIONUI_LLM_BASE_URL`
   - `AIONUI_LLM_API_KEY`
   - `AIONUI_LLM_MODEL`
3. tool / skill 仅从 env 读取
4. 若变量不存在，则提示“宿主未注入文本模型配置”

### 场景 C：新增语音类 tool

按语音独立命名空间接入：

1. 从 `tools.speechToText` 或统一语音配置解析
2. 注入：
   - `AIONUI_STT_PLATFORM`
   - `AIONUI_STT_BASE_URL`
   - `AIONUI_STT_API_KEY`
   - `AIONUI_STT_MODEL`
3. 工具只读 env

---

## Skill / Tool 代码应该怎么写

### Node / Bun / Electron 子进程

```ts
const baseUrl = process.env.AIONUI_LLM_BASE_URL;
const apiKey = process.env.AIONUI_LLM_API_KEY;
const model = process.env.AIONUI_LLM_MODEL;

if (!baseUrl || !apiKey || !model) {
  throw new Error('POUNDING LLM config not injected');
}
```

### 图片工具

```ts
const baseUrl = process.env.AIONUI_IMG_BASE_URL;
const apiKey = process.env.AIONUI_IMG_API_KEY;
const model = process.env.AIONUI_IMG_MODEL;
```

### 语音工具

```ts
const baseUrl = process.env.AIONUI_STT_BASE_URL;
const apiKey = process.env.AIONUI_STT_API_KEY;
const model = process.env.AIONUI_STT_MODEL;
```

---

## Agent 执行指令模板

以后如果你要让 agent 接入新 skill，可以直接给它这段要求：

> 这个 skill / MCP / tool 必须复用 POUNDING 已配置的模型渠道，不允许用户二次配置。请按 `docs/guides/skills-model-env.md` 接入：  
> 1. 不要硬编码 URL / API Key / Model  
> 2. 从宿主注入的环境变量读取  
> 3. 文本模型使用 `AIONUI_LLM_*`  
> 4. 图片模型使用 `AIONUI_IMG_*`  
> 5. 语音模型使用 `AIONUI_STT_*`  
> 6. 如果是图片类工具，优先复用现有图片 MCP 的实现模式  
> 7. 最终用户在 POUNDING 内应保持免配置即可使用

---

## 对当前仓库的约束

### 已经稳定可用

- 图片工具 env 注入规范：**已实现**
- 图片工具读取 env 执行：**已实现**

### 未来建议补齐

- 文本 skill 的统一 `AIONUI_LLM_*` 注入
- 语音 tool 的统一 `AIONUI_STT_*` 注入
- 登录后自动下发的 provider 配置与 skill env 注入打通

---

## 一句话原则

**用户只在 POUNDING 里登录一次、配置一次；所有 skill / MCP / tool 自动复用，不再单独配置。**
