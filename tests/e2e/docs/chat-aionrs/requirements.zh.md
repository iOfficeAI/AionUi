# Aion CLI (aionrs) E2E 测试需求

**版本**: v1.1（修订版）  
**作者**: chat-aionrs-analyst  
**日期**: 2026-04-22  
**状态**: 已完成 Gate 1 + v1.1 修订（纠正 aionrs 模型来源）

---

## 1. 业务场景

### 1.1 端到端流程

用户从 **guid 首页** 选择 aionrs agent，配置上下文（文件/文件夹/模型/权限），发送消息，进入 **aionrs 对话页**，接收流式回复，并可在对话中切换模型/权限。

**关键路径**（源码追溯）：

1. **guid 首页** (`src/renderer/pages/guid/GuidPage.tsx:83-100`)
   - 用户点击 `AgentPillBar` 中 aionrs pill（`data-agent-backend="aionrs"`）
   - 可选：通过 `GuidModelSelector` 选择模型（ACP 模型列表）
   - 可选：通过 `AgentModeSelector` 选择权限模式
   - 可选：上传文件 / 关联文件夹（guid 页暂不支持，对话页支持）
   - 输入消息，点击发送 → 创建对话并导航到 `/conversation/aionrs/<id>`

2. **aionrs 对话页** (`src/renderer/pages/conversation/platforms/aionrs/AionrsChat.tsx:27-54`)
   - 显示 `MessageList`（历史消息）
   - `AionrsSendBox` 提供文件上传、文件夹关联、模型选择、权限选择
   - 发送消息后，前端通过 `ipcBridge.conversation.sendMessage.invoke()` 调用进程端

3. **进程端** (`src/process/task/AionrsManager.ts:78-781`)
   - 创建 `AionrsAgent` 实例（`src/process/agent/aionrs/index.ts:54-450`）
   - 启动 aionrs binary（stdin/stdout JSON Lines 协议）
   - 处理流式事件（`stream_start`, `text_delta`, `thinking`, `tool_request`, `stream_end` 等）
   - 权限确认逻辑（`auto_edit` / `yolo` 自动批准部分工具）

4. **数据库持久化** (`src/process/services/database/schema.ts:42-77`)
   - 对话记录写入 `conversations` 表（含 `extra.sessionMode`, `extra.lastTokenUsage`）
   - 消息记录写入 `messages` 表（含 `type`, `content`, `position`, `status`）

---

## 2. 测试维度枚举

### 2.1 维度定义表

| 维度           | 档位 | 说明                                   | 源码追溯                                                 |
| -------------- | ---- | -------------------------------------- | -------------------------------------------------------- |
| **文件夹关联** | 2 档 | 无关联 / 关联                          | `AionrsSendBox.tsx:331-337` atPath 状态 + event listener |
| **文件上传**   | 2 档 | 无上传 / 上传                          | `AionrsSendBox.tsx:103-125` file input handler           |
| **模型**       | 2 档 | 从 ACP 模型列表挑 2 个（推荐配置见下） | `GuidModelSelector.tsx` + `useGuidModelSelection.ts`     |
| **权限模式**   | 3 档 | default / auto_edit / yolo             | `agentModes.ts:65-69` aionrs 分支                        |
| **对话中切换** | 必测 | 切换模型 + 切换权限                    | `AionrsModelSelector.tsx` + `AgentModeSelector`          |

### 2.2 维度详细说明

#### 文件夹关联（2 档）

**档位 1 - 无关联**:

- 发送消息时 `atPath = []`
- `workspace` 指向临时目录 `/tmp/e2e-chat-aionrs-<scenario>-<ts>/`

**档位 2 - 关联文件夹**:

- 通过 `emitter.emit('aionrs.selected.file', items)` 触发
- `atPath` 包含 `{path: '/tmp/...', name: 'folder-name', isFile: false}`
- 对话页显示蓝色 Tag（`AionrsSendBox.tsx:423-446`）

**前置条件**:

- E2E 在 `/tmp/e2e-chat-aionrs-<scenario>-<ts>/` 创建临时文件夹
- 通过 `invokeBridge(page, 'fs.readdir', ...)` 或 UI 文件树选择

**验证点**:

- DB `messages.content` 包含文件夹路径（JSON 字段）
- Binary 接收到 `files` 参数（通过 IPC bridge 验证）

---

#### 文件上传（2 档）

**档位 1 - 无上传**:

- `uploadFile = []`

**档位 2 - 上传文件**:

- 桌面端: `ipcBridge.dialog.showOpen({ properties: ['openFile'] })`
- WebUI: `page.setInputFiles('input[type="file"]', filePath)`
- `uploadFile` 存储绝对路径数组

**前置条件**:

