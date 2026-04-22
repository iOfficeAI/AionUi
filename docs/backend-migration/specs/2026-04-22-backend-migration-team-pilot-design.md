# AionUi Backend Migration — Team Coordination Pilot (Skill-Library)

**Date:** 2026-04-22
**Author:** Coordinator (Claude)
**Status:** Draft — pending user review

## 1. Background & Goal

AionUi currently ships as a single Electron app where the main process hosts all
backend logic. We are moving that logic into a standalone Rust service
(`aionui-backend`) so AionUi can become a thin Electron renderer client and
other clients (web, mobile) can reuse the same backend.

The `feat/backend-migration` branch already contains the communication
scaffolding (HTTP/WS client, backend subprocess lifecycle, port injection,
preload exposure). What remains is the incremental **per-module migration** of
actual business behavior, starting with the Assistant and Skill feature
surfaces.

The migration is large, the backend is itself still stabilizing, and work is
ongoing. Rather than one big-bang rewrite, this spec defines a **team-based
incremental workflow** and a **Skill-Library pilot module** to prove the
workflow end-to-end before scaling to the rest.

## 2. Scope

**In scope for this spec:**

- Team topology (roles, responsibilities, branching, logging).
- The pilot module: **Skill-Library** (5 read-only skill endpoints).
- Success criteria for the pilot.

**Out of scope (deferred to future specs/plans):**

- Migration of the remaining 5 Assistant/Skill modules (decomposition is fixed
  below, but execution is not part of this spec).
- Web/mobile clients of `aionui-backend`.
- Any change to the communication scaffolding on `feat/backend-migration`.

## 3. Entry Points & Module Decomposition

The two renderer entry points driving this migration:

- `src/renderer/pages/settings/AssistantSettings/index.tsx`
- `src/renderer/pages/settings/SkillsHubSettings.tsx`

Under them, ~28 `ipcBridge` calls spread across three renderer hooks
(`useAssistantEditor`, `useAssistantList`, `useAssistantSkills`). The
corresponding process-side behavior baseline is in
`src/process/extensions/{ExtensionRegistry.ts, resolvers/AssistantResolver.ts,
resolvers/SkillResolver.ts}`.

These are split into **6 capability-area subtasks**, executed one at a time:

| # | Module                    | Endpoints (renderer-side)                                                                                        | Notes                      |
| - | ------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1 | **Skill-Library** (pilot) | `listAvailableSkills`, `listBuiltinAutoSkills`, `readBuiltinRule`, `readBuiltinSkill`, `readSkillInfo`           | Pure read; no side effects |
| 2 | Assistant-CRUD            | `getAssistants` (+ any sibling CRUD)                                                                             | Pure read                  |
| 3 | Assistant-Editor-Content  | `readAssistantRule/Skill`, `writeAssistantRule/Skill`, `deleteAssistantRule/Skill`                               | Read/write                 |
| 4 | Skill-Import-Export       | `importSkill`, `importSkillWithSymlink`, `exportSkillWithSymlink`, `deleteSkill`                                 | Destructive                |
| 5 | Skill-External-Paths      | `getSkillPaths`, `detectAndCountExternalSkills`, `detectExternalSkills`, `addCustomExternalPath`, `scanSkills`   | FS-heavy                   |
| 6 | Assistant-Skill-Binding   | Binding flows in `useAssistantSkills` (composes endpoints from #1, #2, #3)                                       | Integration                |

Execution order after the pilot is driven by endpoint dependencies, not this
numbering — a later module may start whenever all endpoints it depends on are
green.

## 4. Team Topology

### 4.1 Roles

| Role                  | Count | Responsibility                                                                                                                                   |
| --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Coordinator** (me)  | 1     | Schedule modules, assign tasks, sync branches, resolve branch conflicts, replace unresponsive teammates. **Does not write production code.**     |
| **Backend dev**       | 1     | Implement endpoints in `aionui-backend`, keep `docs/api-spec/13-extension.md` authoritative and up-to-date per module.                           |
| **Frontend dev**      | 1     | Replace `ipcBridge` calls in renderer to hit the new HTTP endpoints, preserve existing UX behavior against the TS baseline.                      |
| **E2E tester**        | 1     | Run the e2e suite from `kaizhou-lab/test/e2e-coverage` against the frontend dev branch for each module.                                          |

One teammate per role — a single dev owns the currently active module end to
end. Because the two repos are independent, **backend-dev (in aionui-backend)
runs in parallel with any AionUi-side role**. Inside AionUi itself there is
only one working directory, so AionUi-side roles (coordinator / frontend-dev /
e2e-tester) are **serialized**; the coordinator orchestrates branch switches
between them.

### 4.2 Branching (no worktrees)

Each repo has **one working directory**. In aionui-backend the backend-dev
stays on their branch for the duration of their task. In AionUi the
coordinator checks out the appropriate branch before handing control to the
next AionUi-side teammate. Nested refs are avoided (flat names) because git
cannot have both `feat/backend-migration` and
`feat/backend-migration/<child>`.

| Branch                                        | Repo             | Base                              | Owner         |
| --------------------------------------------- | ---------------- | --------------------------------- | ------------- |
| `feat/backend-migration-coordinator`          | AionUi           | `origin/feat/backend-migration`   | coordinator   |
| `feat/backend-migration-fe-skill-library`     | AionUi           | `origin/feat/backend-migration`   | frontend-dev  |
| `feat/extension-skill-library`                | aionui-backend   | `origin/feat/backend-migration`   | backend-dev   |
| `feat/backend-migration-e2e-skill-library`    | AionUi           | `feat/backend-migration-fe-skill-library` (then merge `origin/kaizhou-lab/test/e2e-coverage`) | e2e-tester |

**Rule:** `feat/backend-migration` in BOTH repos (AionUi and aionui-backend)
is the integration base — **nobody commits to it directly during the pilot**.
`main` is not used as a base in either repo for this work. Integration of
pilot work back into `feat/backend-migration` is scheduled as a separate,
user-approved step after the pilot closes; it is not part of this pilot.

### 4.3 Coordinator-driven branch switching

No periodic sync loop. Instead, per repo:

**aionui-backend (backend-dev — runs in parallel with AionUi work):**
- Coordinator checks out `feat/extension-skill-library` once, at the start of
  backend-dev's task, after fetching `origin/feat/backend-migration` and
  merging it in if needed.
- Backend-dev stays on that branch until done. Coordinator does not touch
  this repo while backend-dev is active.

**AionUi (coordinator / frontend-dev / e2e-tester — serialized):**
- Before each AionUi-side teammate starts: `git fetch origin`, then
  `git checkout <teammate-branch>`. If the teammate's branch has fallen
  behind `origin/feat/backend-migration`, the coordinator merges the base in
  and pushes **before** handing control over.
- Hands control via SendMessage.
- When the teammate finishes (or is replaced), the coordinator switches the
  AionUi working directory to the next teammate's branch before that
  teammate is activated.

Conflict policy unchanged:
- Conflicts with no business semantics: coordinator resolves.
- Conflicts with business semantics: coordinator escalates to the owning dev.

## 5. Workflow & Discipline

### 5.1 Commit & push rules

- One atomic change (1 endpoint / 1 hook / 1 spec section / 1 test case) = one
  commit.
- Each commit is immediately `git push`-ed. No local accumulation.
- Commit message: `<type>(<scope>): <subject>` (English, per project rules, no
  AI signatures).
- **No pull requests**, **no GitHub issues** — branches and commits are the
  integration artifacts.

### 5.2 Leave-a-trace policy

Three persistence layers, each with a specific purpose:

| Layer                           | Location                                                                                | Owner              | Purpose                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| Git history                     | Each role's branch                                                                      | All                | Atomic code changes                                                     |
| TaskList (team tasks)           | `~/.claude/tasks/aionui-backend-migration/`                                             | All                | Task status, owner changes, blocked reasons, per-task discussion        |
| Per-module migration log        | `docs/backend-migration/modules/<module>.md`                                            | Frontend dev       | Completion record of each module (endpoints, caller refactors, notes)   |
| Incident log                    | `docs/backend-migration/incidents/YYYY-MM-DD-<slug>.md`                                 | Discoverer or me   | Cross-role incidents: interface mismatch, behavior drift, decisions     |
| Backend API contract            | `aionui-backend/docs/api-spec/13-extension.md`                                          | Backend dev        | Living spec, updated per module                                         |
| E2E reports                     | `docs/backend-migration/e2e-reports/YYYY-MM-DD-<module>.md`                             | E2E tester         | Cases run, pass/fail, repro steps when failing                          |
| **Handoff doc (on exit)**       | `docs/backend-migration/handoffs/<role>-<module>-<date>.md` in the role's own repo     | Exiting teammate   | What's done, what's mid-flight, known issues, next steps for successor  |

Handoff files live in whichever repo the role works in: backend-dev's
handoff goes in `aionui-backend/docs/backend-migration/handoffs/`;
frontend-dev's, e2e-tester's, and coordinator's go in
`AionUi/docs/backend-migration/handoffs/`. Migration logs, incidents, and
e2e reports all live in AionUi (frontend/e2e-owned content).

All AionUi-side docs are committed to the author's own branch (coordinator
writes on the coordinator branch, frontend dev on the frontend branch, etc.).
Integration back into `feat/backend-migration` happens only after the pilot
closes, as a separate user-approved step.

**Rule:** one event = one file. Do not bundle multiple events into the same
file.

### 5.3 Interface-mismatch loop

When the frontend dev finds an endpoint behaving off-spec:

1. Frontend dev writes an incident file under
   `docs/backend-migration/incidents/` describing symptom + expected vs actual.
2. SendMessage to backend dev.
3. Backend dev reproduces, determines whether it's a backend bug, a spec error,
   or a frontend misuse. Updates spec if needed, fixes if needed, commits +
   pushes.
4. Frontend dev retests.
5. E2E tester re-runs the e2e suite against the updated frontend branch.

