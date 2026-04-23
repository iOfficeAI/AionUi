# E2E Report — Built-in Skill Migration (T3)

**Date:** 2026-04-23
**Runner:** e2e-tester (aionui-builtin-skill-migration team)
**Plan:** [`../plans/2026-04-23-builtin-skill-migration-plan.md`](../plans/2026-04-23-builtin-skill-migration-plan.md) §Task 3
**Backend SHA (`aionui-backend`):** `0ab877f` (feat/builtin-skills — embed via include_dir + materialize endpoints)
**Frontend SHA (`AionUi`):** `2e2bda33d` (feat/backend-migration-builtin-skills — AcpSkillManager HTTP swap + materialize call path)
**Verdict:** **BLOCKED — 3 Class F/D backend contract defects**. 5/8 passed, 3 failed. Do NOT mark T3 complete per plan §3.5. Back to backend-dev.

## Environment

| Item | Value |
|---|---|
| Mode | Dev (electron-vite + `electron .`) |
| Workers | 1 (Playwright singleton Electron app per worker) |
| Backend binary | `~/.cargo/bin/aionui-backend` (symlink → `target/debug/aionui-backend`) |
| Backend binary timestamp | Apr 23 18:41:45 2026 |
| Renderer bundle | `out/renderer/index.html` rebuilt via `bunx electron-vite build` pre-run |
| Sibling backend port (S6, S8) | 25903 |
| Total wall clock | ~38s across 8 tests |

Commands run:

```bash
cd /Users/zhoukai/Documents/github/AionUi
git fetch origin feat/backend-migration-builtin-skills
git reset --hard origin/feat/backend-migration-builtin-skills
bunx electron-vite build
bun run test:e2e tests/e2e/features/builtin-skill-migration/
```

## Scope decision: singleton fixture vs cold-restart scenarios

Identical pattern to the assistant-user-data pilot's T5:

| Scenarios | Driver | Why |
|---|---|---|
| S1-S5, S7 | Live Electron app + `httpBridge` probes | Exercises the full renderer → backend stack; shared singleton fixture is sufficient. |
| S6, S8 | Sibling `aionui-backend` process on port 25903 against a tmp data-dir | Requires pre-seeded on-disk state (orphan agent-skills dirs / legacy cache dirs) + a fresh boot. The shared Electron fixture cannot be cold-restarted from within a spec. |

S6 (orphan sweep) seeds `{tmp}/agent-skills/<id>/` before the sibling backend starts, then asserts the startup task removes those dirs because the empty conversations table has no matching rows. S8 verifies the backend does NOT touch `{data_dir}/builtin-skills/` (that cleanup is Electron-main-process territory) and annotates whether any legacy dirs survive under the live cache — authoritative assertion deferred to T4's packaging smoke.

## Per-scenario matrix

| # | Scenario | Verdict | Duration | Notes |
|---|---|---|---|---|
| S1 | `GET /api/skills/builtin-auto` non-empty + round-trip body read | **FAIL (Class F)** | 11.5s | List returns correct shape, but the follow-up `POST /api/skills/builtin-skill {fileName}` rejects with 400 because backend expects `file_name`. See §Defects. |
| S2 | AcpSkillManager data-source (list + body round-trip) | **FAIL (Class F)** | 11.3s | Same root cause as S1 — iterates bodies via `fileName`; all fail 400. This is the exact path the live ACP runtime takes. |
| S3 | `materialize-for-agent` writes opt-in skills into the dir | PASS | 11.2s | `mermaid/SKILL.md` present; auto-inject dirs flattened; all body files readable. |
| S4 | Materialized dir structure suits gemini `--extensions` | PASS | 124ms | Every top-level entry is a dir with a `SKILL.md`. |
| S5 | DELETE cleanup + idempotency | PASS | 18ms | First DELETE removes dir; second DELETE succeeds (no 404). |
| S6 | Startup orphan sweep for unknown conversation ids | PASS | 276ms | Seeded orphan dirs (`orphan-conv-1`, `orphan-conv-2`) removed within 5s of boot; parent `agent-skills/` survives; `/api/skills/builtin-auto` still serves. |
| S7 | `/api/skills` builtin rows expose absolute `location` + `relativeLocation` for export | **FAIL (Class D)** | 153ms | `entry.location` is absolute and stats OK; but `entry.relativeLocation` is `undefined`. Backend emits `relative_location` (snake_case). See §Defects. |
| S8 | Legacy `{cacheDir}/builtin-skills/` lifecycle | PASS (annotated) | 265ms | Backend does NOT touch stray `{data_dir}/builtin-skills/`; sibling backend stays healthy. Annotation reports whether live `~/.aionui-config*/builtin-skills` is present. Full cold-restart coverage: T4 packaging smoke. |

