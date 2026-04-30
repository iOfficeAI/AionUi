# Aion CLI (aionrs) E2E 测试用例

**版本**: Gate 2 初稿  
**作者**: chat-aionrs-designer  
**日期**: 2026-04-22  
**状态**: 待审核

---

## 1. 用例结构说明

### 1.1 用例编号规则

- **P0（必测）**: TC-A-01 ~ TC-A-05（基线路径，最小可用功能）
- **P1（常规）**: TC-A-06 ~ TC-A-12（维度组合，常用场景）
- **P2（边界）**: TC-A-13 ~ TC-A-15（异常处理，边界验证）

### 1.2 全局前置条件

**所有 aionrs 测试用例的前置条件**:

1. **aionrs binary 可用**：通过 `ipcBridge.fs.findAionrsBinary.invoke()` 验证，否则 skip 全部测试
2. **用户配置的模型列表至少 1 个可用 provider**：
   - 调用 `ipcBridge.mode.getModelConfig.invoke()` 获取用户配置的 provider 列表
   - 过滤：排除 Google Auth provider（`platform` 包含 `gemini-with-google-auth`）
   - 验证：至少 1 个 provider 包含 apiKey 且有可用 model
   - 若无可用 provider：skip 全部 aionrs 测试，原因："No non-Google-Auth provider with apiKey configured"

3. **测试数据准备**：临时工作目录 `/tmp/e2e-aionrs-<timestamp>/`

**模型获取 helper**（engineer 实现）:

```typescript
// tests/e2e/helpers/chatAionrs.ts
export async function getAionrsTestModels(page: Page): Promise<{
  modelA: TProviderWithModel; // 第一个可用模型（默认模型）
  modelB: TProviderWithModel | null; // 第二个可用模型（若存在）
}>;
```

### 1.3 维度说明

| 维度       | 可选值                     | 说明                                                                                               |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| 关联文件夹 | 无 / 单 / 多               | `atPath` 数组（源码：`AionrsSendBox.tsx:331-337`）                                                 |
| 上传文件   | 无 / 单 / 多               | `uploadFile` 数组（源码：`useSendBoxFiles.ts`）                                                    |
| 模型       | 默认 / 自选                | 从用户配置的 provider 列表选择（源码：`ipcBridge.mode.getModelConfig.invoke()`，过滤 Google Auth） |
| 权限       | default / auto_edit / yolo | 源码：`agentModes.ts:65-69`                                                                        |
| 对话中操作 | 切换模型 / 切换权限 / 无   | 对话页 `AionrsModelSelector` / `AgentModeSelector`                                                 |

### 1.4 清理约定

**命名模式**: 所有测试对话命名为 `E2E-aionrs-<timestamp>-<scenario>`

**清理顺序**（每个用例 `afterEach` 执行）:

1. 停止 binary 进程：`ipcBridge.conversation.stopAgent.invoke(conversationId)`
2. 删除 DB 记录：`DELETE FROM conversations WHERE name LIKE 'E2E-aionrs-%'`（级联删除 messages）
3. 删除临时目录：`fs.rm('/tmp/e2e-aionrs-*', { recursive: true })`
4. 清理 sessionStorage：`sessionStorage.removeItem('aionrs_initial_message_*')` + `sessionStorage.removeItem('aionrs_initial_processed_*')`

### 1.5 截图要求

每个用例最少 3 张截图：

1. guid 页选择 agent 后（显示输入框 + 配置项）
2. 对话页首条消息发送后（显示用户消息 + AI 回复流式中）
3. 对话完成后（显示最终消息列表 + DB 断言通过）

---

## 2. P0 用例（基线路径）

### TC-A-01: 最小可用路径

**优先级**: P0  
**目标**: 验证无附件 + 默认模型 + default 权限的最小对话流程

**前置条件**:

- 同 §1.2 全局前置条件
- 调用 `getAionrsTestModels(page)` 获取 `modelA`（默认模型）

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | 默认（`modelA`） |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开应用，导航至 guid 页（`/#/guid`）
2. 选择 aionrs agent（点击 `[data-agent-backend="aionrs"]`）
3. 确认权限选择器显示 `default`（`AgentModeSelector` 默认值）
4. 输入测试消息："Hello, aionrs! Please list files in current directory."
5. 点击发送按钮
6. 等待跳转至对话页（URL 匹配 `/conversation/aionrs/*`）
7. 等待 AI 回复流式完成（轮询 DB `messages.status='finish'`，超时 60s）

**DB 断言点**:

