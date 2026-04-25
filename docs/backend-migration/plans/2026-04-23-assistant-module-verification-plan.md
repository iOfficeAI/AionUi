# Assistant Module Verification — Implementation Plan

> Coordinator-owned. Executed by a small TEAM (coordinator + frontend-dev + e2e-tester;
> backend-dev on demand). Teammates follow the plan section assigned to them.
>
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Verify the Assistant module's backend migration (already done as a
side effect of the Skill-Library pilot) preserves pre-migration behavior
end-to-end.

**Architecture:** Verification track, not a fresh migration. Three-teammate
team (coordinator + frontend-dev + e2e-tester), serialized on a single AionUi
working tree. backend-dev only spawned if Class D/F failures surface.

**Tech Stack:** Vitest 4 + Playwright + axum backend binary from
`aionui-backend` repo (already current via `~/.cargo/bin/aionui-backend`).

---

## Branches

| Branch                                     | Repo           | Base                            | Owner       |
| ------------------------------------------ | -------------- | ------------------------------- | ----------- |
| `feat/backend-migration-coordinator`       | AionUi         | (reused from Skill pilot)       | coordinator |
| `feat/backend-migration-assistant-verify`  | AionUi         | `origin/feat/backend-migration` | fe + e2e    |
| `feat/extension-assistant-fix` (on demand) | aionui-backend | `origin/feat/backend-migration` | backend-dev |

---

## Task 0 — Coordinator setup

- [ ] **Step 0.1: Fetch all remotes**

```bash
git -C /Users/zhoukai/Documents/github/AionUi fetch origin
git -C /Users/zhoukai/Documents/github/aionui-backend fetch origin
```

- [ ] **Step 0.2: Create verification branch**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout -b feat/backend-migration-assistant-verify origin/feat/backend-migration
git merge origin/kaizhou-lab/test/e2e-coverage --no-edit
git push -u origin feat/backend-migration-assistant-verify
```

Expected: branch at `origin/feat/backend-migration` tip + e2e-coverage merged.
If conflicts: resolve (prefer e2e-coverage for `tests/e2e/` paths, prefer base
for `src/` paths), commit, push.

- [ ] **Step 0.3: Pre-flight endpoint mapping sanity check**

Read-only verification:

```bash
grep -n "assistant" /Users/zhoukai/Documents/github/AionUi/src/common/adapter/ipcBridge.ts | head -15
grep -n "assistant-rule\|assistant-skill\|assistants" /Users/zhoukai/Documents/github/aionui-backend/crates/aionui-extension/src/routes.rs /Users/zhoukai/Documents/github/aionui-backend/crates/aionui-extension/src/skill_routes.rs 2>/dev/null | head -15
```

Expected — 7 endpoint pairs match:

- `ipcBridge.extensions.getAssistants` ↔ `GET /api/extensions/assistants`
- `ipcBridge.fs.readAssistantRule` ↔ `POST /api/skills/assistant-rule/read`
- `ipcBridge.fs.writeAssistantRule` ↔ `POST /api/skills/assistant-rule/write`
- `ipcBridge.fs.deleteAssistantRule` ↔ `DELETE /api/skills/assistant-rule/{id}`
- `ipcBridge.fs.readAssistantSkill` ↔ `POST /api/skills/assistant-skill/read`
- `ipcBridge.fs.writeAssistantSkill` ↔ `POST /api/skills/assistant-skill/write`
- `ipcBridge.fs.deleteAssistantSkill` ↔ `DELETE /api/skills/assistant-skill/{id}`

If any mismatch: STOP and SendMessage user. Do not proceed.

- [ ] **Step 0.4: Confirm backend binary current**

```bash
cd /Users/zhoukai/Documents/github/aionui-backend
git checkout feat/extension-skill-library     # latest backend work
ls -la ~/.cargo/bin/aionui-backend            # must exist
stat -f "%Sm" ~/.cargo/bin/aionui-backend     # must post-date any recent backend change
```

If missing or stale:

```bash
cargo install --path crates/aionui-app
```

- [ ] **Step 0.5: Rebuild renderer bundle**

Lesson from Skill pilot: stale `out/renderer/` breaks e2e silently.

```bash
cd /Users/zhoukai/Documents/github/AionUi
bunx electron-vite build
stat -f "%Sm" out/renderer/index.html         # must be fresh (today)
```

- [ ] **Step 0.6: Create team and tasks**

```
TeamCreate { team_name: "aionui-assistant-verify", description: "Assistant module backend migration verification" }
```

Register tasks:

- Task A: frontend-dev — Vitest + manual UI spot-check
- Task B: e2e-tester — run assistant e2e suite + classify + report
- Task C: coordinator closure
- (on demand) Task D: backend-dev targeted fix

Block-by chain: B blocked by A; C blocked by B; D inserted between A/B or after B as needed.

- [ ] **Step 0.7: Commit plan + spec to coordinator branch**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout feat/backend-migration-coordinator
git add docs/backend-migration/specs/2026-04-23-assistant-module-verification-design.md docs/backend-migration/plans/2026-04-23-assistant-module-verification-plan.md
git commit -m "docs(backend-migration): add assistant module verification spec and plan"
git push
```

