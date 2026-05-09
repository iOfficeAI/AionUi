# 清理与测试重写 Team Playbook

- **日期**:2026-05-08
- **对应总设计**:`2026-05-08-cleanup-and-test-rewrite-design.md`
- **目的**:让整条清理与测试重写工作可以被**多个独立 AI 会话 / 人类工程师
  协作**完成,避免单一会话上下文污染
- **适用环境**:**主要**适用于 Claude Code team-mode(需要 `TeamCreate` /
  `Agent(team_name=...)` / `SendMessage` 工具)。非 team-mode 见"非 team-mode
  执行映射"节
- **目标读者**:team-lead / 协调者 / 文档维护者(~800 行)
- **执行 teammate(executor / plan-writer)请勿默认加载本文件**,读精简版:
  [`2026-05-08-cleanup-teammate-cheatsheet.md`](./2026-05-08-cleanup-teammate-cheatsheet.md)
  (~250 行,只列硬约束)

---

## 权威来源优先级(遇到冲突时按此顺序裁决)

| 范围                         | 权威来源                                                | 举例                                                               |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| 公共规则、跨里程碑的统一约束 | 总设计的 **UC-A / UC-B / UC-C / UC-D / UC-E / UC-F** 节 | 删除范围、保留名单、测试布局、CI 恢复、反偷懒                      |
| 接口签名                     | **N3 handoff 锁定的 `mockHttpBridge` 签名**             | `createMockHttpBridge()` / `mock.onGet(...)` / `mock.emit(...)` 等 |
| 单个里程碑的范围、边界、验收 | 对应的 `*-requirements.md`                              | "N1 删哪 7 文件"、"N4 的 54 文件清单"                              |
| 执行步骤、逐行命令           | plan-writer 产出的 detailed plan(仅 N3/N4)              | git 操作、sed 命令、具体验证脚本                                   |
| 上游里程碑实际交付           | 对应的 `handoffs/N{x}-outcome.md`                       | "N1 实际删了哪"、"N3 helper 最终签名"                              |

**冲突处理**:

- plan-writer 发现 requirements 和 UC 冲突 → 以 UC 为准,在 plan 里注明
- executor 发现 detailed plan 和 requirements 冲突 → 以 requirements 为准,escalate
- UC 和 requirements 同维度给出不同结论 → escalate 给人类

---

## 文档命名约定

| 文件名                                   | 用途                                            | 谁读                             | 谁产出                |
| ---------------------------------------- | ----------------------------------------------- | -------------------------------- | --------------------- |
| `2026-05-08-n{x}-{name}-requirements.md` | 需求:做什么 / 不做什么 / 已定决策 / 验收 / 风险 | plan-writer 必读 + executor 可读 | 本总设计阶段          |
| `2026-05-08-n{x}-{name}.md`              | detailed plan:阶段步骤 / 逐行命令 / 验证脚本    | executor 必读                    | plan-writer(仅 N3/N4) |
| `handoffs/N{x}-outcome.md`               | ≤700 字产物摘要                                 | 后续 teammate 读上游             | executor 写           |

**N1 / N2 / N5 没有 detailed plan**:requirements 已足够具体,直接派 executor。

---

## 给零上下文读者的背景

**AionUi 后端迁移(`feat/backend-migration`)接近尾声,M 系列(2026-05-07)
已完成**。本次"清理与测试重写"是收尾工作,分为两件事:

1. 删除已被 aionui-backend 接管的**前端残留 bridge / service 代码**(总设计
   附录 A/B 列了 7 个文件的 grep 证据和 adapter 路由对照)
2. 重写被 M 系列重构打烂的单元测试(总设计 UC-D 要求至少 60 个新测试文件)
3. 恢复 CI(M8/M9 临时注释掉的 `bunx vitest run`)

**完整动机 / 范围 / UC 见 `2026-05-08-cleanup-and-test-rewrite-design.md`**。

---

## 协作模型:分支链接力(同 M 系列)

```
feat/backend-migration (共享分支, teammate 只读)
     │
[N1] feat/cleanup-and-test-rewrite          (executor,从 backend-migration 拉)
     │   push 完成后 ↓
[N2] feat/n2-legacy-test-cleanup            (executor,从 N1 拉)
     │
[N3] feat/n3-test-rewrite-adapter-common    (plan-writer + executor)
     │
[N4] feat/n4-test-rewrite-domains           (plan-writer + 3 并行 executor)
     │
[N5] feat/n5-restore-ci                     (executor,改 workflow + 真 CI 验证)
     │
     └→ 由人类决定如何合回 feat/backend-migration
```

**N1 的分支即整条链的起点**:`feat/cleanup-and-test-rewrite`(本总设计和
N1 requirements 已经 push 在这个分支上)。

---

## 里程碑复杂度与派发策略

本次五个里程碑**不全是"plan-writer + executor 两步"**,按复杂度分档:

