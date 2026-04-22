# Gemini E2E 测试讨论记录

## 2026-04-22 - Gate 1 需求审核（designer → analyst）

**审核人**: chat-gemini-designer  
**被审核文档**: `requirements.zh.md` v1.0（645 行）  
**审核维度**: 测试用例可设计性

---

### 1. 维度表格完备性

#### 1.1 现状评估

当前维度枚举：

- **文件夹**: 2 档（关联 / 不关联）✅
- **文件**: 2 档（上传 / 不上传）✅
- **模型**: 2 档（auto / gemini-2.5-pro）✅
- **权限**: 3 档（default / autoEdit / yolo）✅

完全组合：2 × 2 × 2 × 3 = **24 个基础用例**

**切换测试**（§7.2）：文档给出 3 个"代表性场景"示例，但未明确最终用例数量。

#### 1.2 问题识别

**问题 1: 用例数量收敛不明确**

文档 §7.1 提到"实际策略：基础用例覆盖全排列（24 个）+ 切换测试选择代表性场景（4-6 个）"，总数达到 **28-30 个**，远超 team-lead 建议的 **15 个最佳**（P0=5 + P1=7 + P2=3）。

**建议**：

- 明确用例总数目标 **≤ 15 个**
- 使用正交表/两因素配对法收敛基础用例（如 PICT 工具）
- 切换测试不应额外增加用例数，而是嵌入到基础用例中（如某个 P1 用例包含切换步骤）

**问题 2: 对话中切换的维度未量化**

文档 §2.5 描述了切换行为，但未明确：

- 切换模型是否覆盖所有模型组合（2×1 = 2 种切换路径：auto→gemini-2.5-pro / gemini-2.5-pro→auto）
- 切换权限是否覆盖所有权限组合（3×2 = 6 种切换路径：default↔autoEdit / default↔yolo / autoEdit↔yolo）

**建议**：

- 明确"对话中切换"的测试目标是验证**切换逻辑本身**（持久化 + UI 生效），而非覆盖所有排列
- 建议只测 **1 条模型切换用例**（如 auto → gemini-2.5-pro）+ **1 条权限切换用例**（如 default → yolo）
- 这 2 条切换用例可作为 P1 或 P2，嵌入到基础用例中

#### 1.3 修订建议

建议 analyst 补充以下内容（新增 §7.3）：

```markdown
### 7.3 用例收敛策略

**目标用例数**: ≤ 15 个（P0=5 + P1=7 + P2=3）

**收敛方法**: 两因素配对（Pairwise Testing）

- 工具: PICT / AllPairs
- 输入:
```

Folder: NoFolder, WithFolder
File: NoFile, WithFile
Model: Auto, Gemini25Pro
Permission: Default, AutoEdit, Yolo

```
- 输出: 约 9-12 个基础用例（覆盖所有两因素组合）

**切换测试嵌入**:
- 基础用例中挑选 **2 个** P1 用例：
- 1 个包含"模型切换"步骤（auto → gemini-2.5-pro）
- 1 个包含"权限切换"步骤（default → yolo）
- 切换验证点：数据库持久化（conversations.model / getMode() 返回值）

**最终分级** (示例分配，待 designer 最终确定):
- **P0 (5 个)**: 覆盖核心正向路径
- 最小配置（不关联+不上传+auto+default）
- 最大配置（关联+上传+gemini-2.5-pro+yolo）
- 中间配置（3 个，覆盖常用组合）
- **P1 (7 个)**: 覆盖边界组合 + 2 个切换用例
- **P2 (3 个)**: 覆盖低频组合

**弃用全排列**: 不再生成 24 个基础用例，避免维护成本过高。
```

---

### 2. DB 断言字段区分度

#### 2.1 现状评估

文档 §3.1 和 §8.1 描述了数据库验证策略：

- **conversations 表**: `type`, `model`, `extra.workspace`, `extra.mode`
- **messages 表**: `position`, `status`, `content`

#### 2.2 问题识别

**问题 3: `extra.mode` 字段存在性未确认**

文档 §3.1 标注了"需确认字段名，可能存储在其他位置"，但 §8.1 直接使用 `conv.extra.mode` 断言。

**代码核查**：

- `useGuidSend.ts:181` 创建会话时传入 `sessionMode: selectedMode`
- `buildAgentConversationParams()` 将 `sessionMode` 写入 `extra`（待验证）
- `AgentModeSelector.tsx:217-220` 通过 `ipcBridge.acpConversation.setMode.invoke()` 设置权限

