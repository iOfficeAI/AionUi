# Built-in Skill Migration — Implementation Plan

> **Team mode** — coordinator + parallel teammates. Each teammate owns a numbered task on their own branch. Pattern reused from the assistant pilot; lessons captured in `docs/backend-migration/notes/team-operations-playbook.md`.
>
> **Companion specs:**
> - [`AionUi/docs/backend-migration/specs/2026-04-23-builtin-skill-migration-design.md`](../specs/2026-04-23-builtin-skill-migration-design.md)
> - [`aionui-backend/docs/backend-migration/specs/2026-04-23-builtin-skill-migration-design.md`](../../../../aionui-backend/docs/backend-migration/specs/2026-04-23-builtin-skill-migration-design.md)

**Goal:** Move built-in skill resources from the Electron frontend to the Rust backend, embed via `include_dir!`, rename `_builtin/` → `auto-inject/`, route every consumer through HTTP, and introduce a backend "materialize for gemini" endpoint. Eliminates the same packaging-bug class that H2 fixed for assistants.

**Architecture:** `aionui-extension::skill_service` gains `include_dir!`-embedded `BUILTIN_SKILLS`. `SkillInfo` response gains `relative_location` for builtin source. Two new endpoints (`materialize-for-agent` / cleanup) manage gemini's filesystem needs. `AcpSkillManager` swaps `fs.readFile` for HTTP calls. Frontend `resources/skills/` deleted; `{cacheDir}/builtin-skills/` cleaned on upgrade.

**Tech stack:** Rust 2024 + axum + include_dir 0.7 (backend); TypeScript + Electron + Vitest + Playwright (frontend). Two branches, one per repo.

**Team size:** 1 coordinator + 3 role-teammates (backend-dev, frontend-dev, e2e-tester). No backend-tester / frontend-tester this pilot — scope ≈ 1/3 of assistant pilot, devs self-test their work.

---

## Branches

| Branch | Repo | Base | Owner(s) |
| --- | --- | --- | --- |
| `feat/backend-migration-coordinator` | AionUi | (existing) | coordinator |
| `feat/backend-migration-builtin-skills` | AionUi | `origin/feat/backend-migration-coordinator` | frontend-dev, e2e-tester |
| `feat/builtin-skills` | aionui-backend | `origin/feat/assistant-user-data` | backend-dev |

**Coexistence note:** aionui-backend branch is based on `feat/assistant-user-data` (previous pilot, not yet merged to archive). If that branch gets rebased before merge, this branch's commits must be replayed — coordinator handles in T5.

---

## Task graph

```
T0 (coordinator setup)
 │
 ▼
T1 (backend-dev: import assets + include_dir + API + materialize + tests + packaging smoke)
 │
 ├──► T2 (frontend-dev: AcpSkillManager HTTP + initAgent materialize + deletes + Vitest)
 │      │
 │      └──► T3 (e2e-tester: Playwright 8 scenarios)
 │             │
 │             └──► T4 (coordinator closure)
```

Critical path: T0 → T1 → T2 → T3 → T4.

No backend-tester: T1 owner writes both unit + HTTP integration tests + runs `cargo build --release` packaging smoke internally. No frontend-tester: T2 owner writes Vitest alongside code changes.

---

## Task 0 — Coordinator setup

**Owner:** coordinator. **Depends on:** nothing.

- [ ] **0.1 Fetch all remotes**
  ```bash
  git -C /Users/zhoukai/Documents/github/AionUi fetch origin
  git -C /Users/zhoukai/Documents/github/aionui-backend fetch origin
  ```
