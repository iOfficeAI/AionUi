# PR 自动化流程设计

**日期**：2026-03-26
**状态**：待实现

---

## 概述

本设计描述一套本地运行的 PR 自动化系统：定期轮询 open PR，对符合条件的 PR 执行 CI 检查、code review、自动修复和合并，释放人工 review 的重复性工作。

---

## 架构

```
系统 cron (每 30 分钟)
  └── claude --dangerously-skip-permissions -p "/pr-automation"
        ├── pr-automation SKILL（新建，主编排器）
        │     ├── 调用 pr-review SKILL（新增 automation 模式）
        │     └── 调用 pr-fix SKILL（改造，去除交互）
        └── GitHub Labels（分布式状态存储）
```

**本地优先，可迁移**：先在本地机器验证，云服务器迁移只需 clone 仓库 + `gh auth login` + 配置同一条 crontab。

---

## 并发控制：脚本与 Lock 文件机制

入口脚本 `scripts/pr-automation.sh` 负责并发控制，支持传入并行实例数：

```bash
./scripts/pr-automation.sh [N]   # N 默认为 1
```

### 脚本行为

```
1. 检查 /tmp/pr-automation.lock（存储上一轮脚本的 PID）
2. 启动 N 个 claude 后台进程，每个独立执行 /pr-automation
3. wait 等待所有子进程完成
4. 清理 lock 文件（trap 保证异常退出也会执行）
```

每个 Claude 实例独立选取 PR——谁先打上 `bot:reviewing` label 谁处理该 PR，天然防止多个实例处理同一 PR。

### Lock 文件检查（基于 PID）

```
检查 /tmp/pr-automation.lock
  ├── 不存在 → 写入当前脚本 PID，继续执行
  ├── 存在，PID 仍在运行（kill -0 <PID> 成功） → 上一轮仍在运行，本轮退出
  └── 存在，PID 已不存在 → 判定为异常退出（crash）
        ├── 删除旧 lock 文件
        ├── 清理残留的 bot:reviewing / bot:fixing label
        └── 写入新 PID，继续执行
```

用 `kill -0` 检测 PID 是否存活比时间戳更准确——进程退出后立即可检测，不依赖超时阈值。

### 完成时清理（trap）

脚本通过 `trap` 注册退出钩子，无论正常退出还是异常中断均执行：

1. 删除 `/tmp/pr-automation.lock`
2. 清理本轮残留的 `bot:reviewing` / `bot:fixing` label

### 残留 Label 清理逻辑

```bash
gh pr list --state open --label "bot:reviewing" --json number \
  --jq '.[].number' | xargs -I{} gh pr edit {} --remove-label "bot:reviewing"

gh pr list --state open --label "bot:fixing" --json number \
  --jq '.[].number' | xargs -I{} gh pr edit {} --remove-label "bot:fixing"
```

清理后这些 PR 会在下一轮重新被纳入候选，从头走流程。

---

## 状态管理：GitHub Label 体系

用 `bot:` 前缀 label 追踪每个 PR 的自动化处理状态，无需本地状态文件。

| Label                    | 含义                              | 下一步                   |
| ------------------------ | --------------------------------- | ------------------------ |
| `bot:reviewing`          | 正在 review 中（防并发）          | 等待完成                 |
| `bot:fixing`             | 正在 fix 中（防并发）             | 等待完成                 |
| `bot:needs-fix`          | 已 review，等待外部作者按报告修复 | 等作者更新               |
| `bot:needs-human-review` | ❌ 结论，需要人工介入             | 人工处理后手动移除 label |
| `bot:done`               | 已完成（合并或无需操作）          | 无                       |

**任何人都可以手动操作 label**：

- 手动打 `bot:needs-human-review` → 阻止自动化处理该 PR
- 手动移除 `bot:needs-human-review` → 下一轮自动化重新处理
- 标题加 `WIP` 同样可跳过自动化

---

## PR 选择与筛选逻辑

每次 cron 触发后，**只处理一个 PR**——控制上下文消耗，同时避免并发问题。

### Step 1 — 获取候选 PR

```bash
gh pr list --state open \
  --search "created:>=$(date -d '7 days ago' +%Y-%m-%d) -is:draft" \
  --json number,title,labels,isCrossRepository,createdAt,author
```

### Step 2 — 排序规则

双键排序，找到第一个符合条件的 PR 即停止：

