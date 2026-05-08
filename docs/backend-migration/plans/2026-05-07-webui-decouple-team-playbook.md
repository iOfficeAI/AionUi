# WebUI 脱 Electron 重构 Team Playbook

- **日期**:2026-05-07
- **对应设计文档**:`2026-05-07-webui-decouple-electron-design.md`
- **目的**:让整个重构工作可以被**多个独立 AI 会话 / 人类工程师并行协作**完成,
  避免单一会话上下文污染
- **适用环境**:**主要**适用于 Claude Code team-mode(需要 `TeamCreate` /
  `Agent(team_name=...)` / `SendMessage` 工具)。对于非 team-mode 执行
  场景(普通本地开发、人类协作、其他 AI 环境),见下方的"非 team-mode
  执行映射"节
- **目标读者:team-lead / 协调者 / 文档维护者**(约 1000 行,完整协作手册)
- **执行 teammate(executor / plan-writer)请勿默认加载本文件**,请读精简版:
  [`2026-05-07-webui-decouple-teammate-cheatsheet.md`](./2026-05-07-webui-decouple-teammate-cheatsheet.md)
  (~190 行,只列硬约束,查详情才回本文件特定节)

## 权威来源优先级(遇到描述冲突时按此顺序裁决)

同一件事可能在多个文档出现。当发现描述不一致时,按以下优先级以更高优先级
为准,**不得自主折中**:

| 范围 | 权威来源 | 举例 |
|---|---|---|
| 公共规则、跨里程碑的统一约束 | 设计文档的 **UC-1 / UC-2 / UC-3** 节 | binaryResolver 查找顺序、install 脚本语言、auth 公共接口签名 |
| 接口类型签名 | **M3 handoff 锁定的类型签名 + 设计文档 UC-3** | `AppMetadata`、`WebHostOptions`、`WebUIConfig` |
| 单个里程碑的范围、边界、验收 | 对应的 `*-requirements.md` | "M5 做什么/不做什么"、"M2 验收标准" |
| 执行步骤、逐行命令 | plan-writer 产出的 detailed plan(`*-<name>.md`) | git 操作、sed 命令、具体验证脚本 |
| 上游里程碑实际交付 | 对应的 `handoffs/Mx-outcome.md` | "M1 实际把文件挪到了哪"、"M4 的构造签名最终版" |

**冲突处理规则**:
- plan-writer 发现 requirement 和设计文档 UC 冲突 → 以 UC 为准,在 plan 里
  注明"已按 UC 覆盖 requirement 的 XX 表述"
- executor 发现 detailed plan 和 requirement 冲突 → 以 requirement 为准,
  escalate 给 team-lead(通常是 plan-writer 写错)
- 任何人发现 UC 和 requirement 在同一维度给出不同结论 → **escalate 给人类**,
  由人类决定是改 UC 还是改 requirement,不得自主覆盖

## 文档命名约定(requirements vs plan)

本重构涉及两层文档,语义不同:

| 文件名 | 用途 | 谁读 | 谁产出 |
|---|---|---|---|
| `2026-05-07-m{x}-{name}-requirements.md` | 需求文档:做什么 / 不做什么 / 已定决策 / 验收标准 / 风险 | plan-writer(必读)+ executor(可读) | 人类 + team-lead 在总设计阶段产出 |
| `2026-05-07-m{x}-{name}.md` | 详细实施 plan:阶段步骤 / 逐行命令 / 验证脚本 | executor(必读) | plan-writer(在执行流水线中)产出 |

**M1 例外**:M1 没有独立 requirements,只有完整 detailed plan
(`2026-05-07-m1-monorepo-skeleton.md`),因为 M1 和总设计文档一起在对齐
阶段完成了全部决策。

**M2-M9**:先有 requirements 文档(已产出),plan-writer 在执行流水线中
基于 requirements 产出 detailed plan。

## 给零上下文读者的背景

AionUi 是一个 Electron 应用,当前 WebUI 模式(`npm run webui` / 设置页开关)
仍深度依赖 Electron。本次重构目标:把 WebUI 抽成独立模块 `@aionui/web-host`,
桌面和新的 `aionui-web`(服务器/容器用)共享同一份 host 代码。

完整设计与动机见
[`2026-05-07-webui-decouple-electron-design.md`](./2026-05-07-webui-decouple-electron-design.md)。

本文档只关心**怎么协作落地**这件事。

## 协作模型:分支链接力

所有里程碑通过 feature 分支链接力,上一个里程碑 agent 一旦 `git push origin`
完成,下一个 agent 立即可以 `git fetch` 并拉自己的分支。无 PR review 等待,
无合并等待。

```
feat/backend-migration (共享分支, agent 只读)
     │
[M1] feat/m1-monorepo-skeleton              (agent 1)
     │   push 完成后↓
[M2] feat/m2-aionrs-cleanup                 (agent 2,基于 M1)
     │
[M3] feat/m3-web-host-skeleton              (agent 3)
     │
[M4] feat/m4-backend-launcher-migration
     │
[M5] feat/m5-static-server-auth-migration
     │
[M6] feat/m6-three-paths-cutover            ← 高风险节点,独占
     │
[M7] feat/m7-prepare-backend-ci
     │
[M8] feat/m8-web-cli-tarball
     │
[M9] feat/m9-install-web-script             ← 整条链的终点
     │
     └→ 由人类决定如何合回 feat/backend-migration
```

**每个里程碑由一个 agent 负责,包含自验证;agent 完成后只 push 自己的 feature
分支,不触碰共享分支;人类在整条链结束后统一审读并合回共享分支。**

## 用户操作:一句话启动,后续不介入

你(用户)只需要在主会话里说一句**"开始执行 WebUI 脱 Electron 重构"**,
主会话(team-lead)会按本 playbook 自动调度所有里程碑,**不需要你逐个启动**。

整个执行流程:

1. **你**:在主会话说"开始执行 WebUI 脱 Electron 重构"
2. **team-lead**:
   - `TeamCreate({ name: "webui-decouple" })` 建团队
   - 派 M1 teammate(通过 `Agent` 工具,带 `team_name: "webui-decouple"`、
     `name: "m1"`、`run_in_background: true`)
   - 等 M1 teammate 完成(`TeammateIdle` 钩子触发)
   - 读 `docs/backend-migration/handoffs/M1-outcome.md` 拿到 M1 分支名
   - 派 M2 teammate,指定上游分支 = M1 分支
   - 依次派 M3 ... M9
   - 全部完成后 `TeamDelete`,向你汇报
3. **你**:接收汇报,决定是否 PR 合回 `feat/backend-migration`

**你全程不需要**:
- 手动切窗口
- 读 Mx plan 细节
- 判断 teammate 是否 idle
- 处理接口契约细节
- 决定下一个 teammate 上游分支