| 里程碑 | 复杂度              | 是否派 plan-writer                  | 理由                                                                 |
| ------ | ------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| **N1** | 低(纯删代码)        | ❌ 只派 executor                    | requirements 已列具体 7 文件 + grep 证据;detailed plan 无增量        |
| **N2** | 低(纯清理 + 建骨架) | ❌ 只派 executor                    | 同 N1                                                                |
| **N3** | 中(有接口设计)      | ✅ 派 plan-writer + executor        | helper 签名要锁定,detailed plan 能帮 executor 减少接口漂移           |
| **N4** | 高(54 文件 + 并行)  | ✅ 派 plan-writer + 3 并行 executor | 清单展开到具体命令能避免风格漂移;并行派发需要 team-lead 协调         |
| **N5** | 中(改 CI + 等 CI)   | ❌ 只派 executor                    | 动作简单但 UC-F-2 强制要 2 次 CI success;executor 自己跑 gh 命令即可 |

**默认按此表执行**;team-lead 若认为某个里程碑有特殊情况,可以 escalate 给
人类临时调整,但不得单方面省略 plan-writer(N3/N4 的 plan-writer 是必需)。

---

## 用户操作:一句话启动,后续不介入

你(用户)只需要在主会话里说一句**"开始执行清理与测试重写"**,主会话
(team-lead)会自动按本 playbook 调度所有里程碑。

整个执行流程:

1. **你**:主会话说"开始执行清理与测试重写"
2. **team-lead**:
   - `TeamCreate({ name: "cleanup-and-test-rewrite" })`
   - 派 N1 executor(`Agent`,带 `team_name` / `name: "executor-n1"` / `run_in_background: true`)
   - 等 N1 executor 完成(`TeammateIdle`)
   - 读 `handoffs/N1-outcome.md`,确认 UC-F 证据齐全
   - 派 N2 executor
   - N3 开始:**先派 `plan-writer-n3`**,完成后派 `executor-n3`
   - N4 开始:先派 `plan-writer-n4`,完成后**同时派 `executor-n4a` / `executor-n4b`
     / `executor-n4c` 三个并行 teammate**,三者都在同一个 `feat/n4-test-rewrite-domains`
     分支上工作
   - N5 派 executor,重点验 UC-F-2 的 2 次 CI success
   - 全部完成后 `TeamDelete`,向你汇报
3. **你**:接收汇报,决定是否合回 `feat/backend-migration`

**你全程不需要介入**,除非 team-lead escalate:

- checkpoint 失败且 teammate 自己修不动
- 两个里程碑接口冲突,team-lead 无法裁决
- 方向性错误(已做的架构选择被后续验证证伪)

---

## Team-lead 调度规则

当用户说"开始执行清理与测试重写"时:

### 第 1 步:环境预检

#### 前端仓 + team-mode

```bash
# 确认在 AionUi 仓库
cd /Users/zhoukai/Documents/github/AionUi && pwd

# 确认 teams 功能启用
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS  # 应为 "1"

# 确认当前工作树干净,且 origin/feat/backend-migration 是最新的
git fetch origin
git status
git log --oneline origin/feat/backend-migration -1

# 确认 N1 的起点分支已存在(前面设计阶段已 push)
git fetch origin feat/cleanup-and-test-rewrite
git log --oneline origin/feat/cleanup-and-test-rewrite -3
# 预期:至少有 2 个 docs commit
```

#### 双仓联调环境(UC-G 前置条件,必须验证)

UC-G 允许 teammate 修改 aionui-backend,这依赖本机已按
`~/Documents/github/aionui-backend/docs/development-workflow.md` 配好双仓
联调环境。team-lead 派 N1 executor 前**必须**验证:

```bash
# 1. backend 仓存在且可编译
test -d ~/Documents/github/aionui-backend && \
  (cd ~/Documents/github/aionui-backend && cargo check --workspace) \
  || echo "BLOCKED: backend 仓未克隆或编译失败,UC-G 走不通"

# 2. symlink 就位(前端 binaryResolver 靠它找 backend)
ls -la ~/.cargo/bin/aionui-backend 2>&1 | head -1
# 预期:输出开头是 'l'(symlink);不是 → 提示 teammate 按 cheatsheet UC-G
#      环境预检节建 symlink

# 3. which 解析正确
which aionui-backend
# 预期:/Users/<user>/.cargo/bin/aionui-backend

# 4. cargo-watch 已装(推荐,非强制)
which cargo-watch || echo "建议:cargo install cargo-watch"
```

以上 4 项任一不满足时,team-lead **在派 N1 executor 的 prompt 里加一条**
"首阶段先按 cheatsheet UC-G '环境预检'节建 symlink 并在 handoff 附输出"。
不满足这些预检却擅自跳过,后续 UC-G 触发时会直接挂(backend 改动前端收
不到)。

### 第 2 步:建团队

```
TeamCreate({
  name: "cleanup-and-test-rewrite",
  description: "AionUi 前端死代码清理 + 单元测试重写 + 恢复 CI"
})
```

### 第 3 步:按里程碑派 teammate

#### N1 — executor 单派

