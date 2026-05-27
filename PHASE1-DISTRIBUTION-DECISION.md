# Phase 1 — Release Distribution Decision

**Date:** 2026-05-23
**Sourced from:** RALPLAN Migration/Adoption Sequence, Precondition 3 + Phase 1 Step 10

## Decision: ❌ Distribution explicitly deferred for Phase 1

### Rationale

- Phase 1 scope is branch model setup + branding/custom changes migration + local validation.
- `release-distribute.yml` (COS upload to Tencent Cloud Object Storage) requires:
  1. Successful build artifacts from `build-and-release.yml`
  2. Tencent COS credentials configured in GitHub Secrets
  3. Tag-based release trigger or manual dispatch
- Artifact production and distribution verification are gated on local validation passing first.

### Defer Accept Criteria

- [ ] AionCore: `cargo fmt/clippy/nextest` green on `main`
- [ ] AionUi: `bun lint/format:check/tsc/vitest` green on `main`
- [ ] Manual packaged-path smoke (auto-update / login / CLI model sync)
- [ ] Brand/Feishu smoke pass
- [ ] **Then** cut `release/pounding-*` and run distribution validation

### Risk of deferment

- Low: distribution automation is unchanged from the upstream fork; only publish owner and COS endpoint need verification.
- Mitigation: run a manual tag build in a secondary environment before the first real release.
