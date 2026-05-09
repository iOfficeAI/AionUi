# 清理与测试重写 Teammate Cheatsheet

- **读者**:被派去执行单个里程碑的 teammate(executor 或 plan-writer)
- **目的**:用最短篇幅列清你必须遵守的硬约束;不讲背景、不讲为什么
- **权威来源**:任何冲突以
  [`2026-05-08-cleanup-team-playbook.md`](./2026-05-08-cleanup-team-playbook.md)
  为准,查细节去那里
- **全局设计**:[`2026-05-08-cleanup-and-test-rewrite-design.md`](./2026-05-08-cleanup-and-test-rewrite-design.md)

---

## ⚠️ 血的教训:为什么要有 UC-F

M 系列(2026-05-07)整条链最后在 `feat/ci-web-cli-release-integration` 留下了
**10+ 个修复 commit**,根因几乎都是"teammate 偷懒"—— 改完代码不等 CI,验证用
经验判断,删代码不 grep 证据,测试被 `.skip` 绕过。这次**本需求的业务逻辑极少、
几乎每一步都能用 `tsc / vitest / grep` 机械判定**,如果还出现同类问题,是
组织纪律问题不是技术问题。

**UC-F 5 条是本 cheatsheet 最关键的增量,必须比 UC-A..E 更熟。**

---

## UC-F 反偷懒硬约束(5 条,全部必读)

### UC-F-1 handoff 必贴原始命令输出

每条 requirements 里的"自动化门禁"命令,handoff 对应位置必须附:

- 完整命令(`$ <command>`)
- 原始 stdout + stderr 的 **头 10 行 + 尾 10 行 + 总行数**
- 退出码(`$ echo $?`)

**禁止**:"tsc 通过" / "vitest 绿" / "按经验无影响" 这类转述。任何非 0 退出
必须在 handoff 的"诊断"节说明根因 + 修复,**不得 `|| true` 吞错**。

### UC-F-2 CI 真实性验证(整链末端一次性合入 dev)

**本仓库 CI 触发实测**:

- `pr-checks.yml` → PR 到 `main/dev` 或 `workflow_dispatch`
- `build-and-release.yml` → `push: branches: [dev]` + tags(**push 到 dev
  触发完整 CI**)
- `_build-reusable.yml` / `pack-web-cli.yml` → `workflow_call` 被动调用

**本链策略**:N1-N5 在 feature 分支链上完成后,**由 team-lead 把整链一次性
合入 `dev` 触发一次完整 CI**。不是每个里程碑跑一次(避免扰动 dev +
保持粒度清晰)。

#### 你作为 teammate 的 CI 责任

- 只在**自己的 feature 分支**上工作;本地 `lint + tsc + vitest + prek` +
  基线同步后复跑(UC-F-5)**是你本里程碑的主门禁**
- **严禁** push / merge 到 `dev` 或 `feat/backend-migration`
- **严禁** 用 `gh workflow run` 等方式主动触发 CI(由 team-lead 统一)
- handoff 必须显式写:"**本里程碑未触发 CI run,统一由 team-lead 在整链
  合入 dev 时验证**"

#### team-lead / 协调者的 CI 责任(非 teammate 范围)

- N5 executor 完成并 handoff 后,team-lead 检查 UC-F-1..5 证据齐全
- **把整条链一次性合入 dev** → push 触发 `build-and-release.yml`
- 等 `gh run watch`、必须 `conclusion: success`;失败不得 hot-fix dev,
  必须 revert + 回链尾某里程碑补 commit

**你不负责合 dev,但**:

- 若你作为 N5 executor,handoff 必须为 team-lead 准备:
  - 整链 SHA list(N1-N5 各分支最新 SHA)
  - 明确告知"整链合入 dev 触发 build-and-release.yml"的操作指南
  - 预留"整链合入 dev 验证"节让 team-lead 回填

#### 通用

- CI fail **不得**掩盖;不得 merge 基线后 push 冲一冲
- 仅在明显非代码问题(registry timeout 等)允许 `gh run rerun` 一次,
  说明原因;≥ 2 次 flaky 必须 escalate 调查根因

### UC-F-3 删代码必须 grep 证明无外部引用

删除任何源文件前,必须跑并在 handoff 贴输出:

```bash
grep -rn "<basename>" \
  packages/ scripts/ tests/ \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.json' --include='*.yml' --include='*.yaml'
```

