# PR 自动化流程说明

本仓库运行 PR 自动化 agent，持续处理 open PR（review、fix、合并）。本文说明 pipeline 架构、label 体系、触发条件和人工介入方式。

---

## Pipeline 架构

每个 PR 经历三段式处理：

```
pr-automation-daemon.sh
    ↓ 扫描 eligible PRs
pr-automation-precheck.sh        # Shell：加锁、CI 验证、rebase
    ↓
claude -p "/pr-automation <N>"   # Claude：冲突解决 → review → fix
    ↓
pr-automation-postmerge.sh       # Shell：最终 rebase、等待全量 CI、merge
```

- **precheck**：获取 `bot:reviewing` 锁、验证必检 CI、尝试自动 rebase
- **Claude**：若存在冲突则智能解决，执行 pr-review，若有条件批准则执行 pr-fix，推送结果后退出
- **postmerge**：最终 rebase 到最新 base 分支，等待全量 CI 通过，执行 merge 并清理

---

## Label 体系

| Label | 含义 | 下一步 |
|---|---|---|
| `bot:reviewing` | 正在处理中（防并发互斥锁） | 处理完成后由 postmerge 自动移除 |
| `bot:needs-fix` | 已 review，等待作者按报告修复 | 作者推送新 commit 并手动移除此 label 后重新处理 |
| `bot:needs-human-review` | 需人工介入（存在阻塞性问题） | 人工处理后手动移除 label |
| `bot:done` | 已完成（已合并） | 无 |

---

## 触发条件

- daemon `scripts/pr-automation-daemon.sh` 持续运行（建议在 tmux 中），默认每 5 分钟扫描一轮
- 每轮每个 PR 独立启动一个 Claude 进程处理，默认每轮最多处理 3 个 PR
- 优先处理 `iOfficeAI/trusted-contributors` 团队成员的 PR；同优先级按创建时间 FIFO

### 跳过条件

满足以下任一条件的 PR 本轮跳过：

- 是 Draft PR
- 标题含 `WIP`（大小写不敏感）
- 有 `hold` label
- 已有 `bot:reviewing`、`bot:needs-fix`、`bot:needs-human-review` 或 `bot:done`

### CI 要求

以下 job 全部通过才继续处理，否则 precheck 发评论提醒后跳过：

- `Code Quality`
- `Unit Tests (ubuntu-latest)`
- `Unit Tests (macos-14)`
- `Unit Tests (windows-2022)`
- `Coverage Test`
- `i18n-check`

**CI 未触发（新贡献者）**：precheck 自动 approve pending workflows，释放锁，等下一轮 CI 触发后再处理。

---

## 决策矩阵

| Review 结论 | PR 来源 | 行动 |
|---|---|---|
| ✅ 批准 | 任意 | postmerge 等 CI → 合并（rebase 优先，fallback squash）|
| ⚠️ 有条件批准（可自动修复） | 任意（含 fork） | pr-fix 直接推送修复 → postmerge 等 CI → 合并 |
| ⚠️ 有条件批准（不可自动修复） | 任意 | 评论通知作者 → `bot:needs-fix` |
| ❌ 需要修改 | 任意 | 评论说明 → `bot:needs-human-review` |

> **Fork PR**：agent 具有 admin push 权限，可直接推送修复到 fork 分支，与内部 PR 处理方式相同。

### 合并冲突

- **precheck** 先尝试自动 rebase，成功则继续
- **rebase 失败** → 交由 Claude 智能解决（读取双方代码，产出合并结果）
- **Claude 无法解决**（业务逻辑模糊）→ 评论提示作者手动解决 → `bot:needs-fix`

---

## 人工介入

### 阻止自动处理某 PR

- 在标题加 `WIP`，或
- 标记为 Draft，或
- 手动打 `hold` label

### 作者修复后重新触发

1. 按 review 报告修复并推送
2. **手动移除** `bot:needs-fix` label
3. 下一轮 daemon 扫描时自动重新处理

### 查看运行日志

```bash
# 实时日志
tail -f ~/.aionui-auto-merge/daemon.log

# 查看 daemon 是否在运行
cat ~/.aionui-auto-merge/daemon.lock 2>/dev/null | xargs -I{} kill -0 {} 2>/dev/null && echo "daemon 运行中" || echo "daemon 未运行"
```

---

## 启动 Daemon

```bash
# 在 tmux 中持续运行（推荐）
tmux new -s pr-daemon './scripts/pr-automation-daemon.sh'

# 自定义轮询间隔和每轮最大处理数
./scripts/pr-automation-daemon.sh --interval 180 --max-prs 5

# 停止 daemon
kill $(cat ~/.aionui-auto-merge/daemon.lock)
```

---

## 首次部署

1. 确认 `gh auth login` 已完成，有足够权限（PR labels、merge、push to forks）
2. 确认 `claude` CLI 已安装并可在终端调用
3. 启动 daemon（见上方命令）
4. 观察首轮日志确认流程正常：`tail -f ~/.aionui-auto-merge/daemon.log`
