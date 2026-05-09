# N3 adapter/common 测试重写 + mock 模板 — 详细实施 plan

- **日期**:2026-05-08
- **里程碑**:N3
- **本 plan 读者**:零上下文的 N3 executor
- **上游分支**:`origin/feat/n2-legacy-test-cleanup` @ `ae1d150f3ae2d942bd3d9aeb2139932f8c33f19f`
- **本里程碑分支**:`feat/n3-test-rewrite-adapter-common`
- **不创建 PR、不合回共享分支、不 rebase 上游分支**。

---

## 给 executor 的硬约束速记(必读)

- 必须**完整读完** `docs/backend-migration/plans/2026-05-08-cleanup-teammate-cheatsheet.md`(含 UC-F 5 条)再开工。
- 必须**完整读完** `docs/backend-migration/plans/2026-05-08-n3-test-rewrite-adapter-common-requirements.md`(requirements)。
- 本 plan 的签名锁定节(§2.1)已定稿,**executor 不得偏离、也不得"微调"**,N4 依赖此签名。
- 本 plan 的每条命令都可 copy-paste 执行,不要自行替换参数。
- 每个 Phase 结束都必须 commit,commit message 按 §10 模板。
- 每条验证命令的原始输出(头 10 + 尾 10 + 总行数 + 退出码)必须贴进 handoff(UC-F-1)。
- 禁止 `.skip` / `.todo` / `xit` / `xtest`(UC-F-4)。
- 禁止 push / merge 到 `dev` 或 `feat/backend-migration`(UC-F-2)。
- 禁止 `gh workflow run` / `gh pr create`(UC-F-2)。
- 禁止改源码(`packages/desktop/src/common/adapter/**` / `packages/desktop/src/common/config/**`),本里程碑**只写测试**。
- 禁止改 `vitest.config.ts`(UC-C 硬约束,N2 已锁)。
- 禁止引入新依赖(requirements "不做什么" 硬约束)。
- 发现 backend 行为问题 → 按 UC-G 流程,**不 skip、不改错误断言**。

---

## 1. 里程碑全景

本里程碑交付 **7 个新文件**:

1. `tests/unit/_helpers/mockHttpBridge.ts`(helper,供 N4 复用)
2. `tests/unit/_helpers/mockHttpBridge.test.ts`(helper 自测)
3. `tests/unit/common-adapter/apiModelMapper.test.ts`
4. `tests/unit/common-adapter/searchMapper.test.ts`
5. `tests/unit/common-adapter/httpBridge.test.ts`
6. `tests/unit/common-config/configMigration.test.ts`
7. `tests/unit/common-config/storage.test.ts`

**上游源码情况(只读 / 不改)**:

| 源码                                                              | 行数 | 用途                                                           |
| ----------------------------------------------------------------- | ---: | -------------------------------------------------------------- |
| `packages/desktop/src/common/adapter/httpBridge.ts`               |  421 | HTTP/WS 工厂 + `BackendHttpError` + `ensureWs` 重连逻辑        |
| `packages/desktop/src/common/adapter/apiModelMapper.ts`           |   95 | model 前后端互转 + `fromApiConversation` / `fromApiPaginated…` |
| `packages/desktop/src/common/adapter/searchMapper.ts`             |   54 | `fromApiSearchResult` 搜索结果映射                             |
| `packages/desktop/src/common/config/configMigration.ts`           |  222 | `migrateConfigStorage` + `migrateProviders`                    |
| `packages/desktop/src/common/config/storage.ts`                   |  594 | 类型 + `ConfigStorage` / `EnvStorage` / `BUILTIN_IMAGE_GEN_ID` |
| `packages/desktop/src/common/adapter/ipcBridge.ts` (仅 type 依赖) | 1617 | `PaginatedResult<T>` 类型引用                                  |

**预计执行时间**(顺序):~8-10 小时工时

- Phase 0(基线)+ Phase 1(预检)= 0.5 h
- Phase 2(mock helper + 自测)= 2.5 h
- Phase 3(apiModelMapper)= 1 h
- Phase 4(searchMapper)= 0.5 h
- Phase 5(httpBridge)= 2 h
- Phase 6(configMigration)= 1.5 h
- Phase 7(storage)= 0.5 h
- Phase 8(本地门禁)= 0.5 h
- Phase 9(基线同步 + 复跑)= 0.5 h
- Phase 10(handoff + SendMessage)= 0.5 h

---

## 2. mockHttpBridge 公开签名锁定(N4 依赖,不得修改)

### 2.1 TypeScript 签名(权威)

executor **必须**让 `tests/unit/_helpers/mockHttpBridge.ts` 的**公开导出**与下面的签名**逐字一致**(函数名、参数名、参数位置、返回类型)。内部实现 executor 可以自由发挥,但导出表面冻结。

```ts
// -------- tests/unit/_helpers/mockHttpBridge.ts  (公开 API 锁定) --------

/**
 * ProviderLike / EmitterLike 与 httpBridge 源码保持一致;
 * 直接从源码 import type,N4 测试可复用同一类型符号。
 */
export type ProviderLike<Data, Params = undefined> = {
  provider: (handler: (params: Params) => Promise<Data>) => void;
  invoke: Params extends undefined ? () => Promise<Data> : (params: Params) => Promise<Data>;
};

export type EmitterLike<Params = undefined> = {
  on: (callback: Params extends undefined ? () => void : (params: Params) => void) => () => void;
  emit: Params extends undefined ? () => void : (params: Params) => void;
};

/**
 * HTTP method literals accepted by route stubs.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Handler registered for a single (method, pathPattern) pair.
 *
 * - `pathPattern` 可以是精确字符串(如 `/api/providers`)或以 `:name` 占位符
 *   定义的路径(如 `/api/providers/:id`)。占位符按段匹配,`params` 参数会
 *   携带已 decode 的段值。
 * - Query string 在匹配前会被剥离,并以对象形式塞进 `query`。
 * - `body` 对有 body 的 verb(POST/PUT/PATCH)是调用方传入的已序列化 JSON
 *   payload;对无 body 的 verb(GET/DELETE)是 `undefined`。
 * - handler 返回值就是被测代码看到的 "unwrapped" data(即相当于后端
 *   `{ success, data }` 中的 data);mock 不做 envelope 包裹。
 * - 抛错会被 invoke 直接透传为 rejection(用来模拟 BackendHttpError 等)。
 */
export type MockHttpHandler<TBody = unknown, TData = unknown> = (ctx: {
  method: HttpMethod;
  path: string;
  pathPattern: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: TBody | undefined;
}) => TData | Promise<TData>;

export type MockHttpBridgeOptions = {
  /**
   * 未匹配路由时的行为,默认 `'throw'`(抛 "unexpected call" Error)。
   * 设为 `'warn'`:console.warn 一次后返回 `undefined` — 仅用于调试,
   * 不得在常规测试里使用(UC-F-4 要求严格断言,未匹配路由一律视为 bug)。
   */
  unmatched?: 'throw' | 'warn';
};

export interface MockHttpBridge {
  // --- route registration (return `this` 以支持链式调用) ---
  onGet<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this;
  onPost<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onPut<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onPatch<TBody = unknown, TData = unknown>(pathPattern: string, handler: MockHttpHandler<TBody, TData>): this;
  onDelete<TData = unknown>(pathPattern: string, handler: MockHttpHandler<undefined, TData>): this;

  // --- WS event emission ---
  /**
   * 向所有通过 `wsEmitter(eventName).on(cb)` 订阅的 cb 同步派发 payload。
   * 同步派发:call stack 解开时所有 listener 已收到事件,测试可立即断言
   * (与 `@vitest-environment node` + `setImmediate`/microtask 无关)。
   * 若 handler 抛错,mock 会 console.warn 但不会打断 emit。
   */
  emit(eventName: string, payload: unknown): void;

  // --- inspection helpers (测试断言用) ---
  /** 已记录的调用流水,按时间先后(不含重置前的历史)。 */
  calls: ReadonlyArray<{
    method: HttpMethod;
    path: string;
    pathPattern: string;
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
  }>;
  /** 已登记的 (method, pathPattern) 对数量,用于断言"setup 齐全"。 */
  readonly routeCount: number;
  /** 已登记的 WS listener 数量(所有 event 汇总)。 */
  readonly wsListenerCount: number;

  // --- lifecycle ---
  /**
   * 清空路由注册、WS listener、calls 历史。
   * `beforeEach` 里推荐调用;仅影响由本 helper 创建的实例,不触碰 vitest
   * 的 `vi.mock()` 注册。
   */
  reset(): void;

  /**
   * 返回一个可以直接 `vi.mock('@/common/adapter/httpBridge', () => ...)`
   * 使用的对象。键名与 httpBridge.ts 的**所有**具名导出一一对应,保证
   * `vi.mock` 工厂替换后的模块 shape 完全匹配(否则 TS 会报缺失导出)。
   */
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

/**
 * 创建一个新的 mock 实例。
 * @param options.unmatched — 未匹配路由行为,默认 'throw'(见 MockHttpBridgeOptions)
 */
export function createMockHttpBridge(options?: MockHttpBridgeOptions): MockHttpBridge;

/**
 * 便捷函数:对传入的 `mock` 调用 `.reset()`。语义上等同;保留独立导出
 * 以便 N4 teammate 写 `beforeEach(() => resetMockHttpBridge(mock))`。
 */
export function resetMockHttpBridge(mock: MockHttpBridge): void;
```

