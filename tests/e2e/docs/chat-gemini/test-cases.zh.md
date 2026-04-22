# Gemini 对话全流程 E2E 测试用例

**版本**: Gate 2 初稿  
**作者**: chat-gemini-designer  
**日期**: 2026-04-22  
**状态**: 待审核

---

## 1. 用例结构说明

### 1.1 用例编号规则

- **P0（必测）**: TC-G-01 ~ TC-G-05（基线路径，最小可用功能）
- **P1（常规）**: TC-G-06 ~ TC-G-12（维度组合，常用场景）
- **P2（边界）**: TC-G-13 ~ TC-G-15（异常处理，边界验证）

### 1.2 维度说明

| 维度       | 可选值                    | 说明                                                     |
| ---------- | ------------------------- | -------------------------------------------------------- |
| 关联文件夹 | 无 / 单                   | `extra.workspace` 路径（源码：`useGuidSend.ts:181`）     |
| 上传文件   | 无 / 单 / 多              | `files` 数组（源码：`GeminiSendBox.tsx:282-288`）        |
| 模型       | auto / gemini-2.5-pro     | 顶级模式 + Manual 子模式（源码：`geminiModes.ts:36-66`） |
| 权限       | default / autoEdit / yolo | 源码：`agentModes.ts:61-63`                              |
| 对话中操作 | 切换模型 / 切换权限 / 无  | 对话页 `GeminiModelSelector` / `AgentModeSelector`       |

**权限字符串格式**（Gemini 特有）:

- 存储格式：`autoEdit`（驼峰），不同于 aionrs 的 `auto_edit`（下划线）
- 验证字段：`conversations.extra.sessionMode`（非 `extra.mode`）

### 1.3 清理约定

**命名模式**: 所有测试对话命名为 `E2E-gemini-<timestamp>-<scenario>`

**清理顺序**（每个用例 `afterEach` 执行）:

1. 停止 Gemini API 请求：`ipcBridge.conversation.stop.invoke({ conversation_id })`
2. 删除 DB 记录：调用 `cleanupE2EGeminiConversations(page)` helper
   ```typescript
   const convs = await invokeBridge(page, 'conversation.list', ...);
   for (const c of convs.filter(x => x.name.startsWith('E2E-gemini-'))) {
     await invokeBridge(page, 'conversation.remove', { id: c.id });
   }
   ```
3. 删除临时目录：`fs.rm('/tmp/e2e-chat-gemini-*', { recursive: true, force: true })`
4. 清理 sessionStorage：`sessionStorage.removeItem('gemini_initial_message_*')`

### 1.4 截图要求

每个用例最少 3 张截图：

1. guid 页选择 Gemini agent 后（显示输入框 + 模型/权限配置）
2. 对话页首条消息发送后（显示用户消息 + AI 回复流式中，thought display 可见）
3. 对话完成后（显示最终消息列表 + DB 断言通过）

### 1.5 前置条件检测

**OAuth 检测**（每个用例 `beforeEach` 执行）:

```typescript
const hasAuth = await checkGeminiAuth(page);
if (!hasAuth) {
  test.skip(true, 'Skipped: Gemini OAuth or API key not configured');
}
```

**实现位置**：`tests/e2e/helpers/gemini.ts` 中的 `checkGeminiAuth()` helper（engineer 实现）

**检测逻辑**：

- 检查 `~/.gemini/oauth_creds.json` 存在，或
- 检查模型列表 `providers.length > 0`（API key 配置）

---

## 2. P0 用例（基线路径）

### TC-G-01: 最小可用路径

**优先级**: P0  
**目标**: 验证无附件 + auto 模型 + default 权限的最小对话流程

**前置条件**:

- Gemini OAuth 或 API key 已配置（通过 `checkGeminiAuth(page)` 验证，否则 skip）
- 用户已登录
- 模型列表至少有 1 个可用模型

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | auto |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开应用，导航至 guid 页（`/#/guid`）
2. 选择 Gemini agent（点击 `[data-agent-backend="gemini"]`）
3. 确认模型选择器显示 `auto`（`GuidModelSelector` 默认值）
4. 确认权限选择器显示 `default`（`AgentModeSelector` 默认值）
5. 输入测试消息："Hello, Gemini! Please respond with 'E2E test success'."
6. 点击发送按钮（`data-testid="guid-send-btn"`）
7. 等待跳转至对话页（URL 匹配 `/conversation/*`）
8. 等待 AI 回复流式完成（轮询 DB `messages.status='finish'`，超时 90s）

