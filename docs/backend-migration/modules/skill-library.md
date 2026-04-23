# Module Migration — Skill Library

**Status:** frontend side complete (pending e2e validation)
**Frontend branch:** `feat/backend-migration-fe-skill-library`
**Backend branch:** `feat/extension-skill-library` (in `aionui-backend`)
**Pilot date:** 2026-04-22

## Endpoints migrated

| ID  | Method | Path                        | Renderer API                         | Backend commit | Notes                                                          |
| --- | ------ | --------------------------- | ------------------------------------ | -------------- | -------------------------------------------------------------- |
| E1  | GET    | `/api/skills`               | `ipcBridge.fs.listAvailableSkills`   | `75ab3f1`      | Added `source: 'builtin' \| 'custom' \| 'extension'` field     |
| E2  | GET    | `/api/skills/builtin-auto`  | `ipcBridge.fs.listBuiltinAutoSkills` | `95ab84c`      | Net-new endpoint; scans `<builtin_skills_dir>/_builtin/`       |
| E3  | POST   | `/api/skills/builtin-rule`  | `ipcBridge.fs.readBuiltinRule`       | `5da1b87`      | Returns empty string on missing file; traversal rejected       |
| E4  | POST   | `/api/skills/builtin-skill` | `ipcBridge.fs.readBuiltinSkill`      | `358c364`      | Same graceful-degradation + traversal guard as E3              |
| E5  | POST   | `/api/skills/info`          | `ipcBridge.fs.readSkillInfo`         | `ac1d2dc`      | Empty `name` in frontmatter → falls back to directory basename |

All five endpoints sit behind auth middleware; unauthenticated requests
get 403. Response envelope is `ApiResponse<T>`, auto-unwrapped by the
renderer HTTP bridge.

## Shape changes vs. prior TS baseline

None required at `ipcBridge.ts` level — the renderer declarations at
`src/common/adapter/ipcBridge.ts:301–329` already targeted the HTTP paths
and matched the implemented DTOs:

- E1: `Array<{ name, description, location, isCustom, source: 'builtin' | 'custom' | 'extension' }>` — `source` was already declared on the renderer side; backend added it in commit `75ab3f1` to close the delta.
- E2: `Array<{ name, description }>` — match.
- E3 / E4: `string` (raw file content, empty on missing) — match.
- E5: `{ name, description }` — match.

The HTTP bridge (`src/common/adapter/httpBridge.ts`) auto-unwraps the
`ApiResponse<T>.data` field, so renderer call sites see plain `T`
(identical to the legacy `ipcBridge` return contract).

## Renderer files touched

**No production source changes required** — the renderer had already
migrated to HTTP-based `ipcBridge` declarations. Only test files needed
adaptation to the new HTTP contract.

| File                                        | Change                                                                                       | Commit      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| `tests/unit/SkillsHubSettings.dom.test.tsx` | Unwrap `detectAndCountExternalSkills` mock from legacy `{ success, data }` to plain array    | `9d27f3a7a` |
| `tests/unit/assistantHooks.dom.test.ts`     | Unwrap `getAvailableAgents`, `detectAndCountExternalSkills`, `addCustomExternalPath` mocks   | `ab06d3a3b` |
| `tests/unit/fsBridge.skills.test.ts`        | Deleted — covered removed TS `src/process/bridge/fsBridge.ts` handlers (gone in `5c4b010f5`) | `2289b1e41` |

## Smoke-test results (local, 2026-04-22)

Ran `aionui-backend --local --port 25810 --data-dir /tmp/aionui-smoke-data`
(fresh TempDir) and exercised each endpoint with `curl`:

| Endpoint                         | Response                                                                                      | Expected?                           |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `GET /api/skills`                | `{"success":true,"data":[]}`                                                                  | ✅ empty dir → empty list           |
| `GET /api/skills/builtin-auto`   | `{"success":true,"data":[]}`                                                                  | ✅ missing `_builtin/` → empty list |
| `POST /api/skills/builtin-rule`  | `{"success":true,"data":""}` for missing file                                                 | ✅ graceful-degradation per spec E3 |
| `POST /api/skills/builtin-skill` | `{"success":true,"data":""}` for missing file                                                 | ✅ graceful-degradation per spec E4 |
| `POST /api/skills/info`          | `{"success":false,"error":"Not found: Skill not found: /tmp/nonexistent","code":"NOT_FOUND"}` | ✅ missing path → 404 per spec E5   |

All five endpoints matched the contract documented in
`docs/api-spec/13-extension.md` (backend repo, `## Skill Library` section)
and in the backend-dev handoff. No incident files needed.

## Test impact

