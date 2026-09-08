# Impeccable 维护约定

## 当前安装模型

- Impeccable Skill 只安装在个人全局目录 `~/.agents/skills/impeccable/`，同一台机器上的所有项目和新 worktree 共用这一份，不在仓库内重复保存 Skill。
- `.codex/hooks.json` 通过 `$HOME/.agents/skills/impeccable/scripts/impeccable hook` 在 UI 文件编辑后运行设计检测；首次使用或 Hook 定义变化后，需要在 Codex `/hooks` 中确认信任。
- 个人全局 Skill 不锁定发布标签或内容摘要；日常检查仅报告当前本机版本与上游正式 `skill-v*` 标签。
- 全局 `impeccable` CLI 与个人全局 Skill 是两个独立版本面，不能用其中一个的版本代替另一个的验证。
- 新电脑或其他开发者首次使用前，需要先将经过审核的正式版本安装到 `~/.agents/skills/impeccable/`；仓库不再自带可执行 Skill。

## 日常检查

本地版本检查不访问网络，也不校验安装内容完整性：

```bash
npm run impeccable:check
```

需要检查上游稳定版本时运行：

```bash
npm run impeccable:check:remote
```

远端检查只报告 GitHub 的最新 `skill-v*` 标签和 npm 的最新 CLI 版本，不修改任何文件。建议在重要 UI 迭代前或每月检查一次。

## 升级流程

1. 只采用正式 `skill-v*` 标签，不直接跟随 `main`，也不静默自动更新可执行的 Skill 指令。
2. 在隔离 worktree 中检查发布说明、标签提交、`SKILL.md` 版本和 Hook 变化；仅在需要调用链或影响分析时建立 CodeGraph 索引。
3. 从确定的标签替换 `~/.agents/skills/impeccable/`，不创建项目级版本或内容锁定。
4. 运行 `npm run impeccable:check`，再通过 `~/.agents/skills/impeccable/scripts/impeccable` 的 `context`、`detect` 和 `hook` 子命令进行定向冒烟验证。
5. 个人全局 Skill 不进入项目提交；只有项目配置、检查脚本或 Hook 契约变化时才提交项目改动。Hook 变化后重新确认 `/hooks` 信任。

当前不要把 `impeccable update` 当作无人值守更新器。它会影响个人全局 Skill 或 Hook，且更新服务与 GitHub 标签、npm CLI 的发布时间可能不同步。版本检查可以自动化，升级必须保留人工审核。