### 2.2 签名锁定规则(给 N4 的宪法)

- N4 **不得**改 `mockHttpBridge.ts` 的公开签名(函数名、参数顺序、返回类型、`MockHttpBridge` interface 成员)。
- N4 **可以** pattern 化 `pathPattern` 支持的字符(在 `:name` 占位符语义范围内),无需改签名。
- N4 若需要新增能力(如流式响应、WS 双向),**必须 escalate** 给 team-lead,由 team-lead 决定:
  - 选项 A:仍由 N3 helper 覆盖,触发 N3 handoff 版本升级(重新锁签名)
  - 选项 B:N4 在 `tests/unit/_helpers/` 新增 helper(不污染本 helper)
- N3 handoff 必须**原样重贴**上述 TypeScript 签名块(§2.1),不得改写。

### 2.3 实现细则(给 executor 的非强制建议,不属于签名锁定)

以下是实现提示,**executor 可自由选择内部实现**,只要对外符合 §2.1:

- 路由注册表用 `Array<{ method, pathPattern, pattern: RegExp, handler }>`;路径匹配用 `new RegExp('^' + pattern.replace(/:(\\w+)/g, '([^/]+)') + '$')`。
- `emit` 同步派发(`for (const h of listeners) h(payload)`),与 httpBridge.ts 的实际 WS message 分发节奏一致(见 httpBridge.ts L344-356)。
- `asModule()` 返回的每个 HTTP 工厂(`httpGet` 等)必须:
  - 返回 `{ provider: () => {}, invoke: (params?) => <记录调用并执行 handler>}`,`provider` 是 no-op,与源码一致(见 httpBridge.ts L186-203)。
  - 在 `invoke` 内部把 `path` / `body` / query 按 §2.1 要求塞进 `calls`。
  - 匹配失败时按 `options.unmatched` 分支处理。
- `asModule()` 返回的 `wsEmitter(eventName)` 的 `.on(cb)` 要把 cb 加到本 helper 的 listener 集合中,`emit(name, payload)` 同步派发到对应集合;`.emit` 本身按签名是 no-op(与源码 L394 一致)。
- `wsMappedEmitter(name, transform)` 按源码(L398-411)通过内部 `wsEmitter` 组合实现。
- `BackendHttpError` 和 `isBackendHttpError` 可**直接 re-export 源码**(`export { BackendHttpError, isBackendHttpError } from '@/common/adapter/httpBridge';`),不走 mock —— mock 只替换工厂,错误类保持真身,以便测试里 `instanceof` 生效。
- `httpRequest` 在本 mock 里返回 stub(`() => { throw new Error('direct httpRequest calls not allowed under mock; use httpGet/httpPost/... factories'); }`);任何测试若意外走到 `httpRequest`,会立即失败,促使测试改用被 mock 的工厂。
- `getBaseUrl` 在本 mock 里返回 `''`(与 WebUI 模式 / renderer 默认一致),具体分支行为在 T3 httpBridge 自测里用 `vi.spyOn(window, ...)` 等直接测源码,不走 mock。

---

## 3. 从 N2 handoff 读取的字段映射

executor 在 Phase 0/9 会用到以下来自 N2-outcome 的字段:

| N2 handoff 字段       | 本 plan 用在哪             | 具体值(N2 上游已锁)                                                          |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| 上游分支名            | Phase 1 步骤 1.1(checkout) | `feat/n2-legacy-test-cleanup`                                                |
| 上游 SHA              | Phase 1 步骤 1.1           | `ae1d150f3ae2d942bd3d9aeb2139932f8c33f19f`                                   |
| 基线分支名 / SHA      | Phase 9 步骤 9.1           | `origin/feat/backend-migration` @ `e4cdff41fb7eb154a43dbe5568bfb2edc7fb7ea2` |
| vitest 空集合退出码 1 | Phase 0 基线节             | 已知偏离,N2 team-lead 已接受;N3 加测试后自然恢复 0                           |
| 12 个骨架目录         | Phase 1 预检               | 含 `_helpers` / `common-adapter` / `common-config` 等(均已带 .gitkeep)       |
| 上游门禁全绿          | 无需回跑 N2 验证           | lint / tsc / vitest(exit 1 预期)/ prek 均已验证                              |

**未覆盖的决策点 → 本 plan 无。** requirements + 本签名锁已穷尽 N3 所需决策。若 executor 执行中发现新决策点(如 helper 需要扩展),**SendMessage 给 team-lead**,不自行定夺。

---

## 4. 工具预检

执行任何阶段前,executor 必须先跑下面一块验证本机工具齐全。**任何一行 FAIL 都必须先修,再开工**。

```bash
# 执行目录
cd /Users/zhoukai/Documents/github/AionUi

# 工具可用性
node --version            # 预期: v22.x
bun --version             # 预期: 1.x
bunx vitest --version     # 预期: vitest/4.x darwin-arm64 node-v22.x
bunx tsc --version        # 预期: Version 5.x
which prek                # 预期: 非空路径
prek --version            # 预期: 可执行,版本号可读
which gh                  # 预期: 非空路径(handoff 备用,不主动触发 CI)
git --version             # 预期: 2.x
```

若 `prek` 未装:

```bash
npm install -g @j178/prek
prek --version     # 复验
```

若 `bunx vitest` 因 node_modules 缺失报错:

```bash
bun install
bunx vitest --version
```

---

## 5. 平台兼容约定

- 本机平台 Darwin 24.6.0(macOS)+ zsh。
- 本 plan 不使用任何 `sed -i` / `xargs` 等跨平台差异命令;所有操作走 **Edit / Write 工具**或 **bun / git** 原生命令,Linux / Windows WSL 同样可跑。
- 如果 executor 确实需要跑 shell:优先用 `grep -rn` 等 POSIX 通用语法,避免 GNU 扩展。

---

## Phase 0 基线快照

**目的**:记录 N3 开工前的状态,让后续 diff 可以机械判定。

### 步骤 0.1 — 确保当前工作区干净 + 无未 commit 变更

```bash
cd /Users/zhoukai/Documents/github/AionUi

git status --porcelain
# 预期:无输出(空行)。非空 → STOP,escalate 给 team-lead。

git remote -v | head -4
# 预期:包含 origin  git@github.com:iOfficeAI/AionUi.git

git fetch origin
# 预期:无错误
```

### 步骤 0.2 — 记录基线快照到 `/tmp`

```bash
mkdir -p /tmp/n3-baseline

# 上游 SHA(用于 handoff)
git rev-parse origin/feat/n2-legacy-test-cleanup > /tmp/n3-baseline/n2-sha.txt
cat /tmp/n3-baseline/n2-sha.txt
# 预期:ae1d150f3ae2d942bd3d9aeb2139932f8c33f19f

git rev-parse origin/feat/backend-migration > /tmp/n3-baseline/base-sha.txt
cat /tmp/n3-baseline/base-sha.txt
# 预期:e4cdff41fb7eb154a43dbe5568bfb2edc7fb7ea2

# 当前 tests/unit/ 文件数(基线 = 只有 12 个 .gitkeep + 空目录)
find tests/unit -type f | wc -l > /tmp/n3-baseline/test-file-count.txt
cat /tmp/n3-baseline/test-file-count.txt
# 预期:12(仅 .gitkeep)

# 当前 vitest 行为基线(空集合退出 1)
bunx vitest run --reporter=verbose 2>&1 | tee /tmp/n3-baseline/vitest.log | tail -5
echo "exit=$?" >> /tmp/n3-baseline/vitest.log
# 预期:"No test files found, exiting with code 1" — 已知 N2 偏离
```

**判定**:

- `test-file-count.txt == 12` ✓
- vitest 日志含 "No test files found" ✓
- 两者都是 N2 已验证状态,执行到这一步只是"确认没跑错分支"。

---

## Phase 1 预检 + 切分支

### 步骤 1.1 — 基于 N2 创建 N3 分支