- **Target paths** (`tests/unit/assistantHooks.dom.test.ts`,
  `tests/unit/SkillsHubSettings.dom.test.tsx`,
  `tests/unit/initAgent.skills.test.ts`,
  `tests/unit/skillSuggestParser.test.ts`,
  `tests/unit/skillsMarket.test.ts`,
  `tests/unit/assistantPresets.i18n.test.ts`,
  `tests/unit/assistantUtils.test.ts`): **106 passed / 0 failed** post-fix.
- **Full suite baseline (`feat/backend-migration`):** 103 failed / 4305 passed / 444 files.
- **Full suite on this branch:** 78 failed / 4313 passed / 443 files.
- **Net delta:** –25 failures (–1 file from deleting the stale `fsBridge.skills.test.ts`;
  –24 from fixing wrapped-mock patterns in two test files that are not
  themselves in pilot scope but block `vi.mock` resolution for everything
  that imports them).

The remaining 78 failures are pre-existing base-branch issues (other
stale `src/process/bridge/*` tests, `shellBridgeStandalone.test.ts`,
`configMigration.test.ts`, zero renderer/dom flakes) and are out of
pilot scope.

## Known caveats / follow-ups

1. **Extension-contributed skills** are declared on the renderer contract
   (`source: 'extension'`), but the Rust backend's `list_available_skills`
   does not yet merge `ExtensionRegistry::get_skills()` into the response.
   Pilot scope: `Extension` is reserved. Follow-up in the main
   `feat/backend-migration` cycle once extension loading lands on the
   Rust side.

2. **Plan Step 3.1/3.2 discrepancy — `bun run dev` does not exist.** The
   pilot plan says `bun run dev`; the actual script is `bun start`
   (which runs `electron-vite dev`). Plan text should be corrected in a
   follow-up plan revision. This did not block the pilot because contract
   smoke-testing was done via `curl` directly against the running
   backend binary; full Electron-level interactive exercise is deferred
   to the e2e-tester in Task 4.

3. **`~/.aionui/skills/` layout in dev.** On the developer's machine only
   `_builtin/` exists under the user skills dir — no top-level custom
   skills. This makes E1 return an empty array against real data
   (builtin skills live under the bundled app resources, not under
   `~/.aionui/skills/`). Fine for the backend contract, but the
   renderer-level exercise of "see skills in SkillsHub" needs the
   packaged builtin-skills dir, not a dev-mode smoke test.

4. **Other skill-scoped endpoints** (`importSkill`, `deleteSkill`,
   `exportSkillWithSymlink`, `scanForSkills`, `detectAndCountExternalSkills`,
   etc.) are **NOT** in pilot scope — they belong to modules 4 and 5 of
   the decomposition. Their test coverage is still exercised by the
   `SkillsHubSettings.dom.test.tsx` and `assistantHooks.dom.test.ts`
   files; those tests now use the correct HTTP-unwrapped mock shape and
   will continue to work when the underlying endpoints migrate.

## References

- Plan: `docs/backend-migration/plans/2026-04-22-skill-library-pilot-plan.md` (Task 3).
- Spec: `docs/backend-migration/specs/2026-04-22-backend-migration-team-pilot-design.md`.
- Backend handoff: `aionui-backend/docs/backend-migration/handoffs/backend-dev-skill-library-2026-04-22.md`.
- Backend API spec: `aionui-backend/docs/api-spec/13-extension.md` (`## Skill Library` section).

---

## Final pilot outcome (post-Phase-D)

**Status:** pilot closed successfully. Transport/migration layer CLEAN.
**Final e2e result:** 22 PASS / 7 FAIL / 0 skip (29 total in
`tests/e2e/features/settings/skills/`).

### Failure classification

| Class | Count | Tests                                             | Category                                  |
| :---: | :---: | ------------------------------------------------- | ----------------------------------------- |
|   D   |   0   | (5 cleared: TC-S-10, 14, 16, 09, 12)              | Transport/migration ✓ **CLEAN**           |
|   A   |   1   | TC-S-25 (bulk import at N=20)                     | Test-infra state-interaction / pollution |
|   F   |   1   | TC-S-17 (duplicate-path modal)                    | Pre-existing TS contract gap (inherited) |
|   B   |   2   | TC-S-27, TC-S-28 (conditional sections)           | Test-authoring — fixture assumptions     |
|   C   |   1   | TC-S-06 (no builtin skills in sandbox)            | Test-authoring — fixture assumptions     |
|   E   |   2   | TC-S-08, TC-S-15 (matcher collision + state leak) | Test-authoring — exact-match + cleanup   |

**Transport/migration verdict: CLEAN.** All pilot-scope endpoints
(E1–E5) pass end-to-end; the backend `source` field fix on
`ExternalSkillSourceResponse` (commit `3a86d58`) closed the last
transport-layer gap. None of the 7 remaining failures is a regression
from the pilot's own work — they are either pre-existing TS baseline
gaps that migration inherited (F), test-infra state confounds that the
pilot surfaced but doesn't own (A), or test-authoring items that depend
on fixture state the sandbox doesn't guarantee (B/C/E).

