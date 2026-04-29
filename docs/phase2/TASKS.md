# Phase 2：清理旧 Team 服务端代码

## 目标

删除所有 team 相关的旧 Electron main process 代码，确保编译通过且不影响其他业务。

---

## 任务清单

### Task 2.1: 迁移 teamEventBus 到 process/task/ 目录

- **描述**: 将 `src/process/team/teamEventBus.ts` 移动到 `src/process/task/teamEventBus.ts`（文件内容不变，仅换路径），然后更新所有 5 个 AgentManager 文件中的 import 路径。teamEventBus 是普通 EventEmitter，被 5 个 AgentManager 使用（均在 task/ 目录），与 team 业务逻辑无关，放在 task/ 比新建 common/ 目录更符合已有结构。
- **文件**:
  - `src/process/team/teamEventBus.ts` → 新建 `src/process/task/teamEventBus.ts`（内容照抄）
  - `src/process/task/AcpAgentManager.ts` L3：更新 import 为 `@process/task/teamEventBus`
  - `src/process/task/AionrsManager.ts` L9：更新 import 为 `@process/task/teamEventBus`
  - `src/process/task/NanoBotAgentManager.ts` L17：更新 import 为 `@process/task/teamEventBus`
  - `src/process/task/OpenClawAgentManager.ts` L9：更新 import 为 `@process/task/teamEventBus`
  - `src/process/task/RemoteAgentManager.ts` L9：更新 import 为 `@process/task/teamEventBus`
- **完成判据**: `grep -r "@process/team/teamEventBus" src/process/task/` 无结果；`bunx tsc --noEmit` 通过
- **预估时间**: 3 min
- **依赖**: 无
- **可并行**: 否（后续任务依赖此步骤完成）

---

### Task 2.2: 删除 teamBridge.ts，清理 bridge/index.ts

- **描述**: 删除 `src/process/bridge/teamBridge.ts`（整个文件是 team wiring，直接删）。然后修改 `src/process/bridge/index.ts`，移除：L8 的 `import type { TeamSessionService }`、L26 的 `import { initTeamBridge }`、L31 的 `teamSessionService: TeamSessionService` 字段、L52 的 `initTeamBridge(deps.teamSessionService)` 调用、L79 的 `initTeamBridge` 再导出、L84 的 `disposeAllTeamSessions` 再导出。
- **文件**:
  - `src/process/bridge/teamBridge.ts`：删除整个文件
  - `src/process/bridge/index.ts`：移除上述 6 处
- **完成判据**: `src/process/bridge/teamBridge.ts` 不存在；`grep "@process/team" src/process/bridge/index.ts` 无结果；`bunx tsc --noEmit` 通过
- **预估时间**: 3 min
- **依赖**: 无（与 2.1 并行，但 2.1 必须先完成才能跑 tsc 验证）
- **可并行**: 是（可与 2.3、2.4 同时开始）

---

### Task 2.3: 清理 initBridge.ts 中的 team 初始化

- **描述**: 修改 `src/process/utils/initBridge.ts`，移除：L12 的 `import { TeamSessionService, SqliteTeamRepository } from '@process/team'`、L13 的 `import { initTeamGuideService } from '@process/team/mcp/guide/teamGuideSingleton'`、L19-20 的 `teamRepo` 和 `teamSessionService` 实例化代码、L28-30 的 `initTeamGuideService()` 调用以及传入 bridge deps 中的 `teamSessionService` 字段。
- **文件**:
  - `src/process/utils/initBridge.ts`：移除 2 个 import + 约 5 行初始化代码
- **完成判据**: `grep "@process/team" src/process/utils/initBridge.ts` 无结果；文件正常编译
- **预估时间**: 2 min
- **依赖**: 无
- **可并行**: 是（可与 2.2、2.4 同时）

---

### Task 2.4: 清理 agent/acp/index.ts 中的 team guide MCP 注入

- **描述**: 修改 `src/process/agent/acp/index.ts`，移除 L42-44 的 3 个 team import（`getTeamGuideStdioConfig`、`shouldInjectTeamGuideMcp`、`waitForMcpReady`），并删除 `createAcpAgent()` 函数内 L~120-140 的 team guide MCP 条件注入块。
- **文件**:
  - `src/process/agent/acp/index.ts`：移除 3 个 import + 约 20 行条件代码
