# frontend-dev Handoff — Skill-Library — 2026-04-22

**Branch:** `feat/backend-migration-fe-skill-library`
**Last commit (pre-handoff):** `5c92dbf58` (`docs(backend-migration): record skill-library module migration`)
**Repo:** `/Users/zhoukai/Documents/github/AionUi`

## Done

Task 3 (Steps 3.1–3.5) is complete.

### Step 3.1 — Backend binary build & install

- Pulled `aionui-backend:feat/extension-skill-library`, ran
  `cargo build --release` + `cargo install --path crates/aionui-app`.
- `aionui-backend` binary installed at `~/.cargo/bin/aionui-backend`.
  (Note: `cargo` resolved via `/opt/homebrew/opt/rustup/bin/cargo`; the
  install target is on the user's `~/.cargo/bin`, which `binaryResolver.ts`
  picks up via `which aionui-backend` during dev startup.)

### Steps 3.2–3.3 — E1–E5 exercise

Smoke-tested via `curl` against `aionui-backend --local --port 25810`
with a fresh TempDir data-dir. All five endpoints returned the exact
contract documented in `aionui-backend/docs/api-spec/13-extension.md`
(`## Skill Library`) and the backend-dev handoff:

| ID  | Endpoint                         | Observed                                                                                      | Matches spec? |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| E1  | `GET /api/skills`                | `{"success":true,"data":[]}` (empty dir)                                                      | ✅            |
| E2  | `GET /api/skills/builtin-auto`   | `{"success":true,"data":[]}` (missing `_builtin/`)                                            | ✅            |
| E3  | `POST /api/skills/builtin-rule`  | `{"success":true,"data":""}` for missing file                                                 | ✅            |
| E4  | `POST /api/skills/builtin-skill` | `{"success":true,"data":""}` for missing file                                                 | ✅            |
| E5  | `POST /api/skills/info`          | `{"success":false,"error":"Not found: Skill not found: /tmp/nonexistent","code":"NOT_FOUND"}` | ✅            |

Renderer call sites reviewed by code inspection against
`src/common/adapter/ipcBridge.ts:301–329` and confirmed in:

- `src/renderer/pages/settings/SkillsHubSettings.tsx` — calls E1 (line 82) and E2 (line 96).
- `src/renderer/hooks/assistant/useAssistantEditor.ts` — calls E1 and E2 in `handleEdit`, `handleCreate`, `handleDuplicate`, `handleSave` (lines 111, 140, 178–179, 205–206, 211–212, 261).
- `src/renderer/pages/guid/hooks/usePresetAssistantResolver.ts` — calls E3 (line 79) and E4 (line 89).
- `src/renderer/pages/guid/GuidPage.tsx` — calls E2 (line 68).
- `src/common/utils/presetAssistantResources.ts` — calls E3 (line 37) and E4 (line 38), propagated through `deps.readBuiltinRule/Skill` (lines 101, 112).
- `readSkillInfo` (E5) — declared on the renderer contract (`ipcBridge.ts:328`) but no current direct caller in `src/renderer/` or `src/common/`.

No incident files were written. No interface mismatch was found between
the renderer call sites and the backend contract.

### Step 3.4 — Vitest

Ran `bun run test --run` against the assistant/skills test files
(`tests/unit/assistantHooks.dom.test.ts`,
`tests/unit/SkillsHubSettings.dom.test.tsx`,
`tests/unit/initAgent.skills.test.ts`,
`tests/unit/skillSuggestParser.test.ts`,
`tests/unit/skillsMarket.test.ts`,
`tests/unit/assistantPresets.i18n.test.ts`,
`tests/unit/assistantUtils.test.ts`).

**Post-fix:** 7 test files / **106 tests passed, 0 failed**.

Three atomic commits:

| Commit      | Subject                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| `9d27f3a7a` | `test(skills-hub): unwrap detectAndCountExternalSkills mock for HTTP bridge`      |
| `ab06d3a3b` | `test(assistant-hooks): unwrap ipcBridge mocks for HTTP bridge auto-unwrap`       |
| `2289b1e41` | `test(skills): remove stale fsBridge.skills.test.ts covering deleted TS handlers` |

