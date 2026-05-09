# N4 领域层测试重写(54 文件) — 详细实施 plan

- **日期**:2026-05-08
- **里程碑**:N4
- **本 plan 读者**:零上下文的 N4a / N4b / N4c executor 三个并行 agent
- **上游分支**:`origin/feat/n3-test-rewrite-adapter-common` @ `df071f82a`
- **本里程碑分支**:`feat/n4-test-rewrite-domains`(**三个 executor 共用同一分支,不开子分支**)
- **不创建 PR、不合回共享分支、不 rebase 上游分支**。**允许**为合并同分支并行推送使用 `git pull --rebase`(仅针对 N4 自己的分支)。

---

## 0. 给 executor 的硬约束速记(必读)

> executor 在按 Phase 执行前,必须**逐条**遵守:

- 必须**完整读完** `docs/backend-migration/plans/2026-05-08-cleanup-teammate-cheatsheet.md`(UC-F 5 条 + UC-G 跨仓规则)。
- 必须**完整读完** `docs/backend-migration/plans/2026-05-08-n4-test-rewrite-domains-requirements.md`(需求 + 覆盖清单)。
- 必须**完整读完** `docs/backend-migration/handoffs/N3-outcome.md`(N3 交付的 mockHttpBridge 锁定签名 + "N4 使用约束" + "遗留问题")。
- 本 plan 的**并行协调规则**(§N4 并行协调)必须严格遵守;撞车一定是越界,escalate,不自行合并。
- 禁止修改 `tests/unit/_helpers/mockHttpBridge.ts`(helper 签名已冻结,要改必须 escalate team-lead)。
- 禁止改源码(N4 只写测试;**小 bug** 按 requirements 决策表写"文档化现状"断言,**大 bug** 按 UC-G 跨仓改 backend 或 escalate)。
- 禁止 `.skip` / `.todo` / `xit` / `xtest`(UC-F-4)。
- 禁止 push / merge 到 `dev` / `feat/backend-migration` / `feat/n3-test-rewrite-adapter-common`(UC-F-2)。
- 禁止 `gh workflow run` / `gh pr create`。
- 禁止改 `vitest.config.ts`(UC-C 锁,N2 已冻结)。
- 禁止引入新 mock 库(msw / nock / sinon 等)。
- 禁止碰其他分区的目录:N4a 只动 `tests/unit/{assistants,skills,extension}`;N4b 只动 `tests/unit/{providers,system,cron}`;N4c 只动 `tests/unit/{previews,assets,bootstrap}`。
- **每个 Phase 结束都必须 commit**,commit message 按 §13 模板。
- **每个 Phase 的验证命令的原始输出**(头 10 + 尾 10 + 总行数 + 退出码)必须在本地落盘 `/tmp/n4{a,b,c}-phaseX-*.log`,handoff 时照搬(UC-F-1)。
- **每个 Phase 末尾的 NEXT STEP 指令必须立即执行**,写完 commit 不准 idle。若遇阻塞 → SendMessage 向 team-lead 报告再停(见 §14 反 idle)。

---

## 1. 里程碑全景

本里程碑交付 **54 个新测试文件**,分三路并行(N4a 19 + N4b 18 + N4c 17),总 test case 目标 **≥ 180**(平均每个文件 ≥ 3;L3 DOM 测试每个 ≥ 5)。

**数字对齐**:requirements §"覆盖清单"里 N4a 19 / N4b 18 / N4c 19 加起来是 56;而表头合计 54。本 plan 严格按 requirements 表格的"54 个路径数组"为准,N4c 实为 **17 文件**(Previews 12 + Assets 2 + Bootstrap 3)而非 19。plan 以 requirements 文末"TESTS=(54 条路径)"数组为权威。

加 N3 的 6 个文件合计 60,满足总设计 UC-D "≥ 60" 的硬要求。

### 1.1 三分区划分

| 分区    | 目录                                       | 文件数              | 源码领域                          |
| ------- | ------------------------------------------ | ------------------- | --------------------------------- |
| **N4a** | `tests/unit/{assistants,skills,extension}` | 12 + 4 + 3 = **19** | assistants / skills / extension   |
| **N4b** | `tests/unit/{providers,system,cron}`       | 8 + 3 + 7 = **18**  | providers / system / cron         |
| **N4c** | `tests/unit/{previews,assets,bootstrap}`   | 12 + 2 + 3 = **17** | file preview / assets / bootstrap |

三分区"零目录重叠":任何 executor 只能 touch 自己分区的目录;公共 helper 只读。

### 1.2 并行协调一览(详见 §4 "N4 并行协调")

- 三个 executor 基于 **同一** `feat/n4-test-rewrite-domains` 分支。
- **先到先 push**;后到的 `git fetch origin && git pull --rebase origin feat/n4-test-rewrite-domains` 合并先到的 commit。
- 目录零重叠 → rebase 冲突**应**只能出现在 `vitest.config.ts` 或 `package.json` 级别,但这些**都不允许改**,所以实质上冲突 = 有人越界 → **立即 escalate**。
- 任一 executor 完成时 SendMessage 团队负责人;team-lead 判定 3 个都完成后写 **单一** `N4-outcome.md`(A/B/C 三节)。

### 1.3 预计执行时间

| 模式                       | 预计时间         |
| -------------------------- | ---------------- |
| 单 executor 顺序(A→B→C)    | 7-10 天          |
| 三 executor 并行(独立目录) | **3-4 天**(实时) |
| 每个分区独立执行时间       | 2-4 天           |

---

## 2. mockHttpBridge 签名约束(来自 N3,冻结)

### 2.1 N4 允许的 helper 使用方式

从 N3 handoff 锁定的签名里,N4 testfile 中**只用以下 API**:

```ts
import { createMockHttpBridge, resetMockHttpBridge, type MockHttpBridge } from '../_helpers/mockHttpBridge';
// 相对路径按各分区深度调整:
//   tests/unit/assistants/x.test.ts    → '../_helpers/mockHttpBridge'
//   tests/unit/providers/x.test.ts     → '../_helpers/mockHttpBridge'
//   tests/unit/bootstrap/x.test.ts     → '../_helpers/mockHttpBridge'
```

### 2.2 N4 推荐的 mock 写法(避免 N3 踩坑)

**N3 踩坑教训**(必须写入 N4 每个 executor 的脑子):

1. **vi.mock 工厂不能引用外部 const**(hoist 到顶会 `Cannot access 'mockBridge' before initialization`)。
2. **`vi.hoisted` + `require('...')` 在 vitest 4 worker fork 下会 `MODULE_NOT_FOUND`**。
3. **`vi.mock` async factory + dynamic import 会导致 worker fork 死锁**。
4. **推荐写法**:在 `describe` / `beforeEach` 块内部实例化 `createMockHttpBridge()`,把路由注册到 `mock`,断言走 `mock.calls`;`vi.mock(...)` 的 factory **仅用最小 inline 工厂**(即原地写 `vi.fn()`),不要在 factory 内引用外部 helper 实例。

### 2.3 **标准 mock 模板**(每个 executor 必须照抄)

#### 模板 A:纯 adapter / utils 测试(无 HTTP)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {} from /* 被测 */ '@/path/to/module';

describe('moduleUnderTest', () => {
  beforeEach(() => {
    // 每个测试独立;无 mock 残留
  });

  it('happy path', () => {
    expect(moduleUnderTest.foo('bar')).toBe('baz');
  });
  // ...
});
```

#### 模板 B:需要 httpBridge mock 的测试(推荐)

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockHttpBridge, type MockHttpBridge } from '../_helpers/mockHttpBridge';

// 顶部 inline vi.mock(不引用外部 const;仅 vi.fn() 占位)
vi.mock('@/common/adapter/httpBridge', () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpPatch: vi.fn(),
  httpDelete: vi.fn(),
  stubProvider: vi.fn(),
  withResponseMap: vi.fn(),
  wsEmitter: vi.fn(),
  wsMappedEmitter: vi.fn(),
  stubEmitter: vi.fn(),
  httpRequest: vi.fn(),
  getBaseUrl: vi.fn(() => ''),
  BackendHttpError: class BackendHttpError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
      this.name = 'BackendHttpError';
    }
  },
  isBackendHttpError: (e: unknown): boolean => e instanceof Error && e.name === 'BackendHttpError',
}));

// 然后 import 被测 + helper
import {} from /* 被测 */ '@/path/to/module';
import * as httpBridge from '@/common/adapter/httpBridge';

describe('moduleUnderTest', () => {
  let mock: MockHttpBridge;

  beforeEach(() => {
    // clearAllMocks 清调用记录,不毁 vi.mock 模块替换
    vi.clearAllMocks();

    // 每个 test 重建 mock 实例并把 asModule() 的工厂绑定到 vi.fn() 上
    mock = createMockHttpBridge({ unmatched: 'throw' });
    const m = mock.asModule();
    // 把 mock 实例的每个工厂绑到 vi.mock 声明的 vi.fn() 上
    (httpBridge.httpGet as any).mockImplementation(m.httpGet);
    (httpBridge.httpPost as any).mockImplementation(m.httpPost);
    (httpBridge.httpPut as any).mockImplementation(m.httpPut);
    (httpBridge.httpPatch as any).mockImplementation(m.httpPatch);
    (httpBridge.httpDelete as any).mockImplementation(m.httpDelete);
    (httpBridge.stubProvider as any).mockImplementation(m.stubProvider);
    (httpBridge.withResponseMap as any).mockImplementation(m.withResponseMap);
    (httpBridge.wsEmitter as any).mockImplementation(m.wsEmitter);
    (httpBridge.wsMappedEmitter as any).mockImplementation(m.wsMappedEmitter);
    (httpBridge.stubEmitter as any).mockImplementation(m.stubEmitter);
  });

  it('registers GET route and records call', async () => {
    mock.onGet('/api/foo', () => ({ value: 42 }));
    const result = await httpBridge.httpGet('/api/foo').invoke();
    expect(result).toEqual({ value: 42 });
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toMatchObject({ method: 'GET', path: '/api/foo' });
  });
});
```

> **为什么这样写**:`vi.mock` 的 factory 只含 `vi.fn()` 占位(合法 hoist);`createMockHttpBridge()` 在 `beforeEach` 里创建 + 用 `mockImplementation` 绑定。helper 的 `calls` / `routeCount` 直接可断言。测试间 reset 靠 `vi.clearAllMocks()` + 重新 `beforeEach`。

#### 模板 C:需要 ipcBridge 整体 mock 的测试

```ts
vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: vi.fn(), provider: vi.fn() },
      create: { invoke: vi.fn(), provider: vi.fn() },
      // ... 按被测模块实际用到的 method 列
    },
    // 其它 namespace 按需
  },
}));
import { ipcBridge } from '@/common';
// beforeEach 里 (ipcBridge.assistants.list.invoke as any).mockResolvedValue([...])
```

#### 模板 D:WebSocket 事件订阅测试(cron / preview history)

用 helper 的 `wsEmitter`:

```ts
mock.asModule().wsEmitter('cron.onJobCreated').on((job: any) => {
  /* subscriber side */
});
mock.emit('cron.onJobCreated', { id: 'j1', ... });
```

但源码实际通过 `ipcBridge.cron.onJobCreated.on(...)`,需要 mock `ipcBridge` 结构(见模板 C)。具体样例在 §C3(N4b cron)展开。

### 2.4 **禁止写法**(N3 验证过会死锁)