### Commit SHAs by role

**Backend (aionui-backend@feat/extension-skill-library):**

| Role        | Commit    | Subject                                                                 |
| ----------- | --------- | ----------------------------------------------------------------------- |
| Spec        | `b2e3c9f` | docs(extension): draft Skill Library API spec for pilot migration       |
| E1          | `75ab3f1` | feat(extension/skills): add source field to GET /api/skills             |
| E2          | `95ab84c` | feat(extension/skills): implement GET /api/skills/builtin-auto          |
| E3 tests    | `5da1b87` | test(extension/skills): HTTP tests for POST /api/skills/builtin-rule    |
| E4 tests    | `358c364` | test(extension/skills): HTTP tests for POST /api/skills/builtin-skill   |
| E5 tests    | `ac1d2dc` | test(extension/skills): HTTP tests for POST /api/skills/info            |
| Spec align  | `686e855` | docs(extension): align Skill Library spec with implementation           |
| Handoff     | `38a216e` | docs(backend-migration): backend-dev handoff for skill-library pilot    |
| Handoff +   | `229b6e0` | docs(backend-migration): add scope breakdown to backend-dev handoff     |
| Phase B fix | `3a86d58` | feat(extension/skills): add source field to ExternalSkillSourceResponse |
| Phase B doc | `274f8ab` | docs(backend-migration): append source-field fix to backend-dev handoff |

**Frontend (AionUi@feat/backend-migration-fe-skill-library):**

| Role       | Commit      | Subject                                                                         |
| ---------- | ----------- | ------------------------------------------------------------------------------- |
| Test fix 1 | `9d27f3a7a` | test(skills-hub): unwrap detectAndCountExternalSkills mock for HTTP bridge      |
| Test fix 2 | `ab06d3a3b` | test(assistant-hooks): unwrap ipcBridge mocks for HTTP bridge auto-unwrap       |
| Test cull  | `2289b1e41` | test(skills): remove stale fsBridge.skills.test.ts covering deleted TS handlers |
| Module rec | `5c92dbf58` | docs(backend-migration): record skill-library module migration                  |
| Handoff    | `316f63beb` | docs(backend-migration): frontend-dev handoff for skill-library pilot           |

**Frontend E2E helper fix (AionUi@feat/backend-migration-e2e-skill-library):**

| Role       | Commit      | Subject                                                                  |
| ---------- | ----------- | ------------------------------------------------------------------------ |
| Trace gate | `cfdec9655` | chore(e2e): gate trace retention behind E2E_TRACE env var                |
| Helpers    | `000676801` | test(e2e/helpers): migrate skills helpers from legacy IPC to HTTP bridge |
| PATH doc   | `aa8042fa3` | docs(e2e): note aionui-backend must be on PATH for tests                 |
| Handoff    | `21cf93c6b` | docs(backend-migration): frontend-dev handoff for e2e helper fix         |

**E2E-tester (AionUi@feat/backend-migration-e2e-skill-library):**

| Role        | Commit      | Subject                                                                          |
| ----------- | ----------- | -------------------------------------------------------------------------------- |
| Report v1   | `028a560ca` | docs(backend-migration): e2e report for skill-library pilot                      |
| Handoff v1  | `1e0c0b3b6` | docs(backend-migration): e2e-tester handoff for skill-library pilot              |
| Handoff v1a | `ee42e50d3` | docs(backend-migration): add recommended follow-up section to e2e-tester handoff |
| Rerun       | `09036a925` | docs(backend-migration): append rerun results to skill-library e2e report        |
| Rerun h/o   | `497999516` | docs(backend-migration): update e2e-tester handoff with rerun outcome            |
| Phase B     | `ffa8852e0` | docs(backend-migration): append Phase B rerun results to e2e report and handoff  |
| Phase D     | `76294e7fd` | docs(backend-migration): Phase D trace findings and closure recommendation       |

### Handoff files

All teammate handoffs are on the corresponding branches; paths relative
to each repo root:

- **backend-dev:** `aionui-backend/docs/backend-migration/handoffs/backend-dev-skill-library-2026-04-22.md`
- **frontend-dev (Task 3):** `docs/backend-migration/handoffs/frontend-dev-skill-library-2026-04-22.md`
- **frontend-dev (Task 4-fix e2e helpers):** `docs/backend-migration/handoffs/frontend-dev-e2e-helper-fix-2026-04-22.md`
- **e2e-tester:** `docs/backend-migration/handoffs/e2e-tester-skill-library-2026-04-22.md`
- **coordinator (Task 5):** to be written at closure; path will be
  `docs/backend-migration/handoffs/coordinator-skill-library-2026-04-22.md`.