```bash
cd /Users/zhoukai/Documents/github/AionUi

git checkout -b feat/n3-test-rewrite-adapter-common origin/feat/n2-legacy-test-cleanup
# 预期:Switched to a new branch 'feat/n3-test-rewrite-adapter-common'

git rev-parse --abbrev-ref HEAD
# 预期:feat/n3-test-rewrite-adapter-common

git merge-base --is-ancestor origin/feat/n2-legacy-test-cleanup HEAD && echo "base OK"
# 预期:base OK

git log --oneline -3
# 预期:ae1d150f3 docs(n2): add team-lead adjudication ... 之类
```

### 步骤 1.2 — 依赖装好 + 预检命令

```bash
bun install
# 预期:无错误,lockfile 保持干净

git diff bun.lock
# 预期:无输出(bun install 未改 lockfile)。若改了 → STOP,escalate。

# 骨架目录验证(N2 已建)
for d in _helpers common-adapter common-config; do
  test -d "tests/unit/$d" || { echo "MISSING: tests/unit/$d"; exit 1; }
done
echo "N2 skeleton OK"
# 预期:N2 skeleton OK
```

### 步骤 1.3 — Phase 1 commit(无代码改动,不 commit)

Phase 1 只是切分支和校验,没有文件改动,**不 commit**。

---

## Phase 2 mock helper + 自测

**目的**:一次性交付锁签名的 helper + 自测,后续 T1-T5 直接复用。

### 步骤 2.1 — 删除 `tests/unit/_helpers/.gitkeep`

```bash
ls tests/unit/_helpers/
# 预期:.gitkeep

git rm tests/unit/_helpers/.gitkeep
# 预期:rm 'tests/unit/_helpers/.gitkeep'
```

### 步骤 2.2 — 写 `tests/unit/_helpers/mockHttpBridge.ts`

用 Write 工具创建文件。内容**必须满足** §2.1 的公开签名锁定。实现范例(仅供参考,executor 可优化,但对外 API 不得变):

- 文件顶部 import 源码的 `BackendHttpError` / `isBackendHttpError`(re-export)。
- 内部维护两个 Map:`routes: Map<string, Handler[]>`(key = `${method} ${pathPattern}`)、`wsListeners: Map<string, Set<cb>>`。
- `onGet/onPost/onPut/onPatch/onDelete` 往 `routes` 写 + 返回 `this`。
- `emit(name, payload)` 遍历 `wsListeners.get(name)` 同步调用。
- `asModule()` 返回的工厂使用闭包访问 `routes` 和 `wsListeners`,同时维护 `calls[]`。
- `reset()` 清空 `routes` / `wsListeners` / `calls`。
- `routeCount` / `wsListenerCount` 是 getter,读取当前 Map 状态。

**关键文件头 JSDoc 必须包含**(executor 原样贴):

```ts
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AionUi N3 mock HTTP/WS bridge helper.
 *
 * Public API frozen in docs/backend-migration/plans/2026-05-08-n3-test-rewrite-adapter-common.md §2.1.
 * N4 teammates: do NOT change the exported signatures. If a new capability is
 * needed, escalate to the team-lead instead of patching this file.
 */
```

### 步骤 2.3 — 写 `tests/unit/_helpers/mockHttpBridge.test.ts`

至少包含以下断言(T6,清单 §2.4 中的 requirements item 6)。每个 `describe` / `it` 标题要描述清楚在测什么。

最低 **8 个 test case**:

| #    | test case 标题(示例)                                                                  | 断言关键点                                                                                                  |
| ---- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| T6.1 | `createMockHttpBridge() returns object with frozen public API`                        | 返回值包含 `onGet/.../onDelete/emit/calls/routeCount/wsListenerCount/reset/asModule`,无多余字段             |
| T6.2 | `onGet registers a handler; asModule().httpGet(path).invoke() returns handler result` | GET `/api/foo` → `{ ok: true }`;`calls` 累加 1,path/method/params 正确                                      |
| T6.3 | `onPost forwards body and returns handler result`                                     | POST `/api/items` + body `{ id: 'a' }` → handler 收到 body;calls 记录 body                                  |
| T6.4 | `:param placeholder populates params map`                                             | `onGet('/api/providers/:id', ...)` + invoke `/api/providers/p1` → params.id = 'p1'                          |
| T6.5 | `unmatched route throws "unexpected call" by default`                                 | 调用未注册路由 → `await expect(...).rejects.toThrow(/unexpected call/)`                                     |
| T6.6 | `unmatched option "warn" returns undefined and logs console.warn`                     | `createMockHttpBridge({ unmatched: 'warn' })` → 未匹配时不抛,console.warn spy 收到 1 次                     |
| T6.7 | `emit() dispatches to all wsEmitter listeners synchronously`                          | `asModule().wsEmitter('evt').on(cb)` + `mock.emit('evt', payload)` → cb 被同步调用;`wsListenerCount` = 1    |
| T6.8 | `reset() clears routes, listeners, and calls`                                         | 注册路由 + 订阅 + 调 invoke → `reset()` → `routeCount === 0 && wsListenerCount === 0 && calls.length === 0` |

可选(执行者时间允许再加):

- T6.9 `asModule().httpPost withResponseMap`:用 `withResponseMap` 包 mock 的 invoke,断言 mapper 执行。
- T6.10 `BackendHttpError re-export is same class as source`:`expect(BackendHttpError === sourceBackendHttpError).toBe(true)`。

**禁止**:任何 `.skip` / `.todo` / 空 `it()` 占位。

### 步骤 2.4 — 本阶段验证

```bash
bunx tsc --noEmit 2>&1 | tail -20
# 预期:退出 0,无输出

bunx vitest run tests/unit/_helpers --reporter=verbose 2>&1 | tee /tmp/n3-phase2-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;T6.1..T6.8 全部 ✓;passed >= 8
```

**FAIL 诊断路径**:

- tsc 报 "Cannot find module `@/common/adapter/httpBridge`" → vitest alias OK,但 tsc 读 `tsconfig.json` 的 `paths` 看不到 `@/*`。检查 `tsconfig.json` 的 `paths["@/*"]`,应该已指向 `./packages/desktop/src/*`(M1 已建)。若异常 → escalate(上游问题)。
- vitest 报 "No test files found" → 检查文件名必须是 `.test.ts` 而非 `.spec.ts`;目录必须在 `tests/unit/_helpers/` 下。
- vitest 报 "Cannot find module '@/common/adapter/httpBridge'" → 检查 `vitest.config.ts` 的 `aliases['@/']`(已存在,指向 `packages/desktop/src/`)。
- `asModule()` 返回的 HTTP 工厂 invoke 挂在 "unexpected call" 但确实已 `onGet`:大概率 pathPattern 正则未匹配 query string 剥离 / 占位符语义。加 `console.log(routes, path)` 单步调试。

### 步骤 2.5 — commit

```bash
git add tests/unit/_helpers/
git status --short
# 预期:
#   A  tests/unit/_helpers/mockHttpBridge.test.ts
#   A  tests/unit/_helpers/mockHttpBridge.ts
#   D  tests/unit/_helpers/.gitkeep

git commit -m "test(n3): add mockHttpBridge helper with frozen public signatures

Helper backs T6 in the N3 test checklist and is the single entry point for
N4's 54-file domain tests. Public API (functions, types, MockHttpBridge
interface) is frozen per docs/backend-migration/plans/2026-05-08-n3-test-rewrite-adapter-common.md
§2.1 — N4 must not change these signatures."
```

---

## Phase 3 `apiModelMapper.test.ts`

**被测文件**:`packages/desktop/src/common/adapter/apiModelMapper.ts`(95 行)

### 步骤 3.1 — 目标断言清单(最少 8 个 test case)