```ts
// ❌ 不行:vi.mock 工厂引用外部 const
const mock = createMockHttpBridge();
vi.mock('@/common/adapter/httpBridge', () => mock.asModule()); // 死

// ❌ 不行:async factory + dynamic import
vi.mock('@/common/adapter/httpBridge', async () => {
  const m = createMockHttpBridge();
  return m.asModule();
}); // worker fork 死锁

// ❌ 不行:vi.hoisted + require
const { mock } = vi.hoisted(() => {
  return { mock: require('../_helpers/mockHttpBridge').createMockHttpBridge() };
}); // MODULE_NOT_FOUND

// ❌ 不行:restoreAllMocks() — 会移除 vi.mock,后续测试炸
afterEach(() => {
  vi.restoreAllMocks();
});

// ✅ 应该:
afterEach(() => {
  vi.clearAllMocks();
});
// 或靠 beforeEach 重建,啥都不加
```

---

## 3. 从 N3 handoff 读取的字段映射

executor 在 Phase 0 / 9 会用到以下来自 N3-outcome 的字段:

| N3 handoff 字段       | 本 plan 用在哪                       | 值                                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------------------ |
| 上游分支名            | Phase 1 步骤 1.1 checkout            | `feat/n3-test-rewrite-adapter-common`                        |
| 上游 SHA              | Phase 1 步骤 1.1                     | `df071f82a` (最新 handoff commit) 或 `349769374`(前一个)     |
| 基线分支 / SHA        | Phase 9 步骤 9.1                     | `origin/feat/backend-migration @ e4cdff41f`                  |
| mockHttpBridge 签名锁 | §2 本 plan + 每个 testfile 的 import | 见 N3 handoff §"mockHttpBridge 最终公开签名"                 |
| N3 测试通过数量(基线) | Phase 0 快照                         | 88 tests / 6 test files(N4 后 ≥ 88 + 180 = 268 / ≥ 60 files) |

**N3 遗留已记入 plan 的要点**:

- vitest 4 worker fork 下 vi.mock + asModule 陷阱(见 §2.4)
- executor-n3 曾 idle 未执行 Phase 8+ → N4 plan 每 Phase 末尾都写 NEXT STEP(见 §14)

---

## 4. N4 并行协调(N4a / N4b / N4c 必读)

### 4.1 三路并行模型

- 三个 executor 基于**同一分支** `feat/n4-test-rewrite-domains`(基于 `origin/feat/n3-test-rewrite-adapter-common` 创建)。
- 三路各自写自己分区的测试,不开子分支。
- 每个 executor 完成一个 Phase 就 commit + push。
- 先 push 者用 `git push`;后 push 者在 push 前:`git fetch origin && git pull --rebase origin feat/n4-test-rewrite-domains`,然后 `git push`。

### 4.2 冲突处理

| 场景                                              | 处理                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| rebase 无冲突                                     | `git push`(正常)                                                                                |
| rebase 冲突在**自己分区的文件**                   | 不可能(分区零重叠,若发生一定是自己或对方越界);**STOP** → SendMessage escalate team-lead         |
| rebase 冲突在 `tests/unit/_helpers/`              | 不可能(N4 禁止改 helper);若发生 → escalate                                                      |
| rebase 冲突在 `package.json` / `vitest.config.ts` | 不可能(N4 禁止改这些文件);若发生 → escalate                                                     |
| push 被拒 `non-fast-forward`                      | 说明远端有别人的新 commit → `git pull --rebase` 再 push;≥ 3 次循环都被新 commit 夺先 → escalate |

### 4.3 每路 executor 的启动判定

在 Phase 0 步骤 0.0,每路 executor 先跑这一段判定当前是自己第一个进来还是后到:

```bash
cd /Users/zhoukai/Documents/github/AionUi
git fetch origin

# 检查远端是否已有 feat/n4-test-rewrite-domains
if git show-ref --quiet refs/remotes/origin/feat/n4-test-rewrite-domains; then
  echo "N4_BRANCH_EXISTS_REMOTE"
  git rev-parse origin/feat/n4-test-rewrite-domains
else
  echo "N4_BRANCH_NEW"
fi
```

- **N4_BRANCH_NEW**:你是第一个进 N4 的,按 §Phase 1 "首路创建分支" 执行。
- **N4_BRANCH_EXISTS_REMOTE**:分支已存在,按 §Phase 1 "后到路加入分支" 执行。

### 4.4 Backend 跨仓改动(UC-G)

requirements 第 13-14 行指出:N4 涉及 backend 行为问题时,三路 executor **共享同一个** aionui-backend 同名分支 `feat/n4-test-rewrite-domains`;crate 零重叠规则:

- N4a 只改 `aionui-assistant` / `aionui-extension` / `aionui-assets` 相关 crate
- N4b 只改 `aionui-system` / `aionui-cron` 相关 crate
- N4c 只改 `aionui-office` / `aionui-file` 相关 crate

跨 crate 或公共基础设施 → escalate(UC-G 5 种必 escalate 场景之一)。

各 executor 在自己 handoff 的 "Backend 修改" 节只列自己的 backend commit/SHA;team-lead 汇总到 `N4-outcome.md`。

---

## 5. 工具预检

每路 executor 在 Phase 0 之前跑一次:

```bash
cd /Users/zhoukai/Documents/github/AionUi

node --version            # 预期: v22.x
bun --version             # 预期: 1.x
bunx vitest --version     # 预期: vitest/4.x
bunx tsc --version        # 预期: Version 5.x
which prek                # 预期: 非空
prek --version            # 预期: 可读
which gh                  # 预期: 非空(handoff 备用)
git --version             # 预期: 2.x

# 验证 N3 产物存在
test -f tests/unit/_helpers/mockHttpBridge.ts && echo "helper OK" || { echo "MISSING helper"; exit 1; }
test -f tests/unit/_helpers/mockHttpBridge.test.ts && echo "helper self-test OK"
```

若 `prek` 未装:`npm install -g @j178/prek`。

若 `bun install` 报 node_modules 缺失:`bun install`。

**UC-G 环境(只有改 backend 时才需要)**:按 cheatsheet §UC-G "环境预检"节配 symlink,本 plan 不重复。

---

## 6. 平台兼容约定

- 本机 Darwin 24.6.0 (macOS)+ zsh;所有命令对 Linux 同样可跑。
- **不使用** `sed -i ''`(macOS only)/ `xargs -I{}` 的 GNU 扩展;所有文件修改走 **Write / Edit 工具**或 **bun / git** 原生命令。
- 所有 `grep` 用 POSIX 语法。

---

## Phase 0 基线快照(每路 executor 都要跑)

### 步骤 0.0 — 并行路判定(见 §4.3)

```bash
cd /Users/zhoukai/Documents/github/AionUi
git fetch origin
git show-ref --quiet refs/remotes/origin/feat/n4-test-rewrite-domains && echo "N4_BRANCH_EXISTS_REMOTE" || echo "N4_BRANCH_NEW"
```

记录输出,Phase 1 用。

### 步骤 0.1 — 确保当前工作区干净

```bash
git status --porcelain
# 预期:无输出。非空 → STOP,escalate。

git rev-parse origin/feat/n3-test-rewrite-adapter-common > /tmp/n4-baseline-n3-sha.txt
cat /tmp/n4-baseline-n3-sha.txt
# 预期:df071f82a... 或更新(N3 分支最新 SHA)

git rev-parse origin/feat/backend-migration > /tmp/n4-baseline-base-sha.txt
cat /tmp/n4-baseline-base-sha.txt
# 预期:e4cdff41f...(基线)
```

### 步骤 0.2 — 记录基线 vitest 状态

```bash
mkdir -p /tmp/n4-baseline

# 记录 N3 测试基线(6 files / 88 tests 全绿)
bunx vitest run --reporter=default 2>&1 | tee /tmp/n4-baseline/vitest.log | tail -10
echo "exit=$?" >> /tmp/n4-baseline/vitest.log
# 预期:Test Files 6 passed (6),Tests 88 passed (88),退出 0

# 记录骨架目录的文件数(N4 开工前,每个分区目录只有 .gitkeep)
for d in assistants skills extension providers system cron previews assets bootstrap; do
  find tests/unit/$d -type f 2>/dev/null | wc -l
done > /tmp/n4-baseline/dir-counts.txt
cat /tmp/n4-baseline/dir-counts.txt
# 预期:9 行每行为 1(各目录只有 .gitkeep);若是 0 说明 .gitkeep 已删
```

**判定**:

- vitest 必须绿(N3 已 sign off)
- 目录存在且可写

---

## Phase 1 预检 + 分支设置

### 1.A 首路(N4_BRANCH_NEW)

```bash
cd /Users/zhoukai/Documents/github/AionUi

# 基于 N3 最新分支创建 N4 分支
git checkout -b feat/n4-test-rewrite-domains origin/feat/n3-test-rewrite-adapter-common
git rev-parse --abbrev-ref HEAD
# 预期:feat/n4-test-rewrite-domains

git merge-base --is-ancestor origin/feat/n3-test-rewrite-adapter-common HEAD && echo "base OK"
# 预期:base OK

# 立即 push 空分支,让其它 executor 能检测到
git push -u origin feat/n4-test-rewrite-domains
# 预期:成功
```

### 1.B 后到路(N4_BRANCH_EXISTS_REMOTE)

```bash
cd /Users/zhoukai/Documents/github/AionUi

git fetch origin feat/n4-test-rewrite-domains
git checkout -b feat/n4-test-rewrite-domains origin/feat/n4-test-rewrite-domains 2>/dev/null || {
  git checkout feat/n4-test-rewrite-domains
  git pull --rebase origin feat/n4-test-rewrite-domains
}

git rev-parse --abbrev-ref HEAD
# 预期:feat/n4-test-rewrite-domains

git log --oneline -5
# 检查已有哪些 commit(来自先到路的工作)
```

### 1.C 依赖装好

```bash
bun install
git diff bun.lock
# 预期:无输出(bun install 未改 lockfile)
```

### 1.D 验证分区目录存在

```bash
# N4a
for d in assistants skills extension; do test -d "tests/unit/$d" || { echo "MISSING: tests/unit/$d"; exit 1; }; done
# N4b
for d in providers system cron; do test -d "tests/unit/$d" || { echo "MISSING: tests/unit/$d"; exit 1; }; done
# N4c
for d in previews assets bootstrap; do test -d "tests/unit/$d" || { echo "MISSING: tests/unit/$d"; exit 1; }; done

# 自己分区的 .gitkeep 存在(首次加文件前删除)
# N4a:ls tests/unit/{assistants,skills,extension}/.gitkeep
# N4b:ls tests/unit/{providers,system,cron}/.gitkeep
# N4c:ls tests/unit/{previews,assets,bootstrap}/.gitkeep
```

**Phase 1 无 commit**(纯 checkout + install,无文件改动)。

**NEXT STEP**:立即执行 Phase 2(你所在分区的 utils / L1 测试)。不要 idle。

---

## 7. N4a 分区(assistants / skills / extension,19 文件)

> **N4a executor 专属**。其它 executor 跳到 §8 或 §9。

### Phase 2a — Assistants utils(L1,1 文件)

#### 2a.1 文件清单

| #   | 路径                                           | 被测                                                          | case 数 | 层次 |
| --- | ---------------------------------------------- | ------------------------------------------------------------- | ------- | ---- |
| A5  | `tests/unit/assistants/assistantUtils.test.ts` | `renderer/pages/settings/AssistantSettings/assistantUtils.ts` | ≥ 5     | L1   |