### E2E reports + post-pilot followups

- **E2E report (all phases):** `docs/backend-migration/e2e-reports/2026-04-22-skill-library.md`.
  Contains the first-run 0/29 FAIL diagnosis, helper-fix rerun 17/12,
  Phase B clean-state 22/7, and Phase D trace findings + closure
  recommendation.
- **Post-pilot followup ticket list:** `docs/backend-migration/post-pilot/2026-04-23-skill-library-followups.md`.
  Concrete P0/P1/P2 items for module-2 prerequisites and deferred work.

---

## Built-in Skill Migration — 2026-04-23

Scope: move built-in skill resources from AionUi frontend (`src/process/resources/skills/`) to the Rust backend. Embed via `include_dir!`. Rename `_builtin/` → `auto-inject/`. Frontend `AcpSkillManager` and gemini CLI wiring all route through HTTP; frontend never touches skill files.

**Feature branches (no PRs raised per user instruction):**

| Branch | Repo | Final SHA |
|---|---|---|
| `feat/backend-migration-builtin-skills` | AionUi | `ff5290db5` |
| `feat/builtin-skills` | aionui-backend | `04f1537` |

### Endpoints added

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/skills/materialize-for-agent` | Write a conversation's skill bundle to `{data_dir}/agent-skills/{conversationId}/`, return absolute dir path. Flat layout: `{target}/{name}/SKILL.md`, auto-inject unconditional, opt-in overwrites on collision. |
| DELETE | `/api/skills/materialize-for-agent/{conversationId}` | Idempotent cleanup. |

### Endpoints modified (contract additions)

- `GET /api/skills/builtin-auto` — response entries gain `location` field (relative path like `"auto-inject/cron/SKILL.md"`).
- `GET /api/skills` — `source=builtin` rows gain optional `relativeLocation` field (for HTTP body reads); `location` synthesizes an absolute-style path under `{data_dir}/builtin-skills-view/` for the export-symlink flow.
- `POST /api/skills/builtin-skill` — `fileName` now accepts the `auto-inject/` prefix.
- All camelCase on the wire enforced via `#[serde(rename_all = "camelCase")]` on 21 of 22 skill.rs derive blocks (H1 hotfix).

### Constant rename

`BUILTIN_AUTO_SKILLS_SUBDIR: &str = "_builtin"` → `"auto-inject"` in `aionui-extension/constants.rs`. All downstream callers updated.

### Built-in skill corpus

- Location at compile time: `aionui-backend/crates/aionui-app/assets/builtin-skills/`
- 23 skills total (4 auto-inject + 19 opt-in)
- Embedded into the binary via `include_dir!`. `AIONUI_BUILTIN_SKILLS_PATH` env var overrides with disk path (E2E/dev).

### Invariants established

- Frontend `src/process/resources/skills/` deleted. `grep -rnE '"_builtin"|/_builtin|_builtin/' src/` returns zero production hits.
- Frontend code no longer reads skill files; all skill access is HTTP through `ipcBridge.fs.*`.
- Gemini CLI gets a pre-materialized skill dir path from the backend; never scans for skill files itself.
- Packaging: `aionui-backend` binary self-contained — no sibling `assets/` directory required. Verified via release-binary smoke in a fresh tempdir.

### Tests

| Suite | Count | Location |
|---|---|---|
| Rust inline unit (aionui-extension::skill_service) | +13 new | `crates/aionui-extension/src/skill_service.rs` |
| Rust HTTP integration | +14 new | `crates/aionui-app/tests/skills_builtin_e2e.rs` |
| Rust wire-shape regression (camelCase + snake-case rejection) | +multiple per type | `crates/aionui-api-types/src/skill.rs` |
| Frontend Vitest | +11 new | `tests/unit/acpSkillManager.test.ts`, `tests/unit/initAgent.materialize.test.ts` |
| Playwright E2E | 8 scenarios | `tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts` |

### Hotfix in flight

- **H1** (`04f1537`): T3 run-1 found 3 of 8 scenarios failing because 19 of 22 public skill.rs derive blocks lacked `#[serde(rename_all = "camelCase")]`. Backend-dev audited the whole file (`3 → 21` rename_all attrs) + added regression-guard tests. T3 run-2 passed 8/8 in 13.5s.

### Lessons (see playbook)

- `stat -f` on a symlink reports link-mtime not target-mtime; use `stat -L` or `readlink` for `~/.cargo/bin/aionui-backend` freshness checks.
- camelCase on the wire is a project-wide invariant; a linter would prevent this class of reactive hotfixes.
- Packaging smoke (release binary in fresh tempdir) is a worthwhile standalone step for any pilot touching asset delivery.