1. **主键**：作者是否在 [trusted-contributors](https://github.com/orgs/iOfficeAI/teams/trusted-contributors/members) 名单中（是 → 优先）
2. **次键**：创建时间（最早优先，FIFO）

获取信任名单：

```bash
gh api orgs/iOfficeAI/teams/trusted-contributors/members --jq '[.[].login]'
```

### Step 3 — 跳过条件

满足以下任一条件则跳过，查找下一个：

| 条件                                 | 原因           |
| ------------------------------------ | -------------- |
| 标题含 `WIP`（大小写不敏感）         | 作者标记未完成 |
| 已有 `bot:needs-human-review`        | 等人工介入     |
| 已有 `bot:done`                      | 已完成         |
| 已有 `bot:reviewing` 或 `bot:fixing` | 正在处理中     |

**特殊处理——`bot:needs-fix` 的 PR**：

检查最新 commit 时间是否晚于上次 `<!-- pr-review-bot -->` 评论时间：

- **有新 commit** → 摘掉 `bot:needs-fix`，重新纳入本轮处理
- **无新 commit** → 跳过，继续等待作者

找到目标 PR 后，**立即打上 `bot:reviewing` label** 防止下一轮重复处理。

**若遍历所有候选 PR 后无符合条件的**：输出日志"No eligible PR found this round"，直接退出，不做任何操作。

### Step 4 — 检查 CI 状态

必检 job：`Code Quality`、`Unit Tests (ubuntu-latest)`、`Unit Tests (macos-14)`、`Unit Tests (windows-2022)`、`Coverage Test`、`i18n-check`

| CI 状态                            | 行为                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| 全部通过（SUCCESS）                | 继续处理                                               |
| 存在 QUEUED / IN_PROGRESS          | 摘掉 `bot:reviewing`，跳过本轮                         |
| statusCheckRollup 为空（从未触发） | 尝试 workflow approval，摘掉 `bot:reviewing`，跳过本轮 |
| 存在 FAILURE / CANCELLED           | 发评论提醒作者修复 CI，摘掉 `bot:reviewing`，跳过本轮  |

Workflow approval（新贡献者 CI 未触发时）：

```bash
gh run list --json databaseId,status \
  --jq '.[] | select(.status == "action_required") | .databaseId'
gh run approve <run_id>
```

### Step 5 — 记录 PR 属性

- **`isExternal`**：`isCrossRepository == true`（fork PR）
- **`hasCriticalPathFiles`**：diff 中含核心路径文件（仅标记，不阻断流程）。完整列表在实现时确认，初始参考：`src/preload.ts`、`src/process/channels/`、`src/common/config/`

---

## Review → 决策 → 行动映射

### pr-review 输出

automation 模式下自动发布评论，并输出机器可解析的结论块：

```
<!-- automation-result -->
CONCLUSION: APPROVED | CONDITIONAL | REJECTED
IS_CRITICAL_PATH: true | false
PR_NUMBER: <number>
<!-- /automation-result -->
```

### 决策矩阵

| 最终结论      | isExternal    | 行为                                                                          |
| ------------- | ------------- | ----------------------------------------------------------------------------- |
| ✅ 批准合并   | any           | 发评论"已 review，无问题" → `gh pr merge --squash --auto` → 打 `bot:done`     |
| ⚠️ 有条件批准 | false（内部） | 运行 pr-fix → `gh pr merge --squash --auto` → 打 `bot:done`                   |
| ⚠️ 有条件批准 | true（外部）  | 发评论附完整 review 报告，要求所有问题全部修复后重新提交 → 打 `bot:needs-fix` |
| ❌ 需要修改   | any           | 发评论说明无法自动处理的原因 → 打 `bot:needs-human-review`                    |

**关于 `gh pr merge --squash --auto`**：`--auto` 表示等所有必检 CI job 通过后才执行合并。pr-fix 推送代码会触发新一轮 CI，CI 通过后自动合并生效，不会立即强制合并。

**关于 `hasCriticalPathFiles`**：不影响决策流程，仅在发出的任何评论末尾追加提示：

> ⚠️ **注意**：本 PR 涉及核心路径文件（`src/preload.ts` 等），建议人工确认合并后行为是否符合预期。

---

## pr-review 改造点

通过 `--automation` 标志位触发自动化模式：`/pr-review <pr_number> --automation`

| 改动                        | 详情                                                      |
| --------------------------- | --------------------------------------------------------- |
| 去掉"是否发布评论"询问      | automation 模式下直接发布                                 |
| 去掉"是否删除本地分支"询问  | automation 模式下直接删除                                 |
| CI 未通过时不询问"是否继续" | 直接中止，返回信号给 pr-automation                        |
| 新增结论输出块              | 输出 `<!-- automation-result -->` 块供 pr-automation 解析 |

---

## pr-fix 改造点

通过 `--automation` 标志位触发自动化模式：`/pr-fix <pr_number> --automation`

| 改动                     | 详情                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| 删除 LOW 问题询问        | **所有模式**下均直接修复全部问题，不再询问                                          |
| 去掉所有 yes/no 确认提示 | automation 模式下按默认最优路径执行                                                 |
| 外部 fork PR 行为修改    | automation 模式下返回 `SKIP_EXTERNAL` 信号，不执行 fix，由 pr-automation 负责发评论 |

---

## 可观测性

### 日志文件

cron 将 Claude 的完整输出重定向到日志文件，用于排查问题：

```bash
tail -f /var/log/pr-automation.log
```

### GitHub Issue 状态看板

创建一个长期存在的 Issue（标题：`[Bot] PR Automation Status`），automation 每次运行时更新其 body，作为对外可见的状态入口。收藏该 Issue URL 即可随时查看当前进度。

**Issue body 格式：**

```markdown
## PR Automation 状态看板

**最后运行**：2026-03-26 14:30
**当前状态**：🔧 正在处理 PR #156 - feat: add image export
**进度**：review 完成（⚠️ 有条件批准），fix 中...

---

## 最近处理记录

| 时间  | PR             | 结论        | 操作            |
| ----- | -------------- | ----------- | --------------- |
| 14:00 | #154 feat: xxx | ✅ 批准合并 | 已合并          |
| 13:30 | #152 fix: yyy  | ❌ 需要修改 | 转人工          |
| 13:00 | —              | —           | 无符合条件的 PR |
```

**更新时机：**

| 时机                  | 状态文字                                    |
| --------------------- | ------------------------------------------- |
| 启动，找到目标 PR     | `🔍 正在 review PR #N - <标题>`             |
| review 完成，开始 fix | `🔧 正在 fix PR #N，结论：有条件批准`       |
| 等待 CI               | `⏳ PR #N fix 完成，等待 CI 通过后自动合并` |
| 本轮完成              | 追加一行到"最近处理记录"，清空当前状态      |
| 无符合条件的 PR       | `💤 本轮无符合条件的 PR`                    |

Issue 的创建在初次部署时手动创建一次，automation 只负责更新其 body，不重复创建。Issue 编号在 pr-automation SKILL 配置中写死。

---

## 职责边界

| 工作                            | 负责方                             |
| ------------------------------- | ---------------------------------- |
| 发 review 评论到 PR             | pr-review（automation 模式自动发） |
| 发"请按报告修复"评论（外部 PR） | pr-automation                      |
| 发"❌ 无法自动处理"评论         | pr-automation                      |
| 发"已 review，直接合并"评论     | pr-automation                      |
| 执行代码修复                    | pr-fix                             |
| 执行合并                        | pr-automation                      |
| 管理 `bot:*` label              | pr-automation                      |
| 更新状态看板 Issue              | pr-automation                      |

---

## 文档与 AGENTS.md

在 `AGENTS.md` 添加简介和引用：

```markdown
## PR 自动化流程

本仓库运行 PR 自动化 agent，定期处理 open PR（review、fix、合并）。
详见 [docs/conventions/pr-automation.md](docs/conventions/pr-automation.md)。
```

在 `docs/conventions/pr-automation.md` 放完整的对接说明（label 体系、触发条件、人工介入方式）。

---

## Cron 配置

```cron
# 默认单实例
*/30 * * * * cd /path/to/AionUi-review && ./scripts/pr-automation.sh >> /var/log/pr-automation.log 2>&1

# 并行处理多个 PR（传入实例数）
*/30 * * * * cd /path/to/AionUi-review && ./scripts/pr-automation.sh 2 >> /var/log/pr-automation.log 2>&1
```

---

## 需要新建的文件

| 文件                                    | 类型 | 说明                                                 |
| --------------------------------------- | ---- | ---------------------------------------------------- |
| `.claude/skills/pr-automation/SKILL.md` | 新建 | 主编排 skill                                         |
| `scripts/pr-automation.sh`              | 新建 | cron 入口脚本，负责并发控制（N 实例）、lock 文件管理 |
| `docs/conventions/pr-automation.md`     | 新建 | 面向 agent 和人工的对接文档                          |

## 需要修改的文件

| 文件                                | 改动                                    |
| ----------------------------------- | --------------------------------------- |
| `.claude/skills/pr-review/SKILL.md` | 新增 automation 模式支持                |
| `.claude/skills/pr-fix/SKILL.md`    | 删除 LOW 询问；新增 automation 模式支持 |
| `AGENTS.md`                         | 新增 PR 自动化简介和引用                |
