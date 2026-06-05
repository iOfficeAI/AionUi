# Maintainer Checklist — POUNDING Fork (AionUi)

## 1. Upstream Sync

- [ ] `git fetch upstream`
- [ ] `git checkout upstream-sync/main && git merge upstream/main`
- [ ] Resolve conflicts, push to `origin upstream-sync/main`

## 2. Daily Dev

- [ ] Branch from `main`: `git checkout main && git checkout -b feat/my-change`
- [ ] PR back to `main` (triggers PR Checks)

## 3. Release

- [ ] `git checkout -b release/pounding-v2.0.x main`
- [ ] Run: `bun run lint && bun run format:check && bunx tsc --noEmit && bunx vitest run`
- [ ] Verify primary acceptance: auto-update / login / CLI model sync
- [ ] Smoke-check: brand hiding / Feishu links
- [ ] Tag and trigger build-and-release workflow

## 4. Hotfix

- [ ] `fix/*` → PR to `release/pounding-*`, must back-merge to `main`
- [ ] Requires maintainer approval

## 5. Phase 2 Prerequisites

- [ ] Redesign `build-and-release.yml` for `main`/`release/pounding-*`
- [ ] Move away from `dev`-centric automation
- [ ] Unify stable branch model

## Config Check

| Item            | Value                           | Status |
| --------------- | ------------------------------- | ------ |
| publish owner   | `halojerry`                     | ✅     |
| productName     | `POUNDING`                      | ✅     |
| PR targets      | `main, dev, release/pounding-*` | ✅     |
| upstream mirror | `upstream-sync/main`            | ✅     |
| release branch  | `release/pounding-v2.0.x`       | ✅     |