**DB 断言点**:

```typescript
// 1. 验证 conversation 创建
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv).toBeDefined();
expect(conv.type).toBe('gemini');
expect(conv.model).toBe('auto'); // 当前模型
expect(conv.extra.sessionMode).toBe('default'); // 权限（驼峰）
expect(conv.extra.workspace).toBeUndefined(); // 未关联文件夹
expect(conv.status).toBe('finished');

// 2. 验证用户消息
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
const userMsg = messages.find((m) => m.position === 'right');
expect(userMsg).toBeDefined();
expect(userMsg.type).toBe('text');
expect(userMsg.status).toBe('finish');
const userContent = JSON.parse(userMsg.content);
expect(userContent.content).toContain('Hello, Gemini!');

// 3. 验证 AI 回复
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
expect(aiMsg.created_at).toBeGreaterThan(userMsg.created_at);
const aiContent = JSON.parse(aiMsg.content);
expect(aiContent.content).not.toBe(''); // 回复非空（不验证具体内容）

// 4. 验证消息顺序
expect(messages.length).toBeGreaterThanOrEqual(2); // 至少用户 + AI
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-minimal-path`
- temp dir: 无（未关联文件夹）
- sessionStorage: `gemini_initial_message_<conversationId>`

**截图数**: 3

---

### TC-G-02: 关联单个文件夹

**优先级**: P0  
**目标**: 验证关联单个临时目录后，DB `extra.workspace` 正确持久化

**前置条件**:

- 同 TC-G-01
- Desktop 环境（文件夹选择器仅 Desktop 可用，Web 环境 skip）

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 单 |
| 上传文件 | 无 |
| 模型 | auto |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录：`/tmp/e2e-chat-gemini-<timestamp>/`
2. 打开 guid 页，选择 Gemini agent
3. 点击"指定工作区"按钮（`data-testid="workspace-selector-btn"`）
4. 选择临时目录（`ipcBridge.dialog.showOpen` → properties: `['openDirectory']`）
5. 确认 guid 页显示文件夹路径（`<FolderOpen>` 图标 + 路径文本）
6. 输入消息："List files in the workspace."
7. 点击发送
8. 等待跳转至对话页
9. 等待 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证文件夹关联持久化
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.workspace).toBeDefined();
expect(conv.extra.workspace).toMatch(/^\/tmp\/e2e-chat-gemini-/);

// 2. 验证用户消息包含文件夹上下文（buildDisplayMessage 嵌入）
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
const userMsg = messages.find((m) => m.position === 'right');
const userContent = JSON.parse(userMsg.content);
// buildDisplayMessage 格式：消息内容可能包含 workspace 路径引用
expect(userContent.content).toContain('List files');

// 3. 验证 AI 回复（不验证内容，仅验证存在）
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-single-folder`
- temp dir: `/tmp/e2e-chat-gemini-<timestamp>/`
- sessionStorage: 同 TC-G-01

**截图数**: 3

---

### TC-G-03: 上传单个文件

**优先级**: P0  
**目标**: 验证上传单个测试文件后，文件路径在消息中正确引用

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 单 |
| 模型 | auto |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录：`/tmp/e2e-chat-gemini-<timestamp>/`
2. 创建测试文件：`/tmp/e2e-chat-gemini-<timestamp>/test.txt`（内容："This is a test file for E2E"）
3. 打开 guid 页，选择 Gemini agent
4. 点击文件上传按钮（`data-testid="file-upload-btn"`）
5. 选择 `test.txt`（`ipcBridge.dialog.showOpen` → properties: `['openFile']`）
6. 确认 guid 页显示文件预览（`FilePreview` 组件）
7. 输入消息："Read the uploaded file and summarize its content."
8. 点击发送
9. 等待跳转至对话页
10. 等待 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证 conversation 创建（无 workspace）
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.workspace).toBeUndefined();

// 2. 验证用户消息包含文件路径引用
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
const userMsg = messages.find((m) => m.position === 'right');
const userContent = JSON.parse(userMsg.content);
// buildDisplayMessage 嵌入文件路径
expect(userContent.content).toContain('/tmp/e2e-chat-gemini-');
expect(userContent.content).toContain('test.txt');

// 3. 验证 AI 回复
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-single-file`
- temp dir: `/tmp/e2e-chat-gemini-<timestamp>/`（包含 test.txt）
- sessionStorage: 同 TC-G-01