```
Agent({
  description: "执行 N1 前端死代码清理",
  subagent_type: "general-purpose",
  team_name: "cleanup-and-test-rewrite",
  name: "executor-n1",
  model: "sonnet",
  run_in_background: true,
  prompt: "<见 Executor Prompt 模板,x=1, name=dead-code-cleanup, upstream=feat/backend-migration>"
})
```

等 `TeammateIdle`。读 `handoffs/N1-outcome.md`,断言:

- `bunx tsc --noEmit` 退出码 = 0(UC-F-1 贴了原始输出)
- 7 个待删文件都有 grep 证据(UC-F-3)
- 基线同步已做,merge commit SHA 存在
- 无偏离或已在 Deviations 列出

断言通过 → 派 N2;断言失败 → escalate 给人类。

#### N2 — executor 单派

```
Agent({
  description: "执行 N2 旧测试清理 + 新布局骨架",
  subagent_type: "general-purpose",
  team_name: "cleanup-and-test-rewrite",
  name: "executor-n2",
  model: "sonnet",
  run_in_background: true,
  prompt: "<Executor Prompt 模板,x=2, name=legacy-test-cleanup, upstream=feat/cleanup-and-test-rewrite>"
})
```

#### N3 — 先 plan-writer,再 executor

```
# 第一步
Agent({
  description: "为 N3 撰写 detailed plan",
  subagent_type: "general-purpose",
  team_name: "cleanup-and-test-rewrite",
  name: "plan-writer-n3",
  model: "opus",   # plan 写作用 opus
  run_in_background: true,
  prompt: "<Plan-Writer Prompt 模板,x=3, name=test-rewrite-adapter-common>"
})
```

等 plan-writer idle,读 `docs/backend-migration/plans/2026-05-08-n3-test-rewrite-adapter-common.md`,
做 plan 自检(见"Plan 自检清单"节)。通过后:

```
# 第二步
Agent({
  description: "执行 N3 adapter/common 测试重写",
  subagent_type: "general-purpose",
  team_name: "cleanup-and-test-rewrite",
  name: "executor-n3",
  model: "sonnet",
  run_in_background: true,
  prompt: "<Executor Prompt 模板,x=3, name=test-rewrite-adapter-common, upstream=feat/n2-legacy-test-cleanup>"
})
```

#### N4 — plan-writer + 3 并行 executor

```
# 第一步:plan-writer
Agent({
  description: "为 N4 撰写 detailed plan(含并行分区)",
  subagent_type: "general-purpose",
  team_name: "cleanup-and-test-rewrite",
  name: "plan-writer-n4",
  model: "opus",
  run_in_background: true,
  prompt: "<Plan-Writer Prompt 模板,x=4, name=test-rewrite-domains,
          额外要求:plan 要明确 N4a/N4b/N4c 每个分区的文件清单 + 各自
          的 mock pattern 示例;plan 不得要求 3 个 teammate 读不同的 plan
          —— 共用一份 plan,内部分节>"
})
```

等 plan ready,做 plan 自检。通过后:

```
# 第二步:并行派 3 个 executor,共享一个分支
Agent({
  description: "N4a — assistants+skills+extension 测试",
  subagent_type: "general-purpose",
  team_name: "cleanup-and-test-rewrite",
  name: "executor-n4a",
  model: "sonnet",
  run_in_background: true,
  prompt: "<Executor Prompt 模板 N4 变体,分区=N4a,
          branch=feat/n4-test-rewrite-domains,upstream=feat/n3-test-rewrite-adapter-common>"
})

Agent({...executor-n4b,分区=N4b...})  # 同上,分区不同
Agent({...executor-n4c,分区=N4c...})
```

**N4 三个 executor 的协调** 见"N4 并行派发"节。

#### N5 — executor 单派(但门禁更严)

```
Agent({
  description: "执行 N5 恢复 CI + 真 CI 验证",
  subagent_type: "general-purpose",
  team_name: "cleanup-and-test-rewrite",
  name: "executor-n5",
  model: "sonnet",
  run_in_background: true,
  prompt: "<Executor Prompt 模板 + 额外强调 UC-F-2:必须贴 2 次 CI success URL;
          upstream=feat/n4-test-rewrite-domains>"
})
```

等 idle 后**必须额外核对**:

- `handoffs/N5-outcome.md` 里的 2 个 CI run URL 真实存在 + `conclusion: success`
- 3 个 workflow 的 diff 符合 UC-E
- 整条链 SHA list 已列出(供人类合回用)

### 第 4 步:整链合入 dev + 真 CI 验证(team-lead 核心责任)

N5 executor 完成并 handoff 后,team-lead **不立即 TeamDelete**,先做整链真
CI 验证(UC-F-2 + UC-G-5 的关键一步):

