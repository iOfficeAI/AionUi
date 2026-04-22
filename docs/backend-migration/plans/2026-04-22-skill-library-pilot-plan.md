# Skill-Library Migration Pilot — Implementation Plan

> **Coordinator-owned plan.** This plan is executed by a multi-teammate TEAM,
> not a single agent. The coordinator (me) runs the setup tasks and schedules
> teammate work. Teammates receive their tasks via SendMessage with a precise
> brief that points at their section of this plan.
>
> **Steps use checkbox (`- [ ]`) syntax for tracking.**

**Goal:** Migrate the Skill-Library module (5 read-only skill endpoints) from
AionUi's Electron main process to `aionui-backend`, keep the UI behavior
identical, and prove the team workflow end-to-end.

**Architecture:** Four-role team (coordinator, backend-dev, frontend-dev,
e2e-tester) working in parallel on separate branches/repos with per-module
atomic commits. Coordinator periodically syncs base branches back into active
dev branches. No PRs, no issues — branches and commits are the integration
artifacts. Each teammate writes a handoff file on exit.

**Tech Stack:** Rust (axum) for aionui-backend, TypeScript/React for AionUi
renderer, Vitest for unit tests, Playwright-based e2e suite from
`kaizhou-lab/test/e2e-coverage`.

---

## Roles & Handles

Teammates are addressed by name:

- `backend-dev` — runs in `aionui-backend` repo
- `frontend-dev` — runs in AionUi repo, on frontend branch
- `e2e-tester` — runs in AionUi repo, on e2e branch

The coordinator stays on `feat/backend-migration-coordinator` and never writes
production code.

## Branches (created in Task 0)

**Rule:** `feat/backend-migration` in BOTH repos (AionUi and aionui-backend)
is the integration base — **nobody commits to it directly during the pilot**.
`main` in either repo is not used as a base. Every role works on a dedicated
sibling branch based on `origin/feat/backend-migration` in its own repo.
Integration of pilot work back into `feat/backend-migration` is deferred
until after the pilot closes; it is scheduled as a separate, user-approved
step, not part of this plan.

Names are flat (no `/` inside the branch suffix) because nested refs like
`feat/backend-migration/<child>` collide with the existing
`feat/backend-migration` ref.

| Branch                                        | Repo             | Base                                                                                                   | Owner         |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| `feat/backend-migration-coordinator`          | AionUi           | `origin/feat/backend-migration`                                                                        | coordinator   |
| `feat/backend-migration-fe-skill-library`     | AionUi           | `origin/feat/backend-migration`                                                                        | frontend-dev  |
| `feat/extension-skill-library`                | aionui-backend   | `origin/feat/backend-migration`                                                                        | backend-dev   |
| `feat/backend-migration-e2e-skill-library`    | AionUi           | `feat/backend-migration-fe-skill-library` + merge `origin/kaizhou-lab/test/e2e-coverage` | e2e-tester    |

## Endpoints in scope

All `GET`/`POST` under `/api/skills/*`. Backend currently has `/api/extensions/*`
routes but NOT `/api/skills/*` — those have to be built from the TS baseline.

| ID | Renderer API                        | HTTP                              | Request                          | Response                                                                                                |
| -- | ----------------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| E1 | `ipcBridge.fs.listAvailableSkills`  | `GET /api/skills`                 | none                             | `Array<{ name, description, location, isCustom, source: 'builtin'\|'custom'\|'extension' }>`            |
| E2 | `ipcBridge.fs.listBuiltinAutoSkills`| `GET /api/skills/builtin-auto`    | none                             | `Array<{ name, description }>`                                                                          |
| E3 | `ipcBridge.fs.readBuiltinRule`      | `POST /api/skills/builtin-rule`   | `{ fileName: string }`           | `string` (file content)                                                                                 |
| E4 | `ipcBridge.fs.readBuiltinSkill`     | `POST /api/skills/builtin-skill`  | `{ fileName: string }`           | `string` (file content)                                                                                 |
| E5 | `ipcBridge.fs.readSkillInfo`        | `POST /api/skills/info`           | `{ skillPath: string }`          | `{ name, description }`                                                                                 |

**Baseline TS behavior:**
- `ExtensionRegistry.ts` and `resolvers/SkillResolver.ts` for resolved skill
  shape