每行必须标注("self-reference" / "consumer 也在删除集合中");发现外部引用
**不得自行判断"可以忽略"**,必须 escalate。删后再跑 `bunx tsc --noEmit`,
错误数必须保持为 0。

### UC-F-4 新测试必须证明实际执行

- `bunx vitest run --reporter=verbose`,handoff 贴每个新增测试的 `✓` 行 +
  总 `N passed`
- 总数 **≥ 本 requirements 清单预期数**;低于的要 escalate
- **严禁 `.skip` / `.todo` / `xit` / `xtest`**;清单里每个测试必须真正能跑的断言
- 测试不得走真实网络 / 真实 backend;全部用 N3 沉淀的 `mockHttpBridge` 或 `vi.mock`
- **若发现前端实际依赖 backend 有 bug**:不得 skip 绕过,也不得把错误现状
  写成断言;按 **UC-G** 跨仓修改流程,在本地 aionui-backend 仓改到正确行为,
  前端重启后写正常测试

### UC-F-5 本地门禁顺序 + 基线同步后必须完整复跑

```bash
# Step 1 初次本地门禁
bun run lint
bunx tsc --noEmit
bunx vitest run
prek run --from-ref origin/feat/backend-migration --to-ref HEAD

# Step 2 里程碑专属业务回归(见各 requirements)

# Step 3 同步基线(merge 不是 rebase)
git fetch origin feat/backend-migration
git merge origin/feat/backend-migration --no-ff \
  -m "chore(nx): sync with feat/backend-migration"

# Step 4 合并后完整复跑 Step 1 四条,不得跳过
bun run lint && bunx tsc --noEmit && bunx vitest run && \
  prek run --from-ref origin/feat/backend-migration --to-ref HEAD

# Step 5 push(改 workflow 的按 UC-F-2 等 CI)
git push -u origin <branch>
```

Step 4 新失败:基线引入的破坏 → escalate;本里程碑隐性冲突 → 修 + handoff Deviations。

---

## 你是谁

| 角色                      | 产出                                           | 读什么                                                                                                                 |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **executor-N{x}**         | 代码 + 测试 + handoff                          | 本 cheatsheet + 总设计对应节 + 自己 requirements + (N3/N4 还要读 detailed plan) + 上游 handoff                         |
| **plan-writer-N{3 或 4}** | `2026-05-08-n{x}-{name}.md` detailed plan 文件 | 本 cheatsheet + 总设计 + 自己 requirements + M1 plan(格式参考 `2026-05-07-m1-monorepo-skeleton.md`) + 已完成的 handoff |

**N1 / N2 / N5 不派 plan-writer**(纯机械清理/配置,requirements 已经够 executor 执行)。

---

## 分支规则(任何角色都必须遵守)

- ✅ 基于 **`origin/feat/n{x-1}-xxx`**(上游里程碑分支)创建自己的 feature 分支
- ✅ **分支命名**:
  - N1 = `feat/cleanup-and-test-rewrite`(等于整条链的起点分支)
  - N2 = `feat/n2-legacy-test-cleanup`
  - N3 = `feat/n3-test-rewrite-adapter-common`
  - N4 = `feat/n4-test-rewrite-domains`
  - N5 = `feat/n5-restore-ci`
- ✅ 在自己的 feature 分支上 commit、push
- ✅ push 前强制 Step 3-4(UC-F-5)
- ❌ **不得** push / merge 到 `feat/backend-migration`
- ❌ **不得** 创建 PR(PR 由人类在整条链完成后决定)
- ❌ **不得** rebase / force-push 上一个里程碑的分支
- ❌ **不得** 改其他里程碑的文件(范围严格限本里程碑)
- ❌ **不得** 在 executor 阶段改自己或上游的 requirements(发现问题 escalate)

---

## N4 内部并行(特别规则)

N4 是本链唯一允许内部并行的里程碑。team-lead 可以在同一个分支
`feat/n4-test-rewrite-domains` 上派 3 个 teammate:

- **N4a-teammate**:`tests/unit/assistants/` + `skills/` + `extension/`(19 文件)
- **N4b-teammate**:`tests/unit/providers/` + `system/` + `cron/`(18 文件)
- **N4c-teammate**:`tests/unit/previews/` + `assets/` + `bootstrap/`(17 文件)