**你需要介入的场景**(team-lead 会主动 escalate):
- teammate 报告 checkpoint 失败,自己修不动
- 两个里程碑接口冲突,team-lead 不能裁决
- 方向性错误(已做的架构选择被后续验证证伪)

## Team-lead 调度规则(给主会话看的)

当用户说"开始执行 WebUI 脱 Electron 重构"时,team-lead 按以下步骤:

### 第 1 步:环境预检

```bash
# 确认在 AionUi 仓库
cd /Users/zhoukai/Documents/github/AionUi && pwd

# 确认 teams 功能启用(仅 team-mode 执行路径需要)
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS  # 应为 "1"

# 确认当前分支是 feat/backend-migration
git rev-parse --abbrev-ref HEAD
```

**外部依赖预检(`aionui-backend` GitHub Release)**:

本重构多个里程碑依赖外部仓库 `iOfficeAI/aionui-backend` 的 GitHub Release。
在启动任何 teammate 之前,team-lead 必须确认外部依赖状态,否则 M7/M8/M9
会因外部产物缺失而卡住:

```bash
# 1. 能否拿到 latest tag(脚本的默认行为)
gh api repos/iOfficeAI/aionui-backend/releases/latest --jq .tag_name
# 预期:输出 tag 名;失败说明 GH_TOKEN 或仓库访问权限有问题

# 2. 平台 artifact 是否齐全(检查 latest)
TAG=$(gh api repos/iOfficeAI/aionui-backend/releases/latest --jq .tag_name)
gh api repos/iOfficeAI/aionui-backend/releases/tags/$TAG \
  --jq '.assets[].name' | grep -E "aarch64-apple-darwin|x86_64-apple-darwin|x86_64-unknown-linux-gnu|aarch64-unknown-linux-gnu|x86_64-pc-windows-msvc"
# 预期:至少 5 个平台的 tarball/zip 都有
# 如缺失,记录在 handoff 并考虑:
#   (a) 暂时只做能覆盖的平台
#   (b) 在 M7/M8 开 AIONUI_BACKEND_ALLOW_MISSING=1 过渡开关
#   (c) escalate 给人类等 backend 仓库补全

# 3. 命名规则符合 prepareAionuiBackend.js 的期望
gh api repos/iOfficeAI/aionui-backend/releases/tags/$TAG --jq '.assets[].name' \
  | grep -cE "aionui-backend-${TAG}-"
# 预期:与上一步 artifact 数一致
```

如果以上任一项失败,team-lead 必须向用户 escalate,**不得直接派 teammate
让它们撞墙**。

### 第 2 步:建团队

```
TeamCreate({
  name: "webui-decouple",
  description: "WebUI 脱 Electron 9 里程碑重构"
})
```

### 第 3 步:Plan 写作流水线启动

**文档层级(当前状态)**:
- `2026-05-07-m1-monorepo-skeleton.md` —— **M1 detailed plan,已完成**
  (M1 因为和总设计同步对齐,没有单独的 requirements 文档)
- `2026-05-07-m{2..9}-{name}-requirements.md` —— **M2-M9 requirements
  文档,已产出初版**,锁定"做什么/不做什么/已定决策/验收标准/风险"
- `2026-05-07-m{2..9}-{name}.md` —— **M2-M9 detailed plan,待 plan-writer
  在执行流水线中产出**,基于对应 requirements 展开到阶段步骤 / 逐行命令

plan-writer 的任务**不是从零写**,而是"**requirements 已经锁定了战略,你
补战术**":见"Plan-Writer Prompt 模板"里的 12 项补齐清单(阶段化分解、
Phase 0 基线快照、预检、逐行 Edit diff、commit 策略、平台兼容、失败诊断、
业务功能自动化验证、工具预检、handoff 字段映射、最后三步、回滚)。

流水线节奏(与执行 teammate 并行):

- **派 M1 executor 时,M2 requirements 已存在** → 同时派 plan-writer-M2
  产出 M2 detailed plan
- M1 executor 做事 → plan-writer-M2 读 M2 requirements + 源码,写 M2 plan
  (不冲突,读写文件不同)
- M1 完成 + M2 plan ready → 派 M2 executor + plan-writer-M3
- M2 完成 + M3 plan ready → 派 M3 executor + plan-writer-M4
- ... 依此类推到 M8 plan-writer(M9 完成前 M9 plan 已写好)

这样 team-lead 真正做到"一次派发、全程自动",不需要在执行中途停下写 plan。

**派 plan-writer 的命令**:

```
Agent({
  description: "为 M{x+1} 撰写 detailed plan(基于其 requirements)",
  subagent_type: "general-purpose",
  team_name: "webui-decouple",
  name: "plan-writer-m{x+1}",
  model: "opus",    // plan 写作需要更强的推理,用 opus
  run_in_background: true,
  prompt: "[见下方 plan-writer prompt 模板]"
})
```

### 第 4 步:派 executor teammate(串行,一次一个)

对每个里程碑 Mx,调用:

```
Agent({
  description: "执行 Mx 里程碑",
  subagent_type: "general-purpose",
  team_name: "webui-decouple",
  name: "executor-mx",
  model: "sonnet",
  run_in_background: true,
  prompt: "[见下方 executor prompt 模板]"
})
```

注意:
- 派 executor-Mx **之前**必须确认 `docs/backend-migration/plans/2026-05-07-mx-xxx.md`
  已存在且通过 team-lead 的格式自检(阶段齐全、验证自动化、参考文档明确)
- 派 executor-Mx **之后**立刻派 plan-writer-M(x+1),让 plan 写作跟上

### 第 5 步:等 teammate 完成

executor 和 plan-writer 都可能 idle,处理方式不同:

**executor idle(完成里程碑)**:
- 读 `docs/backend-migration/handoffs/Mx-outcome.md`
- 验证 handoff 里的验证证据都是 PASS
- 如果 FAIL,查看"偏离计划"节,决定重派 / escalate
- 派下一个 executor(见第 4 步)

**plan-writer idle(完成 plan 写作)**:
- 读新写出的 `docs/backend-migration/plans/2026-05-07-m{x+1}-xxx.md`
- 做 5 分钟格式自检:
  - 有"零上下文会话背景"、"参考文档"、"文件清单"、"阶段步骤"、"全量验证"、"回滚"
  - 每个阶段步骤有完整命令(不是占位)
  - 验证部分是机械化命令(不依赖人眼)
  - 最后阶段有"同步基线 + push + handoff"三步
- 不通过 → SendMessage 要求 plan-writer 修改
- 通过 → 等 executor-Mx 完成就立刻派 executor-M(x+1)

### 第 6 步:派下一个 teammate

