# Coworker Fork 工作流

Coworker 是 [AionUi](https://github.com/iOfficeAI/AionUi) 的二开 fork。本文说明如何**同时二开**和**同步上游更新**。

## 远程仓库

| 远程 | 地址 | 用途 |
|------|------|------|
| `origin` | `https://github.com/songyipan/Coworker.git` | 你的 fork，推送二开代码 |
| `upstream` | `https://github.com/iOfficeAI/AionUi.git` | 原版开源项目，只拉不推 |

首次配置：

```bash
git remote add upstream https://github.com/iOfficeAI/AionUi.git
git remote -v
```

## 分支策略

| 分支 | 用途 |
|------|------|
| **`coworker`** | **二开主分支** — 品牌定制、功能开发都在这里，日常开发用这个 |
| **`main`** | **上游同步分支** — 只用来 merge `upstream/main`，保持与原版接近 |

```
upstream/main  ──merge──▶  main  ──merge──▶  coworker（你的二开）
```

## 日常二开

```bash
git checkout coworker
# ... 开发、提交 ...
git push origin coworker
```

## 同步上游更新

一键脚本：

```bash
chmod +x scripts/sync-upstream.sh
./scripts/sync-upstream.sh
```

或手动：

```bash
git fetch upstream
git checkout main
git merge upstream/main          # 把原版最新代码合进 main
git checkout coworker
git merge main                   # 再合进你的二开分支，解决冲突
git push origin main coworker
```

## 减少冲突的建议

- 二开功能尽量放在独立模块/目录，少改上游核心文件
- 品牌相关改动集中在 `packages/desktop/src/common/brand.ts`
- 定期同步（每周或上游有大版本时），不要拖太久
- 通用 bug 修复可以 PR 回上游，上游合并后你 sync 即可

## 品牌与内部标识

- **用户可见名称**：Coworker（`brand.ts`、`productName`、i18n）
- **内部路径/环境变量**（如 `~/.aionui-dev`、`AIONUI_*`）仍沿用上游命名，便于 merge

## 本地开发

```bash
bun install
node scripts/prepareAioncore.js   # 首次需要
bun start
```
