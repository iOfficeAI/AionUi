# Aion CLI (aionrs) E2E 测试 - 讨论记录

**项目**: AionUi E2E Coverage  
**子组**: chat-aionrs  
**日期**: 2026-04-22

---

## Gate 1: 需求分析阶段

### 2026-04-22 初稿完成

**参与人**: chat-aionrs-analyst

**完成内容**:

1. 分析 aionrs 源码（guid 入口、对话页、进程端、权限枚举、DB schema）
2. 起草 `requirements.zh.md` 初稿
3. 识别 8 个重大不确定性（模型切换、权限存储范围、binary 来源等）

**待办事项**:

- [x] chat-aionrs-designer 审核需求，补充测试用例设计建议
- [ ] chat-aionrs-engineer 审核需求，评估技术可行性
- [ ] team-lead 澄清 §8 重大不确定性

**已知约束**:

- aionrs **不支持 Google Auth**（`useAionrsModelSelection.ts:36-40` 过滤）
- 权限 "always allow" 当前仅内存存储（进程重启后失效）
- ~~guid 页和对话页均无 `data-testid`~~ **更正**（engineer 发现）：guid 页已有 `data-agent-backend` 等属性，对话页需新增 15+ testid

---

### 2026-04-22 designer 审核完成

**参与人**: chat-aionrs-designer

**审核结论**: ✅ **无重大阻塞问题，可进入 Gate 2**

**审核维度**:

1. ✅ **测试维度完整性** — 已覆盖关联文件夹/上传文件/模型/权限/对话中切换，建议补充多文件/多文件夹场景
2. ⚠️ **组合矩阵收敛** — 全排列 30+ 用例需收敛至 15 用例（P0 5 + P1 7 + P2 3），采用正交/配对覆盖
3. ⚠️ **异常路径补充** — 建议增加协议错误、空消息、进程清理验证
4. ✅ **DB 断言明确** — conversations + messages 字段清晰，建议补充流式消息/思考消息/工具调用断言
5. ✅ **清理契约可落地** — DB/FS/sessionStorage 清理方案合理，补充 binary 进程清理验证
6. ✅ **状态转换清晰** — 建议补充 Mermaid 状态图（Gate 2 用例设计参考）
7. ✅ **可测试性评估** — 新增 testid 建议合理，补充发送按钮/消息列表/附件卡片 testid

**关键建议**:

1. **维度补充**（Gate 2 用例设计）:
   - 关联文件夹 → 3 档（无/单/多）
   - 上传文件 → 3 档（无/单/多）
   - 对话中切换模型 → 增加"往返切换"（验证状态回滚）

2. **用例优先级**（控制真实 binary 调用成本）:
   - P0（必测）：无附件、单文件、单文件夹 + 默认模型 + default 权限
   - P1（常用）：多文件+多文件夹、切换模型、切换权限
   - P2（边界）：超大文件、并发对话、协议错误

3. **DB 断言补充**（Gate 3 实现参考）:

   ```sql
   -- 验证流式消息完成
   SELECT status FROM messages WHERE conversation_id = ? AND position = 'left' AND type = 'text';
   -- 期望: status = 'finish'

   -- 验证思考消息
   SELECT json_extract(content, '$.duration') FROM messages WHERE type = 'thinking';
   -- 期望: 正整数（ms）

   -- 验证权限模式持久化
   SELECT json_extract(extra, '$.sessionMode') FROM conversations WHERE id = ?;
   -- 期望: 'default' | 'auto_edit' | 'yolo'
   ```

4. **清理顺序**（避免外键冲突）:

   ```typescript
   // 1. 停止 binary 进程
   await ipcBridge.conversation.stopAgent.invoke(conversationId);

   // 2. 清理 DB（级联删除 messages）
   await db.exec("DELETE FROM conversations WHERE name LIKE 'E2E-aionrs-%'");

   // 3. 清理 FS
   await fs.rm('/tmp/e2e-aionrs-*', { recursive: true });

   // 4. 清理 sessionStorage
   sessionStorage.clear();
   ```

**§8 不确定性建议**:

| 议题                                | designer 建议                        | 测试策略                                                                               |
| ----------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 1. 模型切换是否需重启 binary？      | 等 team-lead 验证能力                | A（运行时切换）验证 sessionId 不变；B（需重启）验证 sessionId 变化；C（不支持）UI 降级 |
| 2. 权限 "always allow" 是否持久化？ | 保持内存存储（B 选项）               | 验证单次对话内生效 + 重启应用后失效                                                    |
| 3. 工具确认中途切换权限/模型？      | 切换权限取消 pending 确认            | 用例：弹窗确认中 → 切换 yolo → 验证弹窗消失 + 自动批准                                 |
| 4. CI 环境 binary 来源？            | 跳过 CI E2E（C 选项） + 本地测试套件 | `test.beforeAll()` 检查 binary，不存在则 `test.skip('aionrs binary not found')`        |

**下一步**:

1. team-lead 优先澄清议题 1 和 4（1 工作日内）
2. designer 起草 `test-cases.zh.md`（预计 15 个用例，P0/P1/P2 分级）
3. engineer 同步 review 需求（技术可行性角度）

---

### 2026-04-22 engineer 审核完成

**参与人**: chat-aionrs-engineer

**审核结论**: ✅ **技术可行**，需求文档质量 ⭐⭐⭐⭐⭐ (5/5)

**关键发现**:

1. **guid 页 data-testid 已有**（之前误判为 0 个）
   - 现有属性: `data-agent-pill="true"`, `data-agent-backend="aionrs"`, `data-agent-selected`
   - 位置: `AgentPillBar.tsx:79-82`

2. **对话页需新增 15+ testid**（否则无法定位元素）
   - **P0 优先级**（阻塞测试）: 5 个
     ```tsx
     [data-testid="aionrs-sendbox"]
     [data-testid="aionrs-model-selector"]
     [data-testid="agent-mode-selector-aionrs"]
     [data-testid="aionrs-file-upload-input"]
     [data-testid="aionrs-attach-folder-btn"]
     ```
   - **P1 优先级**（提升稳定性）: 10 个
     - 发送按钮、文件预览、文件夹 Tag、模型/权限下拉项等

3. **DB 清理需补充 helper**
   - 文件位置: `tests/e2e/helpers/chatAionrs.ts`
   - 函数: `cleanupE2EAionrsConversations()`, `getAionrsMessages()` 等

4. **binary 已验证可用**
   - 版本: aionrs v0.1.12
   - 路径: `/Users/zhoukai/.local/bin/aionrs`

**技术建议**（对 §8 不确定性）:

| 议题                                | engineer 建议                            | 实现策略                                                                                  |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. 模型切换是否需重启 binary？      | 用 **E2E 探测式测试** 记录当前行为       | 发送消息 A（模型 M1）→ 切换到 M2 → 发送消息 B → 查 DB: `messages[B].extra.model === M2 ?` |
| 2. 权限 "always allow" 是否持久化？ | **内存存储不阻塞 E2E**，持久化属产品需求 | 同一对话内验证 "always allow" 生效即可                                                    |
| 3. 工具确认中途切换权限/模型？      | E2E 先 **记录当前行为**（截图+日志）     | 触发弹窗 → 切换模式 → 观察弹窗状态 → 提交 team-lead 决策                                  |
| 4. CI 环境 binary 来源？            | 短期 **CI skip**，长期 DevOps 配置       | `test.skip(() => resolveAionrsBinary() === null, 'aionrs binary not found')`              |

**工作量预估**:

- **Gate 2**（用例设计）: 8-12 核心用例 + 3-5 边界用例
- **Gate 3**（实现）: ~2000 行代码，**3-5 天**（假设 testid 已补充）

**前置工作**（阻塞 Gate 3）:

1. **补充对话页 15+ data-testid**（预估 1-2 小时）
2. **实现 DB 清理 helper**（预估 30 分钟）

**与 designer 建议的对比**:

| 维度                 | designer                               | engineer               | 综合结论                   |
| -------------------- | -------------------------------------- | ---------------------- | -------------------------- |
| 测试维度补充         | 关联文件夹/上传文件 → 3 档（无/单/多） | 同意                   | ✅ 采纳（Gate 2 体现）     |
| 用例数量控制         | 收敛至 15 用例（正交/配对）            | 8-12 核心 + 3-5 边界   | ✅ 一致（总计 11-17 用例） |
| 议题 2（权限持久化） | 保持内存存储（B 选项）                 | 内存存储不阻塞 E2E     | ✅ 一致                    |
| 议题 4（CI binary）  | 跳过 CI（C 选项）                      | 短期 skip，长期 DevOps | ✅ 一致                    |

**下一步**:

1. analyst 汇总两位 reviewer 意见，SendMessage 通知 team-lead
2. team-lead 澄清议题 1 和 3（1-2 工作日内）
3. designer 起草 `test-cases.zh.md`（Gate 2）

---

## 待讨论议题

### 议题 1: 模型切换是否需重启 binary？

**背景**: `AionrsAgent.setConfig(model)` 发送 `set_config` 命令，但 binary 能力未验证

**选项**:

- A) 支持运行时切换（E2E 验证切换后下次消息生效，sessionId 不变）
- B) 需重启 binary（E2E 验证切换后 sessionId 变化）
- C) 当前不支持（E2E 仅测试 guid 页选模型）

**决策**: [待 team-lead 填写]

---

### 议题 2: 权限 "always allow" 是否需持久化？

**背景**: 当前存储在 `AionrsApprovalStore`（内存），进程重启后失效

**选项**:

- A) 持久化到 DB（对齐 Gemini 行为）
- B) 保持内存存储（单次对话有效）

**engineer 评估**:

- **当前 E2E 可测性**: ✅ 可测（内存存储即可，同一对话内验证 "always allow" 生效）
- **持久化属产品需求**，非 E2E 阻塞项

**team-lead 决策**: **选 B 内存存储**

- **理由**: 跨对话持久化是产品决策，非 E2E 本轮范围
- **实施**: 只测同一对话内切换权限立即生效，不测跨对话 / 跨进程重启后的持久化

---

### 议题 3: 工具确认中途切换权限/模型的行为？

**背景**: 当前代码未显式处理

**analyst 建议**: 切换权限时取消 pending 确认，要求用户重新确认

**engineer 建议**: E2E 先 **记录当前行为**（不预设期望），提交 team-lead 决策

**team-lead 决策**: **本轮 E2E 不覆盖**

- **理由**: 代码未定义该行为，E2E 不应固化不确定行为
- **处理**: 记入 discussion-log 作为未来候选，待产品明确预期后再补测

---

### 议题 4: CI 环境 binary 来源？

**背景**: E2E 需依赖 aionrs binary

**选项**:

- A) CI 预装（需 DevOps 配置）
- B) 测试前动态下载（需提供 URL + 版本锁定）
- C) 跳过 aionrs E2E（标记 skip + 原因）

**engineer 建议**: 先实现 **local E2E**，CI 策略延后

- **短期**: CI 跳过 aionrs E2E（`test.skip(() => resolveAionrsBinary() === null, 'aionrs binary not found')`）
- **长期**: DevOps 配置预装 或 动态下载（需 team-lead 协调）

**team-lead 决策**: **选 C CI 跳过**（短期）

- **理由**: 长期 CI 策略延后，不阻塞本轮 E2E 交付
- **实施**: `test.skip(() => resolveAionrsBinary() === null, 'aionrs binary not found')`

**实现方案**:

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

## Gate 2: 用例设计阶段

### 2026-04-22 用例设计完成

**参与人**: chat-aionrs-designer

**完成内容**:

1. 基于 4 议题决策，产出 `test-cases.zh.md`（15 个用例）
2. 用例分级：P0 5 个（基线路径）+ P1 7 个（常规组合）+ P2 3 个（边界验证）
3. 每个用例包含：ID / 前置 / 维度组合 / 步骤 / DB 断言 / 清理义务 / 截图数

**关键设计决策**:

1. **权限命名统一**：使用 `auto_edit`（源码：`agentModes.ts:65-69`），避免与 Gemini 的 `autoEdit` 混淆
2. **模型选择回退**：TC-A-04 若 guid 页模型选择器未启用，改为对话页切换模型（见 TC-A-07）
3. **组合矩阵收敛**：原 30+ 用例 → 15 用例，优先覆盖单维度 + 代表性组合
4. **异常场景简化**：P2 用例只覆盖 binary 检查 + 大文件限制 + 不存在路径（并发对话延后）

**用例矩阵**:

| 优先级 | 关联文件夹 | 上传文件 | 模型        | 权限                   | 对话中操作    | 用例数 |
| ------ | ---------- | -------- | ----------- | ---------------------- | ------------- | ------ |
| P0     | 无/单      | 无/单    | 默认/第二个 | default/yolo           | 无            | 5      |
| P1     | 单/多      | 单/多    | 默认/第二个 | default/auto_edit/yolo | 切换模型/权限 | 7      |
| P2     | N/A/不存在 | 超大     | 默认        | default                | 无            | 3      |