---

## Task A — Frontend verification

**Owner:** frontend-dev. **Depends on:** Task 0 complete.

**Files (to be touched only if Vitest flags issues):**

- `tests/unit/assistantHooks.dom.test.ts` (likely needs auto-unwrap mock fix, same as SkillsHub)
- `tests/unit/assistantUtils.test.ts`
- `tests/unit/assistantPresets.i18n.test.ts`

Pre-activation (coordinator):

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout feat/backend-migration-assistant-verify
git pull --ff-only
```

### Mandatory first 3 tool calls (same pulse rule)

1. `TaskUpdate(taskId:"<A>", owner:"frontend-dev", status:"in_progress")`
2. `SendMessage` to `coordinator`: `"frontend-dev alive, starting Assistant verification"`.
3. `Bash`: verify branch.

### Step A.1 — lint + type check

```bash
cd /Users/zhoukai/Documents/github/AionUi
bunx tsc --noEmit
bun run lint --quiet
```

Expected: both pass. If not: fix atomically per AGENTS.md rules.

### Step A.2 — Vitest assistant scope

```bash
bun run test -- --run tests/unit/assistantHooks.dom.test.ts tests/unit/assistantUtils.test.ts tests/unit/assistantPresets.i18n.test.ts
```

Expected: all green. If any fail due to HTTP auto-unwrap mock pattern (same
as SkillsHub ab06d3a3b), fix atomically:

Commit pattern: `test(assistant-hooks): unwrap ipcBridge mocks for HTTP bridge auto-unwrap`

Push per commit.

### Step A.3 — Manual UI spot-check

```bash
bun start
```

**Test cases (take screenshots of each; save to `/tmp/assistant-verify/` — do NOT commit screenshots):**

1. Open Settings → Assistants. List populates within 3 s.
2. Click on any builtin assistant card. Edit drawer opens.
3. In edit drawer, the "Rules" section loads existing content (read).
4. Edit the rule text. Save. Drawer closes, toast success.
5. Reopen the same assistant. Confirm the edit persisted (read again returns new content).
6. Delete the assistant (for a duplicated one, not builtin — or use duplicate first). Confirm list updates.
7. Check Auto-Skills picker in edit drawer — populated (uses E2 from Skill pilot).

If any step fails: write `docs/backend-migration/incidents/2026-04-23-assistant-<symptom-slug>.md`, commit, push, SendMessage coordinator.

If all pass: proceed.

### Step A.4 — Write module log

Create `docs/backend-migration/modules/assistant.md`:

```markdown
# Assistant Module Migration Record — 2026-04-23

## Status: Migration complete (pre-existing, via Skill-Library pilot)

## Endpoints migrated

<7 endpoints with backend commit SHAs>

## Renderer touched (this verification)

<files changed, if any>

## Known caveats