**结论**：权限可能**不存储在 conversations.extra.mode**，而是通过独立 API 查询（`getMode()`）。

**建议**：

- 明确验证方式为 `await invokeBridge(page, 'acpConversation.getMode', { conversationId })` 而非直接读 `extra.mode`
- 更新 §3.1 和 §8.1 的示例代码

**问题 4: Gemini 权限字符串格式未明确**

team-lead 消息提到：

- Gemini 使用 `autoEdit`（驼峰）
- aionrs 使用 `auto_edit`（下划线）

文档 §2.4 表格中列出权限值为 `default / autoEdit / yolo`，但未明确这是**前端显示值**还是**存储值**。

**建议**：

- 在 §2.4 表格增加"存储值"列，明确区分前端 Label 和后端存储
- 示例：

| 档位   | 权限值（前端） | 权限值（存储） | 权限 Label        | 说明 |
| ------ | -------------- | -------------- | ----------------- | ---- |
| 档位 1 | `default`      | `default`      | Default           | ...  |
| 档位 2 | `autoEdit`     | `autoEdit`     | Auto-Accept Edits | ...  |
| 档位 3 | `yolo`         | `yolo`         | YOLO              | ...  |

**问题 5: 文件上传后的数据库字段未明确**

文档 §2.2 验证方式为"验证消息内容包含文件路径引用"，但未说明具体字段。

**代码核查**：

- `buildDisplayMessage()` 将文件列表嵌入到消息 `content`（`utils/file/messageFiles.ts`）
- messages 表的 `content` 字段存储 JSON，需解析后检查文件路径

**建议**：

- 补充 §8.1 示例代码，明确文件验证逻辑：
  ```typescript
  const userMsg = messages.find((m) => m.position === 'right');
  const content = JSON.parse(userMsg.content);
  expect(content.content).toContain('/tmp/e2e-chat-gemini-');
  expect(content.content).toContain('test.txt');
  ```

#### 2.3 修订建议

建议 analyst 补充以下内容（在 §3.1 末尾增加"字段验证方法"小节）：

````markdown
#### 3.1.1 字段验证方法

**权限字段验证**：

```typescript
// 方法 1: 通过 IPC 查询（推荐）
const mode = await invokeBridge(page, 'acpConversation.getMode', { conversationId });
expect(mode).toBe('autoEdit'); // 注意: Gemini 使用驼峰 (autoEdit)，aionrs 使用下划线 (auto_edit)

// 方法 2: 读取 conversations.extra（需确认字段名）
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
if (conv.extra.sessionMode) {
  expect(conv.extra.sessionMode).toBe('autoEdit');
}
```
````

**文件上传验证**：

```typescript
const userMsg = messages.find((m) => m.position === 'right');
const content = JSON.parse(userMsg.content);
// 验证消息内容包含文件路径（buildDisplayMessage 嵌入格式）
expect(content.content).toContain('/tmp/e2e-chat-gemini-');
expect(content.content).toContain('test.txt');
```

**文件夹关联验证**：

```typescript
const conv = await invokeBridge(page, 'conversation.get', { id: conversationId });
expect(conv.extra.workspace).toMatch(/^\/tmp\/e2e-chat-gemini-/);
```

````

---

### 3. 清理契约可执行性

#### 3.1 现状评估

文档 §5 描述了 4 级清理：
1. Database 级（SQL）
2. 文件系统级（`rm -rf`）
3. UI 状态级（ESC × 5）
4. 存储级（sessionStorage.clear）

#### 3.2 问题识别

**问题 6: Database 清理方法不存在**

文档 §5.2 使用 `invokeBridge(page, 'database.deleteConversationsByPattern', { pattern: 'E2E-%' })`，但该 IPC 方法可能**不存在**。

**代码核查**：
- `src/common/ipc/ipcBridge.ts` 中未找到 `deleteConversationsByPattern` 方法
- 现有方法：`conversation.delete`（删除单个会话）