- E2E 创建测试文件 `/tmp/e2e-chat-aionrs-<scenario>-<ts>/test.txt`（内容: "E2E test file"）

**验证点**:

- 上传后显示文件预览卡片（`AionrsSendBox.tsx:413-421`）
- DB `messages.content` 包含文件路径
- Binary 接收到 `files` 参数

---

#### 模型（2 档）

**模型来源**（用户配置的 provider 列表）:

**重要纠正**: aionrs **不使用 ACP 模型列表**，而是使用用户在 Settings → Model 里配置的通用 provider 列表。

**源码追溯**:

- `src/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection.ts:34-40`:
  ```typescript
  const { providers: allProviders, ... } = useModelProviderList();
  const providers = allProviders.filter(p => !p.platform?.toLowerCase().includes('gemini-with-google-auth'));
  ```
- `useModelProviderList()` 来源（`src/renderer/hooks/agent/useModelProviderList.ts:30`）:
  ```typescript
  const { data: modelConfig } = useSWR('model.config', () => ipcBridge.mode.getModelConfig.invoke());
  ```
  → 即用户配置文件存储的 provider 列表（非动态探测）

**与 ACP agent 的区别**:

- **ACP agent**（Claude Code / Qwen Code / iFlow）: 模型从 `ipcBridge.acpConversation.getModelInfo` 探测（agent 进程启动后反馈）
- **aionrs**: 模型从 `ipcBridge.mode.getModelConfig` 读取（用户配置文件，排除 `gemini-with-google-auth`）

**档位定义**（runtime 动态决定，不可 hardcode）:

1. **档位 1 - 默认模型**:
   - E2E setup 查询 `ipcBridge.mode.getModelConfig.invoke()`
   - 过滤 `gemini-with-google-auth`
   - 取 `providers[0].model[0]`（第一个可用 provider 的第一个 model）

2. **档位 2 - 切换模型**:
   - 同一 provider 下的不同 model: `providers[0].model[1]`
   - 或跨 provider: `providers[1].model[0]`（若存在第二个 provider）

**E2E 前置条件**（见 §8 新增议题）:

- 至少 1 个非 Google Auth provider
- 该 provider 至少有 2 个可用 model（用于切换测试）
- 若只有 1 个 model，测试降级为"只验证当前 model，不测切换"

**验证策略**:

- 通过 `invokeBridge(page, 'conversation.get', { id })` 查询 DB
- 校验 `conversations.model` 字段（模型 ID）
- 校验 `conversations.extra.model` (JSON) 包含 `{ id, useModel, name, ... }`

**已知约束**:

- aionrs **不支持 Google Auth**（`useAionrsModelSelection.ts:36-40` 过滤）
- 模型切换行为: E2E 只验证 DB 字段更新，不验证 binary 重启（见 §8 议题 1 决策）

---

#### 权限模式（3 档）

**档位枚举**（源码 `src/renderer/utils/model/agentModes.ts:65-69`）:

```typescript
aionrs: [
  { value: 'default', label: 'Default' },
  { value: 'auto_edit', label: 'Auto-Accept Edits' },
  { value: 'yolo', label: 'YOLO' },
];
```

| mode        | label             | 行为                                             | 源码追溯                                |
| ----------- | ----------------- | ------------------------------------------------ | --------------------------------------- |
| `default`   | Default           | 每次工具调用需确认                               | `AionrsManager.ts:250-296` confirm 逻辑 |
| `auto_edit` | Auto-Accept Edits | 自动批准 edit / info 类工具，exec / mcp 仍需确认 | `AionrsManager.ts:254-259`              |
| `yolo`      | YOLO              | 全自动批准所有工具                               | `AionrsManager.ts:250-253`              |

**权限切换接口**:

- guid 页: `GuidActionRow.tsx:277-287` — `AgentModeSelector` 组件
- 对话页: `AionrsSendBox.tsx:391-401` — 同样使用 `AgentModeSelector`
- 进程端: `AionrsManager.ts:727-737` — `setMode()` 更新 DB + 发送 `set_mode` 到 binary

**验证策略**:

- 查询 DB: `SELECT json_extract(extra, '$.sessionMode') FROM conversations WHERE id = ?`
- 期望值: `'default' | 'auto_edit' | 'yolo'`

**测试覆盖**:

- guid 页选 3 种模式各 1 次（3 个用例）
- 对话中切换 3 种模式（见 §2.3 对话中切换）

---

#### 对话中切换（必测）

**切换模型**:

- 操作: 点击对话页 `AionrsModelSelector` 按钮 → 选择不同模型
- 预期: 下次发送消息时生效（是否需重启 binary 待 E2E 探测）
- 验证: 查 DB `conversations.extra.model.useModel`

