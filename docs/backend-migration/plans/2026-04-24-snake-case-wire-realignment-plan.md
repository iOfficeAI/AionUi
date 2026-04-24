# Snake-Case Wire Realignment — Implementation Plan

> **Team mode** — coordinator + parallel teammates. Smaller scope than
> builtin-skill pilot: undo H1's directional mistake + flip the frontend's
> camelCase wire fields, no new features.
>
> **Companion specs:**
> - [`aionui-backend/docs/backend-migration/specs/2026-04-24-snake-case-wire-realignment-design.md`](../../../../aionui-backend/docs/backend-migration/specs/2026-04-24-snake-case-wire-realignment-design.md) — authoritative contract
> - [`AionUi/docs/backend-migration/specs/2026-04-24-snake-case-wire-realignment-design.md`](../specs/2026-04-24-snake-case-wire-realignment-design.md) — frontend changes

**Goal:** Realign the builtin-skill pilot's wire surface with the
project-wide snake_case convention (`origin/main` `dae96f8`). Remove 21
`rename_all = "camelCase"` from `skill.rs`; flip 18+ backend tests; flip
5 frontend field-naming sites + their Vitest; rerun Playwright.

**Team size:** 1 coordinator + 3 role-teammates (backend-dev, frontend-dev,
e2e-tester). No backend-tester / frontend-tester — scope is mechanical
naming flips, devs self-test.

---

## Branches

| Branch | Repo | Base | Owner(s) |
| --- | --- | --- | --- |
| `feat/backend-migration-coordinator` | AionUi | (existing) | coordinator |
| `feat/backend-migration-builtin-skills` | AionUi | current tip (has merge 259505156) | frontend-dev, e2e-tester |
| `feat/builtin-skills` | aionui-backend | current tip (has merge 0fbccd6) | backend-dev |

No new branches — extend existing ones.

---

## Task graph

```
T0 (coordinator setup)
 │
 ▼
T1 (backend-dev: remove rename_all=camelCase from skill.rs, flip 18+ tests,
     verify skills_builtin_e2e + assistants_e2e green, cargo build to
     refresh symlink)
 │
 ▼
T2 (frontend-dev: flip 5 field-naming sites in ipcBridge + AcpSkillManager +
     initAgent + GeminiAgentManager + ConversationServiceImpl, update Vitest
     mocks, tsc+lint clean)
 │
 ▼
T3 (e2e-tester: rerun Playwright 8 scenarios against the realigned pair,
     audit any payload assertions for camelCase residue, flip if found)
 │
 ▼
T4 (coordinator closure: merge, module log, handoff)
```

Critical path: T0 → T1 → T2 → T3 → T4. T2 STRICTLY depends on T1 (sending
snake_case body before backend accepts it → 400 everywhere).

---

## Task 0 — Coordinator setup

**Owner:** coordinator.

- [ ] **0.1** Commit spec + plan to `feat/backend-migration-coordinator`; push.
- [ ] **0.2** Create team `aionui-snake-case-realign`.
- [ ] **0.3** Register T1–T4. Dependencies: T2 blocks T1, T3 blocks T2, T4 blocks T3.
- [ ] **0.4** Spawn backend-dev on T1 with short prompt per playbook.

No new feature branches needed; teammates work on the existing branches.

---

## Task 1 — Backend realignment

**Owner:** backend-dev. **Branch:** `feat/builtin-skills` (aionui-backend).

Working dir: `/Users/zhoukai/Documents/github/aionui-backend`

### 1.1 Claim

- [ ] `TaskList`, `TaskGet taskId=<T1>`, `TaskUpdate in_progress owner=backend-dev`
- [ ] SendMessage team-lead "alive on T1"

### 1.2 Pull latest

- [ ] `cd /Users/zhoukai/Documents/github/aionui-backend && git checkout feat/builtin-skills && git pull --ff-only`
- [ ] `grep -c 'rename_all = "camelCase"' crates/aionui-api-types/src/skill.rs` → should report 21

### 1.3 Remove camelCase serde attrs

- [ ] Remove all 21 occurrences of `#[serde(rename_all = "camelCase")]` from `crates/aionui-api-types/src/skill.rs`. Mechanical.
- [ ] Verify: `grep -c 'rename_all = "camelCase"' crates/aionui-api-types/src/skill.rs` → 0

### 1.4 Flip the 18 tests added by H1

- [ ] Tests listed in backend spec §4.2 — flip each to snake_case assertions
- [ ] Regression guards that currently reject `file_name` now reject `fileName`; rename guards accordingly (`test_read_builtin_resource_request` etc.)
- [ ] Rename `test_materialize_response_serializes_camel` → `test_materialize_response_serializes_snake` and flip assertion from `json["dirPath"]` to `json["dir_path"]`
- [ ] `test_skill_list_item_deserializes_camel_case` — rename and flip similarly

### 1.5 Audit skills_builtin_e2e.rs