读 handoff 里的**上游分支**字段,作为下一个 executor 的 prompt 参数。

### 第 7 步:收尾

所有 9 个里程碑完成后:
```
TeamDelete("webui-decouple")
```
向用户汇报 9 个 feature 分支的最终 SHA 列表,由用户决定如何合回
`feat/backend-migration`。

## Executor Prompt 模板

team-lead 派每个 executor teammate 时,用这个模板(只改 `{X}` / `{name}` /
`{UPSTREAM_BRANCH}` 占位符):

```
你是 WebUI 脱 Electron 重构的 M{X} 里程碑执行者。

必读文档(按顺序,不可跳过):

1. docs/backend-migration/plans/2026-05-07-webui-decouple-teammate-cheatsheet.md
   **完整阅读**,这是你需要遵守的硬约束清单(分支规则、基线同步、
   handoff 模板、元原则、硬约束速记)。只有 ~190 行,不重,必须先读

2. docs/backend-migration/plans/2026-05-07-m{x}-{name}.md
   **完整阅读**,这是你的执行手册,所有具体步骤在这里

3. docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md
   按需读:"目标形态"、"仓库组织"、"M{X} 相关改造要点"节(以及 UC-1/UC-2/UC-3
   里涉及 M{X} 的硬约束)

**只有在 cheatsheet 或 plan 里的某条规则看不懂、需要查权威来源时,才去读
`2026-05-07-webui-decouple-team-playbook.md`**(完整 playbook 近 1000 行,
默认不加载,按需查特定节)。

禁止读其他 Mx plan 文件,禁止读其他 handoff 文件(除了你的上游)。

任务:严格按 plan 阶段顺序执行所有步骤。每个阶段完成 git commit。
全部阶段完成后,按最后阶段的"同步基线 + push + handoff"三步走。

分支约定:
- 上游分支:origin/{UPSTREAM_BRANCH}
- 你的分支:feat/m{x}-{name}
- push 前必须 merge origin/feat/backend-migration 到本分支
- 不合回任何共享分支
- 不创建 PR

完成后 SendMessage 给 team-lead,报告:
- 分支名
- 最新 SHA
- 基线同步状态(origin/feat/backend-migration 对应 SHA 已合入)
- handoff 文件路径
- 有无偏离 plan(有的话列出来)

用中文。
```

其中 `{UPSTREAM_BRANCH}`:
- M1:`feat/backend-migration`
- M2:`feat/m1-monorepo-skeleton`
- M3:`feat/m2-aionrs-cleanup`
- ...依此类推

## Plan-Writer Prompt 模板

team-lead 派 plan-writer 时,用这个模板(目标是产出下一个里程碑 M{X+1}
的详细 plan):

```
你是 WebUI 脱 Electron 重构的 Plan Writer,为 M{X+1} 里程碑撰写详细
实施 plan。你不写代码,不做执行,只产出一份可执行的 plan 文件。

**前提**:M{X+1} 的 requirements 文档已经存在且已被人类锁定。你的任务
不是重新定义 M{X+1} 做什么,而是把 requirements 里已锁的"做什么 / 不
做什么 / 已定决策 / 验收标准 / 风险"**展开为 executor 可直接机械执行的
详细 plan**。**不得偏离 requirements 的已定决策**,遇到 requirements 没
覆盖的决策点时必须 escalate,不自主拍板。

必读文档(按顺序,不可跳过):

1. docs/backend-migration/plans/2026-05-07-webui-decouple-teammate-cheatsheet.md
   **完整阅读**(~190 行)。分支规则、基线同步、权威优先级、元原则都在这
   里。这是你自己作为 plan-writer 也要遵守的硬约束,同时**你写的 plan 要
   让 executor 读同一份 cheatsheet 即可**,不要在 plan 里重复 cheatsheet
   的内容

2. docs/backend-migration/plans/2026-05-07-m{x+1}-{name}-requirements.md
   **完整阅读**,最高战略优先级。这是 M{X+1} 的"做什么/不做什么/已定决策
   /验收标准"的唯一来源,你的战术必须忠实落地

3. docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md
   重点关注"统一约束补充"(UC-1/UC-2/UC-3)、"目标形态"、"仓库组织"、
   "改造要点 A-G"里涉及 M{X+1} 的部分。UC 是跨里程碑硬约束,任何 plan
   都不得违背

4. docs/backend-migration/plans/2026-05-07-m1-monorepo-skeleton.md
   **格式参考**。你写的 plan 必须遵循同样的结构(零上下文会话背景 / 参考
   文档 / 文件清单 / 阶段步骤 / 全量验证 / 最后三步同步基线+push+handoff /
   回滚)

5. docs/backend-migration/handoffs/M1-outcome.md … M{X}-outcome.md
   读所有已完成里程碑的 handoff,了解实际交付物和偏离点,可能影响你的
   plan(例如接口签名、文件位置)

**按需查阅**(**默认不读**,遇到具体规则看不懂再去查特定节):
`2026-05-07-webui-decouple-team-playbook.md`(完整 playbook 近 1000 行)

禁止:
- 禁止读其他 **未开始** 里程碑的 requirements / plan / handoff
  (M{X+2} 及之后的都不要读)
- 禁止偏离 M{X+1} requirements 的已定决策(遇到冲突必须 escalate,不自主改)
- 禁止自己写代码或修改源文件(你的任务是产出 plan,仅此而已)
- 禁止省略步骤(不能用"按照类似 Mx 的方式"代替具体步骤)
- 禁止留 TBD/TODO 占位符

你的 plan 必须:
- 让一个零上下文的 executor 照着跑完,不需要外部询问
- 每个命令都可以直接 copy-paste 执行
- 每个验证都能机械判定 PASS/FAIL,不依赖人眼
- 包含基线同步那三步(对照 M1 plan 阶段 13)
- 约束 executor 不创建 PR、不合回共享分支、不 rebase

**需求文档只写"做什么 / 不做什么 / 已定决策 / 验收标准 / 风险"**,你的
detailed plan 必须**在此基础上补齐**以下 12 项执行细节(需求文档一般不会覆盖):

1. **阶段化分解**:把需求文档的扁平清单分成有顺序的阶段 / 步骤
2. **Phase 0 基线快照**:先记录"当前状态"(测试通过数、产物大小等)供后续对比
3. **预检步骤**:验证上游 merge、分支干净、bun install 可跑、环境变量等前置条件
4. **逐行 Edit diff**:每个需求文档说"改这个文件",你必须读文件 → 给出
   before/after 的完整精确 diff(含行号),不留"修改相关逻辑"之类的模糊指令
5. **commit 策略**:每个阶段结束 commit,commit message 写 `refactor(mx): ...`
6. **平台兼容命令**:`sed -i ''`(macOS)vs `sed -i`(Linux),timeout 用法等
7. **失败诊断路径**:对每个验证命令,给出 FAIL 时该做什么(看哪个日志、跑哪个
   诊断脚本)
8. **业务功能不回归的自动化验证**:不要写"手动验证对话功能",要找对应的
   e2e playwright 脚本;如不存在,要么写一个,要么明确写"本里程碑不自动
   验证,由 M6 统一覆盖"
9. **工具预检**:用到的 `bunx @electron/asar`、`prek`、`gh` 等工具,预检
   可用性;不可用时给安装命令
10. **上游 handoff 的字段映射**:明确指出"从 M(x-1) handoff 读取哪个字段"
    以及"用在哪一步"
11. **最后阶段的完整三步**:同步基线 + 重跑验证 + push + SendMessage(对照
    M1 plan 阶段 13)
12. **回滚指令**:分 "本地未 push" / "已 push 但下游未启动" / "已 push 且下游
    已启动" 三种场景给不同回滚命令

如果需求文档的"已定决策"有遗漏(例如未提到的技术选型),你**不自主决定**,
在 plan 开头 `## 待决策(给 team-lead 确认)` 节列出问题,SendMessage 给
team-lead escalate。