**切换权限**:

- 操作: 点击对话页 `AgentModeSelector` 按钮 → 选择不同权限
- 预期: 立即生效（`AionrsManager.setMode()` 发送 `set_mode` 到 binary）
- 验证: 查 DB `conversations.extra.sessionMode`

**边界场景**（待 team-lead 决策 — 见 §8 议题 3）:

- 工具确认弹窗中途切换权限 → 当前行为待探测（是否取消 pending 确认？）

---

### 2.3 用例矩阵（正交覆盖）

**全排列**: 2（文件夹） × 2（上传） × 2（模型） × 3（权限） = **24 组合**

**收敛策略**（designer + engineer 共识）:

- **P0 核心用例**（5 个）: 无附件 + 默认模型 + default 权限（基础路径）
- **P1 常用用例**（7 个）: 单文件、单文件夹、多文件、多文件夹、切换模型、切换权限
- **P2 边界用例**（3-5 个）: 超大文件、并发对话、协议错误、进程崩溃

**推荐用例清单**（11-17 个，采用正交设计）:

| #   | 文件夹关联 | 文件上传     | 模型 | 权限      | 对话中切换  | 优先级 |
| --- | ---------- | ------------ | ---- | --------- | ----------- | ------ |
| 1   | 无         | 无           | 默认 | default   | -           | P0     |
| 2   | 关联       | 无           | 默认 | default   | -           | P1     |
| 3   | 无         | 上传         | 默认 | default   | -           | P1     |
| 4   | 关联       | 上传         | 默认 | default   | -           | P1     |
| 5   | 无         | 无           | 默认 | auto_edit | -           | P1     |
| 6   | 无         | 无           | 默认 | yolo      | -           | P1     |
| 7   | 无         | 无           | 默认 | default   | 切换模型    | P1     |
| 8   | 无         | 无           | 默认 | default   | 切换权限    | P1     |
| 9   | 无         | 上传（超大） | 默认 | default   | -           | P2     |
| 10  | 无         | 无           | 默认 | default   | 并发对话    | P2     |
| 11  | 无         | 无           | 默认 | default   | binary 崩溃 | P2     |

---

## 3. Binary 前置条件

### 3.1 Binary 路径解析（Q3 决策）

**解析策略**（二选一，推荐选项 2）:

**选项 1 - Hardcode 路径**:

```typescript
const AIONRS_BINARY_PATH = '/Users/zhoukai/.local/bin/aionrs';
```

**选项 2 - 从 PATH 查找**（**推荐**，更健壮）:

```typescript
// 通过 binaryResolver 查找
const binary = await ipcBridge.fs.findAionrsBinary.invoke();
if (!binary) {
  test.skip('aionrs binary not found in PATH or ~/.local/bin/aionrs, skipping E2E tests');
}
```

**源码追溯**: `src/process/agent/aionrs/binaryResolver.ts`

- 解析顺序: 环境变量 `AION_CLI_PATH` → `~/.aionui/bin/aion-<platform>-<arch>` → 系统 PATH 中的 `aion` 命令

**验证命令**（team-lead 已确认）:

```bash
$ which aionrs
/Users/zhoukai/.local/bin/aionrs
```

**E2E 实现规范**:

```typescript
// tests/e2e/setup/aionrs.setup.ts
export async function checkAionrsBinary(page: Page): Promise<boolean> {
  try {
    const binary = await invokeBridge(page, 'fs.findAionrsBinary');
    if (!binary) {
      console.error('[E2E Setup] aionrs binary not found in PATH or ~/.local/bin/aionrs');
      return false;
    }
    console.log(`[E2E Setup] aionrs binary found: ${binary}`);
    return true;
  } catch (error) {
    console.error('[E2E Setup] Failed to check aionrs binary:', error);
    return false;
  }
}

// tests/e2e/specs/chat-aionrs/*.spec.ts
test.beforeAll(async ({ page }) => {
  const hasBinary = await checkAionrsBinary(page);
  if (!hasBinary) {
    test.skip('aionrs binary not found, skipping E2E tests');
  }
});
```

**关键要求**（team-lead 指示）:

- 若 binary 不存在，**必须** `test.skip()` 并打印明确错误信息（不要悄悄跳过）
- 错误信息示例: `aionrs binary not found in PATH or ~/.local/bin/aionrs`

---

### 3.2 Binary 启动与超时

**启动流程** (`src/process/agent/aionrs/index.ts:85-157`):

1. 创建 `AionrsAgent` 实例
2. 调用 `spawn(binaryPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })`
3. 等待 `ready` 事件（JSON Lines: `{"type":"ready","session_id":"...","capabilities":{...}}`）
4. 超时时间: **30s**（`index.ts:136-140`）