**截图数**: 3

---

### TC-G-04: 使用 gemini-2.5-pro 模型

**优先级**: P0  
**目标**: 验证手动选择 Manual 子模式（gemini-2.5-pro）后，DB `conversations.model` 正确持久化

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | gemini-2.5-pro |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开 guid 页，选择 Gemini agent
2. 点击模型选择器（`data-testid="guid-model-selector"`，`<Brain>` 图标）
3. 展开 "Manual" 子菜单（二级 Dropdown）
4. 选择 `gemini-2.5-pro`（`data-model-value="gemini-2.5-pro"`）
5. 确认模型选择器文本显示 `gemini-2.5-pro`
6. 输入消息："What model are you?"
7. 点击发送
8. 等待跳转至对话页
9. 等待 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证模型持久化
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.model).toBe('gemini-2.5-pro'); // 当前模型 ID

// 2. 验证消息创建
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
expect(messages.length).toBeGreaterThanOrEqual(2);
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-model-25pro`
- temp dir: 无
- sessionStorage: 同 TC-G-01

**截图数**: 3

---

### TC-G-05: 使用 yolo 权限

**优先级**: P0  
**目标**: 验证 yolo 权限下，工具调用自动批准（无确认弹窗）

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | auto |
| 权限 | yolo |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开 guid 页，选择 Gemini agent
2. 打开权限选择器（`data-testid="guid-mode-selector"`，`<Shield>` 图标）
3. 选择 `yolo` 模式（label: "YOLO"）
4. 输入消息："Please use Google Search to find 'Claude AI' information."（触发 Google Search 工具）
5. 点击发送
6. 等待跳转至对话页
7. **验证无确认弹窗出现**（监听 `ConversationChatConfirm` 组件状态）
8. 等待工具执行完成（轮询 DB `messages.type='tool_group'`，超时 90s）

**DB 断言点**:

```typescript
// 1. 验证权限模式持久化
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.sessionMode).toBe('yolo'); // 注意驼峰

// 2. 验证工具调用记录（如果触发）
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
const toolMsg = messages.find((m) => m.type === 'tool_group');
if (toolMsg) {
  const toolContent = JSON.parse(toolMsg.content);
  // yolo 模式不应出现 'Confirming' 状态
  const hasConfirming = toolContent.some((tool) => tool.status === 'Confirming');
  expect(hasConfirming).toBe(false);
}

// 3. 验证 AI 回复存在（不验证具体内容）
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-yolo-mode`
- temp dir: 无
- sessionStorage: 同 TC-G-01

**截图数**: 3

**备注**: Gemini 工具调用行为取决于 API 响应，如果该消息未触发工具，测试仍然通过（仅验证权限字段持久化）

---

## 3. P1 用例（常规组合）

### TC-G-06: 使用 autoEdit 权限

**优先级**: P1  
**目标**: 验证 autoEdit 模式下，edit/info 工具自动批准，其他工具仍需确认

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | auto |
| 权限 | autoEdit |
| 对话中操作 | 无 |

**操作步骤**:

1. 打开 guid 页，选择 Gemini agent
2. 选择 `autoEdit` 模式（label: "Auto-Accept Edits"）
3. 输入消息："Please search for 'Gemini API documentation'."（触发搜索工具，可能需确认）
4. 如出现确认弹窗，点击 "Yes, Allow Once" 批准
5. 等待 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证权限模式持久化
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.sessionMode).toBe('autoEdit'); // 驼峰

// 2. 验证消息创建
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
expect(messages.length).toBeGreaterThanOrEqual(2);
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');

// 3. 验证工具调用记录（如果触发）
const toolMsg = messages.find((m) => m.type === 'tool_group');
if (toolMsg) {
  const toolContent = JSON.parse(toolMsg.content);
  // autoEdit 模式: edit/info 工具跳过 Confirming，其他工具可能需要确认
  // （具体行为取决于工具类型，此处不做强制断言）
}
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-autoEdit-mode`
- temp dir: 无
- sessionStorage: 同 TC-G-01

**截图数**: 3

---

### TC-G-07: 对话中切换模型（auto → gemini-2.5-pro）

**优先级**: P1  
**目标**: 验证对话中切换模型后，DB `conversations.model` 更新为新模型 ID

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | auto → gemini-2.5-pro |
| 权限 | default |
| 对话中操作 | 切换模型 |

**操作步骤**:

1. 按 TC-G-01 创建对话（使用 auto 模型）
2. 等待首条 AI 回复完成（超时 90s）
3. 点击对话页模型选择器（`data-testid="chat-model-selector"`，`<Brain>` 图标）
4. 展开 "Manual" 子菜单
5. 选择 `gemini-2.5-pro`（`data-model-value="gemini-2.5-pro"`）
6. 等待模型切换完成（轮询 DB `conversations.model` 更新，超时 5s）
7. 输入第二条消息："What model are you using now?"
8. 点击发送（`data-testid="sendbox-send-btn"`）
9. 等待 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证模型切换后 DB 更新
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.model).toBe('gemini-2.5-pro'); // 当前模型已切换

// 2. 验证消息数量
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
expect(messages.length).toBeGreaterThanOrEqual(4); // 用户1 + AI1 + 用户2 + AI2

// 3. 验证第二条 AI 回复存在
const aiMessages = messages.filter((m) => m.position === 'left' && m.type === 'text');
expect(aiMessages.length).toBeGreaterThanOrEqual(2);
const secondAiMsg = aiMessages[aiMessages.length - 1];
expect(secondAiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-switch-model`
- temp dir: 无
- sessionStorage: 同 TC-G-01

**截图数**: 4（增加 1 张模型选择器打开状态截图）

---

### TC-G-08: 对话中切换权限（default → autoEdit）

**优先级**: P1  
**目标**: 验证对话中切换权限后，`extra.sessionMode` 立即更新

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | auto |
| 权限 | default → autoEdit |
| 对话中操作 | 切换权限 |

**操作步骤**:

1. 按 TC-G-01 创建对话（default 权限）
2. 等待首条 AI 回复完成（超时 90s）
3. 打开权限选择器（`data-testid="chat-mode-selector"`，`<Shield>` 图标）
4. 选择 `autoEdit` 模式（`data-mode-value="autoEdit"`）
5. 等待权限切换成功提示（`Message.success('Mode switched')`）
6. 等待 DB `extra.sessionMode` 更新（轮询，超时 5s）
7. 输入第二条消息："Please search for 'AionUi features'."
8. 等待 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证权限切换后 DB 更新
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.sessionMode).toBe('autoEdit'); // 已切换为驼峰 autoEdit

// 2. 验证消息数量
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
expect(messages.length).toBeGreaterThanOrEqual(4);

// 3. 验证第二条 AI 回复存在
const aiMessages = messages.filter((m) => m.position === 'left' && m.type === 'text');
expect(aiMessages.length).toBeGreaterThanOrEqual(2);
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-switch-permission-default-autoEdit`
- temp dir: 无
- sessionStorage: 同 TC-G-01

**截图数**: 4（增加 1 张权限选择器打开状态截图）

---

### TC-G-09: 对话中切换权限（autoEdit → yolo）

**优先级**: P1  
**目标**: 验证权限升级路径（autoEdit → yolo）持久化正确

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 无 |
| 模型 | auto |
| 权限 | autoEdit → yolo |
| 对话中操作 | 切换权限 |

**操作步骤**:

1. 打开 guid 页，选择 Gemini agent
2. 选择 `autoEdit` 模式
3. 输入消息："Hello, Gemini!"
4. 等待对话页首条 AI 回复完成（超时 90s）
5. 打开权限选择器
6. 选择 `yolo` 模式
7. 等待权限切换成功提示
8. 等待 DB `extra.sessionMode` 更新（轮询，超时 5s）
9. 输入第二条消息："Use Google Search to find 'E2E testing best practices'."
10. **验证无确认弹窗**（yolo 模式）
11. 等待 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证权限切换后 DB 更新
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.sessionMode).toBe('yolo'); // 已切换为 yolo

// 2. 验证消息数量
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
expect(messages.length).toBeGreaterThanOrEqual(4);