```bash
# 1. 再次确认 UC-F-1..5 证据齐全(见"UC-F 违反的处理"节)
#
# 2. (UC-G-5)先处理 backend 同步:
#    - 汇总 N1..N5 所有 handoff 的"Backend 修改"节,列出 backend 分支清单
grep -A20 "^## Backend 修改" docs/backend-migration/handoffs/N{1,2,3,4,5}-outcome.md
#    - 协调人类(或权限允许时自身)把这些 backend 分支 PR+merge 到
#      aionui-backend/main;等 backend 新版本可用
#    - 若 dev 依赖打包 backend 二进制(AIONUI_BACKEND_VERSION env),
#      更新到新版本
#    - **backend 未同步前不得进入 step 3**,否则 CI 用老 backend 必挂
#
# 3. 整链合入 dev
git fetch origin
git checkout dev
git pull origin dev
git merge --no-ff origin/feat/n5-restore-ci \
  -m "chore: cleanup + test rewrite chain (N1-N5) integration"
git push origin dev

# 3. push 后立即观察 CI
gh run list --branch dev --limit 5 \
  --json databaseId,name,status,conclusion,url
RUN_ID=$(gh run list --branch dev --workflow build-and-release.yml \
  --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
# 等待 run 结束;必须 conclusion=success
```

**失败处理**:

- 明显代码问题(指向前端)→ **不得**在 dev 上 hot-fix:
  ```bash
  # 回滚刚才的 merge
  git revert --no-edit -m 1 HEAD
  git push origin dev
  # 或(若团队规则允许 force push)
  # git reset --hard HEAD~1 && git push --force-with-lease origin dev
  ```
  回到链尾某里程碑的 feature 分支补 commit(通过 `gh run view <id>` 分析
  哪层失败,对应里程碑 executor 重派);修完再整链合入
- 明显指向 backend(UC-G-6)→ 同上 revert dev;派原里程碑 executor 到
  backend **同名分支**补 commit;重走 UC-G-5 的 backend 同步;整链再合;
  ≥ 2 次 "backend 补丁后重合" 循环 escalate 给人类
- 非代码问题(registry timeout 等):允许 `gh run rerun <id>` 一次并说明
- ≥ 2 次 flaky:escalate 人类调查根因

### 第 5 步:最终验收报告 + 收尾

CI `conclusion: success` 后:

1. 在 `docs/backend-migration/handoffs/N5-outcome.md` 末尾(或新建
   `docs/backend-migration/handoffs/chain-integration.md`)追加"整链合入 dev
   验证"节,贴:
   - 合入 dev 的 merge commit SHA
   - `gh run list` 原始 JSON
   - `build-and-release.yml` `conclusion: success` URL
   - 有 rerun 记录和原因
   - 跨平台产物验证简报
2. `TeamDelete("cleanup-and-test-rewrite")`
3. 向用户汇报:
   - 5 个 feature 分支的最终 SHA
   - 整链合入 dev 的 merge commit SHA
   - `build-and-release.yml` 的 success URL
   - 整条链的总 diff 统计(`git diff --stat origin/feat/backend-migration...HEAD` in dev)
   - 任何偏离或延后跟进项

---

## Executor Prompt 模板

team-lead 派 executor 时用(改 `{X}` / `{name}` / `{UPSTREAM_BRANCH}`):

```
你是 AionUi 清理与测试重写的 N{X} 里程碑执行者。

必读文档(按顺序,不可跳过):

1. docs/backend-migration/plans/2026-05-08-cleanup-teammate-cheatsheet.md
   **完整阅读**(~250 行)。硬约束清单(分支规则、UC-F 5 条、基线同步、
   handoff 模板)。这是你必须遵守的底线

2. docs/backend-migration/plans/2026-05-08-n{x}-{name}-requirements.md
   **完整阅读**。这是你的里程碑需求文档,范围 / 边界 / 验收都在这里

3. (如有)docs/backend-migration/plans/2026-05-08-n{x}-{name}.md
   **完整阅读**。这是 plan-writer 给你写的 detailed plan,逐步执行
   (仅 N3/N4 有;N1/N2/N5 跳过本条)

4. docs/backend-migration/plans/2026-05-08-cleanup-and-test-rewrite-design.md
   按需读:UC-A/B/C/D/E/F 相关节、附录 A/B

5. docs/backend-migration/handoffs/N{x-1}-outcome.md
   **完整阅读**(N1 跳过本条,因为 N1 没有上游 N 系列 handoff;
   其它里程碑必读上游)

**只有在 cheatsheet 或 requirements 里的某条规则看不懂、需要查权威来源
时,才去读 `2026-05-08-cleanup-team-playbook.md`**(~800 行,默认不加载)。

禁止读其他 N{x'} 的 requirements / plan / handoff(x' ≠ x 且 x' ≠ x-1)。

任务:严格按 requirements / (detailed plan,如有) 的步骤执行。每个阶段完成
git commit。全部阶段完成后,按 cheatsheet "基线同步三步" 走,再 push。

分支约定:
- 上游分支:origin/{UPSTREAM_BRANCH}
- 你的分支:feat/n{x}-{name}(N1 例外:feat/cleanup-and-test-rewrite)
- push 前必须 merge origin/feat/backend-migration --no-ff 并重跑所有门禁
- 不合回任何共享分支
- 不创建 PR
- 不改其他里程碑的文件

完成后 SendMessage 给 team-lead,报告:
- 分支名
- 最新 SHA
- 基线同步状态(origin/feat/backend-migration 对应 SHA 已合入)
- handoff 文件路径
- UC-F 证据对照(5 条各自是否满足)
- 有无偏离 requirements(有的话列出来)

用中文。
```