- `src/process/resources/skills/` for builtin skill files on disk
- Any routes in `src/process/bridge/` that the `ipcBridge` names route through

Backend-dev's first task is to locate the exact TS source for each endpoint to
lock behavior parity.

## File Structure

### aionui-backend (backend-dev creates/modifies)

- **Create** `crates/aionui-extension/src/skills/mod.rs` — module root for
  `/api/skills/*` handlers.
- **Create** `crates/aionui-extension/src/skills/routes.rs` — axum router
  `skill_router()` registering E1–E5.
- **Create** `crates/aionui-extension/src/skills/types.rs` — request/response
  DTOs shared with `aionui-api-types`.
- **Create** `crates/aionui-extension/src/skills/service.rs` — pure skill
  business logic (list/read), testable without HTTP.
- **Modify** `crates/aionui-extension/src/lib.rs` — re-export `skill_router`.
- **Modify** `crates/aionui-app/src/router.rs` (or wherever the main app
  registers sub-routers) — mount `skill_router` under the base app router.
- **Modify** `crates/aionui-api-types/src/lib.rs` — add Skill DTOs to shared
  types crate.
- **Modify** `docs/api-spec/13-extension.md` — append a new section "Skill
  Library" covering E1–E5.
- **Tests:** `crates/aionui-extension/src/skills/service_tests.rs` (unit) and
  `crates/aionui-extension/tests/skills_http_test.rs` (integration).

### AionUi (frontend-dev)

- **No changes to `src/common/adapter/ipcBridge.ts`** — it's already HTTP-based
  and points at the correct routes (confirmed 2026-04-22). Frontend-dev's job is
  to verify each of E1–E5 returns the right shape and the renderer hooks still
  work.
- **Modify** `src/renderer/pages/settings/SkillsHubSettings.tsx` if any call
  site needs adapting to response-shape changes.
- **Modify** `src/renderer/hooks/assistant/useAssistantEditor.ts` (E1–E2
  callers) if any adaptation is needed.
- **Create** `docs/backend-migration/modules/skill-library.md` — module
  migration record on completion.
- **Create** `docs/backend-migration/handoffs/frontend-skill-library-<date>.md`
  on exit.
- **Tests:** none added unless a Vitest gap exists. Renderer-side validation
  goes through the e2e suite.

### AionUi (e2e-tester)

- **Identify** Playwright/test files in `kaizhou-lab/test/e2e-coverage` that
  exercise the Skill-Library UI.
- **Create** `docs/backend-migration/e2e-reports/YYYY-MM-DD-skill-library.md`
  on each run.
- **Create** `docs/backend-migration/handoffs/e2e-skill-library-<date>.md` on
  exit.

### AionUi (coordinator)

- **Create** `docs/backend-migration/incidents/<date>-<slug>.md` per
  cross-role incident.
- **Create** `docs/backend-migration/handoffs/coordinator-skill-library-<date>.md`
  on pilot exit.

---

## Task 0 — Coordinator setup (executed by me)

**Files:** AionUi repo only (except where noted).

- [ ] **Step 0.1: Fetch all remotes**

```bash
git -C /Users/zhoukai/Documents/github/AionUi fetch origin
git -C /Users/zhoukai/Documents/github/aionui-backend fetch origin
```

Expected: both fetches succeed, `origin/kaizhou-lab/test/e2e-coverage` visible
in AionUi's remote refs.

- [ ] **Step 0.2: Ensure coordinator branch exists and is pushed**

Coordinator branch `feat/backend-migration-coordinator` must exist locally
(created during plan authoring) and be pushed:

```bash
cd /Users/zhoukai/Documents/github/AionUi
git branch --show-current   # expect feat/backend-migration-coordinator
git push -u origin feat/backend-migration-coordinator
```

Expected: branch pushed. `feat/backend-migration` itself is NOT committed to
during this pilot.

- [ ] **Step 0.3: Create frontend-dev branch in AionUi (no worktree)**

Create the branch as a ref only — do NOT check it out; the coordinator keeps
the AionUi working directory on `feat/backend-migration-coordinator` until
it's time to activate frontend-dev.

```bash
cd /Users/zhoukai/Documents/github/AionUi
git branch feat/backend-migration-fe-skill-library origin/feat/backend-migration
git push -u origin feat/backend-migration-fe-skill-library
```

