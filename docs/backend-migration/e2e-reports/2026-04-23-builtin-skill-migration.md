# E2E Report — Built-in Skill Migration (T3)

**Date:** 2026-04-23
**Runner:** e2e-tester (aionui-builtin-skill-migration team)
**Plan:** [`../plans/2026-04-23-builtin-skill-migration-plan.md`](../plans/2026-04-23-builtin-skill-migration-plan.md) §Task 3
**Backend SHA (`aionui-backend`):** run 1 `0ab877f` → run 2 `04f1537` (H1 fix: camelCase audit on `skill.rs`)
**Frontend SHA (`AionUi`):** `69585b28b` (feat/backend-migration-builtin-skills — unchanged across runs; test file only)
**Verdict:** **CLEAN on run 2 — 8/8 green, 13.5s wall time.** Run 1 surfaced 2 Class F/D backend contract defects (D1 `ReadBuiltinResourceRequest`, D2 `SkillListItemResponse` missing camelCase rename); both fixed in H1. All three previously-failing scenarios now pass. T3 unblocks T4.

## Environment

| Item                          | Value                                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| Mode                          | Dev (electron-vite + `electron .`)                                       |
| Workers                       | 1 (Playwright singleton Electron app per worker)                         |
| Backend binary                | `~/.cargo/bin/aionui-backend` (symlink → `target/debug/aionui-backend`)  |
| Backend binary timestamp      | Apr 23 18:41:45 2026                                                     |
| Renderer bundle               | `out/renderer/index.html` rebuilt via `bunx electron-vite build` pre-run |
| Sibling backend port (S6, S8) | 25903                                                                    |
| Total wall clock              | ~38s across 8 tests                                                      |

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

| Scenarios | Driver                                                                | Why                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-S5, S7 | Live Electron app + `httpBridge` probes                               | Exercises the full renderer → backend stack; shared singleton fixture is sufficient.                                                                                      |
| S6, S8    | Sibling `aionui-backend` process on port 25903 against a tmp data-dir | Requires pre-seeded on-disk state (orphan agent-skills dirs / legacy cache dirs) + a fresh boot. The shared Electron fixture cannot be cold-restarted from within a spec. |

S6 (orphan sweep) seeds `{tmp}/agent-skills/<id>/` before the sibling backend starts, then asserts the startup task removes those dirs because the empty conversations table has no matching rows. S8 verifies the backend does NOT touch `{data_dir}/builtin-skills/` (that cleanup is Electron-main-process territory) and annotates whether any legacy dirs survive under the live cache — authoritative assertion deferred to T4's packaging smoke.

## Per-scenario matrix (run 2 — after H1 fix)

| #   | Scenario                                                                              | Run 1            | Run 2            | Notes                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------- | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `GET /api/skills/builtin-auto` non-empty + round-trip body read                       | FAIL (Class F)   | **PASS (11.7s)** | Run 1: 400 on `{fileName}` — `ReadBuiltinResourceRequest` missing camelCase rename. Run 2: round-trip works; frontmatter + name assertions green.                                                                                        |
| S2  | AcpSkillManager data-source (list + body round-trip)                                  | FAIL (Class F)   | **PASS (213ms)** | Run 1: same root cause as S1. Run 2: every auto-inject body fetched successfully — ACP runtime data-source is healthy.                                                                                                                   |
| S3  | `materialize-for-agent` writes opt-in skills into the dir                             | PASS             | **PASS (20ms)**  | `mermaid/SKILL.md` present; auto-inject dirs flattened; all body files readable.                                                                                                                                                         |
| S4  | Materialized dir structure suits gemini `--extensions`                                | PASS             | **PASS (15ms)**  | Every top-level entry is a dir with a `SKILL.md`.                                                                                                                                                                                        |
| S5  | DELETE cleanup + idempotency                                                          | PASS             | **PASS (31ms)**  | First DELETE removes dir; second DELETE succeeds (no 404).                                                                                                                                                                               |
| S6  | Startup orphan sweep for unknown conversation ids                                     | PASS             | **PASS (280ms)** | Seeded orphan dirs (`orphan-conv-1`, `orphan-conv-2`) removed within 5s of boot; parent `agent-skills/` survives; `/api/skills/builtin-auto` still serves.                                                                               |
| S7  | `/api/skills` builtin rows expose absolute `location` + `relativeLocation` for export | FAIL (Class D)   | **PASS (152ms)** | Run 1: `relativeLocation` always undefined — `SkillListItemResponse` missing camelCase rename. Run 2: `relativeLocation` populated for every builtin row; export-symlink round-trip lands a readable `SKILL.md` in a throw-away tempdir. |
| S8  | Legacy `{cacheDir}/builtin-skills/` lifecycle                                         | PASS (annotated) | **PASS (259ms)** | Backend does NOT touch stray `{data_dir}/builtin-skills/`; sibling backend stays healthy. Annotation reports whether live `~/.aionui-config*/builtin-skills` is present. Full cold-restart coverage: T4 packaging smoke.                 |