**待办事项**:

- [ ] chat-aionrs-engineer review 用例设计，评估实现工作量
- [ ] team-lead 批准后进入 Gate 3（实现）

**已知约束**:

- 议题 1 决策：只验证 DB `extra.model` 更新，不验证 binary sessionId
- 议题 2 决策：只测同一对话内切换生效，不测跨对话持久化
- 议题 3 决策：不覆盖工具确认中途切换权限/模型的边界行为
- 议题 4 决策：本轮 local only，CI skip（用 `test.skip()` + binary 检查）

---

### 2026-04-22 engineer review Gate 2 test-cases

**参与人**: chat-aionrs-engineer

**审核结论**: ✅ **整体优秀**，需调整 4 处细节

**审核维度**:

1. **TC-A-04 备注（guid 页模型选择器启用条件）** — ⚠️ 需调整
2. **TC-A-05 断言（确认弹窗选择器）** — ⚠️ 需明确
3. **TC-A-08/TC-A-14 断言（取消状态/文件限制）** — ⚠️ 需验证代码
4. **TC-A-13 方案（环境变量注入）** — ⚠️ 需调整实现
5. **用例备注一致性** — ⚠️ 需补充

---

#### 1. TC-A-04 备注成立性

**问题**:
TC-A-04 备注称"若 guid 页模型选择器未启用（`isGeminiMode` 分支），改为 TC-A-07 对话页切换"。

**源码验证**（`GuidPage.tsx:467-469`）:

```typescript
const PROVIDER_BASED_AGENTS = new Set(['gemini', 'aionrs']);
const isGeminiMode =
  PROVIDER_BASED_AGENTS.has(effectiveAgentType) &&
  (!agentSelection.isPresetAgent || agentSelection.currentEffectiveAgentInfo.isAvailable);
```

**结论**: **备注不成立** — `isGeminiMode` 对 `aionrs` 默认为 **true**（`PROVIDER_BASED_AGENTS` 包含 aionrs）

**建议调整**:

- 删除 TC-A-04 备注："若 guid 页模型选择器未启用...改为 TC-A-07"
- 保留 TC-A-04 操作步骤 2："打开模型选择器（`GuidModelSelector`），选择第二个模型"
- 补充 TC-A-04 前置条件："验证 `isGeminiMode=true`（aionrs 默认启用）"

---

#### 2. TC-A-05 断言（确认弹窗选择器）

**问题**:
TC-A-05 第 328 行称："E2E 层：`page.waitForSelector('.confirmation-dialog', { timeout: 2000 })` 应超时（证明无弹窗）"

**源码验证**（`ConversationChatConfirm.tsx`）:

- 确认弹窗 **非** class `confirmation-dialog`
- 实际结构：`<div className="relative p-16px bg-dialog-fill-0 ...">`（动态生成，无稳定 class）
- 组件 **无** `data-testid`

**建议调整**:

- 方案 A（推荐）：补充 testid 到 `ConversationChatConfirm.tsx:216` → `<div data-testid="conversation-confirmation-dialog">`
- 方案 B（临时）：改用文本选择器 `page.locator('text=/Yes, Allow|Allow Once/')` 等待超时
- TC-A-05 断言改写：
  ```typescript
  // 验证无确认弹窗（yolo 模式自动批准）
  await expect(page.locator('[data-testid="conversation-confirmation-dialog"]')).not.toBeVisible({ timeout: 5000 });
  ```

---

#### 3. TC-A-08/TC-A-14 断言（取消状态/文件限制）

**TC-A-08 问题**（L498）:
断言称第一次工具调用被取消后 `tool_status = 'Canceled'`。

**源码验证**（`chatLib.ts:183`）:

```typescript
status: 'Executing' | 'Success' | 'Error' | 'Canceled' | 'Pending' | 'Confirming';
```

**结论**: ✅ **状态存在**，但需验证 **取消行为是否写入 DB**

- `AionrsManager.ts:766-772` 调用 `agent.denyTool(callId, reason)` 发送 `tool_deny` 命令
- `index.ts:272-286` 触发 `tool_cancelled` 事件 → `type: 'tool_group', status: 'Canceled'`
- **确认**: 取消状态 **会** 写入 DB（`addOrUpdateMessage` 调用链）

**建议**: ✅ **断言有效**，无需调整

---