**`{UPSTREAM_BRANCH}` 对照**:

- N1:`feat/backend-migration`
- N2:`feat/cleanup-and-test-rewrite`
- N3:`feat/n2-legacy-test-cleanup`
- N4:`feat/n3-test-rewrite-adapter-common`
- N5:`feat/n4-test-rewrite-domains`

---

## Plan-Writer Prompt 模板(仅 N3 / N4)

team-lead 派 plan-writer 时用(改 `{X}` / `{name}`):

```
你是 AionUi 清理与测试重写的 N{X} 里程碑的 Plan Writer,为 N{X} 产出
详细实施 plan。你不写代码,不做执行,只产出一份可执行的 plan 文件。

**前提**:N{X} 的 requirements 已经存在且已锁定。你的任务不是重新定义
N{X} 做什么,而是把 requirements 已锁的"做什么 / 不做什么 / 已定决策 /
验收标准 / 风险"展开为 executor 可机械执行的详细 plan。**不得偏离
requirements 的已定决策**,遇到没覆盖的决策点必须 escalate。

必读文档(按顺序,不可跳过):

1. docs/backend-migration/plans/2026-05-08-cleanup-teammate-cheatsheet.md
   **完整阅读**(~250 行)。作为 plan-writer 你也要遵守这里的 UC-F 等
   硬约束;同时你写的 plan 要让 executor 读同一份 cheatsheet 即可

2. docs/backend-migration/plans/2026-05-08-n{x}-{name}-requirements.md
   **完整阅读**,最高战略优先级。你的战术必须忠实落地它

3. docs/backend-migration/plans/2026-05-08-cleanup-and-test-rewrite-design.md
   重点关注:UC-A..F 里涉及 N{X} 的硬约束、附录 A/B

4. docs/backend-migration/plans/2026-05-07-m1-monorepo-skeleton.md
   **格式参考**(M 系列的 plan 示例)。你写的 plan 必须遵循同样的结构

5. docs/backend-migration/handoffs/N1-outcome.md 等已完成里程碑 handoff
   读已完成里程碑的产物,了解实际交付 / 偏离 / 接口锁定(N3 读 N1/N2;
   N4 读 N1-N3,特别是 N3 的 mockHttpBridge 签名)

**按需查阅**(默认不读):
`2026-05-08-cleanup-team-playbook.md`(~800 行)

禁止:
- 禁止读其他**未开始**里程碑的 requirements / plan / handoff
- 禁止偏离 N{X} requirements 的已定决策(遇到冲突必须 escalate)
- 禁止自己写代码或修改源文件
- 禁止省略步骤、留 TBD/TODO 占位符

你的 plan 必须补齐 requirements 不覆盖的 12 项执行细节(见 cheatsheet):
阶段化 / Phase 0 基线快照 / 预检 / 逐行 Edit diff / commit 策略 /
平台兼容 / 失败诊断 / 业务功能自动化验证 / 工具预检 / handoff 字段映射 /
三步收尾 / 回滚。

你的 plan 必须:
- 让一个零上下文的 executor 照着跑完,不需要外部询问
- 每个命令都可以直接 copy-paste 执行
- 每个验证都能机械判定 PASS/FAIL,不依赖人眼
- 包含基线同步三步
- 约束 executor 不创建 PR、不合回共享分支、不 rebase
- 遵守 UC-F 的反偷懒原则,每个 checkpoint 都能贴原始输出

N4 额外要求:plan 要明确 N4a/N4b/N4c 每个分区的文件清单、mock pattern、
并行协调规则(先到先 push / 后到 pull --rebase)。三个 executor 共用
一份 plan,但 plan 内要分节指明每个分区做什么。

任务:
1. 探查仓库,搞清楚 N{X} 要动的实际文件(读实际代码,不臆想)
2. 产出 plan 到 docs/backend-migration/plans/2026-05-08-n{x}-{name}.md
3. 5 分钟自查:格式合规、命令完整、无占位符
4. SendMessage 给 team-lead 报告:
   - 路径
   - 阶段数
   - 预计执行时间
   - 关键风险 / 已知坑
   "等 N{X-1} 完成后可派 executor。"

用中文。
```

---

## Plan 自检清单(team-lead 每次 plan-writer idle 后必做)

- [ ] 有"零上下文会话背景"、"参考文档"、"文件清单"、"阶段步骤"、"全量验证"、"回滚"
- [ ] 每个阶段步骤有完整命令(不是占位)
- [ ] 验证部分全部可机械判定(命令 + 预期退出码 / 输出)
- [ ] 最后阶段有 "同步基线 + 重跑门禁 + push + SendMessage" 四步
- [ ] 没有 TBD / TODO / `<填写>` 占位符
- [ ] 没有"按类似 Mx 的方式"这种模糊指令
- [ ] N4 plan 必须有 N4a/N4b/N4c 分节 + 并行规则