| #     | 用例                                                                 | 输入 / 断言                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1.1  | `toApiModel` 映射必填字段                                            | 输入 `{ id: 'openai', use_model: 'gpt-5', platform: 'openai', name: 'x', base_url: 'y', api_key: 'z' }` → `{ provider_id: 'openai', model: 'gpt-5' }`。验证没有多余字段     |
| T1.2  | `toApiModelOptional` undefined → undefined                           | `toApiModelOptional(undefined)` → `undefined`                                                                                                                               |
| T1.3  | `toApiModelOptional` id 为空 → undefined                             | 输入 `{ id: '', use_model: 'gpt' }` → `undefined`(hasCompleteModelIdentity false)                                                                                           |
| T1.4  | `toApiModelOptional` use_model 为空 → undefined                      | 输入 `{ id: 'x', use_model: '' }` → `undefined`                                                                                                                             |
| T1.5  | `toApiModelOptional` 完整 → 正常映射                                 | 输入 `{ id: 'x', use_model: 'gpt' }` → `{ provider_id: 'x', model: 'gpt' }`                                                                                                 |
| T1.6  | `fromApiModel` 映射并补空的 provider 字段                            | 输入 `{ provider_id: 'p', model: 'm' }` → `{ id: 'p', platform: '', name: '', base_url: '', api_key: '', use_model: 'm' }`。另测 `use_model ?? model` fallback              |
| T1.7  | `fromApiConversation` 把 model 从 ApiProvider 转 TProviderWithModel  | raw 带 `model: { provider_id: 'p', model: 'm' }` → next.model 为 `{ id: 'p', ..., use_model: 'm' }`;raw 无 model → next.model undefined                                     |
| T1.8  | `fromApiConversation` 补 `custom_workspace`                          | raw.extra = `{ workspace: '/tmp', is_temporary_workspace: false }` → next.extra.custom_workspace = true;`is_temporary_workspace: true` → false;workspace 为空字符串 → false |
| T1.9  | `fromApiConversation` 已有 `custom_workspace` 不覆盖                 | raw.extra 已含 `custom_workspace: true`(任意值)→ next.extra 不被重算,保持输入                                                                                               |
| T1.10 | `fromApiConversation` 非对象输入直接返回                             | raw = null / undefined / 'string' → 原样返回                                                                                                                                |
| T1.11 | `fromApiPaginatedConversations` items 逐条映射 + 保留 total/has_more | 输入 `{ items: [{...model...}, {...no model...}], total: 2, has_more: false }` → items 经过 fromApiConversation;total/has_more 原样                                         |

**至少 8 个 test case,推荐落 11 个(覆盖所有分支)。**

### 步骤 3.2 — 写文件

用 Write 工具创建 `tests/unit/common-adapter/apiModelMapper.test.ts`。文件头 license JSDoc 必加(参照 Phase 2 模板)。

**关键约束**:

- `import { toApiModel, toApiModelOptional, fromApiModel, fromApiConversation, fromApiPaginatedConversations } from '@/common/adapter/apiModelMapper';`
- 纯函数测试,**不需要** mock httpBridge。
- 不用 fake timers。
- 类型安全:构造 input 使用 `Partial<TProviderWithModel>` + `as TProviderWithModel` 强制断言,避免 TS 报缺字段。

### 步骤 3.3 — 删除 `tests/unit/common-adapter/.gitkeep`(首次在该目录加文件时)

```bash
git rm tests/unit/common-adapter/.gitkeep
```

### 步骤 3.4 — 验证

```bash
bunx vitest run tests/unit/common-adapter/apiModelMapper.test.ts --reporter=verbose 2>&1 | tee /tmp/n3-phase3-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;passed >= 8
```

**FAIL 诊断**:

- `TypeError: Cannot destructure ...` → import 路径拼错;检查 `@/common/adapter/apiModelMapper`。
- 某个断言挂在 `toApiModelOptional` 期望 undefined 但得到对象 → 检查 `hasCompleteModelIdentity` 分支条件(id 为 `'   '` 空白串也要返回 undefined,因为源码用了 `.trim().length > 0`)。
- `fromApiConversation` 在 null 上挂 → 源码第 58 行 `if (!raw || typeof raw !== 'object') return raw;`,确保测试用的 `null` / `string` 原样返回。

### 步骤 3.5 — commit

```bash
git add tests/unit/common-adapter/
git commit -m "test(n3): add apiModelMapper unit tests (T1)

Cover toApiModel/toApiModelOptional roundtrip, fromApiConversation model
hydration + custom_workspace inference, and fromApiPaginatedConversations
item mapping. No mock needed — pure function suite."
```

---

## Phase 4 `searchMapper.test.ts`

**被测文件**:`packages/desktop/src/common/adapter/searchMapper.ts`(54 行)

### 步骤 4.1 — 断言清单(最少 5 个 test case)

| #    | 用例                                                       | 断言                                                                                                                              |
| ---- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| T2.1 | `fromApiSearchResult` 保留 total / has_more                | 输入 `{ items: [], total: 42, has_more: true }` → 输出 total=42, has_more=true, items.length=0                                    |
| T2.2 | items 按 `fromApiSearchItem` 映射:conversation fields 完整 | 输入一个完整 ApiMessageSearchItem(含 model、extra、pinned 等)→ 输出 conversation 经 fromApiConversation 转换;message 字段逐字透传 |
| T2.3 | conversation.model 为 null → conversation.model undefined  | 输入 item.conversation.model = null → 输出 conversation.model 为 undefined(由 `?? undefined` 处理)                                |
| T2.4 | message_type 作为 TMessage['type'] 透传                    | 输入 message_type = 'text' → 输出 message_type = 'text',字段不变                                                                  |
| T2.5 | 多 items 时逐个映射                                        | 输入 items = [a, b] → 输出 items = [f(a), f(b)];length 相等                                                                       |

### 步骤 4.2 — 写文件

用 Write 工具创建 `tests/unit/common-adapter/searchMapper.test.ts`。类型构造时 `as ApiMessageSearchItem` / `as PaginatedResult<...>` 强断言。

### 步骤 4.3 — 验证

```bash
bunx vitest run tests/unit/common-adapter/searchMapper.test.ts --reporter=verbose 2>&1 | tee /tmp/n3-phase4-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;passed >= 5
```

### 步骤 4.4 — commit

```bash
git add tests/unit/common-adapter/searchMapper.test.ts
git commit -m "test(n3): add searchMapper unit tests (T2)

Cover fromApiSearchResult pagination pass-through and per-item field
mapping (conversation via fromApiConversation, message fields pass-through)."
```

---

## Phase 5 `httpBridge.test.ts`

**被测文件**:`packages/desktop/src/common/adapter/httpBridge.ts`(421 行)

**重点**:此文件**直接测源码**,不走 mockHttpBridge。mock 对象只在后续 N4 领域测试里消费。

**环境约束**(requirements "关键风险" 节):

- 此 `.test.ts` 用 `@vitest-environment node`(默认);
- `window` 用 `vi.stubGlobal('window', ...)` 精准注入;
- 若要测 jsdom 分支,**另起** `httpBridge.dom.test.ts`(本里程碑**不强制要求**,node 分支足够覆盖三分支逻辑)。

### 步骤 5.1 — 断言清单(最少 12 个 test case)

| #     | 用例                                                                 | 实现要点                                                                                                                                                                                                                                                                                                           |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T3.1  | `getBaseUrl` 在 node 环境(无 window) 回退到 127.0.0.1:13400          | 无 stub → 调 `getBaseUrl()` → `http://127.0.0.1:13400`                                                                                                                                                                                                                                                             |
| T3.2  | `getBaseUrl` 从 `globalThis.__backendPort` 读端口                    | `(globalThis as any).__backendPort = 23456;` → 调 → `http://127.0.0.1:23456`                                                                                                                                                                                                                                       |
| T3.3  | `getBaseUrl` 从 `window.__backendPort` 优先读                        | `vi.stubGlobal('window', { __backendPort: 34567 })` → `http://127.0.0.1:34567`                                                                                                                                                                                                                                     |
| T3.4  | `getBaseUrl` WebUI 模式(window + document 且无 port)→ ''             | `vi.stubGlobal('window', {})`、`vi.stubGlobal('document', {})` → `getBaseUrl()` 返回空字符串                                                                                                                                                                                                                       |
| T3.5  | `httpGet` 构造 `{ provider, invoke }`,`provider` 是 no-op            | `const h = httpGet('/api/x'); h.provider(() => Promise.resolve()); expect(h.provider).toBeTypeOf('function')`;调用不报错,无副作用                                                                                                                                                                                  |
| T3.6  | `httpGet` invoke 触发 `fetch`,GET 无 body,wrap 解包                  | `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { x: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } })))`;调用 invoke;断言返回 `{ x: 1 }`(data 解包)                                                                                                 |
| T3.7  | `httpPost` invoke 序列化 body,传 content-type                        | 构造 fetch spy;调用 `httpPost('/api/x').invoke({ k: 'v' })`;断言 spy 被调用;args[1].method === 'POST',args[1].body 是 `JSON.stringify({k:'v'})`,headers 含 `Content-Type: application/json`                                                                                                                        |
| T3.8  | `httpPost` 传 `mapBody` 自定义映射                                   | `httpPost('/api/x', (p) => ({ wrapped: p })).invoke('raw')`;断言 fetch body = `'{"wrapped":"raw"}'`                                                                                                                                                                                                                |
| T3.9  | path 作为函数时以 params 展开                                        | `httpGet((p) => `/api/${p.id}`).invoke({ id: 'abc' })`;断言 fetch url 包含 `/api/abc`                                                                                                                                                                                                                              |
| T3.10 | 非 2xx 响应抛 `BackendHttpError` + code / status / backendMessage    | fetch 返回 `new Response(JSON.stringify({ success: false, error: 'bad', code: 'X_BAD' }), { status: 400, headers: {...} })`;`await expect(invoke).rejects.toBeInstanceOf(BackendHttpError)`;捕获后断言 status=400, code='X_BAD', backendMessage='bad'                                                              |
| T3.11 | 非 JSON 响应返回 `undefined`                                         | fetch 返回 `new Response('', { status: 200 })`(无 content-type) → invoke 返回 `undefined`                                                                                                                                                                                                                          |
| T3.12 | `stubProvider` 返回默认值 + 提供 no-op provider                      | `stubProvider('test', 42).invoke()` → 42;`console.warn` spy 被触发                                                                                                                                                                                                                                                 |
| T3.13 | `isBackendHttpError` instanceof 分支                                 | 对 new BackendHttpError(...) 返回 true                                                                                                                                                                                                                                                                             |
| T3.14 | `isBackendHttpError` duck-typing 分支                                | 构造普通对象 `{ name: 'BackendHttpError', status: 500, code: 'X' }` → 返回 true;缺少 status → false                                                                                                                                                                                                                |
| T3.15 | `withResponseMap` 包装 `httpGet`,data → mapped 透传 + provider no-op | 构造 fetch spy → `const inner = httpGet('/x'); const mapped = withResponseMap(inner, (d: any) => d.raw.toUpperCase())`;invoke → 'ABC'(从 `{raw:'abc'}`)                                                                                                                                                            |
| T3.16 | `wsEmitter(eventName).on(cb)` 返回 unsubscribe                       | 调 on 返回函数;调用该函数后再调 emit,cb 不应被触发(**注意**:源码 L394 的 emit 本身是 no-op,测试里不直接测 emit 的触发,而是测 `.on` 行为 + 订阅 registry 通过调试接口可检)。实际操作:用 `vi.stubGlobal('WebSocket', MockWsCtor)` 伪造 WS,触发 message event 来验证 cb 收到;unsubscribe 后再触发 message,cb 不再收到 |
| T3.17 | `wsMappedEmitter` transform 应用                                     | 同上套路 + transform:`(raw: any) => raw.v * 2`;触发 WS message payload = `{v: 3}` → cb 收到 `6`                                                                                                                                                                                                                    |
| T3.18 | `stubEmitter` on 返回无害 unsubscribe                                | `const e = stubEmitter('x'); const off = e.on(() => {}); off();` 无报错                                                                                                                                                                                                                                            |

