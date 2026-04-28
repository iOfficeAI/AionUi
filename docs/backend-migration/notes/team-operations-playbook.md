# Team Operations Playbook

Practical rules for running team-mode migrations in this codebase.
Append new lessons as they happen; newest on top.

## Worktree base + PR target convention (MANDATORY)

All team-mode pilots MUST follow this worktree + PR convention.

### aionui-backend

- **Worktree base**: `origin/main`
- **Coordinator branch**: created off `origin/main`, local-only during the pilot
- **Feature / fix branches**: created off the coordinator branch
- **Pilot close**: coordinator raises a **PR from coord branch → `main`**.
  Do NOT `git merge` coord branch directly into `main` — always go through
  GitHub PR for review + CI.
- Worktree path: `/Users/zhoukai/Documents/worktrees/aionui-backend-<topic>/`

### AionUi

- **Worktree base**: `origin/feat/backend-migration`
- **Coordinator branch**: created off `origin/feat/backend-migration`, local-only
- **Feature / fix branches**: created off the coordinator branch
- **Pilot close**: PR from coord branch → `feat/backend-migration`. Do NOT merge directly.
- Worktree path: `/Users/zhoukai/Documents/worktrees/aionui-<topic>/`

### Rationale

- `main` / `feat/backend-migration` are integration points other consumers
  expect to be green. PR gates give reviewable diff + CI.
- Basing on `origin/<base>` (not another pilot's in-flight coord branch) avoids
  cross-pilot state collision when concurrent pilots run.

### Coordinator closure checklist

After T3 green:
1. Push coord branch to origin.
2. `gh pr create --base main` (backend) or `--base feat/backend-migration` (AionUi).
3. PR body references the handoff doc.
4. Do NOT "Squash and merge" yourself unless user directs — wait for user/reviewer.
5. Merge-back to local `main` / `feat/backend-migration` happens AFTER PR merge,
   via `git pull`.

## Zombie teammate: detect and replace (autonomous)

**Symptom:** Teammate sends idle notification then goes silent. Messages sent
by coordinator land with `read=True` but no TaskUpdate, no git changes, no
follow-up. Idle notifications may stop entirely.

**Diagnosis threshold:** 10 minutes of zero activity after a message was read.
Silence with NO git changes and NO new messages for 10+ min is dead, not busy.
(Long `cargo build` can be 10-20 min; check git/inbox before assuming dead.)

**Diagnose before messaging:** `TaskList()` + `git status` + inbox read state
before sending another message. Multiple "please execute" messages to a dead
agent compound confusion without effect.

**Replacement protocol (autonomous, do NOT ask user):**

1. Edit `~/.claude/teams/{team}/config.json` — remove dead member from `members`.
   Use `python3 -c` with json.load/dump for safety.
2. `rm ~/.claude/teams/{team}/inboxes/{name}.json` — clear stale messages.
3. Re-spawn via Agent tool with the same name + a SHORT prompt.
4. Do NOT SendMessage a shutdown_request first — dead agents don't respond.

The replacement protocol is deterministic and safe. Asking for approval each
time just slows recovery. User can override after the fact.

**No diagnostic questions to user either.** Don't ask "was that rebase you?",
"did you change X?". Figure it out from git/fs directly. If the new spawn
needs resilience against unknown remote state, bake
`git fetch && git reset --hard origin/<branch>` into the spawn prompt — the
new agent self-heals.

**Spawn prompt discipline (to avoid repeat zombies):**
- One task per spawn. Do not combine "fix clippy + start T1b".
- Include "If stuck 5+ minutes, SendMessage team-lead immediately".
- Mandatory progress reporting every ~10 min, even during investigation:
  "SendMessage team-lead a progress update every 10 minutes until you push —
  even if you're still reading code. Say what you've read, your current
  hypothesis, and the next thing you'll check."
- Keep prompt under ~40 lines. Let the agent `TaskGet` + read plan file rather
  than duplicating detail in the prompt.

## Coordinator must proactively scan, not wait for inbox

**Problem:** Coordinator can lose visibility for long stretches because teammate
completions publish via git commits + TaskUpdate, not just inbox messages.
Idle-notification noise can mask real completions.

**Rules:**

1. **Every time user addresses coordinator, run a full scan before responding** —
   `TaskList`, `git log -3` on both repos, read last 10 inbox entries.
2. **"No new message" ≠ "no change"** — check git + TaskList too.
3. **Acknowledge every teammate completion within one user turn** — even just
   an ACK so teammate knows it was seen.
4. **Spot check every 10 min when actively waiting** — TaskList + inbox tail +
   git status on both repos, without user prompt. Never push back on user's
   "status?" prompt; always scan fresh.

## Teammate "task complete" requires verified push

When teammate reports "task complete", coordinator verifies:

```bash
cd <repo>
git fetch origin <branch>
git log origin/<branch> --oneline -3   # must include teammate's new commit
```

Do NOT accept "completed" without this check. If teammate's SHA is missing,
reopen (TaskUpdate in_progress) and send a precise commit+push instruction.
Frame it explicitly as "NOT a replay" — teammates sometimes misread
re-assignment-looking messages.

**Spawn prompt boilerplate:** "'Task complete' means commit + push succeeded
AND upstream sync verified, not just tests pass. Run
`git log origin/<branch> --oneline -1` before claiming completion and confirm
your SHA is there."

## Migration-class plan checklist

Every migration-class plan must include:

1. **Enumerate per-item user-intent state** at spec level — not just "user
   data" but *per-item state the user set intentionally* (e.g. `enabled=false`
   on built-ins, `sort_order`, `last_used_at`). For each: preserve, drop
   explicitly, or document.
