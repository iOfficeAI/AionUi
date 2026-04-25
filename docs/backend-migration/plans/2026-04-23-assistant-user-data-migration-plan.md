# Assistant User Data Migration — Implementation Plan

> **For teammates:** This plan runs in **team mode** — coordinator + multiple
> parallel teammates (NOT subagent-driven-development). Each teammate owns a
> numbered Task and works on their own branch. Steps use checkbox (`- [ ]`)
> syntax for tracking.
>
> **Companion specs:**
>
> - [`AionUi/docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md`](../specs/2026-04-23-assistant-user-data-migration-design.md)
> - [`aionui-backend/docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md`](../../../../aionui-backend/docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md)
>
> **Reference plans (pattern reuse):**
>
> - [`2026-04-22-skill-library-pilot-plan.md`](./2026-04-22-skill-library-pilot-plan.md) — team coordination patterns
> - [`2026-04-23-assistant-module-verification-plan.md`](./2026-04-23-assistant-module-verification-plan.md) — hand-off discipline

**Goal:** Move user-authored assistant definitions from Electron's
`ConfigStorage.get('assistants')` into the Rust backend as the single source
of truth, with a new `aionui-assistant` crate, backward-compatible rule-md
dispatch, and a one-shot first-launch migration.

**Architecture:** New domain crate `aionui-assistant` follows `aionui-system`'s
strongly-typed-service pattern. Built-in assistants load from
`{backend_exe}/assets/builtin-assistants/` at startup (no DB seed). User
assistants live in a new SQLite `assistants` table; per-assistant user state
(enabled/sort_order) in `assistant_overrides`. Merge of
built-in + user + extension happens server-side in `AssistantService::list()`.

**Tech Stack:** Rust 2024 + axum 0.8 + sqlx 0.8 + serde (backend);
TypeScript + React + Electron + Vitest + Playwright (frontend). Two
coordinated branches, one per repo.

**Team size:** 1 coordinator + 4 role-teammates (backend-dev, backend-tester,
frontend-dev, frontend-tester, e2e-tester — 5 teammates, 6 with coordinator).

---

## Branches

| Branch                                       | Repo           | Base                                            | Owner(s)                                  |
| -------------------------------------------- | -------------- | ----------------------------------------------- | ----------------------------------------- |
| `feat/backend-migration-coordinator`         | AionUi         | (reused from earlier pilots)                    | coordinator                               |
| `feat/backend-migration-assistant-user-data` | AionUi         | `origin/feat/backend-migration-coordinator`     | frontend-dev, frontend-tester, e2e-tester |
| `feat/assistant-user-data`                   | aionui-backend | `origin/archive/skill-library-pilot-2026-04-23` | backend-dev, backend-tester               |

---

## Task dependency graph

```
T0  (coordinator setup)
 │
 ▼
T1a (backend-dev: crate scaffolding + HTTP contract types + migration file)
 │
 ├──► T1b (backend-dev: service + routes + tests)──► T2 (backend-tester)
 │
 └──► T3a (frontend-dev: TS types + ipcBridge + hooks rewrite)
        │
        └──► T3b (frontend-dev: main-process migration hook)
              │
              └──► T4 (frontend-tester: Vitest + lint + tsc)
                    │
    T2 + T4 ────────┴──► T5 (e2e-tester: Playwright)
                          │
                          └──► T6 (coordinator closure + merge)
```

**Parallelization:** T1b and (T3a → T3b → T4) run in parallel after T1a.
T2 depends only on T1b. T5 waits for both T2 and T4.

Critical path: T0 → T1a → T1b → T2 → T5 → T6.

---

## Task 0 — Coordinator setup

**Owner:** coordinator. **Depends on:** nothing.

### Step 0.1 — Fetch all remotes

- [ ] Run:
  ```bash
  git -C /Users/zhoukai/Documents/github/AionUi fetch origin
  git -C /Users/zhoukai/Documents/github/aionui-backend fetch origin
  ```

### Step 0.2 — Create AionUi verification branch

- [ ] Run:
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git checkout -b feat/backend-migration-assistant-user-data origin/feat/backend-migration
  git push -u origin feat/backend-migration-assistant-user-data
  ```

Expected: branch exists on remote at `origin/feat/backend-migration` tip.

### Step 0.3 — Create aionui-backend feature branch

- [ ] Run:
  ```bash
  cd /Users/zhoukai/Documents/github/aionui-backend
  git checkout -b feat/assistant-user-data origin/main
  git push -u origin feat/assistant-user-data
  ```

### Step 0.4 — Verify current migration count

- [ ] Run:

  ```bash
  ls /Users/zhoukai/Documents/github/aionui-backend/crates/aionui-db/migrations/ | sort
  ```

- [ ] Note the highest number prefix (e.g. `002_...sql`). The new migration
      created in T1a.2 uses the next number.

### Step 0.5 — Create team + tasks

- [ ] Via TeamCreate:

  ```
  TeamCreate { team_name: "aionui-assistant-migration",
               description: "Migrate user-authored assistants from Electron config to backend DB" }
  ```

- [ ] Register tasks with owners:
  - Task 1a — backend-dev
  - Task 1b — backend-dev
  - Task 2 — backend-tester
  - Task 3a — frontend-dev
  - Task 3b — frontend-dev
  - Task 4 — frontend-tester
  - Task 5 — e2e-tester
  - Task 6 — coordinator

- [ ] Set `addBlockedBy`:
  - 1b blocks on 1a
  - 2 blocks on 1b
  - 3a blocks on 1a
  - 3b blocks on 3a
  - 4 blocks on 3a
  - 5 blocks on 2 and 4
  - 6 blocks on 5

### Step 0.6 — Commit plan + specs to coordinator branch

- [ ] Run:

  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git checkout feat/backend-migration-coordinator
  git merge origin/feat/backend-migration --no-edit
  git add docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md
  git add docs/backend-migration/plans/2026-04-23-assistant-user-data-migration-plan.md
  git commit -m "docs(backend-migration): add assistant user-data migration spec and plan"
  git push
  ```

- [ ] Coordinator keeps polling TaskList; when 1a is in_progress, move on.

---

## Task 1a — Backend scaffolding + contract types

**Owner:** backend-dev. **Depends on:** T0.

**Goal:** Produce the shared HTTP contract (Rust types + route skeleton +
migration file + empty crate shell) so T3a can start in parallel.

**Branch:** `feat/assistant-user-data` (aionui-backend).

**Pre-activation pulses:**

- [ ] TaskUpdate owner=backend-dev, status=in_progress on Task 1a
- [ ] SendMessage to coordinator: `"backend-dev alive on T1a"`
- [ ] `git rev-parse --abbrev-ref HEAD` → confirm `feat/assistant-user-data`

### Step 1a.1 — Add `aionui-assistant` crate to workspace

- [ ] Create `/Users/zhoukai/Documents/github/aionui-backend/crates/aionui-assistant/Cargo.toml`:

  ```toml
  [package]
  name = "aionui-assistant"
  version.workspace = true
  edition.workspace = true
  license.workspace = true

  [dependencies]
  aionui-common = { workspace = true }
  aionui-api-types = { workspace = true }
  aionui-db = { workspace = true }
  aionui-auth = { workspace = true }
  aionui-extension = { workspace = true }
  axum = { workspace = true }
  serde = { workspace = true }
  serde_json = { workspace = true }
  tokio = { workspace = true }
  tracing = { workspace = true }
  thiserror = { workspace = true }
  async-trait = { workspace = true }
  chrono = { workspace = true }
  uuid = { workspace = true }

  [dev-dependencies]
  aionui-db = { workspace = true }
  tempfile = { workspace = true }
  tower = { workspace = true }
  http-body-util = { workspace = true }
  ```

