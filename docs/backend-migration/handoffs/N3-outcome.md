# N3 adapter/common 测试重写 - 交付摘要

## 已交付

7 个测试/helper 文件(共 88 个 test case,全绿):

- `tests/unit/_helpers/mockHttpBridge.ts`(435 行,helper,签名冻结)
- `tests/unit/_helpers/mockHttpBridge.test.ts`(16 tests,helper 自测)
- `tests/unit/common-adapter/apiModelMapper.test.ts`(20 tests,T1)
- `tests/unit/common-adapter/searchMapper.test.ts`(7 tests,T2)
- `tests/unit/common-adapter/httpBridge.test.ts`(27 tests,T3)
- `tests/unit/common-config/configMigration.test.ts`(11 tests,T4 + §8.5 smoke)
- `tests/unit/common-config/storage.test.ts`(7 tests,T5)

plan 文件入版:`docs/backend-migration/plans/2026-05-08-n3-test-rewrite-adapter-common.md`(1167 行)。

## 与计划的偏离(team-lead 接手修复)

executor-n3 agent 写完 7 个 commit 后在未执行 Phase 8 门禁、未做基线同步、未写 handoff、未 push 的情况下 idle 了两次(15:31 / 15:34 两次 idle_notification,中间 SendMessage 唤醒未触发实际动作)。team-lead 按铁律"不卡住整链"接手完成剩余步骤:

1. **Phase 8 §8.5 helper-import gate 最初未通过**:原 T4 configMigration.test.ts 用手写 `vi.fn()` mock `httpRequest`,没 import `createMockHttpBridge`。plan 授权两种补救(改 T4 工厂 / 加 smoke demo)。team-lead 采用第二种(最小侵入):在 T4 文件顶部 import 并在文件尾追加 1 个 helper reachability smoke test,保留 T4 原有 10 个 case 不动。
2. **尝试 vi.mock 工厂复用 helper.asModule() 失败**:vi.mock hoist 到顶导致 `Cannot access 'mockBridge' before initialization`;换 `vi.hoisted` + `require` 失败(MODULE_NOT_FOUND);换 async factory + dynamic import 导致 worker fork 死锁。最终回退到"顶部 import + 独立 smoke test"方案,稳定且满足 §8.5 grep gate。
3. **1 个 team-lead 修复 commit**:`9d21b2c60 test(n3): wire mockHttpBridge helper into configMigration test and add plan`(含 plan 纳入版本 + T4 的 smoke 块)。
4. **executor-n3 agent 行为异常**:已在整链完成后向人类汇报;不影响最终产物。

## 给下一个里程碑的提醒

- **mockHttpBridge 公开签名已冻结**(见下方 §锁定签名),N4 不得修改
- §8.5 gate 的 grep 验证:`grep -rn "mockHttpBridge" tests/unit/common-adapter tests/unit/common-config` 有 2 行输出(configMigration.test.ts 的 import 和 describe block)
- 基线 `origin/feat/backend-migration @ e4cdff41f` 当前仍是最新,N3 分支已与基线对齐(`Already up to date`)

## 验证证据(UC-F-1)

### 分支信息

- 分支:`feat/n3-test-rewrite-adapter-common`
- 最新 SHA:`349769374a697876667dccdbaca96b1d2138b689`
- 基线 SHA:`e4cdff41f`(本地已是最新,`Already up to date`)

### 自动化门禁输出

#### 1. 文件清单

```
OK tests/unit/_helpers/mockHttpBridge.ts
OK tests/unit/_helpers/mockHttpBridge.test.ts
OK tests/unit/common-adapter/apiModelMapper.test.ts
OK tests/unit/common-adapter/searchMapper.test.ts
OK tests/unit/common-adapter/httpBridge.test.ts
OK tests/unit/common-config/configMigration.test.ts
OK tests/unit/common-config/storage.test.ts
```

#### 2. vitest run --reporter=default(UC-F-4)

```
 ✓ tests/unit/common-adapter/searchMapper.test.ts    (7 tests)   3ms
 ✓ tests/unit/common-config/storage.test.ts          (7 tests)   3ms
 ✓ tests/unit/common-adapter/apiModelMapper.test.ts  (20 tests)  3ms
 ✓ tests/unit/_helpers/mockHttpBridge.test.ts        (16 tests)  6ms
 ✓ tests/unit/common-config/configMigration.test.ts  (11 tests)  7ms
 ✓ tests/unit/common-adapter/httpBridge.test.ts      (27 tests)  17ms

 Test Files  6 passed (6)
      Tests  88 passed (88)
```

退出码:0。测试数 **88 ≥ 30**(plan 目标 30-50,超出)。

#### 3. skip/todo grep(UC-F-4)

```
$ grep -rnE "\.skip\(|\.todo\(|test\.skip|it\.skip|xtest\(|xit\(" tests/unit/
(no matches)
```

退出码:0。

#### 4. helper-import grep(§8.5 gate)

```
$ grep -rn "mockHttpBridge" tests/unit/common-adapter tests/unit/common-config
tests/unit/common-config/configMigration.test.ts:14:import { createMockHttpBridge } from '../_helpers/mockHttpBridge';
tests/unit/common-config/configMigration.test.ts:332:  describe('mockHttpBridge helper reachability (Phase 8 §8.5 smoke)', () => {
```

2 行输出 ≥ 1,PASS。

#### 5. tsc --noEmit

```
$ bunx tsc --noEmit
(无输出)
exit=0
```

#### 6. lint

