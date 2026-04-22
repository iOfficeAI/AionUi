# Gemini Chat E2E 实现映射

本文档记录 `test-cases.zh.md` 中定义的 15 个测试用例与实际 E2E 实现文件的对应关系。

**生成时间**：2026-04-22  
**实现目录**：`tests/e2e/features/conversation/gemini/`  
**文档版本**：test-cases.zh.md v1.0

---

## 统计概览

| 类别 | 文档定义 | 实际实现 | 状态 |
|------|---------|---------|------|
| P0 核心流程 | 5 | 5 | ✅ 100% |
| P1 功能验证 | 7 | 7 | ✅ 100% |
| P2 边界用例 | 3 | 3 | ✅ 100% |
| **总计** | **15** | **15** | ✅ 100% (15/15) |

**截图总数**：71 次 `takeScreenshot()` 调用  
**平均截图数/测试**：4.7 张

---

## P0 核心流程（5/5 实现）

| 用例 ID | 用例标题 | 实现文件 | 行号 | 测试函数名 | 截图数 |
|---------|---------|----------|------|-----------|--------|
| TC-G-01 | 最小可行路径 | tests/e2e/features/conversation/gemini/basic-flow.e2e.ts | 71 | `test('TC-G-01: Minimal viable path (no attachments, auto model, default mode)')` | 5 |
| TC-G-02 | 关联单个文件夹 | tests/e2e/features/conversation/gemini/basic-flow.e2e.ts | 167 | `test('TC-G-02: Associate single folder')` | 5 |
| TC-G-03 | 上传单个文件 | tests/e2e/features/conversation/gemini/basic-flow.e2e.ts | 256 | `test('TC-G-03: Upload single file')` | 5 |
| TC-G-04 | gemini-2.5-pro 模型 | tests/e2e/features/conversation/gemini/basic-flow.e2e.ts | 340 | `test('TC-G-04: Use gemini-2.5-pro model')` | 5 |
| TC-G-05 | yolo 权限 | tests/e2e/features/conversation/gemini/basic-flow.e2e.ts | 408 | `test('TC-G-05: Use yolo permission mode')` | 6 |

**小计**：5 个测试，26 张截图

---

## P1 功能验证（7/7 实现）

| 用例 ID | 用例标题 | 实现文件 | 行号 | 测试函数名 | 截图数 |
|---------|---------|----------|------|-----------|--------|
| TC-G-06 | autoEdit 权限 | tests/e2e/features/conversation/gemini/permission-modes.e2e.ts | 46 | `test('TC-G-06: AutoEdit permission mode (auto-approve file edits, commands need approval)')` | 6 |
| TC-G-07 | 切换模型 | tests/e2e/features/conversation/gemini/mid-conversation-switch.e2e.ts | 50 | `test('TC-G-07: Switch model during conversation (auto → gemini-2.5-pro)')` | 5 |
| TC-G-08 | 切换权限（default→autoEdit） | tests/e2e/features/conversation/gemini/mid-conversation-switch.e2e.ts | 127 | `test('TC-G-08: Switch permission during conversation (default → autoEdit)')` | 5 |
| TC-G-09 | 切换权限（autoEdit→yolo） | tests/e2e/features/conversation/gemini/mid-conversation-switch.e2e.ts | 207 | `test('TC-G-09: Switch permission during conversation (autoEdit → yolo)')` | 7 |
| TC-G-10 | 文件夹 + 文件组合 | tests/e2e/features/conversation/gemini/combo-scenarios.e2e.ts | 54 | `test('TC-G-10: Folder + file combination')` | 5 |
| TC-G-11 | 多文件上传 | tests/e2e/features/conversation/gemini/combo-scenarios.e2e.ts | 137 | `test('TC-G-11: Multiple files upload (2 files)')` | 4 |
| TC-G-12 | 完整组合 | tests/e2e/features/conversation/gemini/combo-scenarios.e2e.ts | 205 | `test('TC-G-12: Full combo (folder + multiple files + gemini-2.5-pro + yolo)')` | 8 |

**小计**：7 个测试，40 张截图

---

## P2 边界用例（3/3 实现）

| 用例 ID | 用例标题 | 实现文件 | 行号 | 测试函数名 | 截图数 |
|---------|---------|----------|------|-----------|--------|
| TC-G-13 | OAuth 未配置跳过 | tests/e2e/features/conversation/gemini/edge-cases.e2e.ts | 44 | `test('TC-G-13: OAuth not configured skip verification')` | 0 |
| TC-G-14 | 超大文件错误 | tests/e2e/features/conversation/gemini/edge-cases.e2e.ts | 64 | `test('TC-G-14: Large file upload error')` | 2 |
| TC-G-15 | 不存在文件夹路径 | tests/e2e/features/conversation/gemini/edge-cases.e2e.ts | 115 | `test('TC-G-15: Deleted folder path error')` | 2 |

**小计**：3 个测试，4 张截图（TC-G-13 无截图，按设计预期）

---

## 截图数统计分析

### 按优先级分组

| 优先级 | 测试数 | 总截图数 | 平均截图数 |
|--------|--------|---------|-----------|
| P0 | 5 | 26 | 5.2 |
| P1 | 7 | 40 | 5.7 |
| P2 | 3 | 4 | 1.3 |
| **总计** | **15** | **70** | **4.7** |

### 按文件分组

