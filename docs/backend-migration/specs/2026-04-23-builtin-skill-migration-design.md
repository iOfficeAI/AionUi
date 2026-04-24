# Built-in Skill Migration — Design Spec

**Date:** 2026-04-23
**Scope:** Move built-in skill resources from the Electron frontend
(`AionUi/src/process/resources/skills/`) to the Rust backend, embed them in
the binary, and route every consumer (UI + ACP runtime + gemini CLI) through
backend APIs. Drop the frontend's local cache copy.

**Companion spec (backend-side API contract + Rust implementation):**
[`aionui-backend/docs/backend-migration/specs/2026-04-23-builtin-skill-migration-design.md`](../../../../aionui-backend/docs/backend-migration/specs/2026-04-23-builtin-skill-migration-design.md)

**Reference — prior pilot (pattern reuse, lessons learned):**
[`2026-04-23-assistant-user-data-migration-design.md`](./2026-04-23-assistant-user-data-migration-design.md)

**Out of scope (deferred):**

- Rewriting `AcpSkillManager` into a service client (this spec only swaps its
  data source from file to HTTP; the singleton/caching/matching logic stays
  put).
- Moving `GeminiAgentManager` to the backend.
- Migrating user skills (`~/.aionui/skills/`) or cron-skills. They are already
  owned by the backend side (for `/api/skills/*`) or out of this pilot
  entirely (cron-skills).
- Migrating assistant-level skill md files (`assets/builtin-assistants/skills/`)
  — shipped by the assistant pilot, not touched here.

---

## 1. Context & Problem

Built-in skills (md files shipped with the product) live today in AionUi at
`src/process/resources/skills/`. At startup, `initStorage.ts` copies this
directory into `{cacheDir}/builtin-skills/` and prunes stale entries.
Consumers read from that copy:

- `AcpSkillManager.ts` — ACP conversation runtime, loads auto-inject +
  opt-in skills on demand
- `initAgent.ts` + `agentUtils.ts` — symlinks and materializes skill files
  for gemini CLI
- `gemini/cli/config.ts` — loads skills from the cache directory, wraps them
  as a virtual extension for gemini CLI

Meanwhile the **backend also expects a built-in skills directory next to
its binary** (`{exe}/builtin-skills/`, resolved via `resolve_skill_paths`
in `aionui-extension/src/skill_service.rs`). It exposes `GET /api/skills`,
`GET /api/skills/builtin-auto`, `POST /api/skills/builtin-skill`, etc. on
that directory.

Two real consequences:

1. **Packaging bug (same class as assistant H2 landed earlier):**
   `prepareAionuiBackend.js` downloads just the backend binary from GitHub
   releases. The sibling `builtin-skills/` directory is never bundled. In
   a packaged build, `/api/skills/builtin-auto` returns an empty list even
   though the frontend's own copy in `resources/skills/` works fine. The
   two sources drift.
2. **Dual source of truth.** Changing a built-in skill means editing the
   frontend's `resources/skills/` AND the backend's expected
   `builtin-skills/` path. Neither fully serves the other. `AcpSkillManager`
   reads the frontend copy; the backend endpoints read the backend copy.

## 2. Goals

1. **Backend owns every built-in skill.** The md files live in
   `aionui-backend/crates/aionui-app/assets/builtin-skills/` and are
   embedded into the binary via `include_dir`. One source of truth.
2. **Frontend reads zero skill files.** All skill content goes through
   `ipcBridge.fs.*` HTTP APIs; `AcpSkillManager` does network calls where it
   used to do `fs.readFile`.
3. **Gemini CLI compatibility.** Gemini CLI needs a filesystem path for its
   `--extensions` flag. Materializing skills into a filesystem location is
   the **backend's** responsibility (keeps the frontend clean and makes
   future `GeminiAgentManager → backend` migration cheaper). Backend writes
   to a `data_dir`-scoped temp folder; frontend only reads the returned path.