- [ ] Create `crates/aionui-assistant/src/lib.rs`:

  ```rust
  //! User-authored assistant management.
  //!
  //! Owns the `assistants` and `assistant_overrides` tables, built-in
  //! assistant loading from on-disk manifest, and merge logic for
  //! `GET /api/assistants` across builtin + user + extension sources.

  pub mod builtin;
  pub mod routes;
  pub mod service;
  pub mod state;

  pub use builtin::{BuiltinAssistant, BuiltinAssistantRegistry};
  pub use routes::{assistant_routes, AssistantRouterState};
  pub use service::AssistantService;
  ```

- [ ] Create empty module files `builtin.rs`, `routes.rs`, `service.rs`,
      `state.rs` (each with a one-line doc comment).

- [ ] Edit `/Users/zhoukai/Documents/github/aionui-backend/Cargo.toml`:

  ```toml
  # Add to [workspace.members]:
  "crates/aionui-assistant",

  # Add to [workspace.dependencies]:
  aionui-assistant = { path = "crates/aionui-assistant" }
  ```

- [ ] Run:

  ```bash
  cd /Users/zhoukai/Documents/github/aionui-backend
  cargo build --workspace
  ```

  Expected: compiles cleanly.

### Step 1a.2 — SQLite migration

- [ ] Determine next migration number: `ls crates/aionui-db/migrations/ | sort | tail -1`
      → use N+1 (example: `003_assistants.sql`).

- [ ] Create `crates/aionui-db/migrations/NNN_assistants.sql`:

  ```sql
  CREATE TABLE assistants (
      id                        TEXT PRIMARY KEY,
      name                      TEXT NOT NULL,
      description               TEXT,
      avatar                    TEXT,
      preset_agent_type         TEXT NOT NULL DEFAULT 'gemini',
      enabled_skills            TEXT,
      custom_skill_names        TEXT,
      disabled_builtin_skills   TEXT,
      prompts                   TEXT,
      models                    TEXT,
      name_i18n                 TEXT,
      description_i18n          TEXT,
      prompts_i18n              TEXT,
      created_at                INTEGER NOT NULL,
      updated_at                INTEGER NOT NULL
  );

  CREATE INDEX idx_assistants_updated_at ON assistants (updated_at DESC);

  CREATE TABLE assistant_overrides (
      assistant_id   TEXT PRIMARY KEY,
      enabled        INTEGER NOT NULL DEFAULT 1,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      last_used_at   INTEGER,
      updated_at     INTEGER NOT NULL
  );
  ```

- [ ] Run:

  ```bash
  cargo test --package aionui-db
  ```

  Expected: existing tests all pass (migration applies cleanly to in-memory
  DB).

### Step 1a.3 — Repository traits + row models

- [ ] Create `crates/aionui-db/src/models/assistant.rs` per backend spec §3.3
      (`AssistantRow`, `AssistantOverrideRow`, `CreateAssistantParams`,
      `UpdateAssistantParams`, `UpsertOverrideParams` — copy from spec verbatim).

- [ ] Add to `crates/aionui-db/src/models/mod.rs`:

  ```rust
  pub mod assistant;
  pub use assistant::*;
  ```

- [ ] Create `crates/aionui-db/src/repository/assistant.rs` with
      `IAssistantRepository` and `IAssistantOverrideRepository` traits per spec
      §3.4. Include `async_trait`.

- [ ] Create `crates/aionui-db/src/repository/sqlite_assistant.rs` with
      skeleton `SqliteAssistantRepository` and `SqliteAssistantOverrideRepository`.
      **For this task, return `unimplemented!()` in each method body** — T1b
      fills in actual SQL.

- [ ] Wire into `crates/aionui-db/src/repository/mod.rs`.

