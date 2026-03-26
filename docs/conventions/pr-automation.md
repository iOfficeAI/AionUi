# PR 自动化流程说明

本仓库运行 PR 自动化 agent，定期处理 open PR（review、fix、合并）。本文说明 label 体系、触发条件和人工介入方式。

---

## Label 体系

所有自动化状态通过 `bot:` 前缀 label 追踪，无需本地状态文件。

| Label | 含义 | 下一步 |
|---|---|---|
| `bot:reviewing` | 正在 review 中（防并发占位） | 等待完成后自动移除 |
| `bot:fixing` | 正在 fix 中（防并发占位） | 等待完成后自动移除 |
| `bot:needs-fix` | 已 review，等待作者按报告修复 | 作者推送新 commit 后自动重新处理 |
| `bot:needs-human-review` | 需人工介入（存在阻塞性问题） | 人工处理后手动移除 label |
| `bot:done` | 已完成（已合并或无需操作） | 无 |

---

## 触发条件

- cron 每 30 分钟运行一次 `scripts/pr-automation.sh`
- 每次运行选取**一个**符合条件的 open PR 处理（多实例时各自独立选取）
- 优先处理 trusted-contributors 团队成员的 PR；同优先级按创建时间 FIFO

### 跳过条件

满足以下任一条件的 PR 本轮跳过：

- 标题含 `WIP`（大小写不敏感）
- 已有 `bot:needs-human-review`
- 已有 `bot:done`
- 已有 `bot:reviewing` 或 `bot:fixing`（正在处理中）
- 有 `bot:needs-fix` 但作者尚未推送新 commit

### CI 要求

以下 job 全部通过才会继续处理，否则本轮跳过并发评论提醒：

- `Code Quality`
- `Unit Tests (ubuntu-latest)`
- `Unit Tests (macos-14)`
- `Unit Tests (windows-2022)`
- `Coverage Test`
- `i18n-check`

---

## 决策矩阵

| Review 结论 | PR 来源 | 行动 |
|---|---|---|
| ✅ 批准合并 | 任意 | 自动合并（squash）|
| ⚠️ 有条件批准 | 内部分支 | 自动修复 → 自动合并 |
| ⚠️ 有条件批准 | 外部 fork | 评论通知作者修复 → `bot:needs-fix` |
| ❌ 需要修改 | 任意 | 评论说明 → `bot:needs-human-review` |

合并使用 `--squash --auto`：等所有必检 CI 通过后才执行，不会立即强制合并。

---

## 人工介入

### 阻止自动处理某 PR

- 在标题加 `WIP`，或
- 手动打 `bot:needs-human-review` label

移除 `bot:needs-human-review` 后，下一轮 cron 会重新处理该 PR。

### 查看运行状态

- **实时日志**：`tail -f /var/log/pr-automation.log`
- **状态看板**：搜索 Issue 标题 `[Bot] PR Automation Status`（本仓库内）

### 并发控制

- Lock 文件：`/tmp/pr-automation.lock`（存储运行中的脚本 PID）
- 若上轮脚本仍在运行，本轮 cron 自动退出
- 若上轮脚本异常崩溃，下轮自动清理残留 label 并重新开始

---

## Cron 配置参考

```cron
# 单实例（默认）
*/30 * * * * cd /path/to/AionUi-review && ./scripts/pr-automation.sh >> /var/log/pr-automation.log 2>&1

# 并行处理（传入实例数）
*/30 * * * * cd /path/to/AionUi-review && ./scripts/pr-automation.sh 2 >> /var/log/pr-automation.log 2>&1
```

---

## 首次部署

1. 确认 `gh auth login` 已完成，有足够权限（PR labels、issues、合并）
2. 手动创建 GitHub Issue，标题：`[Bot] PR Automation Status`，记录 Issue 编号
3. 在 `.claude/skills/pr-automation/SKILL.md` 的 `STATUS_ISSUE_NUMBER` 填入该编号
4. 配置 crontab（见上方参考）
5. 手动运行一次验证：`./scripts/pr-automation.sh` 并观察日志