**E2E timeout 设置**:

```typescript
test(
  'should start aionrs conversation',
  async ({ page }) => {
    // Playwright test timeout: 60s（留足 binary 启动时间）
  },
  { timeout: 60000 }
);
```

**失败场景**:

- 启动超时: 抛出 `Error('aionrs ready timeout (30s)')`
- 进程崩溃: `childProcess.on('exit')` 触发，前端收到 `error` 事件

---

## 4. 临时目录与清理契约（Q4 决策）

### 4.1 临时目录规范

**目录结构**:

```
/tmp/e2e-chat-aionrs-<scenario>-<timestamp>/
├── test-file.txt          # 文件上传测试文件
├── test-folder/           # 文件夹关联测试目录
│   └── sample.md
└── .aionrs/               # aionrs session 文件（binary 自动创建）
```

**命名规范**:

- `<scenario>`: 用例场景描述（如 `no-attach`, `single-file`, `single-folder`, `multi-attach`）
- `<timestamp>`: `Date.now()` 或 `YYYYMMDD-HHmmss`

**创建时机**: `beforeEach()` 或用例开始前

---

### 4.2 清理契约（team-lead 硬性要求）

#### 清理顺序（必须按序执行，避免外键冲突）

```typescript
afterEach(async ({ page }) => {
  const conversationId = /* 当前用例的对话 ID */;
  const tmpDir = /* 当前用例的临时目录 */;

  try {
    // 1. 停止 aionrs binary 进程
    await invokeBridge(page, 'conversation.stop', { conversation_id: conversationId });

    // 2. 清理 DB（级联删除 messages）
    await invokeBridge(page, 'db.exec', {
      sql: "DELETE FROM conversations WHERE name LIKE 'E2E-aionrs-%'"
    });

    // 3. 清理 FS（临时目录 + aionrs session 文件）
    await invokeBridge(page, 'fs.rm', { path: tmpDir, recursive: true });

    // 4. 清理 UI state（ESC×5 关闭所有弹窗/模态框）
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    // 5. 清理 sessionStorage
    await page.evaluate(() => {
      sessionStorage.clear();
    });

    // 6. 验证清理完成（可选，但推荐）
    const remaining = await invokeBridge(page, 'db.query', {
      sql: "SELECT COUNT(*) as count FROM conversations WHERE name LIKE 'E2E-aionrs-%'"
    });
    if (remaining[0].count > 0) {
      throw new Error(`E2E cleanup failed: ${remaining[0].count} conversations still exist`);
    }
  } catch (error) {
    // 清理失败必须 throw（team-lead 硬性要求）
    console.error('[E2E Cleanup] Failed:', error);
    throw error;
  }
});
```

#### 清理范围

| 资源类型              | 清理规则                                | 验证方式                      |
| --------------------- | --------------------------------------- | ----------------------------- |
| **DB conversations**  | `DELETE WHERE name LIKE 'E2E-aionrs-%'` | `SELECT COUNT(*)` 期望 0      |
| **DB messages**       | 级联删除（`ON DELETE CASCADE`）         | 自动清理                      |
| **FS 临时目录**       | `rm -rf /tmp/e2e-chat-aionrs-*`         | `fs.existsSync()` 期望 false  |
| **FS aionrs session** | 包含在临时目录内                        | 同上                          |
| **UI state**          | ESC×5 + 导航到安全页面（如 `/guid`）    | 截图验证                      |
| **sessionStorage**    | `clear()`                               | `sessionStorage.length === 0` |

#### 对话命名规范（必须遵守）

```typescript
const conversationName = `E2E-aionrs-${scenario}-${Date.now()}`;
// 示例: 'E2E-aionrs-no-attach-1745327890123'
```

**关键要求**:

- 前缀 **必须** 是 `E2E-aionrs-`（清理 SQL 依赖此前缀）
- 包含场景描述（便于日志追溯）
- 包含时间戳（避免重名）

---

## 5. 数据库验证字段

### 5.1 conversations 表验证

**关键字段** (`src/process/services/database/schema.ts:42-58`):

| 字段         | 类型        | 验证规则                               | 源码追溯                   |
| ------------ | ----------- | -------------------------------------- | -------------------------- |
| `id`         | TEXT PK     | 非空，UUID 格式                        | -                          |
| `name`       | TEXT        | 匹配 `'E2E-aionrs-*'` 模式             | -                          |
| `type`       | TEXT        | 固定 `'aionrs'`                        | -                          |
| `model`      | TEXT        | 模型 ID（如 `'claude-opus-4-7'`）      | `AionrsManager.ts:108`     |
| `status`     | TEXT        | `'pending' \| 'running' \| 'finished'` | `AionrsManager.ts:524-526` |
| `extra`      | TEXT (JSON) | 见 §5.1.1 extra 字段                   | -                          |
| `created_at` | INTEGER     | 时间戳（ms）                           | -                          |
| `updated_at` | INTEGER     | ≥ created_at                           | -                          |