**Full-suite delta:** baseline (`feat/backend-migration`) had 103 failures
/ 4305 passed across 444 test files; this branch has 78 failures / 4313
passed across 443 files — net –25 failures, no regressions. The remaining
78 failures are pre-existing base-branch issues (other stale
`src/process/bridge/*` tests, `shellBridgeStandalone.test.ts`,
`configMigration.test.ts`, and a handful of dom-test flakes) and are
explicitly out of pilot scope per §6.2 of the spec.

### Step 3.5 — Module migration record

`docs/backend-migration/modules/skill-library.md` committed at `5c92dbf58`.

## In flight

None. Steps 3.1–3.6 are complete; this handoff is Step 3.6. After the
commit+push of this file, the frontend-dev task is done.

## Known issues / open questions

1. **Plan mentions `bun run dev` but the actual script is `bun start`.**
   The pilot plan (§3.2) tells the frontend-dev to run `bun run dev`;
   `package.json` only defines `start` (`electron-vite dev`). Plan text
   should be corrected in a follow-up plan revision. Working around this
   did not block the pilot: contract smoke-testing used `curl` directly
   against the standalone backend binary; full Electron-level UI
   exercise is deferred to e2e-tester in Task 4.

2. **E1 returns empty list on the developer's `~/.aionui/` layout.** On
   this machine, `~/.aionui/skills/` contains only the `_builtin/`
   subdirectory (which is filtered by E1's `scan_skill_dirs` because the
   directory itself has no `SKILL.md`). Real production builtin skills
   live under the packaged app resources directory, not under
   `~/.aionui/skills/`. Fine for the backend contract; just means a
   dev-mode smoke test cannot visually confirm "a populated SkillsHub
   list" without either packaging the app or seeding user-dir skills.
   e2e-tester should run against a packaged build if visual confirmation
   is required.

3. **Extension-contributed skills (`source: 'extension'`) are reserved
   but not emitted.** Backend's `list_available_skills` does not yet
   merge `ExtensionRegistry::get_skills()`. The renderer handles the
   three source values correctly in `SkillsHubSettings.tsx:68` (filters
   `extensionSkills` separately) — when the backend starts emitting
   `source: 'extension'`, the UI will surface them automatically with
   zero renderer changes.

4. **`readSkillInfo` (E5) has no direct renderer caller** in the current
   tree. It is declared for future use (likely the Assistant editor's
   "Add Skill by path" flow once that UI surfaces). The endpoint is
   contract-locked and tested on the backend side, so this is fine.

## Next steps for a successor

If another frontend-dev continues, or when module #2 (Assistant-CRUD) starts:

1. **Do not run `bun run dev`** — use `bun start` (or fix the plan first).
2. **Use `aionui-backend --local --port <port> --data-dir <dir>` for
   isolated contract tests** — no auth, no db collision, and supports
   arbitrary data-dirs. `curl` against the endpoints is the fastest
   way to confirm a new endpoint's shape before exercising it in UI.
3. **Always reproduce the renderer mock-unwrap fix pattern** (see the
   two `test(...)` commits on this branch) when old tests mock ipcBridge
   return values as `{ success: true, data: X }`. The HTTP bridge
   auto-unwraps `ApiResponse<T>.data`, so mocks should return plain `T`.
4. **If any new skill-library bug is reported later,** write an
   incident file at
   `docs/backend-migration/incidents/YYYY-MM-DD-<slug>.md` and SendMessage
   the `coordinator` (do NOT SendMessage `backend-dev-2` directly per
   spec §5.3).
5. **E2E-tester is next.** After coordinator switches the AionUi
   working directory to `feat/backend-migration-e2e-skill-library`,
   e2e-tester will grep for `SkillsHub|listAvailableSkills|builtin-rule|builtin-skill|/api/skills`
   in the merged e2e-coverage branch and run those specs against this
   branch's frontend + `feat/extension-skill-library`'s backend.
   If no Skill-Library e2e tests exist, they'll escalate to coordinator
   (plan §4.2).

## Quality checks on exit

- `bun run lint:fix` — clean on all modified files.
- `bun run format` — clean on all modified files.
- `bunx tsc --noEmit` — zero type errors.
- `bun run test --run <skill-scoped paths>` — 106/106 passed.

## Pointer

Branch tip at handoff-write time: `5c92dbf58`. After committing this
handoff, the tip advances one commit; coordinator should read
`git log --oneline origin/feat/backend-migration-fe-skill-library ^origin/feat/backend-migration`
for the full commit set introduced by this role.