**最低 12 个用例**(T3.1-T3.12 或等价组合);推荐落 15 以上,完整覆盖 httpBridge.ts 的分支。

### 步骤 5.2 — 写文件

用 Write 工具创建 `tests/unit/common-adapter/httpBridge.test.ts`。

**关键约束**:

- 文件顶部 `// @vitest-environment node`(默认就是 node,显式标注以防后续调整全局 env)。
- 每个 test 用 `beforeEach` + `afterEach` 清理 `vi.unstubAllGlobals()` / `vi.clearAllMocks()`。
- **禁用** `vi.restoreAllMocks()`(会移除 `vi.mock`,本文件虽无 `vi.mock` 但避免形成习惯;记忆里已有教训)。
- `fetch` 用 `vi.stubGlobal('fetch', vi.fn()....)`;`console.warn` / `console.debug` / `console.error` 用 `vi.spyOn` 避免噪声。
- 注意 WebSocket mock:htts httpBridge.ts L307 `new WebSocket(url)`,node 没有全局 WebSocket,需要 `vi.stubGlobal('WebSocket', class { ... })`;class 需暴露 `readyState`、`addEventListener`(message/open/close/error)、`close()`,并静态常量 `OPEN=1 / CONNECTING=0 / CLOSED=3`。

### 步骤 5.3 — 验证

```bash
bunx vitest run tests/unit/common-adapter/httpBridge.test.ts --reporter=verbose 2>&1 | tee /tmp/n3-phase5-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;passed >= 12
```

**FAIL 诊断路径**:

- `ReferenceError: WebSocket is not defined` → 未 stub WebSocket 全局;在 `beforeEach` 加 `vi.stubGlobal('WebSocket', FakeWs)` + 静态常量。
- `Cannot read properties of undefined (reading '__backendPort')` → T3.4 WebUI 模式没 stub document;源码判断 `typeof window !== 'undefined' && typeof document !== 'undefined'`,两个都要 stub。
- `expect(fetch).toHaveBeenCalled()` 失败 → 检查 invoke 是否真的 await;fetch spy 的 resolvedValue 要是 `Response` 实例(不要用 `{ ok: true, status: 200 }` 裸对象,源码会调 `.json()`)。
- `BackendHttpError` instanceof 返回 false → 可能 Vitest HMR 分 module,但本文件单独跑不应出现;若复现,改用 `isBackendHttpError()` duck-typing 验证。
- T3.6 期待解包 data 字段:源码 L176-179 `if (json && typeof json === 'object' && 'data' in json) return json.data as T;`,测试 Response body 必须包 `{ data: ... }`。
- T3.11 预期 undefined:源码 L170-173 对无 JSON content-type 直接返回 undefined;测试 Response 不要带 content-type header。

### 步骤 5.4 — commit

```bash
git add tests/unit/common-adapter/httpBridge.test.ts
git commit -m "test(n3): add httpBridge unit tests (T3)

Cover getBaseUrl three-branch port resolution (window/globalThis/fallback),
httpGet/httpPost/httpPut/httpPatch/httpDelete factory shape and fetch
integration, BackendHttpError envelope parsing with code/status/
backendMessage, stubProvider default + warn, withResponseMap mapping, and
wsEmitter/wsMappedEmitter subscribe/dispatch via stubbed WebSocket."
```

---

## Phase 6 `configMigration.test.ts`

**被测文件**:`packages/desktop/src/common/config/configMigration.ts`(222 行)

### 步骤 6.1 — 断言清单(最少 8 个 test case)

**`migrateConfigStorage`** 依赖 `httpRequest`(内部 import `@/common/adapter/httpBridge`);必须 `vi.mock('@/common/adapter/httpBridge')`。

**`migrateProviders`** 依赖 `ipcBridge.mode.listProviders.invoke()` / `ipcBridge.mode.createProvider.invoke()`;import 来自 `@/common`(re-export `adapter/ipcBridge`);必须 `vi.mock('@/common')` stub 出 `ipcBridge.mode.*` 两个方法。

| #     | 用例                                                                  | 断言关键点                                                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T4.1  | `migrateConfigStorage` 空 configFile:无 key 被写入                    | `configFile.get` 全部 reject or 返回 undefined → `httpRequest` 未被调用(spy 0 次);console.info 命中 "skipped"                                                                                                                                                                 |
| T4.2  | `migrateConfigStorage` 收集多个 legacy key → 一次 PUT                 | `configFile.get` 对 `'language'` 返回 `'zh-CN'`、`'theme'` 返回 `'dark'`,其它 reject;httpRequest 被调用 1 次,method='PUT', path='/api/settings/client', body 包含 language/theme                                                                                              |
| T4.3  | `migrateConfigStorage` 忽略 null 值                                   | `configFile.get` 某些 key 返回 null → 不进入 entries;对应 key 不在 body 里                                                                                                                                                                                                    |
| T4.4  | `migrateConfigStorage` configFile.get 抛异常 → 该 key 跳过            | `configFile.get` 抛错 → 被 catch,该 key 不在 entries                                                                                                                                                                                                                          |
| T4.5  | `migrateProviders` alreadyDone=true → 提前返回                        | `configFile.get('migration.electronProvidersImported')` 返回 true → 不读 model.config,`ipcBridge.mode.listProviders.invoke` 未被调用                                                                                                                                          |
| T4.6  | `migrateProviders` backend 已有 provider → skip + 写入 migration flag | `listProviders.invoke` 返回 `[{id:'x'}]` → 不读 model.config,最终 `configFile.set('migration.electronProvidersImported', true)` 被调 1 次                                                                                                                                     |
| T4.7  | `migrateProviders` 正常 case:4 个 legacy → 4 次 create + 置 flag      | backend 返回 `[]`;configFile.get('model.config') 返回 4 个 provider;`createProvider.invoke` 被调用 4 次;各次 body 字段 snake_case 正确(base_url/api_key/models/context_limit/bedrock_config 等)                                                                               |
| T4.8  | `migrateProviders` 单条失败不中断全流程                               | `createProvider.invoke` 第 2 条 rejects('fail'),其它成功 → 最后仍 set 'migration.electronProvidersImported' = true;console.warn 至少 1 次                                                                                                                                     |
| T4.9  | `migrateProviders` bedrockConfig 映射                                 | 输入含 `bedrockConfig: { authMethod: 'accessKey', region: 'us-east-1', accessKeyId: 'x', secretAccessKey: 'y' }` → createProvider body 里 `bedrock_config: { auth_method: 'accessKey', region: 'us-east-1', access_key_id: 'x', secret_access_key: 'y', profile: undefined }` |
| T4.10 | `migrateProviders` modelHealth → model_health 字段转 snake_case       | `modelHealth: { 'gpt-4': { status: 'healthy', lastCheck: 100, latency: 50 } }` → body 里 `model_health: { 'gpt-4': { status: 'healthy', last_check: 100, latency: 50, error: undefined } }`                                                                                   |