```
Found 718 warnings and 0 errors.
Finished in 70ms on 882 files with 128 rules using 12 threads.
exit=0
```

#### 7. prek

```
check yaml...........................................(no files to check)Skipped
check json...........................................(no files to check)Skipped
check toml...........................................(no files to check)Skipped
check for merge conflicts................................................Passed
check for case conflicts.................................................Passed
check for added large files..............................................Passed
fix end of files.........................................................Passed
trim trailing whitespace.................................................Passed
TypeScript Check.........................................................Passed
Oxlint...................................................................Passed
Oxfmt....................................................................Passed
i18n Check...........................................(no files to check)Skipped
```

exit=0。

### UC-F-2:CI 真实性验证

本里程碑未触发 CI run,统一由 team-lead 在整链合入 dev 时验证。

### UC-F-5:基线同步复跑

基线 `origin/feat/backend-migration @ e4cdff41f` 与本地 HEAD 无新 commit 差异(`git log --oneline HEAD..origin/feat/backend-migration` 无输出,merge `Already up to date`)。无需额外 merge commit。所有门禁命令以上述输出为准,基线已在 base。

## mockHttpBridge 最终公开签名(N4 冻结)

**锁定规则**:N4 不得修改以下公开导出的函数名、参数名、参数位置、返回类型。`asModule()` 返回的 14 个键必须与 `packages/desktop/src/common/adapter/httpBridge.ts` 的具名导出逐字对应。

```ts
// tests/unit/_helpers/mockHttpBridge.ts 公开 API(实际代码来源 N3 plan §2.1)

// Re-exports(保留 instanceof 语义)
export { BackendHttpError, isBackendHttpError };

export type ProviderLike<Data, Params = undefined> = {
  provider: (handler: (params: Params) => Promise<Data>) => void;
  invoke: Params extends undefined ? () => Promise<Data> : (params: Params) => Promise<Data>;
};

export type EmitterLike<Params = undefined> = {
  on: (callback: Params extends undefined ? () => void : (params: Params) => void) => () => void;
  emit: Params extends undefined ? () => void : (params: Params) => void;
};

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type MockHttpHandler<TBody = unknown, TData = unknown> = (ctx: {
  method: HttpMethod;
  path: string;
  pathPattern: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: TBody | undefined;
}) => TData | Promise<TData>;

export type MockHttpBridgeOptions = {
  unmatched?: 'throw' | 'warn';
};

export interface MockHttpBridge {
  onGet<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this;
  onPost<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onPut<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onPatch<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onDelete<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this;

  emit(eventName: string, payload: unknown): void;

  calls: ReadonlyArray<{
    method: HttpMethod;
    path: string;
    pathPattern: string;
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
  }>;
  readonly routeCount: number;
  readonly wsListenerCount: number;

  reset(): void;

  asModule(): {
    httpGet: typeof import('@/common/adapter/httpBridge').httpGet;
    httpPost: typeof import('@/common/adapter/httpBridge').httpPost;
    httpPut: typeof import('@/common/adapter/httpBridge').httpPut;
    httpPatch: typeof import('@/common/adapter/httpBridge').httpPatch;
    httpDelete: typeof import('@/common/adapter/httpBridge').httpDelete;
    stubProvider: typeof import('@/common/adapter/httpBridge').stubProvider;
    withResponseMap: typeof import('@/common/adapter/httpBridge').withResponseMap;
    wsEmitter: typeof import('@/common/adapter/httpBridge').wsEmitter;
    wsMappedEmitter: typeof import('@/common/adapter/httpBridge').wsMappedEmitter;
    stubEmitter: typeof import('@/common/adapter/httpBridge').stubEmitter;
    httpRequest: typeof import('@/common/adapter/httpBridge').httpRequest;
    getBaseUrl: typeof import('@/common/adapter/httpBridge').getBaseUrl;
    BackendHttpError: typeof import('@/common/adapter/httpBridge').BackendHttpError;
    isBackendHttpError: typeof import('@/common/adapter/httpBridge').isBackendHttpError;
  };
}

export function createMockHttpBridge(options?: MockHttpBridgeOptions): MockHttpBridge;
export function resetMockHttpBridge(mock: MockHttpBridge): void;
```

**N4 使用约束**:

- 推荐:`const mock = createMockHttpBridge({ unmatched: 'warn' }); vi.mock('@/common/adapter/httpBridge', () => mock.asModule())` —— **但注意 vi.mock hoist 限制**:不能在工厂内引用外部 const,也不能用 async factory + dynamic import(会导致 worker fork 死锁,team-lead 已踩坑验证)。建议继续沿用手写 `vi.fn()` mock + 在测试体里实例化 `createMockHttpBridge` 做路由注册和 assertion。
- 不得修改 `tests/unit/_helpers/mockHttpBridge.ts`;需要新能力 → escalate team-lead。

## Backend 修改

无。

## 遗留问题 / 跟进项

1. **N4 的 vi.mock 工厂模式**:team-lead 在踩坑过程中发现 vi.mock + helper.asModule() 在 vitest 4 下有多个陷阱。N4 plan-writer 写 plan 时应明确规定 N4 测试文件的 mock 策略,避免每个 executor 重踩。推荐写法见 "N4 使用约束" 节。
2. **executor-n3 agent 反馈**:本 agent 在本次执行中未按 plan 闭环(漏了 Phase 8+)。N4 的 3 个并行 executor 派发前,team-lead 应在 prompt 里显式强调"写完 commit 后必须主动继续执行门禁 + push + handoff + SendMessage,不允许写完 commit 就 idle"。