```sql
-- 1. 验证 conversation 创建
SELECT id, name, type, model, status, json_extract(extra, '$.sessionMode') as mode
FROM conversations
WHERE name LIKE 'E2E-aionrs-%' AND id = ?;
-- 期望: type='aionrs', mode='default', status='finished'

-- 2. 验证用户消息
SELECT id, type, position, content, status
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望: type='text', position='right', json_extract(content, '$.content') 包含 "Hello, aionrs!"

-- 3. 验证 AI 回复
SELECT id, type, position, status, created_at
FROM messages
WHERE conversation_id = ? AND position = 'left' AND type = 'text';
-- 期望: 至少 1 条, status='finish', created_at > 用户消息 created_at

-- 4. 验证消息顺序
SELECT COUNT(*) FROM messages WHERE conversation_id = ?;
-- 期望: ≥ 2（用户 + AI）
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-minimal-path`
- temp dir: `/tmp/e2e-aionrs-<timestamp>-tc-a-01/`（workspace）
- sessionStorage: `aionrs_initial_message_${conversationId}`, `aionrs_initial_processed_${conversationId}`

**截图数**: 3

---

### TC-A-02: 关联单个文件夹

**优先级**: P0  
**目标**: 验证关联文件夹后，消息内容包含文件夹引用

**前置条件**:

- 同 §1.2 全局前置条件
- 临时工作目录存在测试文件夹：`/tmp/e2e-aionrs-<timestamp>/test-folder/`

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 单（`test-folder/`） |
| 上传文件 | 无 |
| 模型 | 默认 |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录 + 测试文件夹：
   ```bash
   mkdir -p /tmp/e2e-aionrs-<timestamp>/test-folder/
   echo "sample content" > /tmp/e2e-aionrs-<timestamp>/test-folder/sample.txt
   ```
2. 打开 guid 页，选择 aionrs agent
3. 从文件树选择 `test-folder/`（触发 `emitter.emit('aionrs.selected.file', [{ path, name, isFile: false }])`）
4. 确认 guid 页显示文件夹 Tag（`data-testid="folder-tag-0"`）
5. 输入消息："What files are in the attached folder?"
6. 点击发送
7. 等待对话页 AI 回复完成

**DB 断言点**:

```sql
-- 1. 验证用户消息包含文件夹引用
SELECT json_extract(content, '$.attachedDirs') as dirs
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望: dirs 是 JSON 数组, 包含 '{"path": ".../test-folder", "name": "test-folder", "isFile": false}'

-- 2. 验证消息内容
SELECT json_extract(content, '$.content') as text
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望: text 包含 "What files are in the attached folder?"

-- 3. 验证 AI 回复
SELECT status FROM messages WHERE conversation_id = ? AND position = 'left' AND type = 'text';
-- 期望: status='finish'
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-folder-single`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`（包含 test-folder）
- sessionStorage: 同 TC-A-01

**截图数**: 3

---

### TC-A-03: 上传单个文件

**优先级**: P0  
**目标**: 验证上传文件后，binary 接收 `files` 参数

**前置条件**:

- 同 §1.2 全局前置条件
- 测试文件存在：`/tmp/e2e-test-file.txt`（内容："Test file content for aionrs E2E"）

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 单（`e2e-test-file.txt`） |
| 模型 | 默认 |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建测试文件：
   ```bash
   echo "Test file content for aionrs E2E" > /tmp/e2e-test-file.txt
   ```
2. 打开 guid 页，选择 aionrs agent
3. 上传文件：
   - WebUI: 使用 `<input type="file">` 选择 `/tmp/e2e-test-file.txt`
   - Desktop: 调用 `ipcBridge.dialog.showOpen()` 选择文件
4. 确认文件预览卡片显示（`data-testid="file-card-0"`）
5. 输入消息："What is the content of the attached file?"
6. 点击发送
7. 等待对话页 AI 回复完成

**DB 断言点**:

```sql
-- 1. 验证用户消息包含文件引用
SELECT json_extract(content, '$.attachedFiles') as files
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望: files 是 JSON 数组, 包含 '/tmp/e2e-test-file.txt'

-- 2. 验证 AI 回复提到文件内容
SELECT json_extract(content, '$.content') as text
FROM messages
WHERE conversation_id = ? AND position = 'left' AND type = 'text';
-- 期望: text 包含 "Test file content" 或文件名 "e2e-test-file.txt"

-- 3. 验证消息完成
SELECT status FROM messages WHERE conversation_id = ? AND position = 'left';
-- 期望: status='finish'
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-file-single`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`（workspace）
- test file: `/tmp/e2e-test-file.txt`（测试后删除）
- sessionStorage: 同 TC-A-01