任务:
1. 先探查仓库,搞清楚 M{X+1} 要动的实际文件长什么样(读实际代码,不臆想)
2. 产出 plan 到 docs/backend-migration/plans/2026-05-07-m{x+1}-{name}.md
3. 用 5 分钟自查:格式合规、命令完整、无占位符
4. SendMessage 给 team-lead:
   "M{X+1} plan 已完成:
   - 路径:docs/backend-migration/plans/2026-05-07-m{x+1}-{name}.md
   - 阶段数:N
   - 预计执行时间:N 小时
   - 关键风险/已知坑:<列出>
   等 M{X} 完成后可派 executor。"

用中文。
```

`{name}` 建议按里程碑内容命名,参考 M1 的 `monorepo-skeleton`:
- M2:`aionrs-cleanup`
- M3:`web-host-skeleton`
- M4:`backend-launcher-migration`
- M5:`static-server-auth-migration`
- M6:`three-paths-cutover`
- M7:`prepare-backend-ci`
- M8:`web-cli-tarball`
- M9:`install-web-script`

## Teammate 执行约束

每个 teammate 必须遵守:

- ✅ 只读自己的 plan + 设计文档对应节 + 上游 handoff
- ✅ 按 plan 阶段顺序执行
- ✅ 每阶段 commit
- ✅ **完成所有阶段后,在 push 之前,必须把 `origin/feat/backend-migration`
  合入自己的 feature 分支**(见下"基线同步规范")
- ✅ 合入基线后,**重跑自动化验证**(lint / tsc / test / smoke),确认合并
  没引入回归,再 push
- ✅ 完成后写 handoff、push feature 分支、SendMessage 给 team-lead
- ❌ **不得** push 到 `feat/backend-migration`
- ❌ **不得** 创建 PR
- ❌ **不得** 读其他 Mx plan 或其他里程碑的 handoff(除自己的上游)
- ❌ **不得** 跨里程碑改文件(例如 M4 teammate 不得改 M3 的文件)
- ❌ **不得** 在实施过程中改 plan,偏离要写进 handoff 的"偏离计划"节
- ❌ **不得** 因为 checkpoint 不够严谨就跳过验证,应改进验证命令
- ❌ **不得** 用 `rebase` 方式同步基线(见下"基线同步规范",必须用 `merge`)

**元原则:拒绝"看起来差不多对了"的人工判断**:
- 能用脚本判定的,不要留给肉眼("看截图判断 UI 正常"❌ → "用 playwright
  accessibility tree assert 特定节点存在"✅)
- 能从日志 grep 的,不要写成"确认服务启动"("服务启动成功"❌ →
  "`grep -qE 'listening on port [0-9]+' /tmp/dev.log`"✅)
- 能从 artifact list 验证的,不要写成"检查 release 页面"("release 页应包含
  5 个 tarball"❌ → "`gh api ... --jq '.assets[].name' | wc -l` 应 = 10"
  (5 tarball + 5 sha256)✅)
- 能从 asar list 验证的,不要写成"产物里应该没有 web-cli"("产物干净"❌ →
  "`bunx @electron/asar list ... | grep -c web-cli` 应 = 0"✅)

对**暂时无法机械化**的点(例如真实用户登录体验、文本 UI 布局美观性),
teammate 必须在 handoff 显式标注:
- **这是人工检查**(不是 `机械验证 PASS`)
- **为什么目前无法机械化**
- **建议后续哪个里程碑补强**

不允许"看起来差不多对了"作为 PASS 理由。如果 plan 里某条验证让 teammate
自然想用人工判断,说明 plan 有漏洞,teammate 必须先改进验证命令(或
escalate 要求 plan-writer 补),再执行。

## 基线同步规范

**目的**:feature 分支链会越拉越长,如果不定期吸收共享分支
(`feat/backend-migration`)的更新,最后整条链合回时会积累巨量冲突。规定
每个 teammate 在完成自己的工作后、push 之前,把最新基线合入自己分支。

**时机**:teammate 的所有阶段都已 commit 完成之后、推 origin 之前。

**策略**:**`git merge`,不是 `git rebase`**
- `merge` 保留完整的 commit 历史,下游 teammate 基于旧 SHA 起步的分支不会
  失效
- `rebase` 会改写历史,下游 teammate 拿到的 SHA 会失效,且无法感知已经改写
  (会触发 force-push 风险)

**命令**:

```bash
# 1. 拉最新基线
git fetch origin feat/backend-migration

# 2. 合入本分支
git merge origin/feat/backend-migration --no-ff -m "chore(mx): sync with feat/backend-migration"

# 3. 如有冲突,尝试自动解决;冲突复杂时 escalate 给 team-lead
#    不要盲目 git checkout --theirs/ours,要读懂冲突语义

# 4. 合入成功后,重跑自动化验证(不跳过!)
bunx tsc --noEmit
bun run lint
bun test
# 再跑 plan 阶段 12 的自动化 smoke