- [ ] Run:

  ```bash
  cargo build --workspace
  ```

  Expected: compiles (unimplemented bodies don't break build).

### Step 1a.4 — HTTP contract types in `aionui-api-types`

- [ ] Create `crates/aionui-api-types/src/assistant.rs` with exactly the types
      from backend spec §3.1 and §6.2:
  - `AssistantResponse` + `AssistantSource`
  - `CreateAssistantRequest`
  - `UpdateAssistantRequest`
  - `SetAssistantStateRequest`
  - `ImportAssistantsRequest`
  - `ImportAssistantsResult`
  - `ImportError`

  All `#[serde(rename_all = "camelCase")]`.

- [ ] Add to `crates/aionui-api-types/src/lib.rs`:

  ```rust
  pub mod assistant;
  pub use assistant::*;
  ```

- [ ] Run:
  ```bash
  cargo build --package aionui-api-types
  ```

### Step 1a.5 — Route skeleton (handlers return 501)

- [ ] In `crates/aionui-assistant/src/state.rs`, define:

  ```rust
  use std::sync::Arc;
  use aionui_db::{IAssistantRepository, IAssistantOverrideRepository};
  use aionui_extension::ExtensionRegistry;
  use crate::{AssistantService, BuiltinAssistantRegistry};

  #[derive(Clone)]
  pub struct AssistantRouterState {
      pub service: Arc<AssistantService>,
  }
  ```

- [ ] In `crates/aionui-assistant/src/routes.rs`, scaffold the full route table
      per backend spec §6.1, with each handler returning
      `Err(AppError::Internal("not implemented".into()))`.

- [ ] Wire into `aionui-app` just enough to compile: add
      `aionui-assistant = { workspace = true }` to `crates/aionui-app/Cargo.toml`,
      and merge `assistant_routes(...)` in `create_router` guarded behind a
      compile-time `if true` block (no auth yet — T1b completes wiring).

- [ ] Run:
  ```bash
  cargo build --workspace
  cargo clippy --workspace -- -D warnings
  ```

### Step 1a.6 — Commit + hand off

- [ ] Run:

  ```bash
  cd /Users/zhoukai/Documents/github/aionui-backend
  git add crates/aionui-assistant crates/aionui-db crates/aionui-api-types crates/aionui-app Cargo.toml Cargo.lock
  git commit -m "feat(assistant): scaffold aionui-assistant crate + HTTP contract types + migration

  Adds:
  - crates/aionui-assistant shell with builtin/routes/service/state modules
  - SQLite migration NNN_assistants.sql (assistants + assistant_overrides)
  - Repository traits (IAssistantRepository, IAssistantOverrideRepository)
    with unimplemented SqliteAssistant* stubs
  - aionui-api-types::assistant request/response types
  - Route skeleton returning 501 (implementation lands in T1b)

  Ref: docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md"
  git push
  ```

- [ ] Record exact SHA: `git rev-parse HEAD` → store for hand-off.

- [ ] SendMessage to coordinator:
      `"T1a complete at SHA <hex>. Frontend-dev unblocked. Starting T1b."`

- [ ] TaskUpdate T1a status=completed, T1b status=in_progress.

---

## Task 1b — Backend service + routes + tests

**Owner:** backend-dev. **Depends on:** T1a.

**Goal:** Implement `AssistantService::list/create/update/delete/set_state/import`

- rule-md dispatch + `BuiltinAssistantRegistry` loader + repository SQL +
  in-crate unit tests. Leave HTTP E2E testing to T2.

**Files:**

- `crates/aionui-db/src/repository/sqlite_assistant.rs` (fill in SQL)
- `crates/aionui-assistant/src/builtin.rs`
- `crates/aionui-assistant/src/service.rs`
- `crates/aionui-assistant/src/routes.rs` (replace 501 stubs)
- `crates/aionui-extension/src/skill_routes.rs` (rule-md + skill-md dispatch)
- `crates/aionui-app/src/lib.rs` (wire real state + auth middleware)
- `crates/aionui-app/assets/builtin-assistants/assistants.json` + rule mds
- `crates/aionui-app/build.rs` (asset placement)

### Step 1b.1 — Implement repository SQL

- [ ] In `sqlite_assistant.rs`, implement all methods on both traits using
      the same sqlx patterns as `sqlite_settings.rs`. Key queries:

  ```rust
  // IAssistantRepository::list
  sqlx::query_as::<_, AssistantRow>(
      "SELECT * FROM assistants ORDER BY updated_at DESC"
  ).fetch_all(&self.pool).await

  // IAssistantRepository::create — returns inserted row
  // IAssistantRepository::update — partial update with COALESCE; returns Some if row existed
  // IAssistantRepository::delete — returns bool (did any row get deleted)
  // IAssistantRepository::upsert — still expose for other callers; NOT used by import
  ```

- [ ] Inline test each public method in `#[cfg(test)]` with
      `init_database_memory()` fixture. Aim ≥ 2 cases per method (happy + at
      least one edge).

### Step 1b.2 — `BuiltinAssistantRegistry`

- [ ] In `crates/aionui-assistant/src/builtin.rs`:

  ```rust
  use std::collections::HashMap;
  use std::path::{Path, PathBuf};
  use std::sync::Arc;
  use serde::Deserialize;
  use tracing::{warn, error};

  #[derive(Debug, Clone, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct BuiltinAssistant {
      pub id: String,
      pub name: String,
      #[serde(default)]
      pub name_i18n: HashMap<String, String>,
      #[serde(default)]
      pub description: Option<String>,
      #[serde(default)]
      pub description_i18n: HashMap<String, String>,
      #[serde(default)]
      pub avatar: Option<String>,
      pub preset_agent_type: String,
      #[serde(default)]
      pub enabled_skills: Vec<String>,
      #[serde(default)]
      pub custom_skill_names: Vec<String>,
      #[serde(default)]
      pub disabled_builtin_skills: Vec<String>,
      #[serde(default)]
      pub rule_file: Option<String>,   // relative to assets_dir, may contain "{locale}"
      #[serde(default)]
      pub skill_file: Option<String>,  // parallel to rule_file, for /api/skills/assistant-skill/*
      #[serde(default)]
      pub prompts: Vec<String>,
      #[serde(default)]
      pub prompts_i18n: HashMap<String, Vec<String>>,
      #[serde(default)]
      pub models: Vec<String>,
  }

  #[derive(Debug, Deserialize)]
  struct BuiltinManifest {
      #[serde(default)]
      version: String,
      #[serde(default)]
      assistants: Vec<BuiltinAssistant>,
  }

  pub struct BuiltinAssistantRegistry {
      assistants: HashMap<String, BuiltinAssistant>,
      assets_dir: PathBuf,
  }

  impl BuiltinAssistantRegistry {
      pub fn load() -> Self {
          let assets_dir = match resolve_builtin_assets_dir() {
              Some(p) => p,
              None => {
                  warn!("Built-in assistants directory not resolvable; using empty registry");
                  return Self::empty();
              }
          };
          let manifest_path = assets_dir.join("assistants.json");
          let content = match std::fs::read_to_string(&manifest_path) {
              Ok(c) => c,
              Err(e) => {
                  warn!("Built-in manifest missing at {}: {}", manifest_path.display(), e);
                  return Self { assistants: HashMap::new(), assets_dir };
              }
          };
          let manifest: BuiltinManifest = match serde_json::from_str(&content) {
              Ok(m) => m,
              Err(e) => {
                  error!("Built-in manifest parse failed: {}", e);
                  return Self { assistants: HashMap::new(), assets_dir };
              }
          };
          let assistants = manifest
              .assistants
              .into_iter()
              .map(|a| (a.id.clone(), a))
              .collect();
          Self { assistants, assets_dir }
      }

      pub fn empty() -> Self {
          Self { assistants: HashMap::new(), assets_dir: PathBuf::new() }
      }

      pub fn all(&self) -> impl Iterator<Item = &BuiltinAssistant> {
          self.assistants.values()
      }

      pub fn get(&self, id: &str) -> Option<&BuiltinAssistant> {
          self.assistants.get(id)
      }

      pub fn has(&self, id: &str) -> bool {
          self.assistants.contains_key(id)
      }

      pub fn rule_path(&self, id: &str, locale: &str) -> Option<PathBuf> {
          let a = self.assistants.get(id)?;
          let rel = a.rule_file.as_ref()?;
          let resolved = rel.replace("{locale}", locale);
          Some(self.assets_dir.join(resolved))
    }

      pub fn skill_path(&self, id: &str, locale: &str) -> Option<PathBuf> {
          let a = self.assistants.get(id)?;
          let rel = a.skill_file.as_ref()?;
          let resolved = rel.replace("{locale}", locale);
          Some(self.assets_dir.join(resolved))
      }

      pub fn avatar_path(&self, id: &str) -> Option<PathBuf> {
          let a = self.assistants.get(id)?;
          let rel = a.avatar.as_ref()?;
          Some(self.assets_dir.join(rel))
      }
  }

  fn resolve_builtin_assets_dir() -> Option<PathBuf> {
      if let Ok(env) = std::env::var("AIONUI_BUILTIN_ASSISTANTS_PATH") {
          return Some(PathBuf::from(env));
      }
      let exe = std::env::current_exe().ok()?;
      let dir = exe.parent()?.join("assets").join("builtin-assistants");
      if dir.exists() { return Some(dir); }
      // Dev fallback: cargo run from workspace root
      let cargo_dir = std::env::var("CARGO_MANIFEST_DIR").ok()?;
      let dev = PathBuf::from(cargo_dir)
          .parent()?
          .join("aionui-app")
          .join("assets")
          .join("builtin-assistants");
      if dev.exists() { return Some(dev); }
      None
  }
  ```

- [ ] Inline tests in `#[cfg(test)]`: happy load / missing dir / malformed
      JSON / empty list / path resolution with `{locale}`.

### Step 1b.3 — `AssistantService`

- [ ] Implement per backend spec §5 — `list/get/create/update/delete/set_state/import`
      and rule/skill dispatch helpers (`read_rule`, `write_rule`, `delete_rule`,
      same for `_skill`, `classify`).

- [ ] Implement `AssistantSource` classification using:
  1. `BuiltinAssistantRegistry::has`
  2. `ExtensionRegistry::has_assistant` (add this helper if missing — see
     §1b.3a below)
  3. Fallback `AssistantSource::User`

- [ ] **Critical `import` implementation** — insert-only per backend spec §6.3:

  ```rust
  pub async fn import(&self, req: ImportAssistantsRequest) -> Result<ImportAssistantsResult, AppError> {
      let mut result = ImportAssistantsResult::default();
      for req in req.assistants {
          let id = req.id.clone().unwrap_or_else(|| generate_user_id());
          // Skip: built-in id conflict
          if self.builtin.has(&id) { result.skipped += 1; continue; }
          // Skip: extension id conflict
          if self.extension_registry.has_assistant(&id).await {
              result.skipped += 1; continue;
          }
          // Skip: already-imported user row
          if self.repo.get(&id).await?.is_some() {
              result.skipped += 1; continue;
          }
          // Insert
          let params = CreateAssistantParams::from_request(&id, &req)?;
          match self.repo.create(&params).await {
              Ok(_) => result.imported += 1,
              Err(e) => {
                  result.failed += 1;
                  result.errors.push(ImportError { id, error: e.to_string() });
              }
          }
      }
      Ok(result)
  }
  ```

- [ ] Merge logic in `list()` per spec §5.1 — preserve sort order correctly
      (sort_order asc, last_used_at desc fallback).

- [ ] Inline tests per backend spec §9.1 — every behavior row mapped to a
      named test.

### Step 1b.3a — Extend `ExtensionRegistry`

- [ ] If `ExtensionRegistry::has_assistant(id)` and
      `get_assistant_by_id(id)` don't exist, add them to
      `crates/aionui-extension/src/registry.rs`:

  ```rust
  pub async fn has_assistant(&self, id: &str) -> bool {
      self.get_assistants().await.iter().any(|a| a.id == id)
  }

  pub async fn get_assistant_by_id(&self, id: &str) -> Option<ResolvedAssistant> {
      self.get_assistants().await.into_iter().find(|a| a.id == id)
  }
  ```

- [ ] No new test file needed — existing `get_assistants` tests cover the
      lookup primitive.

### Step 1b.4 — Rule-md + skill-md dispatch in `aionui-extension`

- [ ] Extend `crates/aionui-extension/src/skill_routes.rs` handlers for:
  - `POST /api/skills/assistant-rule/read`
  - `POST /api/skills/assistant-rule/write`
  - `DELETE /api/skills/assistant-rule/{assistantId}`
  - `POST /api/skills/assistant-skill/read`
  - `POST /api/skills/assistant-skill/write`
  - `DELETE /api/skills/assistant-skill/{assistantId}`

- [ ] Each handler calls into `AssistantClassifier::classify` — define this
      trait in `aionui-common::traits` (or `aionui-extension`'s own module; pick
      wherever keeps dep graph cleanest):

  ```rust
  #[async_trait::async_trait]
  pub trait AssistantClassifier: Send + Sync {
      async fn classify(&self, id: &str) -> AssistantSource;
  }
  ```

  Wire `AssistantService` to implement this trait so
  `crates/aionui-extension/src/skill_routes.rs` can depend on the trait
  without pulling in `aionui-assistant` directly.

- [ ] In each handler:
  - `read` → dispatch to builtin rule_path / extension resolved_rule_content /
    user file under `~/.aionui/assistant-rules/` (or `-skills/`). Missing →
    empty string.
  - `write` → 400 for builtin/extension; user writes go through.
  - `delete` → same 400 rule.

- [ ] Preserve existing 7 endpoints' response shapes (regression must stay
      green — see `modules/assistant.md`).

