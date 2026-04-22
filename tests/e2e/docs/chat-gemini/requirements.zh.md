# Gemini 对话全流程 E2E 测试需求文档

**版本**: 1.0  
**日期**: 2026-04-22  
**作者**: chat-gemini-analyst  
**审核者**: chat-gemini-designer, chat-gemini-engineer, team-lead

---

## 1. 功能概述

### 1.1 业务场景

本测试套件覆盖 **Gemini 对话全流程**，从 guid 首页选择 Gemini agent 开始，到发送消息、进入对话页、对话中切换配置、继续发消息的完整链路。

**核心流程**：

```
guid 首页
  ↓ 选择 Gemini agent (AgentPillBar)
  ↓ 配置：关联文件夹（可选）
  ↓ 配置：上传文件（可选）
  ↓ 配置：选择模型 (GuidModelSelector)
  ↓ 配置：选择权限 (AgentModeSelector)
  ↓ 输入消息并发送
  ↓
对话页 (GeminiChat)
  ↓ 等待 AI 回复完成
  ↓ 切换模型 (GeminiModelSelector)
  ↓ 切换权限 (AgentModeSelector)
  ↓ 继续发送消息
  ↓ 验证数据库持久化 (conversations + messages)
```

**代码位置**：

- guid 首页：`src/renderer/pages/guid/GuidPage.tsx` (41-753)
- 模型选择器：`src/renderer/pages/guid/components/GuidModelSelector.tsx` (35-337)
- 权限选择器：`src/renderer/components/agent/AgentModeSelector.tsx` (77-361)
- 文件夹选择：`src/renderer/pages/guid/components/GuidActionRow.tsx` (247-269)
- 文件上传：`src/renderer/pages/guid/components/GuidActionRow.tsx` (136-176)
- 对话页：`src/renderer/pages/conversation/platforms/gemini/GeminiChat.tsx` (21-71)
- 对话发送框：`src/renderer/pages/conversation/platforms/gemini/GeminiSendBox.tsx` (86-525)

---

## 2. 测试维度枚举

### 2.1 维度 A: 关联文件夹

| 档位       | 说明             | 触发方式                                                           | UI 元素                     |
| ---------- | ---------------- | ------------------------------------------------------------------ | --------------------------- |
| **不关联** | 不选择 workspace | 跳过文件夹选择                                                     | `GuidActionRow.tsx:247-269` |
| **关联**   | 关联一个临时目录 | 点击"指定工作区"按钮，选择 `/tmp/e2e-chat-gemini-<scenario>-<ts>/` | `<FolderOpen>` 按钮         |

**代码依据**：

- `GuidActionRow.tsx:247-269` 提供文件夹选择器（仅 Desktop 可见）
- `ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory', 'createDirectory'] })`

**验证方式**：

- 关联时：验证 `conversations.extra.workspace` 字段非空
- 不关联时：验证 `conversations.extra.workspace` 为空字符串或 undefined

---

### 2.2 维度 B: 上传文件

| 档位       | 说明              | 触发方式                                                                             | UI 元素                       |
| ---------- | ----------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| **不上传** | 不上传任何文件    | 跳过文件上传                                                                         | —                             |
| **上传**   | 上传 1 个测试文件 | 点击 `+` 按钮 → "Upload File" → 选择 `/tmp/e2e-chat-gemini-<scenario>-<ts>/test.txt` | `<Plus>` 按钮 + Dropdown 菜单 |

**代码依据**：

- `GuidActionRow.tsx:136-176` 文件上传菜单
- `ipcBridge.dialog.showOpen.invoke({ properties: ['openFile', 'multiSelections'] })`
- 支持的文件格式：`allSupportedExts` (GeminiSendBox.tsx:451)

**文件上传限制**（需从代码确认）：

- 格式限制：参考 `FileService.allSupportedExts`
- 数量上限：未明确限制（从代码看支持 `multiSelections`）
- 大小上限：需从 Gemini API 限制推断（暂未在代码中找到硬编码限制）

**验证方式**：