#### 5.1.1 extra 字段结构（JSON）

```json
{
  "workspace": "/tmp/e2e-chat-aionrs-...",
  "sessionMode": "default" | "auto_edit" | "yolo",
  "lastTokenUsage": {
    "totalTokens": 1234
  },
  "model": {
    "id": "anthropic",
    "useModel": "claude-opus-4-7",
    "name": "Anthropic",
    "baseUrl": "https://api.anthropic.com/v1",
    "platform": "claude",
    "...": "..."
  }
}
```

**源码追溯**:

- `sessionMode`: `AionrsManager.ts:740-747` — `saveSessionMode()`
- `lastTokenUsage`: `AionrsManager.ts:432-449` — `saveContextUsage()`
- `model`: `useGuidModelSelection.ts:119-120` — 持久化模型选择

---

### 5.2 messages 表验证

**关键字段** (`src/process/services/database/schema.ts:61-77`):

| 字段              | 类型        | 验证规则                                      | 源码追溯     |
| ----------------- | ----------- | --------------------------------------------- | ------------ |
| `id`              | TEXT PK     | 非空，UUID 格式                               | -            |
| `conversation_id` | TEXT FK     | 关联 conversations.id                         | -            |
| `msg_id`          | TEXT        | binary 流式 msg_id（AI 回复）或用户消息 ID    | -            |
| `type`            | TEXT        | `'text' \| 'tool_group' \| 'thinking' \| ...` | `chatLib.ts` |
| `content`         | TEXT (JSON) | 见 §5.2.1 content 字段                        | -            |
| `position`        | TEXT        | `'left' \| 'right' \| 'center' \| 'pop'`      | -            |
| `status`          | TEXT        | `'finish' \| 'pending' \| 'error' \| 'work'`  | -            |
| `created_at`      | INTEGER     | 时间戳（ms）                                  | -            |

#### 5.2.1 content 字段结构（JSON）

**用户消息（position='right'）**:

```json
{
  "content": "用户输入的消息文本",
  "attachedFiles": ["/tmp/.../test.txt"],
  "attachedDirs": ["/tmp/.../test-folder"]
}
```

**AI 文本回复（type='text', position='left'）**:

```json
{
  "content": "AI 回复的文本内容（增量拼接）"
}
```

**思考消息（type='thinking'）**:

```json
{
  "content": "<think> 标签或 thought 事件内容",
  "duration": 1234,
  "status": "thinking" | "done"
}
```

**工具调用（type='tool_group'）**:

```json
[
  {
    "callId": "tool_call_uuid",
    "name": "edit_file",
    "description": "Edit /tmp/.../test.txt",
    "status": "Confirming" | "Executing" | "Success" | "Error" | "Canceled",
    "resultDisplay": "...",
    "renderOutputAsMarkdown": false
  }
]
```

---

### 5.3 E2E 断言示例

```typescript
test('should verify DB records after conversation', async ({ page }) => {
  const conversationId = /* ... */;

  // 1. 验证 conversation 存在且类型正确
  const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
  expect(conv).toBeDefined();
  expect(conv.type).toBe('aionrs');
  expect(conv.status).toBe('finished');
  expect(conv.extra.sessionMode).toBe('default');

  // 2. 验证至少有 2 条消息（用户 + AI）
  const messages = await invokeBridge(page, 'db.query', {
    sql: 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    params: [conversationId]
  });
  expect(messages.length).toBeGreaterThanOrEqual(2);

  // 3. 验证用户消息
  const userMsg = messages[0];
  expect(userMsg.position).toBe('right');
  expect(userMsg.type).toBe('text');
  expect(JSON.parse(userMsg.content).content).toContain('Hello');

  // 4. 验证 AI 回复
  const aiMsg = messages.find(m => m.position === 'left' && m.type === 'text');
  expect(aiMsg).toBeDefined();
  expect(aiMsg.status).toBe('finish');
  expect(JSON.parse(aiMsg.content).content).toBeTruthy();
});
```

---

## 6. 可测试性评估

### 6.1 现有 data-testid 覆盖

**guid 页**（engineer 发现，之前误判）:

- ✅ **已有**: `data-agent-pill="true"`, `data-agent-backend="aionrs"`, `data-agent-selected`
- 位置: `src/renderer/pages/guid/components/AgentPillBar.tsx:79-82`

**对话页**:

- ❌ **0 个** testid（需补充）

---

### 6.2 需新增 data-testid 清单

#### P0 优先级（阻塞测试，必须添加）