至少 8 个(T4.1-T4.8);推荐 10 个。

### 步骤 6.2 — 删除 `tests/unit/common-config/.gitkeep`

```bash
git rm tests/unit/common-config/.gitkeep
```

### 步骤 6.3 — 写文件

**文件顶部 mock 设置**(关键,必须遵守):

```ts
import { vi } from 'vitest';

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: vi.fn(),
  // 其他导出不需要,不会被 configMigration 直接 import
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: vi.fn(), provider: vi.fn() },
      createProvider: { invoke: vi.fn(), provider: vi.fn() },
    },
  },
}));

// 其后再 import 被测模块
import { migrateConfigStorage, migrateProviders } from '@/common/config/configMigration';
import { httpRequest } from '@/common/adapter/httpBridge';
import { ipcBridge } from '@/common';
```

**每个 test 的 `beforeEach`**:

- `vi.clearAllMocks()`(清 call history,不删 mock 本身)
- 准备新的 `configFile` stub:`{ get: vi.fn(), set: vi.fn() }`

**禁用** `vi.restoreAllMocks()`(会把 `vi.mock` 也还原,破坏模块替换)。

### 步骤 6.4 — 验证

```bash
bunx vitest run tests/unit/common-config/configMigration.test.ts --reporter=verbose 2>&1 | tee /tmp/n3-phase6-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;passed >= 8
```

**FAIL 诊断路径**:

- `httpRequest is not a function` → `vi.mock` 顺序错;必须**先** `vi.mock()` 再 `import`。ESM 下 vitest hoist vi.mock 到顶,但显式让它在 import 前书写避免读者困惑。
- `ipcBridge.mode.listProviders.invoke is not a function` → mock 工厂 return 的 shape 不匹配;检查 requirements 下引用的 adapter `ipcBridge.mode` 名字,源码 ipcBridge.ts ~L(mode 对象)定义了 `listProviders` / `createProvider`。
- T4.7 某 provider body 的字段名错 → 对照源码 L180-202 的 `requests.map(...).req`(id/platform/name/base_url/api_key/models/enabled/capabilities/context_limit/model_protocols/model_enabled/model_health/bedrock_config)。
- T4.8 testing `.catch` 的 warn 但没被触发 → 源码 L205-212 用 `Promise.allSettled`,失败走 rejected 分支 → console.warn;确保测试没 await 某条 reject 的 promise 导致 unhandled rejection(记忆教训:reject promise 必须先绑 handler)。

### 步骤 6.5 — commit

```bash
git add tests/unit/common-config/configMigration.test.ts
git commit -m "test(n3): add configMigration unit tests (T4)

Cover migrateConfigStorage empty/normal/null/error paths (httpRequest PUT
to /api/settings/client) and migrateProviders guard flag, backend-populated
skip, bulk import with per-item failure tolerance, and legacy camelCase →
snake_case field mapping (bedrock_config, model_health)."
```

---

## Phase 7 `storage.test.ts`

**被测文件**:`packages/desktop/src/common/config/storage.ts`(594 行,**绝大多数是 type alias**)

### 7.1 — 范围澄清(requirements 已定)

- storage.ts 的 runtime-exports:
  - `ConfigStorage` = `storage.buildStorage<IConfigStorageRefer>('agent.config')`
  - `EnvStorage` = `storage.buildStorage<IEnvStorageRefer>('agent.env')`
  - `BUILTIN_IMAGE_GEN_ID` = `'builtin-image-gen'`(string constant)
- 其它都是 type alias(IChatConversation、TChatConversation、IProvider、IMcpServer、ModelCapability、ICssTheme 等)—— 按 requirements"仅测导出的 runtime 代码,不测 pure type alias",我们只测 runtime。

### 步骤 7.1 — 断言清单(最少 5 个 test case)

| #    | 用例                                                                           | 断言                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T5.1 | `BUILTIN_IMAGE_GEN_ID` 是 'builtin-image-gen'                                  | `expect(BUILTIN_IMAGE_GEN_ID).toBe('builtin-image-gen')`(稳定 ID,被 builtin MCP server 引用)                                                                                                                                                                |
| T5.2 | `ConfigStorage` 暴露 storage.buildStorage 返回的 storage shape(get/set/remove) | `expect(typeof ConfigStorage.get).toBe('function')`;`expect(typeof ConfigStorage.set).toBe('function')`(见 @office-ai/platform 的 storage.buildStorage 实际返回 shape)                                                                                      |
| T5.3 | `EnvStorage` 与 ConfigStorage 不同实例(namespaces 不同)                        | `expect(ConfigStorage).not.toBe(EnvStorage)`(至少是两个不同引用)                                                                                                                                                                                            |
| T5.4 | `ConfigStorage` namespace 参数 'agent.config' 生效 → set/get roundtrip         | `await ConfigStorage.set('language', 'zh-CN'); await ConfigStorage.get('language')` → `'zh-CN'`。**注意**:若 `storage.buildStorage` 默认走 electron 的 persist,node 环境下会挂;必须 `vi.mock('@office-ai/platform', ...)` 替换为 in-memory 实现(见步骤 7.2) |
| T5.5 | `EnvStorage` set/get roundtrip with `aionui.dir` 对象                          | `await EnvStorage.set('aionui.dir', { workDir: '/a', cacheDir: '/b' }); await EnvStorage.get('aionui.dir')` → 原对象                                                                                                                                        |

至少 5 个。如果 `@office-ai/platform` 的 storage 是很薄的 facade,测 roundtrip 没意义,executor 可把 T5.4 / T5.5 合并成"import 不抛"型 smoke 测试,但**至少必须有 5 个独立 test case**。

### 步骤 7.2 — 写文件 + mock 策略

```ts
import { vi } from 'vitest';

// In-memory stub for @office-ai/platform storage.
vi.mock('@office-ai/platform', () => {
  function buildStorage<T extends Record<string, unknown>>(namespace: string) {
    const store = new Map<keyof T, unknown>();
    return {
      namespace,
      get: vi.fn(async <K extends keyof T>(k: K): Promise<T[K] | undefined> => store.get(k) as T[K] | undefined),
      set: vi.fn(async <K extends keyof T>(k: K, v: T[K]): Promise<void> => {
        store.set(k, v);
      }),
      remove: vi.fn(async <K extends keyof T>(k: K): Promise<void> => {
        store.delete(k);
      }),
    };
  }
  return {
    storage: { buildStorage },
    // 其它 @office-ai/platform 导出不被 storage.ts 直接用,无需 stub
  };
});

import { ConfigStorage, EnvStorage, BUILTIN_IMAGE_GEN_ID } from '@/common/config/storage';
```

**注意**:若 storage.ts 被其它 test(如 T4 configMigration)间接触发 `@office-ai/platform` real load,本 test 的 mock 只影响自身文件,不会污染其它文件 —— vitest `vi.mock` 是 file-scoped。

### 步骤 7.3 — 验证

```bash
bunx vitest run tests/unit/common-config/storage.test.ts --reporter=verbose 2>&1 | tee /tmp/n3-phase7-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;passed >= 5
```

### 步骤 7.4 — commit

```bash
git add tests/unit/common-config/storage.test.ts
git commit -m "test(n3): add storage runtime exports unit tests (T5)

Cover BUILTIN_IMAGE_GEN_ID constant, ConfigStorage/EnvStorage namespaces
and set/get roundtrip via in-memory @office-ai/platform mock."
```

---

## Phase 8 本地门禁(UC-F-5 Step 1)

### 步骤 8.1 — 四件套 + 覆盖率

```bash
cd /Users/zhoukai/Documents/github/AionUi

# 1. Lint
bun run lint 2>&1 | tee /tmp/n3-phase8-lint.log | tail -30
echo "exit=$?"
# 预期:退出 0(允许 warnings,不允许 errors)。输出末尾:"Found N warnings and 0 errors."

# 2. TSC
bunx tsc --noEmit 2>&1 | tee /tmp/n3-phase8-tsc.log | tail -30
echo "exit=$?"
# 预期:退出 0,无输出行 / "error TS..."

# 3. Vitest full
bunx vitest run --reporter=verbose 2>&1 | tee /tmp/n3-phase8-vitest.log | tail -40
echo "exit=$?"
# 预期:退出 0;测试数 >= 30(清单最低)。按 requirements 期望 30-50
#       范围。关键断言行:"Tests  N passed (N)" 且无 failed/skipped。

# 4. prek
prek run --from-ref origin/feat/backend-migration --to-ref HEAD 2>&1 | tee /tmp/n3-phase8-prek.log | tail -30
echo "exit=$?"
# 预期:退出 0;所有 hook Passed 或 Skipped(无 Failed)。
#       如果 oxfmt 自动修复后 Passed,也算 OK;若报 Failed 而未修复,
#       检查 /tmp/n3-phase8-prek.log 的输出,跑对应 auto-fix 命令后重跑。
```