不通过 → SendMessage 让 plan-writer 改;通过 → 准备派 executor。

---

## Checkpoint 规范

每个里程碑由 executor 自己跑完整 checkpoint,贴原始输出(UC-F-1)到
`handoffs/N{x}-outcome.md`。team-lead 读 handoff 决定是否接受,**不走 PR
流程**。

### N1 checkpoint

- [ ] 7 个待删文件都不存在(`test ! -f ...`)
- [ ] `bridge/index.ts` 里 5 个 init 调用已移除(grep 无输出)
- [ ] 没有僵尸 import 指向已删文件(grep 无输出)
- [ ] `bunx tsc --noEmit` 退出 0
- [ ] `bun run lint` 退出 0
- [ ] `prek run ...` 退出 0
- [ ] `bun start` 15 秒无 crash(或同等启动冒烟)
- [ ] `bun run build-mac:arm64` 退出 0 + dmg 产出
- [ ] **UC-F-3 grep 证据** 7 份,每行标注
- [ ] 基线同步后所有门禁复跑 PASS

### N2 checkpoint

- [ ] `tests/unit` / `tests/integration` / `tests/regression` 目录不存在
- [ ] `packages/desktop/src/process/bridge/__tests__/` 不存在
- [ ] `tests/e2e` / `tests/fixtures` / setup 文件保留
- [ ] 12 个新骨架目录 + `.gitkeep` 都在
- [ ] `bunx vitest run` 退出 0(0 tests)
- [ ] `bunx tsc --noEmit` 退出 0
- [ ] 基线同步后所有门禁复跑 PASS

### N3 checkpoint

- [ ] 6 个测试文件 + 1 个 helper 都落地(`test -f`)
- [ ] `bunx vitest run --reporter=verbose` 的 passed ≥ 6 文件
- [ ] 至少 30 个 test case
- [ ] 无 `.skip / .todo`(grep 无输出)
- [ ] helper 被其它测试 import 至少 1 处
- [ ] `bunx tsc --noEmit` / `bun run lint` / `prek run ...` 全绿
- [ ] **N3 handoff 锁定了 `mockHttpBridge` 签名**(完整贴出)
- [ ] 基线同步后所有门禁复跑 PASS

### N4 checkpoint

- [ ] 54 个测试文件全部落地
- [ ] `bunx vitest run --reporter=verbose` 的 passed ≥ 60(N3 的 6 + N4 的 54)
- [ ] 至少 180 个 test case(54 文件 × 平均 3 case 保守估计)
- [ ] 无 `.skip / .todo`
- [ ] `mockHttpBridge.ts` 无 diff(N4 不得改 helper)
- [ ] 覆盖率报告已生成(coverage/ 目录)
- [ ] 基线同步后所有门禁复跑 PASS
- [ ] **三个 N4 并行 executor 的 SendMessage 都收到**
- [ ] **A / B / C 分区无目录重叠**

### N5 checkpoint(executor 放行门禁)

- [ ] 3 个 workflow 的 `bunx vitest run` 注释已取消,diff 符合 UC-E
- [ ] `ci-web-cli-release-outcome.md` 的 TODO 标记为 DONE
- [ ] 本地 `tsc / lint / vitest / prek` 全绿
- [ ] 基线同步后本地所有门禁复跑 PASS
- [ ] **N5 executor 不得触发 CI**(由 team-lead 整链合入 dev 时统一做)
- [ ] 整条链 SHA list 列出(N1-N5 各分支最新 SHA,供 team-lead 合入 dev 用)
- [ ] handoff 末尾预留"整链合入 dev 验证"节让 team-lead 回填

### 整链合入 dev 验证(team-lead / 人类责任,N5 executor 放行后执行)

见下方"整链合入 dev"节。

---

## UC-F 违反的处理(team-lead 收到 handoff 后的硬门禁)

收到 teammate 的 handoff 后,team-lead 按此顺序检查:

1. **UC-F-1 命令输出检查**:handoff 里是否有"tsc 通过 ✓" 这种转述?有 →
   打回,要求贴原始输出。**不可通融**
2. **UC-F-2 CI 验证检查**(按里程碑阶段):
   - N1-N5 任何一个里程碑的 handoff 必须明确写:"**本里程碑未触发 CI run,
     统一由 team-lead 在整链合入 dev 时验证**";缺写 = 打回让 teammate 补
   - 若某 teammate 擅自 push / merge 到 dev 或 `feat/backend-migration` →
     严重违规,escalate 给人类,该里程碑回滚重做
   - 整链真 CI 验证由 **team-lead 在"第 4 步"** 执行,不是 teammate 责任
3. **UC-F-3 grep 证据检查**(仅 N1):是否每个待删文件都有 grep 输出?是否
   每行引用都标注了 self-reference / 已删除集合?