## Test file

- [`tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts`](../../../tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts)

## Defects (routing to backend-dev)

### D1 — `ReadBuiltinResourceRequest` missing camelCase rename (Class F)

**Location:** `aionui-backend/crates/aionui-api-types/src/skill.rs:170-173`

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct ReadBuiltinResourceRequest {
    pub file_name: String,
}
```

**Problem:** Lacks `#[serde(rename_all = "camelCase")]`. Every other skill-side request type (`MaterializeSkillsRequest`, `BuiltinAutoSkillResponse`, `ExternalSkillSourceResponse` etc.) is camelCased. The frontend (`src/common/adapter/ipcBridge.ts:341` and `AcpSkillManager.ts:341`) invokes this endpoint with `{ fileName }`. Result: every `POST /api/skills/builtin-skill` call 400s with `missing field file_name`.

**Live probe:**

```
$ curl -sX POST http://127.0.0.1:25904/api/skills/builtin-skill \
    -H 'Content-Type: application/json' -d '{"fileName":"auto-inject/cron/SKILL.md"}'
{"success":false,"error":"Bad request: Failed to deserialize the JSON body into the target type: missing field `file_name` at line 1 column 40","code":"BAD_REQUEST"}

$ curl -sX POST http://127.0.0.1:25904/api/skills/builtin-skill \
    -H 'Content-Type: application/json' -d '{"file_name":"auto-inject/cron/SKILL.md"}'
{"success":true,"data":"---\nname: cron\n..."}
```

**Impact:** ACP conversations cannot load *any* builtin skill body — the auto-inject flow degrades silently (`AcpSkillManager.loadSkillBody` catches and returns `''`), so conversations start without the builtin skill injection that is the whole point of this migration.

**Fix:** add `#[serde(rename_all = "camelCase")]` above the struct. Same change likely also needed on `ReadBuiltinResourceRequest` consumers — a quick audit of all `aionui-api-types/src/skill.rs` request structs against the frontend's camelCase wire format is warranted:

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadBuiltinResourceRequest {
    pub file_name: String,
}
```

### D2 — `SkillListItemResponse` missing camelCase rename (Class D)

**Location:** `aionui-backend/crates/aionui-api-types/src/skill.rs:27-36`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SkillListItemResponse {
    pub name: String,
    pub description: String,
    pub location: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relative_location: Option<String>,
    pub is_custom: bool,
    pub source: SkillSourceResponse,
}
```

**Problem:** Serializes as `{relative_location, is_custom}` but the frontend TypeScript contract (`src/common/adapter/ipcBridge.ts:344-354`) reads `{relativeLocation, isCustom}`. Result: `SkillInfo.relativeLocation` is always `undefined` in the renderer.

**Live probe:**

```
$ curl -s http://127.0.0.1:25904/api/skills | jq '.data[0]' -c
{"name":"aionui-skills","description":"...","location":"/tmp/skill-probe/builtin-skills-view/aionui-skills/SKILL.md","relative_location":"auto-inject/aionui-skills/SKILL.md","is_custom":false,"source":"builtin"}
```

**Impact:** `AcpSkillManager.discoverSkills` uses `entry.relativeLocation ?? entry.location` when `source === 'builtin'` — with `relativeLocation` always undefined, it falls through to the absolute `location` path, which downstream passes as `fileName` to `readBuiltinSkill`. Even if D1 is fixed, the absolute path would fail the `validate_filename` path-traversal check in the backend. So D1 and D2 are both blockers for the AcpSkillManager opt-in builtin skill path.