- [ ] Add integration tests to `crates/aionui-extension/tests/` covering
      the three dispatch paths for both `rule` and `skill`.

### Step 1b.5 — Built-in asset files

- [ ] Create `crates/aionui-app/assets/builtin-assistants/assistants.json`.
      Content source: take the existing frontend
      `src/common/config/presets/assistantPresets.ts` array (from the AionUi
      repo), translate each entry to the manifest schema (§4.2 of backend spec).
      Keep the full PRESET_ID_WHITELIST in sync — **both the backend manifest
      and the T3b whitelist must list the same ids**.

- [ ] For each entry with a rule file, copy the existing md files under
      `~/Library/Application Support/AionUi-Dev/config/assistants/*.md` (or
      equivalent in the repo at frontend `src/...` if committed there) into
      `crates/aionui-app/assets/builtin-assistants/rules/{id}.{locale}.md`.

- [ ] Commit the PRESET_ID_WHITELIST list separately as a JSON fixture at
      `crates/aionui-app/assets/builtin-assistants/preset-id-whitelist.json` for
      the frontend migration hook to read (or mirror in frontend code — T3b
      decides).

### Step 1b.6 — Build-time asset placement (build.rs)

- [ ] Create `crates/aionui-app/build.rs`:

  ```rust
  use std::fs;
  use std::path::{Path, PathBuf};

  fn main() {
      println!("cargo:rerun-if-changed=assets/builtin-assistants");

      let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/builtin-assistants");
      if !src.exists() {
          println!("cargo:warning=assets/builtin-assistants missing; skipping copy");
          return;
      }

      let out_dir = PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
      // OUT_DIR is e.g. target/<profile>/build/<pkg>-<hash>/out
      // Walk up to target/<profile>/
      let target_dir = out_dir
          .ancestors()
          .nth(3)
          .expect("could not locate target/<profile>");
      let dst = target_dir.join("assets/builtin-assistants");

      copy_dir_recursive(&src, &dst).expect("failed to copy built-in assets");
  }

  fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
      fs::create_dir_all(dst)?;
      for entry in fs::read_dir(src)? {
          let entry = entry?;
          let src_path = entry.path();
          let dst_path = dst.join(entry.file_name());
          if entry.file_type()?.is_dir() {
              copy_dir_recursive(&src_path, &dst_path)?;
          } else {
              fs::copy(&src_path, &dst_path)?;
          }
      }
      Ok(())
  }
  ```

- [ ] Run:

  ```bash
  cargo build --workspace
  ls target/debug/assets/builtin-assistants/
  ```

  Expected: `assistants.json` + `rules/` present.

### Step 1b.7 — Wire real state into aionui-app

- [ ] In `crates/aionui-app/src/lib.rs` `AppServices::from_database_with_data_dir`:

  ```rust
  let builtin_registry = Arc::new(BuiltinAssistantRegistry::load());
  let assistant_repo: Arc<dyn IAssistantRepository> =
      Arc::new(SqliteAssistantRepository::new(pool.clone()));
  let assistant_override_repo: Arc<dyn IAssistantOverrideRepository> =
      Arc::new(SqliteAssistantOverrideRepository::new(pool.clone()));

  let assistant_service = Arc::new(AssistantService::new(
      assistant_repo,
      assistant_override_repo,
      builtin_registry,
      extension_registry.clone(),
  ));

  // Provide classifier for skill-md dispatch
  let assistant_classifier: Arc<dyn AssistantClassifier> = assistant_service.clone();
  ```

- [ ] In `create_router`, merge `assistant_routes(...)` behind auth middleware
      (follow the `system_authenticated` pattern):

  ```rust
  let assistant_authenticated =
      assistant_routes(states.assistant.clone())
          .route_layer(from_fn_with_state(auth_mw_state.clone(), auth_middleware));

  // ...
  .merge(assistant_authenticated)
  ```

- [ ] Wire the classifier into existing `skill_routes(...)` call site.

### Step 1b.8 — Run full test suite

- [ ] Run:

  ```bash
  cargo fmt --all
  cargo clippy --workspace -- -D warnings
  cargo test --workspace
  ```

  All must pass.

### Step 1b.9 — Commit + hand off

- [ ] Run:

  ```bash
  git add -A
  git commit -m "feat(assistant): implement AssistantService, builtin loader, rule/skill dispatch

  - SqliteAssistantRepository + SqliteAssistantOverrideRepository
  - BuiltinAssistantRegistry with locale-resolved rule/skill/avatar paths
  - AssistantService: list merge (builtin + user + extension), CRUD,
    set_state, import (insert-only), classify
  - AssistantClassifier trait used by aionui-extension skill_routes
  - /api/skills/assistant-rule/* and /api/skills/assistant-skill/* now
    dispatch per source
  - Built-in assets shipped to target/<profile>/assets/builtin-assistants
    via aionui-app/build.rs
  - Inline unit tests across service, builtin, repository

  Ref: docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md §5, §6.4, §6.4a"
  git push
  ```

- [ ] SendMessage to coordinator + backend-tester:
      `"T1b complete at SHA <hex>. backend-tester unblocked."`

- [ ] Install binary for E2E reuse:

  ```bash
  cargo install --path crates/aionui-app
  ls -la ~/.cargo/bin/aionui-backend  # verify fresh timestamp
  ```

- [ ] TaskUpdate T1b status=completed.

---

## Task 2 — Backend HTTP integration tests

**Owner:** backend-tester. **Depends on:** T1b.

**Goal:** Probe every endpoint via `tower::ServiceExt::oneshot`. Produce
`crates/aionui-app/tests/assistants_e2e.rs` + smoke-probe transcript.

**Branch:** `feat/assistant-user-data`.

### Step 2.1 — Claim + environment verification

- [ ] TaskUpdate owner=backend-tester, status=in_progress on Task 2
- [ ] SendMessage coordinator: `"backend-tester alive on T2"`
- [ ] Run:
  ```bash
  cd /Users/zhoukai/Documents/github/aionui-backend
  git pull --ff-only
  git rev-parse HEAD  # matches T1b SHA
  cargo test --workspace --no-run
  ```

### Step 2.2 — Integration test file

- [ ] Create `crates/aionui-app/tests/assistants_e2e.rs` with fixture helpers
      mirroring `crates/aionui-app/tests/system_version_e2e.rs`:
  - Start in-memory DB
  - Register a test user + issue JWT via auth bootstrap
  - Point `AIONUI_BUILTIN_ASSISTANTS_PATH` to a temp dir seeded with a
    minimal `assistants.json` (2 built-ins)
  - Create router via `create_router`
  - Helpers: `get_with_token`, `post_with_token`, `put_with_token`, `patch_with_token`, `delete_with_token`

