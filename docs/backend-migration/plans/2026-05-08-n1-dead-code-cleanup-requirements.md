# N1 前端死代码清理 - 需求文档

- **日期**:2026-05-08
- **里程碑**:N1(本次清理与测试重写链的首个里程碑)
- **上游**:`origin/feat/backend-migration`(共享分支,最新 SHA `e4cdff41f` 或更新)
- **对应总设计**:`2026-05-08-cleanup-and-test-rewrite-design.md` →
  UC-A / UC-B / UC-F / 文件清单(N1) / 关键事实 A-C / 附录 A-B
- **执行前必读**:
  - `2026-05-08-cleanup-teammate-cheatsheet.md`(teammate 硬约束,含 UC-F 5 条)
  - 本文档(requirements)

## 做什么

删除前端已被 adapter 完全走 HTTP/WS 且对应能力已在 `aionui-backend` 实现的
残留 bridge / service 文件。这些文件中的 `ipcBridge.xxx.provider(...)` 注册
在 adapter 的 `provider()` no-op 机制下**完全无效**(总设计"关键事实 A"),
属于纯死代码。

具体动作:

1. 删除以下 7 个文件(共 1748 行):
   - `packages/desktop/src/process/bridge/bedrockBridge.ts`(94 行)
   - `packages/desktop/src/process/bridge/previewHistoryBridge.ts`(30 行)
   - `packages/desktop/src/process/services/previewHistoryService.ts`(210 行)
   - `packages/desktop/src/process/bridge/pptPreviewBridge.ts`(331 行)
   - `packages/desktop/src/process/bridge/officeWatchBridge.ts`(331 行)
   - `packages/desktop/src/process/bridge/documentBridge.ts`(105 行)
   - `packages/desktop/src/process/services/conversionService.ts`(647 行)

2. 同步更新 `packages/desktop/src/process/bridge/index.ts`:
   - 移除 5 个 `init*Bridge` 的 `import`(对应 5 个已删文件的 init 函数)
   - 移除 `initAllBridges(deps)` 内对这 5 个 init 函数的调用
   - 移除 `export { ... }` re-export 段里的这 5 个 init 函数

   **具体要移除的 5 个 init 名**:
   - `initBedrockBridge`
   - `initPreviewHistoryBridge`
   - `initDocumentBridge`
   - `initPptPreviewBridge`
   - `initOfficeWatchBridge`

3. 检查并删除仅由以上文件引用的僵尸 import(例如 `@office-ai/aioncli-core`
   的 `BedrockContentGenerator` 动态 import 仅在 `bedrockBridge.ts` 用 —— 本
   里程碑**不动 `package.json` 依赖**,只确认源码里 grep 干净;如有跨文件引用
   残留就一起清掉)

## 不做什么(边界)

- ❌ **不动** `packages/desktop/src/process/utils/previewUtils.ts`(UC-B 保留:
  仍被 `task/AcpAgentManager.ts:25` 的 `handlePreviewOpenEvent` 使用)
- ❌ **不动** `packages/desktop/src/process/services/ccSwitchModelSource.ts`
  (UC-B 保留:仍被 `agent/acp/*` 和 `acp/compat/AcpAgentV2.ts` 使用)
- ❌ **不动** `packages/desktop/src/process/bridge/systemSettingsBridge.ts`
  (UC-B 保留:Electron-only 能力聚合)
- ❌ **不动** `packages/desktop/src/process/utils/migrateAssistants.ts` 与
  `runBackendMigrations.ts`(UC-B 保留:老用户首启 bootstrap)
- ❌ **不删 `package.json` 的依赖项**(即使某个依赖的最后一个引用被删除,
  本次仅做代码清理;依赖清理另立 follow-up)
- ❌ **不动测试文件**(测试清理在 N2)
- ❌ **不动 `vitest.config.ts`**(配置调整不在本里程碑范围)
- ❌ **不动 `packages/desktop/src/common/adapter/ipcBridge.ts`**(adapter 是
  HTTP/WS 事实源,本里程碑不改 adapter)
- ❌ **不动** team / acp / conversation / mcp / shell / pet / agent / task /
  worker / webui / auth / remoteAgent / workspaceSnapshot 等 UC-A 明确排除
  的领域
- ❌ **不顺手清理"看起来也没用"的文件**(例如 `webuiQR.ts` 的测试 —— 测试在 N2)
- ❌ **不合回共享分支,不建 PR**

## 已定决策

