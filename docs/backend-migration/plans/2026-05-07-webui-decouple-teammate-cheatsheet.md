# WebUI 脱 Electron Teammate Cheatsheet

- **读者**:被派去执行单个里程碑的 teammate(executor 或 plan-writer)
- **目的**:用最短篇幅列清你需要遵守的硬约束;不讲背景、不讲为什么
- **权威来源**:任何冲突以
  [`2026-05-07-webui-decouple-team-playbook.md`](./2026-05-07-webui-decouple-team-playbook.md)
  为准,查细节去那里
- **全局设计**:[`2026-05-07-webui-decouple-electron-design.md`](./2026-05-07-webui-decouple-electron-design.md)

---

## 你是谁

| 角色 | 产出 | 读什么 |
|---|---|---|
| **executor-M{x}** | 代码 + 测试 + handoff | 设计文档对应节 + 自己的 plan + 上游 handoff |
| **plan-writer-M{x}** | `2026-05-07-m{x}-{name}.md`(detailed plan 文件) | 自己的 requirements + 设计文档 + M1 plan(格式参考) + 已完成的 handoff |

---

## 分支规则(任何角色都必须遵守)

- ✅ 基于 **`origin/feat/m{x-1}-xxx`**(上游里程碑分支)创建自己的 feature
  分支:`feat/m{x}-{name}`
- ✅ 在自己的 feature 分支上 commit、push
- ✅ **push 之前必须** `git merge origin/feat/backend-migration --no-ff`
  (基线同步,只合 merge、不 rebase)
- ❌ **不得** push / merge 到 `feat/backend-migration`
- ❌ **不得** 创建 PR(PR 由人类在整条链完成后决定)
- ❌ **不得** rebase / force-push 上一个里程碑的分支
- ❌ **不得** 改其他里程碑的文件(范围严格限本里程碑)

---

## 冲突时谁说了算(权威优先级)

1. 设计文档 **UC-1 / UC-2 / UC-3** 节(跨里程碑硬约束)
2. **M3 handoff 锁定的接口签名**(`AppMetadata` / `WebHostOptions` / `WebUIConfig`)
3. 自己的 **requirements.md**(里程碑范围、边界、验收)
4. 自己的 **detailed plan**(执行步骤)
5. **上游 handoff**(实际交付情况)

**发现上层与下层冲突 → 以上层为准,escalate 给 team-lead,不自主折中**

---

## 完成前必须跑的事(最小验证集)

### 所有里程碑通用

```bash
# 质量门禁
bunx tsc --noEmit
bun run lint
bun test

# 依赖边界(M3 起每步)
grep -rE "packages/desktop/src/process/(agent|worker|services)" packages/web-host/src/
# 预期:无输出
grep -rn "from ['\"]electron['\"]" packages/web-host/src/
# 预期:无输出
```

### 基线同步三步(push 前必做)

```bash
git fetch origin feat/backend-migration
git merge origin/feat/backend-migration --no-ff \
  -m "chore(m{x}): sync with feat/backend-migration"
# 有冲突:简单的自己解,复杂的 escalate
# 合入后重跑上面的质量门禁
git push origin feat/m{x}-{name}
```

### 写 handoff(模板:`docs/backend-migration/handoffs/M{x}-outcome.md`,≤500 字)

```markdown
# M{x} <名称> - 交付摘要

## 已交付
- 新建 / 删除 / 修改文件清单
- 新增的对外 API / 配置项

## 与计划的偏离
- <改动点> —— 原因 —— 对后续影响

## 给下一个里程碑的提醒
- <警示>

## 验证证据(贴原始输出)
- 分支名 + 最新 SHA
- 基线同步状态(基线 SHA)
- tsc / lint / test 输出
- 本里程碑对应的 checkpoint 命令输出

## 遗留问题 / 跟进项
```

### SendMessage 给 team-lead