- [ ] `grep -E '"(conversationId|enabledSkills|dirPath|relativeLocation|isCustom|fileName)":' crates/aionui-app/tests/skills_builtin_e2e.rs` → any hit must flip to snake_case
- [ ] `grep -E '(\.conversationId|\.enabledSkills|\.dirPath|\.relativeLocation|\.isCustom)' crates/aionui-app/tests/skills_builtin_e2e.rs` → Rust-side struct access uses field names (unchanged by rename_all removal, field names were always snake_case in Rust). No change needed.

### 1.6 Gates

- [ ] `cargo fmt --all -- --check` clean
- [ ] `cargo test -p aionui-api-types` — 18+ flipped tests pass; whole crate 451+ passing
- [ ] `cargo test --test skills_builtin_e2e` 14/14 green
- [ ] `cargo test --test assistants_e2e` 44/44 green
- [ ] `cargo clippy --workspace -- -D warnings` — pre-existing red elsewhere is fine; no new warnings from skill.rs changes

### 1.7 Live probe confirmation

- [ ] Build release + launch in tempdir:
  ```
  cargo build --release
  TMP=$(mktemp -d)
  target/release/aionui-backend --local --port 25908 --data-dir "$TMP/data" &
  ```
- [ ] Run both snake + camel probes to confirm direction flipped:
  ```
  # Should now return 200
  curl -s -X POST http://127.0.0.1:25908/api/skills/builtin-skill \
    -H 'Content-Type: application/json' -d '{"file_name":"auto-inject/cron/SKILL.md"}' | head -c 100
  # Should now return 400
  curl -s -X POST http://127.0.0.1:25908/api/skills/builtin-skill \
    -H 'Content-Type: application/json' -d '{"fileName":"auto-inject/cron/SKILL.md"}'
  # Same for materialize
  curl -s -X POST http://127.0.0.1:25908/api/skills/materialize-for-agent \
    -H 'Content-Type: application/json' -d '{"conversation_id":"probe","enabled_skills":[]}'
  # Response check
  curl -s http://127.0.0.1:25908/api/skills | python3 -c "import json,sys; r=json.load(sys.stdin)['data'][0]; print(sorted(r.keys()))"
  # Expected: ['description', 'is_custom', 'location', 'name', 'relative_location', 'source']
  ```

### 1.8 Commit + push + refresh

- [ ] `git add -A`
- [ ] Commit: `fix(skill): revert H1 — realign skill.rs wire format to project-wide snake_case convention (dae96f8)`
- [ ] `git push`
- [ ] `cargo build` (debug) to refresh `~/.cargo/bin/aionui-backend`
- [ ] SendMessage team-lead with SHA and probe results

### 1.9 Progress reporting (MANDATORY)

- [ ] SendMessage team-lead every ~10 min. Silence ≥ 10 min → zombie replacement without notice.

---

## Task 2 — Frontend realignment

**Owner:** frontend-dev. **Branch:** `feat/backend-migration-builtin-skills` (AionUi). **Depends on:** T1.

Working dir: `/Users/zhoukai/Documents/github/AionUi`

### 2.1 Claim + sync

- [ ] Task claim + alive ping
- [ ] `git pull origin feat/backend-migration-builtin-skills`
- [ ] Pull latest backend: `cd /Users/zhoukai/Documents/github/aionui-backend && git pull && cargo build` (refresh symlink)

### 2.2 Flip ipcBridge signatures

- [ ] In `src/common/adapter/ipcBridge.ts`:
  - `listAvailableSkills` response row fields: `relativeLocation` → `relative_location`, `isCustom` → `is_custom`
  - `materializeSkillsForAgent` request body: `conversationId` → `conversation_id`, `enabledSkills` → `enabled_skills`
  - `materializeSkillsForAgent` response: `dirPath` → `dir_path`

- [ ] `readBuiltinRule` and `readBuiltinSkill`: already use `file_name`, leave alone.

### 2.3 Flip AcpSkillManager

- [ ] In `src/process/task/AcpSkillManager.ts`:
  - `SkillDefinition` type and any interface that carries `relativeLocation` / `isCustom` — rename fields
  - All field-access sites: `skill.relativeLocation` → `skill.relative_location`, `skill.isCustom` → `skill.is_custom`
  - Line 341 `{ file_name: skill.location }` — leave alone (already correct)

### 2.4 Flip initAgent + callers

- [ ] `src/process/utils/initAgent.ts` — call site that invokes `materializeSkillsForAgent`:
  ```ts
  const { dir_path: dirPath } = await ipcBridge.fs.materializeSkillsForAgent.invoke({
    conversation_id: conversationId,
    enabled_skills: enabledSkills,
  });
  ```
- [ ] `src/process/task/GeminiAgentManager.ts` — if any explicit object key used for the invoke payload (not just variable shorthand), flip.
- [ ] `src/process/services/conversation/ConversationServiceImpl.ts` — cleanup call, same audit.

### 2.5 Flip Vitest mocks