- 上传时：验证 guid 页面显示 `File(1)` 标签（GuidActionRow.tsx:226-232）
- 发送后：验证消息内容包含文件路径引用

---

### 2.3 维度 C: 模型列表

**数据源**：`src/common/utils/geminiModes.ts:36-66`

**选择策略**：从 3 个顶级模式 + 5 个手动子模式中选择 **2 档**（降低组合爆炸）：

| 档位       | 模型 ID          | 模型 Label        | 说明                                                | 代码位置               |
| ---------- | ---------------- | ----------------- | --------------------------------------------------- | ---------------------- |
| **档位 1** | `auto`           | `Auto (Gemini 3)` | 自动路由到 gemini-3.1-pro-preview 或 gemini-3-flash | `geminiModes.ts:41-45` |
| **档位 2** | `gemini-2.5-pro` | `gemini-2.5-pro`  | Manual 子模式，固定使用 gemini-2.5-pro              | `geminiModes.ts:60`    |

**完整模型清单**（从代码枚举）：

```typescript
// 顶级模式（GuidModelSelector 直接显示）
-auto - // Auto (Gemini 3)
  auto -
  gemini -
  2.5 - // Auto (Gemini 2.5)
  manual - // Manual（展开子菜单，不可直接选）
  // Manual 子模式（GuidModelSelector 二级菜单）
  gemini -
  3.1 -
  pro -
  preview -
  gemini -
  3 -
  flash -
  preview -
  gemini -
  2.5 -
  pro -
  gemini -
  2.5 -
  flash -
  gemini -
  2.5 -
  flash -
  lite;
```

**触发方式**：

- guid 页面：`GuidModelSelector` → Dropdown → 选择对应模型
- 对话页：`GeminiModelSelector` → Dropdown → 切换模型

**UI 元素**：

- guid: `<Brain>` 按钮 + `<Down>` 图标（GuidModelSelector.tsx:249-256）
- 对话页: SendBox 上方的 `<Brain>` 按钮（GeminiModelSelector.tsx:102-112）

**验证方式**：

- 验证 `conversations.model` 字段值匹配选中的模型 ID

---

### 2.4 维度 D: 权限列表

**数据源**：`src/renderer/utils/model/agentModes.ts:64`

**全档枚举**（3 档，全部覆盖）：

| 档位       | 权限值     | 权限 Label          | 说明                         | 代码位置           |
| ---------- | ---------- | ------------------- | ---------------------------- | ------------------ |
| **档位 1** | `default`  | `Default`           | 默认权限，需用户审批         | `agentModes.ts:61` |
| **档位 2** | `autoEdit` | `Auto-Accept Edits` | 自动批准文件编辑，命令需审批 | `agentModes.ts:62` |
| **档位 3** | `yolo`     | `YOLO`              | 自动批准所有操作             | `agentModes.ts:63` |

**触发方式**：

- guid 页面：`AgentModeSelector` → Dropdown → 选择对应权限
- 对话页：`AgentModeSelector` → Dropdown → 切换权限

**UI 元素**：

- guid: `<Shield>` 图标 + 权限文本 + `<Down>` 图标（GuidActionRow.tsx:277-287）
- 对话页: SendBox 内的 `<Shield>` 按钮（GeminiSendBox.tsx:458-468）

**权限持久化**：

- 通过 `ipcBridge.acpConversation.setMode.invoke({ conversationId, mode })` 设置（AgentModeSelector.tsx:217-220）
- 验证 `conversations.extra.mode` 或通过 `ipcBridge.acpConversation.getMode.invoke({ conversationId })` 查询

---

### 2.5 对话中切换

#### 2.5.1 对话中切换模型

**行为规范**：

- 切换时机：第一条消息发送后，进入对话页
- UI 位置：对话页 SendBox 上方的模型选择器（GeminiModelSelector.tsx）
- 持久化：立即生效，影响后续消息
- 历史消息：不受影响（保留原模型标识）

**测试场景**：