#### 2a.2 断言清单(最少 5 case)

先读源码定准绳:`packages/desktop/src/renderer/pages/settings/AssistantSettings/assistantUtils.ts`(用 Read 工具查实际导出);根据导出函数设计 case。典型断言:

- `sortAssistants([])` → 空数组
- `sortAssistants(mixed list)` → builtin 在前,按指定字段排序
- 非法输入(null / undefined)处理
- 稳定排序(输入已排序时不改顺序)
- 边界(单元素数组)

#### 2a.3 删除 `tests/unit/assistants/.gitkeep`

```bash
git rm tests/unit/assistants/.gitkeep
```

#### 2a.4 写测试文件

用 Write 工具创建 `tests/unit/assistants/assistantUtils.test.ts`。文件头加 license JSDoc(参照 N3 的 apiModelMapper.test.ts 格式)。

#### 2a.5 验证

```bash
bunx vitest run tests/unit/assistants/assistantUtils.test.ts --reporter=verbose 2>&1 | tee /tmp/n4a-phase2a-vitest.log | tail -20
echo "exit=$?"
# 预期:退出 0;passed ≥ 5
```

**失败诊断**:

- `Cannot find module '@/renderer/pages/settings/AssistantSettings/assistantUtils'` → 源码文件名或路径拼错,用 `find packages/desktop -name "assistantUtils*"` 核对。
- 断言数不对 → 检查是否源码的函数行为与你写的断言不一致;**小 bug 按 requirements 决策表写成"文档化现状"** + 在 handoff Deviations 记录。

#### 2a.6 commit

```bash
git add tests/unit/assistants/
git commit -m "test(n4a): add assistantUtils unit tests (A5)

Covers sortAssistants() builtin-first ordering, stable sort, and
null/undefined guard paths (L1 pure function suite, no mock)."
```

**NEXT STEP**:立即执行 Phase 3a(Assistants hooks)。不要 idle。

---

### Phase 3a — Assistants hooks(L2,4 文件)

#### 3a.1 文件清单

| #   | 路径                                                   | 被测                                             | case 数 | 层次 |
| --- | ------------------------------------------------------ | ------------------------------------------------ | ------- | ---- |
| A1  | `tests/unit/assistants/useAssistantList.dom.test.ts`   | `renderer/hooks/assistant/useAssistantList.ts`   | ≥ 3     | L2   |
| A2  | `tests/unit/assistants/useAssistantEditor.dom.test.ts` | `renderer/hooks/assistant/useAssistantEditor.ts` | ≥ 3     | L2   |
| A3  | `tests/unit/assistants/useAssistantSkills.dom.test.ts` | `renderer/hooks/assistant/useAssistantSkills.ts` | ≥ 3     | L2   |
| A4  | `tests/unit/assistants/useDetectedAgents.dom.test.ts`  | `renderer/hooks/assistant/useDetectedAgents.ts`  | ≥ 3     | L2   |

#### 3a.2 公共 mock 模板

所有 L2 hook 测试都要 mock `@/common`(ipcBridge)。使用模板 C:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: vi.fn(), provider: vi.fn() },
      get: { invoke: vi.fn(), provider: vi.fn() },
      create: { invoke: vi.fn(), provider: vi.fn() },
      update: { invoke: vi.fn(), provider: vi.fn() },
      delete: { invoke: vi.fn(), provider: vi.fn() },
      // 按源码实际用到的 method 扩
    },
    skills: {
      list: { invoke: vi.fn(), provider: vi.fn() },
      // ...
    },
  },
}));

// react-i18next 的 useTranslation 为被测 hook 所用
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));
```

#### 3a.3 A1 - useAssistantList(最少 3 case,推荐 5)

- **happy**:初始化 → `ipcBridge.assistants.list.invoke` 被调 1 次 → `assistants` state 被 sortAssistants 排序 → `activeAssistantId` = first.id
- **边界**:返回空数组 → `activeAssistantId` = null
- **错误**:invoke reject → `console.error` 被调,`assistants` 保持 []
- **用户切换**:`setActiveAssistantId('x')` + 后续 loadAssistants 发现 'x' 仍在 → 保留 'x';不在 → fallback 到 sorted[0].id
- **isExtensionAssistant**:`assistant.source === 'extension'` → true;其它 → false

#### 3a.4 A2 - useAssistantEditor(最少 3 case,推荐 5-7;文件 15KB 较大,分 describe)

读源码用 `Read` 工具定内部方法:

- 构造初始表单 state
- 编辑单字段 → 脏标记
- save → 调用 `ipcBridge.assistants.update.invoke` + 返回更新对象
- cancel → 回滚脏状态
- 删除 / 重置 → 清空

#### 3a.5 A3 - useAssistantSkills(最少 3 case,推荐 5)

读源码:关注 skill 添加 / 移除 / 切换启用;mock `ipcBridge.skills.*` + assistants.list / update。

#### 3a.6 A4 - useDetectedAgents(最少 3 case)

源码较小(~1.4KB),读后针对 detection 逻辑 + 空响应写 case。

#### 3a.7 验证

```bash
bunx vitest run tests/unit/assistants/ --reporter=verbose 2>&1 | tee /tmp/n4a-phase3a-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;5 个文件全绿(A1-A5),tests ≥ 5 + 4*3 = 17
```

**失败诊断**:

- `renderHook is not a function` → 缺 `@testing-library/react` 包;`bun install` 核验。
- hook 内调用 `await ipcBridge.x.invoke()` 但测试 未 await → 用 `await waitFor(() => expect(...).toHaveBeenCalled())`。
- fake timers + async 挂起 → `await vi.advanceTimersByTimeAsync(ms)` 而非同步版本。

#### 3a.8 commit

```bash
git add tests/unit/assistants/
git commit -m "test(n4a): add assistants hooks dom tests (A1-A4)

Covers useAssistantList load/select/error paths, useAssistantEditor
form state management, useAssistantSkills CRUD, and useDetectedAgents
detection logic via ipcBridge mocks."
```

**NEXT STEP**:立即执行 Phase 4a(Assistants L3 components)。不要 idle。

---

### Phase 4a — Assistants L3 components(5 文件)

#### 4a.1 文件清单(L3 组件,case 数 ≥ 5 每文件)

| #   | 路径                                                      | 被测                       | case 数 |
| --- | --------------------------------------------------------- | -------------------------- | ------- |
| A6  | `tests/unit/assistants/AssistantListPanel.dom.test.tsx`   | `AssistantListPanel.tsx`   | ≥ 5     |
| A7  | `tests/unit/assistants/AssistantEditDrawer.dom.test.tsx`  | `AssistantEditDrawer.tsx`  | ≥ 5     |
| A8  | `tests/unit/assistants/DeleteAssistantModal.dom.test.tsx` | `DeleteAssistantModal.tsx` | ≥ 5     |
| A9  | `tests/unit/assistants/AddSkillsModal.dom.test.tsx`       | `AddSkillsModal.tsx`       | ≥ 5     |
| A10 | `tests/unit/assistants/SkillConfirmModals.dom.test.tsx`   | `SkillConfirmModals.tsx`   | ≥ 5     |

#### 4a.2 L3 组件测试通用模板

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('@/common', () => ({
  ipcBridge: { /* 按被测 component 实际调用的 method */ },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import { ComponentUnderTest } from '@/renderer/pages/.../ComponentUnderTest';

describe('ComponentUnderTest', () => {
  const renderWithProviders = (props: any) =>
    render(
      <ConfigProvider>
        <ComponentUnderTest {...props} />
      </ConfigProvider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing (happy)', () => { /* 渲染 + assert */ });
  it('handles user interaction (click/type)', async () => {
    const user = userEvent.setup();
    renderWithProviders({ ... });
    await user.click(screen.getByRole('button', { name: /.../ }));
    /* assert */
  });
  it('shows loading state', () => { /* ... */ });
  it('shows error state', () => { /* ... */ });
  it('shows empty state', () => { /* ... */ });
});
```

#### 4a.3 各文件实现提示

- **A6 AssistantListPanel**:列表渲染 + click 条目触发 setActive + 右键 / 长按菜单
- **A7 AssistantEditDrawer**:打开抽屉 + 表单输入 + 保存触发 update invoke + 关闭
- **A8 DeleteAssistantModal**:确认按钮 + 取消按钮 + 对内置 assistant 禁用
- **A9 AddSkillsModal**:skill 列表 + 搜索 + 选中 / 取消 + 批量添加
- **A10 SkillConfirmModals**:多个 modal 合集,每个最少 1 case;本文件总 ≥ 5

#### 4a.4 验证

```bash
bunx vitest run tests/unit/assistants/*.dom.test.tsx --reporter=verbose 2>&1 | tee /tmp/n4a-phase4a-vitest.log | tail -40
echo "exit=$?"
# 预期:退出 0;5 个 dom.test.tsx 全绿,tests ≥ 5 * 5 = 25
```

**失败诊断**:

- "unable to find ... with Name 'xxx'" → Arco component 用 `data-testid` 或更宽松的 text match
- "Not wrapped in act(...)" → 用 `await user.click()`,不要 fireEvent
- 组件依赖 `<ConfigProvider locale={...}>` → 测试中包一层

#### 4a.5 commit

```bash
git add tests/unit/assistants/
git commit -m "test(n4a): add assistants L3 component dom tests (A6-A10)

Covers AssistantListPanel list + interaction, AssistantEditDrawer form
flow, DeleteAssistantModal confirm guard, AddSkillsModal selection, and
SkillConfirmModals multi-modal dialogs via userEvent + ipcBridge mocks."
```

**NEXT STEP**:立即执行 Phase 5a(Assistants L4 migrate)。不要 idle。

---

### Phase 5a — Assistants L4 migrations(2 文件)

#### 5a.1 文件清单

| #   | 路径                                                 | 被测                                    | case 数 |
| --- | ---------------------------------------------------- | --------------------------------------- | ------- |
| A11 | `tests/unit/assistants/migrateAssistants.test.ts`    | `process/utils/migrateAssistants.ts`    | ≥ 5     |
| A12 | `tests/unit/assistants/runBackendMigrations.test.ts` | `process/utils/runBackendMigrations.ts` | ≥ 5     |

#### 5a.2 A11 mock 策略

源码 `migrateAssistants.ts` import:

- `@/common` 的 `ipcBridge`(调 backend `/api/assistants/*`)
- `./initStorage` 的 `ProcessConfig`(本地 config file)

用模板 C mock `ipcBridge.assistants.*`;`initStorage.ProcessConfig` mock 为 `{ get: vi.fn(), set: vi.fn(), remove: vi.fn() }`。

断言点(最少 5):

- 空输入 → 不调 `createAssistant` invoke
- legacy assistant 被 migrate → `createAssistant` 调 1 次,body snake_case 正确
- built-in ID 被跳过(不发 create)
- migration flag 设置到 ProcessConfig
- 单条 create fail → 不阻塞其它 create

#### 5a.3 A12 mock 策略

源码 `runBackendMigrations.ts` import:

- `@/common/config/configMigration`(`migrateConfigStorage`, `migrateProviders`)
- `@/common/adapter/httpBridge`(`httpRequest`)
- `./initStorage.ProcessConfig`
- `./migrateAssistants.migrateAssistantsToBackend`

mock 策略:

```ts
vi.mock('@/common/config/configMigration', () => ({
  migrateConfigStorage: vi.fn(),
  migrateProviders: vi.fn(),
}));
vi.mock('@/common/adapter/httpBridge', () => ({ httpRequest: vi.fn() }));
vi.mock('./migrateAssistants', () => ({ migrateAssistantsToBackend: vi.fn() }));
// ProcessConfig stub 同 A11
```

断言点(最少 5):

- 全部成功 → orchestrator 返回 `allSucceeded: true`
- `migrateConfigStorage` 挂但其它成功 → `allSucceeded: false`;但其它 migration 仍跑
- `migrateProviders` 挂 → 同上
- `migrateAssistantsToBackend` 挂 → 同上
- 顺序:先 configStorage,再 providers,再 assistants(通过 `mock.mock.invocationCallOrder` 检)

#### 5a.4 验证

```bash
bunx vitest run tests/unit/assistants/migrateAssistants.test.ts tests/unit/assistants/runBackendMigrations.test.ts --reporter=verbose 2>&1 | tee /tmp/n4a-phase5a-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;2 files / ≥ 10 tests 全绿
```

#### 5a.5 commit

```bash
git add tests/unit/assistants/
git commit -m "test(n4a): add assistants L4 migration tests (A11-A12)

Covers migrateAssistants legacy→backend import path (empty, builtin
skip, flag set, per-item failure tolerance) and runBackendMigrations
orchestrator ordering + partial-failure allSucceeded flag."
```

**NEXT STEP**:立即执行 Phase 6a(Skills)。不要 idle。

---

### Phase 6a — Skills(4 文件)

#### 6a.1 文件清单

| #   | 路径                                                          | 被测                                                                                       | case 数 |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- |
| SK1 | `tests/unit/skills/skillSuggestParser.test.ts`                | `renderer/utils/chat/skillSuggestParser.ts`                                                | ≥ 5     |
| SK2 | `tests/unit/skills/AddCustomPathModal.dom.test.tsx`           | `renderer/pages/settings/AssistantSettings/AddCustomPathModal.tsx`                         | ≥ 5     |
| SK3 | `tests/unit/skills/useAssistantSkillsIntegration.dom.test.ts` | `useAssistantSkills` + `AddSkillsModal` 组合(用 `createMockHttpBridge` 拉 skill detection) | ≥ 3     |
| SK4 | `tests/unit/skills/SkillsHubSettings.dom.test.tsx`            | `renderer/pages/settings/SkillsHubSettings.tsx`                                            | ≥ 5     |

#### 6a.2 删除 skills/.gitkeep + 写测试

先 `git rm tests/unit/skills/.gitkeep`。

- **SK1**:L1 pure function,用模板 A(无 mock)。读源码把所有分支写一遍。
- **SK2/SK4**:L3,用 4a.2 模板(Arco + ConfigProvider)。
- **SK3**:L4 integration,用 2.3 模板 B(`createMockHttpBridge` + 真实 hook / component 交互)。

#### 6a.3 验证

```bash
bunx vitest run tests/unit/skills/ --reporter=verbose 2>&1 | tee /tmp/n4a-phase6a-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;4 files / tests ≥ 5 + 5 + 3 + 5 = 18
```

#### 6a.4 commit

```bash
git add tests/unit/skills/
git commit -m "test(n4a): add skills tests (SK1-SK4)

Covers skillSuggestParser pure parsing (L1), AddCustomPathModal input
validation (L3), useAssistantSkills integration via mockHttpBridge
(L4), and SkillsHubSettings page render + interaction (L3)."
```

**NEXT STEP**:立即执行 Phase 7a(Extension)。不要 idle。

---

### Phase 7a — Extension(3 文件)

#### 7a.1 文件清单

| #   | 路径                                                            | 被测                                                                                  | case 数 |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| E1  | `tests/unit/extension/ExtensionSettingsPage.dom.test.tsx`       | `renderer/pages/settings/ExtensionSettingsPage.tsx`                                   | ≥ 5     |
| E2  | `tests/unit/extension/ExtensionSettingsTabContent.dom.test.tsx` | `renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent.tsx` | ≥ 5     |
| E3  | `tests/unit/extension/extensionMapperIntegration.test.ts`       | Extension ipcBridge 调用序列(mock `/api/extension/*`)                                 | ≥ 5     |

#### 7a.2 实现提示

- **E1/E2**:L3,用 4a.2 模板
- **E3**:L4 integration,用 2.3 模板 B,用 `createMockHttpBridge` 注册 `/api/extension/list`、`/api/extension/install`、`/api/extension/uninstall`;断言 adapter 发出的路由序列 + body shape

#### 7a.3 验证

```bash
# 删除 .gitkeep 在本 Phase 首次加文件时一次性处理
git rm tests/unit/extension/.gitkeep 2>/dev/null || true

bunx vitest run tests/unit/extension/ --reporter=verbose 2>&1 | tee /tmp/n4a-phase7a-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;3 files / tests ≥ 15
```

#### 7a.4 commit

```bash
git add tests/unit/extension/
git commit -m "test(n4a): add extension tests (E1-E3)

Covers ExtensionSettingsPage + ExtensionSettingsTabContent render/
interaction (L3) and extensionMapperIntegration /api/extension/* route
sequence + payload shape via mockHttpBridge (L4)."
```

**NEXT STEP**:立即执行 Phase 8(所有分区通用的本地门禁)。不要 idle。

---

## 8. N4b 分区(providers / system / cron,18 文件)

> **N4b executor 专属**。N4a / N4c 跳到 §9 或 §10。

### Phase 2b — Providers L1(4 pure-function 文件)

#### 2b.1 文件清单

| #   | 路径                                             | 被测                                                                                   | case 数 |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------- |
| P5  | `tests/unit/providers/RotatingApiClient.test.ts` | `common/api/RotatingApiClient.ts` + `AnthropicRotatingClient` + `OpenAIRotatingClient` | ≥ 5     |
| P6  | `tests/unit/providers/ApiKeyManager.test.ts`     | `common/api/ApiKeyManager.ts`                                                          | ≥ 5     |
| P7  | `tests/unit/providers/ClientFactory.test.ts`     | `common/api/ClientFactory.ts`                                                          | ≥ 5     |
| P8  | `tests/unit/providers/ProtocolConverter.test.ts` | `common/api/ProtocolConverter.ts` + `OpenAI2AnthropicConverter.ts`                     | ≥ 5     |

#### 2b.2 ApiKeyManager 断言要点(P6)

源码提供 key rotation + 90s blacklist。测试点:

- 构造函数 parseKeys(逗号分隔 / 空白 / 单 key)
- `getCurrentKey()` 返回 index
- `reportError(keyIndex)` 把 key blacklist 90s
- `getCurrentKey()` 跳过 blacklisted
- 90s 过期后恢复(用 `vi.useFakeTimers()` + `vi.advanceTimersByTime(90_001)`)

**fake timers 注意**:useFakeTimers 必须在 beforeEach,afterEach `vi.useRealTimers()`;async 代码用 `advanceTimersByTimeAsync` 而非同步版本。

#### 2b.3 其它 3 个文件断言策略

**P5 RotatingApiClient**:mock `ApiKeyManager` + mock `fetch` / SDK;断言 client 在 401/429 时轮换 key。

**P7 ClientFactory**:根据 `authType` 构造对应 client 类;**不真实初始化 SDK**,mock `AnthropicRotatingClient` / `OpenAIRotatingClient`。

**P8 ProtocolConverter**:纯函数,OpenAI 消息 ↔ Anthropic 消息的双向转换,各种 role / tool_calls 边界。

#### 2b.4 删除 providers/.gitkeep + 写测试 + 验证

```bash
git rm tests/unit/providers/.gitkeep

# 写 4 个文件后
bunx vitest run tests/unit/providers/RotatingApiClient.test.ts tests/unit/providers/ApiKeyManager.test.ts tests/unit/providers/ClientFactory.test.ts tests/unit/providers/ProtocolConverter.test.ts --reporter=verbose 2>&1 | tee /tmp/n4b-phase2b-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;4 files / tests ≥ 20
```

#### 2b.5 commit

```bash
git add tests/unit/providers/
git commit -m "test(n4b): add providers L1 pure function tests (P5-P8)

Covers ApiKeyManager rotation + 90s blacklist (with fake timers),
RotatingApiClient retry semantics, ClientFactory auth-type dispatch,
and ProtocolConverter OpenAI↔Anthropic roundtrip."
```

**NEXT STEP**:立即执行 Phase 3b(Providers hooks)。不要 idle。

---

### Phase 3b — Providers hooks(L2,3 文件)

#### 3b.1 文件清单

| #   | 路径                                                           | 被测                                                  | case 数 |
| --- | -------------------------------------------------------------- | ----------------------------------------------------- | ------- |
| P1  | `tests/unit/providers/useModelProviderList.dom.test.ts`        | `renderer/hooks/agent/useModelProviderList.ts`        | ≥ 3     |
| P2  | `tests/unit/providers/useConfigModelListWithImage.dom.test.ts` | `renderer/hooks/agent/useConfigModelListWithImage.ts` | ≥ 3     |
| P3  | `tests/unit/providers/useGoogleAuthModels.dom.test.ts`         | `renderer/hooks/agent/useGoogleAuthModels.ts`         | ≥ 3     |

#### 3b.2 mock 策略

所有 hook 都会调 `ipcBridge.mode.listProviders.invoke()`;`useModelProviderList` 还用 SWR。

```ts
vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: vi.fn(), provider: vi.fn() },
      createProvider: { invoke: vi.fn(), provider: vi.fn() },
      // ...
    },
  },
}));

// SWR cache 清理
import { SWRConfig } from 'swr';
const wrapper = ({ children }: any) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

// 在 renderHook 时传 wrapper
renderHook(() => useModelProviderList(), { wrapper });
```

#### 3b.3 断言要点

**P1 useModelProviderList**:

- 初始化 → fetch providers → 返回 `providers` state
- `getAvailableModels(provider)` 聚合 enabled + modelHealth 过滤
- `formatModelLabel` fallback 到 model id

**P2 useConfigModelListWithImage**:

- image-generation providers 过滤
- 按 builtin-image-gen ID 识别

**P3 useGoogleAuthModels**:

- Google auth provider 的特殊 model 列表
- token 过期时返回空

#### 3b.4 验证 + commit

```bash
bunx vitest run tests/unit/providers/use*.dom.test.ts --reporter=verbose 2>&1 | tee /tmp/n4b-phase3b-vitest.log | tail -30
echo "exit=$?"

git add tests/unit/providers/
git commit -m "test(n4b): add providers hooks dom tests (P1-P3)

Covers useModelProviderList SWR fetch + availability filters,
useConfigModelListWithImage image-gen provider selection, and
useGoogleAuthModels OAuth model listing."
```

**NEXT STEP**:立即执行 Phase 4b(Providers L3)。不要 idle。

---

### Phase 4b — Providers L3(1 文件)

#### 4b.1 文件清单

| #   | 路径                                                  | 被测                                                                        | case 数 |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| P4  | `tests/unit/providers/ModelModalContent.dom.test.tsx` | `renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx` | ≥ 5     |

用 §4a.2 模板。交互:添加 provider、编辑 API key、测试连接(mock invoke)、删除。

```bash
bunx vitest run tests/unit/providers/ModelModalContent.dom.test.tsx --reporter=verbose 2>&1 | tee /tmp/n4b-phase4b-vitest.log | tail -20
echo "exit=$?"

git add tests/unit/providers/
git commit -m "test(n4b): add ModelModalContent dom tests (P4)

Covers add/edit/delete provider and test-connection flows via userEvent
+ ipcBridge.mode.* mocks."
```