| 决策点                                                                                                                                              | 结论                                                                                              | 理由                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 7 个文件一次性删还是拆 commit                                                                                                                       | **拆 commit**:按"bridge 层"和"service 层"各 1 commit,清理 index.ts 单独 1 commit,共约 3 个 commit | 便于 review;每个 commit 都能独立 `bunx tsc --noEmit` 绿                                                                                    |
| 删 `conversionService.ts`(647 行)时是否保留"通用转换接口"抽象                                                                                       | **否,整体删**                                                                                     | 它只被 documentBridge 用;backend `aionui-office::conversion` 已覆盖 word→md / excel→json / ppt→json;保留抽象只是形式主义的"万一以后用得上" |
| 是否在 `bridge/index.ts` 写过渡注释                                                                                                                 | **否**                                                                                            | M 系列的其它清理(如 aionrs)没写,保持一致;git blame 可追溯                                                                                  |
| 是否验证 renderer 端 `ipcBridge.pptPreview.*` / `wordPreview.*` / `excelPreview.*` / `bedrock.*` / `previewHistory.*` / `document.*` 调用能继续工作 | **是**                                                                                            | 手动启动 dev,实际打开一个 pptx / docx / xlsx 预览,确认 backend spawn 生效;测 test-connection 走 bedrock provider 创建流程                  |

## 验收标准

> **UC-F 硬约束提示**:handoff 必须贴每条命令的原始输出(头 10 行 + 尾 10 行 +
> 总行数 + 退出码),禁止"按经验通过"的转述。详见总设计 UC-F-1/3/5。

### 自动化门禁(agent 必须全部跑过)

```bash
# 1. 文件确实被删
test ! -f packages/desktop/src/process/bridge/bedrockBridge.ts
test ! -f packages/desktop/src/process/bridge/previewHistoryBridge.ts
test ! -f packages/desktop/src/process/services/previewHistoryService.ts
test ! -f packages/desktop/src/process/bridge/pptPreviewBridge.ts
test ! -f packages/desktop/src/process/bridge/officeWatchBridge.ts
test ! -f packages/desktop/src/process/bridge/documentBridge.ts
test ! -f packages/desktop/src/process/services/conversionService.ts
# 预期:全部 exit 0

# 2. 对应 init 函数的调用/import 已移除
grep -nE "initBedrockBridge|initPreviewHistoryBridge|initDocumentBridge|initPptPreviewBridge|initOfficeWatchBridge" packages/desktop/src/process/bridge/index.ts
# 预期:无输出

# 3. 没有残留的僵尸 import 指向已删文件
grep -rn "from '.*bedrockBridge\|from '.*previewHistoryBridge\|from '.*previewHistoryService\|from '.*pptPreviewBridge\|from '.*officeWatchBridge\|from '.*documentBridge\|from '.*conversionService" packages/desktop/src --include='*.ts' --include='*.tsx'
# 预期:无输出

# 4. 类型检查
bunx tsc --noEmit
# 预期:退出 0

# 5. Lint
bun run lint
# 预期:退出 0

# 6. prek(完整 CI 门禁)
prek run --from-ref origin/feat/backend-migration --to-ref HEAD
# 预期:全绿

# 7. dev 启动冒烟(15 秒自动退出脚本):
#    确保 Electron 主进程没有因 index.ts 的修改而 boot 失败
bun start &
PID=$!
sleep 15
kill $PID 2>/dev/null || true
# 预期:15 秒内无 crash,stdout/stderr 无 "Cannot find module" 相关报错

# 8. 打包冒烟
bun run build-mac:arm64
# 预期:退出 0;dmg 产出
```

### 功能回归(手动 + 可选 e2e)

- [ ] 启动 app,创建 **Claude(Bedrock)provider**,测试连接 → 成功(走
      `/api/bedrock/test-connection`)
- [ ] 打开一个 `.pptx` 文件预览 → backend spawn `officecli watch`,webview 能
      渲染
- [ ] 打开一个 `.docx` 文件预览 → 同上
- [ ] 打开一个 `.xlsx` 文件预览 → 同上
- [ ] 预览历史列表 / 保存 / 加载 → 正常(走 `/api/preview-history/*`)
- [ ] document convert(Word → Markdown / Excel → JSON / PPT → JSON):通过
      renderer 里调用的位置(`grep -rn 'ipcBridge.document.convert' packages/desktop/src/renderer`
      找到触发点)实际跑一次 → 有正确输出

若手动验证条件不具备,至少跑:

```bash
# 检查 adapter 对外导出没有破坏
bunx vitest run tests/e2e  # 本里程碑不新增 e2e,但已有 e2e 不能断
# 预期:已有 e2e 的 pass 率与 N1 基线前一致
```

### 产出摘要对比

- **文件数**:`git diff --stat origin/feat/backend-migration..HEAD` 应显示 **7 个文件被删除 + 1 个文件被修改(bridge/index.ts)**,总减少 ≈ 1750 行
- **类型错误数**:`bunx tsc --noEmit` 错误数 0(和基线一致)
- **dmg 体积**:与 N0 基线对比,减少 **几十 KB 到数 MB**(主要是移除 bridge 代码;officecli/bedrock/conversion 的依赖此次不清,体积变化不大)

