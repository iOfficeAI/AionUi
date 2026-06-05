# Known Gaps — Phase 1 (to be resolved in Phase 5)

## Gap 1: build-and-release.yml 手动 release 不一致

**位置:** `.github/workflows/build-and-release.yml`

**问题:** `workflow_dispatch` 支持传 `inputs.ref`，但以下 job 的 `actions/checkout` 没有用这个 ref：

- line 46: `code-quality` job → 走默认 ref
- line 176: tag/create-release job → 走默认 ref
- line 310: distribute job → 走默认 ref

**影响:** 手动触发时，构建、打 tag、分发可能用不同的代码版本。

**修复:** 在 Phase 5 重写 workflow 时统一所有 checkout 使用 `inputs.ref`。

---

## Gap 2: AionUi 仍偏 dev-centric

**位置:** `build-and-release.yml`, `BRANCH-GOVERNANCE.md`

**问题:** 文档说 main/dev 同步、release/\* 冻结，但构建发布仍主要围绕 `dev` 触发。

- `code-quality` job: `github.ref == 'refs/heads/dev'` 触发，没有 `release/pounding-*`
- tag 和 release 逻辑都在 `dev` 分支下

**影响:** 流程依赖人工同步，主线/发布线可能漂移。

**修复:** Phase 5 重写 workflow，从 `dev` 中心迁移到 `main`/`release/pounding-*` 双线模型。

---

## Gap 3: release/pounding-\* CI 覆盖不全

**位置:** 所有 `.github/workflows/*.yml`

**问题:**

- `build-and-release.yml` 没有 `release/pounding-*` 触发
- `pr-checks.yml` 已加 ✅

**影响:** 发布冻结分支的 hotfix PR 现在有 PR 校验，但推送不会触发构建。

**修复:** Phase 5 决定是否给 `release/pounding-*` 加 CI 覆盖。