**Run 2 total wall clock:** 13.5s (down from 38s — no retries, fewer ~10s Electron boots needed).

## Test file

- [`tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts`](../../../tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts)

## Defects from run 1 (resolved in H1 / `04f1537`)

All three backend contract defects below were fixed by backend-dev under task H1 (`fix(api-types): enforce camelCase on wire for all skill.rs public types`) — an audit-level pass over `aionui-api-types/src/skill.rs` that added `#[serde(rename_all = "camelCase")]` to every request/response type that still lacked it. Run 2 verified all three paths live.

### D1 — `ReadBuiltinResourceRequest` missing camelCase rename (Class F) — RESOLVED

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

**Impact:** ACP conversations cannot load _any_ builtin skill body — the auto-inject flow degrades silently (`AcpSkillManager.loadSkillBody` catches and returns `''`), so conversations start without the builtin skill injection that is the whole point of this migration.

**Fix:** add `#[serde(rename_all = "camelCase")]` above the struct. Same change likely also needed on `ReadBuiltinResourceRequest` consumers — a quick audit of all `aionui-api-types/src/skill.rs` request structs against the frontend's camelCase wire format is warranted:

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadBuiltinResourceRequest {
    pub file_name: String,
}
```

### D2 — `SkillListItemResponse` missing camelCase rename (Class D) — RESOLVED

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

### D3 — scope of audit — RESOLVED

Recommend a single follow-up pass over `aionui-api-types/src/skill.rs` adding `#[serde(rename_all = "camelCase")]` to every request/response type that currently relies on the default snake-case mapping. Candidates to verify:

- `ReadSkillInfoRequest` / `ReadSkillInfoResponse`
- `ImportSkillRequest` / `ImportSkillResponse`
- `ExportSkillRequest` (→ `targetDir`)
- `ScanForSkillsRequest` / `ScanForSkillsResponse` / `ScannedSkillResponse` (→ `folderPath`, `skills[].path`)
- `WriteAssistantRuleRequest` / `ReadAssistantRuleRequest` (→ `assistantId`)
- `AddExternalPathRequest` / `RemoveExternalPathRequest` — these are already simple enough, but the rename is cheap insurance.

The pilot originally dodged this only because `aionui-extension` tests drive requests in snake-case JSON (Rust-side tests), and the live renderer paths exercising these fields were covered by prior pilots (where the `#[serde(rename_all)]` had already been added on the listed types). The new builtin-skill flow is the first to hit these two stragglers.

H1 (`04f1537`) applied exactly this audit — every struct in `skill.rs` that could go on the wire now carries the rename.

## Probe transcripts

### Run 1 probes (against sibling backend at `0ab877f`, pre-H1)

```
GET  /api/skills/builtin-auto           → 200, 4 entries (aionui-skills, cron, officecli, skill-creator)
POST /api/skills/builtin-skill          → 400 on {fileName}, 200 on {file_name}    ← D1
GET  /api/skills                        → 200, emits {relative_location, is_custom}  ← D2
POST /api/skills/materialize-for-agent  → 200 on {conversationId, enabledSkills}
DELETE /api/skills/materialize-for-agent/{id}  → 200, idempotent
```

### Run 2 probes (against sibling backend at `04f1537`, post-H1)