4. **UC-F-4 测试执行检查**(N3/N4):是否有 `vitest run --reporter=verbose`
   的完整输出?是否存在 `.skip` / `.todo`?
5. **UC-F-5 基线同步复跑检查**:Step 4 的门禁命令输出是否贴了?

**任何一条不满足,SendMessage 给 teammate 要求补足;teammate 不能补足就 escalate 给人类**。

不允许 "基本符合" / "UC-F-1 缺 2 条但其它 OK" 的妥协 —— M 系列就是这么烂掉的。

---

## N4 并行派发

### 分区定义(见 cheatsheet)

- N4a:`tests/unit/assistants/` + `skills/` + `extension/`(19 文件)
- N4b:`tests/unit/providers/` + `system/` + `cron/`(18 文件)
- N4c:`tests/unit/previews/` + `assets/` + `bootstrap/`(17 文件)

### 派发规则

- 三个 executor **同时启动**,不需要等对方
- 三个都基于 **`origin/feat/n3-test-rewrite-adapter-common`** 起步,本地切到同
  **`feat/n4-test-rewrite-domains`** 分支(如还不存在则创建)
- push 协调:**先 push 者正常推**;后 push 者执行 `git pull --rebase` 再推
- 冲突处理(理论上只会在 vitest.config.ts 或 README 等非分区文件发生):
  - 不同分区的配置写入冲突 → escalate(应该是 plan 写错,N4 plan 不应该让多
    teammate 改同一文件)
  - 分区内的新增文件无冲突

### team-lead 等待策略

- 三个 executor 都 `run_in_background`
- 每个完成时各自 SendMessage 报告"我已 push,分区 X 完成"
- team-lead 收到**所有 3 条消息**后才派发 N5
- 任何一个 executor fail → 单独重派该分区的 executor,其它两个的工作保留
- **最终的 `N4-outcome.md` 由 team-lead 合并三份报告**:
  - "A 部分"节:来自 executor-n4a 的 SendMessage + handoff 草稿
  - "B 部分"节:同上
  - "C 部分"节:同上
  - 统一的"基线同步状态" + "UC-F 证据对照"

### 常见 N4 陷阱

- **helper 撞车**:三个 executor 都想给 mockHttpBridge 加能力 → 一律拒绝,
  escalate 给人类决定是否改 N3
- **共享 setup 冲突**:若在 `tests/vitest.dom.setup.ts` 加 arco-design wrapper
  导致三路 teammate 都想改,应由 team-lead 先指定一个 executor 做,其他两个
  后 rebase
- **时间压力**:N4 单跑预计 7-10 天,并行 3-4 天;若某分区明显滞后(如
  N4c 预览组件 mock 复杂),可临时把 N4c 里的 2-3 个文件移给已完成的分区

---

## 基线同步规范

**时机**:teammate 所有阶段已 commit 完成、push origin 之前。

**策略**:**`git merge`,不是 `git rebase`**。

```bash
git fetch origin feat/backend-migration
git merge origin/feat/backend-migration --no-ff \
  -m "chore(n{x}): sync with feat/backend-migration"
# 冲突:简单的自己解;复杂 escalate
# 合入后重跑:lint / tsc / vitest run / prek
# 全绿后才 push
git push origin feat/n{x}-{name}
```

合入失败的处理:

- 基线引入破坏性变更 → escalate
- 本里程碑和基线的语义冲突 → 修 + 写 handoff Deviations + escalate 提示

---

## Handoff notes 模板

位置:`docs/backend-migration/handoffs/N{x}-outcome.md`,**≤ 700 字**
(M 系列 500 字,本链因为 UC-F-1 贴命令输出放宽到 700 字,但命令输出要按
头 10 + 尾 10 截断,不要贴全)。

见 cheatsheet 的 handoff 模板。

---

## 会话独立性

| 里程碑 | 会话独立性    | 起会话需要读                                                                                     |
| ------ | ------------- | ------------------------------------------------------------------------------------------------ |
| **N1** | ✅ 完全独立   | cheatsheet + 总设计 + N1 requirements                                                            |
| **N2** | ✅ 完全独立   | cheatsheet + 总设计 + N1 handoff + N2 requirements                                               |
| **N3** | ⚠️ 需少量上游 | cheatsheet + 总设计 + N1/N2 handoff + N3 requirements + N3 plan(plan-writer 产出)                |
| **N4** | ⚠️ 需较多上游 | cheatsheet + 总设计 + N1/N2/N3 handoff(**特别是 N3 的 helper 签名**) + N4 requirements + N4 plan |
| **N5** | ✅ 完全独立   | cheatsheet + 总设计 + N4 handoff + N5 requirements + ci-web-cli-release-outcome.md               |

plan-writer 的读文件范围:

| 目标 plan | 读 requirements | 读总设计 | 读 M1 plan(格式参考) | 读已完成 handoff | 探查源代码                    |
| --------- | --------------- | -------- | -------------------- | ---------------- | ----------------------------- |
| N3 plan   | ✅              | ✅       | ✅                   | N1/N2            | 读 adapter/common 源码        |
| N4 plan   | ✅              | ✅       | ✅                   | N1/N2/N3         | 读各领域源码 + N3 helper 签名 |