- [ ] `tests/unit/acpSkillManager.test.ts`:
  - Mock `listBuiltinAutoSkills.invoke` response items — keep `location` (it's already lowercase, no change)
  - Mock `listAvailableSkills.invoke` response items — use snake_case keys (`relative_location`, `is_custom`)
  - Assert `skill.relative_location` / `skill.is_custom` access sites
- [ ] `tests/unit/initAgent.materialize.test.ts`:
  - Mock `materializeSkillsForAgent.invoke` return value: `{ dir_path: '/tmp/x' }`
  - Assertion on invoke argument shape: `{ conversation_id: ..., enabled_skills: ... }`

### 2.6 Audit for residue

- [ ] `grep -nE "(relativeLocation|isCustom|dirPath|conversationId|enabledSkills)" src/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v '\.test\.'`
  - Expected: only `conversationId` / `enabledSkills` camelCase survivals in places where they're NOT wire-body (e.g. internal TS parameter names, loop variables — fine). Wire-body usages flipped.
- [ ] If grep returns any wire-body hit, flip it.

### 2.7 Gates

- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run lint --quiet` — baseline unchanged
- [ ] `bun run test --run tests/unit/acpSkillManager.test.ts tests/unit/initAgent.materialize.test.ts` — green
- [ ] Full suite: `bun run test --run` — baseline unchanged (no NEW failures vs current)

### 2.8 Commit + push + handoff

- [ ] `git add -A`
- [ ] Commit: `refactor(skill): flip pilot-new field names to snake_case to match backend realignment`
- [ ] `git push`
- [ ] SendMessage team-lead with SHA. e2e-tester unblocked.

### 2.9 Progress reporting

- [ ] Every ~10 min.

---

## Task 3 — E2E rerun

**Owner:** e2e-tester. **Branch:** `feat/backend-migration-builtin-skills`. **Depends on:** T2.

### 3.1 Claim + sync

- [ ] Task claim + alive
- [ ] `git pull`
- [ ] Verify `~/.cargo/bin/aionui-backend` target freshness: `stat -Lf "%Sm" ~/.cargo/bin/aionui-backend` — must reflect T1's build
- [ ] `bunx electron-vite build` — refresh renderer bundle

### 3.2 Audit E2E payload assertions

- [ ] `grep -nE "(relativeLocation|isCustom|dirPath|conversationId|enabledSkills)" tests/e2e/features/builtin-skill-migration/` — any hit inside response/request body assertions must flip to snake_case.
- [ ] URL path parameters that happen to be named `conversationId` at the TypeScript level are fine (URL path is a string, not a body field).

### 3.3 Rerun suite

- [ ] `bun run test:e2e tests/e2e/features/builtin-skill-migration/`
- [ ] Expected: 8/8 green (mirrors T3 run-2 state pre-realign, just flipped to snake_case on the wire).

### 3.4 Outcome routing

- [ ] All green: SendMessage team-lead "T3 clean, shipping to T4". TaskUpdate completed.
- [ ] Class D or F: hold, report, route back to backend-dev or frontend-dev.

### 3.5 Report

- [ ] Update `docs/backend-migration/e2e-reports/2026-04-23-builtin-skill-migration.md` with a "Run 3 — post-realign" section documenting the flip and the 8/8 result.
- [ ] Commit + push.

---

## Task 4 — Coordinator closure

**Owner:** coordinator. **Depends on:** T3.

- [ ] **4.1** Merge feat/backend-migration-builtin-skills into feat/backend-migration-coordinator and push.
- [ ] **4.2** Packaging smoke (release binary + tempdir, same recipe as builtin-skill pilot T4) — verify `/api/skills/builtin-auto` and `/api/skills/builtin-skill` with snake_case bodies work end-to-end.
- [ ] **4.3** Write handoff `docs/backend-migration/handoffs/coordinator-snake-case-realignment-2026-04-24.md`.
- [ ] **4.4** Append module log to `modules/skill-library.md` with "Snake-Case Realignment 2026-04-24" section. Record the H1 mis-direction as a lesson.
- [ ] **4.5** Shutdown teammates, TeamDelete.
- [ ] **4.6** Final summary to user.

No PRs per user convention.

---

## Coordinator operational rules (from playbook)

1. Zombie replacement is autonomous — no user confirmation.
2. 10-min spot check when actively waiting.
3. ACK every completion within one coordinator turn.
4. Spawn prompt ≤ 40 lines; mandatory 10-min progress reports.
5. Backend-dev's live probe in §1.7 is the "trust but verify" step — coordinator may repeat it post-T1.

---

## Success Criteria

- [ ] `grep -c 'rename_all = "camelCase"' aionui-backend/crates/aionui-api-types/src/skill.rs` returns 0
- [ ] Live probe: `file_name` / `conversation_id` / `enabled_skills` all accepted (200); camelCase variants rejected (400)
- [ ] `GET /api/skills` response row keys: `['description', 'is_custom', 'location', 'name', 'relative_location', 'source']`
- [ ] Frontend Vitest baseline unchanged; TSC + lint clean
- [ ] Playwright 8/8 green
- [ ] Coordinator handoff committed; module log appended