2. **Real-user-data dry-run task before T5 E2E.** Pipeline:
   - Take one real user's legacy file (anonymize if needed)
   - Apply migration in sandboxed Electron
   - Diff preserved vs dropped
   - Any unexplained drop = spec/code gap, fix before E2E
3. **At least one Vitest + one Playwright scenario consumes a real-world
   fixture** — copy of actual user file, not hand-crafted minimal one.
4. **Delete migrated source** — frontend refactor task must explicitly include
   "delete the migrated resource directory", with DoD verification:
   `find src/process/resources -type d` post-migration returns only active dirs.
   (Grep-clean isn't enough — a directory with zero refs still carries size
   and misleads future readers.)

**Why hand-crafted tests miss real-user bugs:** Frontend unit tests mock the
bridge. Backend integration tests validate endpoints in isolation. E2E
fixtures are designed by the plan author and can't predict the shape of
"broken input from v1.9.17" or legacy flags users actually have.

## Wire-format fix direction needs an oracle

Any "which side adapts?" question must first run:

```bash
git log --oneline -- crates/aionui-api-types/
```

If there's a recent blanket refactor (e.g. `dae96f8` "remove camelCase serde
rename from all aionui-api-types structs"), **its decision is the oracle**.
The other side adapts.

If no recent refactor: check AGENTS.md §API Conventions. If still unclear,
it's a design decision to brainstorm with the user, NOT to hot-patch.

**Under no circumstance pick direction by "what makes the failing test pass
right now."** That path produced a camelCase island inside a snake_case
project during the builtin-skill pilot. See memory
`feedback_wire_flip_audit_scope.md` for audit-scope rules when flipping wire
keys.

## Packaging smoke as standalone acceptance step

When a pilot's motivation is "kill sibling `assets/` assumption", verifying
the fix requires running the binary *in a state where no sibling `assets/`
exist*. A dev-machine `cargo run` always has the sibling via
`target/debug/assets/`; full Electron `bun run build` is ~15 min.

Mid-fidelity 2-minute smoke (run during T4 closure for any asset-delivery
pilot):

```bash
cargo build --release
TMPDIR=$(mktemp -d)
cp target/release/aionui-backend "$TMPDIR/"
# Note: no `assets/` copied
"$TMPDIR/aionui-backend" --local --port 25905 --data-dir "$TMPDIR/data" &
# ... curl checks
```

Populated endpoints → binary is genuinely self-contained. Empty → packaging
bug exists even if dev builds "work".

## Follow-up tickets

- **API convention lint** — `aionui-api-types/src/*` public structs with
  `Serialize`/`Deserialize` derive should assert `rename_all = "camelCase"`
  (or explicit opt-out). ~50-line test in `aionui-api-types/tests/`. Filed in
  `coordinator-builtin-skill-migration-2026-04-23.md §Followups`.
