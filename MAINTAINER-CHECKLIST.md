# Maintainer Checklist — POUNDING Fork

## 1. Upstream Sync (每月或按需)

- [ ] `git fetch upstream`
- [ ] `git checkout upstream-sync/main`
- [ ] `git merge upstream/main` (或 rebase)
- [ ] 解决冲突后推送到 `origin upstream-sync/main`

## 2. 日常开发

- [ ] 从 `integration/fork-brand-login-model` (AionUi) 或 `main` (AionCore) 创建 `halo/feat/*` 分支
- [ ] 开发完成后开 PR → 目标分支
- [ ] PR 通过 PR Checks workflow 后合并

## 3. Release 流程

### 冻结

- [ ] 从稳定控制分支创建 `release/pounding-*`：

  ```bash
  # AionCore
  git checkout main && git checkout -b release/pounding-v0.1.x

  # AionUi
  git checkout integration/fork-brand-login-model && git checkout -b release/pounding-v2.0.x
  ```

### 验证

- [ ] **AionCore**: `cargo fmt --all -- --check && cargo clippy --workspace -- -D warnings && cargo nextest run --workspace`
- [ ] **AionUi**: `bun run lint && bun run format:check && bunx tsc --noEmit && bunx vitest run`
- [ ] 触发 GitHub Actions `build-and-release.yml` (AionUi) / `release.yml` (AionCore)
- [ ] 验证自动更新 / 登录 / CLI 默认模型同步三大主验收路径
- [ ] 品牌 / 飞书链接旁路检查

### 发布

- [ ] 确认 `electron-builder.yml` publish.owner = halojerry
- [ ] 确认 release tag 格式正确 (e.g. v2.0.2)
- [ ] 触发或等待 CI 构建完成
- [ ] 检查 release assets 完好
- [ ] 发布到 GitHub Releases

## 4. 紧急 Fix 流程（例外）

- [ ] 从 `release/pounding-*` 创建 `fix/*` 分支
- [ ] 修复后开 PR → `release/pounding-*`
- [ ] **必须** maintainer 审批
- [ ] 合并后**必须** back-merge 到 `integration/fork-brand-login-model` 或 `main`
- [ ] 验证 back-merge 无冲突

## 5. AionUi Phase 2 统一（待做）

- [ ] Redesign `build-and-release.yml` 支持 `main` 和 `release/pounding-*`
- [ ] 重写 tag/version 语义，移除 `dev` 专有逻辑
- [ ] 迁移稳定控制分支到 `main`
- [ ] 更新所有 workflow 触发条件
- [ ] 回归验证

## 关键配置清单

| 配置项           | 位置                                    | 值                                 |
| ---------------- | --------------------------------------- | ---------------------------------- |
| publish owner    | `packages/desktop/electron-builder.yml` | `halojerry` ✅                     |
| productName      | `package.json`                          | `POUNDING` ✅                      |
| PR targets       | `.github/workflows/pr-checks.yml`       | `main, dev, release/pounding-*` ✅ |
| upstream mirror  | `upstream-sync/main`                    | 已创建 ✅                          |
| AionCore release | `release/pounding-v0.1.x`               | 已创建 ✅                          |
| AionUi release   | `release/pounding-v2.0.x`               | 已创建 ✅                          |