**建议**：
- 方法 1（推荐）：**新增 IPC 方法** `database.deleteConversationsByPattern`（由 engineer 实现）
- 方法 2（Fallback）：通过 SQL 直接删除（需 engineer 确认是否有直接执行 SQL 的 IPC 接口）
  ```typescript
  await invokeBridge(page, 'database.executeSql', {
    sql: "DELETE FROM conversations WHERE name LIKE 'E2E-%'"
  });
````

- 方法 3（最简单）：在测试中记录创建的 `conversationId`，用 `conversation.delete` 逐个删除
  ```typescript
  afterEach(async ({ page }, testInfo) => {
    const conversationIds =
      testInfo.annotations.find((a) => a.type === 'conversationIds')?.description?.split(',') || [];
    for (const id of conversationIds) {
      await invokeBridge(page, 'conversation.delete', { id });
    }
  });
  ```

**问题 7: 清理失败必须 throw，但 ESC × 5 可能误杀**

文档 §5.2 要求"清理失败必须 throw"，但"ESC × 5"可能关闭用户自定义 Modal/Drawer，影响后续测试。

**建议**：

- ESC × 5 改为**仅在测试失败时执行**（通过 `test.info().status` 判断）
- 正常通过的测试不执行 ESC，避免副作用

**问题 8: 临时文件清理可能失败（权限、跨平台）**

`rm -rf /tmp/e2e-chat-gemini-*` 在 Windows 上不可用（`/tmp` 路径），且可能因文件占用而失败。

**建议**：

- 使用 Node.js `fs.rm()` 替代 shell 命令（跨平台）
- 增加重试逻辑（文件占用时延迟 100ms 重试 3 次）
- 示例：

  ```typescript
  import fs from 'fs/promises';
  import path from 'path';

  async function cleanupTempDirs() {
    const tmpRoot = process.platform === 'win32' ? process.env.TEMP : '/tmp';
    const dirs = await fs.readdir(tmpRoot);
    const targetDirs = dirs.filter((d) => d.startsWith('e2e-chat-gemini-'));

    for (const dir of targetDirs) {
      const fullPath = path.join(tmpRoot, dir);
      try {
        await fs.rm(fullPath, { recursive: true, force: true });
      } catch (error) {
        // 重试逻辑
        await new Promise((resolve) => setTimeout(resolve, 100));
        await fs.rm(fullPath, { recursive: true, force: true }); // throw if still fails
      }
    }
  }
  ```

#### 3.3 修订建议

建议 analyst 更新 §5.2 代码示例：

````markdown
### 5.2 清理时机

**afterEach 必须执行**：

```typescript
afterEach(async ({ page }, testInfo) => {
  try {
    // 1. 清理 UI 状态（仅在测试失败时执行，避免误杀）
    if (testInfo.status === 'failed') {
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Escape');
      }
    }

    // 2. 清理数据库（优先方案：通过记录的 ID 删除）
    const conversationIds =
      testInfo.annotations.find((a) => a.type === 'conversationIds')?.description?.split(',') || [];
    for (const id of conversationIds) {
      await invokeBridge(page, 'conversation.delete', { id });
    }

    // 3. 清理临时文件（跨平台 + 重试）
    await cleanupTempDirs(); // 见上文实现

    // 4. 清理 sessionStorage
    await page.evaluate(() => sessionStorage.clear());
  } catch (error) {
    // 清理失败必须 throw，避免污染后续测试
    throw new Error(`Cleanup failed: ${error.message}`);
  }
});
```
````

**conversationId 记录方式**：

```typescript
test('P0-01: 最小配置发送消息', async ({ page }) => {
  // ... 发送消息逻辑 ...
  const conversationId = await getConversationIdFromUrl(page);
  test.info().annotations.push({ type: 'conversationIds', description: conversationId });

  // ... 后续断言 ...
});
```

````

---

### 4. 遗漏的边界场景

#### 4.1 现状评估

文档 §4 列出了异常场景，§7.2 给出了代表性场景，但未覆盖以下边界：

#### 4.2 问题识别

**问题 9: 对话中切换的"并发"场景缺失**

文档 §2.5 描述了串行切换（先切模型，再切权限），但未覆盖：
- **并发切换**: 快速连续点击"模型切换"和"权限切换"（边界测试）
- **切换中断**: 模型切换 Dropdown 打开时，点击外部关闭

**建议**：
- 添加 1 个 P2 用例："并发切换压测"（快速切换模型 5 次 + 权限 5 次，验证最终状态正确）
- 添加 1 个 P2 用例："切换中断"（打开模型 Dropdown 但不选择，点击外部关闭，验证无状态污染）

**问题 10: 会话恢复场景缺失**

文档 §4.2 提到"中断重试"但未明确测试：
- 刷新页面后，对话状态是否保留（消息历史、模型、权限）
- 关闭应用后重新打开，会话列表是否正确

**建议**：
- 添加 1 个 P1 用例："会话恢复"
  - guid 发送消息 → 对话页切换模型 → 刷新页面 → 验证模型保持切换后的值
  - 验证点：`conversations.model` 和 URL 保持一致

**问题 11: 文件上传的"格式校验"缺失**

文档 §2.2 提到"支持的文件格式: allSupportedExts"，但未测试：
- 上传不支持的格式（如 `.exe`）是否提示错误
- 上传空文件（0 字节）是否允许

**建议**：
- 添加 1 个 P2 用例："上传非法文件"
  - 尝试上传 `.exe` 文件 → 验证提示 `Message.error` 或被拦截

**问题 12: 权限切换的"生效时机"未明确**

文档 §2.5.2 说明"立即生效"，但未测试：
- 在 AI 回复过程中切换权限，是否影响当前回复？
- 在工具确认（tool_group Confirming）过程中切换权限，是否影响确认行为？

**建议**：
- 明确文档：权限切换仅影响**下一条消息**，当前回复不受影响
- 添加 1 个 P1 用例（如果时间允许）："回复中切换权限"
  - 发送消息 M1 → 等待 AI 开始回复（出现 thought） → 切换权限到 yolo → 等待回复完成
  - 验证：M1 的回复按原权限执行，M2 按新权限执行

#### 4.3 修订建议

建议 analyst 在 §4 末尾增加 §4.3：

```markdown
### 4.3 遗漏边界场景补充