**NEXT STEP**:立即执行 Phase 5b(System)。不要 idle。

---

### Phase 5b — System(3 文件)

#### 5b.1 文件清单

| #   | 路径                                                 | 被测                                                                          | case 数 |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| S1  | `tests/unit/system/SystemModalContent.dom.test.tsx`  | `renderer/.../SystemModalContent/index.tsx`                                   | ≥ 5     |
| S2  | `tests/unit/system/clientPrefSettings.test.ts`       | language / cronNotificationEnabled 等 `/api/settings/client` 的 hook 或 utils | ≥ 5     |
| S3  | `tests/unit/system/DisplayModalContent.dom.test.tsx` | `renderer/.../DisplayModalContent.tsx`                                        | ≥ 5     |

#### 5b.2 S2 说明

S2 被测对象是"走 `/api/settings/client` 的 hook 或 utils"(requirements 原文)。**executor 读源码定锚点**:grep 源码找 `'/api/settings/client'` 的调用点:

```bash
grep -rn "/api/settings/client" packages/desktop/src/renderer --include='*.ts' --include='*.tsx' | head
```

选一个最上层的 hook(如 `useSettingsModal` 的子 hook 或 `DisplayModalContent` 内联逻辑)作为被测单元。用 §2.3 模板 B(`createMockHttpBridge`)。

#### 5b.3 写测试 + 验证

```bash
git rm tests/unit/system/.gitkeep

bunx vitest run tests/unit/system/ --reporter=verbose 2>&1 | tee /tmp/n4b-phase5b-vitest.log | tail -30
echo "exit=$?"

git add tests/unit/system/
git commit -m "test(n4b): add system settings tests (S1-S3)

Covers SystemModalContent main settings screen, clientPrefSettings
round-trip through /api/settings/client (mockHttpBridge), and
DisplayModalContent theme/font/language switch flows."
```

**NEXT STEP**:立即执行 Phase 6b(Cron)。不要 idle。

---

### Phase 6b — Cron(7 文件)

#### 6b.1 文件清单

| #   | 路径                                               | 被测                                                           | case 数 |
| --- | -------------------------------------------------- | -------------------------------------------------------------- | ------- |
| C1  | `tests/unit/cron/cronUtils.test.ts`                | `renderer/pages/cron/cronUtils.ts`                             | ≥ 5     |
| C2  | `tests/unit/cron/useCronJobs.dom.test.ts`          | `renderer/pages/cron/useCronJobs.ts`                           | ≥ 5     |
| C3  | `tests/unit/cron/CreateTaskDialog.dom.test.tsx`    | `.../ScheduledTasksPage/CreateTaskDialog.tsx`                  | ≥ 5     |
| C4  | `tests/unit/cron/TaskDetailPage.dom.test.tsx`      | `.../ScheduledTasksPage/TaskDetailPage.tsx`                    | ≥ 5     |
| C5  | `tests/unit/cron/CronStatusTag.dom.test.tsx`       | `.../ScheduledTasksPage/CronStatusTag.tsx`                     | ≥ 5     |
| C6  | `tests/unit/cron/CronJobSiderSection.dom.test.tsx` | `.../Sider/CronJobSiderSection/*.tsx` + `CronJobSiderItem.tsx` | ≥ 5     |
| C7  | `tests/unit/cron/CronJobManager.dom.test.tsx`      | `renderer/pages/cron/components/CronJobManager.tsx`            | ≥ 5     |

#### 6b.2 useCronJobs 特殊处理(C2)

源码(见 `useCronJobs.ts`)有三个 hook,都订阅 WS 事件(`onJobCreated/Updated/Removed`)。测试必须触发事件并断言 state 更新。

**WS 事件触发 mock**:

```ts
vi.mock('@/common', () => {
  const listeners: Record<string, Array<(p: any) => void>> = {};
  const ws = {
    on: (name: string) => (cb: (p: any) => void) => {
      (listeners[name] ||= []).push(cb);
      return () => {
        listeners[name] = listeners[name].filter((c) => c !== cb);
      };
    },
    emit: (name: string, payload: any) => {
      (listeners[name] || []).forEach((c) => c(payload));
    },
  };
  return {
    ipcBridge: {
      cron: {
        listJobs: { invoke: vi.fn(), provider: vi.fn() },
        listJobsByConversation: { invoke: vi.fn(), provider: vi.fn() },
        updateJob: { invoke: vi.fn(), provider: vi.fn() },
        removeJob: { invoke: vi.fn(), provider: vi.fn() },
        onJobCreated: { on: ws.on('cron.onJobCreated'), emit: vi.fn() },
        onJobUpdated: { on: ws.on('cron.onJobUpdated'), emit: vi.fn() },
        onJobRemoved: { on: ws.on('cron.onJobRemoved'), emit: vi.fn() },
        onJobExecuted: { on: ws.on('cron.onJobExecuted'), emit: vi.fn() },
      },
      conversation: {
        listByCronJob: { invoke: vi.fn(), provider: vi.fn() },
        listChanged: { on: ws.on('conv.listChanged'), emit: vi.fn() },
      },
    },
    __wsEmit: ws.emit,
  };
});
// 测试里 import { __wsEmit } from '@/common';(`(await import('@/common') as any).__wsEmit`)
```

断言点(最少 5):

- 初始化 → `listJobsByConversation.invoke` 被调
- `onJobCreated` 事件:只有 conversation_id 匹配才进 state
- `onJobUpdated`:匹配 id 就替换该条
- `onJobRemoved`:过滤掉该 id
- `hasError` computed:任一 job.last_status 为 error / missed

另还要覆盖 `useAllCronJobs` 和 `useCronJobsMap`(可独立 test case 或 sub-describe)。

#### 6b.3 写测试 + 验证

```bash
git rm tests/unit/cron/.gitkeep

bunx vitest run tests/unit/cron/ --reporter=verbose 2>&1 | tee /tmp/n4b-phase6b-vitest.log | tail -50
echo "exit=$?"
# 预期:退出 0;7 files / tests ≥ 35
```

**失败诊断**:

- 事件触发后 state 未更新 → React 18 事件触发是同步,但 state 更新是异步 → `await waitFor(() => expect(result.current.jobs).toHaveLength(N))`
- fake timers 导致 WS 派发 deadlock → 用 `vi.useRealTimers()` 或 `vi.advanceTimersByTimeAsync()`

#### 6b.4 commit

```bash
git add tests/unit/cron/
git commit -m "test(n4b): add cron tests (C1-C7)

Covers cronUtils pure helpers (L1), useCronJobs WS event subscription
+ state (L2, __wsEmit pattern), and 5 component tests for
CreateTaskDialog, TaskDetailPage, CronStatusTag, CronJobSiderSection,
and CronJobManager (L3)."
```

**NEXT STEP**:立即执行 Phase 8(全分区公共本地门禁)。不要 idle。

---

## 9. N4c 分区(previews / assets / bootstrap,17 文件)

> **N4c executor 专属**。

### Phase 2c — Preview L1 / L2(utils + hook,3 文件)

#### 2c.1 文件清单

| #   | 路径                                                | 被测                                      | case 数 |
| --- | --------------------------------------------------- | ----------------------------------------- | ------- |
| V11 | `tests/unit/previews/fileUtils.test.ts`             | `Preview/fileUtils.ts` + `previewUrls.ts` | ≥ 5     |
| V1  | `tests/unit/previews/PreviewContext.dom.test.tsx`   | `Preview/context/PreviewContext.tsx`      | ≥ 5     |
| V2  | `tests/unit/previews/usePreviewHistory.dom.test.ts` | `Preview/hooks/usePreviewHistory.ts`      | ≥ 5     |

#### 2c.2 实现提示

- **V11**:L1 纯函数,fileUtils + previewUrls 都是 utility。用模板 A。
- **V1 PreviewContext**:L3 context + provider + custom hook,用 `renderHook` 包 Provider;断言 push/pop/list 等 context API 行为。
- **V2 usePreviewHistory**:L2,使用 `SNAPSHOT_DEBOUNCE_TIME` 常量 + `ipcBridge.preview.history.*`。用模板 C + fake timers。

#### 2c.3 写测试 + 验证

```bash
git rm tests/unit/previews/.gitkeep

bunx vitest run tests/unit/previews/fileUtils.test.ts tests/unit/previews/PreviewContext.dom.test.tsx tests/unit/previews/usePreviewHistory.dom.test.ts --reporter=verbose 2>&1 | tee /tmp/n4c-phase2c-vitest.log | tail -30
echo "exit=$?"
```

#### 2c.4 commit

```bash
git add tests/unit/previews/
git commit -m "test(n4c): add preview utils/context/history hook tests (V1, V2, V11)

Covers fileUtils + previewUrls pure helpers (L1), PreviewContext
provider + hook API (L3), and usePreviewHistory snapshot debounce +
ipcBridge round-trip (L2)."
```

**NEXT STEP**:立即执行 Phase 3c(Preview viewers)。不要 idle。

---

### Phase 3c — Preview viewers(L3,6 文件)

#### 3c.1 文件清单

| #   | 路径                                                 | 被测                    | case 数 |
| --- | ---------------------------------------------------- | ----------------------- | ------- |
| V3  | `tests/unit/previews/OfficeWatchViewer.dom.test.tsx` | `OfficeWatchViewer.tsx` | ≥ 5     |
| V4  | `tests/unit/previews/PptViewer.dom.test.tsx`         | `PptViewer.tsx`         | ≥ 5     |
| V5  | `tests/unit/previews/OfficeDocViewer.dom.test.tsx`   | `OfficeDocViewer.tsx`   | ≥ 5     |
| V6  | `tests/unit/previews/ExcelViewer.dom.test.tsx`       | `ExcelViewer.tsx`       | ≥ 5     |
| V7  | `tests/unit/previews/MarkdownViewer.dom.test.tsx`    | `MarkdownViewer.tsx`    | ≥ 5     |
| V8  | `tests/unit/previews/HTMLViewer.dom.test.tsx`        | `HTMLViewer.tsx`        | ≥ 5     |

所有 viewer 都是 L3 component;用 §4a.2 模板。典型断言:渲染、加载中、错误、空文件、重新加载。

**注意**:各 viewer 可能依赖 `PreviewContext`(V1 已测 context);测试时用 `<PreviewContext.Provider value={...}>` 包一层。若 viewer 直接 import 第三方渲染库(mammoth / sheetjs / pptxjs 等),用 `vi.mock` 替换为返回 fixture 字符串的 stub。

#### 3c.2 写测试 + 验证

```bash
bunx vitest run tests/unit/previews/*Viewer.dom.test.tsx --reporter=verbose 2>&1 | tee /tmp/n4c-phase3c-vitest.log | tail -40
echo "exit=$?"
# 预期:6 files / tests ≥ 30
```

#### 3c.3 commit

```bash
git add tests/unit/previews/
git commit -m "test(n4c): add preview viewers L3 dom tests (V3-V8)

Covers OfficeWatchViewer / PptViewer / OfficeDocViewer / ExcelViewer /
MarkdownViewer / HTMLViewer render + load-state + error handling via
stubbed renderers and PreviewContext."
```

**NEXT STEP**:立即执行 Phase 4c(PreviewPanel + history integration)。不要 idle。

---

### Phase 4c — PreviewPanel + history(3 文件)

