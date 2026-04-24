# Team Operations Playbook

Practical lessons for running team-mode migrations in this codebase.
Append new lessons as they happen; newest on top.

## 2026-04-23 — Zombie teammate detection and replacement

**Symptom:** Teammate sends idle notification then goes silent. Messages sent
by coordinator land in inbox with `read=True` but no TaskUpdate, no git
changes, no follow-up messages. Idle notifications may stop entirely.

**Diagnosis threshold:** 10 minutes of zero activity after a message was
marked read. Do not wait longer.

**Immediate replacement protocol (< 30 seconds):**

1. Edit `~/.claude/teams/{team}/config.json` — remove the dead member from
   the `members` array. Use `python3 -c` with json.load/dump for safety.
2. `rm ~/.claude/teams/{team}/inboxes/{name}.json` — clear stale messages.
3. Re-spawn via Agent tool with the same name + a SHORT prompt.
4. Do NOT SendMessage a shutdown_request first — dead agents don't respond,
   it just wastes minutes.

**Spawn prompt discipline (to avoid repeat zombies):**
- One task per spawn. Do not combine "fix clippy + start T1b" — that was a
  trigger in this incident.
- Include "If stuck 5+ minutes, SendMessage team-lead immediately" as an
  explicit pulse rule.
- **Mandatory progress reporting every ~10 min**, even during
  investigation. Silence is not acceptable. Wording in the prompt:
  "SendMessage team-lead a progress update every 10 minutes until you
  push — even if you're still reading code. Say what you've read, your
  current hypothesis, and the next thing you'll check."
- Keep prompt under ~40 lines. Let the agent `TaskGet` + read plan file for
  full detail rather than duplicating in the prompt.

## 2026-04-23 — Coordinator message backlog incident

**Symptom:** Coordinator lost visibility for ~1 hour. T1b and T4 both
completed successfully during this window but coordinator failed to
acknowledge, unblock downstream tasks (T2), or react to backend-dev's
important proactive finding (cargo install vs symlink workflow conflict).

**Root cause:** Coordinator assumed "no message in my inbox since last
scan" meant "nothing happened." Teammate completion messages had
already been delivered, so subsequent idle-notification noise masked
real completions. Between user prompts, no proactive scan of inbox,
`TaskList`, or git.

**Fix (applies to coordinator behavior from now on):**

1. **Every time coordinator is addressed by the user, run a full scan
   before responding** — `TaskList`, `git log -3` on both repos, and
   read the last 10 entries of `team-lead.json` inbox. This is cheap
   and catches drift.
2. **Never assume "no new message" equals "no change"** — teammates
   publish via git commits and TaskUpdate, not just inbox messages.
3. **Every teammate completion message must be confirmed within one
   user turn** — even if just an ACK. If the coordinator cannot
   respond immediately (long work in progress), SendMessage
   acknowledging the completion so the teammate knows it was seen.
4. **Spot check every 10 min when actively waiting** — coordinator must
   proactively run TaskList + inbox tail + git status on both repos at
   this cadence without needing a user prompt. User prompts "status?"
   also force a fresh scan; coordinator must never push back.

## 2026-04-23 — Zombie replacement is autonomous

When a teammate meets the zombie diagnosis threshold (playbook top),
coordinator replaces them **without asking the user for confirmation**.
The replacement protocol (delete from config.json, rm inbox, spawn
fresh) is deterministic and safe — asking for approval each time just
slows recovery. User can always override after the fact.

**This extends to adjacent diagnostic questions.** Do not ask the user
"was that rebase you?", "did you change X?", or similar. Figure it out
from git/fs state directly. If the new agent spawn needs resilience
against unknown state (e.g. remote history was rewritten), just bake
`git fetch && git reset --hard origin/<branch>` into the replacement
prompt — the new agent self-heals without coordinator needing to know
the root cause. Asking the user interrupts their flow; it is exactly
the behavior the "autonomous" rule was meant to eliminate.

## General principles

- **Silence ≠ unresponsive only for long Bash tasks** — cargo build can be
  10-20 minutes (lesson from Skill-Library pilot). But silence with NO git
  changes and NO new messages for 10+ minutes is dead, not busy.
- **Diagnose before messaging** — `TaskList()` + `git status` + inbox read
  state before sending another message. Multiple "please execute" messages
  to a dead agent compound confusion without effect.