| 文件名 | 测试数 | 总截图数 |
|--------|--------|---------|
| basic-flow.e2e.ts | 5 | 26 |
| mid-conversation-switch.e2e.ts | 3 | 17 |
| combo-scenarios.e2e.ts | 3 | 17 |
| permission-modes.e2e.ts | 1 | 6 |
| edge-cases.e2e.ts | 3 | 4 |
| **总计** | **15** | **70** |

---

## 实现文件说明

### 核心流程测试 (basic-flow.e2e.ts, 26 screenshots)
包含 P0 主干功能的 5 个测试用例，覆盖：
- 最小可行路径（TC-G-01）：验证无附件、默认配置下的完整流程
- 文件夹关联（TC-G-02）：验证 Desktop 文件夹选择器（非 Desktop 跳过）
- 文件上传（TC-G-03）：验证单个文件上传流程
- 模型选择（TC-G-04）：验证 gemini-2.5-pro 模型使用
- 权限选择（TC-G-05）：验证 yolo 权限模式

### 权限模式测试 (permission-modes.e2e.ts, 6 screenshots)
包含 1 个权限相关测试用例，覆盖：
- autoEdit 权限（TC-G-06）：验证自动批准文件编辑的权限模式

### 对话中切换测试 (mid-conversation-switch.e2e.ts, 17 screenshots)
包含 3 个对话中动态切换测试用例，覆盖：
- 模型切换（TC-G-07）：从 auto 切换到 gemini-2.5-pro
- 权限升级（TC-G-08）：从 default 切换到 autoEdit
- 权限升级（TC-G-09）：从 autoEdit 切换到 yolo

### 组合场景测试 (combo-scenarios.e2e.ts, 17 screenshots)
包含 3 个复杂组合测试用例，覆盖：
- 文件夹 + 文件（TC-G-10）：验证同时关联文件夹和上传文件
- 多文件上传（TC-G-11）：验证上传 2 个文件
- 完整组合（TC-G-12）：文件夹 + 多文件 + gemini-2.5-pro + yolo

### 边界用例测试 (edge-cases.e2e.ts, 4 screenshots)
包含 3 个边界场景测试用例，覆盖：
- OAuth 跳过（TC-G-13）：验证无 OAuth 时测试正确跳过（无截图）
- 超大文件（TC-G-14）：验证 100MB 文件上传失败（2 张截图）
- 删除文件夹（TC-G-15）：验证关联已删除文件夹时错误提示（2 张截图）

---

## 测试质量指标

### 截图覆盖率
- **所有测试均含截图（除 TC-G-13）**：14/14 (100%)
- **符合"至少 3 张"规则**：12/14 (85.7%)
- **不符合规则的测试**：TC-G-14 (2 张), TC-G-15 (2 张) — 按设计文档，P2 边界用例允许 2 张截图

### 测试用例完整性
- **P0 核心功能覆盖**：5/5 (100%)
- **P1 功能验证覆盖**：7/7 (100%)
- **P2 边界用例覆盖**：3/3 (100%)

### 实现分布均衡性
- **最大文件（basic-flow.e2e.ts）**：5 个测试，33.3%
- **最小文件（permission-modes.e2e.ts）**：1 个测试，6.7%
- **平均每文件测试数**：3.0 个测试

---

## 数据库验证策略

所有测试（除 TC-G-13）使用以下 DB 断言：

### conversations 表
```typescript
const conv = await getGeminiConversationDB(page, conversationId);
expect(conv.type).toBe('gemini');
expect(conv.model).toBe('auto'); // 或 'gemini-2.5-pro'
expect(conv.status).toBe('finished');

// 验证 extra 字段
const extra = typeof conv.extra === 'string' ? JSON.parse(conv.extra) : conv.extra;
expect(extra.sessionMode).toBe('default'); // 或 'autoEdit', 'yolo'
expect(extra.workspace).toBe(workspacePath); // 或 undefined（无文件夹）
```

### messages 表
通过 `waitForGeminiReply()` helper 轮询验证：
- 等待 AI 回复完成（`position='left' AND status='finish'`）
- 超时时间：90s（Gemini API 比 aionrs 慢）

---

## 清理机制验证

所有测试文件在 `afterEach` 中执行清理：

1. **UI 状态清理**：ESC × 5 次
2. **数据库清理**：调用 `cleanupE2EGeminiConversations(page)`
   - 使用 `conversation.remove` 批量删除 `E2E-` 开头对话
   - 依赖 FK CASCADE 自动删除关联 messages
3. **sessionStorage 清理**：`page.evaluate(() => sessionStorage.clear())`
4. **临时文件清理**：各测试在 `finally` 块调用 `workspace.cleanup()`

**清理失败策略**：按需求文档，清理失败必须 throw（已在 helper 实现）

---

## 维护说明

### 更新触发条件
1. 新增测试用例到 `test-cases.zh.md`
2. 修改测试用例 ID 或标题
3. 调整测试用例优先级
4. 重构测试文件结构（拆分/合并文件）

### 更新流程
1. 运行命令重新统计截图数：
   ```bash
   grep -c "takeScreenshot" tests/e2e/features/conversation/gemini/*.e2e.ts
   ```
2. 更新统计概览中的数字
3. 更新对应的映射表行
4. 验证分组小计 = 总数
5. 提交变更并注明修改原因

---

**最后更新**：2026-04-22  
**维护者**：chat-gemini-engineer