#### 4c.1 文件清单

> **⚠️ 源码路径修正**:requirements 里 V9/V10 写的是 `PreviewPanel/PreviewPanel.tsx`,实际在 `components/PreviewPanel/PreviewPanel.tsx`(多一级 `components/`)。plan 使用正确路径:

| #   | 路径                                                      | 被测                                                                            | case 数 |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------- | ------- |
| V9  | `tests/unit/previews/PreviewPanel.dom.test.tsx`           | `Preview/components/PreviewPanel/PreviewPanel.tsx`                              | ≥ 5     |
| V10 | `tests/unit/previews/PreviewHistoryDropdown.dom.test.tsx` | `Preview/components/PreviewPanel/PreviewHistoryDropdown.tsx`                    | ≥ 5     |
| V12 | `tests/unit/previews/previewHistoryIntegration.test.ts`   | Preview History ipcBridge 组合(mock `/api/preview-history/*`,用 mockHttpBridge) | ≥ 5     |

**V9/V10 import 路径修正**:

```ts
import { PreviewPanel } from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel';
import { PreviewHistoryDropdown } from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewHistoryDropdown';
```

executor 在 Phase 4c 开始前**再跑一次** `find` 核对一次路径,避免路径变动:

```bash
find packages/desktop/src/renderer/pages/conversation/Preview -name "PreviewPanel.tsx" -o -name "PreviewHistoryDropdown.tsx"
```

**如果路径不对**:在 handoff Deviations 节记录 requirements 的路径与实际源码不一致,按实际源码路径写测试。

#### 4c.2 实现提示

- **V9 PreviewPanel**:render panel + viewer 切换 + history dropdown 联动
- **V10 PreviewHistoryDropdown**:打开 / 选 snapshot / 删除
- **V12**:L4 integration,用 §2.3 模板 B,注册 `/api/preview-history/list`、`/.../save`、`/.../get-content` 等路由

#### 4c.3 写测试 + 验证

```bash
bunx vitest run tests/unit/previews/PreviewPanel.dom.test.tsx tests/unit/previews/PreviewHistoryDropdown.dom.test.tsx tests/unit/previews/previewHistoryIntegration.test.ts --reporter=verbose 2>&1 | tee /tmp/n4c-phase4c-vitest.log | tail -30
echo "exit=$?"
# 预期:退出 0;3 files / tests ≥ 15
```

#### 4c.4 commit

```bash
git add tests/unit/previews/
git commit -m "test(n4c): add preview panel + history tests (V9, V10, V12)

Covers PreviewPanel viewer dispatch + history dropdown integration,
PreviewHistoryDropdown snapshot list + delete, and
previewHistoryIntegration /api/preview-history/* route sequence via
mockHttpBridge (L4)."
```

**NEXT STEP**:立即执行 Phase 5c(Assets)。不要 idle。

---

### Phase 5c — Assets(2 文件)

#### 5c.1 文件清单

> **⚠️ 源码路径修正**:requirements 里 X1 写"前端 agent logo 解析 / asset URL 构造工具(grep 找出实际文件)"。实际文件为 `packages/desktop/src/renderer/utils/model/agentLogo.ts`(含 `getAgentLogo` / `resolveAgentLogo` / `hasAgentLogo` / `isDefaultModel` / `getModelDisplayLabel`)。

| #   | 路径                                                 | 被测                                               | case 数 |
| --- | ---------------------------------------------------- | -------------------------------------------------- | ------- |
| X1  | `tests/unit/assets/agentLogo.test.ts`                | `renderer/utils/model/agentLogo.ts`                | ≥ 5     |
| X2  | `tests/unit/assets/presetAssistantResources.test.ts` | `renderer/utils/model/presetAssistantResources.ts` | ≥ 5     |

#### 5c.2 X1 断言要点

- `getAgentLogo('Claude')` → `/api/assets/logos/ai-major/claude.svg`(大小写不敏感)
- `getAgentLogo(null / undefined / '')` → `null`
- `getAgentLogo('unknown-agent')` → `null`
- `resolveAgentLogo({ icon: 'x' })` → 直接返回 normalized icon
- `resolveAgentLogo({ isExtension: true, custom_agent_id: 'ext:my-ext:claude' })` → 查 adapter id claude 的 logo
- `hasAgentLogo(...)` / `isDefaultModel(...)` / `getModelDisplayLabel(...)` 的各分支
- dark-theme 分支:mock `document.documentElement.getAttribute('data-theme') === 'dark'`,断言 opencode.svg → opencode-dark.svg 替换

**mock 策略**:mock `@/renderer/utils/platform` 的 `resolveBackendAssetUrl` 返回 `(u: string) => u`(透传)或具体的 base URL 前缀。

#### 5c.3 X2 断言要点

读源码 `presetAssistantResources.ts`:关于 loadPresetAssistantResources + types。mock 必要 IO(若 import fs / fetch),断言 default preset 加载 + fallback 行为。

#### 5c.4 写测试 + 验证 + commit

```bash
git rm tests/unit/assets/.gitkeep

bunx vitest run tests/unit/assets/ --reporter=verbose 2>&1 | tee /tmp/n4c-phase5c-vitest.log | tail -20
echo "exit=$?"

git add tests/unit/assets/
git commit -m "test(n4c): add assets tests (X1-X2)

Covers agentLogo case-insensitive lookup + extension adapter path +
dark-theme variant swap, and presetAssistantResources default loader
+ fallback."
```

**NEXT STEP**:立即执行 Phase 6c(Bootstrap)。不要 idle。

---

### Phase 6c — Bootstrap(3 文件)

#### 6c.1 文件清单

| #   | 路径                                                      | 被测                                                                                                         | case 数 |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| B1  | `tests/unit/bootstrap/initStorage.migrations.test.ts`     | `process/utils/initStorage.ts` 中与 migration 相关的分支(M1 / assistant / provider)                          | ≥ 5     |
| B2  | `tests/unit/bootstrap/configMigrationIntegration.test.ts` | 跨文件:`configMigration` + `migrateAssistants` + `runBackendMigrations` 串起来的首启流程,用 `mockHttpBridge` | ≥ 5     |
| B3  | `tests/unit/bootstrap/migrationErrorRecovery.test.ts`     | 某一步 migration 失败时的降级行为(从 `runBackendMigrations.ts` 的 `allSucceeded` 分支反推)                   | ≥ 5     |

#### 6c.2 实现提示

- **B1**:mock fs / platform / storage;断言 initStorage 能识别旧目录结构并决定跑哪个 migration
- **B2**:L4 integration,最少 mock,用真实 configMigration + migrateAssistants 代码;只 mock httpBridge(用 `createMockHttpBridge`)+ `@office-ai/platform` storage
- **B3**:每步 migration 失败场景:configStorage 挂 / providers 挂 / assistants 挂,断言 allSucceeded = false 但其它 migration 仍跑完

#### 6c.3 写测试 + 验证 + commit

```bash
git rm tests/unit/bootstrap/.gitkeep

bunx vitest run tests/unit/bootstrap/ --reporter=verbose 2>&1 | tee /tmp/n4c-phase6c-vitest.log | tail -30
echo "exit=$?"

git add tests/unit/bootstrap/
git commit -m "test(n4c): add bootstrap tests (B1-B3)

Covers initStorage migration branch dispatch (L4), end-to-end
configMigration + migrateAssistants + runBackendMigrations first-boot
flow via mockHttpBridge, and per-step failure recovery preserving
allSucceeded flag."
```

**NEXT STEP**:立即执行 Phase 8(全分区公共本地门禁)。不要 idle。

---

## 10. 公共 Phase 8 本地门禁(所有 executor 都要跑)

> 每路 executor 完成自己分区全部 Phase 的 commit 后,都要跑本 Phase。这是**个人提交前门禁**,不是整链门禁。

### 8.1 分区清单检查(每路按自己分区跑)

**N4a executor**:

```bash
for f in \
  tests/unit/assistants/useAssistantList.dom.test.ts \
  tests/unit/assistants/useAssistantEditor.dom.test.ts \
  tests/unit/assistants/useAssistantSkills.dom.test.ts \
  tests/unit/assistants/useDetectedAgents.dom.test.ts \
  tests/unit/assistants/assistantUtils.test.ts \
  tests/unit/assistants/AssistantListPanel.dom.test.tsx \
  tests/unit/assistants/AssistantEditDrawer.dom.test.tsx \
  tests/unit/assistants/DeleteAssistantModal.dom.test.tsx \
  tests/unit/assistants/AddSkillsModal.dom.test.tsx \
  tests/unit/assistants/SkillConfirmModals.dom.test.tsx \
  tests/unit/assistants/migrateAssistants.test.ts \
  tests/unit/assistants/runBackendMigrations.test.ts \
  tests/unit/skills/skillSuggestParser.test.ts \
  tests/unit/skills/AddCustomPathModal.dom.test.tsx \
  tests/unit/skills/useAssistantSkillsIntegration.dom.test.ts \
  tests/unit/skills/SkillsHubSettings.dom.test.tsx \
  tests/unit/extension/ExtensionSettingsPage.dom.test.tsx \
  tests/unit/extension/ExtensionSettingsTabContent.dom.test.tsx \
  tests/unit/extension/extensionMapperIntegration.test.ts; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done
echo "N4a file checklist OK (19)"
```

**N4b executor**:

```bash
for f in \
  tests/unit/providers/useModelProviderList.dom.test.ts \
  tests/unit/providers/useConfigModelListWithImage.dom.test.ts \
  tests/unit/providers/useGoogleAuthModels.dom.test.ts \
  tests/unit/providers/ModelModalContent.dom.test.tsx \
  tests/unit/providers/RotatingApiClient.test.ts \
  tests/unit/providers/ApiKeyManager.test.ts \
  tests/unit/providers/ClientFactory.test.ts \
  tests/unit/providers/ProtocolConverter.test.ts \
  tests/unit/system/SystemModalContent.dom.test.tsx \
  tests/unit/system/clientPrefSettings.test.ts \
  tests/unit/system/DisplayModalContent.dom.test.tsx \
  tests/unit/cron/cronUtils.test.ts \
  tests/unit/cron/useCronJobs.dom.test.ts \
  tests/unit/cron/CreateTaskDialog.dom.test.tsx \
  tests/unit/cron/TaskDetailPage.dom.test.tsx \
  tests/unit/cron/CronStatusTag.dom.test.tsx \
  tests/unit/cron/CronJobSiderSection.dom.test.tsx \
  tests/unit/cron/CronJobManager.dom.test.tsx; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done
echo "N4b file checklist OK (18)"
```

**N4c executor**:

```bash
for f in \
  tests/unit/previews/PreviewContext.dom.test.tsx \
  tests/unit/previews/usePreviewHistory.dom.test.ts \
  tests/unit/previews/OfficeWatchViewer.dom.test.tsx \
  tests/unit/previews/PptViewer.dom.test.tsx \
  tests/unit/previews/OfficeDocViewer.dom.test.tsx \
  tests/unit/previews/ExcelViewer.dom.test.tsx \
  tests/unit/previews/MarkdownViewer.dom.test.tsx \
  tests/unit/previews/HTMLViewer.dom.test.tsx \
  tests/unit/previews/PreviewPanel.dom.test.tsx \
  tests/unit/previews/PreviewHistoryDropdown.dom.test.tsx \
  tests/unit/previews/fileUtils.test.ts \
  tests/unit/previews/previewHistoryIntegration.test.ts \
  tests/unit/assets/agentLogo.test.ts \
  tests/unit/assets/presetAssistantResources.test.ts \
  tests/unit/bootstrap/initStorage.migrations.test.ts \
  tests/unit/bootstrap/configMigrationIntegration.test.ts \
  tests/unit/bootstrap/migrationErrorRecovery.test.ts; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done
echo "N4c file checklist OK (17)"
```

