# Team Lead Agent 模型列表一致性修复

## 需求

Team 模式下，Lead Agent 的 prompt 中包含每种 agent 的可用模型列表（`availableAgentTypes[].models`）。
这个列表必须和前端每个 agent 类型已有的模型选择下拉中的内容**完全一致**。

不涉及任何前端 UI 变更。仅修改 process 层数据获取逻辑。

## 基准：前端已有的模型下拉数据源

| Agent 类型                   | 前端组件              | 数据源                                                                                                                               |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ACP (claude, codex, qwen...) | `AcpModelSelector`    | `acp.cachedModels[backend].availableModels`                                                                                          |
| Gemini                       | `GeminiModelSelector` | `useModelProviderList()` → 所有 enabled provider（含 Google Auth 虚拟 provider）的 enabled model，过滤 `function_calling` capability |
| Aionrs                       | `AionrsModelSelector` | 同上 `useModelProviderList()` — 但排除 `gemini-with-google-auth` platform                                                            |
| nanobot/remote/openclaw      | 无                    | 不支持切模型，返回空                                                                                                                 |

### Gemini 扁平化规则

前端 Gemini 下拉是多级菜单（Auto Gemini 3 / Auto Gemini 2.5 / Manual → 子模型）。
Lead prompt 中需要扁平化为 model ID 列表：`auto`, `auto-gemini-2.5`, `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` + provider 模型。

Google Auth 模型来自 `getGeminiModeList()`（`src/renderer/hooks/agent/useModeModeList.ts`），仅在 Google Auth 已认证时包含。

### 过滤规则（对齐 `useModelProviderList.getAvailableModels`）

- `provider.enabled !== false`
- `provider.modelEnabled?.[modelName] !== false`
- `hasSpecificModelCapability(provider, modelName, 'function_calling')` 为 true 或 undefined
- `hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary')` 不为 true

## 当前问题

`getTeamAvailableModels()` 中：

- Gemini 分支硬编码了 `GEMINI_GOOGLE_AUTH_MODEL_IDS`，没有复用 `getGeminiModeList()`
- Aionrs 分支只过滤了 `modelEnabled`，没有过滤 capability
- 未知 backend 直接返回空，没有按实际 agent 类型分类

## 改动范围

| 文件                                  | 变更                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/common/utils/teamModelUtils.ts`  | 删除硬编码，复用 `getGeminiModeList()` 扁平化；Aionrs 加 capability 过滤；对齐 `useModelProviderList` 过滤逻辑 |
| `src/process/team/TeammateManager.ts` | 调整调用方式（如函数签名变更）                                                                                 |
| `tests/unit/teamModelUtils.test.ts`   | 更新测试                                                                                                       |

不动任何 renderer 组件。