```
1. guid 页面选择模型 A（auto）发送消息 M1
2. 等待 AI 回复 R1
3. 对话页切换到模型 B（gemini-2.5-pro）
4. 发送消息 M2
5. 验证：
   - conversations.model 更新为模型 B
   - 消息 M2 由模型 B 处理
```

**代码依据**：

- `useGeminiModelSelection.ts:34-46` 处理模型切换
- 切换后调用 `onSelectModel(provider, modelName)` 回调

#### 2.5.2 对话中切换权限

**行为规范**：

- 切换时机：任意时刻（包括 AI 回复过程中）
- UI 位置：对话页 SendBox 内的权限选择器（AgentModeSelector.tsx）
- 持久化：通过 `ipcBridge.acpConversation.setMode.invoke()` 立即生效
- 历史消息：不受影响

**测试场景**：

```
1. guid 页面选择权限 P1（default）发送消息 M1
2. 等待 AI 回复 R1
3. 对话页切换到权限 P2（yolo）
4. 发送消息 M2
5. 验证：
   - ipcBridge.acpConversation.getMode 返回 P2
   - 后续操作按 P2 权限执行
```

**代码依据**：

- `AgentModeSelector.tsx:198-239` 处理权限切换
- 切换成功后显示 `Message.success('Mode switched')`（AgentModeSelector.tsx:225）

---

## 3. 数据模型与持久化

### 3.1 conversations 表字段