### 步骤 8.2 — 覆盖率展示(不 gate,仅 handoff 用)

```bash
bunx vitest run --coverage 2>&1 | tee /tmp/n3-phase8-coverage.log | grep -E "(apiModelMapper|searchMapper|httpBridge|configMigration|storage|File).*\|"
# 预期:输出 6 个文件的 % Stmts、% Branch、% Funcs、% Lines 列。handoff 里贴原表。
#       若 apiModelMapper / searchMapper 覆盖 < 70% → 检查是否漏了某个分支。
#       httpBridge 允许 < 80%(WS 重连的 scheduleWsReconnect 分支较难穷尽)。
```

### 步骤 8.3 — 无 skip/todo 证据

```bash
grep -rnE "\.skip\(|\.todo\(|test\.skip|it\.skip|xtest\(|xit\(" tests/unit/ | tee /tmp/n3-phase8-skip.log
# 预期:无输出(空)。非空 → UC-F-4 违规,必须改成正常 test 或删除。
```

### 步骤 8.4 — 清单齐全

```bash
for f in \
  tests/unit/_helpers/mockHttpBridge.ts \
  tests/unit/_helpers/mockHttpBridge.test.ts \
  tests/unit/common-adapter/apiModelMapper.test.ts \
  tests/unit/common-adapter/searchMapper.test.ts \
  tests/unit/common-adapter/httpBridge.test.ts \
  tests/unit/common-config/configMigration.test.ts \
  tests/unit/common-config/storage.test.ts; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done
echo "N3 file checklist OK"
# 预期:N3 file checklist OK
```

### 步骤 8.5 — helper 被测试实际 import

```bash
grep -rn "mockHttpBridge" tests/unit/common-adapter tests/unit/common-config 2>&1 | tee /tmp/n3-phase8-helper-use.log
# 预期:**至少一行输出**,确认 helper 已被消费。
#       **注意**:requirements §验收标准第 2 条要求 helper 被至少 1 个 N3 测试 import,
#       T3-T7 里至少一个要用它。T1 / T2(纯函数)无需 mock,T3(直测 httpBridge)
#       不用 mock,T4(configMigration)在 Phase 6 中推荐复用 asModule() 的写法
#       替代手写 httpRequest mock,以满足此要求。
#
#       若 0 行输出 → executor 回到 Phase 6,把 configMigration.test.ts 的
#       httpRequest mock 改为 createMockHttpBridge().asModule(),或在 T4 之外
#       新增一个使用 helper 的小 demo 测试(不算入 T1-T6 计数)。
```

**如果 step 8.5 输出为 0**:executor **必须**先回到 Phase 6 重构 T4,让 T4 通过 `createMockHttpBridge().asModule()` 作为 `vi.mock('@/common/adapter/httpBridge')` 的工厂(把 `httpRequest` 手动 stub 改成走 helper),确保至少一个域测试使用 helper 验证可用性。重构完重跑 Phase 6 步骤 6.4,重跑本阶段。

### 步骤 8.6 — Phase 8 无 commit

Phase 8 没有文件改动(只跑验证命令),**不 commit**。若修复了任何遗漏(如补充 test case),按所属 Phase 的 commit 模板追加新 commit。

---

## Phase 9 基线同步 + 复跑(UC-F-5 Step 3-4)

### 步骤 9.1 — merge 最新 `origin/feat/backend-migration`

```bash
cd /Users/zhoukai/Documents/github/AionUi

git fetch origin feat/backend-migration
# 预期:无错误

git log --oneline HEAD..origin/feat/backend-migration | head -10
# 情况 A(推荐):无输出 → 基线没有新 commit,跳到步骤 9.3(complete 复跑)
# 情况 B:有输出 → 执行步骤 9.2

git rev-parse origin/feat/backend-migration > /tmp/n3-phase9-base-sha.txt
cat /tmp/n3-phase9-base-sha.txt
# 期望与 Phase 0 的 base-sha.txt 对比:是否变化
```

### 步骤 9.2 — 执行 merge(**只在情况 B 下跑**)

```bash
git merge origin/feat/backend-migration --no-ff -m "chore(n3): sync with feat/backend-migration"
# 预期无冲突 → "Merge made by the 'ort' strategy"

# 若冲突:
#   - 简单文件级冲突 + executor 有信心 → 手动 resolve → git add + git commit
#   - 复杂冲突(tests/unit/** 上游动了 / common/adapter/** 上游改了)→ STOP,escalate
```

### 步骤 9.3 — 复跑完整门禁(Step 4)

```bash
# Step 4 标准顺序
bun run lint 2>&1 | tee /tmp/n3-phase9-lint.log | tail -10
echo "exit=$?"
# 预期:退出 0

bunx tsc --noEmit 2>&1 | tee /tmp/n3-phase9-tsc.log | tail -10
echo "exit=$?"
# 预期:退出 0

bunx vitest run --reporter=verbose 2>&1 | tee /tmp/n3-phase9-vitest.log | tail -10
echo "exit=$?"
# 预期:退出 0;passed 与 Phase 8 一致 / 可接受增加(上游加 test 的话)

prek run --from-ref origin/feat/backend-migration --to-ref HEAD 2>&1 | tee /tmp/n3-phase9-prek.log | tail -10
echo "exit=$?"
# 预期:退出 0
```

**复跑失败处理**:

- 基线引入破坏 → STOP,escalate
- 本里程碑和基线的隐性冲突 → 修 + 新建 commit(不 amend)+ handoff Deviations 节如实说

### 步骤 9.4 — push 分支

```bash
git push -u origin feat/n3-test-rewrite-adapter-common
# 预期:成功 + 打印 "Branch 'feat/n3-test-rewrite-adapter-common' set up to track..."

git rev-parse HEAD > /tmp/n3-phase9-final-sha.txt
cat /tmp/n3-phase9-final-sha.txt
# 预期:输出 N3 最终 SHA,写进 handoff
```

**禁止**:

- `git push origin HEAD:feat/backend-migration`(合共享分支)
- `git push origin HEAD:dev`(合 dev,直接触发 CI)
- `gh workflow run` / `gh pr create`(违反 UC-F-2)

---

## Phase 10 写 handoff + SendMessage

### 步骤 10.1 — 创建 `docs/backend-migration/handoffs/N3-outcome.md`

用 Write 工具创建。**严格按 cheatsheet §"写 handoff" 的模板**,≤ 700 字。

**必填节**:

1. **已交付**:7 个文件清单
2. **与计划的偏离**:如无写"无"
3. **给下一个里程碑的提醒**:N4 必须使用 `createMockHttpBridge` 的 asModule 写法(Phase 8 步骤 8.5 证明 helper 已在 N3 被消费)
4. **验证证据(UC-F-1,贴原始输出)**:
   - 分支名 + 最新 SHA(从 `/tmp/n3-phase9-final-sha.txt` 读)
   - 基线同步状态:从 `/tmp/n3-phase9-base-sha.txt` 读
   - lint / tsc / vitest / prek 的头 10 尾 10 + 总行数 + 退出码(从 /tmp/n3-phase9-\*.log 读)
   - 每个新增 test file 对应的 `✓` 行(从 /tmp/n3-phase2..7 各自 tail 截取)
   - 覆盖率表(从 /tmp/n3-phase8-coverage.log 截取 6 个文件行)
   - grep skip/todo 空输出证据(/tmp/n3-phase8-skip.log)
   - helper-use 证据(/tmp/n3-phase8-helper-use.log)
5. **锁定的 helper 签名**:**原样贴**本 plan §2.1 的整块 TypeScript 签名(禁止改写 / 精简,N4 依赖此)
6. **Backend 修改**(UC-G):本里程碑**无** backend 改动(纯前端测试,不调用真实 backend),handoff 写"无"
7. **Backend 问题发现**:无(本里程碑未触发真实网络调用)
8. **遗留问题 / 跟进项**:N4 的使用注意事项(如 helper 扩展需 escalate)

### 步骤 10.2 — 追加 commit