**严格约束**:

- 三个 teammate **都基于同一个 `feat/n4-test-rewrite-domains` 分支**,不开子分支
- **先到先 push**,后到先 `git pull --rebase` 再写,避免冲突
- **零目录重叠**:每个 teammate 只 touch 自己分到的目录,**不得**碰其它分区
- N3 的 `tests/unit/_helpers/mockHttpBridge.ts` **任何 N4 teammate 都不得改**;
  需要扩展必须 escalate
- 三个 teammate 各自完成时 SendMessage 给 team-lead 告进度;由 team-lead
  判定三个都完成后写**单一** `N4-outcome.md`(A 部分 / B 部分 / C 部分三节)

**涉及 UC-G 跨仓 backend 改动时**(三路并行下的协同):

- 三个 teammate 在 aionui-backend 仓也**共享同一个同名分支
  `feat/n4-test-rewrite-domains`**,协同规则与前端一致:先到先 push、后到
  `git pull --rebase`
- **零 crate 重叠**:N4a 改 backend 时只碰 assistant / extension / assets
  等对应 crate;N4b 碰 aionui-system / aionui-cron;N4c 碰 aionui-office /
  aionui-file;crate 交叉需 escalate
- 三个 teammate 各自在自己前端 handoff 的"Backend 修改"节只列自己的
  commit/SHA;team-lead 合并 N4-outcome 时汇总全部

---

## 冲突时谁说了算(权威优先级)

1. 总设计 **UC-A / B / C / D / E / F** 六节(跨里程碑硬约束)
2. **N3 handoff 锁定的 `mockHttpBridge` 签名**(N4 依赖锚点)
3. 自己的 **requirements.md**(里程碑范围、边界、验收)
4. 自己的 **detailed plan**(N3/N4 才有;执行步骤)
5. **上游 handoff**(实际交付情况)

**发现上层与下层冲突 → 以上层为准,escalate 给 team-lead,不自主折中**。

---

## 完成前必须跑的事(最小验证集)

### 所有里程碑通用

```bash
bunx tsc --noEmit          # 类型检查
bun run lint               # oxlint
bunx vitest run            # 单元测试
prek run --from-ref origin/feat/backend-migration --to-ref HEAD
```

### 基线同步三步(push 前必做,等于 UC-F-5 的 Step 3-4)

```bash
git fetch origin feat/backend-migration
git merge origin/feat/backend-migration --no-ff \
  -m "chore(n{x}): sync with feat/backend-migration"
# 冲突:简单自己解,复杂 escalate
# 合入后重跑上面的质量门禁
git push -u origin feat/n{x}-{name}
```

### 写 handoff(模板:`docs/backend-migration/handoffs/N{x}-outcome.md`,≤ 700 字)

> N 系列由于 UC-F-1 要贴原始命令输出,比 M 系列的 500 字稍放宽到 700 字。
> 命令输出按头 10 + 尾 10 + 总行数截断,不要贴全。

```markdown
# N{x} <名称> - 交付摘要

## 已交付

- 新建 / 删除 / 修改文件清单
- 新增的对外 API / 配置项

## 与计划的偏离

- <改动点> —— 原因 —— 对后续影响

## 给下一个里程碑的提醒

- <警示>

## 验证证据(UC-F-1,贴原始输出)

- 分支名 + 最新 SHA
- 基线同步状态(基线 SHA + merge commit SHA)
- tsc / lint / vitest / prek 的头 10 尾 10 + 总行数 + 退出码
- 本里程碑对应的 checkpoint 命令输出

## Backend 修改(UC-G,必填,没改写"无")

- 仓库 / 分支 / 最新 SHA
- 修改文件(file + 变更行数)
- 一句话理由
- 验证(`cargo test -p <crate>` 输出)
- 待办(人类 PR+merge)

## Backend 问题发现(UC-G 必 escalate 的情况,无则不写)

- 问题描述 + 位置 + 为什么本里程碑不能自行改
- 建议的后续 issue / 修复方向

## 遗留问题 / 跟进项
```

### SendMessage 给 team-lead

```
N{x} 完成。
- 分支:feat/n{x}-{name}
- SHA:<sha>
- 基线同步:origin/feat/backend-migration @ <基线 sha> 已合入
- Handoff:docs/backend-migration/handoffs/N{x}-outcome.md
- UC-F 证据:贴命令输出 ✓ / grep 证据 ✓ / CI 真跑 ✓(N5) / 无 skip ✓ / 基线后复跑 ✓
- 偏离计划:<无 / 列出>
请启动 N{x+1}。
```

