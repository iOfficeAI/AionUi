# Team E2E Specs

> 本文件是 ciwei（测试）和 laochui（开发）的共同规范。动手前必读。

---

## 一、先理解 Aion Team 是什么

**Aion Team 是一个由 leader 驱动的 AI 团队系统。用户不直接操作团队成员，用户只跟 leader 说话。**

**leader 本身也是一个 agent，类型可以是 claude、codex 或 gemini。** 不同 leader 类型的团队，调度能力各自独立。E2E 要覆盖三种 leader 类型，不是只测一种。

真实的用户操作场景：

| 用户想做什么          | 用户的实际操作                                             |
| --------------------- | ---------------------------------------------------------- |
| 招募一个 codex 工程师 | 在 leader 聊天框输入："Add a codex type member named Dev1" |
| 解雇某个成员          | 在 leader 聊天框输入："Fire the member named Dev1"         |
| 给成员派任务          | 在 leader 聊天框输入："Ask Dev1 to write unit tests"       |
| 团队内部通信          | leader 自行决定转发、广播或直接回复                        |

**UI 上没有"添加成员"按钮，没有"解雇"按钮。用户能操作的只有 leader 的聊天输入框。**

E2E 测试就是模拟这个真实用户：Playwright 打开 app，在 leader 聊天框输入自然语言，等 leader 推理并执行，验证 UI 是否正确响应。

---

## 二、核心链路

```
用户在 leader 聊天框输入自然语言
    → leader 理解意图
    → leader 调用对应 MCP 工具（spawn_agent / fire_agent 等）
    → 操作执行
    → UI 响应（新 tab 出现 / tab 消失 / 消息显示）
```

**E2E 验证的是这条完整链路，缺任何一环都不算验证。**

---

## 三、invokeBridge 的定位

invokeBridge 是测试工具，不是用户操作路径。真实用户根本不知道 invokeBridge 的存在。

**允许用于：**

| 场景                                  | 示例                                     |
| ------------------------------------- | ---------------------------------------- |
| **setup**：获取 teamId、读初始成员数  | `invokeBridge(page, 'team.list', ...)`   |
| **assertion**：验证后端状态与 UI 一致 | `invokeBridge(page, 'team.get', { id })` |

**禁止用于触发任何操作**——添加成员、解雇成员、发送消息等，必须且只能通过 leader 聊天输入框。如果你用 invokeBridge 触发了操作，你测的不是 Aion Team，你测的是一个普通的 RPC 接口。

---

## 四、laochui 的前置工作

**白名单唯一标准：`claude`、`codex`、`gemini`，前后端必须一致。**

### ✅ 任务1：白名单调整（已完成）

`src/common/types/teamTypes.ts` 中的 `TEAM_SUPPORTED_BACKENDS` 是单一来源。
`TeammateManager.ts` 和 `TeamMcpServer.ts` 均引用此常量，无需单独修改。

当前值：`new Set(['claude', 'codex', 'gemini'])`（codebuddy 已移出）

### 任务2：确认三种 leader 类型均可通过 MCP 添加成员（必做，结果告知 ciwei）

lifecycle test 会用三种不同 leader 类型的 team 各自通过自然语言添加成员。laochui 需要确认 claude / codex / gemini 三种 leader 调用 `spawn_agent` MCP 工具的路径均无阻断，有问题就修。**确认结果必须明确告知 ciwei，ciwei 收到"三种 leader 路径已通"才能开始写测试。**

---

## 五、文件结构规则

### ✅ 正确：一套测试，`for...of` 遍历 leader 类型（不同 team）

```ts
// team-agent-lifecycle.e2e.ts
const LEADER_CONFIGS = [
  { leaderType: 'claude', teamName: 'E2E Team (claude)' },
  { leaderType: 'codex', teamName: 'E2E Team (codex)' },
  { leaderType: 'gemini', teamName: 'E2E Team (gemini)' },
] as const;

for (const { leaderType, teamName } of LEADER_CONFIGS) {
  test(`team lifecycle: ${leaderType} leader`, async ({ page }) => {
    // 同一套逻辑，leaderType / teamName 从闭包捕获
  });
}
```