4. **`_builtin/` renamed to `auto-inject/`.** The current underscore-prefix
   convention is cryptic. Rename to match the in-code terminology
   (`list_builtin_auto_skills`) and user-facing notion of "auto-injected
   skill."

## 3. Non-Goals

- Rewriting `AcpSkillManager` as a full service client. This spec only
  swaps its data source; its singleton/caching/frontmatter parsing stays
  put. A future spec can move the whole manager into backend.
- Changing `SkillsHubSettings.tsx`. It already goes through HTTP. The only
  impact is a new `location` field on responses, which it tolerates
  (ignores additional fields).
- Migrating user skills or cron-skills. Out of scope.

## 4. Architecture Overview

```
Source of truth:
    aionui-backend/crates/aionui-app/assets/builtin-skills/
    (embedded into binary via include_dir! at compile time)

Consumption paths (after migration):

    SkillsHubSettings.tsx ── already uses ipcBridge.fs.* HTTP ── unchanged
                                       │
                                       ▼
                               Backend endpoints
                               (GET /api/skills,
                                GET /api/skills/builtin-auto,
                                POST /api/skills/builtin-skill)

    AcpSkillManager.ts ── now calls the same ipcBridge.fs.* HTTP
                          where it used to call fs.readFile
                                       │
                                       ▼
                               Same backend endpoints

    GeminiAgentManager ── calls POST /api/skills/materialize-for-agent
                          gets back an absolute path in {data_dir}
                          passes that path to gemini CLI
                          on conversation end, calls DELETE
                                       │
                                       ▼
                      Backend writes skill md files into
                      {data_dir}/agent-skills/{conversationId}/
                      (used only by gemini CLI process, never read
                       from the frontend)
```

**Key boundary:** the frontend never touches skill files directly after
migration. "Reading a skill" = HTTP call; "giving skills to gemini CLI" =
backend materializes + returns path.

## 5. Resource Organization

### 5.1 New layout in backend

```
crates/aionui-app/assets/builtin-skills/
├── auto-inject/               # auto-injected (all conversations)
│   ├── aionui-skills/
│   │   └── SKILL.md
│   ├── cron/
│   │   └── SKILL.md
│   ├── office-cli/
│   │   └── SKILL.md
│   └── skill-creator/
│       └── SKILL.md
├── mermaid/                   # opt-in (by assistant's enabledSkills)
│   ├── SKILL.md
│   ├── references/
│   └── scripts/
├── moltbook/
├── morph-ppt/
├── pdf/
└── ... (20+ skills total)
```

### 5.2 Naming change

`_builtin/` → `auto-inject/`. Backend constant change:

```rust
// before
pub const BUILTIN_AUTO_SKILLS_SUBDIR: &str = "_builtin";
// after
pub const BUILTIN_AUTO_SKILLS_SUBDIR: &str = "auto-inject";
```

Frontend comments (`acpTypes.ts:296-299`) referring to `_builtin/` updated
to `auto-inject/`.

## 6. API Contract

No new HTTP endpoints for skill queries — existing endpoints cover
`AcpSkillManager`'s needs. Two **new** endpoints for gemini materialization.

See the backend-side spec §6 for request/response types and error codes.

### 6.1 Existing endpoints — contract refinements

| Endpoint | Change |
|---|---|
| `GET /api/skills/builtin-auto` | Response adds a `location` field per entry: `{name, description, location}`. `location` is a relative path like `"auto-inject/cron/SKILL.md"`. Clients pass this into `readBuiltinSkill`. |
| `POST /api/skills/builtin-skill` | `fileName` accepts relative paths under `builtin-skills/`. `"auto-inject/cron/SKILL.md"` and `"mermaid/SKILL.md"` are both valid. `validate_filename` rejects `../` traversal. |
| `GET /api/skills` | For `source=builtin` rows, `location` is a relative path (no longer an absolute filesystem path). For `custom`/`extension`, semantics unchanged. |