- [ ] Write one happy + one error test per endpoint from backend spec §6:
  - `GET /api/assistants` (empty + populated)
  - `POST /api/assistants` (happy / name empty / builtin conflict / ext conflict / user conflict)
  - `PUT /api/assistants/{id}` (happy / 404 / builtin reject / ext reject)
  - `DELETE /api/assistants/{id}` (happy + fs cleanup / builtin reject / ext reject)
  - `PATCH /api/assistants/{id}/state` (insert / update / ext reject / 404)
  - `POST /api/assistants/import` (happy / builtin collision skip / ext collision skip / existing user skip / retry idempotency)
  - `GET /api/assistants/{id}/avatar` (builtin / user / 404)
  - `POST /api/skills/assistant-rule/read` (all three dispatch paths)
  - `POST /api/skills/assistant-rule/write` (user happy / builtin 400 / ext 400)
  - Same for `/api/skills/assistant-skill/*`

### Step 2.3 — Run & debug

- [ ] Run:

  ```bash
  cargo test --test assistants_e2e --nocapture
  ```

  All green.

### Step 2.4 — Cross-platform asset validation (per backend spec §12 DoD)

- [ ] On this dev machine (macOS) run `cargo build --release` + start
      `~/.cargo/bin/aionui-backend --local --port 25900`, then:

  ```bash
  curl -s http://127.0.0.1:25900/api/assistants | jq '.data | length'
  ```

  Expected: >= 2 (built-ins loaded).

- [ ] If access to Linux/Windows CI runners: run same probe there. If no
      access, SendMessage coordinator: `"Cross-platform validation for L/W
pending CI runner access; spec §12 DoD gate"` — coordinator decides
      whether to block or scope as follow-up.

### Step 2.5 — Write hand-off

- [ ] Create `docs/backend-migration/handoffs/backend-tester-assistant-user-data-2026-04-23.md`
      with: test file path, all probe commands + outputs, per-endpoint
      pass/fail summary, cross-platform status, open gaps.

- [ ] Commit + push:

  ```bash
  git add crates/aionui-app/tests/assistants_e2e.rs docs/backend-migration/handoffs/backend-tester-assistant-user-data-2026-04-23.md
  git commit -m "test(assistant): HTTP integration suite for /api/assistants/* and rule/skill dispatch"
  git push
  ```

- [ ] SendMessage coordinator: `"T2 complete. Probe transcript in handoff.
<N>/<N> tests green."`

- [ ] TaskUpdate T2 status=completed.

---

## Task 3a — Frontend TS types, bridge, hooks rewrite

**Owner:** frontend-dev. **Depends on:** T1a (for HTTP contract types).