# 5. 全绿后才 push
git push origin feat/mx-xxx
```

**冲突处理**:
- 简单冲突(不同文件、同文件不同段落):teammate 自动解决
- 复杂冲突(同一段代码两方都改):**不要硬改**,在 handoff 写清楚:
  - 冲突文件和行号
  - 两边各改了什么
  - 已尝试的解决方案
  - 向 team-lead SendMessage escalate,由人类决定如何合并

**合入失败的处理**:
- 如果合并后 tsc / lint / test 失败,**不要强行 push**
- 分析失败原因:
  - 是基线引入了破坏性变更 → escalate 给 team-lead,不自己尝试修
  - 是本里程碑的改动和基线有隐性冲突(文件没冲突但语义冲突)→ 写进 handoff
    Deviations,escalate
- 无论哪种,写 handoff、SendMessage、等人类决策

## 分支协作模型

### 共享分支 vs Feature 分支

`feat/backend-migration` 是**团队共享的长期分支**,所有人都在上面推进后端
迁移工作。**agent 绝对不能 push / merge 这条分支**,否则会破坏他人工作。

本次重构的 9 个里程碑,通过 **feature 分支链** 接力,每个里程碑一条独立
feature 分支:

```
feat/backend-migration (共享, agent 只读不写)
    │
    ├─ feat/m1-monorepo-skeleton      ← M1 从 backend-migration 拉
    │    └─ feat/m2-aionrs-cleanup    ← M2 从 M1 拉(而非共享分支)
    │          └─ feat/m3-web-host-skeleton
    │                └─ feat/m4-backend-launcher-migration
    │                      └─ ... 直到 M9
    │
    └─ (最终由人类决定如何把这条链合回共享分支:
        M9 完成后一次性 PR / 分段 PR,都由人类决定)
```

### Agent 的职责边界

- ✅ 在自己的 feature 分支上 commit、push origin
- ✅ 写 handoff,记录自己分支的分支名和最新 SHA
- ❌ **不得** push 到 `feat/backend-migration`
- ❌ **不得** 把 feature 分支 merge 回 `feat/backend-migration`
- ❌ **不得** 创建 PR(创建 PR 由人类在整条链完成后决定)
- ❌ **不得** rebase 或 force-push 上一个里程碑的分支(因为后续里程碑可能已基于它)

### 人类的职责边界

- ✅ 最终审读整条分支链
- ✅ 决定何时、如何把链上某个节点合回 `feat/backend-migration`
- ✅ 回滚某个里程碑时,在分支链上操作;不碰共享分支

### 创建分支示例

**M1(首个里程碑)**:从共享分支拉:
```bash
git fetch origin
git checkout -b feat/m1-monorepo-skeleton origin/feat/backend-migration
```

**M2(并行里程碑)**:改为从 M1 拉(避免兄弟分支合并麻烦):
```bash
git fetch origin
git checkout -b feat/m2-aionrs-cleanup origin/feat/m1-monorepo-skeleton
```

**M3 起(串行节点)**:从上一个里程碑的 feature 分支拉:
```bash
git fetch origin
git checkout -b feat/m3-web-host-skeleton origin/feat/m2-aionrs-cleanup
```

### 并行里程碑的处理

本方案中 M1+M2 并行、M7+M8+M9 三路并行。为了避免后续里程碑合并"兄弟分支",
并行改为**退化的串行**:

- M2 改为"从 M1 拉",本质串行,但 M2 不用等 M1 的 CI 绿就能启动 —— M1 agent
  push 一到 origin,M2 agent 就能 `git fetch` 并拉分支
- M7/M8/M9 同理:M8 从 M7 拉,M9 从 M8 拉

看似"串行",但每个 agent 的等待时间只是前一个 agent 的 **push 时间**(秒级),
而不是 merge 时间或 review 时间(小时到天级)。

### Handoff 必须包含的分支信息

每份 handoff 记录:
- 本里程碑的分支名(例如 `feat/m1-monorepo-skeleton`)
- push 到 origin 后的最新 SHA
- 本分支基于哪个上游分支(例如 M3 handoff 记:"基于 `origin/feat/m2-aionrs-cleanup`")

下一个 agent 读 handoff 就知道 `git checkout -b feat/m4-... origin/feat/m3-...`。

## 每个里程碑的会话独立性

### Executor 的读文件范围

> **注意**:这里的"上下文独立性"仅指**起会话需要读的文件数量**(上下文
> 污染风险)。里程碑之间的**执行依赖**(前置里程碑产物是否必须已交付)
> 由上方"顺序要求"约束,不由此表决定。

| 里程碑 | 上下文独立性 | 起会话只需读 | 上游分支 |
|---|---|---|---|
| **M1** | ✅ 会话独立(读 1 份 plan) | 设计文档 + M1 plan | `origin/feat/backend-migration` |
| **M2** | ✅ 会话独立 | 设计文档 + M1 handoff + M2 plan | `origin/feat/m1-monorepo-skeleton` |
| **M3** | ✅ 会话独立 | 设计文档 + M2 handoff + M3 plan | `origin/feat/m2-aionrs-cleanup` |
| **M4** | ⚠️ 需少量上游 handoff | 设计文档 + M3 handoff + M4 plan | `origin/feat/m3-web-host-skeleton` |
| **M5** | ⚠️ 需少量上游 handoff | 设计文档 + M4 handoff + M5 plan | `origin/feat/m4-backend-launcher-migration` |
| **M6** | ❌ 需多份上游 handoff(高风险) | 设计文档 + M3/M4/M5 handoff + M6 plan | `origin/feat/m5-static-server-auth-migration` |
| **M7** | ✅ 会话独立 | 设计文档 + M6 handoff + M7 plan | `origin/feat/m6-three-paths-cutover` |
| **M8** | ✅ 会话独立 | 设计文档 + M3 handoff + M7 handoff + M8 plan | `origin/feat/m7-prepare-backend-ci` |
| **M9** | ✅ 会话独立 | 设计文档 + M8 handoff + M9 plan | `origin/feat/m8-web-cli-tarball` |

### Plan-Writer 的读文件范围

Plan-writer 不是"设计"里程碑,是**把已存在的 requirements 展开为可执行
plan**。它读得比 executor 多(因为要跨引用多篇文档),但**只读不写源代码**,
产出只有一份 plan 文件。

| 目标 plan | 读对应 requirements(最重要) | 读设计文档 | 读 M1 plan 格式参考 | 读已完成的 handoff | 探查源代码 |
|---|---|---|---|---|---|
| 写 M2 plan | `m2-aionrs-cleanup-requirements.md` | ✅ | ✅ | M1 | 读 aionrs 引用点 + build-with-builder.js |
| 写 M3 plan | `m3-web-host-skeleton-requirements.md` | ✅ | ✅ | M1/M2 | 读仓库 workspace 配置基线 |
| 写 M4 plan | `m4-backend-launcher-migration-requirements.md` | ✅ | ✅ | M1/M2/M3 | 读 lifecycleManager 源码 |
| 写 M5 plan | `m5-static-server-auth-migration-requirements.md` | ✅ | ✅ | M1-M4 | 读 webserver/ auth 相关源码 |
| 写 M6 plan | `m6-three-paths-cutover-requirements.md` | ✅ | ✅ | M1-M5 | 读 WebuiModalContent / webui.start IPC / restoreDesktopWebUIFromPreferences 调用点 |
| 写 M7 plan | `m7-prepare-backend-ci-requirements.md` | ✅ | ✅ | M1-M6 | 读 build-with-builder.js / prepareAionuiBackend.js |
| 写 M8 plan | `m8-web-cli-tarball-requirements.md` | ✅ | ✅ | M1-M7 | 读 CI workflow + web-host API |
| 写 M9 plan | `m9-install-web-script-requirements.md` | ✅ | ✅ | M1-M8 | 读现有 build-and-release.yml + verify-release-assets.sh |

**注意**:
- **requirements 文档是战略来源**,plan-writer 在它基础上补战术,不得偏离
  它锁定的决策
- handoff 是 500 字以内的产物摘要,**不是前一份 plan 的全文**,保持上下文干净
- plan-writer **不得**读 M{X+2} 及之后未开始里程碑的 requirements / plan /
  handoff(避免超前污染)

## Plan 文件命名约定

位于 `docs/backend-migration/plans/`,命名 `2026-05-07-mN-<short-name>.md`:

- `2026-05-07-m1-monorepo-skeleton.md`
- `2026-05-07-m2-aionrs-cleanup.md`
- `2026-05-07-m3-web-host-skeleton.md`
- `2026-05-07-m4-backend-launcher-migration.md`
- `2026-05-07-m5-static-server-auth-migration.md`
- `2026-05-07-m6-three-paths-cutover.md`
- `2026-05-07-m7-prepare-backend-ci.md`
- `2026-05-07-m8-web-cli-tarball.md`
- `2026-05-07-m9-install-web-script.md`

## Handoff notes 模板

每个里程碑执行完后,执行者产出一份 handoff:
`docs/backend-migration/handoffs/Mx-outcome.md`,严格限制在 500 字内。
全部用中文书写。

模板:

```markdown
# Mx <里程碑名> - 交付摘要