### 8.2 四件套 + 无 skip / helper 未改

执行目录 `/Users/zhoukai/Documents/github/AionUi`。所有 executor 都跑:

```bash
# 1. Lint
bun run lint 2>&1 | tee /tmp/n4-phase8-lint.log | tail -15
echo "exit=$?"
# 预期:0 errors(允许 warnings)

# 2. TSC
bunx tsc --noEmit 2>&1 | tee /tmp/n4-phase8-tsc.log | tail -20
echo "exit=$?"
# 预期:退出 0

# 3. Vitest full(所有 executor 跑完整个 suite)
bunx vitest run --reporter=verbose 2>&1 | tee /tmp/n4-phase8-vitest.log | tail -60
echo "exit=$?"
# 预期:Test Files ≥ 60 passed (60),Tests ≥ 88 + 180 = 268 passed

# 4. prek
prek run --from-ref origin/feat/backend-migration --to-ref HEAD 2>&1 | tee /tmp/n4-phase8-prek.log | tail -15
echo "exit=$?"
# 预期:退出 0;Oxfmt / Oxlint / TypeScript 都 Passed

# 5. 无 skip/todo
grep -rnE "\.skip\(|\.todo\(|test\.skip|it\.skip|xit\(|xtest\(" tests/unit 2>&1 | tee /tmp/n4-phase8-skip.log
# 预期:无输出(UC-F-4)

# 6. helper 未被改
git diff origin/feat/n3-test-rewrite-adapter-common -- tests/unit/_helpers/mockHttpBridge.ts 2>&1 | tee /tmp/n4-phase8-helper-diff.log
# 预期:无输出(N4 禁止改 helper)
```

### 8.3 覆盖率快照(不 gate,handoff 贴)

```bash
bunx vitest run --coverage 2>&1 | tee /tmp/n4-phase8-coverage.log | grep -E "assistants|skills|extension|providers|system|cron|previews|assets|bootstrap|File" | head -40
# 预期:输出对应领域文件的覆盖率行;handoff Deviations 节对 < 60% 的解释
```

### 8.4 单 executor test case 数量验证

```bash
# 分区 test 总量下限
# N4a: 19 files * avg 3 case = 57 但 L3 组件 ≥ 5 所以至少 ≥ 12*5 + 4*3 + 3*5 = 87 (粗估)
# N4b: 18 files 类似估算 ≥ 65
# N4c: 17 files 类似估算 ≥ 60
# 合计 ≥ 180(requirements 第 253-255 行硬要求)

bunx vitest run --reporter=verbose 2>&1 | grep -E "^Tests" | tail -1
# 预期:"Tests NNN passed (NNN)" with NNN ≥ N3 的 88 + 你分区的下限
```

**NEXT STEP**:立即执行 Phase 9(基线同步 + 复跑 + push)。不要 idle。

---

## 11. Phase 9 基线同步 + 复跑 + push(每路 executor 都跑)

### 9.1 同步基线

```bash
cd /Users/zhoukai/Documents/github/AionUi

git fetch origin feat/backend-migration
git log --oneline HEAD..origin/feat/backend-migration | head -10
# 情况 A:无输出 → 基线无新 commit,跳到 9.3
# 情况 B:有输出 → 执行 9.2
```

### 9.2 merge 基线(仅情况 B)

```bash
git merge origin/feat/backend-migration --no-ff -m "chore(n4): sync with feat/backend-migration"
# 冲突:
#   - 自己分区之外的冲突 → 跟 §4.2 一样,**不大概率**,若发生 escalate
#   - 自己分区的冲突 → 一般是自己修 + 新 commit,记录在 handoff Deviations
```

### 9.3 复跑完整门禁(Step 4,UC-F-5 必做)

```bash
bun run lint 2>&1 | tee /tmp/n4-phase9-lint.log | tail -10
echo "exit=$?"

bunx tsc --noEmit 2>&1 | tee /tmp/n4-phase9-tsc.log | tail -10
echo "exit=$?"

bunx vitest run --reporter=verbose 2>&1 | tee /tmp/n4-phase9-vitest.log | tail -10
echo "exit=$?"

prek run --from-ref origin/feat/backend-migration --to-ref HEAD 2>&1 | tee /tmp/n4-phase9-prek.log | tail -10
echo "exit=$?"
```

**复跑失败**:

- 基线引入破坏(例如 backend API 字段改动) → STOP,escalate
- 本里程碑隐性冲突 → 修 + 新 commit + handoff Deviations

### 9.4 同步其它 executor 的提交(先到先 push / 后到 pull --rebase)

```bash
git fetch origin feat/n4-test-rewrite-domains

# 情况 1:远端与本地一致 → 直接 push
# 情况 2:远端有别人的 commit → pull --rebase
git pull --rebase origin feat/n4-test-rewrite-domains

# rebase 冲突:
#   - 自己分区文件冲突 → 一定越界了,STOP escalate
#   - 自己分区 .gitkeep / 其它 metadata → 简单 resolve + git rebase --continue
```

### 9.5 push

```bash
git push -u origin feat/n4-test-rewrite-domains
# 预期:成功

git rev-parse HEAD > /tmp/n4-phase9-final-sha.txt
cat /tmp/n4-phase9-final-sha.txt
```

**禁止**:

- `git push origin HEAD:feat/backend-migration`
- `git push origin HEAD:dev`
- `gh workflow run` / `gh pr create`
- `git push --force` 除非 team-lead 明令

**NEXT STEP**:立即执行 Phase 10(写分区 handoff 子节 + SendMessage)。不要 idle。

---

## 12. Phase 10 写 handoff 子节 + SendMessage

### 10.1 为什么只写 "子节"

N4 对外是一个 `N4-outcome.md`,由 team-lead 在三路完成后汇总。每路 executor 完成自己分区时,**向 team-lead 发送自己分区的子节内容**(通过 SendMessage,不自己写 `N4-outcome.md`)。

若 team-lead 明确授权,可以自己更新 `docs/backend-migration/handoffs/N4-outcome.md` 并用 section marker 标出自己这一分区(A / B / C 三节);默认行为是**不自己 touch**,靠 SendMessage 传递。

### 10.2 子节模板(SendMessage 时贴的内容)

```markdown
## N4{a|b|c} 分区 — 交付摘要

### 已交付(自己分区)

- {19/18/17} 个新测试文件
  - <列出每个文件 + ✓ N tests 行从 /tmp/n4*-phase*-vitest.log 截取>

### UC-F-1 命令输出(原始)

- 分支:feat/n4-test-rewrite-domains
- 最新 SHA(自己最后一个 push):<从 /tmp/n4-phase9-final-sha.txt>
- 基线同步:origin/feat/backend-migration @ <基线 sha> <已合入 / Already up to date>

#### bunx vitest run(自己分区)

<头 10 行 + 尾 10 行 + 总行数 + exit code,从 /tmp/n4-phase8-vitest.log 截取>

#### bunx tsc --noEmit

<同上>

#### bun run lint

<同上>

#### prek run

<同上>

#### skip grep(UC-F-4)

grep ... /tmp/n4-phase8-skip.log 无输出,PASS

#### helper 未改

git diff ... /tmp/n4-phase8-helper-diff.log 无输出,PASS

### 覆盖率(自己分区涉及的源码文件)

<从 /tmp/n4-phase8-coverage.log 截取 9 列表格>

### 与计划的偏离(Deviations)

- <对 requirements 路径的修正:如 V9/V10 实际路径,X1 实际文件>
- <源码路径对不上 requirements 的情况,改了哪些 test 的 import 路径>
- <L3 组件测试若只做浅 snapshot / render,解释原因 + 跟进计划>
- 其它

### Backend 修改(UC-G)

- 仓库 / 分支 / SHA / 文件 / 理由 / 验证(若无改为"无")

### Backend 问题发现(UC-G 必 escalate 情况)

- (若无则"无")

### 遗留问题 / 跟进项

- <本次遗留>
```

### 10.3 SendMessage 模板

```
SendMessage({
  to: "team-lead",
  message: "N4{a|b|c} 完成。
  - 分支:feat/n4-test-rewrite-domains
  - SHA(自己最后一个 commit):<sha>
  - 基线同步:origin/feat/backend-migration @ <基线 sha> <已合入 / Already up to date>
  - 分区交付文件数:{19/18/17}
  - 总 tests passed:<N>(全 suite)
  - UC-F 证据:命令输出 ✓ / 无 skip ✓ / helper 未改 ✓ / 基线后复跑 ✓
  - Backend 改动:<有 / 无>,详见子节
  - 偏离计划:<列出>

  以下是本分区的 handoff 子节,请 merge 到 N4-outcome.md 的 {A / B / C} 节:

  <§10.2 模板内容完整粘贴>

  所有其它分区请 team-lead 汇总后统一 handoff。下一步请判定 3 个分区是否全部完成。"
})
```

### 10.4 TaskUpdate(executor 自己做)

每路 executor 写完 commit + push + SendMessage 后:

```
TaskUpdate({
  taskId: "7",              // N4a/b/c 并行 executor 任务 id
  status: "completed",
  description: "<加一行:本路完成时间 + 自己的 SendMessage 时间>",
})
```

> 注:task #7 是三路共享的。实际项目里 team-lead 可能会拆成 #7a / #7b / #7c;executor 按自己被派的 task id 更新。

**NEXT STEP**:完成 SendMessage 后**可以**退出;team-lead 会判定三路全部完成后启动 N5。

---

## 13. Commit 策略 + message 模板

### 13.1 总览表

| Phase                    | N4a commit message                                                          | N4b commit message                                        | N4c commit message                                                      |
| ------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| 2a/b/c                   | `test(n4a): add assistantUtils unit tests (A5)`                             | `test(n4b): add providers L1 pure function tests (P5-P8)` | `test(n4c): add preview utils/context/history hook tests (V1, V2, V11)` |
| 3a/b/c                   | `test(n4a): add assistants hooks dom tests (A1-A4)`                         | `test(n4b): add providers hooks dom tests (P1-P3)`        | `test(n4c): add preview viewers L3 dom tests (V3-V8)`                   |
| 4a/b/c                   | `test(n4a): add assistants L3 component dom tests (A6-A10)`                 | `test(n4b): add ModelModalContent dom tests (P4)`         | `test(n4c): add preview panel + history tests (V9, V10, V12)`           |
| 5a/b/c                   | `test(n4a): add assistants L4 migration tests (A11-A12)`                    | `test(n4b): add system settings tests (S1-S3)`            | `test(n4c): add assets tests (X1-X2)`                                   |
| 6a/b/c                   | `test(n4a): add skills tests (SK1-SK4)`                                     | `test(n4b): add cron tests (C1-C7)`                       | `test(n4c): add bootstrap tests (B1-B3)`                                |
| 7a                       | `test(n4a): add extension tests (E1-E3)`                                    | —                                                         | —                                                                       |
| 9 sync                   | `chore(n4): sync with feat/backend-migration`(若基线有更新)                 | 同左                                                      | 同左                                                                    |
| 9 修复                   | `test(n4{a,b,c}): fix <phaseX> after baseline sync`(若基线同步后需要修 bug) | 同左                                                      | 同左                                                                    |
| 10(如授权自己写 handoff) | `docs(n4{a,b,c}): add N4-outcome {A/B/C} section with UC-F evidence`        | 同左                                                      | 同左                                                                    |