```
M{x} 完成。
- 分支:feat/m{x}-{name}
- SHA:<sha>
- 基线同步:origin/feat/backend-migration @ <基线 sha> 已合入
- Handoff:docs/backend-migration/handoffs/M{x}-outcome.md
- 偏离计划:<无 / 列出>
请启动 M{x+1}。
```

---

## executor 和 plan-writer 的额外硬约束

### Executor 特有

- 每个阶段 commit(不要等到最后一次大 commit)
- checkpoint 命令输出必须贴进 handoff,不转述
- checkpoint 失败 → 不 push,escalate,不自主硬改
- 不改 plan(偏离写进 handoff 的"偏离计划"节)

### Plan-writer 特有

- 产出物是 **`2026-05-07-m{x}-{name}.md`** 文件,不写代码
- **不得偏离自己 requirements 的已定决策**;遇到 requirements 没覆盖的决策点 → escalate
- 必须在 detailed plan 里补齐以下 12 项执行细节(requirements 不覆盖):
  阶段化 / Phase 0 基线快照 / 预检 / 逐行 Edit diff / commit 策略 /
  平台兼容(macOS vs Linux sed)/ 失败诊断路径 / 业务功能自动化验证 /
  工具预检 / handoff 字段映射 / 同步基线+push+handoff 三步 / 回滚
- 最后用 SendMessage 通知 team-lead 交付:plan 路径 + 阶段数 + 预估执行时间
  + 关键风险

---

## 元原则(拒绝人工判断)

- 能用脚本判定的,不要留给肉眼
- 能从日志 grep 的,不要写成"确认服务启动"
- 能从 artifact list 验证的,不要写成"检查 release 页面"
- 暂时无法机械化的点,必须在 handoff 显式标注:(a) 这是人工检查
  (b) 为什么目前无法机械化 (c) 哪个里程碑补强

**"看起来差不多对了"不是 PASS 理由**

---

## 关键硬约束速记(UC 摘要)

- **UC-1(install.sh)**:Bash 脚本,`shebang #!/usr/bin/env bash`,用户命令
  `curl ... | bash`(**不是** `| sh`)
- **UC-2(binary resolver)**:`isPackaged: true` 只查 bundled;`isPackaged: false`
  才允许 `AIONUI_BACKEND_BIN` / 兄弟目录 / PATH 的 fallback。**禁止**扁平成
  `bundled → env → PATH`
- **UC-3(auth 接口)**:M3 必须定义全部 5 个函数签名(resetPassword /
  changePassword / verifyPassword / loadConfig / saveConfig);M4-M6 只能
  扩展字段,不得破坏签名

---

## 遇到状况怎么办

| 状况 | 做法 |
|---|---|
| checkpoint 失败 | 不 push,escalate,handoff 里列诊断 |
| 基线合并冲突复杂 | 不硬改,escalate |
| requirements 的决策和 UC 冲突 | 以 UC 为准,escalate 让人类改 requirements |
| plan 里某条验证需要人眼判断 | 改进验证命令(或让 plan-writer 补),不能打 manual verify |
| 发现上游里程碑有遗留 bug | 不自主修,escalate |
| 需要的工具没装 | 装上(`bunx @electron/asar` / `prek`);若不能装,escalate |
| M6 e2e 失败 | 按 playbook "M6 固定诊断抓手" 顺序查日志,收集最小失败证据 |

---

## 查详情

| 主题 | 去 playbook 的哪节 |
|---|---|
| 完整角色模型、派发流程 | "用户操作" / "Team-lead 调度规则" |
| 完整 executor / plan-writer prompt | "Executor Prompt 模板" / "Plan-Writer Prompt 模板" |
| Checkpoint 清单(每个里程碑) | "Checkpoint 规范" |
| 分支协作模型全貌 | "分支协作模型" |
| 非 team-mode 环境 | "非 team-mode 执行映射" |
| M6 诊断抓手 | "M6 固定诊断抓手"(Checkpoint 规范子节) |
| 基线同步的冲突处理 | "基线同步规范" |

**手头事有明确做法就直接做;规则不清才去查 playbook**。