// 3. 验证工具调用无 Confirming 状态（如果触发）
const toolMsg = messages.find((m) => m.type === 'tool_group');
if (toolMsg) {
  const toolContent = JSON.parse(toolMsg.content);
  const hasConfirming = toolContent.some((tool) => tool.status === 'Confirming');
  expect(hasConfirming).toBe(false);
}
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-switch-permission-autoEdit-yolo`
- temp dir: 无
- sessionStorage: 同 TC-G-01

**截图数**: 4

---

### TC-G-10: 关联文件夹 + 上传文件组合

**优先级**: P1  
**目标**: 验证同时关联文件夹和上传文件后，DB 和消息内容正确持久化

**前置条件**:

- 同 TC-G-01
- Desktop 环境

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 单 |
| 上传文件 | 单 |
| 模型 | auto |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录：`/tmp/e2e-chat-gemini-<timestamp>/`
2. 创建测试文件：`/tmp/e2e-chat-gemini-<timestamp>/test.txt`
3. 打开 guid 页，选择 Gemini agent
4. 关联临时目录（步骤同 TC-G-02）
5. 上传 `test.txt`（步骤同 TC-G-03）
6. 确认 guid 页显示：文件夹路径 + 文件预览
7. 输入消息："List files in workspace and read test.txt."
8. 点击发送
9. 等待对话页 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证文件夹 + 文件双重持久化
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.workspace).toMatch(/^\/tmp\/e2e-chat-gemini-/);

// 2. 验证用户消息包含文件夹和文件引用
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
const userMsg = messages.find((m) => m.position === 'right');
const userContent = JSON.parse(userMsg.content);
expect(userContent.content).toContain('List files');
expect(userContent.content).toContain('test.txt');

// 3. 验证 AI 回复
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-folder-file-combo`
- temp dir: `/tmp/e2e-chat-gemini-<timestamp>/`
- sessionStorage: 同 TC-G-01

**截图数**: 3

---

### TC-G-11: 上传多个文件

**优先级**: P1  
**目标**: 验证同时上传 3 个文件后，所有文件路径在消息中正确引用

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 多（3 个） |
| 模型 | auto |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录：`/tmp/e2e-chat-gemini-<timestamp>/`
2. 创建 3 个测试文件：
   - `file1.txt`（内容："File 1"）
   - `file2.txt`（内容："File 2"）
   - `file3.txt`（内容："File 3"）
3. 打开 guid 页，选择 Gemini agent
4. 点击文件上传按钮，选择 `file1.txt`
5. 再次点击上传按钮，选择 `file2.txt`
6. 再次点击上传按钮，选择 `file3.txt`
7. 确认 guid 页显示 3 个文件预览
8. 输入消息："Read all uploaded files and list their contents."
9. 点击发送
10. 等待对话页 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证 conversation 创建（无 workspace）
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.extra.workspace).toBeUndefined();

// 2. 验证用户消息包含 3 个文件路径
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
const userMsg = messages.find((m) => m.position === 'right');
const userContent = JSON.parse(userMsg.content);
expect(userContent.content).toContain('file1.txt');
expect(userContent.content).toContain('file2.txt');
expect(userContent.content).toContain('file3.txt');

// 3. 验证 AI 回复
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-multi-files`
- temp dir: `/tmp/e2e-chat-gemini-<timestamp>/`（包含 3 个文件）
- sessionStorage: 同 TC-G-01

**截图数**: 3

---

### TC-G-12: 完整组合（关联文件夹 + 多文件 + gemini-2.5-pro + autoEdit）

**优先级**: P1  
**目标**: 验证最复杂维度组合下，所有配置正确持久化

**前置条件**:

- 同 TC-G-01
- Desktop 环境

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 单 |
| 上传文件 | 多（2 个） |
| 模型 | gemini-2.5-pro |
| 权限 | autoEdit |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录：`/tmp/e2e-chat-gemini-<timestamp>/`
2. 创建 2 个测试文件：`doc1.txt`, `doc2.txt`
3. 打开 guid 页，选择 Gemini agent
4. 选择模型 `gemini-2.5-pro`
5. 选择权限 `autoEdit`
6. 关联临时目录
7. 上传 `doc1.txt` 和 `doc2.txt`
8. 输入消息："Analyze uploaded files in workspace."
9. 点击发送
10. 等待对话页 AI 回复完成（超时 90s）

**DB 断言点**:

```typescript
// 1. 验证所有维度持久化
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.type).toBe('gemini');
expect(conv.model).toBe('gemini-2.5-pro');
expect(conv.extra.sessionMode).toBe('autoEdit');
expect(conv.extra.workspace).toMatch(/^\/tmp\/e2e-chat-gemini-/);

// 2. 验证用户消息包含文件夹和文件引用
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
const userMsg = messages.find((m) => m.position === 'right');
const userContent = JSON.parse(userMsg.content);
expect(userContent.content).toContain('doc1.txt');
expect(userContent.content).toContain('doc2.txt');