**表结构**：`src/process/services/database/schema.ts:43-57`

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,                -- 会话 UUID
  user_id TEXT NOT NULL,              -- 用户 ID
  name TEXT NOT NULL,                 -- 会话标题
  type TEXT NOT NULL,                 -- 'gemini'
  extra TEXT NOT NULL,                -- JSON: { workspace?, mode?, ... }
  model TEXT,                         -- 当前模型 ID (auto / gemini-2.5-pro / ...)
  status TEXT CHECK(status IN ('pending', 'running', 'finished')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

**验证字段**：

- `id`: 会话唯一 ID
- `name`: 会话标题（E2E 测试用例统一前缀 `E2E-`）
- `type`: 必须为 `'gemini'`
- `model`: 验证当前选择的模型 ID
- `extra`: JSON 对象，验证以下字段：
  - `extra.workspace`: 关联文件夹路径（可选）
  - `extra.mode`: 权限档位（default / autoEdit / yolo）（需确认字段名，可能存储在其他位置）

**读取方式**：

```typescript
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
```

---

### 3.2 messages 表字段

**表结构**：`src/process/services/database/schema.ts:61-76`

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,                -- 消息 UUID
  conversation_id TEXT NOT NULL,      -- 关联 conversation
  msg_id TEXT,                        -- 消息临时 ID
  type TEXT NOT NULL,                 -- 'text' / 'image' / ...
  content TEXT NOT NULL,              -- JSON: { content: string, ... }
  position TEXT CHECK(position IN ('left', 'right', 'center', 'pop')),
  status TEXT CHECK(status IN ('finish', 'pending', 'error', 'work')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
)
```

**验证字段**：

- `conversation_id`: 关联到 conversations.id
- `position`: `'right'` (用户消息) / `'left'` (AI 回复)
- `status`: `'finish'` (完成) / `'pending'` (等待) / `'error'` (失败)
- `content`: JSON 字符串，解析后验证 `content.content` 非空

**读取方式**：

```typescript
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});
```

**验证策略**：

- 验证消息数量：用户消息 + AI 回复至少各 1 条
- 验证消息顺序：按 `created_at` 升序
- 验证消息完整性：所有消息 `status === 'finish'`

---

## 4. 边界与异常

### 4.1 前置条件异常

| 场景             | 检测方式                                   | 处理策略                                                                                          |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **OAuth 缺失**   | 检查 `~/.gemini/oauth_creds.json` 是否存在 | `test.skip()` 并输出：`Skipped: Gemini OAuth credentials not found at ~/.gemini/oauth_creds.json` |
| **API key 缺失** | 检查模型列表 `providers.length === 0`      | 与 OAuth 缺失相同处理                                                                             |
| **模型不可用**   | 下拉菜单显示"No available models"          | `test.skip()` 并输出：`Skipped: No Gemini models available`                                       |

**代码依据**：

- OAuth 检测：`useGeminiModelSelection.ts:110` 的 `hasNoAuth` 判断
- 模型列表：`GuidModelSelector.tsx:112-129` 无模型时显示提示

---

### 4.2 运行时异常

| 场景             | 触发条件                        | 预期行为                                                       | 代码位置                    |
| ---------------- | ------------------------------- | -------------------------------------------------------------- | --------------------------- |
| **网络失败**     | Gemini API 调用超时             | 消息 `status` 变为 `'error'`，显示错误提示                     | `useGeminiMessage.ts:144`   |
| **配额耗尽**     | 超出 API 速率限制               | 触发 quota fallback 逻辑，尝试切换模型                         | `useGeminiQuotaFallback.ts` |
| **文件上传过大** | 文件大小超限（Gemini API 限制） | 上传失败，显示 `Message.error`                                 | `FileService.ts`            |
| **文件夹不存在** | 关联的文件夹被删除              | 发送消息时失败，显示错误提示                                   | —                           |
| **并发发送**     | 快速连续点击发送按钮            | 第二次点击进入队列（`useConversationCommandQueue.ts:328-333`） | `GeminiSendBox.tsx:340-349` |
| **中断重试**     | 对话中途关闭窗口/刷新           | 重新打开后消息状态保持，可继续发送                             | —                           |

**测试策略**：

- 正常流程优先验证（happy path）
- 异常流程作为单独的 `describe` 块（可选，视时间预算而定）

---

## 5. 测试数据清理契约

### 5.1 清理范围

**Database 级**：

```sql
DELETE FROM conversations WHERE name LIKE 'E2E-%';
DELETE FROM messages WHERE conversation_id IN (
  SELECT id FROM conversations WHERE name LIKE 'E2E-%'
);
```

**文件系统级**：

```bash
rm -rf /tmp/e2e-chat-gemini-*
```

**UI 状态级**：

- Modal/Drawer/Dropdown 残留：连续按 ESC 键 5 次
- 输入框残留：清空 SendBox 内容
- 文件附件残留：清空上传文件列表

**存储级**：

```javascript
await page.evaluate(() => {
  sessionStorage.clear();
  // localStorage 保留（用户配置不清理）
});
```

---

### 5.2 清理时机

**afterEach 必须执行**：

```typescript
afterEach(async ({ page }) => {
  // 1. 清理 UI 状态（ESC × 5）
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
  }

  // 2. 清理数据库（E2E-% conversations + messages）
  await invokeBridge(page, 'database.deleteConversationsByPattern', { pattern: 'E2E-%' });

  // 3. 清理临时文件
  await exec('rm -rf /tmp/e2e-chat-gemini-*');

  // 4. 清理 sessionStorage
  await page.evaluate(() => sessionStorage.clear());
});
```

**清理失败处理**：

- **不吞异常**：清理失败必须 `throw`，避免数据污染后续测试
- **日志记录**：清理失败时输出详细错误信息

**代码依据**：

- 清理契约参考：用户在 teammate-message 中明确要求
- 清理失败 throw 规则：符合 `.claude/skills/testing/SKILL.md` 测试标准

---

## 6. 可测试性评估

### 6.1 现有 data-testid 覆盖

**当前状态**：通过 grep 搜索 `data-testid`，发现覆盖严重不足。

**guid 页面**：

- ❌ Agent pill bar（选择 Gemini agent）
- ❌ 模型选择器（`<Brain>` 按钮 + Dropdown）
- ❌ 权限选择器（`<Shield>` 按钮 + Dropdown）
- ❌ 文件夹选择按钮（`<FolderOpen>` 按钮）
- ❌ 文件上传按钮（`<Plus>` 按钮 + Dropdown）
- ❌ 聊天输入框（textarea）
- ❌ 发送按钮（`<ArrowUp>` 按钮）

**对话页**：

- ❌ 模型切换器（SendBox 上方）
- ❌ 权限切换器（SendBox 内）
- ✅ `data-testid="mode-selector"` 存在于 AgentModeSelector（AgentModeSelector.tsx:288）
- ❌ 消息气泡（message list）
- ❌ 停止按钮（stop button）

---

### 6.2 建议新增 data-testid 清单

**优先级 P0（必需）**：

| 元素                 | 建议 testid                            | 文件位置                      | 用途                  |
| -------------------- | -------------------------------------- | ----------------------------- | --------------------- |
| Agent pill（Gemini） | `data-agent-backend="gemini"`          | `AgentPillBar.tsx:79-82`      | 点击选择 Gemini agent |
| guid 模型选择器按钮  | `data-testid="guid-model-selector"`    | `GuidModelSelector.tsx:249`   | 打开模型下拉菜单      |
| guid 权限选择器按钮  | `data-testid="guid-mode-selector"`     | `GuidActionRow.tsx:277`       | 打开权限下拉菜单      |
| 文件夹选择按钮       | `data-testid="workspace-selector-btn"` | `GuidActionRow.tsx:247`       | 点击选择文件夹        |
| 文件上传按钮         | `data-testid="file-upload-btn"`        | `GuidActionRow.tsx:216`       | 点击上传文件          |
| guid 输入框          | `data-testid="guid-input"`             | `GuidInputCard.tsx`           | 输入消息              |
| guid 发送按钮        | `data-testid="guid-send-btn"`          | `GuidActionRow.tsx:314`       | 点击发送              |
| 对话页模型选择器     | `data-testid="chat-model-selector"`    | `GeminiModelSelector.tsx:102` | 切换模型              |
| 对话页权限选择器     | `data-testid="chat-mode-selector"`     | `GeminiSendBox.tsx:458`       | 切换权限              |
| SendBox 输入框       | `data-testid="sendbox-input"`          | `SendBox.tsx`                 | 输入后续消息          |
| SendBox 发送按钮     | `data-testid="sendbox-send-btn"`       | `SendBox.tsx`                 | 发送消息              |

**优先级 P1（建议）**：

| 元素         | 建议 testid                       | 文件位置                    | 用途         |
| ------------ | --------------------------------- | --------------------------- | ------------ |
| 消息气泡     | `data-message-id="${msg.id}"`     | `MessageList.tsx`           | 验证消息显示 |
| 停止按钮     | `data-testid="stop-btn"`          | `ThoughtDisplay.tsx`        | 中断测试     |
| 模型下拉选项 | `data-model-value="${modelName}"` | `GuidModelSelector.tsx`     | 点击选择模型 |
| 权限下拉选项 | `data-mode-value="${mode.value}"` | `AgentModeSelector.tsx:257` | 点击选择权限 |

**注意**：`data-mode-value` 已存在于 AgentModeSelector.tsx:257，但需确认 guid 页面和对话页是否都生效。

---

### 6.3 Fallback 选择器策略

**当 data-testid 缺失时**，使用以下 fallback 策略（优先级降序）：

1. **ARIA 属性**：`aria-label`, `role`
2. **文本内容**：`text=Auto (Gemini 3)`, `text=Default`
3. **图标类型**：`<Brain>`, `<Shield>`, `<ArrowUp>`（通过 SVG path 或 icon-park class）
4. **CSS 类名**：`.sendbox-model-btn`, `.agent-mode-compact-pill`（最后选择，容易变化）

**示例**：

```typescript
// 优先使用 testid
const modelSelector = page.locator('[data-testid="guid-model-selector"]');