## 已交付(实际落地了什么)
- 新建文件:<列表>
- 删除文件:<列表>
- 非琐碎修改:<列表 + 一句话原因>
- 新增的对外 API / 配置项:<列表>

## 与计划的偏离
- <改动点> —— 原因:<为什么> —— 对后续里程碑的影响:<涉及哪个 Mx>

## 给下一个里程碑的提醒
- <警示点>

## 验证证据(贴原始命令输出,不要转述)
- `bun run dev` OK / FAIL
- `bun run build` OK / FAIL
- `bunx @electron/asar list app.asar | grep -cE "packages/(web-cli|web-host)"` = <N>
- <测试命令输出>

## 遗留问题 / 跟进项
- <需要后续 PR 处理的事>
```

下一个里程碑的会话**只读这份 500 字 handoff**,不需要读前置 plan 的具体步骤。

## 接口契约(并行时防漂移)

当两个里程碑能并行(M1+M2 / M7+M8+M9),必须先锁定**接口契约**:

### M1 ↔ M2 接口
- M2 删 `scripts/prepareAionrs.js` 和 `electron-builder.yml:108-110` 的
  `bundled-aionrs` 配置
- M1 改根目录 → `packages/desktop/` 时,会把 `electron-builder.yml` 整体迁入
  `packages/desktop/electron-builder.yml`
- **冲突点**:`electron-builder.yml` 两边都在改
- **解法**:M1 先 merge,M2 基于 M1 改后的 `packages/desktop/electron-builder.yml`
  删 aionrs 配置。这等价于改成**严格串行 M1 → M2**,失去并行红利
- **备选**:M2 改为只删 `prepareAionrs.js` 和 `.gitignore` / `_build-reusable.yml`
  里的 `AIONRS_VERSION`,**把 electron-builder.yml 里的 `bundled-aionrs` 删除
  留给 M1** 顺手做掉。这样真正并行

**采用备选**:M2 scope 收窄为"删脚本、删 env、删 .gitignore 条目",
electron-builder 那行由 M1 顺手删。

### M7 / M8 / M9 接口(三路并行)
- M7:改 `scripts/prepareAionuiBackend.js` 变成硬失败 + 接入
  `build-with-builder.js`
- M8:新建 `packages/web-cli/` + 新 CI job
- M9:新建 `scripts/install-web.sh` + CI 上传 asset
- **冲突点**:M8 和 M9 都要改 CI workflow `build-and-release.yml`
- **解法**:M8 在 matrix 里加 tarball artifact,M9 在 artifact 上传步骤里加
  一条 `install-web.sh`。两者改同一文件的不同段落,rebase 时冲突可控
- **M7/M8/M9 的依赖关系**:
  - **M8 依赖 M7**:M8 的 CI 要用 M7 抽到 `packages/shared-scripts/` 的
    `prepareBackend()` 下载 backend 塞进 tarball
  - **M9 依赖 M8**(不是"完全独立"):M9 的 install-web.sh 和本地容器 smoke
    都依赖 M8 已经把 tarball + `.sha256` 作为 release asset 发布。M9 不依
    赖 M7 的代码实现细节,但依赖 M8 已产出可消费的 tarball + sha256 + release
    asset 这条链路的闭环
  - **顺序要求**:M7 → M8 → M9 必须严格串行,M9 不能和 M7/M8 任何一个并行

## Checkpoint 规范

每个里程碑**由执行 teammate 自己跑完整 checkpoint,把命令输出作为证据**写进
`handoffs/Mx-outcome.md`。team-lead 读 handoff 决定是否接受,**不走 PR
流程**(PR 留给人类在整条链完成后统一处理)。

**所有 checkpoint 项都必须是机械可验证的**(跑命令、对比输出、文件存在性
检查)。如果某条验证只能靠人类"看一眼"判断,说明 plan 缺少自动化手段,
teammate 必须改进验证命令(而不是标 "manual verify" 跳过)。

### M1 checkpoint(agent 自验)
- [ ] `bunx asar list <dist/mac-arm64/AionUi.app/Contents/Resources/app.asar> | grep -cE "packages/(web-cli|web-host)"` == 0
- [ ] `bun run dev` 启动后 `ps aux | grep Electron` 至少一个进程,窗口成功打开
  (用 `--enable-logging` 或 3 秒自动 quit 脚本确认,不要人眼盯窗口)
- [ ] `bun run webui` 启动后 `curl -fsS http://127.0.0.1:25808/ -o /dev/null` 返回 200
- [ ] `bun run build-mac:arm64` 退出码 0,`ls dist/*.dmg` 至少一个文件
- [ ] `ls dist/mac-arm64/AionUi.app/Contents/Resources/` 存在 `bundled-aionui-backend/`
  或 `bundled-bun/` 子目录