## 关键风险

| 风险                                                                                                                             | 缓解                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| renderer 某处仍在调 `ipcBridge.pptPreview.*.provider(...)` 这种老形态(而不是 `.invoke()` / `.on()`)                              | plan-writer 先 grep `packages/desktop/src/renderer -rn 'provider\(' --include='*.ts' --include='*.tsx'` 确认无 provider 调用;有的话报给 team-lead                                       |
| `document.convert` 在 renderer 的调用点较零散,回归验证容易遗漏                                                                   | plan-writer 写 plan 时提供 grep 命令和明确的触发 UI 路径;必要时在 plan 附录列举完整调用点                                                                                               |
| `bedrockBridge.ts` 删除会影响 provider 管理页的"测试连接"按钮                                                                    | adapter 已路由到 `/api/bedrock/test-connection`,backend `aionui-system::bedrock_probe` 覆盖;手动验收会复现                                                                              |
| `officeWatchBridge.ts` / `pptPreviewBridge.ts` 的 spawn 动作移到 backend 后,开发机上的 `officecli --version` / PATH 查找逻辑消失 | backend 的 `watch_manager` + `DefaultProcessSpawner` 自带 officecli 查找(和原前端逻辑等价);在开发机上先 `which officecli` 确认可用,没有就先 `officecli --install`(按总设计"关键事实 B") |
| `bridge/index.ts` 的 re-export 段如果有外部 import(如 preload)                                                                   | grep `initBedrockBridge                                                                                                                                                                 | initPreviewHistoryBridge | initDocumentBridge | initPptPreviewBridge | initOfficeWatchBridge`在`packages/desktop/src/preload/`和`packages/desktop/src/renderer/` 中的引用,若有则保留对应 re-export 形式,但不导出函数(或改为 no-op 占位 + 文档说明)。**实测没有就直接删净** |
| 同团队其他 agent 并行动了 bridge 目录                                                                                            | push 前必须 `git fetch origin feat/backend-migration`,merge 最新基线再验证                                                                                                              |

## 依赖上游

- **`feat/backend-migration` 必须包含 M9 合入后的全部内容**:adapter 的 HTTP
  路由、backend 的 `aionui-office::watch_manager` 等都依赖 M 系列已完成
- **读总设计**:`2026-05-08-cleanup-and-test-rewrite-design.md`(UC-A / UC-B /
  附录 A / 附录 B)

## 分支与 handoff

- 上游分支:`origin/feat/backend-migration`
- 本里程碑分支:`feat/cleanup-and-test-rewrite`(此分支**同时**作为 N1 的工作
  分支和整条链的"起点分支",N2 从它拉起)
- handoff 位置:`docs/backend-migration/handoffs/N1-outcome.md`
- 完成后 push 前:必须 `git fetch origin feat/backend-migration && git merge origin/feat/backend-migration --no-ff -m "chore(n1): sync with feat/backend-migration"`

## 预计执行时间

2-4 小时:

- 删 7 文件 + 改 1 文件:30 分钟
- 自动化验证 + prek:30 分钟
- dev 启动 / 打开预览 / 打包冒烟:1-2 小时(主要是等 build-mac:arm64)
- 写 handoff + push:30 分钟

## Handoff 必填字段(执行者参考)

执行 N1 的 agent 完成后,必须在 `docs/backend-migration/handoffs/N1-outcome.md`
里填:

- 本里程碑分支名 + 最新 SHA
- 基于哪个 `origin/feat/backend-migration` SHA + merge commit SHA
- 实际删掉的文件清单 + 行数统计(应与本需求文档一致)
- **UC-F-3 grep 证据**:对 7 个待删文件每个文件的 basename 跑 grep,贴原始
  输出 + 每行标注(self-reference / consumer-also-deleted)
- **UC-F-1 命令输出**:以下 8 条命令各自的头 10 尾 10 + 总行数 + 退出码:
  - `bun run lint`
  - `bunx tsc --noEmit`
  - `bunx vitest run`(Step 1 初次)
  - `prek run --from-ref origin/feat/backend-migration --to-ref HEAD`(Step 1 初次)
  - `git merge origin/feat/backend-migration --no-ff -m "chore(n1): sync ..."`
  - `bun run lint`(Step 4 基线同步后复跑)
  - `bunx tsc --noEmit`(Step 4 复跑)
  - `bunx vitest run`(Step 4 复跑)
- 功能回归验证结论(哪些走通了 / 哪些未验证,**未验证的必须列出并给出后续
  计划**,不得留空或仅写"未手动验证")
- 若有偏离计划的改动,单列一节说明原因
- 若发现 UC-B 保留文件实际可以删(或本需求"可删"文件实际不能删),escalate