---

## executor 和 plan-writer 的额外硬约束

### Executor 特有

- 每个阶段 commit(不要等到最后一次大 commit)
- checkpoint 命令输出**按 UC-F-1 贴进 handoff**,不转述
- checkpoint 失败 → 不 push,escalate,不自主硬改
- 不改 plan / requirements(偏离写进 handoff 的"偏离计划"节)
- 删代码遵守 **UC-F-3** 贴 grep 证据
- 写测试遵守 **UC-F-4** 不得 skip/todo
- 基线同步遵守 **UC-F-5** 完整复跑

### Plan-writer 特有(仅 N3/N4)

- 产出物是 **`2026-05-08-n{3|4}-{name}.md`** 文件,不写代码
- **不得偏离自己 requirements 的已定决策**;遇到 requirements 没覆盖的决策点 → escalate
- 必须在 detailed plan 里补齐以下 12 项执行细节(requirements 不覆盖):
  1. 阶段化分解
  2. Phase 0 基线快照(测试通过数、文件数等)
  3. 预检步骤(上游 merge、分支干净、bun install 可跑)
  4. 逐行 Edit diff(每个文件的 before/after)
  5. commit 策略(每阶段 commit,message 写 `test(nx): ...` 或 `refactor(nx): ...`)
  6. 平台兼容命令(macOS vs Linux sed,zsh vs bash)
  7. 失败诊断路径(每个验证命令 fail 时看哪个日志)
  8. 业务功能自动化验证(不要写"手动验证",找 e2e 或写脚本)
  9. 工具预检(`bunx vitest` / `prek` / `gh` 等可用性)
  10. 上游 handoff 字段映射(从 N{x-1} handoff 读哪个字段用在哪一步)
  11. 最后阶段的完整三步(同步基线 + 重跑验证 + push + SendMessage)
  12. 回滚指令(本地未 push / 已 push 但下游未启动 / 已 push 且下游已启动,三档)
- 最后 SendMessage 通知 team-lead:plan 路径 + 阶段数 + 预估时间 + 关键风险

---

## 元原则(拒绝人工判断)

- 能用脚本判定的,不要留给肉眼
- 能从日志 grep 的,不要写成"确认服务启动"
- 能从 artifact list 验证的,不要写成"检查 release 页面"
- 暂时无法机械化的点,必须在 handoff 显式标注:(a) 这是人工检查
  (b) 为什么目前无法机械化 (c) 哪个里程碑补强

**"看起来差不多对了"不是 PASS 理由**。本需求每一步都能用 `tsc / vitest / grep`
判定,理论上不应该出现"无法机械化"。

---

## 关键硬约束速记(UC 摘要)

- **UC-A 范围**:只动 assets / skills / extension / assistants / providers /
  system / cron + file preview;**不碰** team / acp / conversation / mcp /
  shell / pet / agent / task / worker / webui / auth / remoteAgent /
  workspaceSnapshot / windowControls / tray / autoUpdate / deepLink / zoom /
  initAgent(除 migration 分支)/ shellEnv
- **UC-B 保留名单**:`migrateAssistants.ts` / `runBackendMigrations.ts` /
  `systemSettingsBridge.ts` / `previewUtils.ts`(被 AcpAgentManager 用) /
  `ccSwitchModelSource.ts`(被 acp/agent 用);见总设计附录 A 的 grep 证据
- **UC-C 测试布局**:`tests/unit/<module>/` 镜像 `tests/e2e/features/`;保留
  `tests/e2e/**` / `tests/fixtures/**` / `vitest.setup.ts` /
  `vitest.dom.setup.ts` / `packages/web-host/**/*.unit.test.ts`;不改
  `vitest.config.ts`
- **UC-D 覆盖最低**:N3 交付 6 + N4 交付 54 = 60 文件
- **UC-E 恢复 CI**:N5 取消 3 个 workflow 的 `bunx vitest run` 注释;不保留
  "temporarily disabled" 注释块
