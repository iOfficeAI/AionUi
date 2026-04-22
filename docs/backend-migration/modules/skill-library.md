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