### 6.2 New endpoints for gemini materialization

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/skills/materialize-for-agent` | Write the conversation's required skills to `{data_dir}/agent-skills/{conversationId}/`, return the absolute path |
| DELETE | `/api/skills/materialize-for-agent/{conversationId}` | Remove that directory (idempotent) |

Request / response shapes are in the backend spec §6.2.

## 7. Frontend Refactor Scope

### 7.1 Files deleted

| Path | Reason |
|---|---|
| `src/process/resources/skills/` (entire directory) | Moved to backend |

### 7.2 Files modified

| File | Change |
|---|---|
| `src/process/utils/initStorage.ts` | Drop `getBuiltinSkillsCopyDir`, `getAutoSkillsDir`, `STORAGE_PATH.builtinSkills`, the resource-copy logic, and the stale-entry pruner. Add a best-effort legacy cleanup: `fs.rm(cacheDir/builtin-skills/, {recursive, force}).catch(() => {})`. |
| `src/process/task/AcpSkillManager.ts` | Drop `autoSkillsDir` / `skillsDir` fields. Inside `discoverAutoSkills` and `loadSkillByName`, replace `fs.readFile` with `ipcBridge.fs.listBuiltinAutoSkills.invoke()` + `ipcBridge.fs.readBuiltinSkill.invoke({fileName})`. Keep the singleton pattern, frontmatter parser, and lazy-load cache as-is. On HTTP failure, log and return empty list (graceful degrade). |
| `src/process/utils/initAgent.ts` | Drop the symlink + builtin-path logic (L54, L92-93). Replace with a call to `ipcBridge.fs.materializeSkillsForAgent.invoke({conversationId, enabledSkills})` that returns `{dirPath}`. Pass `dirPath` to the caller (gemini manager) instead of constructing paths locally. |
| `src/process/task/agentUtils.ts` | Drop `getBuiltinSkillsCopyDir` usage at L137. Materialize logic now fully lives in the backend call path set up by `initAgent.ts`. |
| `src/process/agent/gemini/cli/config.ts` | Remove the L125 `{skillsDir}/_builtin` read (semantically wrong — skillsDir is the user skills dir, `_builtin` was a misplaced lookup). gemini's skills now arrive pre-materialized via the `materializeSkillsForAgent` path. |
| `src/process/task/GeminiAgentManager.ts` | On conversation start, call `materializeSkillsForAgent` and pass the returned `dirPath` to gemini CLI. On conversation end/teardown, call `cleanupSkillsForAgent` (fire-and-forget). |
| `src/common/types/acpTypes.ts` | Update the comments at L296-299 from `_builtin/` to `auto-inject/`. |
| `src/common/adapter/ipcBridge.ts` | Add two new methods: `materializeSkillsForAgent` and `cleanupSkillsForAgent`, mirroring the new backend endpoints. |

### 7.3 Files NOT modified

| File | Why |
|---|---|
| `src/process/extensions/*` | Extension skill integration unchanged. |
| `tests/e2e/features/skills/` | Existing Skill-Library pilot tests still exercise `/api/skills/*`. Location-field assertion may need loosening, done reactively if any test breaks. |

### 7.3a Files modified incidentally

| File | Change |
|---|---|
| `src/renderer/pages/settings/SkillsHubSettings.tsx` | Type `SkillInfo` gains optional `relativeLocation` field. Display unchanged; `location` still works for the export-to-external-source flow (lines 518-523) because the backend synthesizes an absolute path for builtin skills (see backend §6.1). No behavior change; type import may need touching. |

### 7.4 File count

~8 frontend files modified + 1 directory deleted + 1 IPC addition. Backend
has ~5 files modified + 1 new assets dir + 1 new Cargo dep.

## 8. Migration Strategy

### 8.1 Resource migration (one-shot git operation)

**backend-dev commits first** (backend feature branch):
```bash
mkdir -p crates/aionui-app/assets/builtin-skills
cp -R /Users/zhoukai/Documents/github/AionUi/src/process/resources/skills/. \
      crates/aionui-app/assets/builtin-skills/
mv crates/aionui-app/assets/builtin-skills/_builtin \
   crates/aionui-app/assets/builtin-skills/auto-inject
git add crates/aionui-app/assets/builtin-skills
git commit -m "feat(skill): import builtin skills (rename _builtin → auto-inject)"
```

**frontend-dev follows** (frontend feature branch):
```bash
git rm -r src/process/resources/skills
git commit -m "refactor(skill): drop local builtin skills (moved to backend)"
```

Order doesn't functionally matter (both sides can compile independently
once this commit lands; the migration only fully "completes" when both are
merged together). Coordinator orchestrates timing.

### 8.2 Runtime migration of user's legacy cache

Old users upgrade and still have `{cacheDir}/builtin-skills/` sitting on
disk (up to ~7 MB of stale copies). `initStorage.ts` adds a one-line
cleanup:

```ts
const legacyDir = path.join(cacheDir, 'builtin-skills');
if (existsSync(legacyDir)) {
  fs.rm(legacyDir, { recursive: true, force: true })
    .then(() => console.log('[AionUi] Cleaned up legacy builtin-skills cache'))
    .catch(() => { /* swallow — not critical */ });
}
```

No flag, no retry — worst case is 7 MB stays behind on disk, harmless.

### 8.3 Startup ordering

No skill-related timing dependencies at app startup:

- Backend starts → embedded assets in memory, ready to serve
- Frontend main process starts → `initStorage.ts` runs the legacy cleanup
- First ACP conversation → `AcpSkillManager.discoverAutoSkills` fires an
  HTTP call (by that time backend is healthy; guaranteed because
  `BackendLifecycleManager.start()` waits for `/health`)
- First gemini conversation → `materializeSkillsForAgent` fires

### 8.4 Backend-side orphan cleanup

On backend startup, scan `{data_dir}/agent-skills/` subdirectories. For
each `conversationId` that no longer exists in the `conversations` table,
remove it. Prevents accumulation from crashes / hard-kills that miss the
DELETE path.

### 8.5 Rollback

Failure modes degrade gracefully:

| Failure | User impact |
|---|---|
| `AcpSkillManager` HTTP call returns 5xx | Auto-inject skill list empty; ACP conversation starts without auto-injection. User might see AI not using skills it normally would. Logs loud. |
| `materializeSkillsForAgent` returns 5xx | Gemini starts without builtin skills (`--extensions` flag omitted). Degraded capability but conversation functions. |
| Cleanup DELETE fails | Orphan dir on disk; backend's startup cleanup mops up next launch. |
| Backend `include_dir` missing a file (corrupt build) | Same as above — empty list. Frontend logs. |

None are blocking failures.

### 8.6 Dev/E2E overrides

- `AIONUI_BUILTIN_SKILLS_PATH=/path/to/dir` — backend reads from that
  filesystem path instead of embedded. Required for rapid iteration and
  E2E seeding of edge cases.

## 9. Test Strategy

See §9 of the backend spec for the full matrix. Frontend-side summary:

| Role | Scope |
|---|---|
| backend-dev | Rust unit tests (embedded loading, materialize/cleanup) + HTTP integration (`tests/skills_builtin_e2e.rs`). Backend-tester role is NOT separately allocated this pilot — scope is too small. |
| frontend-dev | Self-tests the hooks they change (acpSkillManager HTTP swap, initAgent materialize flow). |
| frontend-tester | Vitest: `acpSkillManager.test.ts` (new or updated), `initAgent.materialize.test.ts` (new). TSC + lint gates. Prune dead tests referencing deleted functions. |
| e2e-tester | Playwright: 8 scenarios in `tests/e2e/features/builtin-skill-migration/`: (1) packaged app's `GET /api/skills/builtin-auto` returns non-empty; (2) ACP conversation auto-injects auto-inject skills; (3) opt-in via `enabledSkills` materialized; (4) gemini conversation receives materialized dir; (5) DELETE cleanup on conversation end; (6) orphan cleanup on next startup after crash; (7) SkillsHubSettings export-to-external-source still works for `source=builtin` skills (the critical regression path); (8) legacy `{cacheDir}/builtin-skills/` dir is removed on upgrade. |
| coordinator | Manual packaging smoke test (the main motivating bug class): `bun run build` → packaged app → `/api/skills/builtin-auto` returns non-empty, conversations start, gemini gets skills. |

Regression suites that must stay green:

- Assistant pilot E2E
- Skill-Library pilot E2E
- Full `cargo test --workspace`
- Full Vitest suite (same baseline as assistant pilot end)

## 10. Team Execution Plan

Team mode (same playbook as assistant pilot). **Smaller team this time
because the scope is smaller.**

### 10.1 Branches

| Branch | Repo | Base | Owner(s) |
| --- | --- | --- | --- |
| `feat/backend-migration-coordinator` | AionUi | (existing) | coordinator |
| `feat/backend-migration-builtin-skills` | AionUi | `origin/feat/backend-migration-coordinator` | frontend-dev, frontend-tester, e2e-tester |
| `feat/builtin-skills` | aionui-backend | `origin/feat/assistant-user-data` | backend-dev |

Note: the aionui-backend feature branch bases on **`feat/assistant-user-data`**
(the previous pilot), not the archive branch, so this work can coexist with
the assistant pilot's code in one binary. Coordinator manages the merge order.

### 10.2 Task graph

```
T0  (coordinator setup)
 │
 ▼