## 2026-04-23 — Migration work needs real-user-data dry-run

**Lesson:** The plan's test matrix (frontend unit, backend integration, E2E)
all passed green but two user-impacting bugs only surfaced when the user
tested against their own production `aionui-config.txt`:

- **Bug A**: migration silently fails for 11 custom assistants (root cause
  TBD pending Electron main-process logs)
- **Bug B**: 9 built-ins the user had disabled lost their `enabled=false`
  state because spec never required migrating per-builtin overrides

**Why tests missed it:**

- **Frontend unit** (T4) mocks `ipcBridge.assistants.import.invoke` so the
  test never touches a real backend. It validates "the hook calls import
  with the right shape" not "real user data survives the round-trip."
- **Backend integration** (T2) validates each HTTP endpoint in isolation. It
  doesn't exercise the frontend-to-backend coupling under production-like
  input.
- **E2E** (T5) uses clean fixture files designed by the plan author
  (e.g. "seed 3 user + 2 builtin rows"). Real users have 33-row files with
  historical field quirks, legacy flags, emoji avatars, etc. The fixture
  designer can't predict the shape of "broken input from v1.9.17."

**Fix going forward (add to every migration-class plan from now on):**

1. **spec-level:** enumerate every legacy state that could carry user
   intent (not just "user data" — *per-item state that user set
   intentionally*, like `enabled=false` on built-ins, sort_order, last_used_at
   per-item). For each, decide: preserve, drop explicitly, or document.
2. **plan-level:** Add a Task that requires a **real legacy file dry-run**
   before T5 E2E. Pipeline:
   - Take one real user's `aionui-config.txt` (anonymize if needed)
   - Apply migration in a sandboxed Electron
   - Diff what was preserved vs what was dropped
   - Any unexplained drop = spec/code gap, fix before E2E
3. **test-level:** at least one Vitest + one Playwright scenario must
   consume a real-world fixture (copy of actual aionui-config.txt), not a
   hand-crafted minimal one.

**Action on current pilot:**
- H3 task created for Bug B
- Bug A pending main-process log diagnosis
- Mention this lesson in coordinator handoff (T6) with the explicit
  recommendation above.

## 2026-04-23 — `stat -f` on symlinks is a footgun

**Symptom:** e2e-tester during T3 rerun nearly reported the `~/.cargo/bin/aionui-backend` as stale because `stat -f "%Sm"` returned the symlink's own mtime (Apr 23 18:41), not the target binary mtime (Apr 24 03:11).

**Fix (runbook-level):** When checking whether a symlink's target is fresh, use one of:
- `stat -Lf "%Sm" <symlink>` — `-L` follows links
- `ls -laL <symlink>` — same
- `readlink <symlink>` + `stat` on the result

Cited in `cmd` / runbook docs going forward. Not a playbook-for-coordinators issue per se, but a runbook hygiene item.

## 2026-04-23 — API schema conventions need lints, not reviews

**Symptom:** T3 E2E found 3 of 8 scenarios failing because `aionui-api-types/src/skill.rs` had 19 of 22 public structs without `#[serde(rename_all = "camelCase")]`. Spec §6 and AGENTS.md API conventions both require camelCase on the wire. Code review of the T1 PR (would have) missed this because the 19 structs were pre-existing at T1 start, just never explicitly audited.

**Fix (process-level):** Project should gain a small test/lint that iterates every public struct in `aionui-api-types/src/*` with `Serialize` or `Deserialize` derive and asserts the `rename_all = "camelCase"` attribute is present (or the struct is explicitly opted out). A 50-line test in `aionui-api-types/tests/` would have caught this class before T3.

**Follow-up ticket filed** in coordinator-builtin-skill-migration-2026-04-23.md §Followups.

## 2026-04-23 — Packaging smoke as standalone acceptance step

**Symptom (motivation):** When a pilot's entire motivation is "kill the binary + sibling assets/" assumption (builtin-skill pilot was, and so was assistant pilot's H2), verifying the fix actually requires running the binary *in a state where no sibling assets/ exist*. A dev-machine `cargo run` always has the sibling via `target/debug/assets/`; packaging via `bun run build` is expensive (~15 min for Electron).