### ❌ 禁止：每种 agent 类型一个文件

```
team-claude.e2e.ts    ❌
team-codex.e2e.ts     ❌
team-gemini.e2e.ts    ❌
```

白名单新增类型时，只改 `LEADER_CONFIGS` 列表，不新建文件。

---

## 六、当前文件状态

| 文件                          | 职责                                             | 状态    |
| ----------------------------- | ------------------------------------------------ | ------- |
| `team-create.e2e.ts`          | UI 创建流程 + 按 leader 类型创建三个 team        | ✅ 完成 |
| `team-agent-lifecycle.e2e.ts` | 参数化完整链路（add + fire），按 leader 类型遍历 | ✅ 完成 |
| `team-whitelist.e2e.ts`       | UI 下拉框只显示白名单 agent                      | ✅ 完成 |
| `team-communication.e2e.ts`   | 用户消息发送链路验证                             | ✅ 完成 |

已删除的错误文件（invokeBridge 触发操作 / per-type 独立文件）：
`team-add-agent.e2e.ts`、`team-remove-agent.e2e.ts`、`team-multi-agent.e2e.ts`、`team-codebuddy.e2e.ts`

---

## 七、team-agent-lifecycle.e2e.ts 规格

### 前置条件

**lifecycle test 依赖三个 team 已存在。** 必须先跑 `team-create.e2e.ts`，它负责创建：

- `E2E Team (claude)`
- `E2E Team (codex)`
- `E2E Team (gemini)`

每个 test 开始时有 `expect(team).toBeTruthy()` 前置检查，team 不存在会立刻报错，不会静默通过。**不要在 lifecycle test 里自动创建 team**——那是 team-create.e2e.ts 的职责。

### 测试逻辑

用 `for...of` 而非 `test.each`，避免 Playwright 参数顺序歧义：

```ts
const LEADER_CONFIGS = [
  { leaderType: 'claude', teamName: 'E2E Team (claude)' },
  { leaderType: 'codex', teamName: 'E2E Team (codex)' },
  { leaderType: 'gemini', teamName: 'E2E Team (gemini)' },
] as const;

for (const { leaderType, teamName } of LEADER_CONFIGS) {
  test(`team lifecycle: ${leaderType} leader`, async ({ page }) => {
    // [setup] 找到对应 leader 类型的 team（invokeBridge 合法）
    const teams = await invokeBridge<Array<{ id: string; name: string; agents: unknown[] }>>(page, 'team.list', {
      userId: 'system_default_user',
    });
    const team = teams.find((t) => t.name === teamName);
    expect(team).toBeTruthy();
    const initialCount = team!.agents.length;

    // [setup] 导航到该 team 页面，等待 leader 输入框就绪
    await page.locator(`text=${teamName}`).first().click();
    await page.waitForURL(/\/team\//);
    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // [操作] 通过 leader 自然语言添加成员（名称加时间戳避免脏数据冲突）
    const memberName = `E2E-member-${Date.now()}`;
    await chatInput.fill(`Add a claude type member named ${memberName}`);
    await chatInput.press('Enter');

    // [断言] 等待 UI 出现新 tab（leader 推理 + MCP 调用，timeout 60s）
    await expect(page.locator(`text=${memberName}`).first()).toBeVisible({ timeout: 60000 });

    // [断言] invokeBridge 读状态确认（合法）
    const afterAdd = await invokeBridge<{ agents: unknown[] }>(page, 'team.get', { id: team!.id });
    expect(afterAdd.agents.length).toBe(initialCount + 1);

    // [操作] 通过 leader 自然语言解雇成员
    await chatInput.fill(`Fire the member named ${memberName}`);
    await chatInput.press('Enter');

    // [断言] 等待 tab 消失
    await expect(page.locator(`text=${memberName}`).first()).not.toBeVisible({ timeout: 60000 });

    // [断言] invokeBridge 读状态确认（合法）
    const afterFire = await invokeBridge<{ agents: unknown[] }>(page, 'team.get', { id: team!.id });
    expect(afterFire.agents.length).toBe(initialCount);
  });
}
```

### 关键设计说明