```
$ curl -sX POST http://127.0.0.1:25905/api/skills/builtin-skill \
    -H 'Content-Type: application/json' -d '{"fileName":"auto-inject/cron/SKILL.md"}' | head -c 100
{"success":true,"data":"---\nname: cron\ndescription: Scheduled task management..."}

$ curl -s http://127.0.0.1:25905/api/skills | jq '.data[0]' -c
{"name":"aionui-skills","...","location":"/tmp/skill-probe2/builtin-skills-view/aionui-skills/SKILL.md","relativeLocation":"auto-inject/aionui-skills/SKILL.md","isCustom":false,"source":"builtin"}
```

Both confirmations: `{fileName}` is now accepted, and `/api/skills` emits `relativeLocation` / `isCustom` on the wire.

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

| Class                               | Run 1 | Run 2 | Notes                                                                                          |
| ----------------------------------- | ----- | ----- | ---------------------------------------------------------------------------------------------- |
| D — backend response shape mismatch | 1     | 0     | Run 1: S7 (SkillListItemResponse snake_case). Fixed in H1.                                     |
| F — backend contract gap            | 1     | 0     | Run 1: S1 + S2 (ReadBuiltinResourceRequest rejects fileName). Fixed in H1.                     |
| A — stateful / scale flakes         | 0     | 0     | Two clean runs at 38s and 13.5s; no flakes.                                                    |
| B / C / E — test-authoring          | 0     | 0     | Run 1 pre-report had one Class B (frontmatter-name assumption) — self-fixed before submission. |

## Outcome per plan §3.5

**Run 2: all 8 scenarios green. T3 clean — marking complete, handing to T4.**

- Run 1 correctly classified 2 defects (D1 + D2) and routed to backend-dev per §3.5. Backend-dev landed H1 (`04f1537`) as a full-file camelCase audit on `skill.rs` — exceeds the minimum fix and closes D3 in one pass.
- No frontend changes owed across either run — the renderer has been spec-correct throughout (§6 of the backend spec mandates camelCase on the wire).
- T4 coordinator closure unblocked.

## Run 3 — post-realign (snake_case wire)

**Date:** 2026-04-24
**Backend SHA:** `326e228` (aionui-backend — H1 reverted; `skill.rs` realigned to snake_case on wire)
**Frontend SHA:** `dba2ef499` (AionUi — `refactor(skill): realign wire format to snake_case (T2)`)
**Backend binary timestamp:** Apr 24 14:35:12 2026
**Verdict:** **CLEAN — 8/8 green, 13.1s wall time.** Project-wide `snake_case` wire contract now enforced end-to-end.

### Why re-run

Between runs 2 and 3 the project-wide API contract was flipped from camelCase to snake_case (plan: `2026-04-23-snake-case-realign-plan.md`). This matches the canonical convention used by the rest of the backend (team, conversation, cron, channel, assistant). H1's camelCase rename on `skill.rs` was reverted under T1 and `aionui-api-types/src/skill.rs` now asserts `snake_case` on both request and response paths (`test_materialize_response_serializes_snake`, `test_skill_list_item_serde` asserts `json["is_custom"]` / absence of `isCustom`, etc.). Frontend T2 flipped `ipcBridge.ts` + hooks to consume the new wire format.

Run 3 verifies the full stack is coherent after both flips.

### Test-file flips (T3)

After the realign, `tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts` still had camelCase residue in both response assertions and request bodies. All flipped under T3:

| Site                                           | Before                              | After                                 |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------- |
| `interface SkillInfo` field (L67-68)           | `relativeLocation`, `isCustom`      | `relative_location`, `is_custom`      |
| `interface MaterializeResponse` (L73)          | `dirPath`                           | `dir_path`                            |
| All `resp.dirPath` readers (S3/S4/S5)          | `resp.dirPath`                      | `resp.dir_path`                       |
| S3/S4/S5 POST body keys                        | `{ conversationId, enabledSkills }` | `{ conversation_id, enabled_skills }` |
| S1/S2 `POST /api/skills/builtin-skill` body    | `{ fileName }`                      | `{ file_name }`                       |
| S7 `POST /api/skills/export-symlink` body      | `{ skillPath, targetDir }`          | `{ skill_path, target_dir }`          |
| S7 assertion (already flipped by frontend-dev) | `entry.relativeLocation`            | `entry.relative_location`             |