**截图数**: 3

---

### TC-A-04: 使用第二个模型

**优先级**: P0  
**目标**: 验证在 guid 页选择非默认模型后，DB 记录正确模型 ID

**前置条件**:

- 同 §1.2 全局前置条件
- 调用 `getAionrsTestModels(page)` 获取 `{ modelA, modelB }`
- 若 `modelB === null`：skip 此用例（原因："Only 1 model available, skipping guid page model selection test"）

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | 第二个（`modelB`） |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开 guid 页，选择 aionrs agent
2. 打开模型选择器（`GuidModelSelector`，仅当 `isGeminiMode=true` 可见，源码：`GuidPage.tsx:465-469`）
   - 若不可见，skip 此用例（标注原因："guid page model selector not enabled"）
3. 选择 `modelB`（不 hardcode 具体模型 ID）
4. 输入消息："What model are you using?"
5. 点击发送
6. 等待对话页 AI 回复完成

**DB 断言点**:

```sql
-- 1. 验证 conversation 模型字段
SELECT model, json_extract(extra, '$.model.useModel') as extra_model
FROM conversations
WHERE id = ?;
-- 期望: extra_model = modelB.useModel

-- 2. 验证对话完成
SELECT status FROM conversations WHERE id = ?;
-- 期望: status='finished'

-- 3. 验证 AI 回复
SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND position = 'left';
-- 期望: ≥ 1
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-model-second`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- sessionStorage: 同 TC-A-01

**截图数**: 3

**备注**: 若 guid 页模型选择器未启用（需确认 `isGeminiMode` 状态），此用例改为在对话页切换模型（见 TC-A-07）

---

### TC-A-05: 使用 yolo 权限

**优先级**: P0  
**目标**: 验证 yolo 模式下，工具调用自动批准（无确认弹窗）

**前置条件**:

- 同 §1.2 全局前置条件

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | 默认 |
| 权限 | yolo |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开 guid 页，选择 aionrs agent
2. 打开权限选择器（`AgentModeSelector`，`data-testid="agent-mode-selector-aionrs"`）
3. 选择 `yolo` 模式（label: "YOLO"）
4. 输入消息："Please create a file named test.txt with content 'E2E test'."
5. 点击发送
6. **验证无确认弹窗出现**（监听 `ConversationChatConfirm` 组件状态）
7. 等待工具执行完成（轮询 DB `messages.type='tool_group'` 且 `status='Success'`）

**DB 断言点**:

```sql
-- 1. 验证权限模式持久化
SELECT json_extract(extra, '$.sessionMode') as mode
FROM conversations
WHERE id = ?;
-- 期望: mode='yolo'

-- 2. 验证工具调用记录
SELECT type, json_extract(content, '$[0].status') as tool_status
FROM messages
WHERE conversation_id = ? AND type = 'tool_group';
-- 期望: 至少 1 条, tool_status IN ('Success', 'Executing', 'Error')
-- 注意: yolo 模式不应出现 'Confirming' 状态

-- 3. 验证无确认弹窗（前端逻辑验证）
-- E2E 层：page.waitForSelector('.confirmation-dialog', { timeout: 2000 }) 应超时（证明无弹窗）
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-yolo-mode`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`（包含 binary 创建的 test.txt）
- sessionStorage: 同 TC-A-01

**截图数**: 3

---

## 3. P1 用例（常规组合）

### TC-A-06: 使用 auto_edit 权限

**优先级**: P1  
**目标**: 验证 auto_edit 模式下，edit/info 工具自动批准，exec 工具仍需确认

**前置条件**:

- 同 §1.2 全局前置条件

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | 默认 |
| 权限 | auto_edit |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开 guid 页，选择 aionrs agent
2. 选择 `auto_edit` 模式（label: "Auto-Accept Edits"）
3. 输入消息："Please read the file ./README.md and summarize it."（触发 info 工具）
4. 等待工具执行完成（无确认弹窗）
5. 输入第二条消息："Now run command 'ls -la'."（触发 exec 工具）
6. **验证出现确认弹窗**（`ConversationChatConfirm` 显示）
7. 点击 "Yes, Allow Once" 批准
8. 等待命令执行完成

**DB 断言点**:

```sql
-- 1. 验证权限模式
SELECT json_extract(extra, '$.sessionMode') as mode
FROM conversations
WHERE id = ?;
-- 期望: mode='auto_edit'

-- 2. 验证工具调用记录（info 工具无 Confirming 状态）
SELECT json_extract(content, '$[0].name') as tool_name,
       json_extract(content, '$[0].status') as tool_status