- **参数化是 leader 类型，不是成员类型**：每个 test 对应一个特定 leader 类型的 team，验证的是该 leader 的调度能力
- **用 `for...of` 不用 `test.each`**：Playwright 的 `test.each` 参数顺序与 Vitest 不同，容易写错，`for...of` 用闭包捕获更清晰
- **指令用英文**：避免 app 语言设置（中/英）影响 leader 理解，英文对 LLM 更稳定
- **memberName 加时间戳**：避免上次跑失败留下同名成员导致断言出错
- **initialCount 动态读取**：每个 test 开始时 invokeBridge 读取，不硬编码
- **timeout 60000ms**：leader 需 LLM 推理 + MCP 工具调用，响应时间长
- **等 chatInput 就绪再操作**：导航后需等 textarea 可见再 fill，否则可能打字到空白页

---

## 八、关键 UI 选择器

| 元素              | 选择器                                              |
| ----------------- | --------------------------------------------------- |
| 侧边栏 team 入口  | `page.locator('text=E2E Team (claude)').first()` 等 |
| leader 聊天输入框 | `page.locator('textarea').first()`                  |
| 发送              | `.press('Enter')`                                   |
| agent tab         | `page.locator('text=memberName').first()`           |
| team 页面 URL     | `/team/{id}`                                        |

---

## 九、运行方式

```bash
# 所有 team E2E（先跑 create，再跑 lifecycle）
E2E_PACKAGED=1 bun run test:e2e:team

# 仅创建三个 team（lifecycle 的前置条件）
E2E_PACKAGED=1 bun run test:e2e:team:create

# 仅 lifecycle 测试
E2E_PACKAGED=1 bun run test:e2e:team:lifecycle

# 仅白名单下拉框测试
E2E_PACKAGED=1 bun run test:e2e:team:whitelist

# 仅消息发送链路测试
E2E_PACKAGED=1 bun run test:e2e:team:comm

# 只测 gemini leader（TEAM_AGENT 过滤，支持逗号分隔多个）
TEAM_AGENT=gemini E2E_PACKAGED=1 bun run test:e2e:team:lifecycle

# 只测 claude + codex
TEAM_AGENT=claude,codex E2E_PACKAGED=1 bun run test:e2e:team

# 创建时也只创建 gemini team
TEAM_AGENT=gemini E2E_PACKAGED=1 bun run test:e2e:team:create
```

**环境变量说明：**

| 变量             | 默认值              | 说明                                                                                                                                                        |
| ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_PACKAGED=1` | 无（本地 dev 模式） | 使用 `out/` 下的打包产物启动 app                                                                                                                            |
| `E2E_DEV=1`      | 无                  | 强制使用 dev 模式（electron .）                                                                                                                             |
| `TEAM_AGENT`     | 空（三种全跑）      | leader 类型过滤，支持逗号分隔（`gemini` 或 `claude,codex`）。过滤在 `helpers/teamConfig.ts` 集中处理，所有 test 文件通过 `TEAM_SUPPORTED_BACKENDS` 自动生效 |

packaged 模式下 app 使用用户本地已配置的 API key，**不需要任何额外配置**。

**npm scripts 一览：**

| 命令                      | 说明                       |
| ------------------------- | -------------------------- |
| `test:e2e:team`           | 所有 `team-*.e2e.ts`       |
| `test:e2e:team:create`    | 仅 team 创建               |
| `test:e2e:team:lifecycle` | 仅 lifecycle（add + fire） |
| `test:e2e:team:whitelist` | 仅白名单下拉框             |
| `test:e2e:team:comm`      | 仅消息发送                 |

---

## 十、红线（违反即返工，无例外）

1. **用 invokeBridge 触发任何操作（add/remove/fire）** → 返工
2. **创建 `team-{agentType}.e2e.ts` 格式文件** → 返工
3. **测试或提及 codebuddy** → 返工
4. **方案未经郭总确认就动手写代码** → 返工
5. **laochui 和 ciwei 未互相对齐就分头执行** → 返工
6. **`TEAM_SUPPORTED_BACKENDS` 不是 `['claude', 'codex', 'gemini']`** → 不算完成
7. **lifecycle test 只创建一个 team / 只测一种 leader 类型** → 返工