// Fallback 1: ARIA
const modelSelectorFallback = page.locator('[aria-label*="Model"]').first();

// Fallback 2: 文本内容
const modelOption = page.locator('text=Auto (Gemini 3)');

// Fallback 3: 图标 + 类名
const sendButton = page.locator('.send-button-custom').first();
```

---

## 7. 测试用例矩阵

### 7.1 组合维度计算

**基础维度**：

- 文件夹：2 档（关联 / 不关联）
- 文件：2 档（上传 / 不上传）
- 模型：2 档（auto / gemini-2.5-pro）
- 权限：3 档（default / autoEdit / yolo）

**完全组合**：2 × 2 × 2 × 3 = **24 个基础用例**

**对话中切换**：

- 切换模型：N 个基础用例的子集（选择部分用例添加切换步骤）
- 切换权限：N 个基础用例的子集

**实际策略**（降低数量）：

- **基础用例**：覆盖全排列（24 个）
- **切换测试**：选择 **代表性场景**（约 4-6 个），每个场景测试"模型切换"或"权限切换"

---

### 7.2 代表性场景示例

**场景 1: 最小配置 + 权限升级**

```
guid: 不关联文件夹 + 不上传文件 + auto + default
对话: 切换权限到 yolo
验证: 权限持久化
```

**场景 2: 最大配置 + 模型切换**

```
guid: 关联文件夹 + 上传文件 + auto + yolo
对话: 切换模型到 gemini-2.5-pro
验证: 模型持久化 + 文件夹关联保留
```

**场景 3: 中间配置 + 双重切换**

```
guid: 关联文件夹 + 不上传文件 + gemini-2.5-pro + autoEdit
对话: 先切换权限到 default，再切换模型到 auto
验证: 两次切换均生效
```

---

## 8. 验证策略

### 8.1 数据库断言

**原则**：由于 Gemini API 回复内容不可预测，**不验证 AI 回复的文本内容**，改为验证数据库状态。

**conversations 表验证**：

```typescript
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv).toBeDefined();
expect(conv.type).toBe('gemini');
expect(conv.model).toBe('gemini-2.5-pro'); // 当前模型
expect(conv.extra.workspace).toMatch(/\/tmp\/e2e-chat-gemini-/); // 文件夹关联
```

**messages 表验证**：

```typescript
const messages = await invokeBridge(page, 'database.getConversationMessages', {
  conversation_id: conversationId,
  page: 0,
  pageSize: 100,
});

