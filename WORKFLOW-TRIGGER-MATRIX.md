# Workflow → Branch Trigger Matrix

## AionCore

| Workflow             | Current Trigger  | Branches | Phase 1 Status       | Phase 2 Action                         |
| -------------------- | ---------------- | -------- | -------------------- | -------------------------------------- |
| `ci.yml`             | push/PR → `main` | `main`   | ✅ OK — main-centric | Add `release/pounding-*` if CI desired |
| `release-please.yml` | (needs check)    | `main`   | ✅ OK                | Keep main                              |
| `release.yml`        | tag `v*`         | Any tag  | ✅ OK — tag-driven   | No change                              |

**Verdict for Phase 1:** No workflow changes needed. AionCore is already `main`-centric.

## AionUi

| Workflow                 | Current Trigger               | Branches      | Phase 1 Status                  | Phase 2 Action                          |
| ------------------------ | ----------------------------- | ------------- | ------------------------------- | --------------------------------------- |
| `build-and-release.yml`  | push → `dev`, tags            | `dev`         | ✅ OK — dev-centric per plan    | Redesign to `main`/`release/pounding-*` |
| `pr-checks.yml`          | PR → `main`, `dev`            | `main`, `dev` | ⚠️ Missing `release/pounding-*` | Add `release/pounding-*` to PR targets  |
| `_build-reusable.yml`    | (called by build-and-release) | N/A           | ✅ OK                           | Update caller when redesigning          |
| `pr-e2e-artifacts.yml`   | workflow_dispatch             | manual        | ✅ OK                           | Keep                                    |
| `release-distribute.yml` | workflow_run                  | releases      | ✅ OK                           | Verify distribution target              |
| `bump-homebrew.yml`      | release published             | releases      | ⚠️ Verify fork homebrew path    | Update formula path                     |
| `build-manual.yml`       | workflow_dispatch             | manual        | ✅ OK                           | Keep                                    |

**Verdict for Phase 1:** Minimal changes needed:

1. `pr-checks.yml` — add `release/pounding-*` to PR branch targets
2. `electron-builder.yml` — publish owner already fixed ✅

**Phase 2 prerequisites for AionUi unification:**

1. `build-and-release.yml` must support building from `main` and/or `release/pounding-*`
2. Tagging/version semantics redesigned away from `dev`-only auto-bump
3. PR checks + branch protections explicitly include `release/pounding-*`