T1  (backend-dev: assets import + include_dir + API + materialize endpoints + unit & HTTP tests)
 │
 ├──► T2 (frontend-dev: AcpSkillManager HTTP swap + initAgent materialize + deletes)
 │      │
 │      └──► T3 (frontend-tester: Vitest + lint + tsc)
 │
 └──► T4 (e2e-tester: Playwright against integrated branches)
           │
           └──► T5 (coordinator closure: merge, handoff, module log, packaging smoke test)
```

5 tasks (T1..T5) + T0 coordinator setup. Critical path:
T0 → T1 → T2 → T4 → T5.

Backend-tester role is **not allocated** — T1's scope (one backend dev
implementing + testing the small skill surface) is consistent with one
person ownership. Coordinator takes packaging smoke as final verification.

### 10.3 Definition of Done

- [ ] `src/process/resources/skills/` deleted from AionUi
- [ ] `aionui-backend/crates/aionui-app/assets/builtin-skills/` populated with all 20+ skills, `auto-inject/` subdir in place
- [ ] `cargo test --workspace` green; `cargo clippy --workspace -- -D warnings` clean
- [ ] `bun run test --run` passes at the same baseline as assistant-pilot end (no new failures)
- [ ] `bunx tsc --noEmit` clean; `bun run lint --quiet` no new warnings
- [ ] E2E 7 scenarios green (Class D = 0, Class F = 0)
- [ ] Manual packaging smoke test passes: packaged `.app` starts, `GET /api/skills/builtin-auto` returns non-empty, a gemini conversation receives builtin skills
- [ ] Rename coverage: `grep -rnE '"_builtin"|/_builtin|_builtin/' AionUi/src aionui-backend/crates` returns zero hits (excluding `target/`, `node_modules/`, committed docs that intentionally document the rename history)
- [ ] Coordinator handoff + module log updated

## 11. Open Risks

1. **`AcpSkillManager` startup latency** — first HTTP call adds ~50ms
   vs a filesystem read. Mitigation: discovery happens on first
   conversation, not at app startup; user-perceivable only on the very
   first message. Acceptable.
2. **Gemini CLI version quirks** — the `--extensions` path flag must
   accept the materialized `agent-skills/{convId}/` structure.
   Verify in E2E scenario 7.
3. **Orphan buildup** — if backend-side startup orphan-cleanup misses
   edge cases (e.g. backend crash loop), `{data_dir}/agent-skills/`
   grows. Acceptable in short term; revisit if reports come in.
4. **`_builtin` string scatter** — the rename to `auto-inject` must
   catch every callsite. Pre-land grep check:
   `grep -rn "_builtin\b" AionUi/src aionui-backend/crates | grep -v target/`
   must return only intentionally-commented references post-migration.