```bash
git add docs/backend-migration/handoffs/N3-outcome.md
git commit -m "docs(n3): add N3 handoff with UC-F evidence and locked mockHttpBridge signature

Records 7 deliverables (helper + 6 test files), quality gate outputs
(lint / tsc / vitest / prek), coverage snapshot for the 6 source files,
and the frozen mockHttpBridge public API that N4 must consume unchanged."

git push origin feat/n3-test-rewrite-adapter-common
# 预期:成功,带 handoff 的 N3 分支 ready

git rev-parse HEAD > /tmp/n3-phase10-final-sha.txt
# 最终 SHA,handoff 里可能已写,push 后用此 SHA 更新一次
```

### 步骤 10.3 — SendMessage 给 team-lead

```
SendMessage({
  to: "team-lead",
  message: "N3 完成。
  - 分支:feat/n3-test-rewrite-adapter-common
  - SHA:<从 /tmp/n3-phase10-final-sha.txt 读>
  - 基线同步:origin/feat/backend-migration @ <从 /tmp/n3-phase9-base-sha.txt 读> 已合入(或 Already up to date)
  - Handoff:docs/backend-migration/handoffs/N3-outcome.md
  - Test files delivered: 6(helper + 5 domain tests;helper 被 T4 消费)
  - Total tests passed: <N>(vitest full run)
  - UC-F 证据:命令输出 ✓ / helper-use ✓ / 无 skip ✓ / 基线后复跑 ✓ / Backend 改动 无
  - 签名锁定:见 handoff §锁定的 helper 签名
  - 偏离计划:<无 / 列出>
  请启动 N4 plan-writer。"
})
```

### 步骤 10.4 — TaskUpdate(由本次 plan-writer 本体执行,不是 executor)

> **给 plan-writer 的提示**:plan 写完后 TaskUpdate task #2 为 completed;executor 会在自己会话 TaskUpdate #4 为 in_progress → completed。

---

## 11. 失败诊断路径汇总

| 失败现象                                           | 看哪个日志                    | 诊断方向                                                                              |
| -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `bun install` 挂                                   | 终端实时                      | 网络 / lockfile 损坏 → `rm -rf node_modules && bun install`                           |
| vitest 找不到 test                                 | /tmp/n3-phaseX-vitest.log     | 文件名必须 `.test.ts` 且在 `tests/unit/**`;检查 vitest.config.ts include(不改)        |
| vitest alias `@/` 无法解析                         | /tmp/n3-phaseX-vitest.log     | `vitest.config.ts` L4-12 的 aliases;trailing slash 和源码 `@/*`(tsconfig paths)区分开 |
| tsc 报 "Cannot find module '@/common/...'"         | /tmp/n3-phase8-tsc.log        | `tsconfig.json` paths 未指向 packages/desktop/src(M1 已建,通常不应出现)               |
| `vi.mock('@office-ai/platform', ...)` 未生效       | vitest run 日志               | vi.mock 必须在 import 被测模块**之前**声明(vitest ESM 会 hoist,但显式先写更安全)      |
| `BackendHttpError` instanceof 判负                 | 对应 test 的断言栈            | 跨模块 HMR 分 chunk,概率极小;对测试场景改用 `isBackendHttpError()` duck-typing        |
| WebSocket 相关 test 挂 "ReferenceError: WebSocket" | vitest 日志                   | `vi.stubGlobal('WebSocket', FakeClass)` 缺失 / FakeClass 缺静态常量 OPEN/CONNECTING   |
| coverage 报告 apiModelMapper < 70%                 | /tmp/n3-phase8-coverage.log   | 检查是否遗漏 `toApiModelOptional(undefined)` / `fromApiConversation(null)` 等分支     |
| prek Oxfmt 报 Failed,未自动修复                    | /tmp/n3-phase8-prek.log       | `bun run format` → 再跑 prek;修复 diff 要 commit(commit message `style(n3): ...`)     |
| merge 基线冲突                                     | `git status` + 冲突文件       | 简单 resolve;复杂 → STOP,escalate                                                     |
| push 被拒 `non-fast-forward`                       | push 命令输出                 | 说明别人在远程提前创建了同名分支;**不得** `--force`,STOP,escalate                     |
| `grep -rn "mockHttpBridge" tests/unit/common-*` 空 | /tmp/n3-phase8-helper-use.log | 回到 Phase 6 把 T4 改为消费 helper(见 §步骤 8.5)                                      |

---

## 12. 回滚指令(三档)

### 本地未 push

```bash
# 放弃所有未 push 的本地提交
git checkout feat/n2-legacy-test-cleanup      # 或 origin/feat/n2-legacy-test-cleanup
git branch -D feat/n3-test-rewrite-adapter-common
# 完全回到 N2 状态
```

### 已 push 但下游 N4 / N5 未启动

```bash
# 删远程分支,本地重做
git push origin --delete feat/n3-test-rewrite-adapter-common
git checkout feat/n2-legacy-test-cleanup
git branch -D feat/n3-test-rewrite-adapter-common
# 重新 checkout 新分支开工(Phase 1 起)
```

### 已 push 且下游 N4 已基于 N3 开工

**不要**删除远程分支。做法:

- 在 `feat/n3-test-rewrite-adapter-common` 上**新建修复 commit**(绝不 amend / rebase 历史)
- handoff 里 Deviations 节如实说明修复
- push 后 SendMessage 给 team-lead 告知 N4 teammate `git pull` 拉修复

**整链已完成,才发现 N3 有方向性问题**:由 team-lead / 人类决定整链重做 / 补丁 / 接受现状。teammate 不自主决策。

---

## 13. commit 策略总览

| Phase  | Commit message 模板                                                                |
| ------ | ---------------------------------------------------------------------------------- |
| 2      | `test(n3): add mockHttpBridge helper with frozen public signatures` + 签名锁定说明 |
| 3      | `test(n3): add apiModelMapper unit tests (T1)`                                     |
| 4      | `test(n3): add searchMapper unit tests (T2)`                                       |
| 5      | `test(n3): add httpBridge unit tests (T3)`                                         |
| 6      | `test(n3): add configMigration unit tests (T4)`                                    |
| 7      | `test(n3): add storage runtime exports unit tests (T5)`                            |
| 9      | `chore(n3): sync with feat/backend-migration`(merge commit,若基线有更新)           |
| 9 修复 | `test(n3): fix <phaseX> after baseline sync`(若基线同步后需要修 bug)               |
| 10     | `docs(n3): add N3 handoff with UC-F evidence and locked mockHttpBridge signature`  |

**禁止** 的 commit 模式:

- `wip`
- `.skip` 任何 test 的 commit
- 同一 Phase 内多次 amend(改完要新 commit)
- 合多个 Phase 成一个巨型 commit
- `style(n3): format` 单独改格式的 commit 允许,但应尽量靠自动 oxfmt 在 prek 阶段统一处理

---

## 14. 业务功能自动化验证

N3 不涉及 runtime behavior change —— 所有交付物都是**测试文件**。业务功能验证的机械化方式:

- **testing 过程即验证**:每个 `.test.ts` 通过 = 对应 runtime 行为得到断言覆盖
- **coverage 展示**(见 Phase 8 步骤 8.2):6 个被测文件的 statement 覆盖率作为"断言多少分支"的机械指标
- **无需 e2e / bun start**:本里程碑不启动 electron,不跑 webui,不跑 build(这些都是 N1 / N5 的责任)

因此"业务功能自动化验证"对本里程碑的唯一落地:**vitest run 全绿 + 覆盖率报告贴进 handoff**。

---

## 15. 自查清单(plan 提交前)

plan-writer 自查通过后才能 SendMessage 给 team-lead:

- [ ] 签名锁(§2.1)完整、可读、无 TODO 占位
- [ ] 每个 Phase 都有 commit 策略(§13 已列)
- [ ] 每个命令都可 copy-paste(无 `<your-name>` 等占位)
- [ ] 每个验证都能机械判定 PASS/FAIL(无"肉眼检查")
- [ ] Phase 0 有基线快照(§Phase 0)
- [ ] Phase 1 有工具预检(§4)+ 分支创建
- [ ] 平台兼容(§5):本 plan 不依赖 macOS-only 命令
- [ ] 失败诊断路径(§11)覆盖 ≥ 10 种常见情况
- [ ] 回滚指令(§12)三档齐全
- [ ] 上游 handoff 字段映射(§3)
- [ ] 最后三步(sync + push + SendMessage,Phase 9-10)
- [ ] 约束 executor 不创建 PR、不合回共享分支、不 rebase(§"给 executor 的硬约束速记" + §9.4 禁止)
- [ ] mockHttpBridge 签名已锁,N4 依赖清晰(§2.2)
- [ ] 反偷懒(UC-F)每个 checkpoint 都有贴原始输出要求(Phase 8-10)
- [ ] 整体篇幅控制在合理范围(本 plan ≈ 1000 行,含命令块)

本 plan 已通过自查;executor 可按 Phase 0 → Phase 10 顺序执行。