**TC-A-14 问题**（L835）:
断言称"前端文件大小限制"，备注称"若前端未实现大小限制...此用例改为验证 binary 层错误处理"

**源码验证**（`FileService.ts:255-310`）:

```typescript
async processDroppedFiles(files: FileList, ...) {
  // L291-294: 捕获 FILE_TOO_LARGE 错误并 re-throw
  if (error.message === 'FILE_TOO_LARGE') {
    throw error;
  }
}
```

**发现**: **前端有大小限制机制**（WebUI 上传 via HTTP 时服务端检查，抛出 `FILE_TOO_LARGE`）

- Electron 模式：无前端限制，直接写文件到 workspace
- WebUI 模式：服务端限制（需查 HTTP API 配置）

**建议调整**:

- **TC-A-14 保留**（在 Electron 环境测试 binary 层错误处理）
- 修改操作步骤：不验证前端拦截，改为 **验证 binary/AI 返回错误提示**
- 修改预期行为：
  ```
  - 文件成功添加到 uploadFile 数组（前端不拦截）
  - 发送消息后，AI 回复包含 "file too large" 或 binary 层错误（timeout/OOM）
  ```
- 删除备注"若前端未实现大小限制..."（已确认前端 WebUI 有限制，Electron 无限制）

---

#### 4. TC-A-13 方案（环境变量注入）

**问题**（L757）:
操作步骤称"设置环境变量：`process.env.AION_CLI_PATH = '/dev/null'`"

**E2E 环境评估**:

- `process.env` 在 **Node.js 测试进程**中修改，但 **不影响已启动的 Electron 子进程**
- aionrs binary 解析在 **main process**（`binaryResolver.ts`），读取 `process.env.AION_CLI_PATH`

**建议调整**:

- 方案 A（推荐）：在 `test.beforeAll()` **启动 Electron 前** 设置环境变量
  ```typescript
  test.beforeAll(async () => {
    process.env.AION_CLI_PATH = '/dev/null';
    // Electron 启动会继承此环境变量
  });
  ```
- 方案 B（更复杂）：通过 `electronApp.evaluate()` 动态修改 main process 环境
  ```typescript
  await electronApp.evaluate(() => {
    process.env.AION_CLI_PATH = '/dev/null';
  });
  ```
- **TC-A-13 调整**：操作步骤改为"在测试启动前设置 `AION_CLI_PATH=/dev/null`（通过 `test.beforeAll` 或命令行 `AION_CLI_PATH=/dev/null npm run test:e2e`）"

---

#### 5. 用例备注一致性

**问题**:
TC-A-07 备注"根据议题 1 决策，不验证 binary 内部 sessionId"，但 TC-A-08/09（对话中切换权限）无类似备注。

**建议补充**（保持风格一致）:

- TC-A-08 补充备注："根据议题 3 决策，不覆盖工具确认中途切换权限的边界行为（只测取消 → 重新发送）"
- TC-A-09 补充备注："根据议题 2 决策，不验证 'always allow' 跨对话持久化，只测同一对话内切换生效"
- TC-A-13 补充备注："根据议题 4 决策，本轮 local only，CI 通过 skip 机制处理 binary 缺失"

---

### 审核总结

| 审核点          | 状态          | 调整建议                                                |
| --------------- | ------------- | ------------------------------------------------------- |
| 1. TC-A-04 备注 | ⚠️ 不成立     | 删除"改为 TC-A-07"备注，aionrs 默认启用模型选择器       |
| 2. TC-A-05 断言 | ⚠️ 选择器错误 | 补充 testid 到 ConversationChatConfirm 或改用文本选择器 |
| 3. TC-A-08 断言 | ✅ 有效       | 无需调整，`Canceled` 状态存在且写入 DB                  |
| 4. TC-A-14 断言 | ⚠️ 需调整     | Electron 无前端限制，改测 binary 层错误处理             |
| 5. TC-A-13 实现 | ⚠️ 需调整     | 环境变量在 `test.beforeAll` 设置（Electron 启动前）     |
| 6. 备注一致性   | ⚠️ 需补充     | TC-A-08/09/13 补充议题决策备注                          |

**下一步**:

- designer 根据审核意见调整 `test-cases.zh.md`（预计 30 分钟）
- engineer 补充 ConversationChatConfirm testid（前置工作，5 分钟）
- team-lead 批准后进入 Gate 3

---

## 后续记录

[Gate 3 讨论记录将追加在此]