Expected: branch ref created at `origin/feat/backend-migration`'s tip and
pushed. `HEAD` still on `feat/backend-migration-coordinator`.

- [ ] **Step 0.4: Create backend-dev branch in aionui-backend**

Backend-dev's branch is separately checked out in the aionui-backend repo.
This does not interfere with AionUi (separate repos), so it IS checked out
immediately.

```bash
cd /Users/zhoukai/Documents/github/aionui-backend
git fetch origin
git checkout -b feat/extension-skill-library origin/feat/backend-migration
git push -u origin feat/extension-skill-library
```

Expected: aionui-backend is now on `feat/extension-skill-library`, pushed.

- [ ] **Step 0.5: Create e2e branch in AionUi (no worktree)**

Create as a ref only, same rationale as Step 0.3. The e2e branch needs the
frontend-dev branch merged plus `origin/kaizhou-lab/test/e2e-coverage`. We
defer the merge until e2e-tester is activated (Task 4.1), because at that
point frontend-dev will have pushed commits the e2e branch needs to see.

```bash
cd /Users/zhoukai/Documents/github/AionUi
git branch feat/backend-migration-e2e-skill-library feat/backend-migration-fe-skill-library
git push -u origin feat/backend-migration-e2e-skill-library
```

Expected: e2e branch ref created at the same tip as the fe branch (which at
this moment equals `origin/feat/backend-migration`), pushed.

- [ ] **Step 0.6: Directory structure convention**

No directory pre-seeding on teammate branches. Each teammate `mkdir -p` their
own doc subdir on their own branch the first time they need to write a file
there. This avoids relying on coordinator → teammate branch propagation
(which doesn't happen in this workflow — teammates base off
`origin/feat/backend-migration`, not off `feat/backend-migration-coordinator`).

- [ ] **Step 0.7: Create the team**

Call `TeamCreate` with:

```json
{ "team_name": "aionui-backend-migration", "description": "Skill-Library pilot for backend migration" }
```

Expected: team created, task list initialized.

- [ ] **Step 0.8: Register pilot-scoped tasks in TaskList**

Use `TaskCreate` for each teammate-facing task. Tasks 1–5 below map to these;
create them all up front so the taskList reflects the full pilot plan.

- [ ] **Step 0.9: Spawn teammates in the correct order**

Teammates are spawned one at a time. Rule: only **one AionUi-side teammate
active at once** (because there is one AionUi working directory).

Spawn order:
1. **backend-dev** (parallel repo) — spawn first, let them work in
   aionui-backend while the AionUi working directory stays on the coordinator
   branch.
2. **frontend-dev** — before spawning, `cd /Users/zhoukai/Documents/github/AionUi && git checkout feat/backend-migration-fe-skill-library`. Spawn only when
   backend-dev has reported E1 ready (so frontend-dev has something to hit).
3. **e2e-tester** — before spawning, wait for frontend-dev to finish and
   mark their task complete, then `git checkout feat/backend-migration-e2e-skill-library`
   in AionUi. Only then spawn.

For each role, use `Agent` with `team_name: "aionui-backend-migration"`,
`name: "<role>"`, `subagent_type: "general-purpose"`, and a prompt that:
1. Names the teammate, the team, and the coordinator.
2. States the exact repo + branch and `cd`s into it first thing.
3. Quotes their task section from this plan verbatim.
4. States the handoff requirement: "Before your final SendMessage / shutdown,
   write `docs/backend-migration/handoffs/<role>-skill-library-<YYYY-MM-DD>.md`."
5. States commit discipline: "One atomic change = one commit = one push. No PRs.
   Commit messages follow `<type>(<scope>): <subject>` English, no AI
   signatures."

The coordinator does not proceed past Task 0 until all three teammates have
joined the team.

