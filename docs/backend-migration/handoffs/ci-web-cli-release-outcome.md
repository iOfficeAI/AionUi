# CI Web-CLI Release Integration — Handoff

**Date:** 2026-05-08
**Scope:** 把 `aionui-web` tarball / `install-web.sh` 接入主 release 流程

## 改动摘要

- `.github/workflows/pack-web-cli.yml`:触发改 `workflow_call`,删除 `feat/m8-web-cli-tarball` 分支绑定;加 `ref` / `append_commit_hash` 入参;pack-web-cli 和 prepare-install-script job 各加 `Get commit hash` step,upload 的 artifact name 按 `append_commit_hash` 条件化
- `.github/workflows/build-and-release.yml`:新增 `pack-web-cli` 并行 job(与 `build-pipeline` 同触发条件、同 secrets);`release.needs` 追加 `pack-web-cli`,`release.if` 增加 `needs.pack-web-cli.result == 'success'`;`release.files` 追加 `tar.gz` / `sha256` / `install-web.sh` 三行
- `scripts/prepare-release-assets.sh`:新增 1b(tarball + sha256 归集)、1c(install-web.sh 归集)、5b(硬校验 5×2 tarball + 5 sha256 + install-web.sh)三节
- `.github/workflows/_build-reusable.yml`:桌面 upload 前加 `Verify desktop asar isolation` step,用 `@electron/asar list | grep -cE '^/packages/web-cli(/|$)'` 做精确前缀匹配,>0 则 fail

## 每次 release 产出的新 asset(共 11 个)

```
aionui-web-<ver>-darwin-arm64.tar.gz       + .sha256
aionui-web-<ver>-darwin-x86_64.tar.gz      + .sha256
aionui-web-<ver>-linux-arm64.tar.gz        + .sha256
aionui-web-<ver>-linux-x86_64.tar.gz       + .sha256
aionui-web-<ver>-win-x86_64.tar.gz         + .sha256
install-web.sh
```

现有 14 个桌面 asset(8 个安装包 + 6 个 updater yml)完全不变,新增 11 个 web-cli asset。

## 设计权衡与注意事项

### 依赖关系:pack-web-cli 和 create-tag 并行,不互相等待

`pack-web-cli` 与 `build-pipeline` 同为 release 的前置 needs,但**均不 block `create-tag`**。这意味着:

- 理论极端场景:dev 分支 push 后 `build-pipeline` 成功、`create-tag` 推了 tag,但 `pack-web-cli` 失败 → `release` 跳过 → dev tag 已推但无 release
- 处理:`gh release delete` 或人工 rerun `pack-web-cli` 后重跑 `release` job

此设计选择的理由:把 `pack-web-cli` 也挂进 `create-tag.needs` 会让桌面产物出完但无法建 tag,反而更糟。tag 建好但 release 缺失是可自愈状态(rerun / manually create release)。

### 产物命名不改

- aionui-web 沿用 `darwin/x86_64` 命名(`pack-web-cli.js:14-15`)
- 桌面沿用 `mac/x64` 命名(electron-builder 配置)
- 两套命名并存,刻意不合并,避免破坏 v1.9.25 及之前用户的 updater 链路

## 未解决的 TODO

- **单元测试(`bunx vitest run`)恢复** ✅ **DONE (N5 恢复于 2026-05-09)**:3 个 workflow 中被临时注释的 `bunx vitest run` 已在 N5 里程碑恢复(commit 5ea238139)。N1-N4 完成死代码清理 + 60 个新测试文件后,720 tests 全绿,CI 门禁已重新激活。详见 `docs/backend-migration/handoffs/N5-outcome.md`
- **bundled-bun runtime 代码未清理**:backend 已自带 bun runtime,`prepareBundledBun` 在打包链上已全线移除(脚本/test/electron-builder/vitest/CI step 均已删除)。**仅剩 `packages/desktop/src/process/utils/shellEnv.ts:34-42` 的 `getBundledBunDir()` 及其 2 处 consumer**(行 416-418 / 565-567)需要后续确认 backend 真的提供 bun 后一并移除。
  - 当前行为:`getBundledBunDir()` 在 dmg 里找不到 `resources/bundled-bun/`,返回 null,consumer 自动 fallback 到系统 PATH,**不 crash**
  - `.gitignore:201` 的 `resources/bundled-bun` 条目保留,防止本地 dev 误提交这个目录
- **`AIONUI_BACKEND_ALLOW_MISSING='1'` 仍硬编码**(`_build-reusable.yml:312`、`pack-web-cli.js:32` 通过 env):等 `iOfficeAI/aionui-backend` 的 Release CI 稳定后,改为按分支区分(main / tag 硬失败,feature 分支放行)。届时全仓搜 `AIONUI_BACKEND_ALLOW_MISSING` 一次性清理
- ~~`bin/aionui-web.js` 的 shebang 依赖~~:**已解决**。现在 tarball 里是 `bun build --compile` 产的单文件 mach-o/ELF/PE 可执行,~60MB,自包含 bun runtime,用户无需 Node。入口改为 `./aionui-web`(不是 `.js`)
- **Windows tarball 用 `.tar.gz` 而非 `.zip`**:与设计文档 G 节 `*.zip` 的描述有出入,以 `pack-web-cli.js` 现有行为为准
- **本地 dry-run 脚本无法在 macOS 默认 bash 3.2 跑**:`prepare-release-assets.sh` 用了 `mapfile`,需要 bash 4+。CI(ubuntu-latest)上是 bash 5,不受影响;本地验证请用 homebrew bash 或 Docker

## 验收记录

在 `feat/backend-migration` 分支推测试 tag `v0.0.0-ci-wire-test` 验证:

- [ ] release draft 同时含 14 个桌面 asset + 11 个 web-cli asset
- [ ] `asar list` 校验 step 在桌面矩阵每个平台执行且通过
- [ ] 产物命名与本文档"新 asset"清单完全一致
- [ ] 验收完毕后 `gh release delete v0.0.0-ci-wire-test --yes && git push --delete origin v0.0.0-ci-wire-test`
