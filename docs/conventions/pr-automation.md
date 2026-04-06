# PR 自动化流程说明

本仓库运行 PR 自动化 agent，持续处理 open PR（review、fix、合并）。本文说明 label 体系、触发条件和人工介入方式。

---

## Label 体系

| Label                    | 含义                                                                                  | 终态？ |
| ------------------------ | ------------------------------------------------------------------------------------- | ------ |
| `bot:reviewing`          | review 进行中（防重入占位）                                                           | 否     |
| `bot:ready-to-fix`       | CONDITIONAL review 完成，等 bot 下次执行 fix                                          | 否     |
| `bot:fixing`             | fix 进行中（防重入占位）                                                              | 否     |
| `bot:ci-waiting`         | CI 失败已通知，等待作者推新 commit — bot 暂停处理此 PR                                | 否     |
| `bot:needs-rebase`       | 合并冲突且 bot 无法自动 rebase — 等待作者 push 新 commit 后自动唤醒                   | 否     |
| `bot:needs-human-review` | 需人工介入（阻塞性问题）                                                              | ✅     |
| `bot:ready-to-merge`     | bot 已处理完，代码无问题，等人工确认后合并（大 PR / critical path / 非 trusted 成员） | ✅     |
| `bot:done`               | bot 已 auto-merge                                                                     | ✅     |

---

## 处理流程

```
选 PR（优先 bot:ready-to-fix > trusted > FIFO）
 │
 ├─ 无 PR → EXIT
 │
 ├─ bot:ready-to-fix → 重新检查 CI
 │     ├─ CI 跑中/失败 → 移除标签，重入队列 → EXIT
 │     └─ CI 过 → pr-fix → push → --auto → bot:done → EXIT
 │
 └─ 新鲜 PR → 加 bot:reviewing → 检查 CI
       ├─ 从未触发 → approve workflow → EXIT
       ├─ CI 跑中 → 移除 bot:reviewing → 找下一个
       ├─ CI 失败 → 去重检查
       │     ├─ 已评论且无新 commit → 加 bot:ci-waiting → 找下一个
       │     └─ 否则 → 发评论 → EXIT
       └─ CI 过 → 检查 merge conflict
             ├─ UNKNOWN → 找下一个
             ├─ CONFLICTING → 去重检查
             │     ├─ 已评论且无新 commit → 找下一个
             │     └─ 否则 → 尝试自动 rebase
             │           ├─ 成功 → push → EXIT
             │           └─ 失败 → 评论 + bot:needs-rebase → EXIT
             └─ MERGEABLE
                   ├─ BEHIND → update-branch API → EXIT（GitHub 自动补 base，CI 重跑，auto-merge 触发）
                   └─ 其他 → pr-review
                         ├─ APPROVED
                         │     ├─ 小 PR + trusted → --auto merge → bot:done → EXIT
                         │     ├─ 小 PR + untrusted → bot:ready-to-merge（🔒） → EXIT
                         │     └─ 大 PR / critical path → bot:ready-to-merge → EXIT
                         ├─ CONDITIONAL → bot:ready-to-fix → EXIT
                         │     └─ fix 完成
                         │           ├─ 小 PR + trusted → --auto merge → bot:done → EXIT
                         │           ├─ 小 PR + untrusted → bot:ready-to-merge（🔒） → EXIT
                         │           └─ 大 PR / critical path → bot:ready-to-merge → EXIT
                         └─ REJECTED → bot:needs-human-review → EXIT
```

### Skip 条件（继续找下一个 PR）

- PR 是 draft（`gh pr list -is:draft` 直接过滤）
- 标题含 `WIP`（大小写不敏感）
- 已有 `bot:needs-rebase` / `bot:needs-human-review` / `bot:ready-to-merge` / `bot:done` / `bot:reviewing` / `bot:fixing` / `bot:ci-waiting`
- CI 仍在运行（QUEUED / IN_PROGRESS）
- Mergeability 为 UNKNOWN
- CI 失败但已评论且作者无新 commit（同时打上 `bot:ci-waiting`，每轮开始时轻量检查是否有新 commit）
- Merge conflict 但已评论且作者无新 commit

---

## 人工介入

### 阻止自动处理某 PR

- 设为 draft，或
- 在标题加 `WIP`，或
- 手动打 `bot:needs-human-review` label

移除 `bot:needs-human-review` 后，daemon 下一轮会重新处理该 PR。

### 查看运行状态

```bash
tail -f /tmp/pr-automation.log
```

---

## 守护进程管理

### 启动

```bash
# 前台运行
./scripts/pr-automation.sh

# 后台运行
nohup ./scripts/pr-automation.sh >> /tmp/pr-automation.log 2>&1 &
```

### 停止

```bash
kill $(cat /tmp/pr-automation-daemon.pid)
```

### 检查是否运行

```bash
PID=$(cat /tmp/pr-automation-daemon.pid 2>/dev/null) \
  && kill -0 "$PID" 2>/dev/null \
  && echo "Daemon running (PID $PID)" \
  || echo "Daemon not running"
```

### 自定义参数

```bash
SLEEP_SECONDS=60        # 每轮间隔（默认 30 秒）
MAX_CLAUDE_SECS=3600    # Claude 超时阈值（默认 3600 秒）
LOG_FILE=/var/log/pr-automation.log
```

---

## 首次部署

1. 确认 `gh auth login` 已完成，有足够权限（PR labels、合并、向外部 fork 推送）
2. 手动运行一次：`./scripts/pr-automation.sh` 并观察日志
3. 确认输出 `No eligible PR found this round` 或正常处理一个 PR