- [ ] **Step 0.10: Commit the plan itself**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git add docs/backend-migration/plans/2026-04-22-skill-library-pilot-plan.md
git commit -m "docs(backend-migration): add skill-library pilot implementation plan"
git push
```

---

## Task 1 — Backend: baseline research + spec draft

**Owner:** `backend-dev`. **Depends on:** Task 0 complete.

**Files:** `aionui-backend/docs/api-spec/13-extension.md` only.

- [ ] **Step 1.1: Locate TS behavior baseline**

In `/Users/zhoukai/Documents/github/AionUi`, read:

```
src/common/adapter/ipcBridge.ts (lines ~301-329 for skill endpoints)
src/process/bridge/             (grep for 'skills' / 'listAvailableSkills' / 'readBuiltinRule' — find actual HTTP handlers)
src/process/extensions/ExtensionRegistry.ts
src/process/extensions/resolvers/SkillResolver.ts
src/process/resources/skills/   (inspect disk layout)
```

Expected output of this step: a short markdown block in the spec describing
where each endpoint currently lives in TS and what it reads from disk.

- [ ] **Step 1.2: Draft Skill Library section in 13-extension.md**

Append a new `## Skill Library` section to
`aionui-backend/docs/api-spec/13-extension.md`. For each of E1–E5 document:

- HTTP method + path
- Request body (type, example JSON)
- Response body (type, example JSON)
- Source of truth on disk (which directory the endpoint reads)
- Error cases (file not found, traversal attempt, etc.)

Use the shapes from the plan's Endpoints table as the starting contract;
update them if you find the TS baseline disagrees, and note the disagreement.

- [ ] **Step 1.3: Commit and push**

```bash
cd /Users/zhoukai/Documents/github/aionui-backend
git add docs/api-spec/13-extension.md
git commit -m "docs(extension): draft Skill Library API spec for pilot migration"
git push
```

- [ ] **Step 1.4: Report to coordinator**

SendMessage to `coordinator` with the spec section heading and commit SHA.
TaskUpdate Task 1 to `completed`.

---

## Task 2 — Backend: implement E1–E5

**Owner:** `backend-dev`. **Depends on:** Task 1 complete.

Each endpoint is its own Step (atomic commit). Within each Step, write the
service-layer unit test first, then the implementation, then the HTTP handler,
then the integration test.

- [ ] **Step 2.1: Bootstrap skills module**

Create `crates/aionui-extension/src/skills/mod.rs`:

```rust
pub mod routes;
pub mod service;
pub mod types;

pub use routes::skill_router;
```

Create `crates/aionui-extension/src/skills/types.rs` with the DTOs from the
spec. Example:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub name: String,
    pub description: String,
    pub location: String,
    pub is_custom: bool,
    pub source: SkillSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    Builtin,
    Custom,
    Extension,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinAutoSkill {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNameRequest {
    pub file_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfoRequest {
    pub skill_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfoResponse {
    pub name: String,
    pub description: String,
}
```

Create an empty `service.rs` and `routes.rs` with module skeletons. Add
`pub mod skills;` to `crates/aionui-extension/src/lib.rs` and re-export
`skill_router`.

Run `cargo check -p aionui-extension`. Expected: compiles.

Commit:

```bash
git add crates/aionui-extension/src/skills/ crates/aionui-extension/src/lib.rs
git commit -m "feat(extension/skills): bootstrap skill library module skeleton"
git push
```

- [ ] **Step 2.2: E1 — `GET /api/skills` (list available skills)**

Write the failing unit test in `service.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn list_skills_returns_builtin_skills() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("builtin/skill-a")).unwrap();
        std::fs::write(
            tmp.path().join("builtin/skill-a/SKILL.md"),
            "---\nname: skill-a\ndescription: A test skill\n---\n",
        ).unwrap();

        let skills = list_skills(&SkillPaths {
            builtin_dir: tmp.path().join("builtin"),
            user_dir: tmp.path().join("user"),
        }).unwrap();

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "skill-a");
        assert_eq!(skills[0].source, SkillSource::Builtin);
        assert!(!skills[0].is_custom);
    }
}
```

Run `cargo test -p aionui-extension skills::service::tests::list_skills_returns_builtin_skills`.
Expected: FAIL, `list_skills` not defined.

Implement `list_skills` and the `SkillPaths` struct in `service.rs` so the
test passes. Reference the TS behavior in `SkillResolver.ts` and anywhere else
you identified in Task 1.2. Parse `SKILL.md` frontmatter with `serde_yaml` or
an equivalent used elsewhere in the crate.

Add the HTTP handler in `routes.rs`:

```rust
use axum::{routing::get, Router, Json, extract::State};
use crate::skills::service;
use crate::skills::types::SkillSummary;

pub fn skill_router(state: AppState) -> Router {
    Router::new()
        .route("/api/skills", get(list_available_skills))
        .with_state(state)
}