The loop is tracked via the TaskList (the incident becomes a sub-task blocking
the module).

### 5.4 Unresponsive teammate

The coordinator uses situational judgment (no fixed timeout) to decide when a
teammate is unresponsive. On replacement:

1. `SendMessage` shutdown_request to the original teammate.
2. Spawn a same-role replacement.
3. New teammate uses the same branch and inherits committed work. Uncommitted
   dirty state is discarded (coordinator runs `git stash drop` or
   `git checkout -- .` in the relevant repo before activating the replacement).
4. `TaskUpdate` the task's `owner` to the new teammate.

### 5.5 Completion handoff

Every teammate, before exiting (whether task completed or being replaced),
writes `docs/backend-migration/handoffs/<role>-<module>-<date>.md`:

- What was done (commits, endpoints, tests).
- What remains.
- Known issues / open questions.
- Pointer to the active branch and most recent commit SHA.

## 6. Pilot Module — Skill-Library

### 6.1 Endpoints in scope

All are renderer→backend, HTTP, read-only. Reference paths live in
`src/common/adapter/ipcBridge.ts`:

| Renderer API                              | Backend path (current spec declaration)       |
| ----------------------------------------- | --------------------------------------------- |
| `ipcBridge.fs.listAvailableSkills`        | `GET /api/skills` (inferred)                  |
| `ipcBridge.fs.listBuiltinAutoSkills`      | `GET /api/skills/builtin-auto`                |
| `ipcBridge.fs.readBuiltinRule`            | `POST /api/skills/builtin-rule`               |
| `ipcBridge.fs.readBuiltinSkill`           | `POST /api/skills/builtin-skill`              |
| `ipcBridge.fs.readSkillInfo`              | `POST /api/skills/info`                       |

Backend dev confirms/corrects these against current aionui-backend
implementation and updates `13-extension.md` per-endpoint. Frontend dev
refactors `SkillsHubSettings.tsx` and any hook call sites.

### 6.2 Behavior baseline

The TS implementation in `src/process/extensions/resolvers/SkillResolver.ts`
(and the resource folder `src/process/resources/skills/`) is the baseline.
Post-migration behavior must match: same skill list, same fields, same ordering,
same error cases visible to the user.

### 6.3 Success criteria

The pilot is considered successful when:

1. The e2e suite on `kaizhou-lab/test/e2e-coverage` covering Skill-Library
   endpoints (to be identified by the E2E tester) passes against the frontend
   dev branch running on top of a backend dev branch that implements the 5
   endpoints.
2. All four teammate-owned branches are pushed and up-to-date with their
   respective base branches.
3. Each teammate has written a handoff file.
4. `docs/backend-migration/modules/skill-library.md` exists and summarizes the
   migration.

No manual visual regression check is required beyond what the e2e suite
covers.

## 7. Risks & Mitigations

| Risk                                                                        | Mitigation                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| aionui-backend is unstable and endpoint returns wrong shape                 | Treat spec as draft (Q2 option B); incident log captures every mismatch; backend dev owns the fix    |
| Teammate goes silent for hours                                              | Coordinator swaps them out (Q4); branch/commits are preserved, new teammate continues from last push |
| Branch drift during serial stage handoff                                    | Coordinator rebases/merges base into teammate branch before handing control; conflicts per §4.3      |
| Pilot reveals the workflow itself is wrong (e.g., wrong granularity)        | Pilot is explicitly a learning round; update this spec (or write a follow-up) before module #2       |

## 8. Open items for future specs

- Decomposition/execution plan for modules 2–6 (deferred until after pilot).
- Whether to run 2 modules in parallel once the pilot validates the workflow
  (current answer: start with 1).
- Whether web/mobile renderers should follow the same migration structure.

## 9. Decision log (from brainstorm)

- **Q1 Workspace:** Frontend dev branches off `AionUi/feat/backend-migration`.
  Backend dev branches off `aionui-backend/feat/backend-migration` (BOTH
  repos use the same branch name as integration base; `main` is not used).
  E2E merges `kaizhou-lab/test/e2e-coverage` into the frontend dev branch.
  Coordinator stays on a dedicated coordinator branch in AionUi. Integration
  back into base branches is a separate post-pilot step. **No worktrees.**
  aionui-backend and AionUi are separate repos that run in parallel; within
  AionUi the coordinator / frontend-dev / e2e-tester are serialized on a
  single working directory.
- **Q2 Backend scope:** B — spec is a starting point, backend dev owns keeping
  it current. TS implementation is the behavior baseline.
- **Q3 Decomposition:** B — 6 capability-area modules.
- **Q4 Unresponsive teammate:** C + scheme 2 — situational judgment; replacement
  inherits committed work.
- **Q5 Traceability:** Git + TaskList + per-event files (one event per file),
  with a handoff file per teammate on exit.
- **Q6 Cadence:** No PRs, no issues — atomic commits immediately pushed.
- **Q7 Parallelism:** Pilot with 1 module first.
- **Q8 Pilot:** Skill-Library, success = e2e coverage of its 5 endpoints passes.