```tsx
// src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx
<div data-testid="aionrs-sendbox">
  {/* SendBox 根元素 */}
</div>

// src/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector.tsx
<Button data-testid="aionrs-model-selector">
  {/* 模型选择器按钮 */}
</Button>

// src/renderer/components/agent/AgentModeSelector.tsx（通用组件）
<Button data-testid={`agent-mode-selector-${backend}`}>
  {/* backend='aionrs' 时 → data-testid="agent-mode-selector-aionrs" */}
</Button>

// src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx（file input）
<input
  type="file"
  data-testid="aionrs-file-upload-input"
  multiple
  style={{ display: 'none' }}
/>

// src/renderer/pages/guid/components/GuidActionRow.tsx（文件夹关联按钮）
<Button
  data-testid="aionrs-attach-folder-btn"
  onClick={() => ipcBridge.dialog.showOpen({ properties: ['openDirectory'] })}
>
  {/* 关联文件夹按钮（仅桌面端） */}
</Button>
```

#### P1 优先级（提升稳定性，推荐添加）

```tsx
// 发送按钮
<Button data-testid="aionrs-send-btn" />

// 文件预览卡片
<FilePreview key={path} data-testid={`aionrs-file-preview-${idx}`} />

// 文件夹 Tag
<Tag key={item.path} data-testid={`aionrs-folder-tag-${idx}`} />

// 模型下拉菜单项
<Menu.Item key={modelId} data-testid={`aionrs-model-menu-item-${modelId}`} />

// 权限下拉菜单项
<Menu.Item key={mode} data-testid={`aionrs-mode-menu-item-${mode}`} />
```

---

### 6.3 E2E 操作路径示例

**场景**: 无附件 + 默认模型 + default 权限

```typescript
test('should complete aionrs conversation with no attachments', async ({ page }) => {
  // 1. 导航到 guid 页
  await page.goto('/#/guid');

  // 2. 选择 aionrs agent
  await page.click('[data-agent-backend="aionrs"][data-agent-selected="false"]');

  // 3. 输入消息（通过 Playwright locator）
  const textarea = page.locator('textarea[placeholder*="aionrs"]');
  await textarea.fill('Hello, aionrs!');

  // 4. 点击发送按钮
  await page.click('.send-button-custom'); // 或 [data-testid="aionrs-send-btn"]

  // 5. 等待导航到对话页
  await page.waitForURL(/\/conversation\/aionrs\/.+/, { timeout: 10000 });

  // 6. 提取 conversationId
  const url = page.url();
  const conversationId = url.match(/\/conversation\/aionrs\/(.+)/)?.[1];
  expect(conversationId).toBeTruthy();

  // 7. 等待 AI 回复（轮询 DB）
  await waitForAIResponse(page, conversationId, { timeout: 60000 });

  // 8. 验证 DB 记录
  const messages = await invokeBridge(page, 'db.query', {
    sql: 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at',
    params: [conversationId],
  });
  expect(messages.length).toBeGreaterThanOrEqual(2);
  expect(messages[0].position).toBe('right'); // 用户消息
  expect(messages[1].position).toBe('left'); // AI 回复
});
```

---

## 7. 边界与异常场景

### 7.1 Binary 层异常

| 场景            | 预期行为                                | 源码追溯                   |
| --------------- | --------------------------------------- | -------------------------- |
| binary 不存在   | `test.skip()` + 明确错误信息            | `binaryResolver.ts`        |
| 启动超时（30s） | 抛出 `Error('aionrs ready timeout')`    | `index.ts:136-140`         |
| 进程崩溃        | 前端收到 `error` 事件，对话标记为 error | `AionrsManager.ts:297-298` |
| resume 失败     | 自动降级为新 session                    | `index.ts:143-154`         |

---

### 7.2 并发对话

**场景**: 同时打开 2 个 aionrs 对话，轮流发送消息

**预期**: 每个对话独立维护 binary 进程 + session（`AionrsManager` 实例独立）

**验证点**:

- DB 中有 2 条 `conversations` 记录（不同 `id`）
- 每个对话有各自的 `sessionId`（从 binary `ready` 事件获取）

---

### 7.3 超大文件上传

**场景**: 上传 >100MB 文件（或 >1000 个文件）

**预期**: 前端文件处理层（`FileService.processDroppedFiles()`）应限制大小/数量，显示错误提示

**验证点**:

- E2E 创建 100MB 测试文件，尝试上传
- 验证是否显示 `Message.error()` 提示

**已知约束**: 具体限制需查看 `FileService` 源码（暂未在本需求文档中追溯）

---

### 7.4 协议错误

**场景**: Binary 返回非法 JSON Lines（如 `{"type":"unknown"}`）