// 3. 验证 AI 回复
const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-full-combo`
- temp dir: `/tmp/e2e-chat-gemini-<timestamp>/`
- sessionStorage: 同 TC-G-01

**截图数**: 3

---

## 4. P2 用例（边界异常）

### TC-G-13: OAuth 未配置时跳过测试

**优先级**: P2  
**目标**: 验证 OAuth/API key 未配置时，测试用例正确跳过

**前置条件**:

- **无 Gemini OAuth**（临时重命名 `~/.gemini/oauth_creds.json`）
- **无 API key**（模型列表为空）

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | N/A |
| 上传文件 | N/A |
| 模型 | N/A |
| 权限 | N/A |
| 对话中操作 | N/A |

**操作步骤**:

1. 确认 `checkGeminiAuth(page)` 返回 `false`
2. 执行 `test.skip(true, 'Skipped: Gemini OAuth or API key not configured')`
3. 验证测试结果显示 "Skipped" 状态（非 "Passed" 或 "Failed"）

**DB 断言点**:

```typescript
// 无 DB 断言（测试被跳过）
```

**清理义务**:

- 无（测试未运行）

**截图数**: 0

**备注**: 此用例主要验证前置条件检测逻辑，确保在缺少 OAuth 时不会产生误报（失败）

---

### TC-G-14: 上传超大文件触发错误

**优先级**: P2  
**目标**: 验证上传超过 Gemini API 限制的文件时，提示错误信息

**前置条件**:

- 同 TC-G-01

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 无 |
| 上传文件 | 单（超大） |
| 模型 | auto |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录：`/tmp/e2e-chat-gemini-<timestamp>/`
2. 创建超大文件：`large.txt`（大小：100 MB，用 `dd` 命令生成）
   ```bash
   dd if=/dev/zero of=/tmp/e2e-chat-gemini-<timestamp>/large.txt bs=1M count=100
   ```
3. 打开 guid 页，选择 Gemini agent
4. 尝试上传 `large.txt`
5. **验证出现错误提示**（`Message.error` 或文件拒绝上传）
6. 确认 guid 页文件预览列表为空（上传失败）

**DB 断言点**:

```typescript
// 无 DB 断言（对话未创建）
// 仅验证 UI 错误提示出现
```

**清理义务**:

- temp dir: `/tmp/e2e-chat-gemini-<timestamp>/`（包含 large.txt）
- sessionStorage: 无

**截图数**: 2（上传前 + 错误提示截图）

**备注**: 文件大小限制取决于 Gemini API 限制（需从 API 文档确认），当前假设为 20 MB

---

### TC-G-15: 关联不存在的文件夹路径

**优先级**: P2  
**目标**: 验证关联已删除的文件夹后，发送消息时提示错误

**前置条件**:

- 同 TC-G-01
- Desktop 环境

**维度组合**:
| 维度 | 值 |
|------|------|
| 关联文件夹 | 单（已删除） |
| 上传文件 | 无 |
| 模型 | auto |
| 权限 | default |
| 对话中操作 | 无 |

**操作步骤**:

1. 创建临时目录：`/tmp/e2e-chat-gemini-<timestamp>/`
2. 打开 guid 页，选择 Gemini agent
3. 关联临时目录
4. **删除临时目录**：`fs.rm('/tmp/e2e-chat-gemini-<timestamp>/', { recursive: true })`
5. 输入消息："List files."
6. 点击发送
7. **验证出现错误提示**（对话创建失败或消息发送失败）

**DB 断言点**:

```typescript
// 1. 验证 conversation 可能创建（取决于错误发生时机）
const convs = await invokeBridge(page, 'conversation.list', ...);
const testConv = convs.find(c => c.name.startsWith('E2E-gemini-'));
if (testConv) {
  expect(testConv.status).toBe('error'); // 可能标记为错误状态
}