| 场景 | 优先级 | 验证点 | 是否纳入用例 |
|------|-------|--------|-------------|
| **并发切换压测** | P2 | 快速切换模型 5 次 + 权限 5 次，验证最终状态 | ✅ 纳入（1 个 P2） |
| **切换中断** | P2 | 打开 Dropdown 不选择，点击外部关闭，验证无污染 | ✅ 纳入（1 个 P2） |
| **会话恢复** | P1 | 刷新页面后模型/权限保持，消息历史不丢失 | ✅ 纳入（1 个 P1） |
| **上传非法文件** | P2 | 上传 `.exe` 文件，验证提示错误 | ✅ 纳入（1 个 P2） |
| **回复中切换权限** | P1 | 回复过程中切换权限，验证不影响当前回复 | 🔶 可选（时间允许） |
| **空文件上传** | P2 | 上传 0 字节文件，验证允许或拒绝 | 🔶 可选（低优先级） |
| **文件夹删除后发送** | P2 | 关联文件夹后删除，发送消息验证错误提示 | 🔶 可选（低优先级） |

**边界场景总数**: 4-7 个（根据最终用例数量调整）
````

---

### 5. §7.2 "代表性场景"评估

#### 5.1 现状评估

文档 §7.2 给出了 3 个代表性场景示例：

1. 最小配置 + 权限升级
2. 最大配置 + 模型切换
3. 中间配置 + 双重切换

#### 5.2 问题识别

**问题 13: 场景描述不够具体**

- "最小配置"和"最大配置"明确，但"中间配置"未定义（哪个维度取中间值？）
- "双重切换"需要明确顺序（先模型后权限 vs 先权限后模型）

**问题 14: 3 个场景不足以覆盖切换测试**

如果只从这 3 个场景中挑选切换测试：

- 场景 1: 权限切换（default → yolo）
- 场景 2: 模型切换（auto → gemini-2.5-pro）
- 场景 3: 双重切换（冗余）

缺少**反向切换**验证（如 yolo → default / gemini-2.5-pro → auto）。

**建议**：

- 明确"代表性场景"不是最终用例，而是**设计用例时的参考模板**
- 最终用例由 designer 在 Gate 2 通过正交表生成，§7.2 仅作为示例
- 补充反向切换说明：
  ```markdown
  **注意**: 切换测试应覆盖双向切换（如 auto ↔ gemini-2.5-pro），但不需要测试所有排列。
  建议选择 1 个正向（A→B）+ 1 个反向（B→A）即可。
  ```

#### 5.3 修订建议

建议 analyst 更新 §7.2：

```markdown
### 7.2 代表性场景示例（非最终用例）

以下场景仅作为设计用例时的**参考模板**，最终用例清单由 designer 在 Gate 2 通过正交表生成。

**场景 1: 最小配置 + 权限升级**
```

guid: 不关联 + 不上传 + auto + default
对话: 发送 M1 → 等待 R1 → 切换权限到 yolo → 发送 M2
验证: getMode() 返回 yolo，M2 按 yolo 执行

```

**场景 2: 最大配置 + 模型切换**
```