async fn list_available_skills(State(state): State<AppState>) -> Result<Json<Vec<SkillSummary>>, ApiError> {
    Ok(Json(service::list_skills(&state.skill_paths)?))
}
```

Mount `skill_router` in the app router (find its location with
`grep -rn extension_router crates/aionui-app/src`).

Add an integration test at
`crates/aionui-extension/tests/skills_http_test.rs`:

```rust
#[tokio::test]
async fn get_api_skills_returns_json_array() {
    let app = test_app_with_seed_skills().await;
    let resp = app.oneshot(
        Request::builder().uri("/api/skills").body(Body::empty()).unwrap()
    ).await.unwrap();
    assert_eq!(resp.status(), 200);
    let body: Vec<serde_json::Value> = serde_json::from_slice(&to_bytes(resp.into_body()).await.unwrap()).unwrap();
    assert!(!body.is_empty());
    assert!(body[0].get("name").is_some());
    assert!(body[0].get("source").is_some());
}
```

Run `cargo test -p aionui-extension`. Expected: both tests pass.

Commit:

```bash
git add crates/aionui-extension/src/skills/ crates/aionui-extension/tests/
git commit -m "feat(extension/skills): implement GET /api/skills"
git push
```

SendMessage to `frontend-dev`: "E1 ready: GET /api/skills — please wire up
`listAvailableSkills` against this branch."

- [ ] **Step 2.3: E2 — `GET /api/skills/builtin-auto`**

TS baseline returns `Array<{ name, description }>` for built-in skills that
are auto-activated. Find the auto-activation filter in TS (grep for
`builtinAuto` in `src/process/`).

Write unit test `list_builtin_auto_skills_filters_non_auto`. Run → FAIL.
Implement. Run → PASS. Add route. Add HTTP test. Run → PASS.

Commit:

```bash
git add -A crates/aionui-extension/
git commit -m "feat(extension/skills): implement GET /api/skills/builtin-auto"
git push
```

SendMessage to `frontend-dev`: "E2 ready."

- [ ] **Step 2.4: E3 — `POST /api/skills/builtin-rule`**

Returns the content of a file under the built-in rules directory.

Security: reject traversal (`..`, absolute paths). Write a traversal-rejection
test first:

```rust
#[test]
fn read_builtin_rule_rejects_traversal() {
    let paths = seed_paths();
    let err = read_builtin_rule(&paths, "../etc/passwd").unwrap_err();
    assert!(matches!(err, SkillError::InvalidPath));
}
```

Run → FAIL. Implement. Run → PASS. Add a happy-path test, route, HTTP test.
Commit:

```bash
git add -A
git commit -m "feat(extension/skills): implement POST /api/skills/builtin-rule"
git push
```

SendMessage `frontend-dev`.

- [ ] **Step 2.5: E4 — `POST /api/skills/builtin-skill`**

Same shape as E3 but against builtin skills dir. Re-use traversal guard. TDD
same as Step 2.4.

Commit: `feat(extension/skills): implement POST /api/skills/builtin-skill`.
Push. SendMessage.

- [ ] **Step 2.6: E5 — `POST /api/skills/info`**

Reads `<skillPath>/SKILL.md` frontmatter and returns `{ name, description }`.
Path may be anywhere on disk (user-supplied); still apply sanity checks
(must exist, must contain `SKILL.md`, reject if parent dir escape from
claimed skill root).

TDD. Commit: `feat(extension/skills): implement POST /api/skills/info`. Push.
SendMessage.

- [ ] **Step 2.7: Cross-verify against spec**

Read back `docs/api-spec/13-extension.md` Skill Library section. Any deltas
between implementation and spec text → update spec now to match reality.

Commit: `docs(extension): align Skill Library spec with implementation`. Push.

- [ ] **Step 2.8: Write backend-dev handoff**

In the aionui-backend repo, on `feat/extension-skill-library`, create:

```
docs/backend-migration/handoffs/backend-dev-skill-library-<YYYY-MM-DD>.md
```

Follow the Step 5.1 template. Include the final commit SHAs for each Ei.

```bash
cd /Users/zhoukai/Documents/github/aionui-backend
mkdir -p docs/backend-migration/handoffs
# write the file
git add docs/backend-migration/handoffs/
git commit -m "docs(backend-migration): backend-dev handoff for skill-library pilot"
git push
```

- [ ] **Step 2.9: Mark Task 2 completed in TaskList, send status to coordinator**

---

## Task 3 — Frontend: wire renderer to new endpoints

**Owner:** `frontend-dev`. **Depends on:** backend-dev has reported at least
E1 ready. Work proceeds per-endpoint as additional Ei become available;
don't wait for all five before starting.

**Pre-activation (coordinator):** before spawning frontend-dev, switch the
AionUi working directory to `feat/backend-migration-fe-skill-library` and
merge `origin/feat/backend-migration` in if needed:

```bash
cd /Users/zhoukai/Documents/github/AionUi
git fetch origin
git checkout feat/backend-migration-fe-skill-library
git merge origin/feat/backend-migration --no-edit   # skip if already up to date
git push
```

**Files:**
- `src/renderer/pages/settings/SkillsHubSettings.tsx`
- `src/renderer/hooks/assistant/useAssistantEditor.ts`
- `src/common/adapter/ipcBridge.ts` (only if spec changed a path/method)

The `ipcBridge.ts` declarations already target `/api/skills/*`. Your job is to
**run the app against the backend branch**, exercise SkillsHubSettings and the
Assistant editor's skill picker, and confirm each Ei behaves as before.

- [ ] **Step 3.1: Point AionUi at the backend-dev branch**

```bash
cd /Users/zhoukai/Documents/github/aionui-backend
git pull --ff-only
cargo build --release
# Note the built binary path (target/release/aionui-backend or similar)
```

In AionUi, set whatever env var or config makes the dev build launch this
binary (check `src/process/backend/` for the resolver). If the resolver picks
up `AIONUI_BACKEND_BIN`, export it for your shell:

```bash
export AIONUI_BACKEND_BIN=/Users/zhoukai/Documents/github/aionui-backend/target/release/aionui-backend
```

- [ ] **Step 3.2: Launch dev mode and exercise E1**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bun install
bun run dev
```

Open SkillsHubSettings. Confirm the skill list renders. Use DevTools Network
tab to confirm `GET /api/skills` is called and returns the expected shape.

If broken, write an incident file:
`docs/backend-migration/incidents/YYYY-MM-DD-E1-<slug>.md`
documenting symptom / request / response / expected. SendMessage to
`backend-dev`. Wait for fix, re-pull, re-test.

- [ ] **Step 3.3: Exercise E2–E5**

For each remaining endpoint, verify in-UI:
- E2: open Assistant edit drawer → Auto-Skills picker populated
- E3/E4: open Assistant edit drawer → built-in rule/skill preview loads file
  content
- E5: use the "Add Skill" flow with a custom path → info loads

For any failure, repeat the incident-file-and-SendMessage loop.

- [ ] **Step 3.4: Run Vitest**

```bash
cd /Users/zhoukai/Documents/github/AionUi
bun run test -- --run src/renderer/hooks/assistant src/renderer/pages/settings
```

Expected: no regressions. If any existing test now fails due to the HTTP
migration, fix the test (the implementation already changed, tests need to
reflect the new contract).

Commit per fix:

```bash
git add <changed test file>
git commit -m "test(assistant): update hook tests for HTTP skill endpoints"
git push
```

- [ ] **Step 3.5: Write module migration record**

Create `docs/backend-migration/modules/skill-library.md`:

- Endpoints migrated + commit SHAs
- Any shape changes the backend made vs. what `ipcBridge.ts` had
- Renderer files touched
- Known caveats / follow-ups

Commit: `docs(backend-migration): record skill-library module migration`.
Push.

- [ ] **Step 3.6: Write frontend-dev handoff**

Create `docs/backend-migration/handoffs/frontend-dev-skill-library-<YYYY-MM-DD>.md`
following the Step 5.1 template.

```bash
cd /Users/zhoukai/Documents/github/AionUi
mkdir -p docs/backend-migration/handoffs
# write the file
git add docs/backend-migration/handoffs/
git commit -m "docs(backend-migration): frontend-dev handoff for skill-library pilot"
git push
```

- [ ] **Step 3.7: Notify coordinator**

SendMessage coordinator: "Task 3 complete. Branch
`feat/backend-migration-fe-skill-library` at commit <sha>. Released the
AionUi working directory — coordinator may switch to the e2e branch."
TaskUpdate Task 3 to `completed`.

---

## Task 4 — E2E: run coverage suite against the new stack

**Owner:** `e2e-tester`. **Depends on:** Task 3.1 through 3.5 complete AND
`frontend-dev` has SendMessage'd readiness.

**Files:**
- `docs/backend-migration/e2e-reports/YYYY-MM-DD-skill-library.md` (created)

**Pre-activation (coordinator):** before spawning e2e-tester, confirm
frontend-dev has marked Task 3 complete and released the AionUi working
directory. Then coordinator switches AionUi to the e2e branch, merges in
the frontend branch's latest, and merges in `kaizhou-lab/test/e2e-coverage`:

```bash
cd /Users/zhoukai/Documents/github/AionUi
git fetch origin
git checkout feat/backend-migration-e2e-skill-library
git merge origin/feat/backend-migration-fe-skill-library --no-edit
git merge origin/kaizhou-lab/test/e2e-coverage --no-edit
git push
```

If conflicts during `kaizhou-lab/test/e2e-coverage` merge: resolve (prefer
e2e-coverage for test infrastructure, prefer the fe branch for renderer
source), commit, push.

- [ ] **Step 4.1: Confirm the e2e branch is ready**

e2e-tester verifies they are on `feat/backend-migration-e2e-skill-library`
with the frontend and e2e-coverage merges already present (coordinator did
this pre-activation):

```bash
cd /Users/zhoukai/Documents/github/AionUi
git branch --show-current  # expect feat/backend-migration-e2e-skill-library
git log --oneline -5        # recent commits should include the coord merges
```

- [ ] **Step 4.2: Identify Skill-Library e2e tests**

Grep e2e sources for skill/SkillsHub test cases:

```bash
grep -rln "SkillsHub\|listAvailableSkills\|builtin-rule\|builtin-skill\|/api/skills" e2e tests 2>/dev/null
```

Produce a list of test files/cases that exercise E1–E5. If **no existing
coverage**, SendMessage the coordinator: "Pilot cannot succeed — e2e-coverage
branch has no Skill-Library tests. Need decision." Do NOT write new tests
yourself unless the coordinator explicitly directs you to.

- [ ] **Step 4.3: Boot the app against backend branch and run e2e**

```bash
export AIONUI_BACKEND_BIN=/Users/zhoukai/Documents/github/aionui-backend/target/release/aionui-backend
bun run e2e -- <skill-library-tests>
```

Capture full output. Save pass/fail matrix.

- [ ] **Step 4.4: Write the report**

Create `docs/backend-migration/e2e-reports/YYYY-MM-DD-skill-library.md`:

```markdown
# E2E Report — Skill-Library Pilot — <date>

**Frontend commit:** <sha>
**Backend commit:** <sha>
**E2E branch commit:** <sha>

## Cases run
- <test-file>::<case> — PASS / FAIL

## Failures
For each FAIL:
- Symptom (error excerpt)
- Request/response captured
- Repro steps
```

Commit:

```bash
git add docs/backend-migration/e2e-reports/YYYY-MM-DD-skill-library.md
git commit -m "docs(backend-migration): e2e report for skill-library pilot"
git push
```

- [ ] **Step 4.5: Write e2e-tester handoff**

Create `docs/backend-migration/handoffs/e2e-tester-skill-library-<YYYY-MM-DD>.md`
following the Step 5.1 template. Reference the e2e report committed in Step
4.4.

```bash
cd /Users/zhoukai/Documents/github/AionUi
mkdir -p docs/backend-migration/handoffs
# write the file
git add docs/backend-migration/handoffs/
git commit -m "docs(backend-migration): e2e-tester handoff for skill-library pilot"
git push
```

- [ ] **Step 4.6: Report**

- ALL PASS: SendMessage coordinator: "E2E green. Skill-Library pilot meets
  success criteria." TaskUpdate Task 4 completed.
- ANY FAIL: write incident file under `docs/backend-migration/incidents/` and
  SendMessage the relevant dev (backend-dev if wire-level failure,
  frontend-dev if UI-level failure). Loop back to their task. Do NOT mark
  Task 4 complete yet.

  **Loop handling:** if the failure needs frontend-dev to fix something:
  coordinator switches AionUi from the e2e branch back to
  `feat/backend-migration-fe-skill-library`, reactivates frontend-dev, waits
  for the fix + handoff update, then switches back to the e2e branch and
  reactivates e2e-tester for a re-run. If the failure needs backend-dev:
  message backend-dev in parallel (no AionUi branch switch needed).

---

## Task 5 — Handoffs and coordinator closure

Because AionUi-side roles are serialized, each teammate **writes their
handoff as the last step of their own task**, before releasing the working
directory. The handoffs therefore happen in order:
- backend-dev at the end of Task 2 (parallel repo, can happen anytime after
  Task 2 completes)
- frontend-dev at the end of Task 3
- e2e-tester at the end of Task 4
- coordinator at Step 5.2

- [ ] **Step 5.1: Handoff file template**

Every teammate creates:
`docs/backend-migration/handoffs/<role>-skill-library-<YYYY-MM-DD>.md`

Structure:

```markdown
# <Role> Handoff — Skill-Library — <date>

**Branch:** <branch>
**Last commit:** <sha>

## Done
- <bullet list of delivered items>

## In flight
- <anything partially done, or "none">

## Known issues / open questions
- <bullets, or "none">

## Next steps for a successor
- <actionable bullets>
```

Commit + push on own branch: `docs(backend-migration): <role> handoff for
skill-library pilot`. Each role's task description points at this template.

- [ ] **Step 5.2: Coordinator closes the pilot (no base-branch merge)**

Coordinator does **NOT** merge `feat/backend-migration-fe-skill-library` into
AionUi's `feat/backend-migration`, nor `feat/extension-skill-library` into
aionui-backend's `feat/backend-migration`. Integration of pilot work back
into `feat/backend-migration` in either repo is explicitly deferred as a
separate, user-approved step after the pilot.

Coordinator switches AionUi back to `feat/backend-migration-coordinator`:

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout feat/backend-migration-coordinator
```

Coordinator writes own handoff at
`docs/backend-migration/handoffs/coordinator-skill-library-<date>.md`
summarizing:
- Pilot outcome
- Lessons learned (what worked, what didn't in the workflow itself)
- Recommended adjustments before starting module #2
- Pointers to each teammate's branch tip (SHAs) so the next module's work
  can start from a known state

Commit + push:

```bash
git add docs/backend-migration/handoffs/coordinator-skill-library-*.md
git commit -m "docs(backend-migration): coordinator handoff for skill-library pilot"
git push
```

- [ ] **Step 5.3: Shutdown teammates**

SendMessage to each with `{"type":"shutdown_request"}`. After all three
shutdown_responses, pilot is closed.

---

## Coordinator Responsibilities (throughout Tasks 1–4)

No periodic sync loop — serialized AionUi-side execution means each branch
has a single owner and no other activity that would cause drift. Coordinator
responsibilities reduce to:

1. **Monitor teammate messages.** When a teammate pings (progress, question,
   incident, completion), respond promptly via SendMessage.
2. **Switch AionUi branches at stage transitions** (pre-Task 3, pre-Task 4,
   post-Task 5) exactly as described in those tasks' pre-activation blocks.
   Always `git fetch` first; merge the base in if the branch has drifted.
3. **Replace unresponsive teammates** using situational judgment (Q4). On
   replacement: SendMessage shutdown to the original, spawn a replacement of
   the same role, reassign their TaskList task's owner. Committed work is
   already on the remote; the replacement continues from there.
4. **Mediate incidents.** Between frontend-dev and backend-dev, an interface
   mismatch is tracked as an incident file; coordinator routes the incident
   to the right teammate and tracks resolution in TaskList.

Conflict-handling when coordinator merges base → teammate branch:
- Non-semantic conflict (imports, lockfile, format): resolve yourself.
- Semantic conflict (business logic, types): SendMessage the owning dev with
  a conflict summary and pause the switch until they respond.

---

## Success Criteria

From the spec — pilot is successful when ALL of:

- [ ] Task 2 completed: all 5 endpoints implemented, unit + HTTP tests green
- [ ] Task 3 completed: frontend renders Skill Library UI against new backend
- [ ] Task 4 completed: e2e suite from `kaizhou-lab/test/e2e-coverage`
      covering Skill-Library endpoints passes
- [ ] Task 5 completed: every teammate has a handoff file, coordinator has
      merged branches and written closure doc
- [ ] `docs/backend-migration/modules/skill-library.md` exists and summarizes
      the migration