// 2. 验证消息创建失败或标记为错误
if (testConv) {
  const messages = await invokeBridge(page, 'database.getConversationMessages', {
    conversation_id: testConv.id,
    page: 0,
    pageSize: 100
  });
  const userMsg = messages.find(m => m.position === 'right');
  if (userMsg) {
    expect(userMsg.status).toBe('error'); // 可能标记为错误状态
  }
}
```

**清理义务**:

- conversations name: `E2E-gemini-<timestamp>-deleted-folder`（如果创建）
- temp dir: 无（已删除）
- sessionStorage: 同 TC-G-01

**截图数**: 2（关联后 + 错误提示截图）

**备注**: 错误行为取决于文件夹验证时机（guid 发送前 vs 对话页消息发送），测试仅验证错误提示出现

---

## 5. 测试用例汇总表

| 用例 ID | 优先级 | 标题                         | 关联文件夹 | 上传文件    | 模型           | 权限             | 对话中操作 | 截图数 |
| ------- | ------ | ---------------------------- | ---------- | ----------- | -------------- | ---------------- | ---------- | ------ |
| TC-G-01 | P0     | 最小可用路径                 | 无         | 无          | auto           | default          | 无         | 3      |
| TC-G-02 | P0     | 关联单个文件夹               | 单         | 无          | auto           | default          | 无         | 3      |
| TC-G-03 | P0     | 上传单个文件                 | 无         | 单          | auto           | default          | 无         | 3      |
| TC-G-04 | P0     | gemini-2.5-pro 模型          | 无         | 无          | gemini-2.5-pro | default          | 无         | 3      |
| TC-G-05 | P0     | yolo 权限                    | 无         | 无          | auto           | yolo             | 无         | 3      |
| TC-G-06 | P1     | autoEdit 权限                | 无         | 无          | auto           | autoEdit         | 无         | 3      |
| TC-G-07 | P1     | 切换模型                     | 无         | 无          | auto→2.5pro    | default          | 切换模型   | 4      |
| TC-G-08 | P1     | 切换权限（default→autoEdit） | 无         | 无          | auto           | default→autoEdit | 切换权限   | 4      |
| TC-G-09 | P1     | 切换权限（autoEdit→yolo）    | 无         | 无          | auto           | autoEdit→yolo    | 切换权限   | 4      |
| TC-G-10 | P1     | 文件夹 + 文件组合            | 单         | 单          | auto           | default          | 无         | 3      |
| TC-G-11 | P1     | 多文件上传                   | 无         | 多（3）     | auto           | default          | 无         | 3      |
| TC-G-12 | P1     | 完整组合                     | 单         | 多（2）     | gemini-2.5-pro | autoEdit         | 无         | 3      |
| TC-G-13 | P2     | OAuth 未配置跳过             | N/A        | N/A         | N/A            | N/A              | N/A        | 0      |
| TC-G-14 | P2     | 超大文件错误                 | 无         | 单（100MB） | auto           | default          | 无         | 2      |
| TC-G-15 | P2     | 不存在文件夹路径             | 单（删除） | 无          | auto           | default          | 无         | 2      |

**总计**: 15 个用例（P0=5，P1=7，P2=3）

---

## 6. 通用规范

### 6.1 超时时间

| 场景                         | 超时时间 | 说明                                            |
| ---------------------------- | -------- | ----------------------------------------------- |
| AI 回复完成（guid → 对话页） | 90s      | Gemini API 比 aionrs binary 慢，增加 50% buffer |
| 模型/权限切换 DB 更新        | 5s       | UI → DB 同步时间                                |
| 工具执行完成                 | 90s      | Google Search 等外部 API 调用                   |
| 页面跳转                     | 10s      | guid → 对话页 URL 变化                          |

### 6.2 DB 轮询策略

```typescript
async function waitForConversationFinish(page, conversationId, timeout = 90000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
    if (conv.status === 'finished') {
      return true;
    }
    await page.waitForTimeout(500); // 每 500ms 轮询一次
  }
  throw new Error(`Conversation ${conversationId} did not finish within ${timeout}ms`);
}
```

### 6.3 截图命名规范

```
tests/e2e/screenshots/gemini/
  TC-G-01-step1-guid-selected.png
  TC-G-01-step2-chat-streaming.png
  TC-G-01-step3-chat-finished.png
  TC-G-07-step4-model-selector-open.png
  ...
