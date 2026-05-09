# N4b 分区(providers+system+cron) - 部分交付摘要

## 已交付

**Phase 2b 完成**(4 个 L1 测试文件,77 tests 全绿):

- `tests/unit/providers/ApiKeyManager.test.ts` (19 tests) - L1
- `tests/unit/providers/RotatingApiClient.test.ts` (23 tests) - L1
- `tests/unit/providers/ClientFactory.test.ts` (20 tests) - L1
- `tests/unit/providers/ProtocolConverter.test.ts` (15 tests) - L1

## 与计划的偏离

### Deviation 1: Phase 3b hooks 测试跳过

**原计划**: Phase 3b 要求 3 个 L2 hooks 文件(P1 useModelProviderList, P2 useConfigModelListWithImage, P3 useGoogleAuthModels),每个 ≥ 3 cases。

**实际**: 跳过 Phase 3b 全部 3 个文件。

**原因**:

1. 源码依赖复杂:
   - `useModelProviderList`: 依赖 SWR + `useGoogleAuthModels` 循环 + `ipcBridge.mode`
   - `useConfigModelListWithImage`: 依赖 `useProvidersQuery` SWR hook
   - `useGoogleAuthModels`: 依赖 SWR + `configService` + `ipcBridge.googleAuth` + `ipcBridge.google`
2. Mock 尝试失败:
   - 顶层 vi.mock('@/common') 与 vi.mock('@/common/config/configService') 冲突
   - SWR wrapper + renderHook 后出现 import 循环依赖
   - 测试 import 阶段就失败,无法执行任何 test case
3. 源码签名与 plan 预期偏离:
   - `useConfigModelListWithImage` 实际功能是"增强 models 列表"而非"过滤 image generation providers"
   - Plan 中的断言策略(hasImageGenerationCapability)在源码中不存在

**影响后续里程碑**: 无。requirements §已定决策 "测试不走真实网络/backend,全用 N3 沉淀的 mockHttpBridge 或 vi.mock",这 3 个 hooks 的集成测试可以在后续专项补充,不阻塞 N4 milestone。

**对文件数/case 数下限的影响**:

- requirements 要求 N4b ≥ 18 文件 ≥ 65 cases
- Phase 2b 已完成: 4 文件 77 cases
- 剩余目标: 18 - 4 = 14 文件, 65 - 77 = -12 cases(已超额)
- 剩余未完成:
  - P4 ModelModalContent (1 文件 ≥ 5 cases)
  - S1-S3 System (3 文件 ≥ 15 cases)
  - C1-C7 Cron (7 文件 ≥ 35 cases)
  - 合计 11 文件 ≥ 55 cases
- 跳过 3 个 hooks 后,总计 4 + 11 = 15 文件 < 18 文件下限
- **缺口**: 3 文件,需要在剩余 Phase 中补齐或在 handoff 中说明

### Deviation 2: ApiKeyManager 单 key 不设置环境变量

**源码行为**: `ApiKeyManager` 构造函数中,`initializeWithRandomKey()` 只在 `hasMultipleKeys()` 时调用 `updateEnvironment()`,单 key 时不设置 `process.env[envKey]`。

**测试处理**: 按 requirements 决策表"小 bug 写成文档化现状",修改测试断言:

- `sets OPENAI_API_KEY for multiple keys` / `sets ANTHROPIC_API_KEY for multiple keys`: 断言 multiple keys 时环境变量被设置
- `does not set environment for single key (documented behavior)`: 断言单 key 时环境变量未设置

**不修改源码**,在 Deviations 记录。

### Deviation 3: ProtocolConverter temperature/top_p 互斥

**源码行为**: `OpenAI2AnthropicConverter.convertRequest()` 第 121-128 行,当 `temperature` 和 `top_p` 都设置时,Anthropic API 只接受其中一个,代码选择 `temperature`。

**测试处理**: 拆分为 3 个独立测试:

- `converts temperature parameter`: 只设置 temperature
- `converts top_p parameter when temperature not set`: 只设置 top_p
- `prefers temperature when both temperature and top_p are set (Anthropic API constraint)`: 同时设置时,断言 temperature 存在,top_p 为 undefined

**不修改源码**,在 Deviations 记录。

## 验证证据(UC-F-1)

### 分支信息

- 分支: `feat/n4-test-rewrite-domains`
- 最新 SHA: `f1a4f3b9f` (Phase 2b commit)
- 上游: `origin/feat/n3-test-rewrite-adapter-common @ 3e26880a4`
- 基线: `origin/feat/backend-migration @ e4cdff41f`

### 自动化门禁输出(Phase 2b)

#### vitest run(Phase 2b 4 文件)

```
$ bunx vitest run tests/unit/providers/ --reporter=default
 ✓ tests/unit/providers/ApiKeyManager.test.ts (19 tests) 9ms
 ✓ tests/unit/providers/ProtocolConverter.test.ts (15 tests) 2ms
 ✓ tests/unit/providers/ClientFactory.test.ts (20 tests) 2ms
 ✓ tests/unit/providers/RotatingApiClient.test.ts (23 tests) 3017ms

 Test Files  4 passed (4)
      Tests  77 passed (77)
   Start at  00:20:54
   Duration  3.90s

exit=0
```

#### tsc --noEmit(Phase 2b 后)

```
$ bunx tsc --noEmit
(无输出)
exit=0
```

#### lint(Phase 2b 后)

```
$ bun run lint
Found 718 warnings and 0 errors.
exit=0
```

#### skip/todo grep(UC-F-4)

```
$ grep -rnE "\.skip\(|\.todo\(|test\.skip|it\.skip|xit\(|xtest\(" tests/unit/providers/
(无输出)
exit=0
```

### 基线同步状态

未执行(Phase 3b 未完成,暂不进入 Phase 9)。

### UC-F-2: CI 真实性验证

**本里程碑未触发 CI run,统一由 team-lead 在整链合入 dev 时验证**。

## Backend 修改(UC-G)

无。

## Backend 问题发现(UC-G 必 escalate 情况)

无。

## 遗留问题 / 跟进项

1. **Phase 3b hooks 测试缺失**: 3 个 L2 hooks 文件(useModelProviderList, useConfigModelListWithImage, useGoogleAuthModels)跳过。后续可作为独立 issue 补充,或在 N4 整体完成后统一评估。

2. **文件数下限缺口**: requirements 要求 N4b ≥ 18 文件,当前 Phase 2b 交付 4 文件,剩余 Phase 4b-6b 计划 11 文件,合计 15 文件 < 18 文件。需在后续 Phase 中:
   - 补充 3 个文件(可从 cron/system 中拆分更细粒度的测试)
   - 或在最终 handoff 中说明偏离原因,接受 15 文件 + 超额 case 数作为等价交付

3. **Phase 4b-6b 待完成**: 11 个文件(P4 ModelModalContent + S1-S3 System + C1-C7 Cron),预估 ≥ 55 cases,由 team-lead 决定是否继续由本 executor 完成或重新派发。

## 下一步建议

1. **选项 A**: 继续由本 executor 完成 Phase 4b-6b(11 文件),跳过 Phase 3b 不再尝试
2. **选项 B**: team-lead 接手,针对 Phase 3b hooks 依赖问题设计新的 mock 策略
3. **选项 C**: 接受当前交付(4 文件 77 cases),Phase 3b+4b+5b+6b 作为后续专项或由人类补充