**Fix:** A mid-fidelity smoke that takes 2 minutes:
```bash
cargo build --release
TMPDIR=$(mktemp -d)
cp target/release/aionui-backend "$TMPDIR/"
# Note: no `assets/` copied
"$TMPDIR/aionui-backend" --local --port 25905 --data-dir "$TMPDIR/data" &
# ... curl checks
```
If the endpoints return populated data, the binary is genuinely self-contained.
If not, packaging bug exists even if dev builds "work."

Run this as part of T4 coordinator closure for any pilot touching asset delivery.

## 2026-04-24 — Migration checklist must include "delete stale frontend source"

**Symptom:** User spotted that `src/process/resources/assistant/` was still 1 MB in the tree, even though its contents had been moved to backend `assets/builtin-assistants/` during the assistant-user-data pilot. The frontend-dev of that pilot implemented the delete of TypeScript files (`assistantPresets.ts`) but missed the resource directory because the plan didn't enumerate it.

**Root cause:** The assistant pilot's T3a step list focused on `.ts` files and didn't explicitly include "delete the resource directory." Zero code references (grep clean), but the directory kept its last-modified date and stayed 1 MB of dead weight.

**Fix going forward:** Every migration-class plan must include an explicit "delete the migrated resource directory" step in the frontend refactor task, AND a DoD verification: `find src/process/resources -type d` post-migration returns only currently-active directories. The builtin-skill pilot did this correctly (step 2.2: `git rm -r src/process/resources/skills`) because the lesson had been learned once.

**Action:** Cleaned up at commit `e409eb6a7` on `feat/backend-migration-coordinator` (93 files / 12,750 lines removed). Next pilot: add this as an explicit T2 checklist item.

## 2026-04-24 — Wire-format fix direction needs an oracle

**Symptom:** During builtin-skill pilot T3 run-1, the frontend sent camelCase bodies and the backend rejected them (400). I mis-diagnosed the fix as "make backend accept camelCase" and landed H1 (`04f1537`), which added 21 `#[serde(rename_all = "camelCase")]` to `skill.rs`. H1 passed its tests and T3 run-2 went green against a now-camelCase contract. Subsequent main→builtin-skills merge (`10cd7b0`) brought in `dae96f8`'s *"refactor: remove camelCase serde rename from all aionui-api-types structs"* without reverting H1, leaving a camelCase island inside a snake_case project. Frontend's own merge from `feat/backend-migration` flipped most fields to snake_case but kept camelCase on pilot-new fields. Net: broken end-to-end contract that user spotted via probe.

**Root cause:** I didn't check the project-wide convention before choosing the fix direction.

**Fix (process-level):** Any wire-format question — "which side adapts?" — must first run:

```bash
git log --oneline -- crates/aionui-api-types/
```

If there's a recent blanket refactor like `dae96f8`, its decision is the oracle. The other side adapts.

If there isn't, the question becomes "what does AGENTS.md say about API conventions?" (check §API Conventions). If still unclear, the question is a design decision to be brainstormed with the user, not hot-patched.

**Under no circumstance should a hotfix choose a direction by looking only at "what makes the failing test pass right now."** That's exactly how I picked camelCase in H1 — it was the shortest diff that turned T3 green.

## 2026-04-24 — Teammate "task completed" requires verified push

**Symptom:** e2e-tester on T3 reported "8/8 green, Task #4 completed, T4 unblocked" while its test-file flips + report update were only in the working tree. Local HEAD unchanged, origin unchanged. Coordinator (me) had marked T4 ready and was about to run merge, which would have pulled an empty diff.

**Root cause:** Teammate's mental model treated "tests pass" as completion. Git step was forgotten.

**Fix (rule for coordinators):** When a teammate reports "task complete", coordinator verifies by:

```bash
cd <repo>
git fetch origin <branch>
git log origin/<branch> --oneline -3   # should include teammate's new commit
```

Do NOT accept "completed" claim without this check. If teammate's SHA is missing, reopen the task (TaskUpdate in_progress) and send a precise instruction to commit + push. Frame it explicitly as "NOT a replay" because teammates sometimes misinterpret re-assignment-looking messages.

**Fix (rule for spawn prompts):** Every spawn prompt for a teammate whose deliverable is git-tracked must include: "'Task complete' means commit + push succeeded AND upstream sync verified, not just tests pass. Run `git log origin/<branch> --oneline -1` before claiming completion and confirm your SHA is there." Add this once to the playbook's spawn-prompt-discipline section.
