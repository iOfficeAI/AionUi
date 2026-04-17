# ACP Rewrite — TODO

## acp_session 表持久化暂停

**状态**: 已注释，等待 ACP Discovery 一起处理
**标记**: `TODO(ACP Discovery)`

### 问题 1: agent_id 语义错误

`typeBridge.ts` 的 `toAgentConfig()` 中 `agentId` 被设为 `old.id`（即 `conversation_id`），
导致 `acp_session` 表中 `conversation_id` 和 `agent_id` 的值完全相同。

```
AcpAgentManager.initAgent():
  agentConfig.id = data.conversation_id     // e.g. "conv-abc-123"

toAgentConfig():
  agentId = old.id                          // = conversation_id = "conv-abc-123"

upsertSession():
  conversation_id = this.conversationId     // "conv-abc-123"
  agent_id = this.agentConfig.agentId       // "conv-abc-123"  ← 同一个值
```

`agent_id` 应该标识 **哪个 agent 实现**，而非哪个 conversation：

| 场景                                    | 期望的 agent_id                                                      |
| --------------------------------------- | -------------------------------------------------------------------- |
| 内建 backend (claude, codex, gemini...) | backend 名称，如 `"claude"`                                          |
| 自定义 agent                            | `customAgentId`，如 `"ext:my-extension:adapter-1"` 或用户配置的 UUID |
| 无 customAgentId 的 fallback            | backend 名称                                                         |

**修复方向**: `agentId: old.extra?.customAgentId ?? old.backend`

**涉及文件**:

- `src/process/acp/compat/typeBridge.ts` — `toAgentConfig()` 中 `agentId` 赋值
- `src/process/acp/types.ts` — `AgentConfig.agentId` 字段定义

### 问题 2: acp_session 表目前无读取方

`IAcpSessionRepository` 定义了 `getSession()` / `getSuspendedSessions()` 等读取方法，
但在 `AcpAgentV2` 和 `AcpRuntime` 中 **从未被调用**。表只有写入、没有消费，属于死代码。

等 ACP Discovery 需求落地时，会有真正的消费方（如 session 恢复、idle reclaim 等），届时再恢复写入。

### 当前处理

所有 `acpSessionRepo` 的写入代码已注释（非删除），在以下位置标注了 `TODO(ACP Discovery)`:

- `src/process/acp/compat/AcpAgentV2.ts` — 字段声明、初始化、upsert、updateSessionId、updateStatus、deleteSession
- `src/process/acp/runtime/AcpRuntime.ts` — 构造函数参数、upsert、delete、touchLastActive、updateSessionId、updateSessionConfig、persistStatus
- `src/process/acp/compat/typeBridge.ts` — `agentId: old.id` 处标注了语义问题

### 恢复步骤

1. 在 ACP Discovery 需求中确定 `agentId` 的正确语义和来源
2. 修复 `toAgentConfig()` 中 `agentId` 的赋值逻辑
3. 取消注释所有 `TODO(ACP Discovery)` 标记的代码
4. 添加读取方的消费逻辑
5. 补充相关测试

---

## 清理 useAcpV2Enabled hook

**状态**: 待清理
**标记**: `TODO`
**文件**: `src/renderer/hooks/system/useAcpV2Enabled.ts:5`

AcpV2 feature flag 已移除，`useAcpV2Enabled()` 现在始终返回 `true`。
6 个 SendBox 组件仍在调用此 hook，涉及：

- `enabled` 参数传给 `useConversationCommandQueue`
- `allowSendWhileLoading` prop 传给 `SendBox`
- busy 时的发送守卫判断（`if (!isAcpV2Enabled && isBusy)`）

**清理方向**:

1. 删除 `useAcpV2Enabled` hook 文件
2. 在各 SendBox 中移除 `isAcpV2Enabled` 变量，将 `enabled: true` / `allowSendWhileLoading={true}` 内联
3. 移除 busy 守卫中对 `isAcpV2Enabled` 的判断（队列已始终开启，不再需要 fallback 到阻止发送）
4. 考虑进一步简化：如果 `enabled` 始终为 `true`，`useConversationCommandQueue` 的 `enabled` 参数可以去掉

---

## tool_call 增量更新合并策略

**状态**: 待处理（等 compat layer 移除后）
**标记**: `TODO(acp-rewrite)`
**文件**: `src/renderer/pages/conversation/Messages/hooks.ts:137`

目前 `acp_tool_call` 的增量更新（`tool_call_update`）由 `AcpAgentV2.mergeToolCall()` 在 process 层做 deep merge 后再发给 renderer，renderer 侧只做 shallow spread。

SDK 的 `tool_call_update` 是增量的（只包含变化的字段），shallow spread 会丢失初始 tool_call 中的 `title`/`kind`/`rawInput` 等字段。

**当 compat layer 移除后**，renderer 需要自行做 deep merge：

```ts
// hooks.ts — 替换当前的 shallow spread
const mergedUpdate = { ...existingMsg.content.update, ...message.content.update };
const merged = { ...existingMsg.content, ...message.content, update: mergedUpdate };
```