FROM messages
WHERE conversation_id = ? AND type = 'tool_group';
-- 期望:
--   - info 类工具: status 直接从 Executing → Success（跳过 Confirming）
--   - exec 类工具: status 经历 Confirming → Executing → Success（需用户确认）
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-auto-edit-mode`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- sessionStorage: 同 TC-A-01

**截图数**: 4（增加 1 张确认弹窗截图）

---

### TC-A-07: 对话中切换模型

**优先级**: P1  
**目标**: 验证对话中切换模型后，DB `conversations.extra.model` 更新为新模型 ID

**前置条件**:

- 同 §1.2 全局前置条件
- 调用 `getAionrsTestModels(page)` 获取 `{ modelA, modelB }`
- 若 `modelB === null`：skip 此用例（原因："Only 1 model available, skipping model switch test"）

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | 默认（`modelA`）→ 第二个（`modelB`） |
| 权限 | default |
| 对话中操作 | 切换模型 |

**操作步骤**:

1. 按 TC-A-01 创建对话（使用 `modelA`）
2. 等待首条 AI 回复完成
3. 点击对话页模型选择器（`AionrsModelSelector`，`data-testid="aionrs-model-selector"`）
4. 选择 `modelB`（不 hardcode 具体模型 ID）
5. 等待模型切换完成（轮询 DB `conversations.extra.model` 更新）
6. 输入第二条消息："What model are you using now?"
7. 等待 AI 回复完成

**DB 断言点**:

```sql
-- 1. 验证模型切换后 DB 更新
SELECT json_extract(extra, '$.model.useModel') as current_model
FROM conversations
WHERE id = ?;
-- 期望: current_model = modelB.useModel

-- 2. 验证消息数量
SELECT COUNT(*) FROM messages WHERE conversation_id = ?;
-- 期望: ≥ 4（用户消息1 + AI回复1 + 用户消息2 + AI回复2）

-- 3. 验证第二条 AI 回复使用新模型（需从 AI 回复内容推断，或检查 request_trace 事件）
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-switch-model`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- sessionStorage: 同 TC-A-01

**截图数**: 4（增加 1 张模型选择器打开状态截图）

**备注**: 根据议题 1 决策，只验证 DB 字段更新，不验证 binary 内部 sessionId 变化

---

### TC-A-08: 对话中切换权限（default → auto_edit）

**优先级**: P1  
**目标**: 验证对话中切换权限后，工具确认行为立即变化

**前置条件**:

- 同 §1.2 全局前置条件

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | 默认 |
| 权限 | default → auto_edit |
| 对话中操作 | 切换权限 |

**操作步骤**:

1. 按 TC-A-01 创建对话（default 权限）
2. 输入消息："Please edit file test.txt and add line 'line 1'."
3. **验证出现确认弹窗**（default 模式需确认 edit 工具）
4. 取消操作（点击 "No"）
5. 打开权限选择器，切换为 `auto_edit`
6. 重新输入相同消息
7. **验证无确认弹窗**（auto_edit 模式自动批准 edit 工具）
8. 等待工具执行完成

**DB 断言点**:

```sql
-- 1. 验证权限切换后 DB 更新
SELECT json_extract(extra, '$.sessionMode') as mode
FROM conversations
WHERE id = ?;
-- 期望: mode='auto_edit'

-- 2. 验证第二次工具调用无 Confirming 状态
SELECT json_extract(content, '$[0].status') as tool_status, created_at
FROM messages
WHERE conversation_id = ? AND type = 'tool_group'
ORDER BY created_at DESC
LIMIT 1;
-- 期望: tool_status = 'Executing' 或 'Success'（跳过 Confirming）

-- 3. 验证第一次工具调用被取消
SELECT json_extract(content, '$[0].status') as tool_status, created_at
FROM messages
WHERE conversation_id = ? AND type = 'tool_group'
ORDER BY created_at ASC
LIMIT 1;
-- 期望: tool_status = 'Canceled'
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-switch-permission-1`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- sessionStorage: 同 TC-A-01

**截图数**: 5（2 张确认弹窗：第一次出现 + 第二次未出现）

---

### TC-A-09: 对话中切换权限（auto_edit → yolo）

**优先级**: P1  
**目标**: 验证切换到 yolo 后，所有工具自动批准

**前置条件**:

- 同 §1.2 全局前置条件

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | 默认 |
| 权限 | auto_edit → yolo |
| 对话中操作 | 切换权限 |

**操作步骤**:

1. 创建对话（auto_edit 权限）
2. 输入消息："Please run command 'pwd'."（触发 exec 工具）
3. **验证出现确认弹窗**（auto_edit 模式不自动批准 exec）
4. 取消操作
5. 切换权限为 `yolo`
6. 重新输入相同消息
7. **验证无确认弹窗**（yolo 模式自动批准所有工具）
8. 等待命令执行完成

**DB 断言点**:

```sql
-- 1. 验证权限切换
SELECT json_extract(extra, '$.sessionMode') as mode
FROM conversations
WHERE id = ?;
-- 期望: mode='yolo'