- **完成判据**: `grep "@process/team" src/process/agent/acp/index.ts` 无结果；编译通过
- **预估时间**: 3 min
- **依赖**: 无
- **可并行**: 是（可与 2.2、2.3 同时）

---

### Task 2.5: 清理 AcpAgentV2.ts 中的 team guide MCP 注入

- **描述**: 修改 `src/process/acp/compat/AcpAgentV2.ts`，移除 L23-25 的 3 个 team import（`getTeamGuideStdioConfig`、`waitForMcpReady`、`shouldInjectTeamGuideMcp`），并删除 `createAgent()` 内 ~L50-70 的 team guide MCP setup 块。
- **文件**:
  - `src/process/acp/compat/AcpAgentV2.ts`：移除 3 个 import + 约 20 行代码
- **完成判据**: `grep "@process/team" src/process/acp/compat/AcpAgentV2.ts` 无结果；编译通过
- **预估时间**: 3 min
- **依赖**: 无
- **可并行**: 是（可与 2.2、2.3、2.4 同时）

---

### Task 2.6: 清理 AcpAgentManager.ts、AcpRuntime.ts、agentUtils.ts 中的 team 引用

- **描述**:
  1. 修改 `src/process/task/AcpAgentManager.ts`：移除 L39 的 `shouldInjectTeamGuideMcp` import，删除 L910-926 附近的 team guide 条件注入块（`isInTeam` 判断 + `teamGuidePrompt`/`teamGuideAssistant` 动态 import 调用）。
  2. 修改 `src/process/acp/runtime/AcpRuntime.ts`：移除 L4、L21 的 2 个 team import，删除 team guide MCP setup 约 20 行。
  3. 修改 `src/process/task/agentUtils.ts`：移除 L7-8 的 2 个 team import（`getTeamGuidePrompt`、`resolveLeaderAssistantLabel`），删除使用它们的代码行。
- **文件**:
  - `src/process/task/AcpAgentManager.ts`：移除 1 个 import + team guide 注入块
  - `src/process/acp/runtime/AcpRuntime.ts`：移除 2 个 import + ~20 行
  - `src/process/task/agentUtils.ts`：移除 2 个 import + 相关调用
- **完成判据**: `grep "@process/team" src/process/task/AcpAgentManager.ts src/process/acp/runtime/AcpRuntime.ts src/process/task/agentUtils.ts` 无结果；编译通过
- **预估时间**: 5 min
- **依赖**: 无
- **可并行**: 是（可与 2.2、2.3、2.4、2.5 同时）

---

### Task 2.7: 删除 ipcBridge.ts 中的废弃 team 方法（前端组件改完之后）

- **描述**: 修改 `src/common/adapter/ipcBridge.ts`，删除 2 项（已无 renderer 引用的）：`team.mcpStatus` wsEmitter。保留剩余方法和事件不动。
  **注意**：`team.sendMessage`、`team.sendMessageToAgent`、`team.listChanged` 三项在 renderer 中仍有调用（`useTeamSession.ts`、`AcpSendBox.tsx`、`AionrsSendBox.tsx`、`useTeamList.ts`），必须等 Phase 3 renderer 组件全部完成迁移后才能在此处删除，否则编译失败。`sendMessage`/`sendMessageToAgent` 推迟至 Phase 6 Task 6-A 删除；`listChanged` 是后端保留事件，不删。
- **文件**:
  - `src/common/adapter/ipcBridge.ts`：仅删除 `team.mcpStatus`（约 1 行）
- **完成判据**: `team.mcpStatus` 在文件中消失；`bunx tsc --noEmit` 通过
- **预估时间**: 2 min
- **依赖**: 无
- **可并行**: 是

---

### Task 2.8: 删除 src/process/team/ 整个目录

- **描述**: 在所有外部引用清理完毕（2.1-2.7 全部完成）后，删除 `src/process/team/` 整个目录（27 个文件，~4,567 行）。
- **文件**:
  - `src/process/team/`：整个目录递归删除
- **完成判据**: `ls src/process/team/` 报错目录不存在；`bunx tsc --noEmit` 通过
- **预估时间**: 1 min
- **依赖**: blocked_by 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
- **可并行**: 否（必须最后执行）

---

### Task 2.9: 修改 scripts/build-mcp-servers.js