---

## 分支协作模型

### 共享分支 vs Feature 分支

`feat/backend-migration` 是团队共享长期分支,**teammate 绝对不能 push / merge
这条分支**。

### 创建分支示例

**N1(起点)**:已存在 `feat/cleanup-and-test-rewrite`(设计阶段已 push)

N1 executor:

```bash
git fetch origin
git checkout feat/cleanup-and-test-rewrite
git pull origin feat/cleanup-and-test-rewrite
# 直接在此分支上 commit + push
```

**N2-N5**:从上一个里程碑拉:

```bash
git fetch origin
git checkout -b feat/n2-legacy-test-cleanup origin/feat/cleanup-and-test-rewrite
```

### 并行里程碑处理

本链只有 **N4 内部并行**,但对外仍是一个里程碑(一个分支)。不产生兄弟分支
合并问题。

---

## 执行时常见踩坑预防

1. **N1 的 grep 没做** → handoff 没 UC-F-3 证据 → 允许执行者事后补 grep,但
   team-lead 收到时如果缺应立即打回
2. **N2 漏建 `_helpers/` 目录** → N3 executor 会卡住 → N2 checkpoint 明确
   12 个目录都要在
3. **N3 helper 签名不稳定** → 一直改 → N4 依赖漂移;**N3 完成时必须锁签名
   到 handoff,N4 不得改**
4. **N4 三个并行 executor 撞 `vitest.dom.setup.ts`** → 派发前 team-lead 在
   N4 plan 里预先指定谁改;或者不许改(加 wrapper 到各自的 test 文件顶部)
5. **N5 CI fail 后 rerun 掩盖** → team-lead 严格查 handoff 是否有 rerun 记录
   和原因
6. **teammate"失联"** → 每 15 分钟轮询 `TeammateIdle`;2 次心跳无产出视为卡死
7. **主会话关闭导致 team 解散** → 执行期间主会话不能关;长时间任务用 tmux /
   screen 保持

---

## 非 team-mode 执行映射

非 team-mode 环境(人类独立执行、其他 AI)按下表翻译:

| 本 playbook 的概念          | 非 team-mode 对应做法                                 |
| --------------------------- | ----------------------------------------------------- |
| team-lead(主会话)           | **协调者**:人类或常驻会话,负责读 handoff 和启动下一个 |
| `TeamCreate`                | 跳过                                                  |
| executor teammate           | **一个独立会话 / 独立开发者**                         |
| plan-writer teammate        | 同上,任务是写 plan                                    |
| `Agent(team_name=...)` 派发 | 手动在新会话/新开发者处启动,粘贴 prompt 模板          |
| `SendMessage` 通信          | **改为写 handoff 文件通信**;协调者定期读 handoff      |
| `TeammateIdle` 钩子         | 人类察觉 handoff 写完即启动下一个;或定时轮询          |
| `TeamDelete`                | 跳过                                                  |

**强制不变项**(任何环境都必须遵守):

- 分支协作模型(feature 分支链、不 push 共享分支、不创建 PR)
- 基线同步规范(push 前必须 merge `origin/feat/backend-migration`)
- UC-F 5 条(反偷懒)
- Handoff notes 模板和位置(`docs/backend-migration/handoffs/N{x}-outcome.md`)
- 权威来源优先级
- N4 并行时的分区 / 零重叠规则

---

## 文档更新责任

- 本 playbook 由人类维护,teammate / team-lead 均不改
- cheatsheet 同上
- 单个里程碑 requirements 由人类在设计阶段产出,后续里程碑执行时不改
  (改了说明有问题,escalate 给人类)
- 总设计只在必要时(方向性错误)由人类更新
- detailed plan(N3/N4)由 plan-writer 产出,executor 不改
- handoff 由 executor 写,一经写入不由后续 teammate 修改

---

## 快速索引

| 文档                                            | 用途                                               | 谁读                           |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------ |
| `2026-05-08-cleanup-and-test-rewrite-design.md` | 完整总设计,UC-A..F 硬约束                          | 全体                           |
| **`2026-05-08-cleanup-teammate-cheatsheet.md`** | **精简版 teammate 硬约束(~250 行,含 UC-F 5 条)**   | **executor / plan-writer**     |
| 本 playbook                                     | 完整协作约定、角色派发、checkpoint 规范、UC-F 验收 | **team-lead / 协调者**         |
| `2026-05-08-n{x}-{name}-requirements.md`        | 单个里程碑需求                                     | plan-writer 必读,executor 可读 |
| `2026-05-08-n{x}-{name}.md`(N3/N4)              | 单个里程碑 detailed plan                           | **executor 必读**              |
| `handoffs/N{x}-outcome.md`                      | 单个里程碑 ≤ 700 字产物摘要                        | 后续 teammate 读上游           |