**预期**: 前端解析失败，记录错误日志，不崩溃

**源码追溯**: `src/process/agent/aionrs/index.ts:116-119` — `try-catch` 包裹 `JSON.parse()`

---

## 8. 待决策议题（team-lead 已决策）

### 议题 0: E2E 环境 provider 配置前置条件（新增）

**背景**: aionrs 使用用户配置的 provider 列表（非 ACP 探测），E2E 需依赖测试环境的 provider 配置

**前置条件**:

1. **至少 1 个非 Google Auth provider**（过滤 `gemini-with-google-auth`）
2. **该 provider 至少有 2 个可用 model**（用于档位 1 + 档位 2 切换测试）

**降级策略**（若条件不满足）:

- 若只有 1 个 model: 测试降级为"只验证当前 model，跳过切换场景"
- 若无可用 provider: `test.skip('No available providers for aionrs, skipping E2E tests')`

**动态 model 选择**（E2E setup 实现）:

```typescript
// tests/e2e/setup/aionrs.setup.ts
export async function getAionrsTestModels(page: Page): Promise<{
  defaultModel: { providerId: string; modelId: string } | null;
  switchModel: { providerId: string; modelId: string } | null;
}> {
  const providers = await invokeBridge(page, 'mode.getModelConfig');

  // 过滤 gemini-with-google-auth
  const availableProviders = providers.filter(
    (p) => !p.platform?.toLowerCase().includes('gemini-with-google-auth') && p.enabled !== false
  );

  if (availableProviders.length === 0) return { defaultModel: null, switchModel: null };

  const firstProvider = availableProviders[0];
  const models = firstProvider.model || [];

  return {
    defaultModel: models.length > 0 ? { providerId: firstProvider.id, modelId: models[0] } : null,
    switchModel: models.length > 1 ? { providerId: firstProvider.id, modelId: models[1] } : null,
  };
}
```

**验证点**:

- E2E beforeAll 检查 `getAionrsTestModels()` 返回值
- 若 `defaultModel === null`: skip 全部测试
- 若 `switchModel === null`: skip 模型切换相关测试（TC-A-07）

---

### 议题 1: 模型切换是否需重启 binary？（P0，已决策）

**背景**: `AionrsAgent.setConfig(model)` 发送 `set_config` 命令，但 binary 能力未验证

**engineer 建议**: 用 **E2E 探测式测试** 记录当前行为，无需提前验证

```typescript
test('模型切换探测', async ({ page }) => {
  // 1. 发送消息 A（模型 M1）
  // 2. 切换模型到 M2
  // 3. 发送消息 B
  // 4. 查 DB：messages[B].extra.model === M2 ? '运行时切换生效' : '需重启'
});
```

**决策**: [待 team-lead 填写]

---

### 议题 2: 权限 "always allow" 是否需持久化？（P2，reviewer 已共识选 B）

**背景**: 当前存储在内存（`AionrsApprovalStore`），进程重启后失效

**reviewer 共识**: **保持内存存储**（B 选项），持久化属产品需求，非 E2E 阻塞项

**决策**: **B**（team-lead 采纳 reviewer 建议）

---

### 议题 3: 工具确认中途切换权限/模型的行为？（P1，待决策）

**背景**: 当前代码未显式处理（`AionrsManager.ts:253-296` confirm 逻辑独立）

**选项**:

- A) 切换权限时取消 pending 确认（analyst + designer 建议）
- B) 切换权限时保留 pending 确认（保持现状）
- C) 用 E2E 探测当前行为后再决定（engineer 建议）

**决策**: [待 team-lead 填写]

---

### 议题 4: CI 环境 binary 来源？（P0，reviewer 已共识选 C）

**reviewer 共识**: **短期 skip**（C 选项），长期 DevOps 配置

**实现方案**（若选 C）:

```typescript
// tests/e2e/setup/aionrs.setup.ts
export async function checkAionrsBinary(page: Page): Promise<boolean> {
  try {
    const binary = await invokeBridge(page, 'fs.findAionrsBinary');
    return binary !== null;
  } catch {
    return false;
  }
}

// tests/e2e/specs/chat-aionrs/*.spec.ts
test.beforeAll(async ({ page }) => {
  const hasBinary = await checkAionrsBinary(page);
  if (!hasBinary) {
    test.skip('aionrs binary not found in PATH or ~/.local/bin/aionrs, skipping E2E tests');
  }
});
```

**决策**: **C**（team-lead 采纳 reviewer 建议）

---

## 9. 交付文档清单