### 13.2 禁止的 commit 模式

- `wip`
- `.skip` 任何 test 的 commit
- 同一 Phase 内多次 amend(改完要新 commit,不 amend)
- 合多个 Phase 成一个巨型 commit
- `style(n4x): format` 单独改格式的 commit 应尽量自动化处理

---

## 14. 反 idle / NEXT STEP 复核(反 "executor-n3 行为异常")

### 14.1 每 Phase 末尾的 NEXT STEP 指令(已分布在本 plan 中)

本 plan 每个 Phase 末尾都写了 **NEXT STEP**,位置:

- §Phase 1 末尾:`NEXT STEP:立即执行 Phase 2(你所在分区的 utils / L1 测试)。不要 idle。`
- §Phase 2a 末尾(§7):`NEXT STEP:立即执行 Phase 3a(Assistants hooks)。不要 idle。`
- §Phase 3a 末尾:`NEXT STEP:立即执行 Phase 4a(Assistants L3 components)。不要 idle。`
- §Phase 4a 末尾:`NEXT STEP:立即执行 Phase 5a(Assistants L4 migrate)。不要 idle。`
- §Phase 5a 末尾:`NEXT STEP:立即执行 Phase 6a(Skills)。不要 idle。`
- §Phase 6a 末尾:`NEXT STEP:立即执行 Phase 7a(Extension)。不要 idle。`
- §Phase 7a 末尾:`NEXT STEP:立即执行 Phase 8(全分区公共本地门禁)。不要 idle。`
- §Phase 2b 末尾(§8):`NEXT STEP:立即执行 Phase 3b(Providers hooks)。不要 idle。`
- §Phase 3b 末尾:`NEXT STEP:立即执行 Phase 4b(Providers L3)。不要 idle。`
- §Phase 4b 末尾:`NEXT STEP:立即执行 Phase 5b(System)。不要 idle。`
- §Phase 5b 末尾:`NEXT STEP:立即执行 Phase 6b(Cron)。不要 idle。`
- §Phase 6b 末尾:`NEXT STEP:立即执行 Phase 8(全分区公共本地门禁)。不要 idle。`
- §Phase 2c 末尾(§9):`NEXT STEP:立即执行 Phase 3c(Preview viewers)。不要 idle。`
- §Phase 3c 末尾:`NEXT STEP:立即执行 Phase 4c(PreviewPanel + history integration)。不要 idle。`
- §Phase 4c 末尾:`NEXT STEP:立即执行 Phase 5c(Assets)。不要 idle。`
- §Phase 5c 末尾:`NEXT STEP:立即执行 Phase 6c(Bootstrap)。不要 idle。`
- §Phase 6c 末尾:`NEXT STEP:立即执行 Phase 8(全分区公共本地门禁)。不要 idle。`
- §Phase 8 末尾:`NEXT STEP:立即执行 Phase 9(基线同步 + 复跑 + push)。不要 idle。`
- §Phase 9 末尾:`NEXT STEP:立即执行 Phase 10(写分区 handoff 子节 + SendMessage)。不要 idle。`
- §Phase 10 末尾:`NEXT STEP:完成 SendMessage 后**可以**退出。`

### 14.2 反 idle 规则

- 每次 commit 完,**立刻**执行下一 Phase 的第一个命令(工具预检、文件检查、Write 等)。
- 每次验证命令完,**立刻**记录输出 + 进入下一子步。
- 只有三种情况允许停:
  1. Phase 10 SendMessage 发送完毕
  2. 遇到 STOP 类 escalate 情况,且已 SendMessage 报告原因
  3. 工具真报错无法继续(bun install / vitest 崩)且已 SendMessage 报告
- 发生任意"写完 commit 就静默"的行为 → **算 executor 失责**,team-lead 会接手并在 Deviations 节点名。

### 14.3 Phase 完成判定(机械化)

每个 Phase 视为完成,当且仅当:

- 所有命令输出退出码 = 0
- 所有预期文件已创建
- 已 commit 且 commit message 符合 §13 模板
- (Phase 9 之后)已 push

---

## 15. 失败诊断路径汇总

| 失败现象                                                  | 看哪个日志                     | 诊断方向                                                                                |
| --------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| `bun install` 挂                                          | 终端实时                       | 网络 / lockfile 损坏 → `rm -rf node_modules && bun install`                             |
| vitest 找不到 test                                        | /tmp/n4\*-phaseX-vitest.log    | 文件名必须 `.test.ts` 或 `.dom.test.ts(x)`;检查路径                                     |
| vitest alias `@/` 无法解析                                | /tmp/n4\*-phaseX-vitest.log    | `vitest.config.ts` 的 aliases(N3 已锁,不改)                                             |
| `Cannot access 'mockBridge' before initialization`        | vitest log                     | vi.mock 工厂引用了外部 const → 改为 §2.3 模板 B(vi.mock 工厂里只放 vi.fn())             |
| `MODULE_NOT_FOUND` in vi.hoisted                          | vitest log                     | 同上,vi.hoisted + require 不行 → 用 §2.3 模板 B                                         |
| worker fork 死锁 / 单测 > 2 分钟                          | vitest log hangs               | vi.mock async factory + dynamic import → 改为 inline vi.mock + mockImplementation       |
| `restoreAllMocks` 破坏 vi.mock                            | vitest 日志后续 test 挂        | `afterEach` 去掉 restoreAllMocks,只保留 clearAllMocks                                   |
| fake timers + async 挂起                                  | test 超时                      | `await vi.advanceTimersByTimeAsync(ms)` 而非同步                                        |
| reject promise 报 "Unhandled rejection"                   | vitest warn                    | **先绑 `await expect(p).rejects.toThrow()` 再触发**,不要先触发后绑                      |
| `renderHook` 报 `No QueryClientProvider` / `No SWRConfig` | dom test 日志                  | 传 `wrapper` 包 SWRConfig;类似地,Preview / i18n 需要对应 Provider wrapper               |
| `unable to find element ...`                              | dom test 日志                  | Arco 的组件渲染后 role / name 可能与原生 HTML 不同;用 `data-testid` 或 `screen.debug()` |
| "Not wrapped in act(...)"                                 | dom test 日志                  | 用 `await user.click(...)`,不要用 `fireEvent`                                           |
| coverage 报告生成失败 (`v8 provider crashes`)             | /tmp/n4-phase8-coverage.log    | escalate(vitest 4 升级兼容问题);handoff 记录,不 gate                                    |
| prek Oxfmt 报 Failed,未自动修复                           | /tmp/n4-phase8-prek.log        | `bun run format` → 再跑 prek;修复 diff 要 commit                                        |
| rebase 冲突在自己分区之外文件                             | git status                     | 一定有人越界;STOP,escalate                                                              |
| push 被拒 `non-fast-forward`                              | push 输出                      | 远端有别人的新 commit → `git pull --rebase` → push;≥ 3 次被夺先 → escalate              |
| `grep -rn ".skip\|..."` 有输出                            | /tmp/n4-phase8-skip.log        | UC-F-4 违规,必须改成正常 test 或删除                                                    |
| `git diff origin/.../mockHttpBridge.ts` 有输出            | /tmp/n4-phase8-helper-diff.log | N4 禁止改 helper;revert 自己的改动 → 若真需要扩展 → escalate                            |
| backend 行为与 adapter 不一致(N4 测试写着失败)            | vitest log + 源码 inspect      | UC-G:判断 scope,本分区 crate 内就在 backend 同名分支改、cargo test、handoff 记录        |

---

## 16. 回滚指令(三档)

### 16.1 本地未 push

```bash
# 放弃所有未 push 的本地提交
git checkout feat/n3-test-rewrite-adapter-common
git branch -D feat/n4-test-rewrite-domains
# 完全回到 N3 状态
```

### 16.2 已 push 但下游 N5 未启动

```bash
# 删远程分支,本地重做
git push origin --delete feat/n4-test-rewrite-domains
git checkout feat/n3-test-rewrite-adapter-common
git branch -D feat/n4-test-rewrite-domains
# 重新 checkout 新分支开工
```

### 16.3 已 push 且 N5 已基于 N4 开工 / 本链已完成

**不要**删远程分支。做法:

- 在 `feat/n4-test-rewrite-domains` 上**新建修复 commit**(绝不 amend / rebase 历史)
- handoff Deviations 节说明修复
- push 后 SendMessage 给 team-lead + N5 teammate

**整链已完成,才发现 N4 有方向性问题**:由 team-lead / 人类决定整链重做 / 补丁 / 接受现状。teammate 不自主决策。

---

## 17. 业务功能自动化验证

N4 不涉及 runtime behavior change —— 所有交付物都是**测试文件**。业务功能验证的机械化方式:

- **testing 过程即验证**:每个 `.test.ts(x)` 通过 = 对应 runtime 行为得到断言覆盖
- **L4 integration tests 即 "首启 migration 流"** / **"extension 路由流"** / **"preview history 流"** 的自动回放 —— 不需要真跑 app
- **coverage 展示**(见 Phase 8.3):每个分区涉及的源码文件的 statement 覆盖率
- **无需 e2e / bun start**:本里程碑不启动 electron,不跑 webui,不跑 build(都是 N5 或整链末端责任)

因此"业务功能自动化验证"对本里程碑的唯一落地:**vitest run 全绿 + 覆盖率报告贴进 handoff**。

---

## 18. 自查清单(plan-writer 提交前)

- [x] 总分区数 3(N4a / N4b / N4c),文件数 19 + 18 + 17 = 54
- [x] 每个分区的文件清单精确列出,路径可 `test -f` 核验
- [x] requirements 原文路径错误已修正(V9/V10 多一级 `components/`,X1 实际是 `agentLogo.ts`)
- [x] 每个 test case 数量下限写清(L1 ≥ 5,L2 ≥ 3,L3 ≥ 5,L4 ≥ 3)
- [x] 并行规则(§4)清晰:零目录重叠 / 先到先 push / 后到 pull --rebase / 冲突 escalate
- [x] 基线同步三步(§11)齐全
- [x] 约束 executor 不创建 PR、不合回共享分支、不 rebase 上游
- [x] UC-F 5 条反偷懒原则贯穿(§0 + §8 + §10)
- [x] **每个 Phase 末尾写 NEXT STEP**(§14 列表化,反 executor-n3 idle 问题)
- [x] N3 踩坑(vi.mock / vi.hoisted / async factory / restoreAllMocks)全部写入 §2.4 警示
- [x] N4 推荐写法(§2.3 模板 A/B/C/D)具体可 copy-paste
- [x] 失败诊断路径(§15)覆盖 ≥ 15 种常见情况
- [x] 回滚指令(§16)三档齐全
- [x] 上游 handoff 字段映射(§3)
- [x] commit message 模板(§13)全 Phase 覆盖
- [x] 工具预检(§5)
- [x] 平台兼容(§6)
- [x] 不含 TBD / TODO 占位符

---

**本 plan 已通过自查**。

三个 executor 按 Phase 0 → 1 → {2-7 各分区 } → 8 → 9 → 10 顺序执行,**每个 Phase 末尾立即执行 NEXT STEP 指令,不要写完 commit 就 idle**。遇阻塞 SendMessage 给 team-lead,不自主决策。