- **描述**: 修改 `scripts/build-mcp-servers.js`，删除 L40-49 中 teamMcpServer 和 teamGuideMcpServer 的 esbuild.build() 调用，改为只构建 imageGenServer（保留其他服务器构建不变）。
- **文件**:
  - `scripts/build-mcp-servers.js`：删除 2 个 esbuild.build() 调用（约 9 行）
- **完成判据**: 文件中不再有 "teamMcpServer" / "teamGuideMcpServer" 字符串；脚本语法正确（`node --check scripts/build-mcp-servers.js` 通过）
- **预估时间**: 2 min
- **依赖**: 无
- **可并行**: 是（可与任意任务并行，但逻辑上在 2.8 之后更有意义）

---

### Task 2.10: 清理 team 测试文件

- **描述**: 删除或迁移所有依赖 `src/process/team/` 的测试文件，确保 `bun run test` 不因已删除的 process/team 模块而报错。具体操作：
  1. 删除直接测试 process/team 业务逻辑的单元/集成测试（`tests/unit/team-*.test.ts`、`tests/integration/team-*.test.ts`、`tests/unit/process/team/`）——这些测试对象已随 team/ 目录一起删除。
  2. 删除 e2e 测试中依赖旧 team IPC 方法的测试文件（`tests/e2e/cases/teams/`、`tests/e2e/specs/team-*.e2e.ts`）——Phase 3 会随 renderer 迁移补写新的 e2e。
  3. 保留 renderer 层 team UI 测试（`tests/unit/renderer/team/`、`tests/unit/renderer/team-renderer.dom.test.tsx`、`tests/unit/renderer/components/layout/*.team-*.test.tsx`）——这些测试的对象（renderer 组件）在 Phase 2 中不删除。
  4. 保留 `tests/e2e/helpers/teamConfig.ts`、`tests/e2e/helpers/teamHelpers.ts`——Phase 3 e2e 可能复用。
- **文件**:
  - 删除：`tests/unit/team-*.test.ts`（约 12 个）、`tests/unit/team-*.dom.test.ts*`（2 个）、`tests/unit/teamGuideWhitelist.test.ts`、`tests/unit/teamMcpServerEvents.test.ts`、`tests/unit/teamModelUtils.test.ts`、`tests/unit/process/team/`（3 个）、`tests/integration/team-*.test.ts`（4 个）、`tests/e2e/cases/teams/`（16 个）、`tests/e2e/specs/team-*.e2e.ts`（3 个）
- **完成判据**: `bun run test` 不再出现因 `@process/team` 缺失导致的 import 错误
- **预估时间**: 5 min
- **依赖**: blocked_by 2.8（team/ 目录已删除后才需清理测试）
- **可并行**: 否（依赖 2.8）

---

### Task 2.11: 全量验证

- **描述**: 在所有修改完成后，执行完整编译和 lint 验证，确保 Phase 2 干净交付：`bunx tsc --noEmit`、`bun run lint:fix`、`bun run format`、`bun run test`、全局 grep 确认无残留 `@process/team` 引用。
- **文件**: 无修改，只验证
- **完成判据**:
  - `grep -r "@process/team" src/` 无结果
  - `bunx tsc --noEmit` 零错误
  - `bun run test` 通过
  - `bun run lint:fix && bun run format` 无新错误
- **预估时间**: 3 min
- **依赖**: blocked_by 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
- **可并行**: 否（最终验证步骤）

---

## 并行执行图

```
2.1 (teamEventBus 迁移至 task/)
     ↓ 完成后解锁后续验证
2.2 ──┐
2.3 ──┤  (可同时开始，互不依赖)
2.4 ──┤
2.5 ──┤
2.6 ──┤  (含 AcpAgentManager team guide 清理)
2.7 ──┤  (仅删 mcpStatus；sendMessage 等推迟到 Phase 3)
2.9 ──┘
     ↓ 全部完成
    2.8 (删除 team/ 目录)
     ↓
    2.10 (清理 team 测试文件)
     ↓
    2.11 (全量验证)
```

**注**: 2.2-2.7、2.9 可完全并行。2.1 没有外部依赖但建议先做，因为它为 2.8 铺路。2.10 删除测试文件必须在 2.8 之后（先删源码再删测试，避免测试引用不存在模块的错误提前暴露）。