guid: 关联 + 上传 + gemini-2.5-pro + yolo
对话: 发送 M1 → 等待 R1 → 切换模型到 auto → 发送 M2
验证: conversations.model === 'auto'，workspace 保留

```

**场景 3: 中间配置 + 双重切换**
```

guid: 关联 + 不上传 + auto + autoEdit
对话: 发送 M1 → 切换权限到 default → 切换模型到 gemini-2.5-pro → 发送 M2
验证: 两次切换均生效，conversations.model === 'gemini-2.5-pro'，getMode() === 'default'

```

**场景 4: 反向切换验证**（补充）
```

guid: 不关联 + 上传 + gemini-2.5-pro + yolo
对话: 发送 M1 → 切换模型到 auto（反向）
验证: 反向切换持久化正确

```

**注意**:
- 切换测试应覆盖双向切换（如 auto ↔ gemini-2.5-pro），但不需要测试所有排列
- 建议最终用例包含 1 个正向切换 + 1 个反向切换即可
```

---

## 总结

### 审核通过条件（需 analyst 修订）

| 问题编号 | 问题分类                      | 严重程度  | 修订建议                                       |
| -------- | ----------------------------- | --------- | ---------------------------------------------- |
| 问题 1   | 用例数量收敛不明确            | 🔴 **高** | 补充 §7.3 收敛策略，目标 ≤ 15 个               |
| 问题 2   | 切换维度未量化                | 🔴 **高** | 明确切换用例数（2 个嵌入式，非独立）           |
| 问题 3   | `extra.mode` 字段存在性未确认 | 🟡 **中** | 更新 §3.1 和 §8.1，改用 `getMode()` API        |
| 问题 4   | 权限字符串格式未明确          | 🟡 **中** | 补充 §2.4 表格"存储值"列                       |
| 问题 5   | 文件上传数据库字段未明确      | 🟡 **中** | 补充 §3.1.1 文件验证代码示例                   |
| 问题 6   | Database 清理方法不存在       | 🔴 **高** | 更新 §5.2，使用 conversationId 记录 + 逐个删除 |
| 问题 7   | ESC × 5 可能误杀              | 🟢 **低** | ESC 仅在失败时执行                             |
| 问题 8   | 临时文件清理可能失败          | 🟡 **中** | 改用 Node.js `fs.rm()` + 重试逻辑              |
| 问题 9   | 并发切换场景缺失              | 🟡 **中** | 补充 §4.3 边界场景（4-7 个）                   |
| 问题 10  | 会话恢复场景缺失              | 🟡 **中** | 同上                                           |
| 问题 11  | 文件上传格式校验缺失          | 🟢 **低** | 同上                                           |
| 问题 12  | 权限切换生效时机未明确        | 🟢 **低** | 明确文档 + 可选用例                            |
| 问题 13  | "中间配置"定义不明确          | 🟢 **低** | 更新 §7.2 场景描述                             |
| 问题 14  | 反向切换缺失                  | 🟡 **中** | 补充场景 4 + 说明                              |

### 审核结论

**当前状态**: ❌ **需修订后通过**

**必修问题**（阻塞 Gate 2）：

- 问题 1: 用例数量收敛策略（🔴 高优）
- 问题 2: 切换用例嵌入方式（🔴 高优）
- 问题 6: 清理方法可执行性（🔴 高优）

**建议修订**（不阻塞，但影响用例质量）：

- 问题 3/4/5: DB 断言字段明确（🟡 中优）
- 问题 8/9/10: 边界场景补充（🟡 中优）

**可延后**：

- 问题 7/11/12/13/14: 细节优化（🟢 低优）

---

### 下一步行动

**analyst** 需完成以下修订（预计 30-60 分钟）：

1. 补充 §7.3 "用例收敛策略"（目标 ≤ 15 个，两因素配对法）
2. 更新 §5.2 "清理时机"（conversationId 记录方式）
3. 补充 §3.1.1 "字段验证方法"（权限 API + 文件上传验证）
4. 补充 §4.3 "遗漏边界场景补充"（4-7 个边界用例）
5. 更新 §7.2 "代表性场景示例"（补充反向切换）

**designer** 在 analyst 完成修订后：

- 重新审核修订内容（预计 10 分钟）
- 通过后进入 Gate 2，产出 `test-cases.zh.md`

---

**审核完成时间**: 2026-04-22  
**预计修订时间**: 30-60 分钟  
**下一关卡**: Gate 2（designer 设计测试用例）