- **UC-F 反偷懒**(见上方完整 5 条)
- **UC-G 跨仓修改**:发现 backend 行为问题,**可以直接改 aionui-backend**
  (同名分支接力 / 不开 PR / 本地 cargo 验证 / handoff 记录);但 5 种情况
  必须 escalate(见下方 UC-G 节)

---

## UC-G 跨仓修改 aionui-backend(本链唯一允许的跨仓场景)

### 环境预检(首次执行 N1 前必做一次,之后所有里程碑复用)

本机必须按 `~/Documents/github/aionui-backend/docs/development-workflow.md`
"一次性环境准备"节配好双仓联调环境。**少一步后面 UC-G 走不通**:

```bash
# 1. 安装 cargo-watch(推荐)
cargo install cargo-watch

# 2. 先编译一次 backend,确认 target/debug/aionui-backend 产物存在
cd ~/Documents/github/aionui-backend
cargo build

# 3. 建 symlink 到 PATH 首位(关键!前端 binaryResolver.ts 靠这个找到 backend)
ln -sf ~/Documents/github/aionui-backend/target/debug/aionui-backend \
       ~/.cargo/bin/aionui-backend

# 4. 验证 symlink 正确(输出开头应是 'l' 表示 symlink,不是真实二进制)
ls -la ~/.cargo/bin/aionui-backend
which aionui-backend          # 应输出 /Users/<user>/.cargo/bin/aionui-backend
aionui-backend --help         # 应能跑

# 5. 前端仓依赖
cd ~/Documents/github/AionUi
bun install
```

**避坑**:若 `~/.cargo/bin/aionui-backend` 开头不是 `l`(说明之前 `cargo
install --path .` 装成了真二进制),必须删掉重建 symlink,否则后续改 backend
源码不会被前端看到。

teammate 首次执行里程碑时在 handoff 的"环境预检"节贴 `ls -la
~/.cargo/bin/aionui-backend` 和 `which aionui-backend` 输出各一行证明。

### 日常开发循环

改 backend 源码 → `cargo watch` 自动编译 → 重启 AionUi(关闭 bun start 再
重启)即可吃到新行为。前端 renderer HMR 不受影响;backend 是启动时 spawn
的子进程,**不会热重载**,所以每次改 backend 都要重启前端。

### 什么时候允许改 backend

前端测试 / 清理工作发现后端行为问题,**允许 teammate 在本地 aionui-backend
改代码**:

- 字段名拼错 / 类型错
- 路由签名不对(如 method / 参数名)
- 返回值 shape 与 adapter 约定不符
- 业务逻辑 bug(在本里程碑 scope 对应的 backend crate 内)

### 如何做

```bash
# 1. 在 backend 仓拉同名分支
cd ~/Documents/github/aionui-backend
git fetch origin
git checkout -b feat/n{x}-{name} origin/main
# 分支名和前端本里程碑分支尾段完全一致

# 2. 改代码,cargo watch 自动编译
# 3. 本地验证
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo test -p <受影响 crate>    # 别跑全仓
cargo fmt --all -- --check

# 4. 重启 AionUi 端到端验证(关掉 bun start 再重启)

# 5. commit + push backend 分支(不开 PR!)
git add <files>
git commit -m "<type>(<crate>): <subject>"
git push -u origin feat/n{x}-{name}
```

### 严禁(违反即 escalate)

- ❌ 改本次前端 requirements **明确不碰领域对应的 backend crate**
  (N3 不得改 `aionui-team`,N4 不得改 `aionui-mcp` 等)
- ❌ 在 backend 分支上 `rebase` / `force-push`
- ❌ merge 到 `aionui-backend/main` 或任何 backend 共享分支
- ❌ 自己开 backend PR(PR 由人类整链收尾时统一发起)
- ❌ 改 backend 的 CI / `release-please` / `rust-toolchain.toml` / Cargo
  workspace 配置 / DB migration / API 破坏性改动(这些必须 escalate)

### 必 escalate 的 5 种情况

1. 跨 crate 且**超出本里程碑 scope**(如改多个 domain crate)
2. 改动 backend **公共基础设施**(CI / release-please / Cargo workspace /
   rust-toolchain)
3. 改动 **DB schema / migration**(向下兼容性复杂)
4. **API 破坏性变更**(删 route / 改 route 签名 / 改返回类型)—— 前后端
   要一起动,变成大修
5. 你不熟 Rust / 改动超出信心边界