<anything surfaced>
```

Commit: `docs(backend-migration): record assistant module verification`.
Push.

### Step A.5 — Write frontend-dev handoff

`docs/backend-migration/handoffs/frontend-dev-assistant-verify-2026-04-23.md`
following the pilot's Step 5.1 template. Commit + push.

### Step A.6 — Release working tree and notify

SendMessage `coordinator`: `"Task A complete. Branch <sha>. Released working tree."`

`TaskUpdate(taskId:"<A>", status:"completed")`.

---

## Task B — E2E verification

**Owner:** e2e-tester. **Depends on:** Task A complete.

**Files (only doc writes):**

- `docs/backend-migration/e2e-reports/2026-04-23-assistant.md` (create)
- `docs/backend-migration/handoffs/e2e-tester-assistant-verify-2026-04-23.md` (create)

Pre-activation (coordinator):

- Verify Task A pushed + ack'd.
- AionUi already on the same verification branch.
- Re-confirm backend binary + renderer bundle still current (quick `stat` check).

### Mandatory first 3 pulses

Same as Task A. Claim task, alive message, branch verify.

### Step B.1 — Pre-run check

```bash
cd /Users/zhoukai/Documents/github/AionUi
git log --oneline -5
which aionui-backend
export PATH="$HOME/.cargo/bin:$PATH"
stat -f "%Sm" ~/.cargo/bin/aionui-backend out/renderer/index.html
```

Both timestamps must be from today.

### Step B.2 — Enumerate test surface

```bash
ls tests/e2e/features/assistants/
grep -c "^\s*test(" tests/e2e/features/assistants/*.e2e.ts
grep -n "invokeBridge\|subscribe-" tests/e2e/helpers/assistantSettings.ts
```

Expected: 3 files, ~50 tests total. Expect 0 legacy IPC matches in the helper
(unlike skills, which had 9).

### Step B.3 — Run the full suite

SendMessage `coordinator` with start time + ETA BEFORE running:

```bash
bun run test:e2e tests/e2e/features/assistants/
```

ETA estimate: 30-60 min for ~50 tests (at ~30-60s per test with 60s timeout,
single worker).

### Step B.4 — Classify failures using the pilot's rubric

Same categories:

- **Class D (transport/migration)**: something mis-shaped between backend
  response and renderer. Contract gap introduced by migration.
- **Class F (backend contract gap)**: endpoint exists but missing behavior
  the renderer relied on in the TS era (like TC-S-17 duplicate-path rejection).
- **Class A (stateful/scale)**: works at small scale, breaks at larger scale
  due to state pollution.
- **Class B/C/E (test-authoring)**: fixture assumptions don't hold in
  sandbox, selector ambiguity, test state leak.

### Step B.5 — Write the report

`docs/backend-migration/e2e-reports/2026-04-23-assistant.md` with:

- Pass/fail matrix per test
- Classification per failure
- Direct backend probes via `curl` for Class D/F hypotheses
- UI-rendering verdict (verified / not verified)
- Module-#3 prerequisites section (if discovered)

Commit: `docs(backend-migration): e2e verification report for assistant module`. Push.

### Step B.6 — Write handoff

Same pattern. Commit + push.

### Step B.7 — Outcome routing

- **ALL PASS** OR **only Class B/C/E**: pilot-equivalent success. SendMessage
  `coordinator`: "Assistant e2e verification clean (or with test-authoring
  residual only)." `TaskUpdate` completed.
- **Class D or F remaining**: DO NOT mark complete. SendMessage `coordinator`
  with per-failure routing suggestion; coordinator spawns backend-dev for
  Class D/F fixes, then B loops back to rerun.

---

## Task D — Backend targeted fix (on demand only)

Spawned only if Task B reveals Class D or Class F failures.

Brief to backend-dev:

- Read the failing e2e case + backend probe results from Task B report.
- Write a failing test at the right level (HTTP integration or unit).
- Implement fix.
- `cargo test + cargo build --release + cargo install`.
- Push.
- SendMessage `coordinator` with SHA.
- No handoff required for tiny patches; append to existing backend-dev pilot
  handoff.

---

## Task C — Coordinator closure

**Depends on:** Task B completed.

- [ ] **Step C.1 — Switch back to coordinator branch**

```bash
cd /Users/zhoukai/Documents/github/AionUi
git checkout feat/backend-migration-coordinator
git merge origin/feat/backend-migration-assistant-verify --no-edit
git push
```

- [ ] **Step C.2 — Write coordinator handoff**

`docs/backend-migration/handoffs/coordinator-assistant-verify-2026-04-23.md`
capturing: final outcome, lessons (esp. any "we can skip pilot for modules
already migrated as side effect" patterns), open tickets.

Commit + push.

- [ ] **Step C.3 — Shutdown teammates**

SendMessage shutdown_request to frontend-dev, e2e-tester, and backend-dev (if
spawned). TaskUpdate Task C completed.

- [ ] **Step C.4 — Tee up next module**

Based on outcome: either declare Assistant module done and start the next
module per spec §3 ordering, OR note remaining blockers for the user.

Update `docs/backend-migration/post-pilot/2026-04-23-skill-library-followups.md`
with any new items uncovered during verification.

---

## Success Criteria (same as spec §7)

- [ ] Vitest assistant-scoped tests all green
- [ ] AssistantSettings UI spot-check passes 7 steps
- [ ] E2E Class D = 0
- [ ] E2E Class F = 0 OR explicitly documented as pre-existing TS gap
- [ ] Each teammate has handoff
- [ ] Module record created
