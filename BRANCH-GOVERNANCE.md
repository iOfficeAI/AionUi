# 分支与版本同步规范

本文档定义 AionUi 后续的分支职责、版本同步与发版规则。后续更新优先按本文档执行。

## 分支职责

### `main`

- 作为上游同步基线
- 目标是尽量贴近 `upstream/main`
- 只保留上游同步与必要兼容修复

### `release/pounding-v2.0.x`

- 作为最终发布线
- 承载品牌、发布、打包、自动更新与产品交付改动
- 只有这里的稳定提交允许打 tag

### `feature/*`

- 从 `main` 切出：通用同步/兼容修复
- 从 `release/*` 切出：产品交付/发布修复
- 完成后回到对应父线

## tag 规则

- 只在 `release/*` 上打正式 tag
- tag 必须对应已验证可构建、可发布的提交
- 建议使用带补充分支标识的语义版本，例如：`v2.1.2-pounding.1`

## 同步流程

1. 更新 `upstream/main`
2. 对齐 `main`
3. 建立 `sync/*` 分支
4. 合并 `main` 到 `sync/*`
5. 验证并合回 `release/pounding-v2.0.x`
6. 在 `release/*` 上打 tag
7. 使用 `.github/workflows/sync-upstream.yml` 定期把 `main` 对齐到 `upstream/main`，并通过 PR 回看差异

## 当前上游基线

- AionUi 上游基线：`v2.1.2`