-- 2. 验证第二次工具调用无 Confirming 状态
SELECT json_extract(content, '$[0].status') as tool_status
FROM messages
WHERE conversation_id = ? AND type = 'tool_group'
ORDER BY created_at DESC
LIMIT 1;
-- 期望: tool_status IN ('Executing', 'Success')
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-switch-permission-2`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- sessionStorage: 同 TC-A-01

**截图数**: 4

---

### TC-A-10: 组合场景（关联文件夹 + 上传文件 + 非默认模型）

**优先级**: P1  
**目标**: 验证多维度组合情况下，所有附件正确传递给 binary

**前置条件**:

- 同 §1.2 全局前置条件
- 临时目录存在测试文件夹 + 测试文件

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 单 |
| 上传文件 | 单 |
| 模型 | 第二个 |
| 权限 | auto_edit |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建测试数据：
   ```bash
   mkdir -p /tmp/e2e-aionrs-<timestamp>/folder-a/
   echo "content A" > /tmp/e2e-aionrs-<timestamp>/folder-a/file-a.txt
   echo "content B" > /tmp/e2e-test-file-b.txt
   ```
2. 打开 guid 页，选择 aionrs agent
3. 选择第二个模型 + auto_edit 权限
4. 关联文件夹 `folder-a/`
5. 上传文件 `e2e-test-file-b.txt`
6. 输入消息："Compare the content of the attached folder and file."
7. 点击发送
8. 等待 AI 回复完成

**DB 断言点**:

```sql
-- 1. 验证用户消息包含文件夹 + 文件引用
SELECT json_extract(content, '$.attachedDirs') as dirs,
       json_extract(content, '$.attachedFiles') as files
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望:
--   dirs 包含 'folder-a'
--   files 包含 'e2e-test-file-b.txt'

-- 2. 验证模型 + 权限
SELECT json_extract(extra, '$.model.useModel') as model,
       json_extract(extra, '$.sessionMode') as mode
FROM conversations
WHERE id = ?;
-- 期望: model = 第二个模型 ID, mode='auto_edit'

-- 3. 验证 AI 回复提到两个文件
SELECT json_extract(content, '$.content') as text
FROM messages
WHERE conversation_id = ? AND position = 'left' AND type = 'text';
-- 期望: text 包含 "content A" 或 "content B" 或文件名
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-combo-folder-file-model`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- test file: `/tmp/e2e-test-file-b.txt`
- sessionStorage: 同 TC-A-01

**截图数**: 4

---

### TC-A-11: 上传多个文件

**优先级**: P1  
**目标**: 验证多文件上传场景

**前置条件**:

- 同 §1.2 全局前置条件
- 测试文件存在：`/tmp/e2e-file-1.txt`, `/tmp/e2e-file-2.txt`, `/tmp/e2e-file-3.txt`

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 多（3 个文件） |
| 模型 | 默认 |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建测试文件：
   ```bash
   echo "File 1 content" > /tmp/e2e-file-1.txt
   echo "File 2 content" > /tmp/e2e-file-2.txt
   echo "File 3 content" > /tmp/e2e-file-3.txt
   ```
2. 打开 guid 页，选择 aionrs agent
3. 批量上传 3 个文件（WebUI: 选择多个文件；Desktop: 多次调用 dialog）
4. 确认显示 3 个文件预览卡片
5. 输入消息："Count the total lines across all attached files."
6. 点击发送
7. 等待 AI 回复完成

**DB 断言点**:

```sql
-- 1. 验证用户消息包含 3 个文件引用
SELECT json_extract(content, '$.attachedFiles') as files
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望: files 数组长度 = 3, 包含所有文件路径