// 验证消息数量（至少 1 个用户消息 + 1 个 AI 回复）
expect(messages.length).toBeGreaterThanOrEqual(2);

// 验证用户消息
const userMsg = messages.find((m) => m.position === 'right');
expect(userMsg).toBeDefined();
expect(userMsg.status).toBe('finish');

// 验证 AI 回复
const aiMsg = messages.find((m) => m.position === 'left');
expect(aiMsg).toBeDefined();
expect(aiMsg.status).toBe('finish');
expect(JSON.parse(aiMsg.content).content).not.toBe(''); // 回复非空
```

---

### 8.2 UI 状态验证

**辅助验证**（非强制）：

- 验证 URL 跳转：`expect(page.url()).toMatch(/#\/conversation\//)`
- 验证 SendBox 可见：`await expect(page.locator('[data-testid="sendbox-input"]')).toBeVisible()`
- 验证模型选择器文本：`await expect(modelSelector).toHaveText(/gemini-2.5-pro/)`

**注意**：UI 验证仅作为快速失败检查，最终断言依赖数据库。

---

## 9. 前置条件

### 9.1 环境准备

| 条件               | 检测方式                               | 必需性                                 |
| ------------------ | -------------------------------------- | -------------------------------------- |
| **Gemini OAuth**   | 检查 `~/.gemini/oauth_creds.json` 存在 | ✅ 必需                                |
| **Gemini API Key** | 检查 `providers.length > 0`            | ✅ 必需（与 OAuth 二选一）             |
| **Desktop 环境**   | 检查 `isElectronDesktop()` 返回 true   | ✅ 必需（文件夹选择器仅 Desktop 可用） |
| **临时目录可写**   | 检查 `/tmp` 可写                       | ✅ 必需                                |

**跳过逻辑**：

```typescript
test.beforeAll(async ({ page }) => {
  const hasAuth = await checkGeminiAuth(page);
  if (!hasAuth) {
    test.skip(true, 'Gemini OAuth or API key not configured');
  }
});
```

---

### 9.2 数据准备

**每个用例前**：

- 创建临时目录：`/tmp/e2e-chat-gemini-<scenario>-<timestamp>/`
- 创建测试文件：`/tmp/e2e-chat-gemini-<scenario>-<timestamp>/test.txt`（内容："This is a test file for E2E"）

**示例**：

```typescript
test.beforeEach(async () => {
  const timestamp = Date.now();
  const tempDir = `/tmp/e2e-chat-gemini-${test.info().title}-${timestamp}`;
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(`${tempDir}/test.txt`, 'This is a test file for E2E');
  return { tempDir };
});
```

---

## 10. 附录

### 10.1 关键代码位置索引

| 功能               | 文件                                                                          | 行号    | 说明                                                |
| ------------------ | ----------------------------------------------------------------------------- | ------- | --------------------------------------------------- |
| guid 主页面        | `src/renderer/pages/guid/GuidPage.tsx`                                        | 41-753  | 整体布局                                            |
| 模型选择器（guid） | `src/renderer/pages/guid/components/GuidModelSelector.tsx`                    | 35-337  | 模型下拉菜单                                        |
| 权限选择器         | `src/renderer/components/agent/AgentModeSelector.tsx`                         | 77-361  | 权限切换逻辑                                        |
| 文件夹选择         | `src/renderer/pages/guid/components/GuidActionRow.tsx`                        | 247-269 | 文件夹选择器                                        |
| 文件上传           | `src/renderer/pages/guid/components/GuidActionRow.tsx`                        | 136-176 | 文件上传菜单                                        |
| 发送逻辑           | `src/renderer/pages/guid/hooks/useGuidSend.ts`                                | -       | 发送消息 IPC 调用                                   |
| 对话页主组件       | `src/renderer/pages/conversation/platforms/gemini/GeminiChat.tsx`             | 21-71   | 对话页布局                                          |
| SendBox            | `src/renderer/pages/conversation/platforms/gemini/GeminiSendBox.tsx`          | 86-525  | 发送框 + 切换器                                     |
| 模型选择器（对话） | `src/renderer/pages/conversation/platforms/gemini/GeminiModelSelector.tsx`    | 15-218  | 对话页模型切换                                      |
| 模型管理 hook      | `src/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection.ts` | 22-67   | 模型状态管理                                        |
| 权限档位定义       | `src/renderer/utils/model/agentModes.ts`                                      | 42-86   | 所有 agent 的权限档位                               |
| Gemini 模型定义    | `src/common/utils/geminiModes.ts`                                             | 36-66   | Gemini 模型清单                                     |
| 数据库 schema      | `src/process/services/database/schema.ts`                                     | 43-76   | conversations + messages 表结构                     |
| IPC bridge 接口    | `src/common/ipc/ipcBridge.ts`                                                 | -       | conversation.get / database.getConversationMessages |

---

### 10.2 术语表

| 术语          | 说明                                            |
| ------------- | ----------------------------------------------- |
| **guid**      | 首页引导页面，选择 agent 并配置后发送第一条消息 |
| **对话页**    | 进入会话后的聊天页面，包含消息列表和 SendBox    |
| **mode**      | 权限档位（default / autoEdit / yolo）           |
| **model**     | 模型 ID（auto / gemini-2.5-pro / ...）          |
| **workspace** | 关联的文件夹路径                                |
| **provider**  | 模型提供商配置（包含 API key、base_url 等）     |
| **position**  | 消息位置（left: AI 回复 / right: 用户消息）     |
| **status**    | 消息状态（finish / pending / error / work）     |

---

## 11. 变更记录

| 版本 | 日期       | 作者                | 变更说明                       |
| ---- | ---------- | ------------------- | ------------------------------ |
| 1.0  | 2026-04-22 | chat-gemini-analyst | 初版，基于代码反推完成需求枚举 |

---

**文档完成，等待审核。**