**Goal:** All 14 production files rewritten off `ConfigStorage.*assistants`
onto `ipcBridge.assistants.*`. No main-process migration yet (that's 3b).

**Branch:** `feat/backend-migration-assistant-user-data` (AionUi).

### Step 3a.1 — Claim + branch

- [ ] TaskUpdate owner=frontend-dev, status=in_progress on Task 3a
- [ ] SendMessage coordinator: `"frontend-dev alive on T3a"`
- [ ] Run:
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git pull --ff-only
  git rev-parse --abbrev-ref HEAD  # assistants branch
  ```

### Step 3a.2 — TS types (mirror of Rust types from T1a)

- [ ] Create `src/common/types/assistantTypes.ts`:

  ```typescript
  // Mirror of aionui-api-types/src/assistant.rs.
  // Any shape change on either side requires same-PR update on the other.

  export type AssistantSource = 'builtin' | 'user' | 'extension';

  export interface Assistant {
    id: string;
    source: AssistantSource;
    name: string;
    nameI18n: Record<string, string>;
    description?: string;
    descriptionI18n: Record<string, string>;
    avatar?: string;
    enabled: boolean;
    sortOrder: number;
    presetAgentType: string;
    enabledSkills: string[];
    customSkillNames: string[];
    disabledBuiltinSkills: string[];
    context?: string;
    contextI18n: Record<string, string>;
    prompts: string[];
    promptsI18n: Record<string, string[]>;
    models: string[];
    lastUsedAt?: number;
  }

  export interface CreateAssistantRequest {
    id?: string;
    name: string;
    description?: string;
    avatar?: string;
    presetAgentType?: string;
    enabledSkills?: string[];
    customSkillNames?: string[];
    disabledBuiltinSkills?: string[];
    prompts?: string[];
    models?: string[];
    nameI18n?: Record<string, string>;
    descriptionI18n?: Record<string, string>;
    promptsI18n?: Record<string, string[]>;
  }

  export interface UpdateAssistantRequest extends Partial<Omit<CreateAssistantRequest, 'id'>> {
    id: string;
  }

  export interface SetAssistantStateRequest {
    id: string;
    enabled?: boolean;
    sortOrder?: number;
    lastUsedAt?: number;
  }

  export interface ImportAssistantsRequest {
    assistants: CreateAssistantRequest[];
  }

  export interface ImportAssistantsResult {
    imported: number;
    skipped: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
  }
  ```

- [ ] Update `src/common/config/storage.ts`:
  - Remove `assistants?: AcpBackendConfig[]` from `IConfigStorageRefer`
  - Keep `migration.electronConfigImported?: boolean`

- [ ] Update `src/renderer/pages/settings/AssistantSettings/types.ts`:

  ```typescript
  import type { Assistant } from '@/common/types/assistantTypes';

  export type AssistantListItem = Assistant;
  ```

### Step 3a.3 — ipcBridge module

- [ ] Add to `src/common/adapter/ipcBridge.ts`:

  ```typescript
  // ---------------------------------------------------------------------------
  // Assistant — routed to /api/assistants/*
  // ---------------------------------------------------------------------------

  export const assistants = {
    list: httpGet<Assistant[], void>('/api/assistants'),
    create: httpPost<Assistant, CreateAssistantRequest>('/api/assistants'),
    update: httpPut<Assistant, UpdateAssistantRequest>((p) => `/api/assistants/${p.id}`),
    delete: httpDelete<void, { id: string }>((p) => `/api/assistants/${p.id}`),
    setState: httpPatch<Assistant, SetAssistantStateRequest>((p) => `/api/assistants/${p.id}/state`),
    import: httpPost<ImportAssistantsResult, ImportAssistantsRequest>('/api/assistants/import'),
  };
  ```

  Import `Assistant`, request types from `@/common/types/assistantTypes`.

### Step 3a.4 — Rewrite `useAssistantList`

- [ ] Edit `src/renderer/hooks/assistant/useAssistantList.ts`:

  ```typescript
  import { ipcBridge } from '@/common';
  import { resolveLocaleKey } from '@/common/utils';
  import type { Assistant } from '@/common/types/assistantTypes';
  import { sortAssistants as sortAssistantsUtil } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
  import React, { useCallback, useEffect, useState } from 'react';
  import { useTranslation } from 'react-i18next';

  export const useAssistantList = () => {
    const { i18n } = useTranslation();
    const [assistants, setAssistants] = useState<Assistant[]>([]);
    const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
    const localeKey = resolveLocaleKey(i18n.language);

    const loadAssistants = useCallback(async () => {
      try {
        const list = await ipcBridge.assistants.list.invoke();
        const sorted = sortAssistantsUtil(list);
        setAssistants(sorted);
        setActiveAssistantId((prev) => {
          if (prev && sorted.some((a) => a.id === prev)) return prev;
          return sorted[0]?.id ?? null;
        });
      } catch (error) {
        console.error('Failed to load assistants:', error);
      }
    }, []);

    useEffect(() => {
      void loadAssistants();
    }, [loadAssistants]);

    const activeAssistant = assistants.find((a) => a.id === activeAssistantId) ?? null;

    return {
      assistants,
      setAssistants,
      activeAssistantId,
      setActiveAssistantId,
      activeAssistant,
      loadAssistants,
      localeKey,
    };
  };
  ```

### Step 3a.5 — Prune `assistantUtils.ts`

- [ ] In `src/renderer/pages/settings/AssistantSettings/assistantUtils.ts`:
  - Remove `normalizeExtensionAssistants`
  - Remove `isExtensionAssistant`
  - Remove `getAssistantSource`
  - Simplify `sortAssistants`: keep the sort but use `sortOrder` as the
    primary key (backend already sorts, so this is a safe fallback):
    ```typescript
    export const sortAssistants = (list: Assistant[]): Assistant[] =>
      [...list].sort((a, b) => a.sortOrder - b.sortOrder);
    ```
  - Keep `isEmoji`, `resolveAvatarImageSrc`

### Step 3a.6 — Rewrite `useAssistantEditor`

- [ ] Edit `src/renderer/hooks/assistant/useAssistantEditor.ts` — replace
      all 4 `ConfigStorage.get/set('assistants')` sites:
  - Create → `ipcBridge.assistants.create.invoke({ ... })`
  - Update → `ipcBridge.assistants.update.invoke({ id, ...changes })`
  - Delete → `ipcBridge.assistants.delete.invoke({ id })`
  - toggleEnabled → `ipcBridge.assistants.setState.invoke({ id, enabled })`

- [ ] Replace `activeAssistant?.isBuiltin` checks with
      `activeAssistant?.source === 'builtin'`.

- [ ] Replace `isExtensionAssistant(activeAssistant)` with
      `activeAssistant?.source === 'extension'`.

- [ ] Rule-md read/write calls stay unchanged (existing
      `ipcBridge.fs.readAssistantRule` / `writeAssistantRule` — their dispatch
      change is transparent to the frontend).

### Step 3a.7 — Update remaining 8 consumers

Edit each to swap `ConfigStorage.get('assistants')` for
`ipcBridge.assistants.list.invoke()`. Keep `acp.customAgents` unchanged.

- [ ] `src/renderer/hooks/agent/usePresetAssistantInfo.ts`
- [ ] `src/renderer/pages/conversation/hooks/useConversationAgents.ts`
- [ ] `src/renderer/pages/guid/hooks/useCustomAgentsLoader.ts`
- [ ] `src/renderer/pages/guid/hooks/usePresetAssistantResolver.ts`
- [ ] `src/renderer/pages/settings/AgentSettings/PresetManagement.tsx` (3 sites)
- [ ] `src/renderer/pages/conversation/components/SkillRuleGenerator.tsx` (2 sites)

### Step 3a.8 — Audit `ASSISTANT_PRESETS` consumers (init-order compliance)

- [ ] Run:

  ```bash
  grep -rn "ASSISTANT_PRESETS\|assistantPresets" src/ | grep -v __tests__
  ```

- [ ] For each site, confirm the consumer already runs inside `useEffect` or
      an async function (renderer) OR restructure the init order (main process)
      to await `ipcBridge.assistants.list` before use. Target files per spec §7.6:
  - `src/process/team/mcp/team/TeamMcpServer.ts`
  - `src/process/team/prompts/teamGuideAssistant.ts`
  - `src/common/utils/presetAssistantResources.ts`

### Step 3a.9 — Delete preset files

- [ ] Delete `src/common/config/presets/assistantPresets.ts`.

- [ ] Delete `src/common/utils/presetAssistantResources.ts` (or reduce to a
      thin pass-through if any non-assistant code still imports it — check with
      grep first).

- [ ] Run:
  ```bash
  grep -rn "ConfigStorage.*'assistants'" src/ | grep -v __tests__ | grep -v '\.test\.'
  ```
  Expected: **zero matches**.

### Step 3a.10 — Lint + typecheck

- [ ] Run:

  ```bash
  bunx tsc --noEmit
  bun run lint --quiet
  ```

  Both must pass with no new errors or warnings.

### Step 3a.11 — Commit + hand off

- [ ] Run:

  ```bash
  git add -A
  git commit -m "refactor(assistant): swap ConfigStorage reads/writes for ipcBridge.assistants.*

  - Introduce src/common/types/assistantTypes.ts (mirror of Rust types)
  - Add ipcBridge.assistants.{list,create,update,delete,setState,import}
  - Rewrite useAssistantList, useAssistantEditor, 6 consumer hooks/pages
  - Prune assistantUtils: drop normalizeExtensionAssistants,
    isExtensionAssistant, getAssistantSource
  - Delete assistantPresets.ts + presetAssistantResources.ts
  - ConfigStorage.*'assistants' production grep now zero

  Single-source-of-truth invariant: no frontend code writes the legacy
  'assistants' key after this commit. Main-process migration hook lands
  in T3b.

  Ref: docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md §7"
  git push
  ```

- [ ] SendMessage coordinator + frontend-tester + e2e-tester:
      `"T3a complete. SHA <hex>. frontend-tester unblocked."`

- [ ] TaskUpdate T3a status=completed, T3b status=in_progress.

---

## Task 3b — Main-process migration hook

**Owner:** frontend-dev. **Depends on:** T3a.

**Goal:** One-shot import of legacy `ConfigStorage.get('assistants')` into
backend after backend is healthy.

### Step 3b.1 — Migration function

- [ ] Create `src/process/utils/migrateAssistants.ts`:

  ```typescript
  import { ipcBridge } from '@/common';
  import type { CreateAssistantRequest } from '@/common/types/assistantTypes';
  import type { ProcessConfig } from './initStorage';

  const BUILTIN_ID_PREFIX = 'builtin-';

  // Frozen snapshot — must match crates/aionui-app/assets/builtin-assistants/
  // preset-id-whitelist.json (or the assistants.json manifest). Refresh when
  // the backend manifest changes.
  const PRESET_ID_WHITELIST = new Set<string>([
    // TODO_FIXED_AT_T1B_6: populate from the whitelist file shipped with
    // backend. Replaced by frontend-dev in this step with the actual ids.
  ]);

  function isLegacyBuiltin(a: Record<string, unknown>): boolean {
    const id = typeof a.id === 'string' ? a.id : '';
    return id.startsWith(BUILTIN_ID_PREFIX) || PRESET_ID_WHITELIST.has(id);
  }

  function generateCollisionId(): string {
    const ms = Date.now();
    const hex = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0');
    return `custom-migrated-${ms}-${hex}`;
  }

  function toBackendShape(legacy: Record<string, unknown>): CreateAssistantRequest {
    const legacyId = typeof legacy.id === 'string' ? legacy.id : '';
    // Rename colliding user-authored ids to preserve data (spec §8.1)
    const id = PRESET_ID_WHITELIST.has(legacyId) ? generateCollisionId() : legacyId;

    return {
      id,
      name: (legacy.name as string) ?? 'Untitled',
      description: legacy.description as string | undefined,
      avatar: legacy.avatar as string | undefined,
      presetAgentType: typeof legacy.presetAgentType === 'string' ? (legacy.presetAgentType as string) : 'gemini',
      enabledSkills: (legacy.enabledSkills as string[]) ?? [],
      customSkillNames: (legacy.customSkillNames as string[]) ?? [],
      disabledBuiltinSkills: (legacy.disabledBuiltinSkills as string[]) ?? [],
      prompts: (legacy.prompts as string[]) ?? [],
      models: (legacy.models as string[]) ?? [],
      nameI18n: (legacy.nameI18n as Record<string, string>) ?? {},
      descriptionI18n: (legacy.descriptionI18n as Record<string, string>) ?? {},
      promptsI18n: (legacy.promptsI18n as Record<string, string[]>) ?? {},
    };
  }

  export async function migrateAssistantsToBackend(configFile: ProcessConfig): Promise<void> {
    if (process.env.AIONUI_SKIP_ELECTRON_MIGRATION === '1') {
      console.log('[AionUi] Assistant migration skipped (env flag set)');
      return;
    }

    const imported = await configFile.get('migration.electronConfigImported').catch(() => false);
    if (imported) return;

    const legacy = ((await configFile.get('assistants').catch(() => [])) as Record<string, unknown>[]) ?? [];

    const userAssistants = legacy.filter((a) => !isLegacyBuiltin(a));
    if (userAssistants.length === 0) {
      await configFile.set('migration.electronConfigImported', true);
      return;
    }

    try {
      const result = await ipcBridge.assistants.import.invoke({
        assistants: userAssistants.map(toBackendShape),
      });
      if (result.failed === 0) {
        await configFile.set('migration.electronConfigImported', true);
        console.log(`[AionUi] Migrated ${result.imported} assistants (skipped ${result.skipped})`);
      } else {
        console.error(`[AionUi] Assistant migration partial: ${result.failed} failed`, result.errors);
      }
    } catch (error) {
      console.error('[AionUi] Assistant migration failed:', error);
    }
  }
  ```

### Step 3b.2 — Wire into `initStorage.ts`

- [ ] Edit `src/process/utils/initStorage.ts` to call
      `migrateAssistantsToBackend(configFile)` after `ConfigStorage.interceptor`
      setup AND after backend readiness is confirmed by the caller.

- [ ] The backend-ready gate lives in `src/index.ts` (main process startup).
      Add after `backendManager.start()` resolves:

  ```typescript
  // src/index.ts (in whichever function owns backend bootstrap)
  await backendManager.start(dbPath);
  mark(`backendManager.start (port=${backendPort})`);

  // New: one-shot assistant migration. Must run after backend is healthy.
  await migrateAssistantsToBackend(ProcessConfig);
  mark('migrateAssistantsToBackend');
  ```

  Import `ProcessConfig` from `./process/utils/initStorage` (it's already
  exported).

### Step 3b.3 — Populate PRESET_ID_WHITELIST

- [ ] Read `crates/aionui-app/assets/builtin-assistants/assistants.json`
      (committed by T1b.5). Extract all `id` values.

- [ ] Paste them into `PRESET_ID_WHITELIST` in `migrateAssistants.ts`.

- [ ] Document in a code comment that this list must stay in sync:
  ```typescript
  // Kept in sync with assistants.json manifest in aionui-backend repo.
  // If the backend adds/removes a built-in id, update this list in the
  // same PR. A drift means built-in user-edits silently migrate into the
  // user table (data loss on next backend upgrade).
  ```

### Step 3b.4 — Migration unit test

- [ ] Create `tests/unit/migrateAssistants.test.ts`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { migrateAssistantsToBackend } from '@/process/utils/migrateAssistants';

  // Mock ipcBridge
  vi.mock('@/common', () => ({
    ipcBridge: {
      assistants: {
        import: { invoke: vi.fn() },
      },
    },
  }));

  function makeConfigFile(initial: Record<string, unknown>) {
    const store = new Map(Object.entries(initial));
    return {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
      }),
    };
  }

  describe('migrateAssistantsToBackend', () => {
    beforeEach(() => vi.clearAllMocks());

    it('skips when migration already complete', async () => {
      const cf = makeConfigFile({ 'migration.electronConfigImported': true });
      await migrateAssistantsToBackend(cf as any);
      expect(cf.set).not.toHaveBeenCalled();
    });

    it('filters builtin-prefixed rows', async () => {
      const cf = makeConfigFile({
        'migration.electronConfigImported': false,
        assistants: [
          { id: 'builtin-office', name: 'Office' },
          { id: 'custom-123', name: 'Mine' },
        ],
      });
      const { ipcBridge } = await import('@/common');
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({
        imported: 1,
        skipped: 0,
        failed: 0,
        errors: [],
      });
      await migrateAssistantsToBackend(cf as any);
      expect(ipcBridge.assistants.import.invoke).toHaveBeenCalledWith({
        assistants: expect.arrayContaining([expect.objectContaining({ id: 'custom-123' })]),
      });
      expect(ipcBridge.assistants.import.invoke).toHaveBeenCalledWith({
        assistants: expect.not.arrayContaining([expect.objectContaining({ id: 'builtin-office' })]),
      });
    });

    it('does not set flag on partial failure', async () => {
      const cf = makeConfigFile({
        'migration.electronConfigImported': false,
        assistants: [{ id: 'a', name: 'A' }],
      });
      const { ipcBridge } = await import('@/common');
      (ipcBridge.assistants.import.invoke as any).mockResolvedValue({
        imported: 0,
        skipped: 0,
        failed: 1,
        errors: [{ id: 'a', error: '...' }],
      });
      await migrateAssistantsToBackend(cf as any);
      expect(cf.set).not.toHaveBeenCalledWith('migration.electronConfigImported', true);
    });

    it('sets flag when nothing to migrate', async () => {
      const cf = makeConfigFile({
        'migration.electronConfigImported': false,
        assistants: [{ id: 'builtin-office', name: 'Office' }], // all filtered
      });
      await migrateAssistantsToBackend(cf as any);
      expect(cf.set).toHaveBeenCalledWith('migration.electronConfigImported', true);
    });

    it('respects AIONUI_SKIP_ELECTRON_MIGRATION=1', async () => {
      process.env.AIONUI_SKIP_ELECTRON_MIGRATION = '1';
      const cf = makeConfigFile({
        'migration.electronConfigImported': false,
        assistants: [{ id: 'custom-1', name: 'X' }],
      });
      await migrateAssistantsToBackend(cf as any);
      expect(cf.set).not.toHaveBeenCalled();
      delete process.env.AIONUI_SKIP_ELECTRON_MIGRATION;
    });

    it('renames colliding whitelist ids to custom-migrated-*', async () => {
      // Add a known id to whitelist via module mutation OR
      // craft a test that uses an actual whitelist entry. For now, rely
      // on the prefix path which is more deterministic; this case is
      // covered by the manifest-integration test in T5.
    });
  });
  ```

- [ ] Run:

  ```bash
  bun run test --run tests/unit/migrateAssistants.test.ts
  ```

  All green.

### Step 3b.5 — Commit + hand off

- [ ] Run:

  ```bash
  git add -A
  git commit -m "feat(assistant): main-process one-shot migration from ConfigStorage to backend

  - src/process/utils/migrateAssistants.ts with id prefix + whitelist
    classification and collision rename (custom-migrated-<ms>-<hex>)
  - Invoked from src/index.ts after backendManager.start()
  - Honors AIONUI_SKIP_ELECTRON_MIGRATION=1 for E2E tests
  - migration.electronConfigImported flag prevents re-run
  - Unit tests cover: already-done skip / filter / partial failure /
    empty-after-filter / env skip

  Ref: docs/backend-migration/specs/2026-04-23-assistant-user-data-migration-design.md §8"
  git push
  ```

- [ ] SendMessage coordinator + e2e-tester:
      `"T3b complete. SHA <hex>. e2e-tester still blocked on T2 + T4."`

- [ ] TaskUpdate T3b status=completed.

---

## Task 4 — Frontend unit tests + type + lint

**Owner:** frontend-tester. **Depends on:** T3a (NOT T3b — hooks are
independently testable).

**Branch:** same as T3a. After T3b lands, pull + rerun.

### Step 4.1 — Claim + pull

- [ ] TaskUpdate owner=frontend-tester, status=in_progress on Task 4
- [ ] SendMessage coordinator: `"frontend-tester alive on T4"`
- [ ] Run:
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git pull --ff-only
  ```

### Step 4.2 — Write / update Vitest suites

- [ ] **New: `tests/unit/assistantsBridge.test.ts`** — mock `fetch`, exercise
      all 6 bridge methods (`list/create/update/delete/setState/import`). Verify:
  - HTTP method + path
  - Request body shape
  - Response unwrapping (from `{success,data}` envelope)
  - Error propagation (4xx → throws)

- [ ] **Update: `tests/unit/assistantHooks.dom.test.ts`** — swap the old
      `ConfigStorage` mocks for `ipcBridge.assistants.*` mocks. Cover:
  - `useAssistantList` loads from `ipcBridge.assistants.list`
  - `useAssistantEditor` create/update/delete/toggle call correct bridge
  - `source === 'user'` gates edit/delete buttons
  - `source === 'builtin'` / `'extension'` disables edit UI

- [ ] **Prune: `tests/unit/assistantUtils.test.ts`** — remove
      `isExtensionAssistant` / `getAssistantSource` tests; keep `isEmoji` /
      `resolveAvatarImageSrc` / simplified `sortAssistants`.

### Step 4.3 — Run suite

- [ ] Run:

  ```bash
  bun run test --run tests/unit/assistants*.test.ts tests/unit/assistantHooks.dom.test.ts tests/unit/migrateAssistants.test.ts
  ```

  All green.

### Step 4.4 — Gate commands

- [ ] Run:

  ```bash
  bunx tsc --noEmit
  bun run lint --quiet
  bun run test --run
  ```

  All pass with no new warnings. If lint warnings introduced, fix atomically
  with commit `test(assistant): align lint/tsc with refactored hooks`.

### Step 4.5 — Hand-off

- [ ] Create
      `docs/backend-migration/handoffs/frontend-tester-assistant-user-data-2026-04-23.md`
      with: per-suite pass/fail counts, new test file list, lint/tsc diff
      (before/after), anything surfaced.

- [ ] Commit + push:

  ```bash
  git add tests/unit/*assistants* tests/unit/migrateAssistants.test.ts \
          tests/unit/assistantHooks.dom.test.ts tests/unit/assistantUtils.test.ts \
          docs/backend-migration/handoffs/frontend-tester-assistant-user-data-2026-04-23.md
  git commit -m "test(assistant): unit coverage for bridge + hooks + migration"
  git push
  ```

- [ ] SendMessage coordinator + e2e-tester:
      `"T4 complete at SHA <hex>."`

- [ ] TaskUpdate T4 status=completed.

---

## Task 5 — End-to-end (Playwright + real Electron)

**Owner:** e2e-tester. **Depends on:** T2 and T4.

**Branch:** `feat/backend-migration-assistant-user-data`.

### Step 5.1 — Environment check

- [ ] TaskUpdate owner=e2e-tester, status=in_progress
- [ ] SendMessage coordinator: `"e2e-tester alive on T5"`
- [ ] Run:
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git pull --ff-only
  which aionui-backend
  # ~/.cargo/bin/aionui-backend is a symlink per workflow doc §2; -L follows it
  stat -Lf "%Sm" ~/.cargo/bin/aionui-backend  # must reflect fresh debug build
  readlink ~/.cargo/bin/aionui-backend  # must resolve to target/debug/aionui-backend
  bunx electron-vite build
  stat -f "%Sm" out/renderer/index.html      # fresh today
  ```

### Step 5.2 — Feature directory

- [ ] Create `tests/e2e/features/assistants-user-data/` with a single file
      `assistant-user-data.e2e.ts` covering:
  1. **First-launch empty** — fresh userData dir, no legacy file; launch →
     list shows only built-ins (from backend manifest)
  2. **Create user assistant** — UI flow → SQLite row verification via
     backend probe
  3. **Edit user assistant** — change name + rule md → verify persistence
  4. **Delete user assistant** — UI flow → SQLite row absent + rule md file
     removed
  5. **Reject builtin edit** — selecting builtin → edit button disabled
  6. **Reject extension edit** — same for extension-contributed
  7. **Toggle builtin enabled** — UI toggles → `assistant_overrides` row
     inserted; restart backend → toggle persists
  8. **Migration happy path** — seed legacy `aionui-config.txt` with 3 user
     - 2 builtin rows → launch AionUi → backend has 3 user rows + migration
       flag = true
  9. **Migration retry** — start AionUi without backend (kill before launch),
     launch, observe flag NOT set, log line visible; restart backend;
     relaunch; verify flag now true and no duplicates
  10. **Migration collision** — craft legacy row with id matching a builtin
      slug → verify backend row uses `custom-migrated-*` id, original
      content preserved

- [ ] Reuse `tests/e2e/helpers/` fixtures; if `assistantSettings.ts` helper
      exists from prior assistant-verification pilot, extend it rather than
      forking.

### Step 5.3 — Run the suite

- [ ] Run:

  ```bash
  bun run test:e2e tests/e2e/features/assistants-user-data/
  ```

  ETA: 30–60 min for 10 tests at ~60s each.

### Step 5.4 — Classify failures

Use the Skill-Library pilot rubric:

- **Class D (transport/migration)** — backend response shape mismatch
- **Class F (contract gap)** — endpoint missing behavior
- **Class A (stateful/scale)** — works small, breaks at load
- **Class B/C/E (test-authoring)** — fixture assumptions, selector ambiguity

### Step 5.5 — Report

- [ ] Create
      `docs/backend-migration/e2e-reports/2026-04-23-assistant-user-data.md`
      with: pass/fail matrix, classifications, `curl` backend probes used for
      Class D/F hypotheses, verdict per scenario.

- [ ] Create
      `docs/backend-migration/handoffs/e2e-tester-assistant-user-data-2026-04-23.md`
      summarizing routing decisions.

- [ ] Commit + push both.

### Step 5.6 — Outcome routing

- [ ] **All green or only Class B/C/E:** SendMessage coordinator:
      `"T5 clean. No Class D/F."` TaskUpdate completed.

- [ ] **Class D/F present:** SendMessage coordinator with per-failure
      routing. Coordinator spawns an ad-hoc backend-dev or frontend-dev
      re-engagement for targeted fixes; T5 re-runs after fix lands.

---

## Task 6 — Coordinator closure

**Owner:** coordinator. **Depends on:** T5.

### Step 6.1 — Switch to coordinator branch

- [ ] Run:
  ```bash
  cd /Users/zhoukai/Documents/github/AionUi
  git checkout feat/backend-migration-coordinator
  git merge origin/feat/backend-migration-assistant-user-data --no-edit
  git push
  ```

### Step 6.2 — SKIPPED (PRs not to be raised)

Per user instruction during pilot execution: **do NOT raise cross-repo PRs
in T6**. Branches stay pushed on both origins for the user to inspect; PR
creation (if any) is a manual step the user will do later outside this
pilot.

### Step 6.3 — Write closure hand-off

- [ ] Create
      `docs/backend-migration/handoffs/coordinator-assistant-user-data-2026-04-23.md`
      with: outcomes, lessons (esp. team-mode coordination across two repos),
      open follow-ups (pending follow-up specs: `acp.customAgents` migration,
      built-in-skill migration, other `ConfigStorage.*` dual-write residuals).

- [ ] Commit + push.

### Step 6.4 — Update module record

- [ ] Append to `docs/backend-migration/modules/assistant.md`:
  - Section "User Data Migration — 2026-04-23"
  - Final endpoint list (new /api/assistants/\* + rule/skill dispatch)
  - Migration flag status
  - Reference to the feature branches on both remotes (no PR links)

### Step 6.5 — Shutdown

- [ ] SendMessage shutdown_request to all teammates who are still alive.

- [ ] TaskUpdate T6 status=completed.

- [ ] Final SendMessage to user with branch tips (both repos), pushed SHAs, and summary.

---

## Success Criteria (DoD snapshot)

Mirror of §12 (backend spec) and §10.4 (frontend spec):

- [ ] All 17 frontend files refactored; `grep -rn "ConfigStorage.*'assistants'"`
      across `src/` production zero.
- [ ] `aionui-assistant` crate merged; `cargo test --workspace` green;
      `cargo clippy -- -D warnings` clean; `cargo fmt --all -- --check` clean.
- [ ] `crates/aionui-app/tests/assistants_e2e.rs` green.
- [ ] `aionui-extension` rule-md + skill-md dispatch tests green.
- [ ] Frontend Vitest + `bunx tsc --noEmit` + `bun run lint` all clean.
- [ ] E2E 10 scenarios green (or only Class B/C/E).
- [ ] Migration verified end-to-end: seeded legacy file →
      `migration.electronConfigImported=true` after launch.
- [ ] `src/common/config/presets/assistantPresets.ts` deleted.
- [ ] Backend `assets/builtin-assistants/` populated and shipped via
      `build.rs`; runtime probe on macOS/Linux/Windows.
- [ ] Both spec docs linked from module records.
- [ ] All teammate handoffs committed.