→ teammate 把发现写进 handoff "Backend 问题发现(需 escalate)"节,
**不自己改**,SendMessage 给 team-lead

### handoff 必加"Backend 修改"节

不论有没有改,都要写(没改就填"无"):

```markdown
## Backend 修改

- 仓库:iOfficeAI/aionui-backend
- 分支:feat/n{x}-{name}
- 最新 SHA:<push 后的 SHA>
- 修改文件:
  - `crates/aionui-system/src/bedrock_probe.rs`(+12 / -3)
- 一句话理由:backend 返回 provider.id 为 Option<String>,adapter 期望
  非空 String;修 backend 为必填(符合 api-types 约定)
- 验证:`cargo test -p aionui-system` N passed;前端重启后对应测试变绿
- **待办**(人类):backend 分支未开 PR,链合入 dev 前须先 PR+merge 到
  aionui-backend/main
```

### team-lead 在整链合入 dev 前的责任

整链合入 dev 前,team-lead **必须**先完成 backend 侧的合入:

1. 汇总所有 handoff 的"Backend 修改"分支
2. 协调人类把这些 backend 分支 PR + merge 到 `aionui-backend/main`
3. 等 backend 新版本可用后才整链合入 dev(否则 CI 用老 backend 跑新测试必挂)

### CI fail 是 backend 问题时

整链合入 dev 后 `build-and-release.yml` fail,诊断指向 backend:

- team-lead revert dev 上的整链 merge
- 回对应里程碑在 backend 同名分支补 commit
- 重走 backend 同步流程
- 整链再次合入 dev 重跑 CI
- ≥ 2 次循环 escalate 给人类

---

## 遇到状况怎么办

| 状况                                                  | 做法                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| checkpoint 失败                                       | 不 push,escalate,handoff 里列诊断 + 尝试过的修复                                                              |
| 基线合并冲突复杂                                      | 不硬改,escalate                                                                                               |
| requirements 的决策和 UC 冲突                         | 以 UC 为准,escalate 让人类改 requirements                                                                     |
| plan 里某条验证需要人眼判断                           | 改进验证命令,不能打"manual verify"                                                                            |
| 发现上游里程碑遗留 bug                                | 不自主修,escalate;该补丁应在新的 commit 而非 amend 里解决                                                     |
| 写测试发现 backend 行为有 bug                         | **UC-G**:判断 scope,在 scope 内就在本地 backend 仓同名分支改、cargo test 验证、handoff 记录;scope 外 escalate |
| 发现 backend 缺 route / 数据库 schema 不对            | 按 UC-G 必 escalate 的 5 种情况判定,DB / 破坏性变更一律 escalate                                              |
| 发现 UC-B 保留文件实际可删 / 或"可删"文件实际不能删   | 立即 escalate,**不得**自主扩大或缩小删除清单                                                                  |
| 需要的工具没装(`prek` / `bunx @electron/asar` / `gh`) | 装上;若不能装 escalate                                                                                        |
| CI flaky(网络 / registry / 偶发)                      | 允许 `gh run rerun <id>` 一次并在 handoff 说明;≥ 2 次 escalate 调查根因                                       |
| N4 三个并行 teammate 撞了同一文件                     | **不能撞**(目录零重叠);如发生一定是有人越界,escalate                                                          |
| N3 的 `mockHttpBridge.ts` 不够用                      | escalate,由 team-lead 决定是否扩展 helper 签名 + 更新 N3 handoff                                              |

---

## 查详情

| 主题                                    | 去 playbook 的哪节                                 |
| --------------------------------------- | -------------------------------------------------- |
| 完整角色模型、派发流程                  | "用户操作" / "Team-lead 调度规则"                  |
| 完整 executor / plan-writer prompt 模板 | "Executor Prompt 模板" / "Plan-Writer Prompt 模板" |
| 简单 vs 复杂里程碑判定                  | "里程碑复杂度与派发策略"                           |
| Checkpoint 清单(每个里程碑)             | "Checkpoint 规范"                                  |
| N4 内部并行的 team-lead 视角            | "N4 并行派发"                                      |
| 分支协作模型全貌                        | "分支协作模型"                                     |
| 基线同步的冲突处理                      | "基线同步规范"                                     |
| UC-F 违反了怎么办                       | "UC-F 违反的处理"                                  |

**手头事有明确做法就直接做;规则不清才去查 playbook**。