- [ ] **0.2 Create frontend feature branch**
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git checkout -b feat/backend-migration-builtin-skills origin/feat/backend-migration-coordinator
  git push -u origin feat/backend-migration-builtin-skills
  ```
- [ ] **0.3 Create backend feature branch**
  ```bash
  cd /Users/zhoukai/Documents/github/aionui-backend
  git checkout -b feat/builtin-skills origin/feat/assistant-user-data
  git push -u origin feat/builtin-skills
  ```
- [ ] **0.4 Create team**
  ```
  TeamCreate team_name="aionui-builtin-skill-migration"
  ```
- [ ] **0.5 Register tasks**: T1 backend-dev, T2 frontend-dev, T3 e2e-tester, T4 coordinator. Dependencies: T2 blocks on T1, T3 blocks on T2, T4 blocks on T3.
- [ ] **0.6 Commit plan** to coordinator branch; push.
- [ ] **0.7 Spawn backend-dev on T1**.

---

## Task 1 — Backend implementation (all-in-one)

**Owner:** backend-dev. **Branch:** `feat/builtin-skills` (aionui-backend). **Depends on:** T0.

**Working dir:** `/Users/zhoukai/Documents/github/aionui-backend`

### Step 1.1 — Claim

- [ ] `TaskUpdate { taskId: "<T1>", status: "in_progress", owner: "backend-dev" }`
- [ ] `SendMessage to "team-lead": "alive on T1"`
- [ ] `git rev-parse --abbrev-ref HEAD` must be `feat/builtin-skills`

### Step 1.2 — Import skill corpus

- [ ] Copy from AionUi to backend:
  ```bash
  mkdir -p crates/aionui-app/assets/builtin-skills
  cp -R /Users/zhoukai/Documents/github/AionUi/src/process/resources/skills/. \
        crates/aionui-app/assets/builtin-skills/
  mv crates/aionui-app/assets/builtin-skills/_builtin \
     crates/aionui-app/assets/builtin-skills/auto-inject
  ```
- [ ] Verify: `ls crates/aionui-app/assets/builtin-skills/` shows `auto-inject/` + ~19 opt-in subdirs (mermaid, pdf, moltbook, morph-ppt, etc.)
- [ ] Commit: `feat(skill): import builtin skill corpus from AionUi (rename _builtin → auto-inject)`

### Step 1.3 — Add `include_dir` dependency

- [ ] In `crates/aionui-extension/Cargo.toml`:
  ```toml
  [dependencies]
  # ... existing
  include_dir = "0.7"
  ```

### Step 1.4 — Rename constant

- [ ] In `crates/aionui-extension/src/constants.rs`:
  ```rust
  // before:  pub const BUILTIN_AUTO_SKILLS_SUBDIR: &str = "_builtin";
  pub const BUILTIN_AUTO_SKILLS_SUBDIR: &str = "auto-inject";
  ```

### Step 1.5 — Add BUILTIN_SKILLS static + refactor skill_service

- [ ] In `crates/aionui-extension/src/skill_service.rs`, near top:
  ```rust
  use include_dir::{Dir, include_dir};

  static BUILTIN_SKILLS: Dir<'static> = include_dir!(
      "$CARGO_MANIFEST_DIR/../aionui-app/assets/builtin-skills"
  );
  ```
- [ ] Change `SkillPaths.builtin_skills_dir` from `PathBuf` to `Option<PathBuf>`; add `data_dir: PathBuf` field.
- [ ] Update `resolve_skill_paths` to accept `data_dir` param; read `AIONUI_BUILTIN_SKILLS_PATH` env var into `builtin_skills_dir`.
- [ ] Rewrite `read_builtin_skill`: if env override set, read disk; else `BUILTIN_SKILLS.get_file(file_name).and_then(|f| f.contents_utf8())`; return empty string on missing; keep `validate_filename` for path traversal.
- [ ] Rewrite `list_builtin_auto_skills`: iterate `BUILTIN_SKILLS.get_dir("auto-inject")?.dirs()`; for each, parse `SKILL.md` frontmatter; emit `BuiltinAutoSkill { name, description, location: "auto-inject/{name}/SKILL.md" }`.
- [ ] Rewrite `list_skills`: for `source=builtin` rows, synthesize `location` as `{data_dir}/builtin-skills-view/{name}/SKILL.md` and populate `relative_location: Some("auto-inject/{name}/SKILL.md" | "{name}/SKILL.md")`. Materialize the view lazily on first read (write embedded content to disk so the export-symlink flow works).
- [ ] Add new functions `materialize_skills_for_agent(paths, conv_id, enabled_skills) -> PathBuf` and `cleanup_agent_skills(paths, conv_id)`. Details in backend spec §6.2 and §4.
- [ ] Add `cleanup_orphan_agent_skills<F: Fn(&str) -> bool>(paths, is_live)`. Scans `{data_dir}/agent-skills/*`, removes subdirs whose name `!is_live(name)`. **Must not import `aionui-conversation`**; predicate is wired in `aionui-app`.

### Step 1.6 — Update response types in aionui-api-types

- [ ] In `crates/aionui-api-types/src/extension.rs` (or whichever file holds the skill types):
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct BuiltinAutoSkill {
      pub name: String,
      pub description: String,
      pub location: String,  // NEW
  }

  pub struct SkillInfo {
      // ... existing fields
      #[serde(skip_serializing_if = "Option::is_none")]
      pub relative_location: Option<String>,  // NEW
  }

  #[derive(Debug, Clone, Deserialize)]
  pub struct MaterializeSkillsRequest {
      pub conversation_id: String,
      pub enabled_skills: Vec<String>,
  }

  #[derive(Debug, Clone, Serialize)]
  pub struct MaterializeSkillsResponse {
      pub dir_path: String,
  }
  ```

### Step 1.7 — Add routes + handlers

- [ ] In `crates/aionui-extension/src/skill_routes.rs`, register:
  ```rust
  .route("/api/skills/materialize-for-agent", post(materialize_for_agent))
  .route("/api/skills/materialize-for-agent/:conversation_id", delete(cleanup_agent_skills))
  ```
- [ ] Implement the two handlers: validate input, call service, map errors.

### Step 1.8 — Update aionui-app composition

- [ ] In `crates/aionui-app/src/lib.rs`, update the `resolve_skill_paths` call to pass `data_dir`:
  ```rust
  let skill_paths = aionui_extension::resolve_skill_paths(&app_resource_dir, data_dir);
  ```
- [ ] Add canonicalize for app_resource_dir (H1 assistant lesson — symlink safety):
  ```rust
  let app_resource_dir = std::env::current_exe()
      .ok()
      .and_then(|p| p.canonicalize().ok())
      .and_then(|p| p.parent().map(|pp| pp.to_path_buf()))
      .unwrap_or_else(|| std::path::PathBuf::from("."));
  ```
- [ ] Wire orphan cleanup on startup: `cleanup_orphan_agent_skills(&skill_paths, |id| conv_repo.exists_blocking(id)).await.ok()`. Log but don't block on errors.

### Step 1.9 — Unit tests

- [ ] In `crates/aionui-extension/src/skill_service.rs` `#[cfg(test)]` module, add tests per backend spec §9.1 (13 listed cases). Use `AIONUI_BUILTIN_SKILLS_PATH` env + tempdir for disk-source tests; use embedded for others.

### Step 1.10 — HTTP integration tests

- [ ] Create `crates/aionui-app/tests/skills_builtin_e2e.rs`. Test every endpoint per backend spec §9.2. Follow `assistants_e2e.rs` pattern (tower::oneshot + init_database_memory + ephemeral data_dir).

### Step 1.11 — Gates

- [ ] `cargo fmt --all -- --check` clean
- [ ] `cargo clippy --workspace -- -D warnings` clean
- [ ] `cargo test --workspace` all green
- [ ] `cargo test --test skills_builtin_e2e` green (new test file)
- [ ] `cargo test --test assistants_e2e` green (regression — assistant pilot)

### Step 1.12 — Packaging smoke (internal pre-check)

- [ ] `cargo build --release`
- [ ] Start binary: `target/release/aionui-backend --local --port 25901 --data-dir /tmp/skill-smoke`
- [ ] `curl -s http://127.0.0.1:25901/api/skills/builtin-auto | jq '. | length'` must return ≥ 4
- [ ] `curl -s -X POST http://127.0.0.1:25901/api/skills/builtin-skill -H 'Content-Type: application/json' -d '{"fileName":"auto-inject/cron/SKILL.md"}' | head -c 200` must return non-empty frontmatter
- [ ] `curl -s -X POST http://127.0.0.1:25901/api/skills/materialize-for-agent -H 'Content-Type: application/json' -d '{"conversationId":"smoke","enabledSkills":["mermaid"]}' | jq .dirPath` must return absolute path
- [ ] Kill binary.

### Step 1.13 — Commit + push + handoff

- [ ] `git add -A && git commit -m "feat(skill): embed builtin skills via include_dir + materialize-for-agent endpoint"`
- [ ] `git push`
- [ ] `cargo build` (debug) to refresh `~/.cargo/bin/aionui-backend` symlink
- [ ] `SendMessage team-lead: "T1 complete at SHA <X>. Frontend unblocked on T2."`
- [ ] `TaskUpdate { taskId: "<T1>", status: "completed" }`

### Progress reporting (MANDATORY per playbook)

- [ ] SendMessage team-lead every ~10 minutes during T1, even mid-code. Short: "still on step 1.X, currently doing Y." Silence ≥ 10 min triggers zombie cleanup per playbook.

---

## Task 2 — Frontend refactor

**Owner:** frontend-dev. **Branch:** `feat/backend-migration-builtin-skills` (AionUi). **Depends on:** T1.

**Working dir:** `/Users/zhoukai/Documents/github/AionUi`

### Step 2.1 — Claim + sync

- [ ] `TaskUpdate { taskId: "<T2>", status: "in_progress", owner: "frontend-dev" }`
- [ ] `SendMessage team-lead: "alive on T2"`
- [ ] `git pull origin feat/backend-migration-builtin-skills`
- [ ] Pull backend changes by running `cd /Users/zhoukai/Documents/github/aionui-backend && git checkout feat/builtin-skills && git pull && cargo build` — refresh symlinked binary so Electron gets the new backend on next start.

### Step 2.2 — Delete frontend skill resources

- [ ] `git rm -r src/process/resources/skills`
- [ ] Commit: `refactor(skill): drop local builtin skills (moved to backend)`

### Step 2.3 — Update ipcBridge

- [ ] In `src/common/adapter/ipcBridge.ts`, add:
  ```ts
  materializeSkillsForAgent: httpPost<
    { dirPath: string },
    { conversationId: string; enabledSkills: string[] }
  >('/api/skills/materialize-for-agent'),

  cleanupSkillsForAgent: httpDelete<void, { conversationId: string }>(
    ({ conversationId }) => `/api/skills/materialize-for-agent/${encodeURIComponent(conversationId)}`,
  ),
  ```

### Step 2.4 — Update AcpSkillManager

- [ ] In `src/process/task/AcpSkillManager.ts`:
  - Remove `autoSkillsDir` and `skillsDir` instance fields and all references
  - Rewrite `discoverAutoSkills`: `const list = await ipcBridge.fs.listBuiltinAutoSkills.invoke()`; for each `{name, description, location}`, construct `SkillDefinition` with `location` string kept for later lazy body fetch.
  - Rewrite `loadSkillByName`: if skill has a `location` and body not loaded yet, `await ipcBridge.fs.readBuiltinSkill.invoke({ fileName: skill.location })`; cache body.
  - Wrap network calls in try/catch; failure → log + return empty list (graceful degrade).
- [ ] Keep singleton pattern, frontmatter parser, cache-key logic untouched.

### Step 2.5 — Update initAgent + agentUtils + gemini config

- [ ] In `src/process/utils/initAgent.ts`:
  - Remove imports of `getBuiltinSkillsCopyDir`, `getAutoSkillsDir`
  - Remove symlink + path-join logic around skillName lookups
  - Replace with call site: `const { dirPath } = await ipcBridge.fs.materializeSkillsForAgent.invoke({ conversationId, enabledSkills });`
  - Pass `dirPath` to caller (gemini manager) via existing parameter shape
- [ ] In `src/process/task/agentUtils.ts`: delete the `getBuiltinSkillsCopyDir` import and its usage at L137. Skills already materialized by backend.
- [ ] In `src/process/agent/gemini/cli/config.ts`: delete the L125 `path.join(skillsDir, '_builtin')` read (semantically wrong; obsolete).
- [ ] In `src/process/task/GeminiAgentManager.ts`: ensure on conversation teardown `ipcBridge.fs.cleanupSkillsForAgent.invoke({ conversationId })` is called (fire-and-forget, catch errors).

### Step 2.6 — Update initStorage

- [ ] In `src/process/utils/initStorage.ts`:
  - Delete `getBuiltinSkillsCopyDir`, `getAutoSkillsDir`
  - Delete `STORAGE_PATH.builtinSkills`
  - Delete the copy + stale-entry pruner logic (the big `ensureAssistantDirs`-style block for builtin-skills)
  - Add a legacy cleanup block at startup:
    ```ts
    const legacyDir = path.join(cacheDir, 'builtin-skills');
    if (existsSync(legacyDir)) {
      fs.rm(legacyDir, { recursive: true, force: true })
        .then(() => console.log('[AionUi] Cleaned up legacy builtin-skills cache'))
        .catch(() => {});
    }
    ```

### Step 2.7 — Update comments + types

- [ ] In `src/common/types/acpTypes.ts` L296-299: change `_builtin/` → `auto-inject/` in the two JSDoc lines.
- [ ] In `src/renderer/pages/settings/SkillsHubSettings.tsx`: if needed, type-extend `SkillInfo` with optional `relativeLocation`. No runtime change.

### Step 2.8 — Rename string audit

- [ ] `grep -rnE '"_builtin"|/_builtin|_builtin/' src/` must return zero production hits (non-test, non-doc-archival).

### Step 2.9 — Vitest

- [ ] Create/update `tests/unit/acpSkillManager.test.ts`:
  - Mock `ipcBridge.fs.listBuiltinAutoSkills` and `readBuiltinSkill`.
  - Assert: discover returns N entries on happy path.
  - Assert: HTTP failure returns empty list (graceful degrade).
  - Assert: singleton cache key still works.
- [ ] Create `tests/unit/initAgent.materialize.test.ts`:
  - Mock `materializeSkillsForAgent.invoke` returning `{ dirPath: '/tmp/x' }`.
  - Assert: gemini spawn call path receives that dirPath.
  - Assert: `cleanupSkillsForAgent` is called on conversation end.

### Step 2.10 — Gates

- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run lint --quiet` — baseline unchanged (no new warnings)
- [ ] `bun run test --run` — no new failures beyond current baseline

### Step 2.11 — Commit + push + handoff

- [ ] `git add -A && git commit -m "refactor(skill): route AcpSkillManager through backend HTTP; delete local resource sync"`
- [ ] `git push`
- [ ] `SendMessage team-lead: "T2 complete at SHA <X>. e2e-tester unblocked."`
- [ ] `TaskUpdate { taskId: "<T2>", status: "completed" }`

### Progress reporting (MANDATORY)

- [ ] Same 10-min pulse rule as T1.

---

## Task 3 — E2E verification

**Owner:** e2e-tester. **Branch:** `feat/backend-migration-builtin-skills`. **Depends on:** T2.

### Step 3.1 — Claim + sync

- [ ] Task claim + alive ping
- [ ] `git pull`
- [ ] Verify `~/.cargo/bin/aionui-backend` is the fresh symlink (readlink + stat)
- [ ] `bunx electron-vite build` — refresh renderer bundle

### Step 3.2 — Scenario file

- [ ] Create `tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts` with 8 scenarios per frontend spec §9 (e2e-tester row).

### Step 3.3 — Run suite

- [ ] `bun run test:e2e tests/e2e/features/builtin-skill-migration/`
- [ ] Classify any failures per Skill-Library pilot rubric (D/F/B/C/E/A).

### Step 3.4 — Report

- [ ] Create `docs/backend-migration/e2e-reports/2026-04-23-builtin-skill-migration.md` with per-scenario matrix + probes + verdict.
- [ ] Commit + push.

### Step 3.5 — Outcome routing

- [ ] All green or only B/C/E: `TaskUpdate completed`; `SendMessage team-lead "T3 clean"`.
- [ ] Class D or F present: do NOT mark complete; SendMessage team-lead with per-failure routing; coordinator re-engages backend-dev or frontend-dev.

### Progress reporting

- [ ] 10-min pulse rule.

---

## Task 4 — Coordinator closure

**Owner:** coordinator. **Depends on:** T3.

- [ ] **4.1 Merge frontend branch into coordinator branch**
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git checkout feat/backend-migration-coordinator
  git pull
  git merge origin/feat/backend-migration-builtin-skills --no-edit
  git push
  ```
- [ ] **4.2 Manual packaging smoke** (the critical motivation)
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  bun run build   # packages Electron
  # Open the packaged .app manually; verify: startup OK; GET /api/skills/builtin-auto returns non-empty; create an ACP conversation with a builtin skill → skill gets auto-injected.
  ```
  Failure here blocks closure — re-engage backend-dev / frontend-dev.
- [ ] **4.3 Write handoff** `docs/backend-migration/handoffs/coordinator-builtin-skill-migration-2026-04-23.md`: final SHAs, scope shipped, lessons, followups.
- [ ] **4.4 Update module log** — append a section to `docs/backend-migration/modules/assistant.md` (or a new `modules/builtin-skill.md` if separate subject). Record: endpoints added/changed, rename history, migration flag behavior, feature branch SHAs.
- [ ] **4.5 Shutdown teammates** via shutdown_request. TeamDelete after all terminate.
- [ ] **4.6 Final summary to user** — SendMessage to user with branch tips + SHAs + summary of delivery.

---

## Coordinator Operational Rules (applied from start)

Per `docs/backend-migration/notes/team-operations-playbook.md`:

1. **Zombie replacement is autonomous.** 10 min no activity + inbox read_true + no git/TaskUpdate progress → delete from team config.json + rm inbox + respawn with short prompt. No user confirmation.
2. **Full state scan every 10 min** during active teammates. `TaskList` + inbox tail + git status both repos + file change count.
3. **Every teammate completion message acknowledged within same coordinator turn.** Short ACK SendMessage.
4. **Teammate progress messages every ~10 min** — enforced via spawn prompt wording. Silence is a trigger.
5. **Spawn prompt discipline:** one task per spawn, under ~40 lines, `TaskGet` + plan read inside the agent, `git fetch && git reset --hard origin/<branch>` as self-heal.

## Success Criteria (snapshot)

- [ ] Corpus moved to backend; `_builtin` → `auto-inject` complete
- [ ] `cargo test --workspace` + new `skills_builtin_e2e` green; clippy clean
- [ ] Frontend `resources/skills/` deleted; TSC + lint clean; Vitest baseline unchanged
- [ ] Grep check clean in both repos
- [ ] E2E 8 scenarios green (or only B/C/E)
- [ ] Manual packaged-app smoke passes
- [ ] Coordinator handoff + module log committed
- [ ] All teammate handoffs committed