Local TS variable names (`conversationId`, `skillPath`, `targetDir`) are retained — they're not wire-carried fields. The URL-path interpolation `/${conversationId}` is a path segment, not a body field, and stays as-is.

### Per-scenario matrix — run 3

| #   | Scenario                                                                   | Run 3            | Notes                                                                                                                                      |
| --- | -------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | `GET /api/skills/builtin-auto` non-empty + round-trip body read            | **PASS (11.3s)** | `{file_name}` round-trip with snake_case body; frontmatter + name assertions green.                                                        |
| S2  | AcpSkillManager data-source (list + body round-trip)                       | **PASS (95ms)**  | All auto-inject bodies fetch successfully over snake_case wire.                                                                            |
| S3  | `materialize-for-agent` writes opt-in skills into the dir                  | **PASS (19ms)**  | `resp.dir_path` present; `mermaid/SKILL.md` and flattened auto-inject dirs all materialized.                                               |
| S4  | Materialized dir structure suits gemini `--extensions`                     | **PASS (20ms)**  | Every top-level entry is a dir with a `SKILL.md`.                                                                                          |
| S5  | DELETE cleanup + idempotency                                               | **PASS (28ms)**  | First DELETE removes dir; second DELETE succeeds.                                                                                          |
| S7  | `/api/skills` exposes absolute `location` + `relative_location` for export | **PASS (187ms)** | `relative_location` populated on every builtin row; export-symlink round-trip with `{skill_path, target_dir}` lands a readable `SKILL.md`. |
| S6  | Startup orphan sweep for unknown conversation ids                          | **PASS (274ms)** | Seeded `orphan-conv-1/2` removed within 5s of sibling backend boot.                                                                        |
| S8  | Legacy `{cacheDir}/builtin-skills/` lifecycle                              | **PASS (261ms)** | Backend does NOT touch stray `{data_dir}/builtin-skills/`; sibling stays healthy.                                                          |

**Run 3 total wall clock:** 13.1s. No retries, no flakes.

### Failure classification — run 3

| Class                       | Count          | Notes                                                                                                                                                                                  |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — stateful / scale flakes | 0              | Clean single-pass run.                                                                                                                                                                 |
| B — test-authoring          | 0              | Straight-through.                                                                                                                                                                      |
| C — test/fixture mismatch   | 0 at final run | Intermediate run (3a) had 3 Class C failures (S1/S2/S7 sending `{fileName, skillPath, targetDir}` camelCase bodies the audit pattern missed). Re-audited, flipped, re-ran — all green. |
| D / F — backend contract    | 0              | Wire format matches snake_case spec.                                                                                                                                                   |
| E — infra                   | 0              |                                                                                                                                                                                        |

### Outcome

**All 8 scenarios green on the realigned pair (backend `326e228` + frontend `dba2ef499`). T3 complete, unblocks T4.**

- snake_case wire contract verified end-to-end across read, write, delete, cold-start, and external-export flows.
- No further frontend or backend changes owed.
- T4 coordinator closure now unblocked per §3.5.

## Follow-ups (non-blocking, document for future)

- Adding a snapshot-level JSON contract test in `aionui-api-types` (or a pact-style check in `skills_builtin_e2e.rs`) would have caught both defects pre-T3. Worth considering as a backend-dev chore after the pilot.
- S8 full cold-restart coverage for the legacy-dir cleanup path still depends on T4 packaging smoke or a future dedicated worker-per-boot E2E spec. Not a regression risk because (a) the cleanup is fire-and-forget best-effort in `initStorage.ts:357-365` and (b) a leftover 7MB dir is harmless.
- S2 today stops at "all builtin-auto bodies resolve"; a deeper probe would drive an actual ACP conversation and inspect the injected message. That is cross-backend (ACP + HTTP) and out of scope for this pilot; the current coverage matches the bar set by the frontend spec §9 row for e2e-tester.