### M6 checkpoint(agent 自验 + e2e)
- [ ] 三条路径 e2e playwright 脚本全绿(M6 plan 必须产出这些脚本):
  - `tests/e2e/cases/webui/desktop-ipc.e2e.ts`
  - `tests/e2e/cases/webui/desktop-gui-switch.e2e.ts`
  - `tests/e2e/cases/webui/webui-headless.e2e.ts`
- [ ] Switch off 后 agent 执行 `lsof -i :<backend-port>` 仍有进程
- [ ] 重启 app 后 `GET /api/auth/status` 应返回 running=true(验证自动恢复)
- [ ] `find packages/desktop/src/process/webserver -type f | wc -l` == 0
- [ ] 已有 e2e suite 全绿

#### M6 固定诊断抓手(playbook 级,跨会话一致最低标准)

M6 是整条链最高风险的一步,e2e 失败是大概率事件。为了避免不同 teammate 在
故障时"各自去不同地方找日志",playbook 在此锁定**最低标准**,M6 detailed
plan 可以扩展但不得弱化:

1. **日志查看优先级**(失败时必须按此顺序检查,不许跳):
   1. Playwright 的 `trace.zip` / `screenshot.png` / `video.webm`
   2. Electron 主进程日志(`~/Library/Logs/AionUi/main.log` 或 plan-writer
      在 M6 plan 中给出的绝对路径)
   3. `aionui-backend` 子进程日志
   4. web-host static-server 日志(如有)

2. **端口来源标准**(M6 plan 必须对齐这里的读取方式):
   - **backend port** 从 backend stdout / log 中 grep
     `listening on port [0-9]+` 的第一行取;或通过
     `BackendLifecycleManager.port` getter 读
   - **host port** 从 `webui.start` IPC 返回值的 `port` 字段或 `WebHostHandle.port`
     读;**不允许**用硬编码 25808 或 environment 猜
   - **判定"GUI 开关复用 backend"的铁证**:两个来源读到的 backend port
     必须相等,不等于则说明路径 ③ 的 `useExistingBackend` 接线错

3. **最小失败证据**(e2e 失败时,handoff 必须附以下全部,缺一算不完整):
   - 失败命令 / 失败 e2e case 名
   - 失败截图或 trace 文件路径(trace.zip 绝对路径)
   - 当次运行读到的 backend port 值、host port 值
   - 从上述日志按优先级 1/2/3/4 各截取第一条异常行
   - 如果是 Switch 相关失败:`lsof -i :<backend-port>` 的输出快照

executor 在 M6 handoff 里按这 3 条写,任何偏离 plan-writer 在 M6 detailed
plan 里的扩展(不能缩减)必须标注原因。

### M7 checkpoint(agent 自验 + 打包产物审计)

**Executor 放行门禁**(feature 分支阶段,executor 必须全部通过才 push):

- **本地强制**:
  - [ ] `packages/shared-scripts/prepare-aionui-backend.js` 存在,`node -e`
        能 require 出 `prepareBackend` 函数
  - [ ] `scripts/build-with-builder.js` 里已补 `prepareAionuiBackend()`
        调用(grep 能命中)
  - [ ] 本地 `bun run build-mac:arm64` 退出 0;`resources/bundled-aionui-backend/
        darwin-arm64/aionui-backend` 存在
  - [ ] 手工触发硬失败场景(用不存在的 tag)后退出码非 0;
        用 `AIONUI_BACKEND_ALLOW_MISSING=1` 能降级为 warn + 写
        `skipped: true` manifest
- **CI 强制**(M7 feature 分支 CI):
  - [ ] build job 绿;产物 dmg 内的
        `bundled-aionui-backend/{platform-arch}/aionui-backend` 实际存在
  - [ ] CI 产出的 ASAR 或 `Resources/` 目录里不含老 `bundled-aionrs`(M2
        清理后的不回归验证)

(M7 不涉及 release 链路;无"发布链最终验证"层)

### M8 checkpoint(agent 自验 + 容器)

**Executor 放行门禁**(feature 分支阶段,executor 必须全部通过才 push;
team-lead 以此决定是否接受 handoff):

- **本地强制**:
  - [ ] `packages/web-cli/` 骨架存在,`bunx tsc --noEmit --project
        packages/web-cli/tsconfig.json` 绿
  - [ ] `AIONUI_BACKEND_BIN=$(which aionui-backend) bun run --cwd packages/web-cli
        start -- start --port 8888 --no-open` 能起,`curl` 命中 200
  - [ ] 依赖边界 grep:web-cli 不 import desktop / electron
- **CI 强制**(M8 feature 分支 CI):
  - [ ] 5 平台 matrix 产出 tarball + `.sha256`(工作流 artifact 可见)
  - [ ] 容器冒烟 job(linux-x86_64)在 CI 里绿(不靠人肉)
  - [ ] `actions/upload-artifact` 步骤存在且产物命名符合约定

**发布链最终验证**(与 M8 executor 放行无关,由人类在真实 release 时触发,
M9 消费这一层的产物):

- `scripts/verify-release-assets.sh` 通过"5 个 tarball + 5 个 sha256 都存在"
- Release 页面能下载到 tarball 和 sha256(`gh api` 确认)
- 本层失败不 block M8 handoff 接受,但会 block 人类触发的最终 release;若
  CI workflow 有 bug 导致 release 链路断裂,escalate 给人类

### M9 checkpoint(agent 自验 + 本地容器 smoke)

**Executor 放行门禁**(feature 分支阶段,executor 必须全部通过才 push):

- **本地强制**:
  - [ ] `scripts/install-web.sh` 存在,`bash -n` 语法检查绿
  - [ ] `bash scripts/install-web.sh --help` 含 `--version` / `--mirror` /
        `--install-dir` / `--no-symlink` / `--no-path`
  - [ ] **本地 `file://` mirror smoke**:
        `/tmp/m9-mirror/` 含 tarball + sha256(从 M8 feature 分支 artifact 下)
        → 容器 `docker run ... debian:slim bash /scripts/install-web.sh
        --mirror file:///mirror/ --no-path` → `~/.local/bin/aionui-web --version`
        退出 0
- **CI 强制**(M9 feature 分支 CI):
  - [ ] `install-web.sh` 作为 workflow artifact 出现
  - [ ] CI 里 `__VERSION__` 占位已被 sed 替换(CI 产物里的脚本应含具体 tag)

**发布链最终验证**(与 M9 executor 放行无关,由人类在真实 release 后触发):

- `curl -fsSL https://github.com/iOfficeAI/AionUi/releases/latest/download/
  install-web.sh | bash` 在干净 Ubuntu container 里跑通
- 特定版本 URL(`/releases/download/v{x}/install-web.sh`)里的版本号与 tag
  匹配
- 本层失败不 block M9 handoff 接受(因为 release 是整条链完成后才会发生),
  但会 block 实际对外分发;由人类 escalate 决定是 hot-fix 还是重发 release