-- 2. 验证 AI 回复计算正确
SELECT json_extract(content, '$.content') as text
FROM messages
WHERE conversation_id = ? AND position = 'left' AND type = 'text';
-- 期望: text 包含 "3" 或 "three"（行数）
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-multi-files`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- test files: `/tmp/e2e-file-*.txt`
- sessionStorage: 同 TC-A-01

**截图数**: 3

---

### TC-A-12: 关联多个文件夹

**优先级**: P1  
**目标**: 验证多文件夹关联场景

**前置条件**:

- 同 §1.2 全局前置条件
- 临时目录存在多个测试文件夹

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 多（2 个文件夹） |
| 上传文件 | 无 |
| 模型 | 默认 |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建测试数据：
   ```bash
   mkdir -p /tmp/e2e-aionrs-<timestamp>/folder-x/ /tmp/e2e-aionrs-<timestamp>/folder-y/
   echo "X content" > /tmp/e2e-aionrs-<timestamp>/folder-x/x.txt
   echo "Y content" > /tmp/e2e-aionrs-<timestamp>/folder-y/y.txt
   ```
2. 打开 guid 页，选择 aionrs agent
3. 从文件树依次选择 `folder-x/` 和 `folder-y/`
4. 确认显示 2 个文件夹 Tag
5. 输入消息："List all files in both attached folders."
6. 点击发送
7. 等待 AI 回复完成

**DB 断言点**:

```sql
-- 1. 验证用户消息包含 2 个文件夹引用
SELECT json_extract(content, '$.attachedDirs') as dirs
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望: dirs 数组长度 = 2, 包含 'folder-x' 和 'folder-y'

-- 2. 验证 AI 回复列出两个文件夹的文件
SELECT json_extract(content, '$.content') as text
FROM messages
WHERE conversation_id = ? AND position = 'left' AND type = 'text';
-- 期望: text 包含 "x.txt" 和 "y.txt"
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-multi-folders`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`（包含 folder-x, folder-y）
- sessionStorage: 同 TC-A-01

**截图数**: 3

---

## 4. P2 用例（边界验证）

### TC-A-13: Binary 不可达时跳过测试

**优先级**: P2  
**目标**: 验证 E2E 测试前 binary 检查机制生效

**前置条件**:

- aionrs binary **不可用**（通过环境变量 `AION_CLI_PATH=/dev/null` 模拟）

**维度组合**: N/A（验证前置检查逻辑）

**操作步骤**:

1. 设置环境变量：`process.env.AION_CLI_PATH = '/dev/null'`
2. 运行测试套件（或单个用例）
3. 验证测试被 skip（状态：skipped，原因："aionrs binary not found"）

**DB 断言点**: N/A（测试未执行，不产生 DB 记录）

**预期行为**:

- 测试框架输出包含 `test.skip()` 标记
- 控制台输出 skip 原因："aionrs binary not found, skipping E2E tests"
- CI 报告显示测试为 skipped（非 failed）

**清理义务**: N/A（无 DB 记录产生）

**截图数**: 1（测试报告截图，显示 skip 状态）

**实现参考**:

```typescript
// tests/e2e/setup/aionrs.setup.ts
export async function checkAionrsBinary(): Promise<boolean> {
  try {
    const binary = await ipcBridge.fs.findAionrsBinary.invoke();
    return binary !== null;
  } catch {
    return false;
  }
}

// tests/e2e/specs/chat-aionrs/*.spec.ts
test.beforeAll(async () => {
  const hasBinary = await checkAionrsBinary();
  if (!hasBinary) {
    test.skip('aionrs binary not found, skipping E2E tests');
  }
});
```

---

### TC-A-14: 超大文件上传限制

**优先级**: P2  
**目标**: 验证前端文件大小限制机制

**前置条件**:

- 同 §1.2 全局前置条件
- 测试文件存在：`/tmp/e2e-large-file.bin`（100MB）

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 超大（100MB） |
| 模型 | 默认 |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建超大测试文件：
   ```bash
   dd if=/dev/zero of=/tmp/e2e-large-file.bin bs=1M count=100
   ```
2. 打开 guid 页，选择 aionrs agent
3. 尝试上传 `/tmp/e2e-large-file.bin`
4. **验证出现错误提示**（预期：前端拦截，显示 "文件过大" 提示）
5. 确认文件未被添加到 `uploadFile` 数组

**DB 断言点**: N/A（消息未发送，不产生 DB 记录）

**预期行为**:

- 前端显示错误提示（Toast / Message 组件）
- 文件预览卡片不显示
- 发送按钮可用（但消息体不包含该文件）

**清理义务**:

- test file: `/tmp/e2e-large-file.bin`

**截图数**: 2（上传尝试 + 错误提示）

**备注**: 若前端未实现大小限制（需确认 `FileService.processDroppedFiles()` 逻辑），此用例改为验证 binary 层错误处理

