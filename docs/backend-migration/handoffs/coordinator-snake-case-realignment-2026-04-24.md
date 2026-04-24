# Coordinator Handoff — Snake-Case Wire Realignment — 2026-04-24

**Coordinator branch (AionUi):** `feat/backend-migration-coordinator` — this commit
**Feature branch (AionUi):** `feat/backend-migration-builtin-skills` @ `64bddde5c`
**Feature branch (aionui-backend):** `feat/builtin-skills` @ `326e228`
**PRs:** Per user instruction — none raised.

## What shipped

Reverted H1 (`04f1537`)'s directional mistake on the builtin-skill pilot.
Removed all 21 `#[serde(rename_all = "camelCase")]` attributes from
`aionui-backend/crates/aionui-api-types/src/skill.rs`. Flipped 18+ backend
tests to assert snake_case. Audited + flipped 13 JSON-body keys in
`skills_builtin_e2e.rs` and 14 in `assistants_e2e.rs`. On the frontend,
flipped `listAvailableSkills` response shape, `materializeSkillsForAgent`
request + response, plus `AcpSkillManager` / `initAgent` access sites, plus
incidentally the narrowed `SkillInfo` types in `SkillsHubSettings.tsx` and
`AssistantSettings/types.ts`. E2E Playwright suite rerun 8/8 green on the
realigned pair.

## Why

H1 was landed during the T3 run-1 of the builtin-skill pilot to fix a
contract mismatch. I mis-diagnosed the fix direction: I asked backend-dev
to make skill.rs accept camelCase. `origin/main`'s `dae96f8`
("refactor: remove camelCase serde rename from all aionui-api-types
structs") had already established snake_case as the project-wide wire
convention. My H1 created a camelCase island inside an otherwise
snake_case project. Subsequent main→feat merges didn't clean it up
(the merge's `--theirs` resolution only touched 4 text conflicts; skill.rs
camelCase attrs were non-conflicting additions). Frontend merge from
`feat/backend-migration` brought over snake_case for most fields but kept
camelCase on fields the pilot introduced (materialize, relativeLocation,
isCustom, dirPath). Live probes confirmed the mis-alignment end-to-end.

## Role deliverables

| Role | Final SHA | Deliverable |
|---|---|---|
| coordinator | this commit | spec, plan, merge, packaging smoke, this handoff |
| backend-dev | `326e228` | T1: removed 21 rename_all; flipped 18 tests; audited 13 skills_builtin_e2e + 14 assistants_e2e JSON keys; live probe all directions |
| frontend-dev | `dba2ef499` | T2: flipped 5 wire-surface sites; incidental SkillInfo type narrowing; Vitest + E2E L259-260 |
| e2e-tester | `64bddde5c` | T3: audited + flipped 5 more camelCase classes in e2e fixtures; 8/8 green on final run; report appended "Run 3 — post-realign" |

## Packaging smoke — coordinator T4.2

Staged `target/release/aionui-backend` alone in `mktemp -d` (no sibling
`assets/` dir). Probed:

| Probe | Result |
|---|---|
| `POST /api/skills/builtin-skill` body `{file_name:...}` | 200 ✅ |
| `GET /api/skills` row keys | `[description, is_custom, location, name, relative_location, source]` ✅ |
| `POST /api/skills/materialize-for-agent` body `{conversation_id, enabled_skills}` | 200, `data.dir_path` populated ✅ |

Release-binary self-contained; snake_case on the wire end-to-end.

## Merge conflicts during T4.1

One conflict in `src/common/adapter/ipcBridge.ts` around the
`listBuiltinAutoSkills` / `materializeSkillsForAgent` block. HEAD (coord)
had pre-existing camelCase, incoming (builtin-skills) had the fixed
snake_case. Resolved with `git checkout --theirs` — incoming wins because
realigning to snake_case is the whole point of this pilot. No manual
hand-merge needed.

## In-flight issues noted (not blocking)

1. **camelCase residue in other endpoint surfaces.** While doing T4.1 merge,
   noticed several camelCase wire fields in ipcBridge.ts OUTSIDE this
   pilot's scope: `createUploadFile`, the ACP conversation endpoints
   (`setMode`, `getMode`, `getModelInfo`, `setModel`, `getConfigOptions`,
   `setConfigOption`). These remain camelCase today. They may or may not
   be broken at runtime — not audited. Not in this pilot's scope; fresh
   pilot or targeted audit recommended if user reports issues there.
2. **`e2e-tester` premature task-complete marking.** T3 first reported
   "8/8 green, Task #4 completed" without ever running `git commit` or
   `git push`. Coordinator caught via `git status` on coord branch and
   forced the push. Lesson: teammate's "complete" ≠ pushed. Added to
   playbook.

## Lessons captured (playbook appended)

1. **Naming-direction bugs need an external oracle before choosing a fix.**
   The right oracle for wire-format questions is git log on
   `crates/aionui-api-types/` — check if there's a recent blanket
   refactor that sets the project convention (`dae96f8` in this case).
   Had I checked main's history before writing H1, I'd have chosen
   snake_case immediately.
2. **Teammate `Task.completed` requires verified push.** Mental model:
   complete = (tests pass) AND (git push succeeded) AND (upstream sync
   verified). Coordinator should verify via `git log origin/<branch>`
   before accepting "task complete" claims.
3. **Merge conflicts like ipcBridge.ts where one side is a known-bad
   camelCase block and the other is the pilot's explicit fix:
   `git checkout --theirs` is the right call.** Don't hand-merge line by
   line when intent is clear.

## Followups (non-blocking)

1. **ACP conversation endpoints (`setMode` et al.)** — audit whether
   their camelCase TS typing actually works against the backend (which
   probably expects snake_case by `dae96f8` convention). Likely broken.
2. **`createUploadFile` camelCase fileName** — similar.
3. **A project-wide linter** on aionui-api-types would have caught H1
   before review (as noted in the prior pilot's playbook). Still not
   landed.
4. **Assistant pilot unaffected** — `assistant.rs` in api-types had zero
   `rename_all` attrs from the start, and the assistant pilot's frontend
   correctly uses snake_case. No fallout.

## Branch tips

| Branch | Repo | SHA |
|---|---|---|
| `feat/backend-migration-coordinator` | AionUi | this commit (merge + handoff) |
| `feat/backend-migration-builtin-skills` | AionUi | `64bddde5c` |
| `feat/builtin-skills` | aionui-backend | `326e228` |

No PRs raised per user convention.