```

### 6.4 错误处理

**测试失败时保留现场**:

- 不清理 DB 记录（保留 conversations + messages）
- 不清理临时文件（保留 `/tmp/e2e-chat-gemini-*`）
- 截取完整页面截图（`page.screenshot({ path: 'error-<timestamp>.png', fullPage: true })`）
- 记录 console 日志（`page.on('console', msg => console.log(msg.text()))`）

**清理失败必须 throw**:

```typescript
afterEach(async ({ page }, testInfo) => {
  try {
    await cleanupE2EGeminiConversations(page);
    await cleanupTempDirs();
  } catch (error) {
    throw new Error(`Cleanup failed: ${error.message}`);
  }
});
```

---

## 7. 附录

### 7.1 Helper 函数清单（由 engineer 实现）

| 函数名                                              | 用途                                   | 实现文件                       |
| --------------------------------------------------- | -------------------------------------- | ------------------------------ |
| `checkGeminiAuth(page)`                             | 检测 OAuth/API key 是否配置            | `tests/e2e/helpers/gemini.ts`  |
| `cleanupE2EGeminiConversations(page)`               | 删除所有 `E2E-gemini-*` 对话           | `tests/e2e/helpers/gemini.ts`  |
| `cleanupTempDirs()`                                 | 删除所有 `/tmp/e2e-chat-gemini-*` 目录 | `tests/e2e/helpers/cleanup.ts` |
| `waitForGeminiReply(page, conversationId, timeout)` | 轮询等待 AI 回复完成                   | `tests/e2e/helpers/gemini.ts`  |
| `getConversationIdFromUrl(page)`                    | 从 URL 提取 conversationId             | `tests/e2e/helpers/url.ts`     |

### 7.2 关键 data-testid 清单（由 engineer 实现）

| 元素                | testid                                 | 文件位置                  |
| ------------------- | -------------------------------------- | ------------------------- |
| Gemini agent pill   | `data-agent-backend="gemini"`          | `AgentPillBar.tsx`        |
| guid 模型选择器按钮 | `data-testid="guid-model-selector"`    | `GuidModelSelector.tsx`   |
| guid 权限选择器按钮 | `data-testid="guid-mode-selector"`     | `GuidActionRow.tsx`       |
| guid 文件夹选择按钮 | `data-testid="workspace-selector-btn"` | `GuidActionRow.tsx`       |
| guid 文件上传按钮   | `data-testid="file-upload-btn"`        | `GuidActionRow.tsx`       |
| guid 输入框         | `data-testid="guid-input"`             | `GuidInputCard.tsx`       |
| guid 发送按钮       | `data-testid="guid-send-btn"`          | `GuidActionRow.tsx`       |
| 对话页模型选择器    | `data-testid="chat-model-selector"`    | `GeminiModelSelector.tsx` |
| 对话页权限选择器    | `data-testid="chat-mode-selector"`     | `GeminiSendBox.tsx`       |
| SendBox 输入框      | `data-testid="sendbox-input"`          | `SendBox.tsx`             |
| SendBox 发送按钮    | `data-testid="sendbox-send-btn"`       | `SendBox.tsx`             |
| 模型下拉选项        | `data-model-value="${modelName}"`      | `GuidModelSelector.tsx`   |
| 权限下拉选项        | `data-mode-value="${mode.value}"`      | `AgentModeSelector.tsx`   |

### 7.3 Gemini 特有注意事项

#### 7.3.1 模型列表动态性

Gemini 模型列表通过以下方式获取：

- Google Auth: 从 OAuth token 查询可用模型
- API key: 从 provider 配置读取

测试时**不硬编码模型 ID**，而是从 `providers[0].models` 动态获取。

#### 7.3.2 权限字符串格式

**Gemini 使用驼峰**（不同于 aionrs 下划线）：

- `default` → `default`
- `autoEdit` → `autoEdit`（驼峰）
- `yolo` → `yolo`

**验证字段**：`conversations.extra.sessionMode`（非 `extra.mode`）

#### 7.3.3 AI 回复内容不可预测

Gemini API 回复内容依赖模型当前状态（不同于 aionrs binary 固定输出），因此：

- **不验证** AI 回复的具体文本内容
- **仅验证** 消息存在、状态为 `finish`、回复非空

#### 7.3.4 工具调用不确定性

Gemini API 决定是否调用工具（Google Search、Code Execution 等），测试无法强制触发，因此：

- 工具调用断言使用 `if (toolMsg)` 条件判断
- 未触发工具时，测试仍然通过（仅验证权限字段持久化）

#### 7.3.5 超时时间建议

Gemini API 比本地 binary 慢，建议超时时间：

- AI 回复完成：90s（aionrs 60s + 50% buffer）
- 工具执行完成：90s
- 模型切换：5s
- 页面跳转：10s

---

## 8. 变更记录

| 版本        | 日期       | 作者                 | 变更说明                                                              |
| ----------- | ---------- | -------------------- | --------------------------------------------------------------------- |
| Gate 2 初稿 | 2026-04-22 | chat-gemini-designer | 基于 requirements.zh.md 和 aionrs test-cases.zh.md 结构产出 15 个用例 |

---

**文档完成，等待审核。**