**Fix:** same decoration:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillListItemResponse { /* ... */ }
```

After fixing, rerun `cargo test --test skills_builtin_e2e` — the existing integration test likely round-trips with snake_case payloads and won't catch wire-format drift. Consider adding a JSON-level assertion (`assert_eq!(json["relativeLocation"], ...)` in D1/D2's sibling tests) to prevent regression.

### D3 — scope of audit

Recommend a single follow-up pass over `aionui-api-types/src/skill.rs` adding `#[serde(rename_all = "camelCase")]` to every request/response type that currently relies on the default snake-case mapping. Candidates to verify:
- `ReadSkillInfoRequest` / `ReadSkillInfoResponse`
- `ImportSkillRequest` / `ImportSkillResponse`
- `ExportSkillRequest` (→ `targetDir`)
- `ScanForSkillsRequest` / `ScanForSkillsResponse` / `ScannedSkillResponse` (→ `folderPath`, `skills[].path`)
- `WriteAssistantRuleRequest` / `ReadAssistantRuleRequest` (→ `assistantId`)
- `AddExternalPathRequest` / `RemoveExternalPathRequest` — these are already simple enough, but the rename is cheap insurance.

The pilot originally dodged this only because `aionui-extension` tests drive requests in snake-case JSON (Rust-side tests), and the live renderer paths exercising these fields were covered by prior pilots (where the `#[serde(rename_all)]` had already been added on the listed types). The new builtin-skill flow is the first to hit these two stragglers.

## Probe transcripts

### Happy-path probes (run against sibling backend for safety — pre-run sanity check)

```
GET  /api/skills/builtin-auto           → 200, 4 entries (aionui-skills, cron, officecli, skill-creator)
POST /api/skills/builtin-skill          → 400 on {fileName}, 200 on {file_name}    ← D1
GET  /api/skills                        → 200, emits {relative_location, is_custom}  ← D2
POST /api/skills/materialize-for-agent  → 200 on {conversationId, enabledSkills}
DELETE /api/skills/materialize-for-agent/{id}  → 200, idempotent
```

### Sibling backend log tail (S6 / S8 boot)

```
Initializing database at /tmp/aionui-e2e-builtin-skill-xxx/aionui.db
Database initialized at .../aionui.db
Generated and persisted new JWT secret
Running in local mode — authentication is disabled
No configured users detected — initial setup required via /api/auth/status
Server listening on 127.0.0.1:25903
```

### S6 assertion sequence

```
setup:
  mkdir -p {dataDir}/agent-skills/orphan-conv-1/mermaid
  mkdir -p {dataDir}/agent-skills/orphan-conv-2/cron
  seed: SKILL.md frontmatter in each

start sibling backend (empty conversations table → every orphan is unknown)

poll (< 5s):
  ! exists orphan-conv-1  AND  ! exists orphan-conv-2   → pass
  exists agent-skills/    → pass

probe GET /api/skills/builtin-auto     → non-empty
```

## Failure classification — Skill-Library pilot rubric

| Class | Count | Notes |
|---|---|---|
| D — backend response shape mismatch | 1 | S7 (SkillListItemResponse snake_case) |
| F — backend contract gap | 1 | S1 + S2 (same root — ReadBuiltinResourceRequest rejects fileName) |
| A — stateful / scale flakes | 0 | Re-ran twice; same failures, same places. |
| B / C / E — test-authoring | 0 | S1 initial run had one Class B (wrong frontmatter-name assumption) — fixed pre-report, is not a current failure. |

## Outcome per plan §3.5

**Class D and Class F present — do NOT mark T3 complete.** Routing:

- **D1, D2 → backend-dev.** Both are two-line `#[serde(rename_all = "camelCase")]` additions in `aionui-api-types/src/skill.rs`; a follow-up audit of the other skill types in the same file is recommended (§D3).
- After backend-dev commits + pushes on `feat/builtin-skills`, rebuild `~/.cargo/bin/aionui-backend`, rerun this suite (should take ~40s). On clean second run, T3 gets the green stamp and T4 is unblocked.

No renderer-side change needed — the frontend is correct against the *design spec* (§6 of the backend spec explicitly requires camelCase on the wire).

## Follow-ups (non-blocking, document for future)

- Adding a snapshot-level JSON contract test in `aionui-api-types` (or a pact-style check in `skills_builtin_e2e.rs`) would have caught both defects pre-T3. Worth considering as a backend-dev chore after the pilot.
- S8 full cold-restart coverage for the legacy-dir cleanup path still depends on T4 packaging smoke or a future dedicated worker-per-boot E2E spec. Not a regression risk because (a) the cleanup is fire-and-forget best-effort in `initStorage.ts:357-365` and (b) a leftover 7MB dir is harmless.
- S2 today stops at "all builtin-auto bodies resolve"; a deeper probe would drive an actual ACP conversation and inspect the injected message. That is cross-backend (ACP + HTTP) and out of scope for this pilot; the current coverage matches the bar set by the frontend spec §9 row for e2e-tester.