---

### TC-A-15: 关联不存在的文件夹

**优先级**: P2  
**目标**: 验证文件系统异常处理

**前置条件**:

- 同 §1.2 全局前置条件

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 不存在（`/tmp/e2e-nonexistent-folder/`） |
| 上传文件 | 无 |
| 模型 | 默认 |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开 guid 页，选择 aionrs agent
2. 手动触发文件夹选择事件（模拟选择不存在的路径）：
   ```typescript
   emitter.emit('aionrs.selected.file', [
     { path: '/tmp/e2e-nonexistent-folder/', name: 'e2e-nonexistent-folder', isFile: false },
   ]);
   ```
3. 确认文件夹 Tag 显示（或显示错误提示）
4. 输入消息："List files in the attached folder."
5. 点击发送
6. 等待 binary 处理（预期返回错误或空结果）

**DB 断言点**:

```sql
-- 1. 验证用户消息记录文件夹引用（即使路径不存在）
SELECT json_extract(content, '$.attachedDirs') as dirs
FROM messages
WHERE conversation_id = ? AND position = 'right';
-- 期望: dirs 包含 '/tmp/e2e-nonexistent-folder/'

-- 2. 验证 AI 回复提示错误
SELECT json_extract(content, '$.content') as text
FROM messages
WHERE conversation_id = ? AND position = 'left' AND type = 'text';
-- 期望: text 包含 "not found" 或 "does not exist" 或类似错误提示

-- 3. 验证对话状态
SELECT status FROM conversations WHERE id = ?;
-- 期望: status='finished'（非 'error'，因为是用户输入错误而非系统错误）
```

**清理义务**:

- conversations name: `E2E-aionrs-<timestamp>-nonexistent-folder`
- temp dir: `/tmp/e2e-aionrs-<timestamp>/`
- sessionStorage: 同 TC-A-01

**截图数**: 3

---

## 5. 未覆盖场景（记录备查）

根据议题 3 决策，以下场景本轮 E2E **不覆盖**：

1. **工具确认中途切换权限**：
   - 场景：弹窗确认中 → 切换权限为 yolo → 验证弹窗行为（是否自动消失/取消/重新评估）
   - 原因：当前代码未显式定义该边界行为，E2E 不应固化不确定行为

2. **流式输出中途切换模型**：
   - 场景：AI 回复流式中 → 切换模型 → 验证当前 turn 是否中断/继续/使用新模型
   - 原因：同上

3. **跨对话/跨进程权限持久化**：
   - 场景：对话 A 设置 "always allow" → 关闭应用 → 重启后创建对话 B → 验证权限是否记住
   - 原因：根据议题 2 决策，本轮只测同一对话内切换生效

4. **并发对话场景**（暂缓至后续 Gate）：
   - 场景：同时打开 2 个 aionrs 对话，轮流发送消息 → 验证 binary 进程隔离
   - 原因：需更复杂的测试编排（Playwright 多标签页 + 进程监控），本轮聚焦单对话流程

---

## 6. 测试数据矩阵（用例汇总）

| 用例 ID | 关联文件夹 | 上传文件  | 模型        | 权限              | 对话中操作 | 优先级 | 截图数 |
| ------- | ---------- | --------- | ----------- | ----------------- | ---------- | ------ | ------ |
| TC-A-01 | 无         | 无        | 默认        | default           | 无         | P0     | 3      |
| TC-A-02 | 单         | 无        | 默认        | default           | 无         | P0     | 3      |
| TC-A-03 | 无         | 单        | 默认        | default           | 无         | P0     | 3      |
| TC-A-04 | 无         | 无        | 第二个      | default           | 无         | P0     | 3      |
| TC-A-05 | 无         | 无        | 默认        | yolo              | 无         | P0     | 3      |
| TC-A-06 | 无         | 无        | 默认        | auto_edit         | 无         | P1     | 4      |
| TC-A-07 | 无         | 无        | 默认→第二个 | default           | 切换模型   | P1     | 4      |
| TC-A-08 | 无         | 无        | 默认        | default→auto_edit | 切换权限   | P1     | 5      |
| TC-A-09 | 无         | 无        | 默认        | auto_edit→yolo    | 切换权限   | P1     | 4      |
| TC-A-10 | 单         | 单        | 第二个      | auto_edit         | 无         | P1     | 4      |
| TC-A-11 | 无         | 多（3个） | 默认        | default           | 无         | P1     | 3      |
| TC-A-12 | 多（2个）  | 无        | 默认        | default           | 无         | P1     | 3      |
| TC-A-13 | N/A        | N/A       | N/A         | N/A               | N/A        | P2     | 1      |
| TC-A-14 | 无         | 超大      | 默认        | default           | 无         | P2     | 2      |
| TC-A-15 | 不存在     | 无        | 默认        | default           | 无         | P2     | 3      |