**人类介入的唯一必要场景**:teammate 执行出现**结果异常**(checkpoint 失败
或偏离 plan 方向性错误),由 teammate 写进 handoff"偏离计划"节,team-lead
escalate 给人类决定修复方向。正常流程下人类只在整条链完成后一次性审读。

## 失败与回滚原则

- 每个里程碑一条独立 feature 分支,失败时由 team-lead 决定重派该里程碑
  的 teammate,或 escalate 给人类
- 前置里程碑已被下游里程碑依赖的,不能随意回滚;若必须回滚,重新派该
  里程碑以下的所有 teammate
- M6 失败最痛,teammate 必须在自己分支上跑完整 e2e,不得跳过
- 整条分支链最终由人类决定如何合回 `feat/backend-migration`
  (一次性 PR / 分段 PR),这是 team 流程之外的事

## 执行时常见踩坑预防

1. **M1 漏改某个配置文件** → 下一个里程碑才发现 → 回头改补丁 PR
   - 预防:M1 plan 要列出 12 大类配置完整清单,执行者逐个 check off
2. **M3 的 web-host API 设计被 M4/M5 反复修改** → 接口漂移
   - 预防:M3 完成时 handoff 里明确锁定 `startWebHost` / `WebHostHandle` 的
     完整 TypeScript 类型签名,后续不允许再改(除非起 PR 说明)
3. **M6 切换时 backend 端口传递错误** → 桌面 GUI 开关打开后浏览器连不上 backend
   - 预防:M6 plan 必须有"反代 `/api` 的单元测试"一步,单独验证端口透传
4. **M8 tarball 在有 DE 的开发机 smoke OK,但无 DE 服务器跑不起来**
   - 预防:M8 checkpoint 强制在干净容器里验证,不接受开发机通过
5. **aionui-backend Release CI 还没好时 M7 / M8 无法跑通**
   - 预防:两者 plan 里 default 开 `AIONUI_BACKEND_ALLOW_MISSING=1` 过渡开关;
     backend CI 稳定后由人类提 follow-up commit 关掉
6. **teammate "失联"(run_in_background 模式下长时间无产出)**
   - 预防:team-lead 在派 teammate 后设置"心跳检查",每隔 N 分钟查一次
     teammate 状态;若 15 分钟无新产出,视为卡死,终止并重派
   - 若反复失败 2 次,escalate 给人类
7. **主会话关闭导致 team 解散**
   - 预防:执行期间主会话不能关;如果必须关,用 tmux / screen / Claude Code
     的后台模式保持主会话存活
   - 这是 Claude Code team 机制的已知限制,不是方案 bug

## 工具选择:bun workspaces

本仓库已全仓使用 bun(`bun.lock` / `bun run` / CI `oven-sh/setup-bun`),
monorepo 继续用 bun workspaces:

- 根 `package.json` 添加 `"workspaces": ["packages/*"]`
- 子包 `package.json` 用 `"@aionui/web-host": "workspace:*"` 引用
- `bun install` 自动 hoist + symlink
- CI 不需要切换 setup action

**不换 npm / pnpm 的原因**:仓库现有 bun 产物(bun.lock)和工具链(
`bun test` / `bun run`)全部跑在 bun 上,引入第二个包管理器会让 CI 慢 +
环境不一致。

## 非 team-mode 执行映射

如果执行环境不具备 Claude Code 的 `TeamCreate` / `Agent(team_name=...)` /
`SendMessage` 工具(例如:直接人类执行、普通本地开发、其他 AI 编码环境),
按以下映射翻译本 playbook:

| 本 playbook 里的概念 | 非 team-mode 对应做法 |
|---|---|
| team-lead(主会话) | **协调者**:可以是人类或一个常驻会话,负责读 handoff 和启动下一个里程碑 |
| `TeamCreate` | 无需对应动作,跳过 |
| executor teammate | **一个独立会话 / 独立开发者**,按对应里程碑 plan 执行 |
| plan-writer teammate | **同上,但任务是写 plan 不是写代码**;或协调者直接手写 plan |
| `Agent(team_name=...)` 派发 | 手动在新会话/新开发者处启动,把 prompt 模板粘贴过去 |
| `SendMessage` 通信 | **改为写 `handoffs/Mx-outcome.md` 文件通信**;协调者定期读 handoff |
| `TeammateIdle` 钩子 | 人类察觉某个 handoff 写完即可启动下一个;或定时轮询 handoff 目录 |
| `TeamDelete` | 无需对应动作,跳过 |

**强制不变项**(任何执行环境都必须遵守):
- 分支协作模型(feature 分支链、不 push 共享分支、不创建 PR)
- 基线同步规范(push 前必须 merge `origin/feat/backend-migration`)
- Handoff notes 模板和位置(`docs/backend-migration/handoffs/Mx-outcome.md`)
- 权威来源优先级
- 每个里程碑 requirements 的边界、验收、接口契约
- Executor / plan-writer 的各自约束和权限边界

**可变项**(根据环境调整):
- 调度机制(team `Agent` vs 手动新会话 vs 人工分配)
- 通信机制(`SendMessage` vs 仅文件)
- 监督机制(`TeammateIdle` vs 人工定期查看)

简而言之:**文档内容(分支、接口、验收)是约束,team 工具只是其中一种
自动化实现**。非 team-mode 读者需要自行选择等价的调度和通信机制,但不得
绕过强制不变项。

## 文档更新责任

- 本 playbook 由人类维护,teammate / team-lead 均不改
- 单个里程碑 plan 由该里程碑的 teammate 执行时不改(改了说明 plan 本身
  有问题,需要人类重写该 plan)
- 设计总文档只在必要时(发现方向性错误)由人类更新,不跟着每个里程碑改
- handoff 由 teammate 写,一经写入不由后续 teammate 修改

## 快速索引

| 文档 | 用途 | 谁读 |
|---|---|---|
| `2026-05-07-webui-decouple-electron-design.md` | 完整设计,UC 硬约束 | 全体 |
| **`2026-05-07-webui-decouple-teammate-cheatsheet.md`** | **精简版 teammate 硬约束(~190 行)** | **executor / plan-writer** |
| 本 playbook | 完整协作约定、角色派发、prompt 模板、checkpoint 规范 | **team-lead / 协调者**(teammate 按需查) |
| `2026-05-07-m{x}-{name}-requirements.md` | 单个里程碑需求 | plan-writer 必读,executor 可读 |
| `2026-05-07-m{x}-{name}.md` | 单个里程碑详细 plan | **executor 必读** |
| `handoffs/Mx-outcome.md` | 单个里程碑的 500 字产物摘要 | 后续 teammate 读上游 |