| 文档            | 路径                                              | 状态                        |
| --------------- | ------------------------------------------------- | --------------------------- |
| Gate 1 需求文档 | `tests/e2e/docs/chat-aionrs/requirements.zh.md`   | ✅ 完成（本文档）           |
| Gate 1 讨论记录 | `tests/e2e/docs/chat-aionrs/discussion-log.zh.md` | ✅ 完成（双 reviewer 审核） |
| Gate 2 测试用例 | `tests/e2e/docs/chat-aionrs/test-cases.zh.md`     | ⏳ 待 designer 起草         |
| Gate 3 实现映射 | `tests/e2e/docs/chat-aionrs/implementation.md`    | ⏳ 待 engineer 起草         |

---

## 10. 下一步（Gate 1 → Gate 2）

1. ✅ **Gate 1 完成**: analyst 起草需求 + designer/engineer 审核 + team-lead 决策
2. ⏳ **Gate 2 启动**: designer 起草 `test-cases.zh.md`（15 个用例，P0/P1/P2 分级）
3. ⏳ **前置工作**（阻塞 Gate 3）:
   - engineer 补充对话页 15+ data-testid（预估 1-2 小时）
   - engineer 实现 DB 清理 helper（预估 30 分钟）
4. ⏳ **Gate 3 实现**: engineer 实现 E2E 测试套件（预估 3-5 天）

---

---

## 修订记录

### v1.1 (2026-04-22)

**修订人**: chat-aionrs-analyst  
**触发原因**: 用户指出调研错误 — aionrs 模型来源非 ACP 探测

**修订内容**:

1. **§2 维度 C (模型)** — 纠正模型来源
   - ❌ 错误: "从 ACP 模型列表选择"
   - ✅ 正确: "从用户配置的 provider 列表选择（排除 gemini-with-google-auth）"
   - 来源: `ipcBridge.mode.getModelConfig.invoke()`（配置文件），非 `ipcBridge.acpConversation.getModelInfo`（动态探测）

2. **§8 议题 0（新增）** — E2E 环境 provider 配置前置条件
   - 至少 1 个非 Google Auth provider
   - 该 provider 至少有 2 个可用 model
   - 降级策略: 若只有 1 个 model，跳过切换测试；若无 provider，skip 全部测试
   - 动态 model 选择实现: `getAionrsTestModels()` helper

3. **源码追溯补充**:
   - `src/renderer/hooks/agent/useModelProviderList.ts:30` — `ipcBridge.mode.getModelConfig.invoke()`
   - `src/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection.ts:34-40` — 过滤 Google Auth

**影响范围**:

- Gate 2 用例设计: designer 需确认 TC-A-04（guid 页选模型）和 TC-A-07（对话中切换）的前置条件
- Gate 3 实现: engineer 需实现 `getAionrsTestModels()` helper（动态查询 provider 列表）

---

## 附录: 源码文件清单

| 文件                                                                          | 行号   | 关键功能                                                            |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| `src/renderer/pages/guid/GuidPage.tsx`                                        | 83-100 | providerAgentKey 状态（aionrs/gemini）                              |
| `src/renderer/pages/guid/components/AgentPillBar.tsx`                         | 79-82  | agent pill 渲染 + data-testid                                       |
| `src/renderer/pages/guid/components/GuidActionRow.tsx`                        | 67-330 | 文件附件 + 模式选择器 + 发送按钮                                    |
| `src/renderer/pages/guid/components/GuidModelSelector.tsx`                    | 35-100 | 模型选择器（guid 页）                                               |
| `src/renderer/hooks/agent/useModelProviderList.ts`                            | 30     | `ipcBridge.mode.getModelConfig.invoke()` — 用户配置的 provider 列表 |
| `src/renderer/pages/conversation/platforms/aionrs/AionrsChat.tsx`             | 19-57  | 对话页容器 + MessageList + SendBox                                  |
| `src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx`          | 88-459 | 发送框逻辑 + 文件附件 + 权限选择                                    |
| `src/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector.tsx`    | 19-135 | 模型选择器（对话页）                                                |
| `src/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection.ts` | 24-73  | 模型选择 hook（过滤 google auth）                                   |
| `src/renderer/pages/conversation/platforms/aionrs/useAionrsMessage.ts`        | 20-321 | 流式消息处理 + 工具状态                                             |
| `src/renderer/utils/model/agentModes.ts`                                      | 65-69  | aionrs 权限模式枚举                                                 |
| `src/process/task/AionrsManager.ts`                                           | 78-781 | 进程管理 + 权限审批 + DB 持久化                                     |
| `src/process/agent/aionrs/index.ts`                                           | 54-450 | binary 启动 + stdin/stdout 协议                                     |
| `src/process/agent/aionrs/binaryResolver.ts`                                  | —      | binary 路径解析逻辑                                                 |
| `src/process/services/database/schema.ts`                                     | 42-77  | conversations + messages 表结构                                     |