**统计**:

- P0: 5 个用例（基线路径）
- P1: 7 个用例（常规组合 + 对话中操作）
- P2: 3 个用例（边界验证）
- 总计: 15 个用例
- 总截图数: 50 张

---

## 7. 实现优先级建议

### Phase 1: P0 用例（必须通过）

1. TC-A-01（最小路径）— 优先实现，验证端到端基础流程
2. TC-A-02、TC-A-03（附件）— 验证文件/文件夹传递
3. TC-A-04（模型）— 验证模型选择
4. TC-A-05（yolo）— 验证权限档位

### Phase 2: P1 用例（常规覆盖）

1. TC-A-06（auto_edit）— 完整权限档位覆盖
2. TC-A-07、TC-A-08、TC-A-09（对话中切换）— 验证动态行为
3. TC-A-10、TC-A-11、TC-A-12（组合场景）— 验证维度交叉

### Phase 3: P2 用例（边界收尾）

1. TC-A-13（binary 检查）— CI 跳过机制
2. TC-A-14、TC-A-15（异常处理）— 健壮性验证

---

## 8. 下一步（Gate 2 → Gate 3）

1. **chat-aionrs-engineer** review 本用例设计，评估实现工作量
2. **team-lead** 批准后进入 Gate 3（实现）
3. engineer 实现完成后，designer 产出 `implementation-mapping.zh.md`（TC ID → 文件:行号:函数名 映射）

---

## 附录 A: 关键源码参考

| 文件                                                                          | 关键行号 | 说明                                              |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| `src/renderer/pages/guid/GuidPage.tsx`                                        | 465-469  | guid 页模型选择器可见性（`isGeminiMode`）         |
| `src/renderer/pages/guid/components/AgentPillBar.tsx`                         | 58-122   | agent pill 点击事件                               |
| `src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx`          | 331-337  | `atPath` 状态（关联文件夹数组）                   |
| `src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx`          | 103-125  | 文件上传 handler                                  |
| `src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx`          | 206-212  | 发送消息（传递 `files` 参数）                     |
| `src/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection.ts` | 36-40    | 过滤 Google Auth 模型                             |
| `src/renderer/utils/model/agentModes.ts`                                      | 65-69    | aionrs 权限枚举（`default`, `auto_edit`, `yolo`） |
| `src/process/task/AionrsManager.ts`                                           | 250-259  | 权限模式自动批准逻辑                              |
| `src/process/task/AionrsManager.ts`                                           | 727-737  | `setMode()` 持久化                                |
| `src/process/task/AionrsManager.ts`                                           | 452-489  | missing finish fallback（15s 超时）               |
| `aionui-backend aionui.db`                                                    | —        | conversations + messages 由 backend 独占持久化    |

---

## 附录 B: DB 断言查询模板

```sql
-- 查询对话基本信息
SELECT
  id,
  name,
  type,
  model,
  status,
  json_extract(extra, '$.sessionMode') as mode,
  json_extract(extra, '$.model.useModel') as extra_model,
  json_extract(extra, '$.lastTokenUsage.totalTokens') as tokens
FROM conversations
WHERE name LIKE 'E2E-aionrs-%';

-- 查询消息列表
SELECT
  id,
  msg_id,
  type,
  position,
  status,
  json_extract(content, '$.content') as text,
  json_extract(content, '$.attachedFiles') as files,
  json_extract(content, '$.attachedDirs') as dirs,
  created_at
FROM messages
WHERE conversation_id = ?
ORDER BY created_at ASC;

-- 查询工具调用
SELECT
  json_extract(content, '$[0].name') as tool_name,
  json_extract(content, '$[0].status') as tool_status,
  json_extract(content, '$[0].callId') as call_id,
  created_at
FROM messages
WHERE conversation_id = ? AND type = 'tool_group'
ORDER BY created_at ASC;

-- 查询思考消息
SELECT
  json_extract(content, '$.content') as thinking_text,
  json_extract(content, '$.duration') as duration_ms,
  json_extract(content, '$.status') as thinking_status
FROM messages
WHERE conversation_id = ? AND type = 'thinking';

-- 清理所有 E2E 数据
DELETE FROM conversations WHERE name LIKE 'E2E-aionrs-%';
```

---

**文档完成，等待 engineer review。**
